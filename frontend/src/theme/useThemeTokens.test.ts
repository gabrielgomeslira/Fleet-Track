import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useThemeTokens, readThemeTokens } from './useThemeTokens'
import { ThemeProvider, useTheme } from './ThemeProvider'
import { applyTheme } from './theme'

describe('useThemeTokens & readThemeTokens (T-80 / DS §5)', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('style')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('style')
  })

  it('readThemeTokens retorna tokens escuros (g100) por padrão', () => {
    const tokens = readThemeTokens('dark')

    expect(tokens.chartSpeed).toBe('#08bdba')
    expect(tokens.chartFuel).toBe('#42be65')
    expect(tokens.chartDeliveries).toBe('#be95ff')
    expect(tokens.chartEnroute).toBe('#33b1ff')
    expect(tokens.chartStopped).toBe('#f1c21b')
    expect(tokens.chartMaintenance).toBe('#da1e28')
    expect(tokens.chartGrid).toBe('#393939')
    expect(tokens.borderSubtle01).toBe('#393939')
    expect(tokens.textSecondary).toBe('#c6c6c6')
    expect(tokens.textPrimary).toBe('#f4f4f4')
    expect(tokens.layer02).toBe('#393939')
    expect(tokens.dataviz4).toBe('#42be65')

    // Chaves de variáveis CSS idênticas
    expect(tokens['--ft-chart-speed']).toBe('#08bdba')
    expect(tokens['--cds-border-subtle-01']).toBe('#393939')
  })

  it('readThemeTokens retorna tokens claros (g10) quando tema for light', () => {
    const tokens = readThemeTokens('light')

    expect(tokens.chartSpeed).toBe('#007d79')
    expect(tokens.chartFuel).toBe('#198038')
    expect(tokens.chartDeliveries).toBe('#8a3ffc')
    expect(tokens.chartEnroute).toBe('#0072c3')
    expect(tokens.chartStopped).toBe('#b28600')
    expect(tokens.chartMaintenance).toBe('#da1e28')
    expect(tokens.chartGrid).toBe('#e0e0e0')
    expect(tokens.borderSubtle01).toBe('#e0e0e0')
    expect(tokens.textSecondary).toBe('#525252')
    expect(tokens.textPrimary).toBe('#161616')
    expect(tokens.layer02).toBe('#f4f4f4')
    expect(tokens.dataviz4).toBe('#198038')

    expect(tokens['--ft-chart-speed']).toBe('#007d79')
    expect(tokens['--cds-border-subtle-01']).toBe('#e0e0e0')
  })

  it('trocar data-theme no documentElement muda o valor devolvido por useThemeTokens', () => {
    applyTheme('dark')

    const { result } = renderHook(() => useThemeTokens())

    expect(result.current.chartSpeed).toBe('#08bdba')
    expect(result.current.chartEnroute).toBe('#33b1ff')
    expect(result.current.chartStopped).toBe('#f1c21b')
    expect(result.current.borderSubtle01).toBe('#393939')

    act(() => {
      applyTheme('light')
    })

    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(result.current.chartSpeed).toBe('#007d79')
    expect(result.current.chartEnroute).toBe('#0072c3')
    expect(result.current.chartStopped).toBe('#b28600')
    expect(result.current.borderSubtle01).toBe('#e0e0e0')

    act(() => {
      applyTheme('dark')
    })

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(result.current.chartSpeed).toBe('#08bdba')
    expect(result.current.chartEnroute).toBe('#33b1ff')
  })

  it('useThemeTokens atualiza reativamente quando o tema do ThemeProvider é alterado', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(ThemeProvider, null, children)

    const { result } = renderHook(
      () => {
        const themeCtx = useTheme()
        const tokens = useThemeTokens()
        return { themeCtx, tokens }
      },
      { wrapper },
    )

    expect(result.current.tokens.chartSpeed).toBe('#08bdba')

    act(() => {
      result.current.themeCtx.setTheme('light')
    })

    expect(result.current.tokens.chartSpeed).toBe('#007d79')
    expect(result.current.tokens.chartEnroute).toBe('#0072c3')
    expect(result.current.tokens.chartStopped).toBe('#b28600')

    act(() => {
      result.current.themeCtx.setTheme('dark')
    })

    expect(result.current.tokens.chartSpeed).toBe('#08bdba')
    expect(result.current.tokens.chartEnroute).toBe('#33b1ff')
  })

  it('lê valores dinâmicos de getComputedStyle quando definidos em documentElement', () => {
    document.documentElement.style.setProperty('--ft-chart-speed', '#123456')
    document.documentElement.style.setProperty('--cds-border-subtle-01', '#abcdef')

    const tokens = readThemeTokens('dark')

    expect(tokens.chartSpeed).toBe('#123456')
    expect(tokens.borderSubtle01).toBe('#abcdef')
  })

  it('garante contraste das fatias contra --cds-layer-01 >= 3:1 nos dois temas', () => {
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

    // g100 (layer-01 = #262626)
    const g100Tokens = readThemeTokens('dark')
    const g100Layer01 = '#262626'
    expect(getContrast(g100Tokens.chartEnroute, g100Layer01)).toBeGreaterThanOrEqual(3.0)
    expect(getContrast(g100Tokens.chartStopped, g100Layer01)).toBeGreaterThanOrEqual(3.0)
    expect(getContrast(g100Tokens.chartMaintenance, g100Layer01)).toBeGreaterThanOrEqual(3.0)

    // g10 (layer-01 = #ffffff)
    const g10Tokens = readThemeTokens('light')
    const g10Layer01 = '#ffffff'
    expect(getContrast(g10Tokens.chartEnroute, g10Layer01)).toBeGreaterThanOrEqual(3.0)
    expect(getContrast(g10Tokens.chartStopped, g10Layer01)).toBeGreaterThanOrEqual(3.0)
    expect(getContrast(g10Tokens.chartMaintenance, g10Layer01)).toBeGreaterThanOrEqual(3.0)
  })
})
