export type Theme = 'light' | 'dark'

export const THEME_KEY = 'ft-theme'

export function getSystemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'dark'
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function getStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') {
      return stored
    }
  } catch {
    // Falha silenciosa para acesso bloqueado ao localStorage
  }
  return null
}

export function resolveTheme(): Theme {
  const stored = getStoredTheme()
  if (stored) {
    return stored
  }
  return getSystemTheme()
}

export function applyTheme(theme: Theme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ft-theme-change', { detail: { theme } }))
    }
  }
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Falha silenciosa se localStorage não estiver disponível
  }
  applyTheme(theme)
}

export function clearStoredTheme(): void {
  try {
    localStorage.removeItem(THEME_KEY)
  } catch {
    // Falha silenciosa
  }
  applyTheme(getSystemTheme())
}
