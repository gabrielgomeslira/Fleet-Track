import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ChartTooltip from './ChartTooltip'

describe('ChartTooltip (T-80 / DS §5)', () => {
  it('retorna null quando active for falso ou payload for vazio', () => {
    const { container: c1 } = render(<ChartTooltip active={false} payload={[{ value: 10 }]} />)
    expect(c1.firstChild).toBeNull()

    const { container: c2 } = render(<ChartTooltip active={true} payload={[]} />)
    expect(c2.firstChild).toBeNull()

    const { container: c3 } = render(<ChartTooltip active={true} />)
    expect(c3.firstChild).toBeNull()
  })

  it('renderiza com fundo --cds-layer-02, borda --cds-border-subtle-01 e raio 0', () => {
    const payload = [
      { name: 'Velocidade', value: 85, color: '#08bdba', unit: 'km/h' },
    ]

    const { container } = render(<ChartTooltip active={true} label="14:30" payload={payload} />)
    const tooltip = container.querySelector('.ft-chart-tooltip') as HTMLElement

    expect(tooltip).toBeDefined()
    expect(tooltip.style.backgroundColor).toBe('var(--cds-layer-02)')
    expect(tooltip.style.border).toBe('1px solid var(--cds-border-subtle-01)')
    expect(tooltip.style.borderRadius).toBe('0px')
  })

  it('renderiza números com Plex Mono tabular e respeita unidade', () => {
    const payload = [
      { name: 'Combustível', value: 72, color: '#42be65' },
    ]

    const { container } = render(
      <ChartTooltip active={true} label="14:30" payload={payload} unit="%" />,
    )

    expect(screen.getByText('14:30')).toBeDefined()
    expect(screen.getByText('Combustível:')).toBeDefined()

    const valueEl = container.querySelector('.ft-chart-tooltip__value') as HTMLElement
    expect(valueEl).toBeDefined()
    expect(valueEl.textContent).toContain('72 %')
    expect(valueEl.style.fontFamily).toContain('Plex Mono')
    expect(valueEl.style.fontVariantNumeric).toBe('tabular-nums')
  })
})
