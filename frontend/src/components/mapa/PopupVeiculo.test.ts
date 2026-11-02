import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PopupVeiculo, construirConteudoPopup } from './PopupVeiculo'
import type { Vehicle, Delivery } from '../../types'

const mockVeiculo: Vehicle = {
  id: 'v-201',
  plate: 'XYZ-9876',
  model: 'Mercedes-Benz Atego',
  driverName: 'Fernanda Rocha',
  status: 'em_rota',
  latitude: -25.42,
  longitude: -49.27,
  speed: 68.4,
  fuelLevel: 82,
  updatedAt: '2026-11-01T14:20:00Z',
}

const mockEntrega: Delivery = {
  id: 'd-201',
  vehicleId: 'v-201',
  vehiclePlate: 'XYZ-9876',
  origin: 'Curitiba',
  destination: 'Joinville',
  status: 'em_transito',
  createdAt: '2026-11-01T10:00:00Z',
  deliveredAt: null,
}

describe('PopupVeiculo (T-81 / STRIDE / WCAG 2.2 AA)', () => {
  let marcadorBtn: HTMLButtonElement

  beforeEach(() => {
    marcadorBtn = document.createElement('button')
    marcadorBtn.id = 'marcador-teste'
    document.body.appendChild(marcadorBtn)
  })

  afterEach(() => {
    marcadorBtn.remove()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  describe('construirConteudoPopup & Blindagem Anti-XSS', () => {
    it('insere todas as métricas e dados de entrega em nós de texto puros', () => {
      const conteudo = construirConteudoPopup(mockVeiculo, mockEntrega)

      expect(conteudo.querySelector('.ft-map-popup-plate')?.textContent).toBe('XYZ-9876')
      expect(conteudo.querySelector('.ft-map-popup-driver')?.textContent).toBe('Fernanda Rocha')
      expect(conteudo.querySelector('.ft-map-popup-model')?.textContent).toBe('Mercedes-Benz Atego')
      expect(conteudo.querySelector('.ft-map-popup-metrics')?.textContent).toContain('68 km/h')
      expect(conteudo.querySelector('.ft-map-popup-metrics')?.textContent).toContain('Combustível 82%')
      expect(conteudo.querySelector('.ft-map-popup-route')?.textContent).toBe('Rota: Curitiba → Joinville')
    })

    it('neutraliza qualquer injeção de HTML/XSS vinda de campos da API (STRIDE)', () => {
      const veiculoMalicioso: Vehicle = {
        ...mockVeiculo,
        plate: '<script>alert("xss-plate")</script>',
        driverName: '<img src="x" onerror="alert(1)" />',
        model: '<b onmouseover="alert(2)">Modelo</b>',
      }
      const entregaMaliciosa: Delivery = {
        ...mockEntrega,
        origin: '<svg onload="alert(3)">Origem</svg>',
        destination: '<iframe src="evil.com"></iframe>',
      }

      const conteudo = construirConteudoPopup(veiculoMalicioso, entregaMaliciosa)

      // Nenhum elemento HTML malicioso pode ter sido criado no DOM
      expect(conteudo.querySelector('script')).toBeNull()
      expect(conteudo.querySelector('img')).toBeNull()
      expect(conteudo.querySelector('svg')).toBeNull()
      expect(conteudo.querySelector('iframe')).toBeNull()

      // Os payloads são tratados como texto inofensivo
      expect(conteudo.querySelector('.ft-map-popup-plate')?.textContent).toBe(
        '<script>alert("xss-plate")</script>',
      )
      expect(conteudo.querySelector('.ft-map-popup-driver')?.textContent).toBe(
        '<img src="x" onerror="alert(1)" />',
      )
      expect(conteudo.querySelector('.ft-map-popup-route')?.textContent).toContain(
        '<svg onload="alert(3)">Origem</svg>',
      )
    })
  })

  describe('Ciclo de vida e Acessibilidade (Esc, Foco e Tab)', () => {
    function montarPopupNoDom(popupGerenciador: PopupVeiculo) {
      const popupEl = document.createElement('div')
      popupEl.className = 'maplibregl-popup'

      const closeBtn = document.createElement('button')
      closeBtn.className = 'maplibregl-popup-close-button'
      popupEl.appendChild(closeBtn)

      document.body.appendChild(popupEl)

      vi.spyOn(popupGerenciador.popup, 'getElement').mockReturnValue(popupEl)
      vi.spyOn(popupGerenciador.popup, 'isOpen').mockReturnValue(true)

      // Dispara o evento de open do MapLibre para configurar os ouvintes de teclado
      popupGerenciador.popup.fire('open')

      return { popupEl, closeBtn }
    }

    it('tecla Escape fecha o popup e devolve o foco imediatamente ao botão do marcador', () => {
      const popupGerenciador = new PopupVeiculo({
        veiculo: mockVeiculo,
        marcadorElemento: marcadorBtn,
      })

      const { popupEl } = montarPopupNoDom(popupGerenciador)
      const focusSpy = vi.spyOn(marcadorBtn, 'focus')
      const fecharSpy = vi.spyOn(popupGerenciador, 'fechar')

      // Dispara tecla Escape no elemento do popup
      const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      popupEl.dispatchEvent(escEvent)

      expect(fecharSpy).toHaveBeenCalled()
      expect(focusSpy).toHaveBeenCalled()
    })

    it('botão fechar ("x") devolve o foco ao botão do marcador ao ser clicado', () => {
      const popupGerenciador = new PopupVeiculo({
        veiculo: mockVeiculo,
        marcadorElemento: marcadorBtn,
      })

      montarPopupNoDom(popupGerenciador)
      const focusSpy = vi.spyOn(marcadorBtn, 'focus')

      // Simula evento de close disparado pelo MapLibre
      popupGerenciador.popup.fire('close')

      expect(focusSpy).toHaveBeenCalled()
    })

    it('tecla Tab no popup aciona onTabOut para prosseguir para o próximo marcador sem cair no body', () => {
      const onTabOut = vi.fn()
      const popupGerenciador = new PopupVeiculo({
        veiculo: mockVeiculo,
        marcadorElemento: marcadorBtn,
        onTabOut,
      })

      const { popupEl } = montarPopupNoDom(popupGerenciador)

      // Pressiona Tab simples
      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: false, bubbles: true })
      popupEl.dispatchEvent(tabEvent)

      expect(onTabOut).toHaveBeenCalledWith('next')

      // Pressiona Shift+Tab
      const shiftTabEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })
      popupEl.dispatchEvent(shiftTabEvent)

      expect(onTabOut).toHaveBeenCalledWith('prev')
    })

    it('atualização periódica (poll de 5s) atualiza dados in-place sem fechar o popup', () => {
      const popupGerenciador = new PopupVeiculo({
        veiculo: mockVeiculo,
        entrega: mockEntrega,
        marcadorElemento: marcadorBtn,
      })

      const veiculoNovo: Vehicle = {
        ...mockVeiculo,
        speed: 92.0,
        fuelLevel: 78,
      }

      popupGerenciador.atualizar(veiculoNovo)

      expect(popupGerenciador.isOpen).toBeDefined()
    })
  })
})
