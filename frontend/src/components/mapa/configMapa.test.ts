import { describe, it, expect, vi } from 'vitest'
import {
  validarConfigMapa,
  carregarConfigMapa,
  isValidHttpsUrl,
  isValidGlyphsUrl,
  sanitizarCreditoMapa,
} from './configMapa'

describe('Configuração do Mapa (T-93 / ADR-0016 itens 2 e 5)', () => {
  const jsonValidoPadrao = {
    tilejsonUrl: 'https://tiles.openfreemap.org/planet',
    glyphsUrl: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    styleUrl: '',
    credit: 'OpenFreeMap|https://openfreemap.org;© OpenMapTiles|https://www.openmaptiles.org/',
  }

  describe('Validação de URLs HTTPS e Glifos (SEC-01)', () => {
    it('isValidHttpsUrl aceita URLs HTTPS válidas e rejeita HTTP ou protocolos inseguros', () => {
      expect(isValidHttpsUrl('https://tiles.openfreemap.org/planet')).toBe(true)
      expect(isValidHttpsUrl('https://custom.cdn.io/tiles')).toBe(true)

      expect(isValidHttpsUrl('http://tiles.openfreemap.org/planet')).toBe(false)
      expect(isValidHttpsUrl('ftp://tiles.org')).toBe(false)
      expect(isValidHttpsUrl('javascript:alert(1)')).toBe(false)
      expect(isValidHttpsUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
      expect(isValidHttpsUrl('')).toBe(false)
      expect(isValidHttpsUrl(null)).toBe(false)
      expect(isValidHttpsUrl(undefined)).toBe(false)
    })

    it('isValidHttpsUrl rejeita URLs contendo credenciais embutidas (SEC-01)', () => {
      expect(isValidHttpsUrl('https://user:pass@tiles.openfreemap.org/planet')).toBe(false)
      expect(isValidHttpsUrl('https://admin@tiles.openfreemap.org/planet')).toBe(false)
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

    it('isValidGlyphsUrl rejeita templates sem os placeholders obrigatórios, com credenciais ou com variáveis ${...}', () => {
      expect(isValidGlyphsUrl('https://tiles.openfreemap.org/fonts/{fontstack}.pbf')).toBe(false)
      expect(isValidGlyphsUrl('https://tiles.openfreemap.org/fonts/{range}.pbf')).toBe(false)
      expect(isValidGlyphsUrl('https://tiles.openfreemap.org/fonts/${fontstack}/${range}.pbf')).toBe(false)
      expect(
        isValidGlyphsUrl('https://user:pass@tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'),
      ).toBe(false)
    })
  })

  describe('Sanitização de Créditos do Mapa (SEC-01)', () => {
    it('preserva pares com links HTTPS válidos', () => {
      const input = 'OpenFreeMap|https://openfreemap.org;© OpenMapTiles|https://www.openmaptiles.org/'
      expect(sanitizarCreditoMapa(input)).toBe(input)
    })

    it('rejeita link javascript: e preserva apenas o texto do crédito', () => {
      const input = 'OpenFreeMap|javascript:alert(1)'
      expect(sanitizarCreditoMapa(input)).toBe('OpenFreeMap')
    })

    it('rejeita link http: e data: preservando apenas o texto do crédito', () => {
      const input = 'Inseguro|http://exemplo.com;Payload|data:text/html,<script>evil()</script>'
      expect(sanitizarCreditoMapa(input)).toBe('Inseguro;Payload')
    })

    it('sanitiza múltiplos pares mistos preservando válidos e limpando inválidos', () => {
      const input =
        'OpenFreeMap|javascript:alert(1);© OpenMapTiles|https://www.openmaptiles.org/;ApenasTexto'
      expect(sanitizarCreditoMapa(input)).toBe(
        'OpenFreeMap;© OpenMapTiles|https://www.openmaptiles.org/;ApenasTexto',
      )
    })

    it('remove espaços excedentes nos textos e links', () => {
      const input = '  OpenFreeMap  |  https://openfreemap.org  ;  Inválido  |  http://foo.bar  '
      expect(sanitizarCreditoMapa(input)).toBe('OpenFreeMap|https://openfreemap.org;Inválido')
    })

    it('lida graciosamente com entradas vazias, nulas ou não-string', () => {
      expect(sanitizarCreditoMapa('')).toBe('')
      expect(sanitizarCreditoMapa(null)).toBe('')
      expect(sanitizarCreditoMapa(undefined)).toBe('')
      expect(sanitizarCreditoMapa(123)).toBe('')
    })

    it('validarConfigMapa aplica sanitização ao campo credit', () => {
      const config = validarConfigMapa({
        ...jsonValidoPadrao,
        credit: 'OpenFreeMap|javascript:alert(document.cookie);OpenStreetMap|https://osm.org',
      })
      expect(config.credit).toBe('OpenFreeMap;OpenStreetMap|https://osm.org')
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
