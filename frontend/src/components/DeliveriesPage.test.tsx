import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import DeliveriesPage from './DeliveriesPage'
import { api } from '../api'
import type { Delivery } from '../types'

vi.mock('../api', () => ({
  api: {
    getDeliveries: vi.fn(),
  },
}))

describe('DeliveriesPage - Coluna "Entregue em"', () => {
  const mockDeliveries: Delivery[] = [
    {
      id: 'd-1',
      vehicleId: 'v-1',
      vehiclePlate: 'ABC-1234',
      origin: 'São Paulo, SP',
      destination: 'Rio de Janeiro, RJ',
      status: 'em_transito',
      createdAt: '2026-11-01T10:00:00Z',
      deliveredAt: null,
    },
    {
      id: 'd-2',
      vehicleId: 'v-2',
      vehiclePlate: 'DEF-5678',
      origin: 'Campinas, SP',
      destination: 'Santos, SP',
      status: 'pendente',
      createdAt: '2026-11-01T11:00:00Z',
      deliveredAt: null,
    },
    {
      id: 'd-3',
      vehicleId: 'v-3',
      vehiclePlate: 'GHI-9012',
      origin: 'Curitiba, PR',
      destination: 'Joinville, SC',
      status: 'cancelado',
      createdAt: '2026-11-01T09:00:00Z',
      deliveredAt: null,
    },
    {
      id: 'd-4',
      vehicleId: 'v-4',
      vehiclePlate: 'JKL-3456',
      origin: 'Belo Horizonte, MG',
      destination: 'Vitória, ES',
      status: 'entregue',
      createdAt: '2026-10-31T08:00:00Z',
      deliveredAt: '2026-11-01T16:00:00Z',
    },
    {
      id: 'd-5',
      vehicleId: 'v-5',
      vehiclePlate: 'MNO-7890',
      origin: 'Porto Alegre, RS',
      destination: 'Caxias do Sul, RS',
      status: 'entregue',
      createdAt: '2026-10-30T08:00:00Z',
      deliveredAt: null,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getDeliveries).mockResolvedValue(mockDeliveries)
  })

  it('exibe "—" na coluna "Entregue em" para entregas abertas (em_transito e pendente) e canceladas', async () => {
    render(<DeliveriesPage />)

    await waitFor(() => {
      expect(screen.getByText('ABC-1234')).toBeDefined()
    })

    const rows = screen.getAllByRole('row')
    // row 0 é o thead (cabeçalho)
    // row 1: d-1 em_transito com deliveredAt null -> '—'
    const cellsD1 = rows[1].querySelectorAll('td')
    expect(cellsD1[5].textContent).toBe('—')

    // row 2: d-2 pendente com deliveredAt null -> '—'
    const cellsD2 = rows[2].querySelectorAll('td')
    expect(cellsD2[5].textContent).toBe('—')

    // row 3: d-3 cancelado com deliveredAt null -> '—'
    const cellsD3 = rows[3].querySelectorAll('td')
    expect(cellsD3[5].textContent).toBe('—')
  })

  it('exibe a data formatada para entrega entregue com deliveredAt preenchido', async () => {
    render(<DeliveriesPage />)

    await waitFor(() => {
      expect(screen.getByText('JKL-3456')).toBeDefined()
    })

    const rows = screen.getAllByRole('row')
    // row 4: d-4 entregue com deliveredAt preenchido
    const cellsD4 = rows[4].querySelectorAll('td')
    expect(cellsD4[5].textContent).toBe('01/11/2026')
  })

  it('mantém "sem dado" para entrega entregue mas com deliveredAt ausente (falta real de dado)', async () => {
    render(<DeliveriesPage />)

    await waitFor(() => {
      expect(screen.getByText('MNO-7890')).toBeDefined()
    })

    const rows = screen.getAllByRole('row')
    // row 5: d-5 entregue com deliveredAt nulo -> 'sem dado'
    const cellsD5 = rows[5].querySelectorAll('td')
    expect(cellsD5[5].textContent).toBe('sem dado')
  })
})
