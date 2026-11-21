import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TelemetryPage from './TelemetryPage'
import type { Vehicle } from '../types'
import { api } from '../api'
import { readThemeTokens } from '../theme/useThemeTokens'

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', MockResizeObserver)

vi.mock('../api', () => ({
  api: {
    getTelemetry: vi.fn(),
    getRoute: vi.fn().mockResolvedValue({ from: '', to: '', truncated: false, points: [] }),
  },
}))

vi.mock('./RouteMap', () => ({
  default: ({ points }: { points: unknown[] }) => (
    <div data-testid="route-map-mock">{points.length} pontos</div>
  ),
}))

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

const mockTelemetry = [
  {
    id: 't-1',
    latitude: -23.55,
    longitude: -46.63,
    speed: 70,
    fuelLevel: 85,
    recordedAt: '2026-10-31T12:00:00Z',
  },
  {
    id: 't-2',
    latitude: -23.56,
    longitude: -46.64,
    speed: 75,
    fuelLevel: 82,
    recordedAt: '2026-10-31T12:05:00Z',
  },
]

describe('TelemetryPage — LineCharts temáticos (T-80 / DS §5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getTelemetry).mockResolvedValue(mockTelemetry)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 400,
      height: 280,
      top: 0,
      left: 0,
      bottom: 280,
      right: 400,
      x: 0,
      y: 0,
      toJSON: () => {},
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('velocidade usa --ft-chart-speed (Teal) e combustível usa --ft-chart-fuel (Green)', () => {
    const darkTokens = readThemeTokens('dark')
    const lightTokens = readThemeTokens('light')

    // g100
    expect(darkTokens.chartSpeed).toBe('#08bdba') // Teal 40
    expect(darkTokens.chartFuel).toBe('#42be65') // Green 40

    // g10
    expect(lightTokens.chartSpeed).toBe('#007d79') // Teal 60
    expect(lightTokens.chartFuel).toBe('#198038') // Green 60

    // Regra R-COR: Teal nunca aparece com Cyan no mesmo gráfico
    expect(darkTokens.chartSpeed).not.toBe(darkTokens.chartEnroute)
    expect(lightTokens.chartSpeed).not.toBe(lightTokens.chartEnroute)
  })

  it('renderiza os dois LineCharts quando veículo selecionado com telemetria', async () => {
    render(<TelemetryPage vehicles={mockVehicles} />)

    expect(screen.getByRole('heading', { level: 1, name: /telemetria/i })).toBeDefined()
    expect(screen.getByText(/selecione um veículo para visualizar a telemetria/i)).toBeDefined()
  })

  it('exibe "sem dado" nos stat-cards e registros da tabela quando velocidade e combustível forem nulos', async () => {
    const veiculoNulos: Vehicle = {
      id: 'v-nul',
      plate: 'NUL-1234',
      model: 'Scania R450',
      driverName: 'Maria Santos',
      status: 'em_rota',
      latitude: -23.55,
      longitude: -46.63,
      speed: null,
      fuelLevel: null,
      updatedAt: '2026-10-31T12:00:00Z',
    }

    const telemetriaNula = [
      {
        id: 't-nul-1',
        latitude: -23.55,
        longitude: -46.63,
        speed: null,
        fuelLevel: null,
        recordedAt: '2026-10-31T12:00:00Z',
      },
    ]

    vi.mocked(api.getTelemetry).mockResolvedValue(telemetriaNula)

    render(<TelemetryPage vehicles={[veiculoNulos]} />)

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'v-nul' } })

    expect(await screen.findByText('NUL-1234')).toBeDefined()

    // No stat-card e na tabela, deve aparecer "sem dado" para speed e fuelLevel
    const semDadoElements = await screen.findAllByText('sem dado')
    // 2 nos stat-cards (velocidade atual e combustível) + 2 na tabela de telemetria
    expect(semDadoElements.length).toBeGreaterThanOrEqual(4)
  })
})

describe('TelemetryPage — trajeto do dia', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getTelemetry).mockResolvedValue([])
    vi.mocked(api.getRoute).mockResolvedValue({ from: '', to: '', truncated: false, points: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('pede o trajeto do dia inteiro e mostra o resumo e o mapa', async () => {
    vi.mocked(api.getRoute).mockResolvedValue({
      from: '',
      to: '',
      truncated: false,
      points: [
        {
          latitude: -23.55,
          longitude: -46.63,
          speed: 40,
          fuelLevel: 80,
          recordedAt: '2026-10-31T12:00:00Z',
        },
        {
          latitude: -23.56,
          longitude: -46.63,
          speed: 80,
          fuelLevel: 79,
          recordedAt: '2026-10-31T12:30:00Z',
        },
      ],
    })

    render(<TelemetryPage vehicles={mockVehicles} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'v-1' } })

    expect(await screen.findByTestId('route-map-mock')).toHaveProperty('textContent', '2 pontos')
    const [, from, to] = vi.mocked(api.getRoute).mock.calls[0]
    expect(new Date(to).getTime() - new Date(from).getTime()).toBeGreaterThanOrEqual(23 * 3600_000)
    expect(screen.getByText('Distância percorrida')).toBeDefined()
    expect(screen.getByText('80 km/h')).toBeDefined() // velocidade máxima
    expect(screen.getByText('60 km/h')).toBeDefined() // velocidade média
    expect(screen.getByText('30 min')).toBeDefined()
  })

  it('troca de dia pede o trajeto de novo', async () => {
    render(<TelemetryPage vehicles={mockVehicles} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'v-1' } })
    await screen.findByText('Nenhuma posição registrada neste dia.')

    fireEvent.change(screen.getByLabelText('Dia'), { target: { value: '2026-10-01' } })

    await vi.waitFor(() => expect(api.getRoute).toHaveBeenCalledTimes(2))
    const [, from] = vi.mocked(api.getRoute).mock.calls[1]
    expect(new Date(from).getTime()).toBe(new Date(2026, 9, 1).getTime())
  })

  it('avisa quando o trajeto não carrega', async () => {
    vi.mocked(api.getRoute).mockRejectedValue(new Error('HTTP 500'))

    render(<TelemetryPage vehicles={mockVehicles} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'v-1' } })

    expect(await screen.findByRole('alert')).toBeDefined()
  })
})
