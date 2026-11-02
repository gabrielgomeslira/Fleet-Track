export type EstadoFundo = 'carregando' | 'pronto' | 'desligado' | 'indisponivel'

export interface CreditoItem {
  texto: string
  link?: string
}

export const PT_BR_LOCALE: Record<string, string> = {
  'AttributionControl.ToggleAttribution': 'Alternar atribuição',
  'AttributionControl.MapFeedback': 'Feedback do mapa',
  'FullscreenControl.Enter': 'Entrar em tela cheia',
  'FullscreenControl.Exit': 'Sair da tela cheia',
  'GeolocateControl.FindMyLocation': 'Encontrar minha localização',
  'GeolocateControl.LocationNotAvailable': 'Localização não disponível',
  'LogoControl.Title': 'Logo do MapLibre',
  'Map.Title': 'Mapa da frota',
  'Marker.Title': 'Marcador no mapa',
  'NavigationControl.ResetBearing': 'Redefinir orientação para o norte',
  'NavigationControl.ZoomIn': 'Aumentar zoom',
  'NavigationControl.ZoomOut': 'Diminuir zoom',
  'Popup.Close': 'Fechar popup',
}

/**
 * Verifica se a aceleração gráfica WebGL está disponível no navegador.
 */
export function isWebGlSupported(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl') ||
          canvas.getContext('experimental-webgl') ||
          canvas.getContext('webgl2')),
    )
  } catch {
    return false
  }
}

/**
 * Converte a string de créditos do mapa (pares texto|link separados por ponto e vírgula)
 * em uma lista estruturada de créditos. Garante que o link do OpenStreetMap para copyright
 * permaneça estritamente presente quando o fundo estiver ativo (ADR-0016 / ODbL 1.0).
 */
export function parseCreditoMapa(rawCredit?: string): CreditoItem[] {
  const items: CreditoItem[] = []
  const creditString = (
    rawCredit || 'OpenFreeMap|https://openfreemap.org;© OpenMapTiles|https://www.openmaptiles.org/'
  ).trim()

  const parts = creditString.split(';')
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const pipeIdx = trimmed.indexOf('|')
    if (pipeIdx === -1) {
      items.push({ texto: trimmed })
    } else {
      const texto = trimmed.slice(0, pipeIdx).trim()
      const link = trimmed.slice(pipeIdx + 1).trim()
      if (texto) {
        items.push({ texto, link: link.startsWith('https://') ? link : undefined })
      }
    }
  }

  // Atribuição mandatória fixa do OpenStreetMap com link para termos de copyright
  const temOsm = items.some((it) => it.texto.toLowerCase().includes('openstreetmap'))
  if (!temOsm) {
    items.push({
      texto: '© OpenStreetMap',
      link: 'https://www.openstreetmap.org/copyright',
    })
  }

  return items
}
