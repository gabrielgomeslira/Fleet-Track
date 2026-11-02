# Testes do backend

Projeto `tests/FleetApi.Tests` (xUnit + `WebApplicationFactory<Program>`). Os testes usam um
**Postgres real**: sem Testcontainers, sem EF InMemory e sem SQLite.

## Banco de teste

A string de conexão vem de `ConnectionStrings__Default`. Sem a variável, o padrão é:

```
Host=localhost;Port=5432;Database=fleet_test;Username=postgres
```

Os testes **apagam e recriam as tabelas** do banco. Por isso a fixture se recusa a rodar se o nome
do banco não terminar em `_test`.

### Subir o Postgres local

`docker compose up db` expõe o Postgres em `127.0.0.1:5432`. O compose lê o `.env` (copie de
`.env.example`). Crie o banco de teste uma vez e aponte a variável para ele:

```bash
docker compose up -d db
docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE DATABASE fleet_test"
export ConnectionStrings__Default="Host=localhost;Port=5432;Database=fleet_test;Username=$POSTGRES_USER;Password=$POSTGRES_PASSWORD"
```

Na CI, o serviço `postgres` do workflow cria o banco `fleet_test` (T-03).

## Rodar

Na raiz do repositório:

```bash
dotnet restore --locked-mode
dotnet test --no-restore
```

## Pacotes travados

`backend/packages.lock.json` e `tests/FleetApi.Tests/packages.lock.json` são versionados.
Ao mudar um pacote, rode `dotnet restore --force-evaluate` e commite os dois lockfiles.

## Escrevendo testes

- Herde de `TesteComBanco`: as tabelas são limpas antes de cada teste.
- Cada teste cria os próprios dados, com GUID novo. Não conte com o seed de demonstração: a fixture
  recria o schema com as migrações (`MigrateAsync`) e a API de teste sobe com o seed desligado.
- Mudou o modelo? Gere a migração com `dotnet ef migrations add <Nome> --project backend`. O teste
  `Modelo_do_EF_nao_diverge_das_migracoes` falha se ela faltar.
