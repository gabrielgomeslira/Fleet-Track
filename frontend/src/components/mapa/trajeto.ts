import type { StyleSpecification } from 'maplibre-gl'
import type { RoutePoint } from '../../types'

/** Ids da fonte e das camadas do trajeto no estilo do mapa. */
export const FONTE_TRAJETO = 'trajeto'
export const CAMADA_LINHA = 'trajeto-linha'
export const CAMADA_CONTORNO = 'trajeto-contorno'
export const CAMADA_PONTAS = 'trajeto-pontas'

export interface CoresTrajeto {
  linha: string
  contorno: string
  inicio: string
  fim: string
}

export interface ResumoTrajeto {
  distanciaKm: number
  duracaoMin: number
  velocidadeMax: number | null
  velocidadeMedia: number | null
  inicio: string | null
  fim: string | null
}

const RAIO_TERRA_KM = 6371

function doisDigitos(n: number): string {
  return String(n).padStart(2, '0')
}

/** Dia de hoje no fuso do navegador, no formato do `<input type="date">` (AAAA-MM-DD). */
export function hojeLocal(agora: Date = new Date()): string {
  return `${agora.getFullYear()}-${doisDigitos(agora.getMonth() + 1)}-${doisDigitos(agora.getDate())}`
}

/**
 * Período de um dia inteiro no fuso do navegador, como instantes ISO (UTC). O dia vai da meia-noite
 * local até a meia-noite seguinte; a API trata o fim como aberto.
 */
export function periodoDoDia(dia: string): { from: string; to: string } | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia)
  if (!partes) return null
  const [ano, mes, d] = [Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])]
  const inicio = new Date(ano, mes, d)
  const fim = new Date(ano, mes, d + 1)
  if (isNaN(inicio.getTime())) return null
  return { from: inicio.toISOString(), to: fim.toISOString() }
}

/** Distância em km entre dois pontos pela fórmula de haversine. */
export function distanciaEntreKm(a: RoutePoint, b: RoutePoint): number {
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLon = rad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * RAIO_TERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Números do trajeto: distância somada ponto a ponto, duração e velocidades (ignorando leituras nulas). */
export function resumoTrajeto(pontos: RoutePoint[]): ResumoTrajeto {
  let distanciaKm = 0
  for (let i = 1; i < pontos.length; i++) {
    distanciaKm += distanciaEntreKm(pontos[i - 1], pontos[i])
  }

  const velocidades = pontos.map((p) => p.speed).filter((v): v is number => v != null)
  const inicio = pontos[0]?.recordedAt ?? null
  const fim = pontos[pontos.length - 1]?.recordedAt ?? null
  const duracaoMin =
    inicio && fim ? Math.max(0, (new Date(fim).getTime() - new Date(inicio).getTime()) / 60_000) : 0

  return {
    distanciaKm,
    duracaoMin,
    velocidadeMax: velocidades.length ? Math.max(...velocidades) : null,
    velocidadeMedia: velocidades.length
      ? velocidades.reduce((s, v) => s + v, 0) / velocidades.length
      : null,
    inicio,
    fim,
  }
}

/** Retângulo que contém o trajeto, no formato do `fitBounds` ([[oeste, sul], [leste, norte]]). */
export function limitesDoTrajeto(
  pontos: RoutePoint[],
): [[number, number], [number, number]] | null {
  if (pontos.length === 0) return null
  let [oeste, sul, leste, norte] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const p of pontos) {
    oeste = Math.min(oeste, p.longitude)
    leste = Math.max(leste, p.longitude)
    sul = Math.min(sul, p.latitude)
    norte = Math.max(norte, p.latitude)
  }
  return [
    [oeste, sul],
    [leste, norte],
  ]
}

/** GeoJSON com a linha do trajeto e os pontos de início e fim. */
export function geojsonDoTrajeto(pontos: RoutePoint[]): GeoJSON.FeatureCollection {
  const coordenadas = pontos.map((p) => [p.longitude, p.latitude])
  const features: GeoJSON.Feature[] = []
  if (coordenadas.length >= 2) {
    features.push({
      type: 'Feature',
      properties: { tipo: 'linha' },
      geometry: { type: 'LineString', coordinates: coordenadas },
    })
  }
  if (coordenadas.length >= 1) {
    features.push({
      type: 'Feature',
      properties: { tipo: 'inicio' },
      geometry: { type: 'Point', coordinates: coordenadas[0] },
    })
  }
  if (coordenadas.length >= 2) {
    features.push({
      type: 'Feature',
      properties: { tipo: 'fim' },
      geometry: { type: 'Point', coordinates: coordenadas[coordenadas.length - 1] },
    })
  }
  return { type: 'FeatureCollection', features }
}

/** Fonte e camadas do trajeto, para injetar num estilo ou adicionar a um mapa já carregado. */
export function camadasDoTrajeto(cores: CoresTrajeto) {
  return [
    {
      id: CAMADA_CONTORNO,
      type: 'line' as const,
      source: FONTE_TRAJETO,
      filter: ['==', ['get', 'tipo'], 'linha'],
      layout: { 'line-join': 'round' as const, 'line-cap': 'round' as const },
      paint: { 'line-color': cores.contorno, 'line-width': 7 },
    },
    {
      id: CAMADA_LINHA,
      type: 'line' as const,
      source: FONTE_TRAJETO,
      filter: ['==', ['get', 'tipo'], 'linha'],
      layout: { 'line-join': 'round' as const, 'line-cap': 'round' as const },
      paint: { 'line-color': cores.linha, 'line-width': 4 },
    },
    {
      id: CAMADA_PONTAS,
      type: 'circle' as const,
      source: FONTE_TRAJETO,
      filter: ['!=', ['get', 'tipo'], 'linha'],
      paint: {
        'circle-radius': 7,
        'circle-color': ['match', ['get', 'tipo'], 'inicio', cores.inicio, cores.fim],
        'circle-stroke-color': cores.contorno,
        'circle-stroke-width': 2,
      },
    },
  ]
}

/** Estilo base com o trajeto por cima, sem alterar o objeto recebido. */
export function estiloComTrajeto(
  base: StyleSpecification,
  pontos: RoutePoint[],
  cores: CoresTrajeto,
): StyleSpecification {
  return {
    ...base,
    sources: {
      ...base.sources,
      [FONTE_TRAJETO]: { type: 'geojson', data: geojsonDoTrajeto(pontos) },
    },
    layers: [
      ...base.layers,
      ...(camadasDoTrajeto(cores) as unknown as StyleSpecification['layers']),
    ],
  }
}
