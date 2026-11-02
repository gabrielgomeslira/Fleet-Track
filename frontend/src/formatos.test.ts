import { describe, it, expect, afterEach } from 'vitest'
import {
  SEM_DADO,
  formatarInstante,
  formatarHora,
  formatarDia,
  formatarEntregueEm,
  formatarPercentual,
  formatarVelocidade,
} from './formatos'

declare const process: {
  env: Record<string, string | undefined>
}

function definirFuso(tz?: string) {
  if (tz === undefined) {
    delete process.env.TZ
  } else {
    process.env.TZ = tz
  }
}

function obterFuso(): string | undefined {
  return process.env.TZ
}

describe('Formatadores no fuso local e internacionalização (T-101 / H-28)', () => {
  const originalTz = obterFuso()

  afterEach(() => {
    definirFuso(originalTz)
  })

  describe('Aceite H-28: Nenhum UTC nem Z aparente', () => {
    const instantIso = '2026-11-01T15:30:45.000Z'

    it('formatarInstante não exibe "UTC" nem "Z"', () => {
      const resultado = formatarInstante(instantIso)
      expect(resultado).not.toContain('UTC')
      expect(resultado).not.toContain('Z')
      expect(resultado).toMatch(/\d{2}\/\d{2}\/\d{4}/)
    })

    it('formatarHora não exibe "UTC" nem "Z"', () => {
      const resultado = formatarHora(instantIso)
      expect(resultado).not.toContain('UTC')
      expect(resultado).not.toContain('Z')
      expect(resultado).toMatch(/\d{2}:\d{2}/)
    })

    it('formatarDia não exibe "UTC" nem "Z"', () => {
      const resultado = formatarDia(instantIso)
      expect(resultado).not.toContain('UTC')
      expect(resultado).not.toContain('Z')
      expect(resultado).toMatch(/\d{2}\/\d{2}\/\d{4}/)
    })
  })

  describe('Dois fusos mostram o mesmo instante, cada um no seu', () => {
    // 2026-11-01 15:30:45 UTC
    // Em America/Sao_Paulo (UTC-3): 2026-11-01 12:30:45
    // Em Asia/Tokyo (UTC+9): 2026-11-02 00:30:45
    const instantUtc = '2026-11-01T15:30:45Z'

    it('exibe horários corretos em America/Sao_Paulo (UTC-3)', () => {
      definirFuso('America/Sao_Paulo')
      expect(formatarHora(instantUtc)).toBe('12:30:45')
      expect(formatarHora(instantUtc, { hour: '2-digit', minute: '2-digit' })).toBe('12:30')
      expect(formatarDia(instantUtc)).toBe('01/11/2026')
      expect(formatarInstante(instantUtc)).toMatch(/01\/11\/2026.*12:30:45/)
    })

    it('exibe horários corretos em Asia/Tokyo (UTC+9)', () => {
      definirFuso('Asia/Tokyo')
      expect(formatarHora(instantUtc)).toBe('00:30:45')
      expect(formatarHora(instantUtc, { hour: '2-digit', minute: '2-digit' })).toBe('00:30')
      expect(formatarDia(instantUtc)).toBe('02/11/2026')
      expect(formatarInstante(instantUtc)).toMatch(/02\/11\/2026.*00:30:45/)
    })

    it('suporta especificar o fuso via parâmetro de opções (timeZone)', () => {
      const emSp = formatarHora(instantUtc, { timeZone: 'America/Sao_Paulo' })
      const emTokyo = formatarHora(instantUtc, { timeZone: 'Asia/Tokyo' })

      expect(emSp).toBe('12:30:45')
      expect(emTokyo).toBe('00:30:45')
      expect(emSp).not.toBe(emTokyo)

      const diaSp = formatarDia(instantUtc, { timeZone: 'America/Sao_Paulo' })
      const diaTokyo = formatarDia(instantUtc, { timeZone: 'Asia/Tokyo' })

      expect(diaSp).toBe('01/11/2026')
      expect(diaTokyo).toBe('02/11/2026')
    })
  })

  describe('Dia puro sem new Date: não recua um dia no Brasil', () => {
    it('formata dia puro yyyy-MM-dd como dd/MM/yyyy em qualquer fuso', () => {
      definirFuso('America/Sao_Paulo')
      expect(formatarDia('2026-11-01')).toBe('01/11/2026')

      definirFuso('Asia/Tokyo')
      expect(formatarDia('2026-11-01')).toBe('01/11/2026')
    })

    it('compara com o bug clássico de new Date no Brasil', () => {
      definirFuso('America/Sao_Paulo')
      // new Date('2026-11-01') é interpretado como UTC meia-noite -> no Brasil vira 31/10 21:00
      const dataComBug = new Date('2026-11-01').toLocaleDateString('pt-BR')
      expect(dataComBug).toBe('31/10/2026') // comprova o bug clássico

      // formatarDia lê por partes e NÃO recua:
      expect(formatarDia('2026-11-01')).toBe('01/11/2026')
    })

    it('suporta formato dia/mês ({ day: "2-digit", month: "2-digit" }) para gráficos', () => {
      definirFuso('America/Sao_Paulo')
      expect(formatarDia('2026-11-01', { day: '2-digit', month: '2-digit' })).toBe('01/11')
      expect(formatarDia('2026-05-15', { day: '2-digit', month: '2-digit' })).toBe('15/05')
    })
  })

  describe('Tratamento de inválidos e ausentes: nunca 1970 nem Invalid Date', () => {
    const invalidos = [null, undefined, '', '   ', 'invalido', '2026-99-99', 0, '1970-01-01']

    it.each(invalidos)('formatarInstante("%s") retorna "sem dado"', (val) => {
      const res = formatarInstante(val as unknown as string)
      expect(res).toBe(SEM_DADO)
      expect(res).not.toContain('1970')
      expect(res).not.toContain('1969')
      expect(res).not.toContain('Invalid Date')
    })

    it.each(invalidos)('formatarHora("%s") retorna "sem dado"', (val) => {
      const res = formatarHora(val as unknown as string)
      expect(res).toBe(SEM_DADO)
      expect(res).not.toContain('1970')
      expect(res).not.toContain('1969')
      expect(res).not.toContain('Invalid Date')
    })

    it.each(invalidos)('formatarDia("%s") retorna "sem dado"', (val) => {
      const res = formatarDia(val as unknown as string)
      expect(res).toBe(SEM_DADO)
      expect(res).not.toContain('1970')
      expect(res).not.toContain('1969')
      expect(res).not.toContain('Invalid Date')
    })

    it('rejeita datas inexistentes no mês (ex: 31 de fevereiro)', () => {
      expect(formatarDia('2026-02-31')).toBe(SEM_DADO)
      expect(formatarDia('2026-04-31')).toBe(SEM_DADO)
    })
  })

  describe('formatarPercentual: combustível em inteiro nas telas (T-97)', () => {
    it('formata números decimais arredondando para inteiro', () => {
      expect(formatarPercentual(75)).toBe('75%')
      expect(formatarPercentual(74.6)).toBe('75%')
      expect(formatarPercentual(74.4)).toBe('74%')
      expect(formatarPercentual(35.2)).toBe('35%')
      expect(formatarPercentual(100)).toBe('100%')
      expect(formatarPercentual(0)).toBe('0%')
    })

    it('converte string numérica para percentual inteiro', () => {
      expect(formatarPercentual('82.7')).toBe('83%')
      expect(formatarPercentual('10')).toBe('10%')
    })

    it('retorna "sem dado" para nulo, indefinido, vazio ou não-numérico', () => {
      expect(formatarPercentual(null)).toBe(SEM_DADO)
      expect(formatarPercentual(undefined)).toBe(SEM_DADO)
      expect(formatarPercentual('')).toBe(SEM_DADO)
      expect(formatarPercentual('abc')).toBe(SEM_DADO)
      expect(formatarPercentual(NaN)).toBe(SEM_DADO)
      expect(formatarPercentual(Infinity)).toBe(SEM_DADO)
    })
  })

  describe('formatarEntregueEm: formatação da coluna "Entregue em" de Entregas', () => {
    it('formata a data quando deliveredAt for uma data válida', () => {
      definirFuso('America/Sao_Paulo')
      expect(formatarEntregueEm('2026-11-01T15:30:00Z', 'entregue')).toBe('01/11/2026')
      expect(formatarEntregueEm('2026-10-25T10:00:00Z', 'em_transito')).toBe('25/10/2026')
      expect(formatarEntregueEm('2026-05-12', 'entregue')).toBe('12/05/2026')
    })

    it('retorna "—" para entregas abertas (em_transito ou pendente) sem data de entrega', () => {
      expect(formatarEntregueEm(null, 'em_transito')).toBe('—')
      expect(formatarEntregueEm(undefined, 'em_transito')).toBe('—')
      expect(formatarEntregueEm('', 'em_transito')).toBe('—')

      expect(formatarEntregueEm(null, 'pendente')).toBe('—')
      expect(formatarEntregueEm(undefined, 'pendente')).toBe('—')
      expect(formatarEntregueEm('', 'pendente')).toBe('—')
    })

    it('retorna "—" para entregas canceladas sem data de entrega', () => {
      expect(formatarEntregueEm(null, 'cancelado')).toBe('—')
      expect(formatarEntregueEm(undefined, 'cancelado')).toBe('—')
      expect(formatarEntregueEm('', 'cancelado')).toBe('—')
      expect(formatarEntregueEm(null, 'cancelada')).toBe('—')
    })

    it('retorna "sem dado" para entrega com status entregue mas com data ausente (falta real de dado)', () => {
      expect(formatarEntregueEm(null, 'entregue')).toBe(SEM_DADO)
      expect(formatarEntregueEm(undefined, 'entregue')).toBe(SEM_DADO)
      expect(formatarEntregueEm('', 'entregue')).toBe(SEM_DADO)
      expect(formatarEntregueEm('invalido', 'entregue')).toBe(SEM_DADO)
    })

    it('retorna "sem dado" para outros status desconhecidos sem data de entrega', () => {
      expect(formatarEntregueEm(null, 'desconhecido')).toBe(SEM_DADO)
      expect(formatarEntregueEm(null, null)).toBe(SEM_DADO)
      expect(formatarEntregueEm(null, '')).toBe(SEM_DADO)
    })
  })

  describe('formatarVelocidade: formatação de velocidade com unidade km/h ou sem dado', () => {
    it('formata valor numérico inteiro com "km/h"', () => {
      expect(formatarVelocidade(70)).toBe('70 km/h')
      expect(formatarVelocidade(0)).toBe('0 km/h')
      expect(formatarVelocidade(120)).toBe('120 km/h')
    })

    it('arredonda valores decimais para o inteiro mais próximo', () => {
      expect(formatarVelocidade(68.4)).toBe('68 km/h')
      expect(formatarVelocidade(68.6)).toBe('69 km/h')
      expect(formatarVelocidade(72.5)).toBe('73 km/h')
    })

    it('aceita strings numéricas válidas', () => {
      expect(formatarVelocidade('80')).toBe('80 km/h')
      expect(formatarVelocidade('0')).toBe('0 km/h')
    })

    it('retorna "sem dado" para nulo, indefinido, vazio ou não-finito', () => {
      expect(formatarVelocidade(null)).toBe(SEM_DADO)
      expect(formatarVelocidade(undefined)).toBe(SEM_DADO)
      expect(formatarVelocidade('')).toBe(SEM_DADO)
      expect(formatarVelocidade(NaN)).toBe(SEM_DADO)
      expect(formatarVelocidade(Infinity)).toBe(SEM_DADO)
      expect(formatarVelocidade('invalido')).toBe(SEM_DADO)
    })
  })
})
