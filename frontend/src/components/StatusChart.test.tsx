import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusChart from './StatusChart'
import type { DashboardStats } from '../types'

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', MockResizeObserver)

const mockStats: DashboardStats = {
  totalVehicles: 42,
  enRoute: 28,
  stopped: 10,
  maintenance: 4,
  totalDeliveries: 100,
  delivered: 80,
  inTransit: 15,
  pending: 5,
  cancelled: 0,
  avgSpeed: 60,
  deliveryRate: 80,
  deliveriesPerDay: [],
}

describe('StatusChart — Disponibilidade da frota (T-80 / DS §5)', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 400,
      height: 240,
      top: 0,
      left: 0,
      bottom: 240,
      right: 400,
      x: 0,
      y: 0,
      toJSON: () => {},
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renderiza o título "Disponibilidade da frota"', () => {
    render(<StatusChart stats={mockStats} />)
    expect(
      screen.getByRole('heading', { level: 3, name: /disponibilidade da frota/i }),
    ).toBeDefined()
  })

  it('mostra o total de veículos no centro da rosca em Plex Mono', () => {
    render(<StatusChart stats={mockStats} />)
    const totalEl = screen.getByText('42')
    expect(totalEl).toBeDefined()
    expect(totalEl.style.fontFamily).toContain('Plex Mono')
  })

  it('exibe a legenda em texto no formato "28 em rota (67 %)" ao lado', () => {
    render(<StatusChart stats={mockStats} />)

    // Formato exato da especificação: 28 em rota (67 %)
    // 28 / 42 = 66.66% -> 67%
    // 10 / 42 = 23.8% -> 24%
    // 4 / 42 = 9.5% -> 10%
    const legend = screen.getByRole('list', { name: /legenda de status da frota/i })
    expect(legend).toBeDefined()

    expect(legend.textContent).toContain('28')
    expect(legend.textContent).toContain('em rota')
    expect(legend.textContent).toContain('(67 %)')

    expect(legend.textContent).toContain('10')
    expect(legend.textContent).toContain('parado')
    expect(legend.textContent).toContain('(24 %)')

    expect(legend.textContent).toContain('4')
    expect(legend.textContent).toContain('em manutenção')
    expect(legend.textContent).toContain('(10 %)')
  })

  it('legenda não depende de cor (contém texto descritivo e ícones Carbon)', () => {
    const { container } = render(<StatusChart stats={mockStats} />)

    const legendItems = container.querySelectorAll('.ft-availability-legend__item')
    expect(legendItems.length).toBe(3)

    for (const item of legendItems) {
      // Ícone presente
      const icon = item.querySelector('.ft-availability-legend__icon svg')
      expect(icon).not.toBeNull()

      // Indicador geométrico
      const indicator = item.querySelector('.ft-availability-legend__indicator')
      expect(indicator).not.toBeNull()

      // Texto completo com nome do status, quantidade e porcentagem
      const text = item.querySelector('.ft-availability-legend__text')
      expect(text?.textContent?.trim().length).toBeGreaterThan(0)
    }
  })
})
