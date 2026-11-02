import { Marker } from 'maplibre-gl'
import type { Vehicle } from '../../types'

export interface MarcadorVeiculoOpcoes {
  veiculo: Vehicle
  onClick?: (veiculo: Vehicle, elemento: HTMLButtonElement) => void
}

/**
 * Gera texto descritivo e acessível para o marcador veicular (WCAG 2.2 AA / H-22).
 */
export function gerarAriaLabelMarcador(v: Vehicle): string {
  const statusFormatado =
    v.status === 'em_rota'
      ? `Em rota a ${Math.round(v.speed)} km/h`
      : v.status === 'parado'
        ? 'Parado'
        : 'Em manutenção'
  return `Veículo ${v.plate} — ${statusFormatado}`
}

/**
 * Cria a forma geométrica vetorial SVG para o marcador de acordo com a semântica de status:
 * - Em rota: Triângulo regular (▲) com preenchimento Cyan e contorno estruturante (R-COR)
 * - Parado: Quadrado regular (■) com a letra 'P' em tipografia SemiBold e preenchimento Yellow
 * - Manutenção: Losango (◆) a 45° com exclamação '!' e preenchimento Red
 */
export function criarIconeFormaMarcador(status: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '24')
  svg.setAttribute('height', '24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')

  if (status === 'em_rota') {
    // Triângulo ▲ (Cyan)
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
    polygon.setAttribute('points', '12,2 22,21 2,21')
    polygon.setAttribute('fill', 'var(--ft-map-marker-enroute, #33b1ff)')
    polygon.setAttribute('stroke', 'var(--ft-map-road-casing, #262626)')
    polygon.setAttribute('stroke-width', '2')
    polygon.setAttribute('stroke-linejoin', 'round')
    svg.appendChild(polygon)
  } else if (status === 'parado') {
    // Quadrado ■ com "P" (Yellow)
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttribute('x', '2')
    rect.setAttribute('y', '2')
    rect.setAttribute('width', '20')
    rect.setAttribute('height', '20')
    rect.setAttribute('rx', '0')
    rect.setAttribute('fill', 'var(--ft-map-marker-stopped, #f1c21b)')
    rect.setAttribute('stroke', '#000000')
    rect.setAttribute('stroke-width', '2')
    svg.appendChild(rect)

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.setAttribute('x', '12')
    text.setAttribute('y', '16')
    text.setAttribute('text-anchor', 'middle')
    text.setAttribute('font-family', "'IBM Plex Sans', sans-serif")
    text.setAttribute('font-weight', '600')
    text.setAttribute('font-size', '13')
    text.setAttribute('fill', '#161616')
    text.textContent = 'P'
    svg.appendChild(text)
  } else {
    // Losango ◆ com "!" (Red)
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
    polygon.setAttribute('points', '12,2 22,12 12,22 2,12')
    polygon.setAttribute('fill', 'var(--ft-map-marker-maintenance, #da1e28)')
    polygon.setAttribute('stroke', '#ffffff')
    polygon.setAttribute('stroke-width', '2')
    polygon.setAttribute('stroke-linejoin', 'round')
    svg.appendChild(polygon)

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.setAttribute('x', '12')
    text.setAttribute('y', '17')
    text.setAttribute('text-anchor', 'middle')
    text.setAttribute('font-family', "'IBM Plex Sans', sans-serif")
    text.setAttribute('font-weight', '700')
    text.setAttribute('font-size', '13')
    text.setAttribute('fill', '#ffffff')
    text.textContent = '!'
    svg.appendChild(text)
  }

  return svg
}

/**
 * Representa um marcador interativo acessível no mapa MapLibre (T-81 / H-22).
 * Utiliza um elemento <button> navegável por teclado com anel de foco destacado (outline-offset: 2px).
 */
export class MarcadorVeiculo {
  public readonly veiculoId: string
  public readonly button: HTMLButtonElement
  public readonly marker: Marker
  private veiculo: Vehicle

  constructor(opcoes: MarcadorVeiculoOpcoes) {
    this.veiculo = opcoes.veiculo
    this.veiculoId = opcoes.veiculo.id

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `ft-map-marker ft-map-marker--${this.veiculo.status}`
    btn.setAttribute('role', 'button')
    btn.setAttribute('tabindex', '0')
    btn.setAttribute('data-vehicle-id', this.veiculo.id)
    btn.setAttribute('data-status', this.veiculo.status)
    btn.setAttribute('aria-label', gerarAriaLabelMarcador(this.veiculo))
    btn.style.width = '26px'
    btn.style.height = '26px'
    btn.style.padding = '0'
    btn.style.border = 'none'
    btn.style.background = 'transparent'
    btn.style.cursor = 'pointer'
    btn.style.display = 'inline-flex'
    btn.style.alignItems = 'center'
    btn.style.justifyContent = 'center'
    btn.style.position = 'relative'
    btn.style.outlineOffset = '2px'

    btn.appendChild(criarIconeFormaMarcador(this.veiculo.status))

    if (opcoes.onClick) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        opcoes.onClick!(this.veiculo, btn)
      })
    }

    this.button = btn
    this.marker = new Marker({
      element: btn,
      anchor: 'center',
    }).setLngLat([this.veiculo.longitude, this.veiculo.latitude])
  }

  /**
   * Atualiza as propriedades do marcador in-place (sem recriar o elemento no DOM,
   * preservando o foco do teclado ativo e evitando interrupções em leitores de tela).
   */
  public atualizar(novoVeiculo: Vehicle): void {
    const statusMudou = this.veiculo.status !== novoVeiculo.status
    const posMudou =
      this.veiculo.latitude !== novoVeiculo.latitude ||
      this.veiculo.longitude !== novoVeiculo.longitude

    this.veiculo = novoVeiculo

    this.button.setAttribute('aria-label', gerarAriaLabelMarcador(novoVeiculo))
    this.button.setAttribute('data-status', novoVeiculo.status)

    if (statusMudou) {
      this.button.className = `ft-map-marker ft-map-marker--${novoVeiculo.status}`
      this.button.innerHTML = ''
      this.button.appendChild(criarIconeFormaMarcador(novoVeiculo.status))
    }

    if (posMudou) {
      this.marker.setLngLat([novoVeiculo.longitude, novoVeiculo.latitude])
    }
  }

  public getVeiculo(): Vehicle {
    return this.veiculo
  }

  public remover(): void {
    this.marker.remove()
  }
}

export default MarcadorVeiculo
