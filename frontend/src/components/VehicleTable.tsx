import StatusBadge from './StatusBadge'
import { formatarPercentual, formatarVelocidade } from '../formatos'
import type { Vehicle } from '../types'

interface Props {
  vehicles: Vehicle[]
}

export default function VehicleTable({ vehicles }: Props) {
  return (
    <div className="table-card">
      <h3>Veículos</h3>
      <table>
        <thead>
          <tr>
            <th>Placa</th>
            <th>Motorista</th>
            <th>Modelo</th>
            <th>Vel.</th>
            <th>Comb.</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {vehicles.map((v) => (
            <tr key={v.id}>
              <td>
                <strong>{v.plate}</strong>
              </td>
              <td>{v.driverName}</td>
              <td>{v.model}</td>
              <td>{formatarVelocidade(v.speed)}</td>
              <td>{formatarPercentual(v.fuelLevel)}</td>
              <td>
                <StatusBadge status={v.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
