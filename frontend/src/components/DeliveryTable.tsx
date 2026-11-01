import { formatarDia } from '../formatos'
import type { Delivery } from '../types'

interface Props {
  deliveries: Delivery[]
}

export default function DeliveryTable({ deliveries }: Props) {
  return (
    <div className="table-card">
      <h3>Entregas Recentes</h3>
      <table>
        <thead>
          <tr>
            <th>Veículo</th>
            <th>Origem</th>
            <th>Destino</th>
            <th>Status</th>
            <th>Data</th>
          </tr>
        </thead>
        <tbody>
          {deliveries.slice(0, 10).map((d) => (
            <tr key={d.id}>
              <td>
                <strong>{d.vehiclePlate}</strong>
              </td>
              <td>{d.origin}</td>
              <td>{d.destination}</td>
              <td>
                <span className={`badge ${d.status}`}>{d.status.replace('_', ' ')}</span>
              </td>
              <td>{formatarDia(d.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
