# Como contribuir com o Fleet-Track

Obrigado por querer ajudar. Este guia diz como rodar o projeto, como organizar a mudança e o que esperamos de um PR. Ao participar, você concorda com o [Código de Conduta](CODE_OF_CONDUCT.md). Vulnerabilidades **não** vão em issue pública: veja [SECURITY.md](SECURITY.md).

> Convenções marcadas como **[decisão pendente Px]** têm uma recomendação vigente. Vale a recomendação até o mantenedor decidir.

## 1. Rodando localmente

Requisitos: Git, Docker com Compose, .NET SDK 8 e Node.js 22.

```bash
cp .env.example .env      # defina os valores no .env; nunca commite este arquivo
docker compose up --build
```

### Testes do backend (Postgres real)

Os testes usam um Postgres de verdade, sem EF InMemory, SQLite ou Testcontainers.

1. Suba só o banco: `docker compose up db`. Ele publica a porta definida em `POSTGRES_PORT` no `.env` (o padrão do Postgres é 5432).
2. Aponte a conexão por variável de ambiente (a string de conexão não vai para o repositório):
   `ConnectionStrings__Default="Host=localhost;Port=<POSTGRES_PORT>;Database=fleet_test;Username=<usuario>;Password=<senha>"`
3. Rode `dotnet test`.

Cada teste cria os próprios dados (GUID novo) e não depende dos dados de demonstração.

### Frontend

```bash
cd frontend
npm ci
npm run typecheck
npm run build
```

#### Dependências do frontend

Os pacotes `@carbon/*` e `@ibm/plex-*` dependem do `@ibm/telemetry-js`, que envia métricas de uso à IBM durante o `npm install`/`npm ci`. A CI e o `frontend/Dockerfile` já desligam isso. Na sua máquina, desligue antes de instalar:

```bash
export IBM_TELEMETRY_DISABLED=true            # bash
```

```powershell
$env:IBM_TELEMETRY_DISABLED="true"            # PowerShell
```

Quem quiser pode religar a telemetria (`unset IBM_TELEMETRY_DISABLED`); o projeto não depende dela.

## 2. Estrutura de pastas

`backend/` e `frontend/` ficam na raiz.

```
backend/              API ASP.NET Core (FleetApi.csproj)
frontend/             React + Vite; testes ao lado do código (X.test.ts(x))
tests/FleetApi.Tests/ testes do backend (xUnit + Postgres real); Infra/ = fixtures
e2e/  bench/          testes ponta a ponta e carga, quando existirem
scripts/              shell usados pela CI
docs/                 documentação, ADRs (docs/adr), contrato da API (docs/api)
.github/              workflows, templates, CODEOWNERS
```

- Teste de backend sempre em `tests/FleetApi.Tests/`, um arquivo por assunto (`<Assunto>Tests.cs`).
- Código gerado (migração, `openapi.v1.json`, lockfiles) é versionado e não é editado à mão.
- Sem pasta `utils`/`helpers` genérica: o arquivo vai para a pasta do assunto.

## 3. Branches e merge

Fluxo trunk-based: `master` é sempre implantável e toda mudança entra por PR de branch curta (menos de 3 dias).

- **Nome da branch:** `<tipo>/t-NN-descricao-curta`, com o mesmo `tipo` dos commits. Sem tarefa: `<tipo>/descricao-curta`. Exemplos: `feat/t-16-veiculos-v1`, `fix/t-05-404-telemetria`, `chore/t-67-editorconfig`. Use `feat/`, não `feature/`.
- **Merge:** somente *squash*. O título do PR vira a mensagem do commit na `master`, por isso ele precisa seguir Conventional Commits.
- **Histórico:** nunca reescreva o da `master` (sem `rebase`, `filter-repo` ou `push --force`). Para desfazer algo, use `git revert` num PR `revert: …`.
- **Tags:** `vX.Y.Z`, criadas só pelo fluxo de release. Tag publicada é imutável.
- **Commits assinados:** não exigidos por enquanto **[decisão pendente P11]**.

## 4. Conventional Commits

Vale para o título do PR e para os commits locais.

```
<tipo>(<escopo opcional>)!?: <descrição no infinitivo, pt-BR, minúscula, sem ponto final>

<corpo opcional: o porquê, não o como>

Refs: T-NN
BREAKING CHANGE: <o que quebra e como migrar>   ← só se houver
```

- **Tipos:** `feat`, `fix`, `docs`, `style` (formatação pura), `refactor`, `perf`, `test`, `build` (pacotes, Dockerfile), `ci`, `chore`, `revert`.
- **Escopos aceitos:** `backend`, `frontend`, `db`, `api`, `auth`, `docker`, `ci`, `docs`, `deps`. Não invente escopo novo sem acrescentá-lo aqui e na validação da CI.
- **Descrição:** no infinitivo, até 72 caracteres no título.
- **Quebra de contrato** (`/api/v1`, variável de ambiente, formato de chave): `!` no tipo **e** o rodapé `BREAKING CHANGE:`.
- **Rastreio:** rodapé `Refs: T-NN` (e `Closes #<issue>`, se houver).

## 5. Convenções de código

### 5.1 Idioma

| Onde | Idioma |
|---|---|
| Commits, PRs, issues, docs, ADRs, CHANGELOG, comentários, logs, textos da UI | pt-BR |
| Rotas, chaves JSON, tabelas/colunas, variáveis de ambiente | inglês |
| Valores de enum do contrato (`em_rota`, `entregue`…) | pt-BR |
| Identificadores de código (classes, métodos, variáveis, arquivos) | inglês em código de produção; pt-BR permitido em nome de teste **[decisão pendente P9]** |

### 5.2 Backend (C#)

- Formatação e estilo seguem o `.editorconfig` e o `dotnet format`. Não se discute estilo no review.
- `namespace` de arquivo; uma classe pública por arquivo, com o nome do tipo.
- PascalCase em tipos e membros públicos; `_camelCase` em campos privados; `camelCase` em locais e parâmetros; `I` em interfaces.
- `Async` no fim de métodos assíncronos, exceto ações de controller (`GetAll`, `GetById`).
- `Nullable` habilitado; nenhum `!` sem comentário explicando.
- DTOs de contrato são `record` chamados `XxxDto`; sem tipo anônimo em resposta pública.
- Leitura com `AsNoTracking()`; listas sempre paginadas.
- Erro de API em Problem Details (RFC 9457); exceção não é fluxo de controle para validação.
- Log estruturado (`logger.LogInformation("... {VehicleId}", id)`), nunca interpolado, nunca com corpo de requisição, senha ou nome de motorista.
- Configuração por `IOptions<T>` ou na montagem do `Program.cs`, sem `Environment.GetEnvironmentVariable` espalhado.
- Testes: xUnit, `WebApplicationFactory<Program>`, Postgres real.

### 5.3 Frontend (TypeScript/React)

- Prettier no estilo já usado: sem ponto e vírgula, aspas simples, vírgula final, 100 colunas. ESLint para lint (a partir da T-69).
- Componentes em função, um por arquivo, PascalCase; hooks `useXxx` em `camelCase.ts`.
- Componentes mantêm `export default`; módulos de utilidade (`api.ts`, `status.ts`) usam export nomeado.
- `strict` ligado; `any` proibido (use `unknown` e estreitamento).
- Acesso à API só por `src/api.ts`; componente não chama `fetch`.
- Rótulo, cor e ícone de status só em `src/status.ts`.
- Testes: Vitest + Testing Library, `X.test.ts(x)` ao lado do arquivo.

### 5.4 Banco, API e configuração

- Tabelas e colunas em `snake_case`, tabela no plural; índice `ix_<tabela>_<colunas>`, único `ux_<tabela>_<colunas>`.
- Migração com nome em PascalCase descrevendo a mudança e sempre com `Down`.
- Rotas `/api/v1/<recurso-no-plural-kebab-case>`; JSON em `camelCase`.
- Variáveis de ambiente em `UPPER_SNAKE`, com prefixo `FLEET_` para a aplicação e `POSTGRES_` para o banco. Toda variável nova entra no `.env.example` (sem valor secreto) e no README no mesmo PR.

### 5.5 Dependências

- Versão exata no frontend para dependência nova; lockfiles (`package-lock.json`, `packages.lock.json`) sempre commitados.
- Dependência nova pede justificativa de uma linha no PR e licença compatível com MIT.
- Atualizações vêm do Dependabot e seguem o mesmo fluxo de revisão.

## 6. Definition of Done

Todo PR precisa de:

- [ ] Testes do caminho feliz e dos erros citados nos critérios.
- [ ] CI verde: build, testes e `typecheck`.
- [ ] Nenhum segredo, senha, chave `ftk_` real ou `.env` no repositório. Nenhum nome de motorista, senha ou corpo de requisição em log. Nenhum TODO novo.
- [ ] Migração revisável (SQL do `dotnet ef migrations script` colado no PR) e reversível, quando houver.
- [ ] Erros da API em Problem Details.
- [ ] Menos de 400 linhas alteradas, sem contar lockfile, migração gerada e snapshot OpenAPI. Passou disso, divida.
- [ ] Documentação atualizada no mesmo PR quando muda comportamento visível: README, `CHANGELOG.md` (seção `Unreleased`) e ADR novo se a decisão for de arquitetura.

Entram em vigor quando as ferramentas existirem:

- [ ] `dotnet format --verify-no-changes` e build sem *warning* (a partir da T-68/T-71).
- [ ] `npm run lint` e `npm run format:check` (a partir da T-69/T-71).
- [ ] Título do PR em Conventional Commits, com `Refs: T-NN` na descrição (a partir da T-71).
- [ ] Checklist do template de PR preenchido (a partir da T-74).

Hooks de pré-commit (a partir da T-72): depois de instalados, recusam formatação e mensagem fora do padrão. São uma ajuda; a CI decide.

## 7. Revisão

1. Abra o PR como *draft* enquanto estiver mexendo. Passe para "Ready" com CI verde e checklist preenchido, depois de revisar o próprio diff.
2. PRs pequenos (menos de 400 linhas). Formatação em massa vai em PR próprio.
3. O revisor vem do `CODEOWNERS` e foca em correção, segurança (dado pessoal, segredo, autorização), contrato e testes. Estilo é papel da ferramenta.
4. Comentários com prefixo: `bloqueante:`, `sugestão:`, `pergunta:`, `nit:`. Só `bloqueante:` impede a aprovação.
5. Primeira resposta em 1 dia útil e 1 aprovação exigida **[decisão pendente P10]**.
6. O autor faz o *squash merge* depois da aprovação e da CI verde. PR de agente é mergeado por uma pessoa.
7. Mudança em área sensível (`backend/Auth/`, migrações, `.github/workflows/`, `docker-compose.yml`, `nginx.conf`) exige revisão do dono da área.

## 8. ADRs

- Ficam em `docs/adr/NNNN-titulo-em-kebab.md` (a partir da T-73), numeração sequencial de 4 dígitos, nunca reaproveitada. O índice é `docs/adr/README.md`.
- Status: `Proposto` → `Aceito` | `Rejeitado` | `Substituído por NNNN`.
- ADR aceito não tem o conteúdo editado. Uma decisão nova vira ADR novo que substitui o antigo, e só o campo Status do antigo muda.
- ADR novo entra por PR `docs(adr): …`, revisado pelo mantenedor. Não publique dado pessoal nem caminho local.
