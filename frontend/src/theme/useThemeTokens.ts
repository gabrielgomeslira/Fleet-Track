import { useContext, useEffect, useMemo, useState } from 'react'
import type { Theme } from './theme'
import { ThemeContext } from './ThemeProvider'

export interface ThemeTokens {
  // Dataviz
  dataviz1: string
  dataviz2: string
  dataviz3: string
  dataviz4: string
  dataviz5: string

  // Mapeamento semântico de gráficos
  chartSpeed: string
  chartFuel: string
  chartDeliveries: string
  chartEnroute: string
  chartStopped: string
  chartMaintenance: string
  chartGrid: string
  chartTooltipBg: string
  chartTooltipBorder: string
  chartAxisText: string

  // Tokens Carbon
  textSecondary: string
  borderSubtle01: string
  layer02: string
  textPrimary: string

  // Tokens cartográficos MapLibre (DS 3.3 §6.1 / ADR-0016)
  mapLand: string
  mapWater: string
  mapBoundary: string
  mapRoad: string
  mapRoadCasing: string
  mapRoadMinor: string
  mapLabel: string
  mapLabelHalo: string
  mapRouteActive: string
  mapRouteCompleted: string
  mapMarkerEnroute: string
  mapMarkerStopped: string
  mapMarkerMaintenance: string

  [key: string]: string
}

export const DARK_FALLBACKS: Record<string, string> = {
  '--ft-dataviz-1': '#08bdba',
  '--ft-dataviz-2': '#33b1ff',
  '--ft-dataviz-3': '#be95ff',
  '--ft-dataviz-4': '#42be65',
  '--ft-dataviz-5': '#ff832b',
  '--ft-chart-speed': '#08bdba',
  '--ft-chart-fuel': '#42be65',
  '--ft-chart-deliveries': '#be95ff',
  '--ft-chart-enroute': '#33b1ff',
  '--ft-chart-stopped': '#f1c21b',
  '--ft-chart-maintenance': '#da1e28',
  '--ft-chart-grid': '#393939',
  '--ft-chart-tooltip-bg': '#262626',
  '--ft-chart-tooltip-border': '#525252',
  '--ft-chart-axis-text': '#c6c6c6',
  '--cds-text-secondary': '#c6c6c6',
  '--cds-border-subtle-01': '#393939',
  '--cds-layer-02': '#393939',
  '--cds-text-primary': '#f4f4f4',
  '--ft-map-land': '#161616',
  '--ft-map-water': '#12161a',
  '--ft-map-boundary': '#6f6f6f',
  '--ft-map-road': '#525252',
  '--ft-map-road-casing': '#262626',
  '--ft-map-road-minor': '#393939',
  '--ft-map-label': '#f4f4f4',
  '--ft-map-label-halo': '#161616',
  '--ft-map-route-active': '#33b1ff',
  '--ft-map-route-completed': '#6f6f6f',
  '--ft-map-marker-enroute': '#33b1ff',
  '--ft-map-marker-stopped': '#f1c21b',
  '--ft-map-marker-maintenance': '#da1e28',
}

export const LIGHT_FALLBACKS: Record<string, string> = {
  '--ft-dataviz-1': '#007d79',
  '--ft-dataviz-2': '#0072c3',
  '--ft-dataviz-3': '#8a3ffc',
  '--ft-dataviz-4': '#198038',
  '--ft-dataviz-5': '#ba4e00',
  '--ft-chart-speed': '#007d79',
  '--ft-chart-fuel': '#198038',
  '--ft-chart-deliveries': '#8a3ffc',
  '--ft-chart-enroute': '#0072c3',
  '--ft-chart-stopped': '#b28600',
  '--ft-chart-maintenance': '#da1e28',
  '--ft-chart-grid': '#e0e0e0',
  '--ft-chart-tooltip-bg': '#ffffff',
  '--ft-chart-tooltip-border': '#c6c6c6',
  '--ft-chart-axis-text': '#525252',
  '--cds-text-secondary': '#525252',
  '--cds-border-subtle-01': '#e0e0e0',
  '--cds-layer-02': '#f4f4f4',
  '--cds-text-primary': '#161616',
  '--ft-map-land': '#f4f4f4',
  '--ft-map-water': '#cfdde6',
  '--ft-map-boundary': '#8d8d8d',
  '--ft-map-road': '#ffffff',
  '--ft-map-road-casing': '#c6c6c6',
  '--ft-map-road-minor': '#e0e0e0',
  '--ft-map-label': '#161616',
  '--ft-map-label-halo': '#ffffff',
  '--ft-map-route-active': '#0072c3',
  '--ft-map-route-completed': '#8d8d8d',
  '--ft-map-marker-enroute': '#0072c3',
  '--ft-map-marker-stopped': '#b28600',
  '--ft-map-marker-maintenance': '#da1e28',
}

function getActiveDomTheme(): Theme {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme')
    if (attr === 'light' || attr === 'dark') {
      return attr
    }
  }
  return 'dark'
}

export function readThemeTokens(themeOverride?: Theme): ThemeTokens {
  const activeTheme: Theme = themeOverride ?? getActiveDomTheme()
  const fallbacks = activeTheme === 'light' ? LIGHT_FALLBACKS : DARK_FALLBACKS

  let computed: CSSStyleDeclaration | null = null
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      computed = window.getComputedStyle(document.documentElement)
    } catch {
      computed = null
    }
  }

  function get(prop: string): string {
    if (computed) {
      const val = computed.getPropertyValue(prop).trim()
      if (val) return val
    }
    return fallbacks[prop] ?? ''
  }

  const dataviz1 = get('--ft-dataviz-1')
  const dataviz2 = get('--ft-dataviz-2')
  const dataviz3 = get('--ft-dataviz-3')
  const dataviz4 = get('--ft-dataviz-4')
  const dataviz5 = get('--ft-dataviz-5')

  const chartSpeed = get('--ft-chart-speed')
  const chartFuel = get('--ft-chart-fuel')
  const chartDeliveries = get('--ft-chart-deliveries')
  const chartEnroute = get('--ft-chart-enroute')
  const chartStopped = get('--ft-chart-stopped')
  const chartMaintenance = get('--ft-chart-maintenance')
  const chartGrid = get('--ft-chart-grid')
  const chartTooltipBg = get('--ft-chart-tooltip-bg')
  const chartTooltipBorder = get('--ft-chart-tooltip-border')
  const chartAxisText = get('--ft-chart-axis-text')

  const textSecondary = get('--cds-text-secondary')
  const borderSubtle01 = get('--cds-border-subtle-01')
  const layer02 = get('--cds-layer-02')
  const textPrimary = get('--cds-text-primary')

  const mapLand = get('--ft-map-land')
  const mapWater = get('--ft-map-water')
  const mapBoundary = get('--ft-map-boundary')
  const mapRoad = get('--ft-map-road')
  const mapRoadCasing = get('--ft-map-road-casing')
  const mapRoadMinor = get('--ft-map-road-minor')
  const mapLabel = get('--ft-map-label')
  const mapLabelHalo = get('--ft-map-label-halo')
  const mapRouteActive = get('--ft-map-route-active')
  const mapRouteCompleted = get('--ft-map-route-completed')
  const mapMarkerEnroute = get('--ft-map-marker-enroute')
  const mapMarkerStopped = get('--ft-map-marker-stopped')
  const mapMarkerMaintenance = get('--ft-map-marker-maintenance')

  return {
    dataviz1,
    dataviz2,
    dataviz3,
    dataviz4,
    dataviz5,
    chartSpeed,
    chartFuel,
    chartDeliveries,
    chartEnroute,
    chartStopped,
    chartMaintenance,
    chartGrid,
    chartTooltipBg,
    chartTooltipBorder,
    chartAxisText,
    textSecondary,
    borderSubtle01,
    layer02,
    textPrimary,

    mapLand,
    mapWater,
    mapBoundary,
    mapRoad,
    mapRoadCasing,
    mapRoadMinor,
    mapLabel,
    mapLabelHalo,
    mapRouteActive,
    mapRouteCompleted,
    mapMarkerEnroute,
    mapMarkerStopped,
    mapMarkerMaintenance,

    // CSS variables
    '--ft-dataviz-1': dataviz1,
    '--ft-dataviz-2': dataviz2,
    '--ft-dataviz-3': dataviz3,
    '--ft-dataviz-4': dataviz4,
    '--ft-dataviz-5': dataviz5,
    '--ft-chart-speed': chartSpeed,
    '--ft-chart-fuel': chartFuel,
    '--ft-chart-deliveries': chartDeliveries,
    '--ft-chart-enroute': chartEnroute,
    '--ft-chart-stopped': chartStopped,
    '--ft-chart-maintenance': chartMaintenance,
    '--ft-chart-grid': chartGrid,
    '--ft-chart-tooltip-bg': chartTooltipBg,
    '--ft-chart-tooltip-border': chartTooltipBorder,
    '--ft-chart-axis-text': chartAxisText,
    '--cds-text-secondary': textSecondary,
    '--cds-border-subtle-01': borderSubtle01,
    '--cds-layer-02': layer02,
    '--cds-text-primary': textPrimary,
    '--ft-map-land': mapLand,
    '--ft-map-water': mapWater,
    '--ft-map-boundary': mapBoundary,
    '--ft-map-road': mapRoad,
    '--ft-map-road-casing': mapRoadCasing,
    '--ft-map-road-minor': mapRoadMinor,
    '--ft-map-label': mapLabel,
    '--ft-map-label-halo': mapLabelHalo,
    '--ft-map-route-active': mapRouteActive,
    '--ft-map-route-completed': mapRouteCompleted,
    '--ft-map-marker-enroute': mapMarkerEnroute,
    '--ft-map-marker-stopped': mapMarkerStopped,
    '--ft-map-marker-maintenance': mapMarkerMaintenance,
  }
}

export function toMapTokens(tokens: ThemeTokens) {
  return {
    land: tokens.mapLand,
    water: tokens.mapWater,
    boundary: tokens.mapBoundary,
    road: tokens.mapRoad,
    roadCasing: tokens.mapRoadCasing,
    roadMinor: tokens.mapRoadMinor,
    label: tokens.mapLabel,
    labelHalo: tokens.mapLabelHalo,
    routeActive: tokens.mapRouteActive,
    routeCompleted: tokens.mapRouteCompleted,
    markerEnroute: tokens.mapMarkerEnroute,
    markerStopped: tokens.mapMarkerStopped,
    markerMaintenance: tokens.mapMarkerMaintenance,
  }
}

/**
 * Hook para leitura síncrona dos tokens CSS de gráficos e Carbon data-viz.
 * Recalcula quando o tema do ThemeProvider ou o atributo data-theme em documentElement muda.
 */
export function useThemeTokens(): ThemeTokens {
  const context = useContext(ThemeContext)
  const [domTheme, setDomTheme] = useState<Theme>(() => getActiveDomTheme())

  useEffect(() => {
    // Se context estiver presente, o ThemeProvider já gerencia as mudanças de tema
    if (context || typeof window === 'undefined') return

    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ theme?: Theme }>
      const nextTheme = customEvent.detail?.theme ?? getActiveDomTheme()
      setDomTheme(nextTheme)
    }

    window.addEventListener('ft-theme-change', handleThemeChange)

    return () => {
      window.removeEventListener('ft-theme-change', handleThemeChange)
    }
  }, [context])

  const activeTheme = context?.theme ?? domTheme

  return useMemo(() => {
    return readThemeTokens(activeTheme)
  }, [activeTheme])
}

export default useThemeTokens
