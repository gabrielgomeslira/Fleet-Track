export interface Vehicle {
  id: string
  plate: string
  model: string
  driverName: string
  status: string
  latitude: number | null
  longitude: number | null
  speed: number | null
  fuelLevel: number | null
  updatedAt: string
  lastSignalAt?: string | null
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
  speed: number | null
  fuelLevel: number | null
  recordedAt: string
}

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
  avgSpeed: number | null
  deliveryRate: number
  deliveriesPerDay: { date: string; count: number }[]
}
