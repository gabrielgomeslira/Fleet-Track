import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Label } from 'recharts'
import type { DashboardStats } from '../types'
import { getStatusConfig } from '../status'
import { useThemeTokens } from '../theme/useThemeTokens'
import ChartTooltip from './charts/ChartTooltip'

interface Props {
  stats: DashboardStats
}

export default function StatusChart({ stats }: Props) {
  const tokens = useThemeTokens()

  const total = stats.totalVehicles ?? stats.enRoute + stats.stopped + stats.maintenance
  const percentEnRoute = total > 0 ? Math.round((stats.enRoute / total) * 100) : 0
  const percentStopped = total > 0 ? Math.round((stats.stopped / total) * 100) : 0
  const percentMaintenance = total > 0 ? Math.round((stats.maintenance / total) * 100) : 0

  const data = [
    {
      name: 'Em rota',
      value: stats.enRoute,
      color: tokens.chartEnroute,
      key: 'em_rota',
      legendDescription: 'em rota',
      percent: percentEnRoute,
      icon: getStatusConfig('em_rota').icon,
    },
    {
      name: 'Parado',
      value: stats.stopped,
      color: tokens.chartStopped,
      key: 'parado',
      legendDescription: 'parado',
      percent: percentStopped,
      icon: getStatusConfig('parado').icon,
    },
    {
      name: 'Manutenção',
      value: stats.maintenance,
      color: tokens.chartMaintenance,
      key: 'manutencao',
      legendDescription: 'em manutenção',
      percent: percentMaintenance,
      icon: getStatusConfig('manutencao').icon,
    },
  ]

  return (
    <div className="chart-card">
      <h3>Disponibilidade da frota</h3>
      <div className="ft-availability-chart">
        <div className="ft-availability-chart__graphic">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                dataKey="value"
                paddingAngle={0}
                isAnimationActive={false}
              >
                {data.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
                <Label
                  position="center"
                  content={({ viewBox }) => {
                    if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) return null
                    const { cx, cy } = viewBox as { cx: number; cy: number }
                    return (
                      <text
                        x={cx}
                        y={cy}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={tokens.textPrimary}
                        style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: '24px',
                          fontWeight: 600,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                        className="ft-chart-center-label"
                      >
                        {total}
                      </text>
                    )
                  }}
                />
              </Pie>
              <Tooltip content={<ChartTooltip unit="veículos" />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div
          className="ft-availability-chart__legend"
          role="list"
          aria-label="Legenda de status da frota"
        >
          {data.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.key} className="ft-availability-legend__item" role="listitem">
                <span
                  className="ft-availability-legend__indicator"
                  style={{ backgroundColor: item.color }}
                  aria-hidden="true"
                />
                <span className="ft-availability-legend__icon" aria-hidden="true">
                  <Icon size={16} />
                </span>
                <span className="ft-availability-legend__text">
                  <strong className="ft-availability-legend__numbers">{item.value}</strong>{' '}
                  {item.legendDescription}{' '}
                  <span className="ft-availability-legend__numbers">({item.percent} %)</span>
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
