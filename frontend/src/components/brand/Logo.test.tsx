import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Logo from './Logo'
import Simbolo from './Simbolo'
import Sidebar from '../Sidebar'

describe('Identidade Visual FleetTrack: Logo e Símbolo (T-76 / DS 3.2 §1.1)', () => {
  const rootDir = process.cwd()

  it('renderiza o Logo completo com role="img" e aria-label="FleetTrack"', () => {
    const { container } = render(<Logo />)
    const svg = screen.getByRole('img', { name: 'FleetTrack' })

    expect(svg).toBeDefined()
    expect(svg.getAttribute('viewBox')).toBe('0 0 180 32')
    expect(svg.getAttribute('width')).toBe('180')
    expect(svg.getAttribute('height')).toBe('32')

    // Sem selo PRO (ADR-0015 / DS §1.1)
    expect(container.textContent).not.toMatch(/PRO/i)
  })

  it('aplica as regras cromáticas e tipográficas nos textos Fleet e Track', () => {
    const { container } = render(<Logo />)

    const fleetText = container.querySelector('.cds-logo-text-fleet')
    const trackText = container.querySelector('.cds-logo-text-track')

    expect(fleetText).not.toBeNull()
    expect(trackText).not.toBeNull()

    // Fleet: fill="currentColor", IBM Plex Sans peso 600
    expect(fleetText?.getAttribute('fill')).toBe('currentColor')
    expect(fleetText?.getAttribute('font-weight')).toBe('600')
    expect(fleetText?.getAttribute('font-family')).toContain('IBM Plex Sans')

    // Track: fill="var(--cds-link-primary)", IBM Plex Sans peso 400
    expect(trackText?.getAttribute('fill')).toBe('var(--cds-link-primary)')
    expect(trackText?.getAttribute('font-weight')).toBe('400')
    expect(trackText?.getAttribute('font-family')).toContain('IBM Plex Sans')
  })

  it('utiliza var(--ft-brand-mark) no quadrado e glifo branco no monomarca', () => {
    const { container } = render(<Logo />)

    const square = container.querySelector('rect')
    expect(square?.getAttribute('fill')).toBe('var(--ft-brand-mark)')

    const paths = container.querySelectorAll('path')
    expect(paths.length).toBe(2)
    paths.forEach((p) => {
      expect(p.getAttribute('fill')).toBe('var(--cds-text-on-color, white)')
    })
  })

  it('quando compact={true}, renderiza apenas o símbolo sem o wordmark', () => {
    const { container } = render(<Logo compact />)
    const svg = screen.getByRole('img', { name: 'FleetTrack' })

    expect(svg.getAttribute('viewBox')).toBe('0 0 32 32')
    expect(svg.getAttribute('width')).toBe('32')
    expect(svg.getAttribute('height')).toBe('32')

    // Não renderiza textos no modo compacto
    expect(container.querySelector('text')).toBeNull()
    expect(container.querySelector('.cds-logo-text-fleet')).toBeNull()
    expect(container.querySelector('.cds-logo-text-track')).toBeNull()

    // Mantém o monomarca com var(--ft-brand-mark)
    const square = container.querySelector('rect')
    expect(square?.getAttribute('fill')).toBe('var(--ft-brand-mark)')
  })

  it('Simbolo renderiza o monomarca de 32x32 com acessibilidade e sem textos', () => {
    const { container } = render(<Simbolo />)
    const svg = screen.getByRole('img', { name: 'FleetTrack' })

    expect(svg.getAttribute('viewBox')).toBe('0 0 32 32')
    expect(svg.getAttribute('width')).toBe('32')
    expect(svg.getAttribute('height')).toBe('32')
    expect(container.querySelector('text')).toBeNull()

    const square = container.querySelector('rect')
    expect(square?.getAttribute('fill')).toBe('var(--ft-brand-mark)')
  })

  it('nenhum valor hexadecimal (#) é utilizado no código de Logo.tsx ou Simbolo.tsx', () => {
    const logoSource = fs.readFileSync(
      path.resolve(rootDir, 'src/components/brand/Logo.tsx'),
      'utf-8',
    )
    const simboloSource = fs.readFileSync(
      path.resolve(rootDir, 'src/components/brand/Simbolo.tsx'),
      'utf-8',
    )

    const hexRegex = /#[0-9a-fA-F]{3,8}/
    expect(logoSource).not.toMatch(hexRegex)
    expect(simboloSource).not.toMatch(hexRegex)
  })

  it('Sidebar renderiza o Logo da marca FleetTrack no lugar do ícone Truck com texto', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar />
      </MemoryRouter>,
    )

    const logo = screen.getByRole('img', { name: 'FleetTrack' })
    expect(logo).toBeDefined()

    // A sidebar tem o link de veículos que ainda usa o ícone Truck, mas a logo contém o componente Logo
    const logoContainer = logo.closest('.logo')
    expect(logoContainer).not.toBeNull()
  })

  it('index.html contém título FleetTrack e link para favicon.svg', () => {
    const html = fs.readFileSync(path.resolve(rootDir, 'index.html'), 'utf-8')

    expect(html).toContain('<title>FleetTrack</title>')
    expect(html).toMatch(
      /<link\s+rel="icon"\s+type="image\/svg\+xml"\s+href="\/favicon\.svg"\s*\/?>/,
    )
  })

  it('public/favicon.svg existe e é cópia exata do simbolo.svg', () => {
    const faviconPath = path.resolve(rootDir, 'public/favicon.svg')
    expect(fs.existsSync(faviconPath)).toBe(true)

    const faviconContent = fs.readFileSync(faviconPath, 'utf-8')
    expect(faviconContent).toContain('viewBox="0 0 32 32"')
    expect(faviconContent).toContain('fill="#007d79"')
    expect(faviconContent).toContain('Telematics Route Grid')
  })
})
