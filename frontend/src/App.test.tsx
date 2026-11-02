import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App, { AppContent } from './App'
import { api } from './api'
import type { DashboardStats, Vehicle, Delivery } from './types'

// Mock de ResizeObserver para o Recharts rodar no ambiente jsdom
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', MockResizeObserver)

// Mock de FleetMap para isolar do mapa MapLibre (WebGL) no jsdom
vi.mock('./components/FleetMap', () => ({
  default: () => <div data-testid="fleet-map">FleetMap Mock</div>,
}))

vi.mock('./api', () => ({
  api: {
    getVehicles: vi.fn(),
    getDeliveries: vi.fn(),
    getStats: vi.fn(),
    simulate: vi.fn(),
  },
}))

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
  deliveriesPerDay: [{ date: '2026-10-31', count: 12 }],
}

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
    updatedAt: '2026-10-31T12:00:00Z',
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
    createdAt: '2026-10-31T10:00:00Z',
    deliveredAt: null,
  },
]

describe('Rotas da Aplicação (T-18)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getVehicles).mockResolvedValue(mockVehicles)
    vi.mocked(api.getDeliveries).mockResolvedValue(mockDeliveries)
    vi.mocked(api.getStats).mockResolvedValue(mockStats)
    vi.mocked(api.simulate).mockResolvedValue({} as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('AppContent com MemoryRouter', () => {
    it('renderiza a tela de Dashboard na rota "/"', () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <AppContent vehicles={mockVehicles} deliveries={mockDeliveries} stats={mockStats} />
        </MemoryRouter>,
      )

      expect(screen.getByRole('heading', { level: 1, name: /dashboard de frota/i })).toBeDefined()
      expect(screen.getByText(/monitoramento em tempo real da frota logística/i)).toBeDefined()
    })

    it('renderiza a tela de Veículos na rota "/vehicles"', () => {
      render(
        <MemoryRouter initialEntries={['/vehicles']}>
          <AppContent vehicles={mockVehicles} deliveries={mockDeliveries} stats={mockStats} />
        </MemoryRouter>,
      )

      expect(screen.getByRole('heading', { level: 1, name: /veículos/i })).toBeDefined()
      expect(screen.getByText('ABC-1234')).toBeDefined()
    })

    it('renderiza a tela de Entregas na rota "/deliveries"', async () => {
      render(
        <MemoryRouter initialEntries={['/deliveries']}>
          <AppContent vehicles={mockVehicles} deliveries={mockDeliveries} stats={mockStats} />
        </MemoryRouter>,
      )

      expect(screen.getByRole('heading', { level: 1, name: /entregas/i })).toBeDefined()
      await waitFor(() => {
        expect(screen.getByText('São Paulo')).toBeDefined()
      })
    })

    it('renderiza a tela de Telemetria na rota "/telemetry"', () => {
      render(
        <MemoryRouter initialEntries={['/telemetry']}>
          <AppContent vehicles={mockVehicles} deliveries={mockDeliveries} stats={mockStats} />
        </MemoryRouter>,
      )

      expect(screen.getByRole('heading', { level: 1, name: /telemetria/i })).toBeDefined()
    })

    it('redireciona rota desconhecida "*" para "/"', () => {
      render(
        <MemoryRouter initialEntries={['/caminho-inexistente']}>
          <AppContent vehicles={mockVehicles} deliveries={mockDeliveries} stats={mockStats} />
        </MemoryRouter>,
      )

      expect(screen.getByRole('heading', { level: 1, name: /dashboard de frota/i })).toBeDefined()
    })
  })

  describe('Navegação e histórico no navegador (App com BrowserRouter)', () => {
    it('navega pelas rotas ao clicar na Sidebar e suporta botão voltar do navegador', async () => {
      window.history.pushState({}, '', '/')
      const user = userEvent.setup()

      render(<App />)

      // Aguarda carregamento inicial dos dados
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: /dashboard de frota/i })).toBeDefined()
      })
      expect(window.location.pathname).toBe('/')

      // Clica em "Veículos"
      const vehiclesLink = screen.getByRole('link', { name: /veículos/i })
      await user.click(vehiclesLink)

      expect(window.location.pathname).toBe('/vehicles')
      expect(screen.getByRole('heading', { level: 1, name: /veículos/i })).toBeDefined()
      expect(vehiclesLink.getAttribute('aria-current')).toBe('page')

      // Clica em "Entregas"
      const deliveriesLink = screen.getByRole('link', { name: /entregas/i })
      await user.click(deliveriesLink)

      expect(window.location.pathname).toBe('/deliveries')
      expect(screen.getByRole('heading', { level: 1, name: /entregas/i })).toBeDefined()
      expect(deliveriesLink.getAttribute('aria-current')).toBe('page')

      // Simula o botão voltar do navegador (history.back / popstate)
      act(() => {
        window.history.back()
        window.dispatchEvent(new PopStateEvent('popstate'))
      })

      await waitFor(() => {
        expect(window.location.pathname).toBe('/vehicles')
        expect(screen.getByRole('heading', { level: 1, name: /veículos/i })).toBeDefined()
      })
    })

    it('abre diretamente na rota configurada na URL (recarga)', async () => {
      window.history.pushState({}, '', '/vehicles')

      render(<App />)

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: /veículos/i })).toBeDefined()
      })
      expect(window.location.pathname).toBe('/vehicles')
    })
  })
})
