import { Truck, LayoutDashboard, Package, Radio } from 'lucide-react'
import type { Page } from '../types'

interface Props {
  current: Page
  onNavigate: (page: Page) => void
}

export default function Sidebar({ current, onNavigate }: Props) {
  const links: { page: Page; label: string; icon: typeof Truck }[] = [
    { page: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { page: 'vehicles', label: 'Veículos', icon: Truck },
    { page: 'deliveries', label: 'Entregas', icon: Package },
    { page: 'telemetry', label: 'Telemetria', icon: Radio },
  ]

  return (
    <nav className="sidebar">
      <div className="logo">
        <Truck size={24} />
        FleetTrack
      </div>
      {links.map((l) => (
        <a
          key={l.page}
          href={`#${l.page}`}
          className={current === l.page ? 'active' : ''}
          onClick={(e) => {
            e.preventDefault()
            onNavigate(l.page)
          }}
        >
          <l.icon size={18} />
          {l.label}
        </a>
      ))}
    </nav>
  )
}
