import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import FleetMap from './FleetMap'
import * as MapaUtils from './mapa/mapaUtils'
import type { Vehicle, Delivery } from '../types'

vi.mock('../styles/map-theme.scss', () => ({}))

const mockVehicles: Vehicle[] = [
  {
    id: 'v-1',
    plate: 'ABC-1234',
    model: 'Volvo FH',
    driverName: 'João Silva',
    status: 'em_rota',
    latitude: -23.55,
    longitude: -46.63,
    speed: 70,
    fuelLevel: 85,
    updatedAt: '2026-11-01T12:00:00Z',
  },
  {
    id: 'v-2',
    plate: 'DEF-5678',
    model: 'Scania R',
    driverName: 'Maria Santos',
    status: 'parado',
    latitude: -22.9,
    longitude: -43.2,
    speed: 0,
    fuelLevel: 60,
    updatedAt: '2026-11-01T12:00:00Z',
  },
  {
    id: 'v-sem-posicao',
    plate: 'GHI-9999',
    model: 'Ford Cargo',
    driverName: 'Sem Sinal',
    status: 'parado',
    latitude: null as unknown as number,
    longitude: null as unknown as number,
    speed: 0,
    fuelLevel: 50,
    updatedAt: '2026-11-01T12:00:00Z',
  },
]

const mockDeliveries: Delivery[] = [
  {
    id: 'd-1',
    vehicleId: 'v-1',
    vehiclePlate: 'ABC-1234',
    origin: 'São Paulo',
    destination: 'Campinas',
    status: 'em_transito',
    createdAt: '2026-11-01T10:00:00Z',
    deliveredAt: null,
  },
]

describe('FleetMap (T-81 / ADR-0016 / H-22)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exibe mensagem alternativa no painel quando WebGL não for suportado pelo navegador', async () => {
    vi.spyOn(MapaUtils, 'isWebGlSupported').mockReturnValue(false)

    render(<FleetMap vehicles={mockVehicles} deliveries={mockDeliveries} />)

    await waitFor(() => {
      expect(screen.getByText(/mapa indisponível neste navegador/i)).toBeDefined()
    })
    expect(screen.getByTestId('fleet-map').getAttribute('data-estado-fundo')).toBe('indisponivel')
  })

  it('renderiza o container com estado de fundo e a legenda estruturada com formas geométricas (R-COR)', async () => {
    render(<FleetMap vehicles={mockVehicles} deliveries={mockDeliveries} />)

    await waitFor(() => {
      expect(screen.getByTestId('fleet-map').getAttribute('data-estado-fundo')).toBe('indisponivel')
    })

    expect(screen.getByRole('heading', { level: 3, name: /mapa da frota/i })).toBeDefined()
    expect(screen.getByTestId('fleet-map')).toBeDefined()

    // Legenda com as três formas e texto descritivo
    expect(screen.getByText(/em rota/i)).toBeDefined()
    expect(screen.getByText(/parado/i)).toBeDefined()
    expect(screen.getByText(/manutenção/i)).toBeDefined()
    expect(screen.getByText(/triângulo ▲/i)).toBeDefined()
    expect(screen.getByText(/quadrado ■ 'P'/i)).toBeDefined()
    expect(screen.getByText(/losango ◆ '!'/i)).toBeDefined()
  })
})
