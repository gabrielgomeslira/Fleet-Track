import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import * as sass from 'sass-embedded'
import { getStatusConfig } from './status'
import StatusBadge from './components/StatusBadge'

describe('Fonte única de status e StatusBadge (T-79 / DS §4.1, H-21, H-22)', () => {
  const rootDir = process.cwd()
  const valoresContrato = [
    'em_rota',
    'parado',
    'manutencao',
    'pendente',
    'em_transito',
    'entregue',
    'cancelado',
    'ativa',
    'revogada',
  ]

  describe('Integridade do catálogo de status', () => {
    it.each(valoresContrato)(
      'o status "%s" tem rótulo, tagType e ícone definidos (Achado 6)',
      (status) => {
        const config = getStatusConfig(status)
        expect(config.label).toBeDefined()
        expect(typeof config.label).toBe('string')
        expect(config.label.trim().length).toBeGreaterThan(0)

        expect(config.tagType).toBeDefined()
        expect(typeof config.tagType).toBe('string')

        expect(config.icon).toBeDefined()
        expect(typeof config.icon).toBe('object')
      },
    )

    it('status "parado" utiliza type="gray" e classe "ft-tag--parado" (C6 / DS §4.1)', () => {
      const config = getStatusConfig('parado')
      expect(config.tagType).toBe('gray')
      expect(config.className).toBe('ft-tag--parado')
    })

    it('status de veículos mapeiam cores semânticas para gráfico e mapa (DS §4.1)', () => {
      const emRota = getStatusConfig('em_rota')
      expect(emRota.chartColor).toBe('var(--ft-chart-enroute)')
      expect(emRota.mapMarkerColor).toBe('var(--ft-map-marker-enroute)')

      const parado = getStatusConfig('parado')
      expect(parado.chartColor).toBe('var(--ft-chart-stopped)')
      expect(parado.mapMarkerColor).toBe('var(--ft-map-marker-stopped)')

      const manutencao = getStatusConfig('manutencao')
      expect(manutencao.chartColor).toBe('var(--ft-chart-maintenance)')
      expect(manutencao.mapMarkerColor).toBe('var(--ft-map-marker-maintenance)')
    })

    it('status desconhecido não lança exceção e devolve rótulo cru com type="gray"', () => {
      expect(() => getStatusConfig('status_inexistente')).not.toThrow()
      const config = getStatusConfig('status_inexistente')
      expect(config.label).toBe('status_inexistente')
      expect(config.tagType).toBe('gray')
      expect(config.icon).toBeDefined()
    })

    it('trata valores nulos e vazios sem quebrar', () => {
      expect(() => getStatusConfig(null)).not.toThrow()
      expect(() => getStatusConfig('')).not.toThrow()
      expect(getStatusConfig(null).tagType).toBe('gray')
      expect(getStatusConfig('').tagType).toBe('gray')
    })
  })

  describe('Componente StatusBadge (Carbon Tag + Ícone + Rótulo)', () => {
    it('renderiza o badge com o texto e classes Carbon para "em_rota"', () => {
      const { container } = render(React.createElement(StatusBadge, { status: 'em_rota' }))
      expect(screen.getByText('Em Rota')).toBeDefined()

      const tag = container.querySelector('.cds--tag')
      expect(tag).not.toBeNull()
      expect(tag?.classList.contains('cds--tag--cyan')).toBe(true)
      expect(tag?.classList.contains('cds--tag--sm')).toBe(true)
      expect(getStatusConfig('em_rota').icon).toBeDefined()
    })

    it('renderiza o badge com a classe customizada para "parado"', () => {
      const { container } = render(React.createElement(StatusBadge, { status: 'parado' }))
      expect(screen.getByText('Parado')).toBeDefined()

      const tag = container.querySelector('.cds--tag')
      expect(tag).not.toBeNull()
      expect(tag?.classList.contains('cds--tag--gray')).toBe(true)
      expect(tag?.classList.contains('ft-tag--parado')).toBe(true)
    })

    it('renderiza badge desconhecido sem quebrar e com rótulo cru', () => {
      const { container } = render(React.createElement(StatusBadge, { status: 'custom_status' }))
      expect(screen.getByText('custom_status')).toBeDefined()

      const tag = container.querySelector('.cds--tag')
      expect(tag).not.toBeNull()
      expect(tag?.classList.contains('cds--tag--gray')).toBe(true)
    })
  })

  describe('Estilos e tokens do Tag Carbon (Sass e CSS)', () => {
    it('carbon.scss inclui @use de tag do Carbon', () => {
      const carbonPath = path.resolve(rootDir, 'src/styles/carbon.scss')
      const content = fs.readFileSync(carbonPath, 'utf-8')
      expect(content).toMatch(/@use\s+['"]@carbon\/styles\/scss\/components\/tag['"]/)
    })

    it('overrides.scss define raio 0 para .cds--tag (DS §6) e regras para .ft-tag--parado', () => {
      const overridesPath = path.resolve(rootDir, 'src/styles/overrides.scss')
      const content = fs.readFileSync(overridesPath, 'utf-8')

      expect(content).toMatch(/\.cds--tag\s*\{[^}]*border-radius:\s*0;/)
      expect(content).toContain('.ft-tag--parado')
      expect(content).toContain('var(--ft-tag-yellow-bg)')
      expect(content).toContain('var(--ft-tag-yellow-text)')
      expect(content).toContain('var(--ft-tag-yellow-border)')
    })

    it('ft-tokens.scss define variáveis yellow e markers nos dois temas', () => {
      const ftTokensPath = path.resolve(rootDir, 'src/styles/ft-tokens.scss')
      const content = fs.readFileSync(ftTokensPath, 'utf-8')

      // g100
      expect(content).toContain('--ft-tag-yellow-bg: #483c00')
      expect(content).toContain('--ft-tag-yellow-text: #f1c21b')
      expect(content).toContain('--ft-tag-yellow-border: #8a6d00')

      // g10
      expect(content).toContain('--ft-tag-yellow-bg: #fcf4d6')
      expect(content).toContain('--ft-tag-yellow-text: #684e00')
      expect(content).toContain('--ft-tag-yellow-border: #f1c21b')
    })

    it('compilação do Sass emite tokens do Tag nos temas escuro e claro (recolore com a tela aberta)', () => {
      const carbonPath = path.resolve(rootDir, 'src/styles/carbon.scss')
      const compiled = sass.compile(carbonPath, {
        loadPaths: [path.resolve(rootDir, 'node_modules')],
      })

      const css = compiled.css

      // Component tokens de Tag emitidos nos seletores de tema
      expect(css).toContain('--cds-tag-background-cyan')
      expect(css).toContain('--cds-tag-color-cyan')

      // Raio 0 emitido
      expect(css).toMatch(/\.cds--tag\s*\{[^}]*border-radius:\s*0/)
    })
  })
})
