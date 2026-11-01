export interface MapaConfig {
  desligado: boolean
  tilejsonUrl: string
  glyphsUrl: string
  styleUrl: string
  credit: string
}

const CONFIG_DESLIGADO: MapaConfig = {
  desligado: true,
  tilejsonUrl: '',
  glyphsUrl: '',
  styleUrl: '',
  credit: '',
}

/**
 * Valida se uma string é uma URL segura que utiliza obrigatoriamente o protocolo HTTPS.
 */
export function isValidHttpsUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false
  const trimmed = url.trim()
  if (!trimmed.startsWith('https://')) return false
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Valida o padrão de URL de glifos contendo templates `{fontstack}` e `{range}`.
 */
export function isValidGlyphsUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false
  const trimmed = url.trim()
  if (!trimmed.startsWith('https://')) return false
  try {
    const testUrl = trimmed.replace(/\{fontstack\}/g, 'test').replace(/\{range\}/g, '0-255')
    const parsed = new URL(testUrl)
    return parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Valida e normaliza o conteúdo do arquivo /config/mapa.json.
 * Aplica falha fechada estrita:
 * - Se qualquer URL não for HTTPS -> fundo desligado.
 * - Se tilejsonUrl ou styleUrl estiverem ausentes/vazias -> fundo desligado.
 * - MAP_STYLE_URL definida substitui TileJSON e glifos.
 * - Nunca recorre a URLs externas de reserva no código.
 */
export function validarConfigMapa(data: unknown): MapaConfig {
  if (!data || typeof data !== 'object') {
    return { ...CONFIG_DESLIGADO }
  }

  const record = data as Record<string, unknown>
  const credit = typeof record.credit === 'string' ? record.credit.trim() : ''

  // 1. MAP_STYLE_URL: estilo completo definido por quem instala (substitui TileJSON e glifos)
  const rawStyleUrl = typeof record.styleUrl === 'string' ? record.styleUrl.trim() : ''
  if (rawStyleUrl !== '') {
    if (!isValidHttpsUrl(rawStyleUrl)) {
      // Falha fechada: styleUrl informada mas não é HTTPS
      return { ...CONFIG_DESLIGADO }
    }
    return {
      desligado: false,
      tilejsonUrl: '',
      glyphsUrl: '',
      styleUrl: rawStyleUrl,
      credit,
    }
  }

  // 2. TileJSON padrão: deve estar preenchido e ser HTTPS
  const rawTilejsonUrl = typeof record.tilejsonUrl === 'string' ? record.tilejsonUrl.trim() : ''
  if (rawTilejsonUrl === '') {
    // TileJSON vazia indica explicitamente fundo desligado
    return { ...CONFIG_DESLIGADO }
  }
  if (!isValidHttpsUrl(rawTilejsonUrl)) {
    // Falha fechada: URL que não seja https
    return { ...CONFIG_DESLIGADO }
  }

  // 3. Glifos: deve estar preenchido e ser HTTPS
  const rawGlyphsUrl = typeof record.glyphsUrl === 'string' ? record.glyphsUrl.trim() : ''
  if (rawGlyphsUrl === '' || !isValidGlyphsUrl(rawGlyphsUrl)) {
    // Falha fechada: glifos ausentes ou não HTTPS
    return { ...CONFIG_DESLIGADO }
  }

  return {
    desligado: false,
    tilejsonUrl: rawTilejsonUrl,
    glyphsUrl: rawGlyphsUrl,
    styleUrl: '',
    credit,
  }
}

/**
 * Lê e valida as configurações de mapa servidas em /config/mapa.json.
 * Em caso de erro de rede, arquivo ausente (404) ou JSON inválido, aplica falha fechada.
 */
export async function carregarConfigMapa(
  url = '/config/mapa.json',
  fetcher: typeof fetch = typeof window !== 'undefined' ? window.fetch.bind(window) : fetch
): Promise<MapaConfig> {
  try {
    const response = await fetcher(url)
    if (!response.ok) {
      return { ...CONFIG_DESLIGADO }
    }
    const json = await response.json()
    return validarConfigMapa(json)
  } catch {
    // Falha fechada: erro de rede, 404 ou JSON sintaticamente inválido
    return { ...CONFIG_DESLIGADO }
  }
}
