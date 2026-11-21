import { describe, it, expect } from 'vitest'
import type { RoutePoint } from '../../types'
import {
  distanciaEntreKm,
  estiloComTrajeto,
  geojsonDoTrajeto,
  hojeLocal,
  limitesDoTrajeto,
  periodoDoDia,
  resumoTrajeto,
  FONTE_TRAJETO,
} from './trajeto'

const p = (
  latitude: number,
  longitude: number,
  recordedAt: string,
  speed: number | null = 50,
): RoutePoint => ({
  latitude,
  longitude,
  speed,
  fuelLevel: 70,
  recordedAt,
})

describe('trajeto', () => {
  it('formata o dia local como AAAA-MM-DD', () => {
    expect(hojeLocal(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })

  it('período do dia vai da meia-noite local à seguinte', () => {
    const periodo = periodoDoDia('2026-11-20')!
    expect(new Date(periodo.from).getTime()).toBe(new Date(2026, 10, 20).getTime())
    expect(new Date(periodo.to).getTime()).toBe(new Date(2026, 10, 21).getTime())
    expect(periodoDoDia('20/11/2026')).toBeNull()
    expect(periodoDoDia('')).toBeNull()
  })

  it('mede 1 grau de latitude como cerca de 111 km', () => {
    expect(distanciaEntreKm(p(0, 0, ''), p(1, 0, ''))).toBeCloseTo(111.19, 1)
  })

  it('resume distância, duração e velocidades, ignorando leituras nulas', () => {
    const resumo = resumoTrajeto([
      p(0, 0, '2026-11-20T10:00:00Z', 40),
      p(0.5, 0, '2026-11-20T10:45:00Z', null),
      p(1, 0, '2026-11-20T11:30:00Z', 80),
    ])
    expect(resumo.distanciaKm).toBeCloseTo(111.19, 1)
    expect(resumo.duracaoMin).toBe(90)
    expect(resumo.velocidadeMax).toBe(80)
    expect(resumo.velocidadeMedia).toBe(60)
  })

  it('sem pontos não inventa números', () => {
    expect(resumoTrajeto([])).toEqual({
      distanciaKm: 0,
      duracaoMin: 0,
      velocidadeMax: null,
      velocidadeMedia: null,
      inicio: null,
      fim: null,
    })
    expect(limitesDoTrajeto([])).toBeNull()
  })

  it('limites cobrem todos os pontos', () => {
    expect(limitesDoTrajeto([p(-23, -46, ''), p(-22, -47, '')])).toEqual([
      [-47, -23],
      [-46, -22],
    ])
  })

  it('geojson traz a linha em [lon, lat] e as pontas de início e fim', () => {
    const geo = geojsonDoTrajeto([p(-23, -46, ''), p(-22, -47, '')])
    expect(geo.features.map((f) => f.properties?.tipo)).toEqual(['linha', 'inicio', 'fim'])
    expect(geo.features[0].geometry).toEqual({
      type: 'LineString',
      coordinates: [
        [-46, -23],
        [-47, -22],
      ],
    })
    expect(geojsonDoTrajeto([p(-23, -46, '')]).features.map((f) => f.properties?.tipo)).toEqual([
      'inicio',
    ])
  })

  it('estilo com trajeto acrescenta fonte e camadas sem mexer no estilo base', () => {
    const base = {
      version: 8 as const,
      sources: {},
      layers: [{ id: 'background', type: 'background' as const }],
    }
    const estilo = estiloComTrajeto(base, [p(0, 0, ''), p(1, 1, '')], {
      linha: '#0f0',
      contorno: '#000',
      inicio: '#00f',
      fim: '#f00',
    })
    expect(Object.keys(estilo.sources)).toEqual([FONTE_TRAJETO])
    expect(estilo.layers.map((l) => l.id)).toEqual([
      'background',
      'trajeto-contorno',
      'trajeto-linha',
      'trajeto-pontas',
    ])
    expect(base.layers).toHaveLength(1)
    expect(base.sources).toEqual({})
  })
})
