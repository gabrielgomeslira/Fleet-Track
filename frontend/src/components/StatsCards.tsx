import { Truck, Navigation, Package, Gauge } from 'lucide-react'
import type { DashboardStats } from '../types'

interface Props {
  stats: DashboardStats
}

export default function StatsCards({ stats }: Props) {
  const cards = [
    {
      label: 'Total Veículos',
      value: stats.totalVehicles,
      sub: `${stats.enRoute} em rota`,
      color: 'var(--accent)',
      icon: Truck,
    },
    {
      label: 'Em Rota',
      value: stats.enRoute,
      sub: `${stats.stopped} parados`,
      color: '#22c55e',
      icon: Navigation,
    },
    {
      label: 'Entregas',
      value: stats.totalDeliveries,
      sub: `${stats.deliveryRate}% concluídas`,
      color: '#a855f7',
      icon: Package,
    },
    {
      label: 'Vel. Média',
      value: `${stats.avgSpeed}`,
      sub: 'km/h (em rota)',
      color: '#f97316',
      icon: Gauge,
    },
  ]

  return (
    <div className="stats-grid">
      {cards.map((c) => (
        <div key={c.label} className="stat-card">
          <div className="icon-wrapper" style={{ background: `color-mix(in srgb, ${c.color} 12%, transparent)` }}>
            <c.icon size={20} color={c.color} />
          </div>
          <span className="label">{c.label}</span>
          <span className="value">{c.value}</span>
          <span className="sub">{c.sub}</span>
        </div>
      ))}
    </div>
  )
}
