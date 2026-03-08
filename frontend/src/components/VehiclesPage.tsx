import type { Vehicle } from '../types'
import FleetMap from './FleetMap'

interface Props {
  vehicles: Vehicle[]
}

export default function VehiclesPage({ vehicles }: Props) {
  return (
    <>
      <h1>Veículos</h1>
      <p className="subtitle">Gerenciamento completo da frota</p>
      <FleetMap vehicles={vehicles} />
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
                <td><strong>{v.plate}</strong></td>
                <td>{v.model}</td>
                <td>{v.driverName}</td>
                <td>{v.latitude.toFixed(4)}</td>
                <td>{v.longitude.toFixed(4)}</td>
                <td>{v.speed.toFixed(0)} km/h</td>
                <td>
                  <div className="fuel-bar-wrapper">
                    <div className="fuel-bar" style={{ width: `${v.fuelLevel}%`, background: v.fuelLevel < 30 ? '#ef4444' : v.fuelLevel < 60 ? '#eab308' : '#22c55e' }} />
                  </div>
                  <span style={{ fontSize: '0.75rem' }}>{v.fuelLevel}%</span>
                </td>
                <td>{new Date(v.updatedAt).toLocaleTimeString('pt-BR')}</td>
                <td><span className={`badge ${v.status}`}>{v.status.replace('_', ' ')}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
