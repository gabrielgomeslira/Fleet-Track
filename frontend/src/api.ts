import type { Vehicle, Delivery, DashboardStats, TelemetryRecord } from './types'

const BASE = '/api'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function post<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'POST' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export const api = {
  getVehicles: () => get<Vehicle[]>('/vehicles'),
  getDeliveries: (status?: string) =>
    get<Delivery[]>(`/deliveries${status ? `?status=${status}` : ''}`),
  getStats: () => get<DashboardStats>('/dashboard/stats'),
  getTelemetry: (vehicleId: string) => get<TelemetryRecord[]>(`/telemetry/${vehicleId}`),
  simulate: () => post<{ updated: number }>('/telemetry/simulate'),
}
