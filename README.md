# FleetTrack - Dashboard de Frota Logistica

> **Em desenvolvimento: sem autenticação até a v1.0. Não use com dados reais.**

Dashboard administrativo para monitoramento de frota logistica com localizacoes de veiculos em tempo real (simulado), status de entregas e telemetria.

## Screenshots

### Dashboard
Visao geral com cards de estatisticas, mapa interativo da frota e graficos de entregas e status dos veiculos.

![Dashboard](docs/images/dashboard.png)

### Veiculos
Mapa completo da frota com tabela detalhada de todos os veiculos, incluindo posicao, velocidade, combustivel e status.

![Veiculos](docs/images/veiculos.png)

### Entregas
Listagem de todas as entregas com filtros por status (pendente, em transito, entregue, cancelado).

![Entregas](docs/images/entregas.png)

### Telemetria
Historico de telemetria por veiculo com graficos de velocidade e combustivel ao longo do tempo.

![Telemetria](docs/images/telemetria.png)

## Tecnologias

- **Frontend:** React 19, TypeScript, Vite, Recharts, Leaflet
- **Backend:** .NET 8, ASP.NET Core, Entity Framework Core
- **Banco de dados:** PostgreSQL 16
- **Infraestrutura:** Docker Compose

## Como rodar

Requisitos: Docker e Docker Compose instalados.

```bash
docker compose up --build
```

Acesse http://localhost:3000.

## Variaveis de ambiente

O arquivo `.env` na raiz do projeto contem todas as configuracoes:

| Variavel | Valor padrao |
|---|---|
| POSTGRES_USER | admin |
| POSTGRES_PASSWORD | admin123 |
| POSTGRES_DB | fleetdb |
| POSTGRES_PORT | 5432 |
| BACKEND_PORT | 5000 |
| FRONTEND_PORT | 3000 |

## Endpoints da API

| Metodo | Rota | Descricao |
|---|---|---|
| GET | /api/vehicles | Lista todos os veiculos |
| GET | /api/vehicles/:id | Detalhes de um veiculo |
| GET | /api/deliveries | Lista entregas (filtro por ?status=) |
| GET | /api/deliveries/:id | Detalhes de uma entrega |
| GET | /api/telemetry/:vehicleId | Historico de telemetria |
| GET | /api/dashboard/stats | Dados agregados do dashboard |
| POST | /api/telemetry/simulate | Simula movimentacao dos veiculos |
