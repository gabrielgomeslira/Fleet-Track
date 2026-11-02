export type EstadoFundo = 'carregando' | 'pronto' | 'falha' | 'desligado' | 'indisponivel'

/**
 * Constantes com valores do ADR-0016 / T-94 (números com * em constantes).
 */
export const TEMPO_VIGIA_MS = 15_000 // 15 s: vigia se !map.loaded()
export const ESPERAS_RETRY_PADRAO_MS = [30_000, 60_000, 120_000, 300_000] as const // 30s, 60s, 120s, 300s
export const ESPERA_RETRY_RATE_LIMIT_MS = 300_000 // 300 s (5 min) para 403 e 429
export const INTERVALO_RELEITURA_TILEJSON_MS = 24 * 60 * 60 * 1000 // 24 h

export type TimerHandle = ReturnType<typeof setTimeout>

/**
 * Interface do relógio injetado para temporização e controle determinístico em testes.
 */
export interface Relogio {
  agora(): number
  agendar(callback: () => void, delayMs: number): TimerHandle
  cancelar(id: TimerHandle): void
}

/**
 * Relógio padrão do sistema baseado em Date.now e setTimeout/clearTimeout.
 */
export const relogioPadrao: Relogio = {
  agora: () => Date.now(),
  agendar: (cb, ms) => setTimeout(cb, ms),
  cancelar: (id) => clearTimeout(id),
}

/**
 * Relógio simulado para testes automatizados determinísticos sem esperas reais de tempo.
 */
export interface RelogioSimulado extends Relogio {
  avancar(ms: number): void
  quantidadeTimersAtivos(): number
}

export function criarRelogioSimulado(tempoInicial = 0): RelogioSimulado {
  let tempoAtual = tempoInicial
  let proximoId = 1
  let timers: { id: number; callback: () => void; disparaEm: number }[] = []

  return {
    agora: () => tempoAtual,
    agendar: (cb, delayMs) => {
      const id = proximoId++
      timers.push({ id, callback: cb, disparaEm: tempoAtual + Math.max(0, delayMs) })
      return id
    },
    cancelar: (id) => {
      timers = timers.filter((t) => t.id !== id)
    },
    avancar: (ms) => {
      tempoAtual += ms
      while (true) {
        timers.sort((a, b) => a.disparaEm - b.disparaEm)
        const proximo = timers[0]
        if (!proximo || proximo.disparaEm > tempoAtual) break
        timers.shift()
        proximo.callback()
      }
    },
    quantidadeTimersAtivos: () => timers.length,
  }
}

/**
 * Extrai o código de status HTTP a partir de um evento de erro do MapLibre GL.
 */
export function extrairStatusErro(evento: unknown): number | undefined {
  if (!evento || typeof evento !== 'object') return undefined

  const ev = evento as {
    status?: unknown
    error?: unknown
    message?: unknown
  }

  if (typeof ev.status === 'number') return ev.status

  if (ev.error && typeof ev.error === 'object') {
    const errObj = ev.error as { status?: unknown; statusCode?: unknown; message?: unknown }
    if (typeof errObj.status === 'number') return errObj.status
    if (typeof errObj.statusCode === 'number') return errObj.statusCode
    if (typeof errObj.message === 'string') {
      const match = errObj.message.match(/\b(400|401|403|404|429|500|502|503|504)\b/)
      if (match) return parseInt(match[1], 10)
    }
  }

  const msg = typeof ev.message === 'string' ? ev.message : typeof ev.error === 'string' ? ev.error : ''
  if (msg) {
    const match = msg.match(/\b(400|401|403|404|429|500|502|503|504)\b/)
    if (match) return parseInt(match[1], 10)
  }

  return undefined
}

export interface MaquinaEstadoFundoOpcoes {
  desligado?: boolean
  relogio?: Relogio
  isMapLoaded?: () => boolean
  isAbaVisivel?: () => boolean
  onEstadoChange?: (estado: EstadoFundo) => void
  onExecutarRetry?: () => void
  onReleituraTileJson?: () => void
}

/**
 * Máquina de estados pura para controle do fundo cartográfico (ADR-0016 / T-94).
 *
 * Estados:
 * - 'carregando': inicial enquanto tiles/estilo carregam.
 * - 'pronto': mapa carregado e saudável.
 * - 'falha': erro no provedor de tiles ou timeout de vigia (15s).
 * - 'desligado': fundo desligado por configuração da instalação.
 */
export class MaquinaEstadoFundo {
  private estado: EstadoFundo
  private desligado: boolean
  private relogio: Relogio
  private isMapLoaded?: () => boolean
  private isAbaVisivel?: () => boolean
  private onEstadoChange?: (estado: EstadoFundo) => void
  private onExecutarRetry?: () => void
  private onReleituraTileJson?: () => void

  private indiceRetry = 0
  private isRateLimited = false
  private erroNoCicloAtual = false
  private tentandoNovamente = false

  private timerVigiaId: TimerHandle | null = null
  private timerRetryId: TimerHandle | null = null
  private timerReleituraId: TimerHandle | null = null

  private pausadoPorAbaOculta = false
  private tempoRestanteRetryMs = 0
  private momentoInicioRetryTimer = 0
  private tempoTotalRetryTimer = 0
  private releituraPendenteAbaOculta = false

  constructor(opcoes: MaquinaEstadoFundoOpcoes = {}) {
    this.desligado = Boolean(opcoes.desligado)
    this.relogio = opcoes.relogio || relogioPadrao
    this.isMapLoaded = opcoes.isMapLoaded
    this.isAbaVisivel = opcoes.isAbaVisivel
    this.onEstadoChange = opcoes.onEstadoChange
    this.onExecutarRetry = opcoes.onExecutarRetry
    this.onReleituraTileJson = opcoes.onReleituraTileJson

    this.estado = this.desligado ? 'desligado' : 'carregando'
  }

  public iniciar(): void {
    if (this.desligado) {
      this.transicionarPara('desligado')
      return
    }

    this.transicionarPara('carregando')
    this.iniciarVigia()
    this.agendarProximaReleituraTileJson()
  }

  public obterEstado(): EstadoFundo {
    return this.estado
  }

  public obterIndiceRetry(): number {
    return this.indiceRetry
  }

  public isPausado(): boolean {
    return this.pausadoPorAbaOculta
  }

  private transicionarPara(novoEstado: EstadoFundo): void {
    if (this.estado === novoEstado) return
    this.estado = novoEstado
    if (this.onEstadoChange) {
      this.onEstadoChange(novoEstado)
    }
  }

  private iniciarVigia(): void {
    this.cancelarVigia()
    this.timerVigiaId = this.relogio.agendar(() => {
      this.verificarVigia()
    }, TEMPO_VIGIA_MS)
  }

  private cancelarVigia(): void {
    if (this.timerVigiaId !== null) {
      this.relogio.cancelar(this.timerVigiaId)
      this.timerVigiaId = null
    }
  }

  /**
   * Vigia: !map.loaded() por 15 s* → aviso, mesmo sem evento nenhum.
   */
  public verificarVigia(): void {
    this.timerVigiaId = null
    if (this.desligado) return

    const carregado = this.isMapLoaded ? this.isMapLoaded() : false
    if (!carregado) {
      this.erroNoCicloAtual = true
      this.transicionarPara('falha')
      this.agendarRetry()
    }
  }

  /**
   * Notifica erro do MapLibre.
   * `error` com `sourceId: 'base'` ou HTTP status (403, 429, 503...) → aviso e nova tentativa.
   */
  public notificarErro(evento?: { sourceId?: string; status?: number; error?: unknown }): void {
    if (this.desligado) return

    const sourceId = evento?.sourceId
    const status = evento?.status ?? extrairStatusErro(evento)

    // Se o evento especifica sourceId e NÃO é a fonte base do mapa e nem status HTTP de provedor, ignora
    if (sourceId && sourceId !== 'base' && !status) {
      return
    }

    this.erroNoCicloAtual = true
    this.cancelarVigia()

    if (status === 403 || status === 429) {
      this.isRateLimited = true
    }

    this.transicionarPara('falha')

    // Se já há um timer de retry em contagem, apenas substitui se entramos em rate limit
    if (!this.timerRetryId && !this.pausadoPorAbaOculta) {
      this.agendarRetry()
    } else if (status === 403 || status === 429) {
      this.agendarRetry()
    }
  }

  public obterTempoEsperaRetry(): number {
    if (this.isRateLimited) {
      return ESPERA_RETRY_RATE_LIMIT_MS
    }
    const idx = Math.min(this.indiceRetry, ESPERAS_RETRY_PADRAO_MS.length - 1)
    return ESPERAS_RETRY_PADRAO_MS[idx]
  }

  private agendarRetry(): void {
    if (this.timerRetryId !== null) {
      this.relogio.cancelar(this.timerRetryId)
      this.timerRetryId = null
    }

    const tempoEspera = this.obterTempoEsperaRetry()
    this.tempoTotalRetryTimer = tempoEspera

    const visivel = this.isAbaVisivel ? this.isAbaVisivel() : true
    if (!visivel) {
      this.pausadoPorAbaOculta = true
      this.tempoRestanteRetryMs = tempoEspera
      return
    }

    this.pausadoPorAbaOculta = false
    this.tempoRestanteRetryMs = tempoEspera
    this.momentoInicioRetryTimer = this.relogio.agora()
    this.timerRetryId = this.relogio.agendar(() => {
      this.executarRetry()
    }, tempoEspera)
  }

  private executarRetry(): void {
    this.timerRetryId = null
    this.tentandoNovamente = true
    this.erroNoCicloAtual = false
    this.indiceRetry++

    // Inicia vigia de 15s para a nova tentativa caso a rede congele sem resposta
    this.iniciarVigia()

    if (this.onExecutarRetry) {
      this.onExecutarRetry()
    }
  }

  /**
   * O botão tenta na hora (dispara nova tentativa imediatamente).
   */
  public tentarNovamenteAgora(): void {
    if (this.desligado) return

    if (this.timerRetryId !== null) {
      this.relogio.cancelar(this.timerRetryId)
      this.timerRetryId = null
    }

    this.pausadoPorAbaOculta = false
    this.tempoRestanteRetryMs = 0
    this.executarRetry()
  }

  /**
   * O aviso some no primeiro idle sem erro novo do fundo.
   */
  public notificarIdle(): void {
    if (this.desligado) return

    if (this.estado === 'carregando') {
      if (!this.erroNoCicloAtual) {
        this.cancelarVigia()
        this.transicionarPara('pronto')
      }
      return
    }

    if (this.estado === 'falha') {
      if (!this.erroNoCicloAtual && this.tentandoNovamente) {
        this.cancelarVigia()
        if (this.timerRetryId !== null) {
          this.relogio.cancelar(this.timerRetryId)
          this.timerRetryId = null
        }
        this.tentandoNovamente = false
        this.indiceRetry = 0
        this.isRateLimited = false
        this.transicionarPara('pronto')
        this.agendarProximaReleituraTileJson()
      }
    }
  }

  /**
   * Trata alternância de visibilidade da aba do navegador.
   * Pausa com a aba oculta. Reler o TileJSON a cada 24 h com a aba visível.
   */
  public notificarMudancaVisibilidade(visivel: boolean): void {
    if (this.desligado) return

    if (!visivel) {
      if (this.timerRetryId !== null) {
        const decorrido = this.relogio.agora() - this.momentoInicioRetryTimer
        this.tempoRestanteRetryMs = Math.max(0, this.tempoTotalRetryTimer - decorrido)
        this.relogio.cancelar(this.timerRetryId)
        this.timerRetryId = null
        this.pausadoPorAbaOculta = true
      }
    } else {
      if (this.releituraPendenteAbaOculta) {
        this.releituraPendenteAbaOculta = false
        this.executarReleituraTileJson()
      }

      if (this.pausadoPorAbaOculta) {
        this.pausadoPorAbaOculta = false
        if (this.tempoRestanteRetryMs <= 0) {
          this.executarRetry()
        } else {
          this.momentoInicioRetryTimer = this.relogio.agora()
          this.tempoTotalRetryTimer = this.tempoRestanteRetryMs
          this.timerRetryId = this.relogio.agendar(() => {
            this.executarRetry()
          }, this.tempoRestanteRetryMs)
        }
      }
    }
  }

  private agendarProximaReleituraTileJson(): void {
    if (this.timerReleituraId !== null) {
      this.relogio.cancelar(this.timerReleituraId)
      this.timerReleituraId = null
    }

    this.timerReleituraId = this.relogio.agendar(() => {
      const visivel = this.isAbaVisivel ? this.isAbaVisivel() : true
      if (visivel) {
        this.executarReleituraTileJson()
      } else {
        this.releituraPendenteAbaOculta = true
      }
    }, INTERVALO_RELEITURA_TILEJSON_MS)
  }

  private executarReleituraTileJson(): void {
    if (this.desligado) return
    if (this.onReleituraTileJson) {
      this.onReleituraTileJson()
    }
    this.agendarProximaReleituraTileJson()
  }

  public destruir(): void {
    this.cancelarVigia()
    if (this.timerRetryId !== null) {
      this.relogio.cancelar(this.timerRetryId)
      this.timerRetryId = null
    }
    if (this.timerReleituraId !== null) {
      this.relogio.cancelar(this.timerReleituraId)
      this.timerReleituraId = null
    }
  }
}
