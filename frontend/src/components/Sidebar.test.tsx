import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Sidebar from './Sidebar'

describe('Sidebar component', () => {
  it('renderiza os links de navegação para todas as rotas principais', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar />
      </MemoryRouter>,
    )

    const dashboardLink = screen.getByRole('link', { name: /dashboard/i })
    const vehiclesLink = screen.getByRole('link', { name: /veículos/i })
    const deliveriesLink = screen.getByRole('link', { name: /entregas/i })
    const telemetryLink = screen.getByRole('link', { name: /telemetria/i })

    expect(dashboardLink).toBeDefined()
    expect(vehiclesLink).toBeDefined()
    expect(deliveriesLink).toBeDefined()
    expect(telemetryLink).toBeDefined()

    expect(dashboardLink.getAttribute('href')).toBe('/')
    expect(vehiclesLink.getAttribute('href')).toBe('/vehicles')
    expect(deliveriesLink.getAttribute('href')).toBe('/deliveries')
    expect(telemetryLink.getAttribute('href')).toBe('/telemetry')
  })

  it('aplica classe active e aria-current="page" apenas no link correspondente à rota ativa', () => {
    render(
      <MemoryRouter initialEntries={['/vehicles']}>
        <Sidebar />
      </MemoryRouter>,
    )

    const vehiclesLink = screen.getByRole('link', { name: /veículos/i })
    const dashboardLink = screen.getByRole('link', { name: /dashboard/i })
    const deliveriesLink = screen.getByRole('link', { name: /entregas/i })

    expect(vehiclesLink.classList.contains('active')).toBe(true)
    expect(vehiclesLink.getAttribute('aria-current')).toBe('page')

    expect(dashboardLink.classList.contains('active')).toBe(false)
    expect(dashboardLink.getAttribute('aria-current')).toBeNull()

    expect(deliveriesLink.classList.contains('active')).toBe(false)
    expect(deliveriesLink.getAttribute('aria-current')).toBeNull()
  })

  it('chama onNavigate ao clicar em um link', async () => {
    const user = userEvent.setup()
    const handleNavigate = vi.fn()

    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar onNavigate={handleNavigate} />
      </MemoryRouter>,
    )

    const vehiclesLink = screen.getByRole('link', { name: /veículos/i })
    await user.click(vehiclesLink)

    expect(handleNavigate).toHaveBeenCalledTimes(1)
  })
})
