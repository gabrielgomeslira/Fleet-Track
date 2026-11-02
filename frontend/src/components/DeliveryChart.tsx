import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { formatarDia } from '../formatos'
import type { DashboardStats } from '../types'
import { useThemeTokens } from '../theme/useThemeTokens'
import ChartTooltip from './charts/ChartTooltip'

interface Props {
  stats: DashboardStats
}

export default function DeliveryChart({ stats }: Props) {
  const tokens = useThemeTokens()

  const data = stats.deliveriesPerDay.map((d) => ({
    date: formatarDia(d.date, { day: '2-digit', month: '2-digit' }),
    entregas: d.count,
  }))

  return (
    <div className="chart-card">
      <h3>Entregas por Dia (14 dias)</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={tokens.borderSubtle01} />
          <XAxis
            dataKey="date"
            stroke={tokens.borderSubtle01}
            tick={{
              fill: tokens.textSecondary,
              fontSize: 11,
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          />
          <YAxis
            stroke={tokens.borderSubtle01}
            tick={{
              fill: tokens.textSecondary,
              fontSize: 11,
              fontFamily: "'IBM Plex Mono', monospace",
            }}
            allowDecimals={false}
          />
          <Tooltip content={<ChartTooltip unit="entregas" />} />
          <Bar
            dataKey="entregas"
            name="Entregas concluídas por dia"
            fill={tokens.dataviz4}
            radius={[0, 0, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
