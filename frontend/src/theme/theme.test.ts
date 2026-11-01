import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import {
  THEME_KEY,
  getSystemTheme,
  getStoredTheme,
  resolveTheme,
  applyTheme,
  setTheme,
  clearStoredTheme,
} from './theme'
import { ThemeProvider, useTheme } from './ThemeProvider'

describe('Theme Logic (theme.ts)', () => {
  let matchMediaMock: ReturnType<typeof vi.fn>
  let listeners: ((e: MediaQueryListEvent) => void)[]

  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    listeners = []

    matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((event: string, cb: (e: MediaQueryListEvent) => void) => {
        if (event === 'change') {
          listeners.push(cb)
        }
      }),
      removeEventListener: vi.fn((event: string, cb: (e: MediaQueryListEvent) => void) => {
        listeners = listeners.filter((l) => l !== cb)
      }),
      dispatchEvent: vi.fn(),
    }))

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMediaMock,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('getSystemTheme retorna "light" quando prefers-color-scheme: light for verdadeiro', () => {
    matchMediaMock.mockImplementation((query: string) => ({
      matches: query.includes('light'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    expect(getSystemTheme()).toBe('light')
  })

  it('getSystemTheme retorna "dark" quando prefers-color-scheme: light for falso', () => {
    matchMediaMock.mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    expect(getSystemTheme()).toBe('dark')
  })

  it('getStoredTheme retorna o tema gravado no localStorage', () => {
    localStorage.setItem(THEME_KEY, 'light')
    expect(getStoredTheme()).toBe('light')

    localStorage.setItem(THEME_KEY, 'dark')
    expect(getStoredTheme()).toBe('dark')
  })

  it('getStoredTheme retorna null para valores inválidos ou ausentes', () => {
    expect(getStoredTheme()).toBeNull()

    localStorage.setItem(THEME_KEY, 'invalid')
    expect(getStoredTheme()).toBeNull()
  })

  it('getStoredTheme trata exceções do localStorage sem quebrar', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Access denied')
    })

    expect(getStoredTheme()).toBeNull()
  })

  it('resolveTheme prioriza tema armazenado sobre o tema do sistema', () => {
    matchMediaMock.mockImplementation(() => ({
      matches: true, // sistema claro
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    localStorage.setItem(THEME_KEY, 'dark')

    expect(resolveTheme()).toBe('dark')
  })

  it('resolveTheme cai para o tema do sistema quando localStorage estiver vazio ou falhar', () => {
    matchMediaMock.mockImplementation((query: string) => ({
      matches: query.includes('light'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    expect(resolveTheme()).toBe('light')

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(resolveTheme()).toBe('light')
  })

  it('applyTheme atualiza o atributo data-theme em documentElement', () => {
    applyTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')

    applyTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('setTheme grava no localStorage e aplica em documentElement', () => {
    setTheme('light')
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')

    setTheme('dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('setTheme trata erro ao salvar no localStorage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    expect(() => setTheme('light')).not.toThrow()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('clearStoredTheme limpa a chave e aplica o tema do sistema', () => {
    localStorage.setItem(THEME_KEY, 'dark')
    matchMediaMock.mockImplementation((query: string) => ({
      matches: query.includes('light'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    clearStoredTheme()
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})

describe('ThemeProvider & useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lança erro se useTheme for usado fora de ThemeProvider', () => {
    expect(() => renderHook(() => useTheme())).toThrow(
      'useTheme must be used within a ThemeProvider',
    )
  })

  it('provê tema atual e permite alteração via setTheme e toggleTheme', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(ThemeProvider, null, children)

    const { result } = renderHook(() => useTheme(), { wrapper })

    expect(result.current.theme).toBeDefined()

    act(() => {
      result.current.setTheme('light')
    })
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem(THEME_KEY)).toBe('light')

    act(() => {
      result.current.toggleTheme()
    })
    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
  })
})

describe('theme-init.js (lógica síncrona no head)', () => {
  const themeInitScriptPath = path.resolve(process.cwd(), 'public/theme-init.js')
  const themeInitScript = fs.readFileSync(themeInitScriptPath, 'utf-8')

  function runInitScript() {
    window.eval(themeInitScript)
  }

  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('grava data-theme="light" quando sistema for claro e sem escolha salva', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('light'),
      })),
    })

    runInitScript()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('grava data-theme="dark" quando sistema for escuro e sem escolha salva', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
      })),
    })

    runInitScript()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('grava data-theme="dark" quando localStorage tiver "dark" mesmo com sistema claro', () => {
    localStorage.setItem('ft-theme', 'dark')
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('light'),
      })),
    })

    runInitScript()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('trata erro de acesso ao localStorage e segue tema do sistema', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Access denied')
    })
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('light'),
      })),
    })

    expect(() => runInitScript()).not.toThrow()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})
