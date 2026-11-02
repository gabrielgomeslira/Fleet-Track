import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { AvisoFundo } from './AvisoFundo'

describe('Componente AvisoFundo (T-94 / ADR-0016)', () => {
  it('renderiza notificação de baixo destaque com role="status" e botão "Tentar de novo" em caso de falha', () => {
    const onRetry = vi.fn()
    render(<AvisoFundo estado="falha" onRetry={onRetry} />)

    const alerta = screen.getByRole('status')
    expect(alerta).not.toBeNull()
    expect(alerta.className).toContain('cds--actionable-notification--low-contrast')

    expect(screen.getByText('Mapa de fundo indisponível.')).not.toBeNull()
    expect(screen.getByText('Veículos e tabela seguem atualizados.')).not.toBeNull()

    const botaoRetry = screen.getByRole('button', { name: /Tentar de novo/i })
    expect(botaoRetry).not.toBeNull()

    fireEvent.click(botaoRetry)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renderiza aviso de instalação com fundo desligado sem botão de retry e sem aviso de erro', () => {
    const onRetry = vi.fn()
    render(<AvisoFundo estado="desligado" onRetry={onRetry} />)

    const alerta = screen.getByRole('status')
    expect(alerta).not.toBeNull()
    expect(alerta.className).toContain('cds--inline-notification--info')
    expect(screen.getByText('Mapa de fundo desligado nesta instalação.')).not.toBeNull()

    // Sem botão de nova tentativa
    expect(screen.queryByRole('button', { name: /Tentar de novo/i })).toBeNull()
    // Sem menção a falha/erro
    expect(screen.queryByText(/indisponível/i)).toBeNull()
  })

  it('não renderiza nada nos estados saudáveis (pronto ou carregando) nem indisponível', () => {
    const { container: c1 } = render(<AvisoFundo estado="pronto" />)
    expect(c1.firstChild).toBeNull()

    const { container: c2 } = render(<AvisoFundo estado="carregando" />)
    expect(c2.firstChild).toBeNull()

    const { container: c3 } = render(<AvisoFundo estado="indisponivel" />)
    expect(c3.firstChild).toBeNull()
  })
})
