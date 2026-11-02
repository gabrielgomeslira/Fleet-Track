import React from 'react'
import { InlineNotification, ActionableNotification } from '@carbon/react'
import type { EstadoFundo } from './estadoFundo'

export interface AvisoFundoProps {
  estado: EstadoFundo
  onRetry?: () => void
  className?: string
}

/**
 * Aviso de status e falha da base cartográfica (ADR-0016 / T-94 / WCAG 2.2 AA).
 * - Em falha: ActionableNotification inline de baixo destaque com role="status" e botão "Tentar de novo".
 * - Desligado: InlineNotification de informação com role="status" sem retry e sem erro.
 * - Pronto/Carregando/Indisponível: não renderiza nada.
 */
export const AvisoFundo: React.FC<AvisoFundoProps> = ({
  estado,
  onRetry,
  className = '',
}) => {
  if (estado === 'falha') {
    return (
      <ActionableNotification
        inline
        kind="warning"
        lowContrast
        role="status"
        hideCloseButton
        hasFocus={false}
        title="Mapa de fundo indisponível."
        subtitle="Veículos e tabela seguem atualizados."
        actionButtonLabel="Tentar de novo"
        onActionButtonClick={onRetry}
        className={`ft-aviso-fundo ${className}`.trim()}
        data-testid="aviso-fundo-falha"
      />
    )
  }

  if (estado === 'desligado') {
    return (
      <InlineNotification
        kind="info"
        lowContrast
        role="status"
        hideCloseButton
        title="Mapa de fundo desligado nesta instalação."
        className={`ft-aviso-fundo ft-aviso-fundo-desligado ${className}`.trim()}
        data-testid="aviso-fundo-desligado"
      />
    )
  }

  return null
}

export default AvisoFundo
