import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import type { DashboardStats } from '../types'

interface Props {
  stats: DashboardStats
}

const COLORS = ['#3b82f6', '#eab308', '#ef4444']

export default function StatusChart({ stats }: Props) {
  const data = [
    { name: 'Em Rota', value: stats.enRoute },
    { name: 'Parado', value: stats.stopped },
    { name: 'Manutenção', value: stats.maintenance },
  ]

  return (
    <div className="chart-card">
      <h3>Status dos Veículos</h3>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={90}
            dataKey="value"
            paddingAngle={4}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#222535', border: '1px solid #2e3244', borderRadius: 8 }}
          />
          <Legend
            formatter={(value) => <span style={{ color: '#9aa0b0', fontSize: 12 }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
