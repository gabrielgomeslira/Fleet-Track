export interface Vehicle {
  id: string
  plate: string
  model: string
  driverName: string
  status: string
  latitude: number
  longitude: number
  speed: number
  fuelLevel: number
  updatedAt: string
}

export interface Delivery {
  id: string
  vehicleId: string
  vehiclePlate: string
  origin: string
  destination: string
  status: string
  createdAt: string
  deliveredAt: string | null
}

export interface TelemetryRecord {
  id: string
  latitude: number
  longitude: number
  speed: number
  fuelLevel: number
  recordedAt: string
}

export type Page = 'dashboard' | 'vehicles' | 'deliveries' | 'telemetry'

export interface DashboardStats {
  totalVehicles: number
  enRoute: number
  stopped: number
  maintenance: number
  totalDeliveries: number
  delivered: number
  inTransit: number
  pending: number
  cancelled: number
  avgSpeed: number
  deliveryRate: number
  deliveriesPerDay: { date: string; count: number }[]
}
