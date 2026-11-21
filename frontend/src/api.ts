import type { Vehicle, Delivery, DashboardStats, TelemetryRecord, VehicleRoute } from './types'

const BASE = '/api'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export const api = {
  getVehicles: () => get<Vehicle[]>('/vehicles'),
  getDeliveries: (status?: string) =>
    get<Delivery[]>(`/deliveries${status ? `?status=${status}` : ''}`),
  getStats: () => get<DashboardStats>('/dashboard/stats'),
  getTelemetry: (vehicleId: string) => get<TelemetryRecord[]>(`/telemetry/${vehicleId}`),
  getRoute: (vehicleId: string, from: string, to: string) =>
    get<VehicleRoute>(
      `/telemetry/${vehicleId}/route?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
}
