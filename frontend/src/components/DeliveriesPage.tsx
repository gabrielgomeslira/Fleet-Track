import { useState, useEffect } from 'react'
import { api } from '../api'
import type { Delivery } from '../types'

const STATUSES = [
  { value: '', label: 'Todos' },
  { value: 'pendente', label: 'Pendente' },
  { value: 'em_transito', label: 'Em Trânsito' },
  { value: 'entregue', label: 'Entregue' },
  { value: 'cancelado', label: 'Cancelado' },
]

export default function DeliveriesPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [filter, setFilter] = useState('')

  useEffect(() => {
    api.getDeliveries(filter || undefined).then(setDeliveries).catch(console.error)
  }, [filter])

  return (
    <>
      <h1>Entregas</h1>
      <p className="subtitle">Acompanhamento de todas as entregas</p>
      <div className="filter-bar">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            className={`filter-btn ${filter === s.value ? 'active' : ''}`}
            onClick={() => setFilter(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="table-card" style={{ marginBottom: 28 }}>
        <h3>
          {filter ? `Entregas — ${STATUSES.find((s) => s.value === filter)?.label}` : 'Todas as Entregas'}
          <span style={{ fontWeight: 400, color: '#9aa0b0', marginLeft: 8 }}>({deliveries.length})</span>
        </h3>
        <table>
          <thead>
            <tr>
              <th>Veículo</th>
              <th>Origem</th>
              <th>Destino</th>
              <th>Status</th>
              <th>Criado em</th>
              <th>Entregue em</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((d) => (
              <tr key={d.id}>
                <td><strong>{d.vehiclePlate}</strong></td>
                <td>{d.origin}</td>
                <td>{d.destination}</td>
                <td><span className={`badge ${d.status}`}>{d.status.replace('_', ' ')}</span></td>
                <td>{new Date(d.createdAt).toLocaleDateString('pt-BR')}</td>
                <td>{d.deliveredAt ? new Date(d.deliveredAt).toLocaleDateString('pt-BR') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
