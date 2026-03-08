import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { api } from '../api'
import type { Vehicle, TelemetryRecord } from '../types'

interface Props {
  vehicles: Vehicle[]
}

export default function TelemetryPage({ vehicles }: Props) {
  const [selectedId, setSelectedId] = useState<string>('')
  const [records, setRecords] = useState<TelemetryRecord[]>([])

  useEffect(() => {
    if (!selectedId) {
      setRecords([])
      return
    }
    api.getTelemetry(selectedId).then(setRecords).catch(console.error)
  }, [selectedId])

  const chartData = [...records].reverse().map((r) => ({
    time: new Date(r.recordedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    speed: Math.round(r.speed),
    fuel: r.fuelLevel,
  }))

  const selected = vehicles.find((v) => v.id === selectedId)

  return (
    <>
      <h1>Telemetria</h1>
      <p className="subtitle">Histórico de telemetria por veículo</p>
      <div className="filter-bar">
        <select
          className="select-vehicle"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">Selecione um veículo</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>{v.plate} — {v.driverName}</option>
          ))}
        </select>
      </div>

      {selected && (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
          <div className="stat-card">
            <span className="label">Placa</span>
            <span className="value" style={{ fontSize: '1.2rem' }}>{selected.plate}</span>
          </div>
          <div className="stat-card">
            <span className="label">Velocidade Atual</span>
            <span className="value" style={{ fontSize: '1.2rem' }}>{selected.speed.toFixed(0)} km/h</span>
          </div>
          <div className="stat-card">
            <span className="label">Combustível</span>
            <span className="value" style={{ fontSize: '1.2rem' }}>{selected.fuelLevel}%</span>
          </div>
          <div className="stat-card">
            <span className="label">Status</span>
            <span className="value" style={{ fontSize: '1.2rem' }}><span className={`badge ${selected.status}`}>{selected.status.replace('_', ' ')}</span></span>
          </div>
        </div>
      )}

      {records.length > 0 && (
        <div className="charts-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="chart-card">
            <h3>Velocidade (km/h)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2e3244" />
                <XAxis dataKey="time" tick={{ fill: '#9aa0b0', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9aa0b0', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#222535', border: '1px solid #2e3244', borderRadius: 8 }} />
                <Line type="monotone" dataKey="speed" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-card">
            <h3>Combustível (%)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2e3244" />
                <XAxis dataKey="time" tick={{ fill: '#9aa0b0', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9aa0b0', fontSize: 11 }} domain={[0, 100]} />
                <Tooltip contentStyle={{ background: '#222535', border: '1px solid #2e3244', borderRadius: 8 }} />
                <Line type="monotone" dataKey="fuel" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {selectedId && records.length > 0 && (
        <div className="table-card" style={{ marginTop: 16, marginBottom: 28 }}>
          <h3>Registros de Telemetria ({records.length})</h3>
          <table>
            <thead>
              <tr>
                <th>Horário</th>
                <th>Latitude</th>
                <th>Longitude</th>
                <th>Velocidade</th>
                <th>Combustível</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.recordedAt).toLocaleString('pt-BR')}</td>
                  <td>{r.latitude.toFixed(4)}</td>
                  <td>{r.longitude.toFixed(4)}</td>
                  <td>{r.speed.toFixed(0)} km/h</td>
                  <td>{r.fuelLevel}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedId && records.length === 0 && (
        <div className="chart-card" style={{ textAlign: 'center', padding: 40, color: '#9aa0b0' }}>
          Nenhum registro de telemetria encontrado.
        </div>
      )}

      {!selectedId && (
        <div className="chart-card" style={{ textAlign: 'center', padding: 40, color: '#9aa0b0' }}>
          Selecione um veículo para visualizar a telemetria.
        </div>
      )}
    </>
  )
}
