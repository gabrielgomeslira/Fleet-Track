import { lazy, Suspense } from 'react'
import { SkeletonText } from '@carbon/react'
import { formatarHora, formatarPercentual, formatarVelocidade } from '../formatos'
import StatusBadge from './StatusBadge'
import type { Vehicle } from '../types'

const FleetMap = lazy(() => import('./FleetMap'))

interface Props {
  vehicles: Vehicle[]
}

export default function VehiclesPage({ vehicles }: Props) {
  return (
    <>
      <h1>Veículos</h1>
      <p className="subtitle">Gerenciamento completo da frota</p>
      <Suspense fallback={<SkeletonText paragraph lineCount={3} />}>
        <FleetMap vehicles={vehicles} />
      </Suspense>
      <div className="table-card" style={{ marginBottom: 28 }}>
        <h3>Todos os Veículos</h3>
        <table>
          <thead>
            <tr>
              <th>Placa</th>
              <th>Modelo</th>
              <th>Motorista</th>
              <th>Latitude</th>
              <th>Longitude</th>
              <th>Velocidade</th>
              <th>Combustível</th>
              <th>Atualizado</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id}>
                <td>
                  <strong>{v.plate}</strong>
                </td>
                <td>{v.model}</td>
                <td>{v.driverName}</td>
                <td>{v.latitude != null ? v.latitude.toFixed(4) : 'sem dado'}</td>
                <td>{v.longitude != null ? v.longitude.toFixed(4) : 'sem dado'}</td>
                <td>{formatarVelocidade(v.speed)}</td>
                <td>
                  {v.fuelLevel != null && (
                    <div className="fuel-bar-wrapper">
                      <div
                        className="fuel-bar"
                        style={{
                          width: `${v.fuelLevel}%`,
                          background:
                            v.fuelLevel < 30 ? '#ef4444' : v.fuelLevel < 60 ? '#eab308' : '#22c55e',
                        }}
                      />
                    </div>
                  )}
                  <span style={{ fontSize: '0.75rem' }}>{formatarPercentual(v.fuelLevel)}</span>
                </td>
                <td>{formatarHora(v.updatedAt)}</td>
                <td>
                  <StatusBadge status={v.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
