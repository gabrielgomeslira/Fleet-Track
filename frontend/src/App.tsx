import { useEffect, useState, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import StatsCards from './components/StatsCards'
import FleetMap from './components/FleetMap'
import DeliveryChart from './components/DeliveryChart'
import StatusChart from './components/StatusChart'
import VehicleTable from './components/VehicleTable'
import DeliveryTable from './components/DeliveryTable'
import VehiclesPage from './components/VehiclesPage'
import DeliveriesPage from './components/DeliveriesPage'
import TelemetryPage from './components/TelemetryPage'
import { api } from './api'
import type { Vehicle, Delivery, DashboardStats } from './types'

export function AppContent({
  vehicles,
  deliveries,
  stats,
}: {
  vehicles: Vehicle[]
  deliveries: Delivery[]
  stats: DashboardStats
}) {
  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <Routes>
          <Route
            path="/"
            element={
              <>
                <h1>Dashboard de Frota</h1>
                <p className="subtitle">Monitoramento em tempo real da frota logística</p>
                <StatsCards stats={stats} />
                <FleetMap vehicles={vehicles} />
                <div className="charts-row">
                  <DeliveryChart stats={stats} />
                  <StatusChart stats={stats} />
                </div>
                <div className="tables-row">
                  <VehicleTable vehicles={vehicles} />
                  <DeliveryTable deliveries={deliveries} />
                </div>
              </>
            }
          />
          <Route path="/vehicles" element={<VehiclesPage vehicles={vehicles} />} />
          <Route path="/deliveries" element={<DeliveriesPage />} />
          <Route path="/telemetry" element={<TelemetryPage vehicles={vehicles} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [v, d, s] = await Promise.all([api.getVehicles(), api.getDeliveries(), api.getStats()])
      setVehicles(v)
      setDeliveries(d)
      setStats(s)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        await api.simulate()
        await fetchData()
      } catch {
        // Ignora erros na simulação periódica
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [fetchData])

  if (loading || !stats) {
    return <div className="loading">Carregando dashboard...</div>
  }

  return (
    <BrowserRouter>
      <AppContent vehicles={vehicles} deliveries={deliveries} stats={stats} />
    </BrowserRouter>
  )
}
