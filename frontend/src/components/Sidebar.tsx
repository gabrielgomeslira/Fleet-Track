import { NavLink } from 'react-router-dom'
import { Truck, LayoutDashboard, Package, Radio } from 'lucide-react'

interface SidebarProps {
  onNavigate?: () => void
}

export default function Sidebar({ onNavigate }: SidebarProps = {}) {
  const links = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/vehicles', label: 'Veículos', icon: Truck },
    { to: '/deliveries', label: 'Entregas', icon: Package },
    { to: '/telemetry', label: 'Telemetria', icon: Radio },
  ]

  return (
    <nav className="sidebar" aria-label="Navegação principal">
      <div className="logo">
        <Truck size={24} />
        FleetTrack
      </div>
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.end}
          className={({ isActive }) => (isActive ? 'active' : '')}
          onClick={() => onNavigate?.()}
        >
          <l.icon size={18} />
          {l.label}
        </NavLink>
      ))}
    </nav>
  )
}
