import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type LayerSpecification,
} from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import type { RoutePoint } from '../types'
import { useThemeTokens, toMapTokens } from '../theme/useThemeTokens'
import { estiloMapa } from './mapa/estiloMapa'
import { carregarConfigMapa, type MapaConfig } from './mapa/configMapa'
import { CreditoMapa } from './mapa/CreditoMapa'
import { isWebGlSupported, PT_BR_LOCALE, MARGEM_ENQUADRAMENTO_PADRAO } from './mapa/mapaUtils'
import {
  FONTE_TRAJETO,
  camadasDoTrajeto,
  estiloComTrajeto,
  geojsonDoTrajeto,
  limitesDoTrajeto,
  type CoresTrajeto,
} from './mapa/trajeto'
import '../styles/map-theme.scss'

// Worker servido pela própria origem ('self', ADR-0016 / CSP)
setWorkerUrl(workerUrl)

interface Props {
  points: RoutePoint[]
}

/**
 * Mapa com o trajeto de um veículo num período: a linha percorrida, o ponto de início e o de fim.
 * Usa o mesmo fundo configurável do mapa da frota (ADR-0016); com o fundo desligado, o trajeto
 * aparece sobre fundo liso.
 */
export default function RouteMap({ points }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [config, setConfig] = useState<MapaConfig | null>(null)
  const [webGl, setWebGl] = useState(true)

  const themeTokens = useThemeTokens()
  const mapTokens = useMemo(() => toMapTokens(themeTokens), [themeTokens])
  const cores: CoresTrajeto = useMemo(
    () => ({
      linha: themeTokens.mapRouteActive || themeTokens.chartSpeed,
      contorno: themeTokens.mapRoadCasing,
      inicio: themeTokens.mapMarkerEnroute,
      fim: themeTokens.mapMarkerMaintenance,
    }),
    [themeTokens],
  )

  const pointsRef = useRef(points)
  const coresRef = useRef(cores)
  useEffect(() => {
    pointsRef.current = points
    coresRef.current = cores
  }, [points, cores])

  useEffect(() => {
    let cancelado = false
    carregarConfigMapa().then((cfg) => {
      if (!cancelado) setConfig(cfg)
    })
    return () => {
      cancelado = true
    }
  }, [])

  // Cria o mapa uma vez, quando a configuração chega.
  useEffect(() => {
    if (!containerRef.current || !config) return
    if (!isWebGlSupported()) {
      setWebGl(false)
      return
    }

    const base = estiloMapa(mapTokens, config)
    const estilo =
      typeof base === 'string' ? base : estiloComTrajeto(base, pointsRef.current, coresRef.current)
    const limites = limitesDoTrajeto(pointsRef.current)

    const map = new MapLibreMap({
      container: containerRef.current,
      style: estilo,
      maxZoom: 17,
      attributionControl: false,
      locale: PT_BR_LOCALE,
      ...(limites
        ? { bounds: limites, fitBoundsOptions: { padding: MARGEM_ENQUADRAMENTO_PADRAO * 2 } }
        : {}),
    })
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')

    // Estilo externo (MAP_STYLE_URL) chega como URL: o trajeto entra depois que ele carrega.
    if (typeof base === 'string') {
      map.on('load', () => {
        map.addSource(FONTE_TRAJETO, {
          type: 'geojson',
          data: geojsonDoTrajeto(pointsRef.current),
        })
        for (const camada of camadasDoTrajeto(coresRef.current)) {
          map.addLayer(camada as unknown as LayerSpecification)
        }
      })
    }

    mapRef.current = map
    if (typeof window !== 'undefined') {
      ;(window as unknown as { __routeMap?: MapLibreMap }).__routeMap = map
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as unknown as { __routeMap?: MapLibreMap }).__routeMap
      }
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config])

  // Trajeto ou tema mudaram: redesenha e reenquadra.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !config) return

    const base = estiloMapa(mapTokens, config)
    try {
      if (typeof base === 'string') {
        const fonte = map.getSource(FONTE_TRAJETO) as GeoJSONSource | undefined
        fonte?.setData(geojsonDoTrajeto(points))
      } else {
        map.setStyle(estiloComTrajeto(base, points, cores), { diff: true })
      }
    } catch {
      // Mapa ainda sem estilo carregado: a criação já desenhou o trajeto inicial.
    }

    const limites = limitesDoTrajeto(points)
    if (limites) {
      map.fitBounds(limites, { padding: MARGEM_ENQUADRAMENTO_PADRAO * 2, duration: 0, maxZoom: 15 })
    }
  }, [points, cores, mapTokens, config])

  return (
    <div className="fleet-map route-map" data-testid="route-map">
      <div
        className="map-container"
        ref={containerRef}
        role="img"
        aria-label="Mapa com o trajeto do veículo no período escolhido"
      >
        {!webGl && (
          <div className="ft-map-fallback">
            <h4>Mapa indisponível neste navegador</h4>
            <p>O resumo do trajeto e os registros abaixo continuam disponíveis.</p>
          </div>
        )}
        <CreditoMapa credit={config?.credit} desligado={config?.desligado} />
      </div>
      <div className="map-legend" role="list" aria-label="Legenda do trajeto">
        <span className="map-legend-item" role="listitem">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
            <circle
              cx="12"
              cy="12"
              r="9"
              fill={cores.inicio}
              stroke={cores.contorno}
              strokeWidth="3"
            />
          </svg>
          <strong>Início</strong>
        </span>
        <span className="map-legend-item" role="listitem">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
            <circle
              cx="12"
              cy="12"
              r="9"
              fill={cores.fim}
              stroke={cores.contorno}
              strokeWidth="3"
            />
          </svg>
          <strong>Fim</strong>
        </span>
        <span className="map-legend-item" role="listitem">
          <svg viewBox="0 0 24 24" width="22" height="14" aria-hidden="true" focusable="false">
            <line x1="1" y1="12" x2="23" y2="12" stroke={cores.linha} strokeWidth="5" />
          </svg>
          <strong>Caminho percorrido</strong>
        </span>
      </div>
    </div>
  )
}
