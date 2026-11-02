import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import VehicleTable from './VehicleTable'
import type { Vehicle } from '../types'

describe('VehicleTable — Tratamento de velocidade e combustível nulos (ADR-0017)', () => {
  const veiculoCompleto: Vehicle = {
    id: 'v-1',
    plate: 'ABC-1234',
    model: 'Volvo FH',
    driverName: 'Carlos Silva',
    status: 'em_rota',
    latitude: -23.55,
    longitude: -46.63,
    speed: 70,
    fuelLevel: 85,
    updatedAt: '2026-11-01T12:00:00Z',
  }

  const veiculoNulos: Vehicle = {
    id: 'v-2',
    plate: 'XYZ-9876',
    model: 'Scania R450',
    driverName: 'Mariana Costa',
    status: 'parado',
    latitude: null,
    longitude: null,
    speed: null,
    fuelLevel: null,
    updatedAt: '2026-11-01T12:00:00Z',
  }

  const veiculoZeros: Vehicle = {
    id: 'v-3',
    plate: 'ZER-0000',
    model: 'Mercedes Actros',
    driverName: 'Roberto Lima',
    status: 'parado',
    latitude: -23.55,
    longitude: -46.63,
    speed: 0,
    fuelLevel: 0,
    updatedAt: '2026-11-01T12:00:00Z',
  }

  it('formata velocidade e combustível normais com unidade e percentual', () => {
    render(<VehicleTable vehicles={[veiculoCompleto]} />)

    expect(screen.getByText('ABC-1234')).toBeDefined()
    expect(screen.getByText('70 km/h')).toBeDefined()
    expect(screen.getByText('85%')).toBeDefined()
  })

  it('renderiza "sem dado" para velocidade e combustível quando nulos', () => {
    render(<VehicleTable vehicles={[veiculoNulos]} />)

    expect(screen.getByText('XYZ-9876')).toBeDefined()
    const semDadoCells = screen.getAllByText('sem dado')
    expect(semDadoCells).toHaveLength(2)
  })

  it('preserva 0 real para velocidade (0 km/h) e combustível (0%)', () => {
    render(<VehicleTable vehicles={[veiculoZeros]} />)

    expect(screen.getByText('ZER-0000')).toBeDefined()
    expect(screen.getByText('0 km/h')).toBeDefined()
    expect(screen.getByText('0%')).toBeDefined()
  })
})
