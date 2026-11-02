export const SEM_DADO = 'sem dado'

/**
 * Valida e converte um valor para Date, rejeitando nulos, vazios, inválidos
 * e datas iguais ou anteriores ao ano de 1970 (evita bugs de época Unix).
 */
function obterDataValida(valor: unknown): Date | null {
  if (valor === null || valor === undefined || valor === '' || valor === 0) {
    return null
  }

  let date: Date
  if (valor instanceof Date) {
    date = valor
  } else if (typeof valor === 'string' || typeof valor === 'number') {
    if (typeof valor === 'string') {
      const trimmed = valor.trim()
      if (trimmed === '') {
        return null
      }
      // Rejeita dia puro (yyyy-MM-dd) sem horário para evitar recuo no fuso
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return null
      }
    }
    date = new Date(valor)
  } else {
    return null
  }

  const time = date.getTime()
  if (Number.isNaN(time) || time <= 0) {
    return null
  }

  // Garante que nunca retorne datas em 1970 ou anteriores
  if (date.getUTCFullYear() <= 1970) {
    return null
  }

  return date
}

/**
 * Formata um instante completo (data e hora) no fuso do navegador de quem vê
 * ou no fuso especificado nas opções.
 * Inválido ou ausente -> "sem dado".
 */
export function formatarInstante(
  valor?: string | number | Date | null,
  opcoes?: Intl.DateTimeFormatOptions,
): string {
  const date = obterDataValida(valor)
  if (!date) {
    return SEM_DADO
  }

  const opt: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    ...opcoes,
  }

  return new Intl.DateTimeFormat('pt-BR', opt).format(date)
}

/**
 * Formata o horário (hora:minuto ou hora:minuto:segundo) no fuso do navegador.
 * Inválido ou ausente -> "sem dado".
 */
export function formatarHora(
  valor?: string | number | Date | null,
  opcoes?: Intl.DateTimeFormatOptions,
): string {
  const date = obterDataValida(valor)
  if (!date) {
    return SEM_DADO
  }

  const opt: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    ...(opcoes?.second !== undefined || (!opcoes?.hour && !opcoes?.minute)
      ? { second: '2-digit' }
      : {}),
    ...opcoes,
  }

  return new Intl.DateTimeFormat('pt-BR', opt).format(date)
}

/**
 * Formata a data (dia). Dia puro (yyyy-MM-dd) é lido por partes, sem new Date,
 * para não recuar um dia no Brasil devido ao deslocamento UTC-3.
 * Inválido ou ausente -> "sem dado".
 */
export function formatarDia(
  valor?: string | number | Date | null,
  opcoes?: Intl.DateTimeFormatOptions,
): string {
  if (valor === null || valor === undefined || valor === '' || valor === 0) {
    return SEM_DADO
  }

  // Dia puro lido por partes (yyyy-MM-dd), sem new Date, para não recuar um dia no Brasil
  if (typeof valor === 'string') {
    const trimmed = valor.trim()
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (match) {
      const [, ano, mes, dia] = match
      const a = Number(ano)
      const m = Number(mes)
      const d = Number(dia)
      if (m < 1 || m > 12 || d < 1 || d > 31 || a <= 1970) {
        return SEM_DADO
      }

      // Validação do número de dias no mês
      const diasNoMes = new Date(Date.UTC(a, m, 0)).getUTCDate()
      if (d > diasNoMes) {
        return SEM_DADO
      }

      if (opcoes?.day && opcoes?.month && !opcoes?.year) {
        return `${dia}/${mes}`
      }
      return `${dia}/${mes}/${ano}`
    }
  }

  const date = obterDataValida(valor)
  if (!date) {
    return SEM_DADO
  }

  const opt: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    ...(opcoes?.year !== undefined || (!opcoes?.day && !opcoes?.month) ? { year: 'numeric' } : {}),
    ...opcoes,
  }

  return new Intl.DateTimeFormat('pt-BR', opt).format(date)
}

/**
 * Formata a data de conclusão de uma entrega para a coluna "Entregue em".
 *
 * Regras (ADR-0020 / Correções de Entregas):
 * - Se `deliveredAt` estiver presente e for data válida -> formata com formatarDia(deliveredAt, opcoes).
 * - Se a entrega for aberta ('pendente' ou 'em_transito') ou cancelada ('cancelado' ou 'cancelada')
 *   sem data de entrega -> '—' (em-dash), pois a entrega ainda não terminou ou não foi concluída.
 * - Se a entrega tiver status 'entregue' (concluída) mas a data de entrega estiver ausente/nula -> 'sem dado',
 *   pois aqui o dado realmente falta.
 * - Outros casos sem data válida -> 'sem dado'.
 */
export function formatarEntregueEm(
  deliveredAt?: string | number | Date | null,
  status?: string | null,
  opcoes?: Intl.DateTimeFormatOptions,
): string {
  const diaFormatado = formatarDia(deliveredAt, opcoes)
  if (diaFormatado !== SEM_DADO) {
    return diaFormatado
  }

  const s = status ? status.trim().toLowerCase() : ''
  if (s === 'pendente' || s === 'em_transito' || s === 'cancelado' || s === 'cancelada') {
    return '—'
  }

  return SEM_DADO
}

/**
 * Formata percentual com valor arredondado para inteiro (ex: 75%).
 * Inválido ou ausente -> "sem dado".
 */
export function formatarPercentual(valor?: number | string | null): string {
  if (valor === null || valor === undefined || valor === '') {
    return SEM_DADO
  }

  const num = typeof valor === 'number' ? valor : Number(valor)
  if (!Number.isFinite(num)) {
    return SEM_DADO
  }

  const inteiro = Math.round(num)
  return `${Object.is(inteiro, -0) ? 0 : inteiro}%`
}

/**
 * Formata velocidade com valor arredondado para inteiro (ex: 70 km/h).
 * Inválido ou ausente -> "sem dado".
 */
export function formatarVelocidade(valor?: number | string | null): string {
  if (valor === null || valor === undefined || valor === '') {
    return SEM_DADO
  }

  const num = typeof valor === 'number' ? valor : Number(valor)
  if (!Number.isFinite(num)) {
    return SEM_DADO
  }

  const inteiro = Math.round(num)
  return `${Object.is(inteiro, -0) ? 0 : inteiro} km/h`
}
