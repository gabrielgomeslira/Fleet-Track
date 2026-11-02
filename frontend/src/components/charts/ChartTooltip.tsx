import type { ReactNode } from 'react'

export interface ChartTooltipPayloadItem {
  name?: string
  value?: number | string
  color?: string
  dataKey?: string | number
  unit?: string
  payload?: Record<string, unknown>
}

export interface ChartTooltipProps {
  active?: boolean
  payload?: ChartTooltipPayloadItem[]
  label?: string | number
  unit?: string
}

export function ChartTooltip({ active, payload, label, unit }: ChartTooltipProps): ReactNode {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  return (
    <div
      className="ft-chart-tooltip"
      style={{
        backgroundColor: 'var(--cds-layer-02)',
        border: '1px solid var(--cds-border-subtle-01)',
        borderRadius: 0,
        padding: '8px 12px',
        color: 'var(--cds-text-primary)',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
      }}
    >
      {label !== undefined && label !== '' && (
        <div
          className="ft-chart-tooltip__label"
          style={{
            fontSize: '12px',
            color: 'var(--cds-text-secondary)',
            marginBottom: '4px',
            fontFamily: "'IBM Plex Sans', sans-serif",
          }}
        >
          {label}
        </div>
      )}
      <div
        className="ft-chart-tooltip__items"
        style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
      >
        {payload.map((item, index) => (
          <div
            key={index}
            className="ft-chart-tooltip__item"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
              lineHeight: 1.4,
            }}
          >
            {item.color && (
              <span
                className="ft-chart-tooltip__swatch"
                style={{
                  width: '8px',
                  height: '8px',
                  backgroundColor: item.color,
                  display: 'inline-block',
                  borderRadius: 0,
                  flexShrink: 0,
                }}
              />
            )}
            {item.name && (
              <span
                className="ft-chart-tooltip__name"
                style={{
                  color: 'var(--cds-text-secondary)',
                  fontFamily: "'IBM Plex Sans', sans-serif",
                }}
              >
                {item.name}:
              </span>
            )}
            <span
              className="ft-chart-tooltip__value"
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 600,
                color: 'var(--cds-text-primary)',
              }}
            >
              {item.value}
              {unit ? ` ${unit}` : item.unit ? ` ${item.unit}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ChartTooltip
