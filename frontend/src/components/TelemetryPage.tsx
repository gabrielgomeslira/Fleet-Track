import { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { api } from '../api'
import { formatarHora, formatarInstante, formatarPercentual, formatarVelocidade } from '../formatos'
import type { Vehicle, TelemetryRecord } from '../types'
import StatusBadge from './StatusBadge'
import { useThemeTokens } from '../theme/useThemeTokens'
import ChartTooltip from './charts/ChartTooltip'

interface Props {
  vehicles: Vehicle[]
}

export default function TelemetryPage({ vehicles }: Props) {
  const tokens = useThemeTokens()
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
    time: formatarHora(r.recordedAt, { hour: '2-digit', minute: '2-digit' }),
    speed: r.speed != null ? Math.round(r.speed) : null,
    fuel: r.fuelLevel != null ? r.fuelLevel : null,
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
            <option key={v.id} value={v.id}>
              {v.plate} — {v.driverName}
            </option>
          ))}
        </select>
      </div>

      {selected && (
        <div
          className="stats-grid"
          style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}
        >
          <div className="stat-card">
            <span className="label">Placa</span>
            <span className="value" style={{ fontSize: '1.2rem' }}>
              {selected.plate}
            </span>
          </div>
          <div className="stat-card">
            <span className="label">Velocidade Atual</span>
            <span className="value" style={{ fontSize: '1.2rem' }}>
              {formatarVelocidade(selected.speed)}
            </span>
          </div>
          <div className="stat-card">
            <span className="label">Combustível</span>
            <span className="value" style={{ fontSize: '1.2rem' }}>
              {formatarPercentual(selected.fuelLevel)}
            </span>
          </div>
          <div className="stat-card">
            <span className="label">Status</span>
            <span className="value" style={{ fontSize: '1.2rem' }}>
              <StatusBadge status={selected.status} />
            </span>
          </div>
        </div>
      )}

      {records.length > 0 && (
        <div className="charts-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="chart-card">
            <h3>Velocidade (km/h)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={tokens.borderSubtle01} />
                <XAxis
                  dataKey="time"
                  stroke={tokens.borderSubtle01}
                  tick={{
                    fill: tokens.textSecondary,
                    fontSize: 11,
                    fontFamily: "'IBM Plex Mono', monospace",
                  }}
                />
                <YAxis
                  stroke={tokens.borderSubtle01}
                  tick={{
                    fill: tokens.textSecondary,
                    fontSize: 11,
                    fontFamily: "'IBM Plex Mono', monospace",
                  }}
                />
                <Tooltip content={<ChartTooltip unit="km/h" />} />
                <Line
                  type="monotone"
                  dataKey="speed"
                  name="Velocidade"
                  stroke={tokens.chartSpeed}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-card">
            <h3>Combustível (%)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={tokens.borderSubtle01} />
                <XAxis
                  dataKey="time"
                  stroke={tokens.borderSubtle01}
                  tick={{
                    fill: tokens.textSecondary,
                    fontSize: 11,
                    fontFamily: "'IBM Plex Mono', monospace",
                  }}
                />
                <YAxis
                  stroke={tokens.borderSubtle01}
                  tick={{
                    fill: tokens.textSecondary,
                    fontSize: 11,
                    fontFamily: "'IBM Plex Mono', monospace",
                  }}
                  domain={[0, 100]}
                />
                <Tooltip content={<ChartTooltip unit="%" />} />
                <Line
                  type="monotone"
                  dataKey="fuel"
                  name="Combustível"
                  stroke={tokens.chartFuel}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
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
                  <td>{formatarInstante(r.recordedAt)}</td>
                  <td>{r.latitude.toFixed(4)}</td>
                  <td>{r.longitude.toFixed(4)}</td>
                  <td>{formatarVelocidade(r.speed)}</td>
                  <td>{formatarPercentual(r.fuelLevel)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedId && records.length === 0 && (
        <div
          className="chart-card"
          style={{ textAlign: 'center', padding: 40, color: 'var(--cds-text-secondary)' }}
        >
          Nenhum registro de telemetria encontrado.
        </div>
      )}

      {!selectedId && (
        <div
          className="chart-card"
          style={{ textAlign: 'center', padding: 40, color: 'var(--cds-text-secondary)' }}
        >
          Selecione um veículo para visualizar a telemetria.
        </div>
      )}
    </>
  )
}
