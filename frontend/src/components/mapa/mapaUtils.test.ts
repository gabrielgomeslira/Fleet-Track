import { describe, it, expect } from 'vitest'
import {
  LIMITES_BRASIL,
  MARGEM_ENQUADRAMENTO_PADRAO,
  calcularLimitesBrasilOuFrota,
  type PosicaoCoordenada,
} from './mapaUtils'

describe('mapaUtils - Enquadramento Inicial pelo Brasil (ADR-0016 / T-94)', () => {
  it('define os limites geográficos padrão do Brasil com margem adequada', () => {
    expect(LIMITES_BRASIL).toEqual([
      [-73.99, -33.75],
      [-34.79, 5.27],
    ])
    expect(MARGEM_ENQUADRAMENTO_PADRAO).toBe(24)
  })

  it('retorna os limites do Brasil quando a frota estiver vazia ou indefinida', () => {
    expect(calcularLimitesBrasilOuFrota()).toEqual(LIMITES_BRASIL)
    expect(calcularLimitesBrasilOuFrota([])).toEqual(LIMITES_BRASIL)
  })

  it('retorna os limites do Brasil quando todos os veículos estiverem dentro do território nacional', () => {
    const veiculosNoBrasil: PosicaoCoordenada[] = [
      { latitude: -23.5505, longitude: -46.6333 }, // São Paulo
      { latitude: -22.9068, longitude: -43.1729 }, // Rio de Janeiro
      { latitude: -30.0346, longitude: -51.2177 }, // Porto Alegre
      { latitude: -3.7172, longitude: -38.5433 }, // Fortaleza
      { latitude: -15.7801, longitude: -47.9292 }, // Brasília
    ]

    const limites = calcularLimitesBrasilOuFrota(veiculosNoBrasil)
    expect(limites).toEqual(LIMITES_BRASIL)
  })

  it('ignora veículos com coordenadas nulas, indefinidas ou NaN', () => {
    const veiculosInvalidos: PosicaoCoordenada[] = [
      { latitude: null, longitude: null },
      { latitude: NaN, longitude: -46.63 },
      { latitude: -23.55, longitude: NaN },
      { latitude: null, longitude: -46.63 },
    ]

    expect(calcularLimitesBrasilOuFrota(veiculosInvalidos)).toEqual(LIMITES_BRASIL)
  })

  it('amplia os limites somente quando algum veículo estiver fora das fronteiras brasileiras', () => {
    // Veículo mais ao sul que o Chuí (ex: Buenos Aires, lat -34.6)
    const veiculoSul: PosicaoCoordenada[] = [{ latitude: -36.5, longitude: -54.0 }]
    const limitesSul = calcularLimitesBrasilOuFrota(veiculoSul)
    expect(limitesSul[0][1]).toBe(-36.5) // minLat expandiu
    expect(limitesSul[0][0]).toBe(-73.99) // minLng inalterado
    expect(limitesSul[1][1]).toBe(5.27) // maxLat inalterado

    // Veículo mais a leste que Ponta do Seixas (ex: Fernando de Noronha, lng -32.42)
    const veiculoLeste: PosicaoCoordenada[] = [{ latitude: -3.85, longitude: -32.42 }]
    const limitesLeste = calcularLimitesBrasilOuFrota(veiculoLeste)
    expect(limitesLeste[1][0]).toBe(-32.42) // maxLng expandiu
    expect(limitesLeste[0][0]).toBe(-73.99) // minLng inalterado

    // Veículo mais a oeste que o Acre (ex: Peru, lng -76.5)
    const veiculoOeste: PosicaoCoordenada[] = [{ latitude: -9.0, longitude: -76.5 }]
    const limitesOeste = calcularLimitesBrasilOuFrota(veiculoOeste)
    expect(limitesOeste[0][0]).toBe(-76.5) // minLng expandiu

    // Veículo mais ao norte que Monte Caburaí (ex: Caribe, lat 8.0)
    const veiculoNorte: PosicaoCoordenada[] = [{ latitude: 8.0, longitude: -60.0 }]
    const limitesNorte = calcularLimitesBrasilOuFrota(veiculoNorte)
    expect(limitesNorte[1][1]).toBe(8.0) // maxLat expandiu
  })
})
