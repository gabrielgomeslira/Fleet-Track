import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import FleetMap from './FleetMap'
import * as MapaUtils from './mapa/mapaUtils'
import * as ConfigMapa from './mapa/configMapa'
import type { Vehicle, Delivery } from '../types'

vi.mock('../styles/map-theme.scss', () => ({}))
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?url', () => ({ default: 'worker.js' }))

let mapEventHandlers: Record<string, ((e?: unknown) => void)[]> = {}
let lastCreatedMapInstance: {
  addControl: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  setStyle: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  loaded: ReturnType<typeof vi.fn>
  fitBounds: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
} | null = null

vi.mock('maplibre-gl', () => {
  return {
    setWorkerUrl: vi.fn(),
    NavigationControl: vi.fn(),
    Marker: vi.fn(function () {
      return {
        setLngLat: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn().mockReturnThis(),
      }
    }),
    Popup: vi.fn(function () {
      return {
        setLngLat: vi.fn().mockReturnThis(),
        setHTML: vi.fn().mockReturnThis(),
        setDOMContent: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn().mockReturnThis(),
        isOpen: vi.fn().mockReturnValue(false),
        on: vi.fn().mockReturnThis(),
      }
    }),
    Map: vi.fn(function () {
      mapEventHandlers = {}
      const instance = {
        addControl: vi.fn(),
        on: vi.fn((event: string, handler: (e?: unknown) => void) => {
          if (!mapEventHandlers[event]) mapEventHandlers[event] = []
          mapEventHandlers[event].push(handler)
        }),
        setStyle: vi.fn(),
        remove: vi.fn(),
        loaded: vi.fn().mockReturnValue(true),
        fitBounds: vi.fn().mockReturnThis(),
        resize: vi.fn().mockReturnThis(),
      }
      lastCreatedMapInstance = instance
      return instance
    }),
  }
})

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

describe('FleetMap (T-81 / T-94 / ADR-0016 / H-22)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mapEventHandlers = {}
    lastCreatedMapInstance = null
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

  it('quando fundo estiver desligado por configuração, grava data-estado-fundo="desligado" e exibe aviso fixo sem retry nem crédito', async () => {
    vi.spyOn(MapaUtils, 'isWebGlSupported').mockReturnValue(true)
    vi.spyOn(ConfigMapa, 'carregarConfigMapa').mockResolvedValue({
      desligado: true,
      tilejsonUrl: '',
      glyphsUrl: '',
      styleUrl: '',
      credit: '',
    })

    render(<FleetMap vehicles={mockVehicles} deliveries={mockDeliveries} />)

    await waitFor(() => {
      expect(screen.getByTestId('fleet-map').getAttribute('data-estado-fundo')).toBe('desligado')
    })

    expect(screen.getByText('Mapa de fundo desligado nesta instalação.')).toBeDefined()
    expect(screen.queryByRole('button', { name: /Tentar de novo/i })).toBeNull()
    expect(screen.queryByTestId('map-credit')).toBeNull()
  })

  it('ao ocorrer erro na fonte base do mapa, transiciona para data-estado-fundo="falha", exibe aviso e botão "Tentar de novo"', async () => {
    vi.spyOn(MapaUtils, 'isWebGlSupported').mockReturnValue(true)
    vi.spyOn(ConfigMapa, 'carregarConfigMapa').mockResolvedValue({
      desligado: false,
      tilejsonUrl: 'https://tiles.openfreemap.org/planet',
      glyphsUrl: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      styleUrl: '',
      credit: 'OpenFreeMap|https://openfreemap.org',
    })

    render(<FleetMap vehicles={mockVehicles} deliveries={mockDeliveries} />)

    await waitFor(() => {
      expect(lastCreatedMapInstance).not.toBeNull()
    })

    // Dispara erro na camada base dentro de act
    act(() => {
      const errorHandlers = mapEventHandlers['error'] || []
      errorHandlers.forEach((handler) => handler({ sourceId: 'base', status: 503 }))
    })

    await waitFor(() => {
      expect(screen.getByTestId('fleet-map').getAttribute('data-estado-fundo')).toBe('falha')
    })

    expect(screen.getByText('Mapa de fundo indisponível.')).toBeDefined()
    expect(screen.getByText('Veículos e tabela seguem atualizados.')).toBeDefined()

    const botaoRetry = screen.getByRole('button', { name: /Tentar de novo/i })
    expect(botaoRetry).not.toBeNull()

    // Clica em "Tentar de novo" para forçar retry imediato
    act(() => {
      fireEvent.click(botaoRetry)
    })
    expect(lastCreatedMapInstance!.setStyle).toHaveBeenCalledWith(expect.anything(), {
      diff: false,
    })
  })

  it('enquadra o Brasil inteiro com fitBounds e margem de 24px na inicialização (ADR-0016 / T-94)', async () => {
    vi.spyOn(MapaUtils, 'isWebGlSupported').mockReturnValue(true)
    vi.spyOn(ConfigMapa, 'carregarConfigMapa').mockResolvedValue({
      desligado: false,
      tilejsonUrl: 'https://tiles.openfreemap.org/planet',
      glyphsUrl: '',
      styleUrl: '',
      credit: 'OpenFreeMap',
    })

    render(<FleetMap vehicles={mockVehicles} deliveries={mockDeliveries} />)

    await waitFor(() => {
      expect(lastCreatedMapInstance).not.toBeNull()
      expect(lastCreatedMapInstance!.fitBounds).toHaveBeenCalledWith(
        [
          [-73.99, -33.75],
          [-34.79, 5.27],
        ],
        {
          padding: 24,
          duration: 0,
        },
      )
    })
  })

  it('re-executa fitBounds ao disparar o evento resize na janela', async () => {
    vi.spyOn(MapaUtils, 'isWebGlSupported').mockReturnValue(true)
    vi.spyOn(ConfigMapa, 'carregarConfigMapa').mockResolvedValue({
      desligado: false,
      tilejsonUrl: 'https://tiles.openfreemap.org/planet',
      glyphsUrl: '',
      styleUrl: '',
      credit: 'OpenFreeMap',
    })

    render(<FleetMap vehicles={mockVehicles} deliveries={mockDeliveries} />)

    await waitFor(() => {
      expect(lastCreatedMapInstance).not.toBeNull()
    })

    lastCreatedMapInstance!.fitBounds.mockClear()

    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    expect(lastCreatedMapInstance!.resize).toHaveBeenCalled()
    expect(lastCreatedMapInstance!.fitBounds).toHaveBeenCalledWith(
      [
        [-73.99, -33.75],
        [-34.79, 5.27],
      ],
      {
        padding: 24,
        duration: 0,
      },
    )
  })
})
