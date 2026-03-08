import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Vehicle } from '../types'

interface Props {
  vehicles: Vehicle[]
}

const statusColor: Record<string, string> = {
  em_rota: '#3b82f6',
  parado: '#eab308',
  manutencao: '#ef4444',
}

export default function FleetMap({ vehicles }: Props) {
  return (
    <div className="fleet-map">
      <h3>Mapa da Frota</h3>
      <div className="map-container">
        <MapContainer
          center={[-15.78, -47.93]}
          zoom={4}
          style={{ width: '100%', height: '100%', borderRadius: '8px' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          {vehicles.map((v) => (
            <CircleMarker
              key={v.id}
              center={[v.latitude, v.longitude]}
              radius={8}
              pathOptions={{
                fillColor: statusColor[v.status] || '#9aa0b0',
                fillOpacity: 0.9,
                color: '#fff',
                weight: 2,
                opacity: 0.5,
              }}
            >
              <Popup>
                <div style={{ color: '#222', fontSize: '0.85rem', lineHeight: 1.5 }}>
                  <strong>{v.plate}</strong> — {v.driverName}<br />
                  {v.model}<br />
                  {v.speed.toFixed(0)} km/h · Combustível {v.fuelLevel}%
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      <div className="map-legend">
        <span><div className="dot" style={{ background: '#3b82f6' }} /> Em Rota</span>
        <span><div className="dot" style={{ background: '#eab308' }} /> Parado</span>
        <span><div className="dot" style={{ background: '#ef4444' }} /> Manutenção</span>
      </div>
    </div>
  )
}
