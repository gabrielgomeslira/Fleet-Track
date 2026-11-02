import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CreditoMapa } from './CreditoMapa'
import { parseCreditoMapa } from './mapaUtils'

describe('CreditoMapa (T-81 / ADR-0016 / ODbL 1.0)', () => {
  describe('parseCreditoMapa', () => {
    it('faz parse dos pares texto|link e inclui obrigatoriamente o OpenStreetMap fixo', () => {
      const parsed = parseCreditoMapa(
        'OpenFreeMap|https://openfreemap.org;© OpenMapTiles|https://www.openmaptiles.org/',
      )

      expect(parsed).toEqual([
        { texto: 'OpenFreeMap', link: 'https://openfreemap.org' },
        { texto: '© OpenMapTiles', link: 'https://www.openmaptiles.org/' },
        { texto: '© OpenStreetMap', link: 'https://www.openstreetmap.org/copyright' },
      ])
    })

    it('descarta URLs que não sejam HTTPS (segurança SEC-01)', () => {
      const parsed = parseCreditoMapa(
        'Inseguro|http://example.com;Malicioso|javascript:alert(1);Valido|https://example.com',
      )

      expect(parsed[0]).toEqual({ texto: 'Inseguro', link: undefined })
      expect(parsed[1]).toEqual({ texto: 'Malicioso', link: undefined })
      expect(parsed[2]).toEqual({ texto: 'Valido', link: 'https://example.com' })
    })
  })

  describe('Componente CreditoMapa', () => {
    it('renderiza os links com target="_blank" e rel="noreferrer noopener"', () => {
      render(
        <CreditoMapa
          credit="OpenFreeMap|https://openfreemap.org;© OpenMapTiles|https://www.openmaptiles.org/"
          desligado={false}
        />,
      )

      const linkOfm = screen.getByRole('link', { name: 'OpenFreeMap' })
      expect(linkOfm.getAttribute('href')).toBe('https://openfreemap.org')
      expect(linkOfm.getAttribute('target')).toBe('_blank')
      expect(linkOfm.getAttribute('rel')).toContain('noopener')

      const linkOsm = screen.getByRole('link', { name: '© OpenStreetMap' })
      expect(linkOsm.getAttribute('href')).toBe('https://www.openstreetmap.org/copyright')
    })

    it('não renderiza nada quando desligado for true (fundo desativado por privacidade)', () => {
      const { container } = render(
        <CreditoMapa
          credit="OpenFreeMap|https://openfreemap.org"
          desligado={true}
        />,
      )

      expect(container.firstChild).toBeNull()
      expect(screen.queryByTestId('map-credit')).toBeNull()
    })
  })
})
