import { describe, it, expect, vi } from 'vitest'
import { MarcadorVeiculo, gerarAriaLabelMarcador, criarIconeFormaMarcador } from './MarcadorVeiculo'
import type { Vehicle } from '../../types'

const mockVeiculoRota: Vehicle = {
  id: 'v-101',
  plate: 'BRA-2E19',
  model: 'Volvo FH 540',
  driverName: 'Carlos Silva',
  status: 'em_rota',
  latitude: -23.55,
  longitude: -46.63,
  speed: 84.2,
  fuelLevel: 75,
  updatedAt: '2026-11-01T15:30:00Z',
}

const mockVeiculoParado: Vehicle = {
  id: 'v-102',
  plate: 'KLT-9021',
  model: 'Scania R450',
  driverName: 'Mariana Costa',
  status: 'parado',
  latitude: -22.9,
  longitude: -43.2,
  speed: 0,
  fuelLevel: 90,
  updatedAt: '2026-11-01T15:30:00Z',
}

const mockVeiculoManutencao: Vehicle = {
  id: 'v-103',
  plate: 'JHG-3310',
  model: 'Mercedes-Benz Actros',
  driverName: 'Roberto Lima',
  status: 'manutencao',
  latitude: -19.92,
  longitude: -43.94,
  speed: 0,
  fuelLevel: 40,
  updatedAt: '2026-11-01T15:30:00Z',
}

describe('MarcadorVeiculo (T-81 / H-22 / DS §6.3)', () => {
  describe('gerarAriaLabelMarcador', () => {
    it('gera rótulo acessível para veículo em rota com velocidade', () => {
      const label = gerarAriaLabelMarcador(mockVeiculoRota)
      expect(label).toBe('Veículo BRA-2E19 — Em rota a 84 km/h')
    })

    it('gera rótulo acessível para veículo parado', () => {
      const label = gerarAriaLabelMarcador(mockVeiculoParado)
      expect(label).toBe('Veículo KLT-9021 — Parado')
    })

    it('gera rótulo acessível para veículo em manutenção', () => {
      const label = gerarAriaLabelMarcador(mockVeiculoManutencao)
      expect(label).toBe('Veículo JHG-3310 — Em manutenção')
    })
  })

  describe('criarIconeFormaMarcador (Regra R-COR: formas geométricas distintas)', () => {
    it('cria triângulo regular ▲ para status em_rota com Cyan', () => {
      const svg = criarIconeFormaMarcador('em_rota')
      expect(svg.tagName.toLowerCase()).toBe('svg')
      const polygon = svg.querySelector('polygon')
      expect(polygon).not.toBeNull()
      expect(polygon?.getAttribute('fill')).toContain('--ft-map-marker-enroute')
      expect(polygon?.getAttribute('stroke')).toContain('--ft-map-road-casing')
    })

    it('cria quadrado ■ com letra "P" para status parado com Yellow', () => {
      const svg = criarIconeFormaMarcador('parado')
      const rect = svg.querySelector('rect')
      const text = svg.querySelector('text')
      expect(rect).not.toBeNull()
      expect(rect?.getAttribute('fill')).toContain('--ft-map-marker-stopped')
      expect(text).not.toBeNull()
      expect(text?.textContent).toBe('P')
    })

    it('cria losango ◆ com exclamação "!" para status manutencao com Red', () => {
      const svg = criarIconeFormaMarcador('manutencao')
      const polygon = svg.querySelector('polygon')
      const text = svg.querySelector('text')
      expect(polygon).not.toBeNull()
      expect(polygon?.getAttribute('fill')).toContain('--ft-map-marker-maintenance')
      expect(text).not.toBeNull()
      expect(text?.textContent).toBe('!')
    })
  })

  describe('Instância de MarcadorVeiculo', () => {
    it('cria elemento <button> interativo com atributos WCAG 2.2 AA', () => {
      const marcador = new MarcadorVeiculo({ veiculo: mockVeiculoRota })
      const btn = marcador.button

      expect(btn.tagName.toLowerCase()).toBe('button')
      expect(btn.getAttribute('type')).toBe('button')
      expect(btn.getAttribute('role')).toBe('button')
      expect(btn.getAttribute('tabindex')).toBe('0')
      expect(btn.getAttribute('data-vehicle-id')).toBe('v-101')
      expect(btn.getAttribute('data-status')).toBe('em_rota')
      expect(btn.getAttribute('data-plate')).toBe('BRA-2E19')
      expect(btn.getAttribute('data-lat')).toBe('-23.55')
      expect(btn.getAttribute('data-lng')).toBe('-46.63')
      expect(btn.getAttribute('aria-label')).toBe('Veículo BRA-2E19 — Em rota a 84 km/h')
      expect(btn.style.position).not.toBe('relative')
      expect(btn.style.outlineOffset).toBe('2px')
      expect(parseInt(btn.style.width, 10)).toBeGreaterThanOrEqual(24)
      expect(parseInt(btn.style.height, 10)).toBeGreaterThanOrEqual(24)
    })

    it('dispara callback onClick ao ser clicado', () => {
      const onClick = vi.fn()
      const marcador = new MarcadorVeiculo({ veiculo: mockVeiculoRota, onClick })

      marcador.button.click()
      expect(onClick).toHaveBeenCalledTimes(1)
      expect(onClick).toHaveBeenCalledWith(mockVeiculoRota, marcador.button)
    })

    it('atualiza posição e status in-place sem recriar o botão', () => {
      const marcador = new MarcadorVeiculo({ veiculo: mockVeiculoRota })
      const btnOriginal = marcador.button

      const veiculoAtualizado: Vehicle = {
        ...mockVeiculoRota,
        status: 'parado',
        speed: 0,
        latitude: -23.6,
        longitude: -46.7,
      }

      marcador.atualizar(veiculoAtualizado)

      // O elemento no DOM continua exatamente a mesma instância
      expect(marcador.button).toBe(btnOriginal)
      expect(marcador.button.getAttribute('data-status')).toBe('parado')
      expect(marcador.button.getAttribute('data-lat')).toBe('-23.6')
      expect(marcador.button.getAttribute('data-lng')).toBe('-46.7')
      expect(marcador.button.getAttribute('aria-label')).toBe('Veículo BRA-2E19 — Parado')

      // Forma mudou para quadrado com "P"
      expect(marcador.button.querySelector('rect')).not.toBeNull()
      expect(marcador.button.querySelector('text')?.textContent).toBe('P')
    })
  })
})
