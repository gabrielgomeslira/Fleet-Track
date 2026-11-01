import { describe, it, expect, vi } from 'vitest'
import {
  validarConfigMapa,
  carregarConfigMapa,
  isValidHttpsUrl,
  isValidGlyphsUrl,
} from './configMapa'

describe('Configuração do Mapa (T-93 / ADR-0016 itens 2 e 5)', () => {
  const jsonValidoPadrao = {
    tilejsonUrl: 'https://tiles.openfreemap.org/planet',
    glyphsUrl: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    styleUrl: '',
    credit: 'OpenFreeMap|https://openfreemap.org;© OpenMapTiles|https://www.openmaptiles.org/',
  }

  describe('Validação de URLs HTTPS e Glifos', () => {
    it('isValidHttpsUrl aceita URLs HTTPS válidas e rejeita HTTP ou inválidas', () => {
      expect(isValidHttpsUrl('https://tiles.openfreemap.org/planet')).toBe(true)
      expect(isValidHttpsUrl('https://custom.cdn.io/tiles')).toBe(true)

      expect(isValidHttpsUrl('http://tiles.openfreemap.org/planet')).toBe(false)
      expect(isValidHttpsUrl('ftp://tiles.org')).toBe(false)
      expect(isValidHttpsUrl('javascript:alert(1)')).toBe(false)
      expect(isValidHttpsUrl('')).toBe(false)
      expect(isValidHttpsUrl(null)).toBe(false)
      expect(isValidHttpsUrl(undefined)).toBe(false)
    })

    it('isValidGlyphsUrl aceita templates de glifos HTTPS com placeholders {fontstack} e {range}', () => {
      expect(
        isValidGlyphsUrl('https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'),
      ).toBe(true)
      expect(isValidGlyphsUrl('http://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf')).toBe(
        false,
      )
      expect(isValidGlyphsUrl('')).toBe(false)
    })
  })

  describe('Falha Fechada (ADR-0016 item 2)', () => {
    it('arquivo ausente (404) resulta em fundo desligado', async () => {
      const mockFetcher = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      } as unknown as Response)

      const config = await carregarConfigMapa('/config/mapa.json', mockFetcher)

      expect(config.desligado).toBe(true)
      expect(config.tilejsonUrl).toBe('')
      expect(config.glyphsUrl).toBe('')
      expect(config.styleUrl).toBe('')
    })

    it('erro de rede (falha na requisição) resulta em fundo desligado', async () => {
      const mockFetcher = vi.fn().mockRejectedValue(new Error('Network error'))

      const config = await carregarConfigMapa('/config/mapa.json', mockFetcher)

      expect(config.desligado).toBe(true)
      expect(config.tilejsonUrl).toBe('')
    })

    it('JSON inválido ou corrompido resulta em fundo desligado', async () => {
      const mockFetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new SyntaxError('Unexpected token in JSON')),
      } as unknown as Response)

      const config = await carregarConfigMapa('/config/mapa.json', mockFetcher)

      expect(config.desligado).toBe(true)
      expect(config.tilejsonUrl).toBe('')
    })

    it('tilejsonUrl com protocolo HTTP inseguro resulta em fundo desligado', () => {
      const config = validarConfigMapa({
        ...jsonValidoPadrao,
        tilejsonUrl: 'http://tiles.openfreemap.org/planet',
      })

      expect(config.desligado).toBe(true)
      expect(config.tilejsonUrl).toBe('')
    })

    it('glyphsUrl com protocolo HTTP inseguro resulta em fundo desligado', () => {
      const config = validarConfigMapa({
        ...jsonValidoPadrao,
        glyphsUrl: 'http://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      })

      expect(config.desligado).toBe(true)
      expect(config.glyphsUrl).toBe('')
    })

    it('tilejsonUrl vazia desliga o fundo por determinação de quem instala', () => {
      const config = validarConfigMapa({
        ...jsonValidoPadrao,
        tilejsonUrl: '',
      })

      expect(config.desligado).toBe(true)
      expect(config.tilejsonUrl).toBe('')
    })

    it('MAP_STYLE_URL com protocolo HTTP inseguro resulta em fundo desligado', () => {
      const config = validarConfigMapa({
        ...jsonValidoPadrao,
        styleUrl: 'http://empresa.com.br/estilo.json',
      })

      expect(config.desligado).toBe(true)
      expect(config.styleUrl).toBe('')
    })

    it('valores nulos, indefinidos ou de tipos incorretos resultam em fundo desligado', () => {
      expect(validarConfigMapa(null).desligado).toBe(true)
      expect(validarConfigMapa(undefined).desligado).toBe(true)
      expect(validarConfigMapa('string').desligado).toBe(true)
      expect(validarConfigMapa(123).desligado).toBe(true)
      expect(validarConfigMapa({}).desligado).toBe(true)
    })

    it('nunca há URL externa de reserva em caso de falha', () => {
      const configFalha = validarConfigMapa({ tilejsonUrl: 'invalido' })
      expect(configFalha.tilejsonUrl).toBe('')
      expect(configFalha.glyphsUrl).toBe('')
      expect(configFalha.styleUrl).toBe('')
      expect(configFalha.desligado).toBe(true)
    })
  })

  describe('Substituição por MAP_STYLE_URL', () => {
    it('MAP_STYLE_URL definida e válida substitui TileJSON e glifos', () => {
      const config = validarConfigMapa({
        tilejsonUrl: 'https://tiles.openfreemap.org/planet',
        glyphsUrl: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
        styleUrl: 'https://estilos.empresa.com.br/mapa/style.json',
        credit: 'Provedor Corporativo|https://empresa.com.br',
      })

      expect(config.desligado).toBe(false)
      expect(config.styleUrl).toBe('https://estilos.empresa.com.br/mapa/style.json')
      // Substitui as duas acima:
      expect(config.tilejsonUrl).toBe('')
      expect(config.glyphsUrl).toBe('')
      expect(config.credit).toBe('Provedor Corporativo|https://empresa.com.br')
    })
  })

  describe('Configuração Válida Padrão', () => {
    it('carrega e valida o JSON padrão com sucesso', async () => {
      const mockFetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(jsonValidoPadrao),
      } as unknown as Response)

      const config = await carregarConfigMapa('/config/mapa.json', mockFetcher)

      expect(config.desligado).toBe(false)
      expect(config.tilejsonUrl).toBe('https://tiles.openfreemap.org/planet')
      expect(config.glyphsUrl).toBe(
        'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      )
      expect(config.styleUrl).toBe('')
      expect(config.credit).toBe(
        'OpenFreeMap|https://openfreemap.org;© OpenMapTiles|https://www.openmaptiles.org/',
      )
    })
  })
})
