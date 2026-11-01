<div align="center">

# FleetTrack

**Painel open source para acompanhar uma frota logística: onde está cada veículo, como andam as entregas e o que diz a telemetria.**

[![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-green.svg)](LICENSE)
![.NET 8](https://img.shields.io/badge/.NET-8-512BD4?logo=dotnet&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![PostgreSQL 16](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Docker Compose](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

![Dashboard do FleetTrack](docs/images/dashboard.png)

</div>

> [!WARNING]
> **Em desenvolvimento: sem autenticação até a v1.0. Não use com dados reais.**
> A API e o painel ainda estão abertos para quem alcançar a máquina. Rode só em ambiente local ou de teste.

## O que ele faz

- **Visão geral da frota:** total de veículos, quantos estão em rota, entregas concluídas e velocidade média, atualizados sozinhos.
- **Mapa ao vivo:** cada veículo aparece no mapa com a cor do status (em rota, parado, manutenção).
- **Entregas:** a lista completa com filtro por status (pendente, em trânsito, entregue, cancelado).
- **Telemetria por veículo:** gráficos de velocidade e combustível ao longo do tempo e o histórico de posições.
- **Dados de demonstração:** a instalação já vem com 10 veículos e 30 entregas, e a movimentação é simulada para você ver o painel funcionando na hora.

## Telas

As imagens abaixo são capturas da versão atual rodando com os dados de demonstração.

### Dashboard

Indicadores da frota, mapa, entregas por dia nos últimos 14 dias, status dos veículos e as entregas mais recentes.

![Dashboard](docs/images/dashboard.png)

### Veículos

O mapa da frota e a tabela de todos os veículos, com posição, velocidade, combustível, última atualização e status.

![Veículos](docs/images/veiculos.png)

### Entregas

Todas as entregas, com filtro por status.

![Entregas](docs/images/entregas.png)

### Telemetria

Escolha um veículo para ver velocidade e combustível ao longo do tempo e os registros de posição.

![Telemetria](docs/images/telemetria.png)

## Como rodar

Você só precisa do [Docker](https://docs.docker.com/get-docker/) com o Docker Compose.

```bash
git clone https://github.com/gabrielgomeslira/Fleet-Track.git
cd Fleet-Track
cp .env.example .env      # no Windows (PowerShell): Copy-Item .env.example .env
```

Abra o `.env` e **troque a senha do banco** (`POSTGRES_PASSWORD` e a mesma senha dentro de `CONNECTION_STRING`). Depois:

```bash
docker compose up --build
```

Acesse **http://localhost:3000**. Na primeira subida, o banco é criado e populado com os dados de demonstração.

Para parar, use `docker compose down`. Para apagar também os dados, use `docker compose down -v`.

### Variáveis de ambiente

| Variável | Para que serve | Exemplo |
|---|---|---|
| `POSTGRES_USER` | Usuário do banco | `admin` |
| `POSTGRES_PASSWORD` | Senha do banco. **Troque.** | — |
| `POSTGRES_DB` | Nome do banco | `fleetdb` |
| `POSTGRES_PORT` | Porta do banco no seu computador | `5432` |
| `BACKEND_PORT` | Porta da API no seu computador | `5000` |
| `FRONTEND_PORT` | Porta do painel no seu computador | `3000` |
| `CONNECTION_STRING` | Conexão da API com o banco (usa as variáveis acima) | `Host=db;Port=5432;Database=fleetdb;Username=admin;Password=...` |

Se a porta 5432 já estiver ocupada por outro PostgreSQL, mude `POSTGRES_PORT` (por exemplo, `55432`). A API continua falando com o banco pela rede interna do Compose.

## Como funciona

```mermaid
flowchart LR
    U[Navegador] -->|:3000| F[Frontend<br/>React + Nginx]
    F -->|/api| B[API<br/>ASP.NET Core]
    B --> D[(PostgreSQL)]
    F -.->|tiles do mapa| M[OpenStreetMap]
```

- O **frontend** é um app React servido pelo Nginx, que também encaminha `/api` para o backend.
- O **backend** é uma API ASP.NET Core com Entity Framework Core.
- O **banco** é um PostgreSQL 16. O esquema e os dados de demonstração estão em [`db/init.sql`](db/init.sql).
- O **mapa** usa Leaflet com tiles do OpenStreetMap, escurecidos por CSS para combinar com o tema. Para usar outro provedor, troque a URL em [`frontend/src/components/FleetMap.tsx`](frontend/src/components/FleetMap.tsx). Em uso intenso, siga a [política de uso de tiles do OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/) ou use um provedor próprio.

### Tecnologias

| Camada | Stack |
|---|---|
| Frontend | React 19, TypeScript, Vite, Recharts, Leaflet, Lucide |
| Backend | .NET 8, ASP.NET Core, Entity Framework Core, Npgsql |
| Banco | PostgreSQL 16 |
| Infra | Docker Compose, Nginx |
| Qualidade | ESLint, Prettier, `tsc --noEmit`, xUnit |

## API

Todas as rotas respondem JSON. Pelo painel, use `http://localhost:3000/api/...`.

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/vehicles` | Lista os veículos |
| GET | `/api/vehicles/{id}` | Detalhes de um veículo |
| GET | `/api/deliveries` | Lista as entregas (filtro: `?status=pendente\|em_transito\|entregue\|cancelado`) |
| GET | `/api/deliveries/{id}` | Detalhes de uma entrega |
| GET | `/api/telemetry/{vehicleId}` | Histórico de telemetria de um veículo |
| GET | `/api/dashboard/stats` | Números agregados do dashboard |
| POST | `/api/telemetry/simulate` | Simula um passo de movimentação da frota |

Exemplo:

```bash
curl http://localhost:3000/api/dashboard/stats
```

A API vai mudar antes da v1.0: rotas versionadas em `/api/v1`, autenticação e chaves de API para integrações. As decisões estão em [`docs/adr`](docs/adr).

## Estrutura do repositório

```
backend/     API ASP.NET Core (controllers, modelos, acesso a dados)
frontend/    Painel React + Vite, servido pelo Nginx
db/          Esquema e dados de demonstração do PostgreSQL
docs/        Documentação, decisões de arquitetura (adr/) e imagens
.github/     Templates de issue e PR e CODEOWNERS
```

## Desenvolvimento

Frontend:

```bash
cd frontend
npm ci
npm run dev         # servidor de desenvolvimento
npm run lint        # ESLint
npm run typecheck   # checagem de tipos
npm run build       # build de produção
```

Backend:

```bash
dotnet restore --locked-mode
dotnet build
dotnet test         # precisa de um PostgreSQL de teste; veja tests/README.md
```

Commits seguem o [Conventional Commits](https://www.conventionalcommits.org/pt-br/) em português. O passo a passo para contribuir está no [CONTRIBUTING.md](CONTRIBUTING.md).

## Rumo à v1.0

- [x] Licença, guia de contribuição, código de conduta e política de segurança
- [x] Padrões de código (EditorConfig, ESLint, Prettier) e checagem de tipos
- [x] Decisões de arquitetura documentadas em `docs/adr`
- [ ] CI com build, testes e varredura de segredos
- [ ] Autenticação no painel e chaves de API para sistemas
- [ ] API pública versionada (`/api/v1`) com OpenAPI
- [ ] Simulação só no modo demo
- [ ] Imagens publicadas por release

## Contribuindo

Contribuições são bem-vindas. Leia o [CONTRIBUTING.md](CONTRIBUTING.md) e o [Código de Conduta](CODE_OF_CONDUCT.md) antes de abrir um PR.

Achou uma vulnerabilidade? Não abra issue pública: siga o [SECURITY.md](SECURITY.md).

## Licença

[MIT](LICENSE) © Gabriel Gomes
