import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatsCards from './StatsCards'
import type { DashboardStats } from '../types'

describe('StatsCards — Velocidade média nula (ADR-0017)', () => {
  const baseStats: DashboardStats = {
    totalVehicles: 10,
    enRoute: 4,
    stopped: 4,
    maintenance: 2,
    totalDeliveries: 50,
    delivered: 40,
    inTransit: 5,
    pending: 3,
    cancelled: 2,
    avgSpeed: 62.5,
    deliveryRate: 80,
    deliveriesPerDay: [],
  }

  it('exibe velocidade média formatada quando presente', () => {
    render(<StatsCards stats={baseStats} />)

    expect(screen.getByText('Vel. Média')).toBeDefined()
    expect(screen.getByText('62.5')).toBeDefined()
    expect(screen.getByText('km/h (em rota)')).toBeDefined()
  })

  it('exibe "sem dado" quando velocidade média for nula (sem veículos em rota ou sem telemetria)', () => {
    render(<StatsCards stats={{ ...baseStats, avgSpeed: null }} />)

    expect(screen.getByText('Vel. Média')).toBeDefined()
    expect(screen.getByText('sem dado')).toBeDefined()
  })

  it('preserva 0 real quando velocidade média for 0', () => {
    render(<StatsCards stats={{ ...baseStats, avgSpeed: 0 }} />)

    expect(screen.getByText('Vel. Média')).toBeDefined()
    expect(screen.getByText('0')).toBeDefined()
  })
})
