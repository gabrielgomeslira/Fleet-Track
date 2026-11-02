import type { StyleSpecification, LayerSpecification } from 'maplibre-gl'
import type { MapaConfig } from './configMapa'

export interface MapTokens {
  land: string
  water: string
  boundary: string
  road: string
  roadCasing: string
  roadMinor: string
  label: string
  labelHalo: string
  routeActive?: string
  routeCompleted?: string
  markerEnroute?: string
  markerStopped?: string
  markerMaintenance?: string
  [key: string]: string | undefined
}

export const MAP_TOKENS_DARK: MapTokens = {
  land: '#161616',
  water: '#12161a',
  boundary: '#6f6f6f',
  road: '#525252',
  roadCasing: '#262626',
  roadMinor: '#393939',
  label: '#f4f4f4',
  labelHalo: '#161616',
  routeActive: '#33b1ff',
  routeCompleted: '#6f6f6f',
  markerEnroute: '#33b1ff',
  markerStopped: '#f1c21b',
  markerMaintenance: '#da1e28',
}

export const MAP_TOKENS_LIGHT: MapTokens = {
  land: '#f4f4f4',
  water: '#cfdde6',
  boundary: '#8d8d8d',
  road: '#ffffff',
  roadCasing: '#c6c6c6',
  roadMinor: '#e0e0e0',
  label: '#161616',
  labelHalo: '#ffffff',
  routeActive: '#0072c3',
  routeCompleted: '#8d8d8d',
  markerEnroute: '#0072c3',
  markerStopped: '#b28600',
  markerMaintenance: '#da1e28',
}

/** Camadas do vetor OpenMapTiles estritamente permitidas pelo ADR-0016 */
export const ALLOWED_SOURCE_LAYERS = [
  'water',
  'waterway',
  'boundary',
  'transportation',
  'transportation_name',
  'place',
] as const

/** Fontes permitidas no estilo próprio */
export const ALLOWED_SOURCES = ['base'] as const

/** Fontes tipográficas servidas pelo provedor OpenFreeMap e permitidas no estilo */
export const ALLOWED_FONTS = ['Noto Sans Regular', 'Noto Sans Bold'] as const

/** Classes viárias permitidas em transportation e transportation_name */
export const ALLOWED_CLASSES_TRANSPORTATION = [
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'minor',
] as const

/** Camadas expressamente proibidas no ADR-0016 (não podem existir no estilo) */
export const PROHIBITED_SOURCE_LAYERS = [
  'landcover',
  'landuse',
  'park',
  'building',
  'poi',
  'housenumber',
  'mountain_peak',
  'aeroway',
  'aerodrome_label',
  'water_name',
] as const

/** Classes viárias expressamente fora do filtro no ADR-0016 */
export const PROHIBITED_CLASSES_TRANSPORTATION = [
  'service',
  'track',
  'path',
  'rail',
  'transit',
  'ferry',
  'busway',
  'raceway',
] as const

function resolveToken(tokens: MapTokens, key: keyof MapTokens, fallbackVarName?: string): string {
  if (tokens[key]) return tokens[key] as string
  if (fallbackVarName && tokens[fallbackVarName]) return tokens[fallbackVarName] as string
  return '#000000'
}

/**
 * Gera a especificação de estilo MapLibre GL estritamente alinhada ao ADR-0016 item 3 e DS §6.
 *
 * Características essenciais:
 * - transition imediata { duration: 0, delay: 0 } para troca de tema em < 100 ms.
 * - Sem declaração de sprite.
 * - Nomes de lugares e vias utilizam coalesce(name:pt, name:latin, name).
 * - Tipografia Noto Sans.
 * - Respeita lista estrita de camadas e filtros do ADR-0016.
 * - Falha fechada / Fundo desligado gera apenas camada de fundo liso sem fontes externas.
 * - MAP_STYLE_URL substitui TileJSON e glifos e devolve a URL para carregamento direto pelo MapLibre.
 */
export function estiloMapa(
  tokens: MapTokens,
  config: { styleUrl: `${string}://${string}` } & Partial<MapaConfig>,
): StyleSpecification | string
export function estiloMapa(
  tokens: MapTokens,
  config?: Partial<MapaConfig>,
): StyleSpecification
export function estiloMapa(
  tokens: MapTokens,
  config?: Partial<MapaConfig>,
): StyleSpecification | string {
  const landColor = resolveToken(tokens, 'land', '--ft-map-land')
  const waterColor = resolveToken(tokens, 'water', '--ft-map-water')
  const boundaryColor = resolveToken(tokens, 'boundary', '--ft-map-boundary')
  const roadColor = resolveToken(tokens, 'road', '--ft-map-road')
  const roadCasingColor = resolveToken(tokens, 'roadCasing', '--ft-map-road-casing')
  const roadMinorColor = resolveToken(tokens, 'roadMinor', '--ft-map-road-minor')
  const labelColor = resolveToken(tokens, 'label', '--ft-map-label')
  const labelHaloColor = resolveToken(tokens, 'labelHalo', '--ft-map-label-halo')

  const hasStyleUrl = Boolean(config?.styleUrl && config.styleUrl.trim() !== '')
  const isDesligado =
    !config ||
    Boolean(config.desligado) ||
    (!hasStyleUrl && (!config.tilejsonUrl || !config.glyphsUrl))

  // Caso 1: Fundo desligado por configuração ou falha fechada
  // Gera apenas o background liso na cor de terra, sem fazer pedidos a terceiros
  if (isDesligado) {
    return {
      version: 8,
      name: 'FleetTrack Fundo Desligado',
      transition: { duration: 0, delay: 0 },
      sources: {},
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': landColor },
        },
      ],
    }
  }

  // Caso 2: MAP_STYLE_URL definida (substitui TileJSON e glifos)
  // O estilo externo é carregado diretamente pelo MapLibre via URL (ADR-0016 §2 e §11)
  if (hasStyleUrl) {
    return config!.styleUrl!.trim()
  }

  const tilejsonUrl = config?.tilejsonUrl || ''
  const glyphsUrl = config?.glyphsUrl || ''

  // Caso 3: Estilo vetorizado padrão OpenFreeMap / OpenMapTiles com tokens do tema
  const layers: LayerSpecification[] = [
    // 1. Terra (background)
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': landColor,
      },
    },

    // 2. Corpos d'água (water) - entra sem túneis
    {
      id: 'water',
      type: 'fill',
      source: 'base',
      'source-layer': 'water',
      filter: ['!=', ['coalesce', ['get', 'tunnel'], false], true],
      paint: {
        'fill-color': waterColor,
      },
    },

    // 3. Rios e canais (waterway) - apenas river e canal a partir do z10
    {
      id: 'waterway',
      type: 'line',
      source: 'base',
      'source-layer': 'waterway',
      minzoom: 10,
      filter: [
        'all',
        ['in', ['get', 'class'], ['literal', ['river', 'canal']]],
        ['!=', ['coalesce', ['get', 'tunnel'], false], true],
      ],
      paint: {
        'line-color': waterColor,
        'line-width': 1,
      },
    },

    // 4. Divisas administrativas (boundary)
    // 4a. País contínuo
    {
      id: 'boundary_country',
      type: 'line',
      source: 'base',
      'source-layer': 'boundary',
      filter: [
        'all',
        ['==', ['get', 'admin_level'], 2],
        ['!=', ['coalesce', ['get', 'maritime'], 0], 1],
      ],
      paint: {
        'line-color': boundaryColor,
        'line-width': 1.5,
      },
    },
    // 4b. UF tracejada a partir do z3 (sem limites marítimos)
    {
      id: 'boundary_state',
      type: 'line',
      source: 'base',
      'source-layer': 'boundary',
      minzoom: 3,
      filter: [
        'all',
        ['==', ['get', 'admin_level'], 4],
        ['!=', ['coalesce', ['get', 'maritime'], 0], 1],
      ],
      paint: {
        'line-color': boundaryColor,
        'line-width': 1,
        'line-dasharray': [2, 2],
      },
    },

    // 5. Malha viária (transportation) - sem túneis
    // 5a. Contornos estruturantes (casing)
    {
      id: 'transportation_casing_motorway_trunk',
      type: 'line',
      source: 'base',
      'source-layer': 'transportation',
      minzoom: 5,
      filter: [
        'all',
        ['in', ['get', 'class'], ['literal', ['motorway', 'trunk']]],
        ['!=', ['coalesce', ['get', 'tunnel'], 0], 1],
      ],
      paint: {
        'line-color': roadCasingColor,
        'line-width': 3.5,
      },
    },
    {
      id: 'transportation_casing_primary',
      type: 'line',
      source: 'base',
      'source-layer': 'transportation',
      minzoom: 7,
      filter: [
        'all',
        ['==', ['get', 'class'], 'primary'],
        ['!=', ['coalesce', ['get', 'tunnel'], 0], 1],
      ],
      paint: {
        'line-color': roadCasingColor,
        'line-width': 3,
      },
    },

    // 5b. Rodovias principais (motorway e trunk z5, primary z7)
    {
      id: 'transportation_motorway_trunk',
      type: 'line',
      source: 'base',
      'source-layer': 'transportation',
      minzoom: 5,
      filter: [
        'all',
        ['in', ['get', 'class'], ['literal', ['motorway', 'trunk']]],
        ['!=', ['coalesce', ['get', 'tunnel'], 0], 1],
      ],
      paint: {
        'line-color': roadColor,
        'line-width': 2,
      },
    },
    {
      id: 'transportation_primary',
      type: 'line',
      source: 'base',
      'source-layer': 'transportation',
      minzoom: 7,
      filter: [
        'all',
        ['==', ['get', 'class'], 'primary'],
        ['!=', ['coalesce', ['get', 'tunnel'], 0], 1],
      ],
      paint: {
        'line-color': roadColor,
        'line-width': 1.8,
      },
    },

    // 5c. Vias secundárias e terciárias (secondary e tertiary z10)
    {
      id: 'transportation_secondary_tertiary',
      type: 'line',
      source: 'base',
      'source-layer': 'transportation',
      minzoom: 10,
      filter: [
        'all',
        ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary']]],
        ['!=', ['coalesce', ['get', 'tunnel'], 0], 1],
      ],
      paint: {
        'line-color': roadMinorColor,
        'line-width': 1.2,
      },
    },

    // 5d. Vias urbanas locais (minor z12)
    {
      id: 'transportation_minor',
      type: 'line',
      source: 'base',
      'source-layer': 'transportation',
      minzoom: 12,
      filter: [
        'all',
        ['==', ['get', 'class'], 'minor'],
        ['!=', ['coalesce', ['get', 'tunnel'], 0], 1],
      ],
      paint: {
        'line-color': roadMinorColor,
        'line-width': 0.8,
      },
    },

    // 6. Rótulos viários (transportation_name) - só a partir do z14 e nas classes permitidas
    {
      id: 'transportation_name',
      type: 'symbol',
      source: 'base',
      'source-layer': 'transportation_name',
      minzoom: 14,
      filter: [
        'all',
        [
          'in',
          ['get', 'class'],
          ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor']],
        ],
      ],
      layout: {
        'symbol-placement': 'line',
        'text-field': ['coalesce', ['get', 'name:pt'], ['get', 'name:latin'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
      },
      paint: {
        'text-color': labelColor,
        'text-halo-color': labelHaloColor,
        'text-halo-width': 1.5,
      },
    },

    // 7. Rótulos de lugares (place)
    // 7a. Países (country até o z4)
    {
      id: 'place_country',
      type: 'symbol',
      source: 'base',
      'source-layer': 'place',
      maxzoom: 4,
      filter: ['==', ['get', 'class'], 'country'],
      layout: {
        'text-field': ['coalesce', ['get', 'name:pt'], ['get', 'name:latin'], ['get', 'name']],
        'text-font': ['Noto Sans Bold'],
        'text-size': 14,
      },
      paint: {
        'text-color': labelColor,
        'text-halo-color': labelHaloColor,
        'text-halo-width': 1.5,
      },
    },

    // 7b. Estados (state do z4 ao z6)
    {
      id: 'place_state',
      type: 'symbol',
      source: 'base',
      'source-layer': 'place',
      minzoom: 4,
      maxzoom: 6,
      filter: ['==', ['get', 'class'], 'state'],
      layout: {
        'text-field': ['coalesce', ['get', 'name:pt'], ['get', 'name:latin'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': 12,
      },
      paint: {
        'text-color': labelColor,
        'text-halo-color': labelHaloColor,
        'text-halo-width': 1.5,
      },
    },

    // 7c. Cidades principais (city do z3)
    {
      id: 'place_city',
      type: 'symbol',
      source: 'base',
      'source-layer': 'place',
      minzoom: 3,
      filter: ['==', ['get', 'class'], 'city'],
      layout: {
        'text-field': ['coalesce', ['get', 'name:pt'], ['get', 'name:latin'], ['get', 'name']],
        'text-font': ['Noto Sans Bold'],
        'text-size': 12,
      },
      paint: {
        'text-color': labelColor,
        'text-halo-color': labelHaloColor,
        'text-halo-width': 1.5,
      },
    },

    // 7d. Cidades médias (town do z8)
    {
      id: 'place_town',
      type: 'symbol',
      source: 'base',
      'source-layer': 'place',
      minzoom: 8,
      filter: ['==', ['get', 'class'], 'town'],
      layout: {
        'text-field': ['coalesce', ['get', 'name:pt'], ['get', 'name:latin'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
      },
      paint: {
        'text-color': labelColor,
        'text-halo-color': labelHaloColor,
        'text-halo-width': 1.5,
      },
    },

    // 7e. Vilarejos e subúrbios (village e suburb do z11)
    {
      id: 'place_village_suburb',
      type: 'symbol',
      source: 'base',
      'source-layer': 'place',
      minzoom: 11,
      filter: ['in', ['get', 'class'], ['literal', ['village', 'suburb']]],
      layout: {
        'text-field': ['coalesce', ['get', 'name:pt'], ['get', 'name:latin'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': 10,
      },
      paint: {
        'text-color': labelColor,
        'text-halo-color': labelHaloColor,
        'text-halo-width': 1.5,
      },
    },
  ]

  const style: StyleSpecification = {
    version: 8,
    name: 'FleetTrack OpenMapTiles Style',
    transition: {
      duration: 0,
      delay: 0,
    },
    sources: {
      base: {
        type: 'vector',
        url: tilejsonUrl,
      },
    },
    glyphs: glyphsUrl,
    layers,
  }

  return style
}
