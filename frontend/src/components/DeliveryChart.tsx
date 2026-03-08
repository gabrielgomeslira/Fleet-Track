import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { DashboardStats } from '../types'

interface Props {
  stats: DashboardStats
}

export default function DeliveryChart({ stats }: Props) {
  const data = stats.deliveriesPerDay.map((d) => ({
    date: new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    entregas: d.count,
  }))

  return (
    <div className="chart-card">
      <h3>Entregas por Dia (14 dias)</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2e3244" />
          <XAxis dataKey="date" tick={{ fill: '#9aa0b0', fontSize: 12 }} />
          <YAxis tick={{ fill: '#9aa0b0', fontSize: 12 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: '#222535', border: '1px solid #2e3244', borderRadius: 8 }}
            labelStyle={{ color: '#e8eaed' }}
          />
          <Bar dataKey="entregas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
