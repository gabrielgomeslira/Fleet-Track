import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { describe, it, expect } from 'vitest'

describe('Font configuration (T-30 / ADR-0015)', () => {
  const rootDir = process.cwd()

  it('index.html não faz requisições a Google Fonts nem CDNs externos', () => {
    const indexPath = path.resolve(rootDir, 'index.html')
    const htmlContent = fs.readFileSync(indexPath, 'utf-8')

    expect(htmlContent).not.toContain('fonts.googleapis.com')
    expect(htmlContent).not.toContain('fonts.gstatic.com')
    expect(htmlContent).not.toContain('1.www.s81c.com')
  })

  it('index.html inclui preload apenas para IBM Plex Sans 400 WOFF2', () => {
    const indexPath = path.resolve(rootDir, 'index.html')
    const htmlContent = fs.readFileSync(indexPath, 'utf-8')

    expect(htmlContent).toMatch(
      /<link\s+rel="preload"[^>]*IBMPlexSans-Regular-Latin1\.woff2[^>]*as="font"/,
    )
    expect(htmlContent).not.toContain('IBMPlexSans-SemiBold')
    expect(htmlContent).not.toContain('IBMPlexMono')
  })

  it('fonts.scss declara as fontes locais Sans (400, 600) e Mono (400) com swap e subconjunto Latin1', () => {
    const fontsScssPath = path.resolve(rootDir, 'src/styles/fonts.scss')
    const scssContent = fs.readFileSync(fontsScssPath, 'utf-8')

    expect(scssContent).toContain("font-family: 'IBM Plex Sans'")
    expect(scssContent).toContain("font-family: 'IBM Plex Mono'")
    expect(scssContent).toContain('font-weight: 400')
    expect(scssContent).toContain('font-weight: 600')
    expect(scssContent).toContain('font-display: swap')
    expect(scssContent).toContain('IBMPlexSans-Regular-Latin1.woff2')
    expect(scssContent).toContain('IBMPlexSans-SemiBold-Latin1.woff2')
    expect(scssContent).toContain('IBMPlexMono-Regular-Latin1.woff2')
  })

  it('licença OFL-IBM-Plex.txt existe na pasta public/licenses', () => {
    const licensePath = path.resolve(rootDir, 'public/licenses/OFL-IBM-Plex.txt')
    expect(fs.existsSync(licensePath)).toBe(true)

    const content = fs.readFileSync(licensePath, 'utf-8')
    expect(content).toContain('SIL OPEN FONT LICENSE Version 1.1')
    expect(content).toContain('IBM Corp.')
  })

  it('legacy-aliases.css resolve --font para IBM Plex Sans e ativa tnum em tabelas', () => {
    const aliasesPath = path.resolve(rootDir, 'src/styles/legacy-aliases.css')
    const cssContent = fs.readFileSync(aliasesPath, 'utf-8')

    expect(cssContent).toMatch(/--font:\s*'IBM Plex Sans'/)
    expect(cssContent).toContain('tabular-nums')
    expect(cssContent).toMatch(/['"]tnum['"]/)
  })
})
