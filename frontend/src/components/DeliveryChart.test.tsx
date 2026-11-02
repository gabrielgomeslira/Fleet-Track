import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import DeliveryChart from './DeliveryChart'
import type { DashboardStats } from '../types'
import { readThemeTokens } from '../theme/useThemeTokens'

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', MockResizeObserver)

const mockStats: DashboardStats = {
  totalVehicles: 10,
  enRoute: 5,
  stopped: 3,
  maintenance: 2,
  totalDeliveries: 50,
  delivered: 40,
  inTransit: 8,
  pending: 2,
  cancelled: 0,
  avgSpeed: 62.5,
  deliveryRate: 80,
  deliveriesPerDay: [
    { date: '2026-10-30', count: 14 },
    { date: '2026-10-31', count: 18 },
  ],
}

describe('DeliveryChart (T-80 / DS §5)', () => {
  it('renderiza título e barras de entregas concluídas por dia', () => {
    render(<DeliveryChart stats={mockStats} />)
    expect(
      screen.getByRole('heading', { level: 3, name: /entregas por dia/i }),
    ).toBeDefined()
  })

  it('utiliza o verde de Tag entregue (--ft-dataviz-4) para a série e não o roxo de entregas', () => {
    const darkTokens = readThemeTokens('dark')
    const lightTokens = readThemeTokens('light')

    // --ft-dataviz-4 é verde (#42be65 no g100 e #198038 no g10)
    // --ft-chart-deliveries é roxo (#be95ff no g100 e #8a3ffc no g10)
    expect(darkTokens.dataviz4).toBe('#42be65')
    expect(darkTokens.dataviz4).not.toBe(darkTokens.chartDeliveries)

    expect(lightTokens.dataviz4).toBe('#198038')
    expect(lightTokens.dataviz4).not.toBe(lightTokens.chartDeliveries)
  })
})
