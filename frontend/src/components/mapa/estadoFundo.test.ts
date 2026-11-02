import { describe, it, expect, vi } from 'vitest'
import {
  MaquinaEstadoFundo,
  criarRelogioSimulado,
  TEMPO_VIGIA_MS,
  ESPERAS_RETRY_PADRAO_MS,
  ESPERA_RETRY_RATE_LIMIT_MS,
  INTERVALO_RELEITURA_TILEJSON_MS,
  extrairStatusErro,
} from './estadoFundo'

describe('Máquina de Estados do Fundo Cartográfico (T-94 / ADR-0016)', () => {
  describe('Inicialização e Fundo Desligado', () => {
    it('inicia no estado carregando e transiciona para pronto no primeiro idle sem erros', () => {
      const relogio = criarRelogioSimulado()
      const onEstadoChange = vi.fn()
      const maquina = new MaquinaEstadoFundo({
        relogio,
        onEstadoChange,
      })

      maquina.iniciar()
      expect(maquina.obterEstado()).toBe('carregando')

      maquina.notificarIdle()
      expect(maquina.obterEstado()).toBe('pronto')
      expect(onEstadoChange).toHaveBeenCalledWith('pronto')
      expect(relogio.quantidadeTimersAtivos()).toBe(1) // Apenas o timer de 24h
    })

    it('fundo desligado por configuração: inicia em desligado, sem timers e sem retry', () => {
      const relogio = criarRelogioSimulado()
      const onEstadoChange = vi.fn()
      const onExecutarRetry = vi.fn()
      const maquina = new MaquinaEstadoFundo({
        desligado: true,
        relogio,
        onEstadoChange,
        onExecutarRetry,
      })

      maquina.iniciar()
      expect(maquina.obterEstado()).toBe('desligado')
      expect(relogio.quantidadeTimersAtivos()).toBe(0)

      // Eventos de erro ou vigia não alteram o estado desligado
      maquina.notificarErro({ sourceId: 'base', status: 503 })
      maquina.verificarVigia()
      maquina.tentarNovamenteAgora()

      expect(maquina.obterEstado()).toBe('desligado')
      expect(onExecutarRetry).not.toHaveBeenCalled()
    })
  })

  describe('Vigia de Tempo (15 s sem carregamento)', () => {
    it('quando o mapa não carrega em 15 s, transiciona para falha mesmo sem nenhum evento', () => {
      const relogio = criarRelogioSimulado()
      const onEstadoChange = vi.fn()
      const onExecutarRetry = vi.fn()

      const maquina = new MaquinaEstadoFundo({
        relogio,
        isMapLoaded: () => false,
        onEstadoChange,
        onExecutarRetry,
      })

      maquina.iniciar()
      expect(maquina.obterEstado()).toBe('carregando')

      // Avança 14,9 s (ainda dentro do prazo de vigia)
      relogio.avancar(TEMPO_VIGIA_MS - 100)
      expect(maquina.obterEstado()).toBe('carregando')

      // Completa os 15 s
      relogio.avancar(100)
      expect(maquina.obterEstado()).toBe('falha')
      expect(onEstadoChange).toHaveBeenCalledWith('falha')

      // Após a falha, primeiro retry é agendado para 30 s
      relogio.avancar(ESPERAS_RETRY_PADRAO_MS[0])
      expect(onExecutarRetry).toHaveBeenCalledTimes(1)
    })

    it('cancela a vigia se o mapa disparar idle antes de 15 s', () => {
      const relogio = criarRelogioSimulado()
      const maquina = new MaquinaEstadoFundo({
        relogio,
        isMapLoaded: () => true,
      })

      maquina.iniciar()
      relogio.avancar(5000)
      maquina.notificarIdle()
      expect(maquina.obterEstado()).toBe('pronto')

      // Avança mais de 15 s, o vigia não deve disparar falha
      relogio.avancar(20000)
      expect(maquina.obterEstado()).toBe('pronto')
    })
  })

  describe('Falhas de Provedor e Escalonamento de Espera (Backoff)', () => {
    it('erro 503 na camada base: transiciona para falha e escalona 30s, 60s, 120s e 300s', () => {
      const relogio = criarRelogioSimulado()
      const onEstadoChange = vi.fn()
      const onExecutarRetry = vi.fn()

      const maquina = new MaquinaEstadoFundo({
        relogio,
        onEstadoChange,
        onExecutarRetry,
      })

      maquina.iniciar()
      maquina.notificarIdle() // Fundo pronto
      expect(maquina.obterEstado()).toBe('pronto')

      // 1ª Falha (ex: 503)
      maquina.notificarErro({ sourceId: 'base', status: 503 })
      expect(maquina.obterEstado()).toBe('falha')
      expect(maquina.obterTempoEsperaRetry()).toBe(ESPERAS_RETRY_PADRAO_MS[0]) // 30s

      // Avança 30s -> executa 1º retry
      relogio.avancar(30_000)
      expect(onExecutarRetry).toHaveBeenCalledTimes(1)

      // Se falhar novamente no retry
      maquina.notificarErro({ sourceId: 'base', status: 503 })
      expect(maquina.obterTempoEsperaRetry()).toBe(ESPERAS_RETRY_PADRAO_MS[1]) // 60s

      // Avança 60s -> executa 2º retry
      relogio.avancar(60_000)
      expect(onExecutarRetry).toHaveBeenCalledTimes(2)

      // Se falhar novamente
      maquina.notificarErro({ sourceId: 'base', status: 503 })
      expect(maquina.obterTempoEsperaRetry()).toBe(ESPERAS_RETRY_PADRAO_MS[2]) // 120s

      // Avança 120s -> executa 3º retry
      relogio.avancar(120_000)
      expect(onExecutarRetry).toHaveBeenCalledTimes(3)

      // Se falhar novamente
      maquina.notificarErro({ sourceId: 'base', status: 503 })
      expect(maquina.obterTempoEsperaRetry()).toBe(ESPERAS_RETRY_PADRAO_MS[3]) // 300s

      // Avança 300s -> executa 4º retry
      relogio.avancar(300_000)
      expect(onExecutarRetry).toHaveBeenCalledTimes(4)

      // Mantém teto de 300s nas tentativas subsequentes
      maquina.notificarErro({ sourceId: 'base', status: 503 })
      expect(maquina.obterTempoEsperaRetry()).toBe(ESPERAS_RETRY_PADRAO_MS[3])
    })

    it('erros 403 e 429 iniciam o escalonamento diretamente em 300 s', () => {
      const relogio = criarRelogioSimulado()
      const onExecutarRetry = vi.fn()

      const maquina403 = new MaquinaEstadoFundo({ relogio, onExecutarRetry })
      maquina403.iniciar()
      maquina403.notificarErro({ sourceId: 'base', status: 403 })
      expect(maquina403.obterTempoEsperaRetry()).toBe(ESPERA_RETRY_RATE_LIMIT_MS) // 300s

      const maquina429 = new MaquinaEstadoFundo({ relogio, onExecutarRetry })
      maquina429.iniciar()
      maquina429.notificarErro({ sourceId: 'base', status: 429 })
      expect(maquina429.obterTempoEsperaRetry()).toBe(ESPERA_RETRY_RATE_LIMIT_MS) // 300s

      // Avança 299s -> ainda não chamou
      relogio.avancar(299_000)
      expect(onExecutarRetry).not.toHaveBeenCalled()

      // Completa 300s -> executa retry
      relogio.avancar(1_000)
      expect(onExecutarRetry).toHaveBeenCalledTimes(2) // Uma para cada máquina
    })

    it('ignora erros que pertençam a outras camadas que não a base', () => {
      const relogio = criarRelogioSimulado()
      const maquina = new MaquinaEstadoFundo({ relogio })
      maquina.iniciar()
      maquina.notificarIdle()

      maquina.notificarErro({ sourceId: 'rotas_camada_customizada' })
      expect(maquina.obterEstado()).toBe('pronto')
    })
  })

  describe('Recuperação no primeiro idle sem novo erro', () => {
    it('recupera para pronto e zera contador de retries no primeiro idle bem-sucedido', () => {
      const relogio = criarRelogioSimulado()
      const onExecutarRetry = vi.fn()
      const maquina = new MaquinaEstadoFundo({ relogio, onExecutarRetry })

      maquina.iniciar()
      maquina.notificarErro({ sourceId: 'base', status: 503 })
      expect(maquina.obterEstado()).toBe('falha')

      // Executa retry após 30 s
      relogio.avancar(30_000)
      expect(onExecutarRetry).toHaveBeenCalledTimes(1)

      // Durante a nova tentativa, a rede responde e MapLibre fica idle sem novos erros
      maquina.notificarIdle()
      expect(maquina.obterEstado()).toBe('pronto')
      expect(maquina.obterIndiceRetry()).toBe(0)
    })

    it('permanece em falha se ocorrer outro erro durante a tentativa e só depois disparar idle', () => {
      const relogio = criarRelogioSimulado()
      const onExecutarRetry = vi.fn()
      const maquina = new MaquinaEstadoFundo({ relogio, onExecutarRetry })

      maquina.iniciar()
      maquina.notificarErro({ sourceId: 'base', status: 503 })

      // Executa retry após 30 s
      relogio.avancar(30_000)
      expect(onExecutarRetry).toHaveBeenCalledTimes(1)

      // Ocorreu novo erro durante o ciclo
      maquina.notificarErro({ sourceId: 'base', status: 503 })

      // Idle disparado com erro ativo no ciclo NÃO deve recuperar o estado
      maquina.notificarIdle()
      expect(maquina.obterEstado()).toBe('falha')
    })
  })

  describe('Tentativa Manual Imediata ("Tentar de novo")', () => {
    it('o botão tenta na hora, cancelando o timer pendente e executando o retry imediatamente', () => {
      const relogio = criarRelogioSimulado()
      const onExecutarRetry = vi.fn()
      const maquina = new MaquinaEstadoFundo({ relogio, onExecutarRetry })

      maquina.iniciar()
      maquina.notificarErro({ sourceId: 'base', status: 503 })
      expect(maquina.obterEstado()).toBe('falha')

      // Faltavam 25s para o timer normal disparar
      relogio.avancar(5_000)
      expect(onExecutarRetry).not.toHaveBeenCalled()

      // Usuário clica no botão "Tentar de novo"
      maquina.tentarNovamenteAgora()
      expect(onExecutarRetry).toHaveBeenCalledTimes(1)

      // O timer antigo que dispararia aos 30s foi cancelado
      relogio.avancar(25_000)
      expect(onExecutarRetry).toHaveBeenCalledTimes(1)
    })
  })

  describe('Pausa e Retomada com Aba Oculta (VisibilityChange)', () => {
    it('pausa a espera com a aba oculta e retoma com o tempo restante ao voltar a ficar visível', () => {
      const relogio = criarRelogioSimulado()
      const onExecutarRetry = vi.fn()
      let visivel = true

      const maquina = new MaquinaEstadoFundo({
        relogio,
        onExecutarRetry,
        isAbaVisivel: () => visivel,
      })

      maquina.iniciar()
      maquina.notificarErro({ sourceId: 'base', status: 503 }) // Espera 30 s

      // Passam 10 s (restam 20 s)
      relogio.avancar(10_000)
      expect(onExecutarRetry).not.toHaveBeenCalled()

      // Usuário troca de aba (aba fica oculta)
      visivel = false
      maquina.notificarMudancaVisibilidade(false)
      expect(maquina.isPausado()).toBe(true)

      // Passam 60 s com a aba oculta -> retry NÃO pode disparar
      relogio.avancar(60_000)
      expect(onExecutarRetry).not.toHaveBeenCalled()

      // Usuário volta para a aba (visível)
      visivel = true
      maquina.notificarMudancaVisibilidade(true)
      expect(maquina.isPausado()).toBe(false)
      expect(onExecutarRetry).not.toHaveBeenCalled()

      // Restavam 20 s -> avança 19 s
      relogio.avancar(19_000)
      expect(onExecutarRetry).not.toHaveBeenCalled()

      // Avança mais 1 s (totalizando os 20 s restantes)
      relogio.avancar(1_000)
      expect(onExecutarRetry).toHaveBeenCalledTimes(1)
    })

    it('se o tempo de espera expirar durante a ocultação, dispara o retry ao voltar a ficar visível', () => {
      const relogio = criarRelogioSimulado()
      const onExecutarRetry = vi.fn()
      let visivel = true

      const maquina = new MaquinaEstadoFundo({
        relogio,
        onExecutarRetry,
        isAbaVisivel: () => visivel,
      })

      maquina.iniciar()
      maquina.notificarErro({ sourceId: 'base', status: 503 })

      // Troca de aba após 30s exatos
      relogio.avancar(30_000)
      expect(onExecutarRetry).toHaveBeenCalledTimes(1)

      // Nova falha agenda 60s
      maquina.notificarErro({ sourceId: 'base', status: 503 })

      // Aba fica oculta imediatamente
      visivel = false
      maquina.notificarMudancaVisibilidade(false)

      // Passa tempo com aba oculta
      relogio.avancar(100_000)
      expect(onExecutarRetry).toHaveBeenCalledTimes(1)

      // Ao voltar, timer estava pausado com 60s
      visivel = true
      maquina.notificarMudancaVisibilidade(true)
      relogio.avancar(60_000)
      expect(onExecutarRetry).toHaveBeenCalledTimes(2)
    })
  })

  describe('Releitura do TileJSON a cada 24 h', () => {
    it('dispara releitura a cada 24 h com a aba visível', () => {
      const relogio = criarRelogioSimulado()
      const onReleituraTileJson = vi.fn()

      const maquina = new MaquinaEstadoFundo({
        relogio,
        onReleituraTileJson,
        isAbaVisivel: () => true,
      })

      maquina.iniciar()
      maquina.notificarIdle()

      // 23h59m
      relogio.avancar(INTERVALO_RELEITURA_TILEJSON_MS - 60_000)
      expect(onReleituraTileJson).not.toHaveBeenCalled()

      // Completa 24h
      relogio.avancar(60_000)
      expect(onReleituraTileJson).toHaveBeenCalledTimes(1)

      // Completa mais 24h (total 48h)
      relogio.avancar(INTERVALO_RELEITURA_TILEJSON_MS)
      expect(onReleituraTileJson).toHaveBeenCalledTimes(2)
    })

    it('se as 24 h completarem com a aba oculta, executa a releitura assim que a aba se tornar visível', () => {
      const relogio = criarRelogioSimulado()
      const onReleituraTileJson = vi.fn()
      let visivel = true

      const maquina = new MaquinaEstadoFundo({
        relogio,
        onReleituraTileJson,
        isAbaVisivel: () => visivel,
      })

      maquina.iniciar()
      maquina.notificarIdle()

      // Oculta aba após 20h
      relogio.avancar(20 * 60 * 60 * 1000)
      visivel = false
      maquina.notificarMudancaVisibilidade(false)

      // Passam mais 5h (total 25h > 24h) com aba oculta
      relogio.avancar(5 * 60 * 60 * 1000)
      expect(onReleituraTileJson).not.toHaveBeenCalled()

      // Volta a ficar visível -> executa a releitura pendente
      visivel = true
      maquina.notificarMudancaVisibilidade(true)
      expect(onReleituraTileJson).toHaveBeenCalledTimes(1)
    })
  })

  describe('Utilitário de Extração de Status de Erro', () => {
    it('extrai corretamente números e strings de erro de rede', () => {
      expect(extrairStatusErro({ status: 503 })).toBe(503)
      expect(extrairStatusErro({ error: { status: 403 } })).toBe(403)
      expect(extrairStatusErro({ error: { statusCode: 429 } })).toBe(429)
      expect(extrairStatusErro({ error: { message: 'AJAXError: Too Many Requests (429)' } })).toBe(
        429,
      )
      expect(extrairStatusErro({ error: 'Erro de conexão 504 Gateway Timeout' })).toBe(504)
      expect(extrairStatusErro({ error: new Error('Internal Server Error 500') })).toBe(500)
      expect(extrairStatusErro(null)).toBeUndefined()
      expect(extrairStatusErro({})).toBeUndefined()
    })
  })
})
