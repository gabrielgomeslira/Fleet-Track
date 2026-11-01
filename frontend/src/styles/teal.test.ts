import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { describe, it, expect } from 'vitest'
import * as sass from 'sass-embedded'

describe('Teal Technical Identity Configuration (T-90 / DS 3.2 §3, §9)', () => {
  const rootDir = process.cwd()

  it('legacy-aliases.css mapeia --accent para --cds-interactive e remove fallback legado azul', () => {
    const aliasesPath = path.resolve(rootDir, 'src/styles/legacy-aliases.css')
    const content = fs.readFileSync(aliasesPath, 'utf-8')

    expect(content).toMatch(/--accent:\s*var\(--cds-interactive\);/)
    expect(content).toMatch(/--accent-hover:\s*var\(--cds-interactive-hover\);/)
    expect(content).not.toContain(['03', '53e9'].join(''))
  })

  it('nenhum arquivo de código em src/ referencia a cor azul legada', () => {
    const sourceFiles = [
      'src/main.tsx',
      'src/App.tsx',
      'src/components/DeliveriesPage.tsx',
      'src/components/DeliveryChart.tsx',
      'src/components/FleetMap.tsx',
      'src/components/Sidebar.tsx',
      'src/components/StatsCards.tsx',
      'src/components/StatusChart.tsx',
      'src/components/TelemetryPage.tsx',
      'src/components/VehiclesPage.tsx',
      'src/theme/theme.ts',
      'src/theme/ThemeProvider.tsx',
      'src/styles/carbon.scss',
      'src/styles/fonts.scss',
      'src/styles/ft-tokens.scss',
      'src/styles/global.css',
      'src/styles/legacy-aliases.css',
      'src/styles/overrides.scss',
    ]

    const legacyHex = ['#03', '53e9'].join('')
    for (const relPath of sourceFiles) {
      const fullPath = path.resolve(rootDir, relPath)
      const content = fs.readFileSync(fullPath, 'utf-8')
      expect(content).not.toContain(legacyHex)
    }
  })

  it('global.css utiliza --ft-text-on-interactive em itens ativos e remove #fff sobre acento', () => {
    const globalCssPath = path.resolve(rootDir, 'src/styles/global.css')
    const content = fs.readFileSync(globalCssPath, 'utf-8')

    expect(content).toMatch(
      /\.sidebar\s+a\.active\s*\{[^}]*color:\s*var\(--ft-text-on-interactive\);/,
    )
    expect(content).toMatch(
      /\.filter-btn\.active\s*\{[^}]*color:\s*var\(--ft-text-on-interactive\);/,
    )
    expect(content).not.toMatch(/\.sidebar\s+a\.active\s*\{[^}]*color:\s*#fff;/)
    expect(content).not.toMatch(/\.filter-btn\.active\s*\{[^}]*color:\s*#fff;/)
  })

  it('global.css mapeia badges em_rota e em_transito para Cyan (--ft-tag-cyan-*) sem virar Teal', () => {
    const globalCssPath = path.resolve(rootDir, 'src/styles/global.css')
    const content = fs.readFileSync(globalCssPath, 'utf-8')

    expect(content).toMatch(
      /\.badge\.em_rota\s*\{[^}]*background:\s*var\(--ft-tag-cyan-bg\);\s*color:\s*var\(--ft-tag-cyan-text\);/,
    )
    expect(content).toMatch(
      /\.badge\.em_transito\s*\{[^}]*background:\s*var\(--ft-tag-cyan-bg\);\s*color:\s*var\(--ft-tag-cyan-text\);/,
    )
    expect(content).not.toMatch(/\.badge\.em_rota\s*\{[^}]*var\(--accent\)/)
    expect(content).not.toMatch(/\.badge\.em_transito\s*\{[^}]*var\(--accent\)/)
  })

  it('StatsCards.tsx utiliza var(--accent) para o primeiro card de Total Veículos e color-mix para fundo translúcido', () => {
    const statsCardsPath = path.resolve(rootDir, 'src/components/StatsCards.tsx')
    const content = fs.readFileSync(statsCardsPath, 'utf-8')

    expect(content).toContain("color: 'var(--accent)'")
    expect(content).not.toContain("color: '#3b82f6'")
    expect(content).toContain('color-mix(in srgb, ${c.color} 12%, transparent)')
    expect(content).not.toContain('${c.color}20')
  })

  it('ft-tokens.scss define os mapas de tokens Teal g100 e g10 e variáveis --ft-*', () => {
    const ftTokensPath = path.resolve(rootDir, 'src/styles/ft-tokens.scss')
    const content = fs.readFileSync(ftTokensPath, 'utf-8')

    // Mapas Sass
    expect(content).toContain('$ft-teal-g100:')
    expect(content).toContain('interactive: #08bdba')
    expect(content).toContain('border-interactive: #08bdba')
    expect(content).toContain('link-primary: #08bdba')
    expect(content).toContain('link-primary-hover: #3ddbd9')
    expect(content).toContain('highlight: #004144')

    expect(content).toContain('$ft-teal-g10:')
    expect(content).toContain('interactive: #007d79')
    expect(content).toContain('border-interactive: #007d79')
    expect(content).toContain('link-primary: #007d79')
    expect(content).toContain('link-primary-hover: #005d5d')
    expect(content).toContain('highlight: #d9fbfb')
    expect(content).toContain('focus: #007d79')

    // Tokens próprios FleetTrack por tema
    expect(content).toContain('--ft-interactive-hover: #009d9a')
    expect(content).toContain('--ft-interactive-hover: #005d5d')
    expect(content).toContain('--ft-text-on-interactive: #161616')
    expect(content).toContain('--ft-text-on-interactive: #ffffff')
    expect(content).toContain('--ft-tag-cyan-bg: #003666')
    expect(content).toContain('--ft-tag-cyan-bg: #bae6ff')
  })

  it('overrides.scss define tokens do botão primário e sobrepõe texto com acessibilidade WCAG', () => {
    const overridesPath = path.resolve(rootDir, 'src/styles/overrides.scss')
    const content = fs.readFileSync(overridesPath, 'utf-8')

    expect(content).toContain('--cds-button-primary: #08bdba;')
    expect(content).toContain('--cds-button-primary: #007d79;')
    expect(content).toMatch(/\.cds--btn--primary\s*\{[^}]*color:\s*var\(--ft-text-on-interactive\);/)
    expect(content).toMatch(/&:active\s*\{[^}]*color:\s*var\(--ft-text-on-interactive-active\);/)
  })

  it('carbon.scss mescla os mapas com themes.$g100 e themes.$g10 e importa ft-tokens e overrides', () => {
    const carbonPath = path.resolve(rootDir, 'src/styles/carbon.scss')
    const content = fs.readFileSync(carbonPath, 'utf-8')

    expect(content).toContain("map.merge(themes.$g100, ft-tokens.$ft-teal-g100)")
    expect(content).toContain("map.merge(themes.$g10, ft-tokens.$ft-teal-g10)")
    expect(content).toContain("@use './ft-tokens';")
    expect(content).toContain("@use './overrides';")
  })

  it('compilação do Sass gera --cds-interactive em Teal nos dois temas e mantém text-on-color branco', () => {
    const carbonPath = path.resolve(rootDir, 'src/styles/carbon.scss')
    const compiled = sass.compile(carbonPath, {
      loadPaths: [path.resolve(rootDir, 'node_modules')],
    })

    const css = compiled.css

    // Tema escuro g100
    expect(css).toMatch(/--cds-interactive:\s*#08bdba/)
    // Tema claro g10
    expect(css).toMatch(/--cds-interactive:\s*#007d79/)

    // Hover e active
    expect(css).toMatch(/--cds-interactive-hover:\s*#009d9a/)
    expect(css).toMatch(/--cds-interactive-hover:\s*#005d5d/)

    // text-on-color preservado branco (C1)
    expect(css).toMatch(/--cds-text-on-color:\s*#ffffff/)
    expect(css).not.toMatch(/--cds-text-on-color:\s*#161616/)
  })

  it('garante contraste WCAG 2.2 AA/AAA no texto sobre interativo nos dois temas', () => {
    function getLuminance(hex: string): number {
      const rgb = [0, 2, 4].map((offset) => {
        const val = parseInt(hex.substring(offset, offset + 2), 16) / 255
        return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4)
      })
      return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
    }

    function getContrast(hex1: string, hex2: string): number {
      const l1 = getLuminance(hex1.replace('#', ''))
      const l2 = getLuminance(hex2.replace('#', ''))
      const lighter = Math.max(l1, l2)
      const darker = Math.min(l1, l2)
      return (lighter + 0.05) / (darker + 0.05)
    }

    // g100: Texto escuro #161616 sobre Teal 40 #08bdba
    const g100Contrast = getContrast('#08bdba', '#161616')
    expect(g100Contrast).toBeGreaterThanOrEqual(7.0) // Aprovado AAA (7.75:1)

    // Texto branco sobre Teal 40 reprovaria
    const whiteOnTeal40 = getContrast('#08bdba', '#ffffff')
    expect(whiteOnTeal40).toBeLessThan(4.5) // Reprovado (2.33:1)

    // g10: Texto branco #ffffff sobre Teal 60 #007d79
    const g10Contrast = getContrast('#007d79', '#ffffff')
    expect(g10Contrast).toBeGreaterThanOrEqual(4.5) // Aprovado AA (4.99:1)
  })
})
