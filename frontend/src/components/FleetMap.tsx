import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import type { Vehicle, Delivery } from '../types'
import { useThemeTokens, toMapTokens } from '../theme/useThemeTokens'
import { estiloMapa } from './mapa/estiloMapa'
import { carregarConfigMapa, type MapaConfig } from './mapa/configMapa'
import { MarcadorVeiculo } from './mapa/MarcadorVeiculo'
import { PopupVeiculo } from './mapa/PopupVeiculo'
import { CreditoMapa } from './mapa/CreditoMapa'
import { isWebGlSupported, PT_BR_LOCALE, type EstadoFundo } from './mapa/mapaUtils'
import '../styles/map-theme.scss'

// Configura o worker do MapLibre GL a partir da nossa própria origem ('self', ADR-0016 / CSP)
setWorkerUrl(workerUrl)

interface Props {
  vehicles: Vehicle[]
  deliveries?: Delivery[]
}

export default function FleetMap({ vehicles, deliveries = [] }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [estadoFundo, setEstadoFundo] = useState<EstadoFundo>('carregando')
  const [config, setConfig] = useState<MapaConfig | null>(null)
  const [webGlSuportado, setWebGlSuportado] = useState(true)
  const [mapaPronto, setMapaPronto] = useState(false)

  const themeTokens = useThemeTokens()
  const mapTokens = useMemo(() => toMapTokens(themeTokens), [themeTokens])

  // Armazena marcadores e popups indexados por vehicle.id para atualização in-place
  const marcadoresRef = useRef<
    Map<
      string,
      {
        marcador: MarcadorVeiculo
        popup: PopupVeiculo
      }
    >
  >(new Map())

  // Referência para o popup atualmente aberto
  const popupAbertoIdRef = useRef<string | null>(null)

  // Referência para lista ordenada de IDs visíveis para continuidade do Tab
  const veiculosVisiveisIdsRef = useRef<string[]>([])

  // Carrega configuração de /config/mapa.json
  useEffect(() => {
    let cancelado = false
    carregarConfigMapa().then((cfg) => {
      if (!cancelado) {
        setConfig(cfg)
      }
    })
    return () => {
      cancelado = true
    }
  }, [])

  // Inicializa mapa quando container e config estiverem prontos
  useEffect(() => {
    if (!mapContainerRef.current || !config) return

    // Verifica suporte a WebGL no navegador
    if (!isWebGlSupported()) {
      setWebGlSuportado(false)
      setEstadoFundo('indisponivel')
      return
    }

    const estiloInicial = estiloMapa(mapTokens, config)

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: estiloInicial,
      center: [-47.93, -15.78], // Enquadramento centrado no Brasil (longitude, latitude)
      zoom: 3.5,
      maxZoom: 16,
      attributionControl: false, // Atribuição automática desligada; usamos nosso CreditoMapa seguro
      locale: PT_BR_LOCALE,
    })

    // Adiciona controle de zoom discreto no canto superior direito
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')

    map.on('idle', () => {
      setEstadoFundo(config.desligado ? 'desligado' : 'pronto')
    })

    mapRef.current = map
    setMapaPronto(true)
    if (typeof window !== 'undefined') {
      ;(window as unknown as { __fleetMap?: MapLibreMap }).__fleetMap = map
    }
    const marcadoresAtuais = marcadoresRef.current

    return () => {
      setMapaPronto(false)
      if (typeof window !== 'undefined') {
        delete (window as unknown as { __fleetMap?: MapLibreMap }).__fleetMap
      }
      marcadoresAtuais.forEach(({ marcador, popup }) => {
        popup.fechar()
        marcador.remover()
      })
      marcadoresAtuais.clear()
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config])

  // Atualização de tema imediata com setStyle({ diff: true })
  useEffect(() => {
    const map = mapRef.current
    if (!map || !config) return

    try {
      const novoEstilo = estiloMapa(mapTokens, config)
      map.setStyle(novoEstilo, { diff: true })
    } catch {
      // Ignora falha de diff se mapa ainda não estiver pronto
    }
  }, [mapTokens, config, mapaPronto])

  // Função para navegar entre marcadores com Tab
  const handleTabOut = useCallback((veiculoId: string, direction: 'next' | 'prev') => {
    const ids = veiculosVisiveisIdsRef.current
    const idx = ids.indexOf(veiculoId)
    if (idx === -1 || ids.length === 0) return

    const proximoIdx =
      direction === 'next' ? (idx + 1) % ids.length : (idx - 1 + ids.length) % ids.length
    const proximoId = ids[proximoIdx]
    const proximo = marcadoresRef.current.get(proximoId)
    if (proximo) {
      proximo.marcador.button.focus()
    }
  }, [])

  // Sincronização e atualização dos marcadores veiculares
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Mapeamento de entregas ativas por id ou placa do veículo
    const entregaPorVeiculo = new Map<string, Delivery>()
    deliveries.forEach((d) => {
      if (d.vehicleId) entregaPorVeiculo.set(d.vehicleId, d)
      if (d.vehiclePlate) entregaPorVeiculo.set(d.vehiclePlate, d)
    })

    const novosIdsVisiveis: string[] = []
    const veiculosValidos = vehicles.filter((v) => {
      // Veículos sem posição (null ou inválida) ficam fora do mapa (ADR-0016 / H-21)
      return (
        v.latitude !== null &&
        v.longitude !== null &&
        !isNaN(v.latitude) &&
        !isNaN(v.longitude) &&
        typeof v.latitude === 'number' &&
        typeof v.longitude === 'number'
      )
    })

    veiculosValidos.forEach((v) => {
      novosIdsVisiveis.push(v.id)
      const entrega = entregaPorVeiculo.get(v.id) || entregaPorVeiculo.get(v.plate) || null
      const existente = marcadoresRef.current.get(v.id)

      if (existente) {
        // ATUALIZAÇÃO IN-PLACE: nunca recria o marcador a cada poll de 5s,
        // preservando o foco do teclado ativo e o popup aberto.
        existente.marcador.atualizar(v)
        existente.popup.atualizar(v, entrega)
      } else {
        // Criação de novo marcador acessível
        const marcador = new MarcadorVeiculo({
          veiculo: v,
          onClick: (veiculo) => {
            const par = marcadoresRef.current.get(veiculo.id)
            if (!par) return

            // Fecha popup anterior se houver
            if (popupAbertoIdRef.current && popupAbertoIdRef.current !== veiculo.id) {
              const anterior = marcadoresRef.current.get(popupAbertoIdRef.current)
              if (anterior) anterior.popup.fechar()
            }

            if (par.popup.isOpen()) {
              par.popup.fechar()
              popupAbertoIdRef.current = null
            } else {
              par.popup.popup.setLngLat([veiculo.longitude, veiculo.latitude])
              par.popup.popup.addTo(map)
              popupAbertoIdRef.current = veiculo.id
            }
          },
        })

        const popup = new PopupVeiculo({
          veiculo: v,
          entrega,
          marcadorElemento: marcador.button,
          onClose: () => {
            if (popupAbertoIdRef.current === v.id) {
              popupAbertoIdRef.current = null
            }
          },
          onTabOut: (dir) => handleTabOut(v.id, dir),
        })

        marcador.marker.addTo(map)
        marcadoresRef.current.set(v.id, { marcador, popup })
      }
    })

    veiculosVisiveisIdsRef.current = novosIdsVisiveis

    // Remove marcadores de veículos que saíram da lista
    const idsValidosSet = new Set(novosIdsVisiveis)
    marcadoresRef.current.forEach(({ marcador, popup }, id) => {
      if (!idsValidosSet.has(id)) {
        popup.fechar()
        marcador.remover()
        marcadoresRef.current.delete(id)
      }
    })
  }, [vehicles, deliveries, handleTabOut, mapaPronto])

  return (
    <div
      className="fleet-map"
      data-estado-fundo={estadoFundo}
      data-testid="fleet-map"
      role="region"
      aria-label="Mapa operacional da frota"
    >
      <h3>Mapa da Frota</h3>

      <div className="map-container" ref={mapContainerRef} data-testid="map-container">
        {!webGlSuportado && (
          <div className="ft-map-fallback" data-testid="map-webgl-fallback">
            <h4>Mapa indisponível neste navegador</h4>
            <p>
              A aceleração gráfica WebGL necessária para exibir o mapa vetorial não está disponível
              no momento. A tabela de veículos abaixo segue como alternativa com todas as posições
              atualizadas.
            </p>
          </div>
        )}

        <CreditoMapa credit={config?.credit} desligado={config?.desligado} />
      </div>

      {/* Legenda em texto com a forma de cada status (R-COR / WCAG 2.2 AA) */}
      <div className="map-legend" role="list" aria-label="Legenda de status dos veículos no mapa">
        <span className="map-legend-item" role="listitem">
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            aria-hidden="true"
            focusable="false"
          >
            <polygon
              points="12,2 22,21 2,21"
              fill="var(--ft-map-marker-enroute, #33b1ff)"
              stroke="var(--ft-map-road-casing, #262626)"
              strokeWidth="2"
            />
          </svg>
          <strong>Em rota</strong> (triângulo ▲)
        </span>

        <span className="map-legend-item" role="listitem">
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            aria-hidden="true"
            focusable="false"
          >
            <rect
              x="2"
              y="2"
              width="20"
              height="20"
              fill="var(--ft-map-marker-stopped, #f1c21b)"
              stroke="#000000"
              strokeWidth="2"
            />
            <text
              x="12"
              y="16"
              textAnchor="middle"
              fontFamily="'IBM Plex Sans', sans-serif"
              fontWeight="600"
              fontSize="12"
              fill="#161616"
            >
              P
            </text>
          </svg>
          <strong>Parado</strong> (quadrado ■ 'P')
        </span>

        <span className="map-legend-item" role="listitem">
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            aria-hidden="true"
            focusable="false"
          >
            <polygon
              points="12,2 22,12 12,22 2,12"
              fill="var(--ft-map-marker-maintenance, #da1e28)"
              stroke="#ffffff"
              strokeWidth="2"
            />
            <text
              x="12"
              y="17"
              textAnchor="middle"
              fontFamily="'IBM Plex Sans', sans-serif"
              fontWeight="700"
              fontSize="12"
              fill="#ffffff"
            >
              !
            </text>
          </svg>
          <strong>Manutenção</strong> (losango ◆ '!')
        </span>
      </div>
    </div>
  )
}
