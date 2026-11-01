import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react'
import { Theme, resolveTheme, applyTheme, setTheme as persistTheme, getStoredTheme } from './theme'

export interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export interface ThemeProviderProps {
  children: React.ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setCurrentTheme] = useState<Theme>(resolveTheme)

  const setTheme = useCallback((newTheme: Theme) => {
    persistTheme(newTheme)
    setCurrentTheme(newTheme)
  }, [])

  const toggleTheme = useCallback(() => {
    setCurrentTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      persistTheme(next)
      return next
    })
  }, [])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)')
    const handleChange = (e: MediaQueryListEvent) => {
      if (!getStoredTheme()) {
        const systemTheme: Theme = e.matches ? 'light' : 'dark'
        applyTheme(systemTheme)
        setCurrentTheme(systemTheme)
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
    }),
    [theme, setTheme, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
