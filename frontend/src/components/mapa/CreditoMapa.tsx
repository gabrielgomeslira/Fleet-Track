import React, { useMemo } from 'react'
import { parseCreditoMapa } from './mapaUtils'

export interface CreditoMapaProps {
  credit?: string
  desligado?: boolean
  className?: string
}

/**
 * Componente React customizado para exibição dos créditos legais da base cartográfica.
 * Renderizado fora do canvas MapLibre para eliminar o .maplibregl-ctrl-attrib padrão do DOM (ADR-0016 item 9).
 */
export const CreditoMapa: React.FC<CreditoMapaProps> = ({ credit, desligado, className }) => {
  const itens = useMemo(() => {
    if (desligado) return []
    return parseCreditoMapa(credit)
  }, [credit, desligado])

  if (desligado || itens.length === 0) {
    return null
  }

  return (
    <div
      className={`ft-map-credit ${className || ''}`}
      role="complementary"
      aria-label="Atribuição cartográfica"
      data-testid="map-credit"
    >
      {itens.map((item, idx) => (
        <React.Fragment key={item.texto + idx}>
          {idx > 0 && <span className="ft-map-credit-sep"> · </span>}
          {item.link ? (
            <a
              href={item.link}
              target="_blank"
              rel="noreferrer noopener"
              className="ft-map-credit-link"
            >
              {item.texto}
            </a>
          ) : (
            <span className="ft-map-credit-text">{item.texto}</span>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

export default CreditoMapa
