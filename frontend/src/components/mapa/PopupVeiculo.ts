import { Popup } from 'maplibre-gl'
import type { Vehicle, Delivery } from '../../types'
import { formatarPercentual, formatarVelocidade } from '../../formatos'

export interface PopupVeiculoOpcoes {
  veiculo: Vehicle
  entrega?: Delivery | null
  marcadorElemento: HTMLButtonElement
  onClose?: () => void
  onTabOut?: (direction: 'next' | 'prev') => void
}

/**
 * Constrói o DOM do corpo do popup utilizando estritamente `.textContent`
 * e `document.createElement`, NUNCA `.innerHTML` com dados da API (ADR-0016 STRIDE Threat Model).
 */
export function construirConteudoPopup(veiculo: Vehicle, entrega?: Delivery | null): HTMLElement {
  const container = document.createElement('div')
  container.className = 'ft-map-popup-body'

  // Cabeçalho com Placa e Motorista
  const header = document.createElement('div')
  header.className = 'ft-map-popup-header'

  const placa = document.createElement('strong')
  placa.className = 'ft-map-popup-plate'
  placa.textContent = veiculo.plate
  header.appendChild(placa)

  if (veiculo.driverName) {
    const sep = document.createTextNode(' — ')
    header.appendChild(sep)

    const motorista = document.createElement('span')
    motorista.className = 'ft-map-popup-driver'
    motorista.textContent = veiculo.driverName
    header.appendChild(motorista)
  }
  container.appendChild(header)

  // Modelo do veículo
  if (veiculo.model) {
    const modelo = document.createElement('div')
    modelo.className = 'ft-map-popup-model'
    modelo.textContent = veiculo.model
    container.appendChild(modelo)
  }

  // Métricas: Velocidade e Combustível
  const metricas = document.createElement('div')
  metricas.className = 'ft-map-popup-metrics'
  const velTexto = formatarVelocidade(veiculo.speed)
  const combTexto = formatarPercentual(veiculo.fuelLevel)
  metricas.textContent = `${velTexto} · Combustível ${combTexto}`
  container.appendChild(metricas)

  // Horário da última posição registrada
  if (veiculo.updatedAt) {
    const ultimaAtualizacao = document.createElement('div')
    ultimaAtualizacao.className = 'ft-map-popup-updated'
    try {
      const date = new Date(veiculo.updatedAt)
      if (!isNaN(date.getTime())) {
        const dataFormatada = date.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
        ultimaAtualizacao.textContent = `Última posição: ${dataFormatada}`
      } else {
        ultimaAtualizacao.textContent = `Última posição: ${veiculo.updatedAt}`
      }
    } catch {
      ultimaAtualizacao.textContent = `Última posição: ${veiculo.updatedAt}`
    }
    container.appendChild(ultimaAtualizacao)
  }

  // Origem e destino da entrega em andamento (em texto, quando houver)
  if (entrega && (entrega.origin || entrega.destination)) {
    const rota = document.createElement('div')
    rota.className = 'ft-map-popup-route'
    rota.textContent = `Rota: ${entrega.origin || 'Origem não informada'} → ${entrega.destination || 'Destino não informado'}`
    container.appendChild(rota)
  }

  return container
}

/**
 * Gerencia a exibição acessível do popup do veículo (T-81).
 * Implementa:
 * - Fechamento por tecla Escape com devolução de foco ao marcador
 * - Devolução de foco ao botão do marcador quando fechado pelo botão 'x'
 * - Continuidade da navegação por Tab sem cair no <body>
 * - Atualização contínua de telemetria sem fechar ou recriar o popup
 */
export class PopupVeiculo {
  public readonly popup: Popup
  private marcadorElemento: HTMLButtonElement
  private contentContainer: HTMLElement
  private veiculo: Vehicle
  private entrega?: Delivery | null
  private onTabOut?: (direction: 'next' | 'prev') => void
  private keydownHandler?: (e: KeyboardEvent) => void
  private isUserClosing = false

  constructor(opcoes: PopupVeiculoOpcoes) {
    this.veiculo = opcoes.veiculo
    this.entrega = opcoes.entrega
    this.marcadorElemento = opcoes.marcadorElemento
    this.onTabOut = opcoes.onTabOut

    this.contentContainer = construirConteudoPopup(this.veiculo, this.entrega)

    this.popup = new Popup({
      closeButton: true,
      closeOnClick: false,
      offset: 16,
      className: 'ft-map-popup',
    })

    this.popup.setDOMContent(this.contentContainer)

    this.popup.on('open', () => {
      this.isUserClosing = false
      this.configurarAcessibilidade()
    })

    this.popup.on('close', () => {
      this.removerOuvintes()
      if (opcoes.onClose) {
        opcoes.onClose()
      }
      // Sempre devolve o foco para o marcador correspondente
      if (document.contains(this.marcadorElemento)) {
        this.marcadorElemento.focus()
      }
    })
  }

  /**
   * Atualiza as informações do veículo e da entrega sem fechar nem recriar o popup
   * (preserva a leitura do usuário durante o polling a cada 5 segundos).
   */
  public atualizar(novoVeiculo: Vehicle, novaEntrega?: Delivery | null): void {
    this.veiculo = novoVeiculo
    this.entrega = novaEntrega !== undefined ? novaEntrega : this.entrega

    const novoConteudo = construirConteudoPopup(this.veiculo, this.entrega)
    this.contentContainer.replaceWith(novoConteudo)
    this.contentContainer = novoConteudo

    if (this.popup.isOpen() && novoVeiculo.longitude !== null && novoVeiculo.latitude !== null) {
      this.popup.setLngLat([novoVeiculo.longitude, novoVeiculo.latitude])
    }
  }

  public setMarcadorElemento(el: HTMLButtonElement): void {
    this.marcadorElemento = el
  }

  private configurarAcessibilidade(): void {
    const popupEl = this.popup.getElement()
    if (!popupEl) return

    const closeBtn = popupEl.querySelector('.maplibregl-popup-close-button') as HTMLElement | null
    if (closeBtn) {
      closeBtn.setAttribute('aria-label', 'Fechar popup')
      closeBtn.setAttribute('tabindex', '0')
      closeBtn.focus()
    }

    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        this.fechar()
      } else if (e.key === 'Tab') {
        const focusable = Array.from(
          popupEl.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el: HTMLElement) => !el.hasAttribute('disabled'))

        if (focusable.length <= 1) {
          // Apenas o botão fechar é focável no popup: Tab avança para o próximo marcador
          e.preventDefault()
          if (this.onTabOut) {
            this.onTabOut(e.shiftKey ? 'prev' : 'next')
          }
        } else {
          const first = focusable[0]
          const last = focusable[focusable.length - 1]
          if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault()
            if (this.onTabOut) {
              this.onTabOut('next')
            }
          } else if (e.shiftKey && document.activeElement === first) {
            e.preventDefault()
            if (this.onTabOut) {
              this.onTabOut('prev')
            }
          }
        }
      }
    }

    popupEl.addEventListener('keydown', this.keydownHandler)
  }

  private removerOuvintes(): void {
    const popupEl = this.popup.getElement()
    if (popupEl && this.keydownHandler) {
      popupEl.removeEventListener('keydown', this.keydownHandler)
    }
  }

  public isOpen(): boolean {
    return this.popup.isOpen()
  }

  public fechar(): void {
    if (this.popup.isOpen()) {
      this.popup.remove()
      if (document.contains(this.marcadorElemento)) {
        this.marcadorElemento.focus()
      }
    }
  }
}

export default PopupVeiculo
