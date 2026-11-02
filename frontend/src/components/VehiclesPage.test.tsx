import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import VehiclesPage from './VehiclesPage'
import type { Vehicle } from '../types'

vi.mock('./FleetMap', () => ({
  default: () => <div data-testid="fleet-map-mock">FleetMap Mock</div>,
}))

describe('VehiclesPage (T-42 / Achado 1)', () => {
  const veiculoComPosicao: Vehicle = {
    id: 'v-1',
    plate: 'ABC-1234',
    model: 'Volvo FH',
    driverName: 'João Silva',
    status: 'em_rota',
    latitude: -23.55052,
    longitude: -46.63331,
    speed: 70,
    fuelLevel: 85,
    updatedAt: '2026-11-01T12:00:00Z',
  }

  const veiculoSemPosicao: Vehicle = {
    id: 'v-2',
    plate: 'XYZ-9876',
    model: 'Scania R450',
    driverName: 'Maria Santos',
    status: 'parado',
    latitude: null,
    longitude: null,
    speed: 0,
    fuelLevel: 45,
    updatedAt: '2026-11-01T12:00:00Z',
  }

  it('renderiza coordenadas formatadas com 4 casas decimais quando presentes', () => {
    render(<VehiclesPage vehicles={[veiculoComPosicao]} />)

    expect(screen.getByText('ABC-1234')).toBeDefined()
    expect(screen.getByText('-23.5505')).toBeDefined()
    expect(screen.getByText('-46.6333')).toBeDefined()
  })

  it('renderiza "sem dado" e não dispara exceção quando latitude e longitude vierem nulas', () => {
    render(<VehiclesPage vehicles={[veiculoSemPosicao]} />)

    expect(screen.getByText('XYZ-9876')).toBeDefined()
    const semDadoCells = screen.getAllByText('sem dado')
    // Uma célula para latitude e uma para longitude
    expect(semDadoCells).toHaveLength(2)
  })

  it('renderiza lista mista com veículos com posição e sem posição', () => {
    render(<VehiclesPage vehicles={[veiculoComPosicao, veiculoSemPosicao]} />)

    expect(screen.getByText('ABC-1234')).toBeDefined()
    expect(screen.getByText('-23.5505')).toBeDefined()
    expect(screen.getByText('-46.6333')).toBeDefined()

    expect(screen.getByText('XYZ-9876')).toBeDefined()
    const semDadoCells = screen.getAllByText('sem dado')
    expect(semDadoCells).toHaveLength(2)
  })
})
