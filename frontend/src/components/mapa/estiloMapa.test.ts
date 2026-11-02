import { describe, it, expect } from 'vitest'
import {
  estiloMapa,
  MAP_TOKENS_DARK,
  MAP_TOKENS_LIGHT,
  ALLOWED_SOURCE_LAYERS,
  ALLOWED_SOURCES,
  ALLOWED_FONTS,
  ALLOWED_CLASSES_TRANSPORTATION,
  PROHIBITED_SOURCE_LAYERS,
  PROHIBITED_CLASSES_TRANSPORTATION,
} from './estiloMapa'
import type { MapaConfig } from './configMapa'

describe('Estilo do Mapa (T-93 / ADR-0016 itens 3 e 4; DS §6)', () => {
  const configValida: MapaConfig = {
    desligado: false,
    tilejsonUrl: 'https://tiles.openfreemap.org/planet',
    glyphsUrl: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    styleUrl: '',
    credit: 'OpenFreeMap|https://openfreemap.org',
  }

  describe('Teste de lista (ADR-0016 item 3)', () => {
    it('o estilo não declara sprite', () => {
      const estilo = estiloMapa(MAP_TOKENS_DARK, configValida)
      expect((estilo as unknown as Record<string, unknown>).sprite).toBeUndefined()
    })

    it('o estilo possui transição imediata para troca de tema em < 100 ms', () => {
      const estilo = estiloMapa(MAP_TOKENS_DARK, configValida)
      expect(estilo.transition).toEqual({ duration: 0, delay: 0 })
    })

    it('todas as fontes do estilo pertencem estritamente à lista do ADR (apenas "base")', () => {
      const estilo = estiloMapa(MAP_TOKENS_DARK, configValida)
      const sourceKeys = Object.keys(estilo.sources)

      expect(sourceKeys).toEqual(['base'])
      expect(sourceKeys.every((src) => ALLOWED_SOURCES.includes(src as (typeof ALLOWED_SOURCES)[number]))).toBe(true)

      // Nenhuma fonte de relevo raster permitida
      expect(sourceKeys).not.toContain('ne2_shaded')
    })

    it('todas as camadas com fonte pertencem estritamente às source-layers permitidas pelo ADR', () => {
      const estilo = estiloMapa(MAP_TOKENS_DARK, configValida)

      for (const layer of estilo.layers) {
        if ('source-layer' in layer && layer['source-layer']) {
          const sourceLayer = layer['source-layer']
          expect(
            ALLOWED_SOURCE_LAYERS.includes(sourceLayer as (typeof ALLOWED_SOURCE_LAYERS)[number]),
            `Camada "${layer.id}" usa source-layer não permitida: "${sourceLayer}"`,
          ).toBe(true)

          expect(
            PROHIBITED_SOURCE_LAYERS.includes(sourceLayer as (typeof PROHIBITED_SOURCE_LAYERS)[number]),
            `Camada "${layer.id}" usa source-layer expressamente proibida: "${sourceLayer}"`,
          ).toBe(false)
        }
      }
    })

    it('nenhuma camada declara vegetação, uso do solo, relevo, prédios ou POIs', () => {
      const estilo = estiloMapa(MAP_TOKENS_DARK, configValida)
      const layers = estilo.layers

      for (const prohibited of PROHIBITED_SOURCE_LAYERS) {
        const found = layers.some(
          (l) => 'source-layer' in l && l['source-layer'] === prohibited,
        )
        expect(found, `Encontrada camada proibida no estilo: "${prohibited}"`).toBe(false)
      }
    })

    it('todas as tipografias declaradas utilizam exclusivamente famílias Noto Sans', () => {
      const estilo = estiloMapa(MAP_TOKENS_DARK, configValida)

      for (const layer of estilo.layers) {
        if (layer.type === 'symbol' && layer.layout && 'text-font' in layer.layout) {
          const fonts = layer.layout['text-font'] as string[]
          expect(Array.isArray(fonts)).toBe(true)
          for (const f of fonts) {
            expect(
              ALLOWED_FONTS.includes(f as (typeof ALLOWED_FONTS)[number]),
              `Fonte não autorizada encontrada na camada "${layer.id}": "${f}"`,
            ).toBe(true)
          }
        }
      }
    })
  })

  describe('Temas Carbon Escuro (g100) e Claro (g10)', () => {
    it('os dois temas geram estilos válidos com cores diferentes em conformidade com o DS §6.1', () => {
      const estiloEscuro = estiloMapa(MAP_TOKENS_DARK, configValida)
      const estiloClaro = estiloMapa(MAP_TOKENS_LIGHT, configValida)

      expect(estiloEscuro.version).toBe(8)
      expect(estiloClaro.version).toBe(8)
      expect(estiloEscuro.layers.length).toBe(estiloClaro.layers.length)

      // Terra (background)
      const bgEscuro = estiloEscuro.layers.find((l) => l.id === 'background')
      const bgClaro = estiloClaro.layers.find((l) => l.id === 'background')
      expect((bgEscuro?.paint as Record<string, unknown>)?.['background-color']).toBe('#161616')
      expect((bgClaro?.paint as Record<string, unknown>)?.['background-color']).toBe('#f4f4f4')

      // Água (water)
      const waterEscuro = estiloEscuro.layers.find((l) => l.id === 'water')
      const waterClaro = estiloClaro.layers.find((l) => l.id === 'water')
      expect((waterEscuro?.paint as Record<string, unknown>)?.['fill-color']).toBe('#12161a')
      expect((waterClaro?.paint as Record<string, unknown>)?.['fill-color']).toBe('#cfdde6')

      // Divisas (boundary)
      const bEscuro = estiloEscuro.layers.find((l) => l.id === 'boundary_country')
      const bClaro = estiloClaro.layers.find((l) => l.id === 'boundary_country')
      expect((bEscuro?.paint as Record<string, unknown>)?.['line-color']).toBe('#6f6f6f')
      expect((bClaro?.paint as Record<string, unknown>)?.['line-color']).toBe('#8d8d8d')

      // Rodovia (transportation)
      const rEscuro = estiloEscuro.layers.find((l) => l.id === 'transportation_motorway_trunk')
      const rClaro = estiloClaro.layers.find((l) => l.id === 'transportation_motorway_trunk')
      expect((rEscuro?.paint as Record<string, unknown>)?.['line-color']).toBe('#525252')
      expect((rClaro?.paint as Record<string, unknown>)?.['line-color']).toBe('#ffffff')

      // Contorno viário (casing)
      const cEscuro = estiloEscuro.layers.find((l) => l.id === 'transportation_casing_motorway_trunk')
      const cClaro = estiloClaro.layers.find((l) => l.id === 'transportation_casing_motorway_trunk')
      expect((cEscuro?.paint as Record<string, unknown>)?.['line-color']).toBe('#262626')
      expect((cClaro?.paint as Record<string, unknown>)?.['line-color']).toBe('#c6c6c6')
    })
  })

  describe('Filtros de Malha Viária e Rótulos (transportation e transportation_name)', () => {
    it('transportation_name entra só a partir do z14 e apenas nas classes permitidas', () => {
      const estilo = estiloMapa(MAP_TOKENS_DARK, configValida)
      const nameLayers = estilo.layers.filter(
        (l) => 'source-layer' in l && l['source-layer'] === 'transportation_name',
      )

      expect(nameLayers.length).toBeGreaterThan(0)

      for (const layer of nameLayers) {
        expect(layer.minzoom).toBeGreaterThanOrEqual(14)

        const filterStr = JSON.stringify('filter' in layer ? layer.filter : undefined)
        // Deve permitir as classes autorizadas
        for (const cls of ALLOWED_CLASSES_TRANSPORTATION) {
          expect(filterStr).toContain(cls)
        }
        // Não deve conter classes proibidas
        for (const cls of PROHIBITED_CLASSES_TRANSPORTATION) {
          expect(filterStr).not.toContain(`"${cls}"`)
        }
      }
    })

    it('todas as camadas de rótulo utilizam a expressão coalesce(name:pt, name:latin, name)', () => {
      const estilo = estiloMapa(MAP_TOKENS_DARK, configValida)
      const symbolLayers = estilo.layers.filter((l) => l.type === 'symbol')

      expect(symbolLayers.length).toBeGreaterThan(0)

      const expectedCoalesce = ['coalesce', ['get', 'name:pt'], ['get', 'name:latin'], ['get', 'name']]

      for (const layer of symbolLayers) {
        if (layer.layout && 'text-field' in layer.layout) {
          expect(layer.layout['text-field']).toEqual(expectedCoalesce)
        }
      }
    })

    it('zooms de place seguem estritamente a especificação do ADR', () => {
      const estilo = estiloMapa(MAP_TOKENS_DARK, configValida)

      const country = estilo.layers.find((l) => l.id === 'place_country')
      expect(country?.maxzoom).toBeLessThanOrEqual(4)

      const state = estilo.layers.find((l) => l.id === 'place_state')
      expect(state?.minzoom).toBe(4)
      expect(state?.maxzoom).toBe(6)

      const city = estilo.layers.find((l) => l.id === 'place_city')
      expect(city?.minzoom).toBe(3)

      const town = estilo.layers.find((l) => l.id === 'place_town')
      expect(town?.minzoom).toBe(8)

      const villageSuburb = estilo.layers.find((l) => l.id === 'place_village_suburb')
      expect(villageSuburb?.minzoom).toBe(11)
    })
  })

  describe('Fundo desligado e Substituição por MAP_STYLE_URL', () => {
    it('com fundo desligado, gera estilo liso de contingência sem fontes de terceiros', () => {
      const estilo = estiloMapa(MAP_TOKENS_DARK, { desligado: true })

      expect(estilo.sources).toEqual({})
      expect(estilo.glyphs).toBeUndefined()
      expect(estilo.layers.length).toBe(1)
      expect(estilo.layers[0].id).toBe('background')
      expect((estilo.layers[0].paint as Record<string, unknown>)['background-color']).toBe('#161616')
    })

    it('falha fechada para estilo liso de contingência se config for omitida ou incompleta', () => {
      // Sem config
      const estiloSemConfig = estiloMapa(MAP_TOKENS_DARK)
      expect(estiloSemConfig.sources).toEqual({})
      expect(estiloSemConfig.glyphs).toBeUndefined()
      expect(estiloSemConfig.layers.length).toBe(1)
      expect(estiloSemConfig.layers[0].id).toBe('background')

      // Config sem glyphsUrl
      const estiloIncompleto = estiloMapa(MAP_TOKENS_DARK, {
        tilejsonUrl: 'https://tiles.openfreemap.org/planet',
      })
      expect(estiloIncompleto.sources).toEqual({})
      expect(estiloIncompleto.glyphs).toBeUndefined()
      expect(estiloIncompleto.layers.length).toBe(1)
    })

    it('MAP_STYLE_URL definida substitui TileJSON e glifos', () => {
      const estilo = estiloMapa(MAP_TOKENS_DARK, {
        desligado: false,
        styleUrl: 'https://mapas.empresa.com.br/estilo.json',
        tilejsonUrl: 'https://tiles.openfreemap.org/planet',
        glyphsUrl: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      })

      // Não declara a fonte TileJSON padrão nem os glifos padrão
      expect(estilo.sources).toEqual({})
      expect(estilo.glyphs).toBeUndefined()
    })
  })
})
