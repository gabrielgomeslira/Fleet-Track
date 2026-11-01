# Fleet-Track open source: decisões de arquitetura e design
Data: 2026-10-31 · Autor: arquiteto · Entradas: PRD, histórias (H-xx), análise de segurança (SEC-xx), UX e o código em `Fleet-Track/` (commit `4109c68` + working tree).

## Índice de ADRs
| ADR | Decisão | Histórias | Fase |
|---|---|---|---|
| [0001](0001-migrar-backend-para-dotnet-10-lts.md) | .NET 10 LTS (o .NET 8 sai de suporte em 10/11/2026) | base | 1 |
| [0002](0002-versionar-esquema-com-migracoes-ef-core.md) | Migrações do EF Core na subida; `init.sql` sai; seed vai para o código | base, H-14 | 1–2 |
| [0003](0003-autenticar-no-proprio-backend-com-dois-esquemas.md) | Identity (pessoas) + chave de API (sistemas), autorização fechada por padrão | H-05 | 2 |
| [0004](0004-sessao-do-dashboard-por-cookie-httponly.md) | Sessão em cookie HttpOnly SameSite=Strict, sem token no JS | H-06 | 2 |
| [0005](0005-credenciais-de-sistema-como-chaves-de-api-opacas.md) | Chave opaca `ftk_…`, hash SHA-256, escopos, revogação imediata | H-07 | 2 |
| [0006](0006-entrada-unica-pelo-proxy-e-containers-sem-privilegio.md) | Só o Nginx exposto (loopback por padrão), rede interna, sem root, cabeçalhos | H-09 | 2 |
| [0007](0007-simulacao-por-job-no-backend-em-modo-demo.md) | Job único em modo demo; `POST /simulate` removido (**depende do humano**) | H-10, H-14 | 2 |
| [0008](0008-apagar-dado-pessoal-do-motorista-e-manter-historico-operacional.md) | Entidade `drivers`; remoção apaga o dado pessoal e mantém as entregas | H-13 | 2 |
| [0009](0009-versionar-api-na-rota-com-openapi-gerado-do-codigo.md) | `/api/v1` na rota; OpenAPI gerado do código, com *drift* e `oasdiff` na CI | H-15 | 3 |
| [0010](0010-paginar-colecoes-por-cursor.md) | Paginação por cursor + índices; **valida < 500 ms de H-17** | H-11, H-17 | 2–3 |
| [0011](0011-primeiro-acesso-por-wizard-com-codigo-de-uso-unico.md) | Wizard `/setup` protegido por código de uso único do log | H-18, H-08 | 3 |
| [0012](0012-manter-historico-git-sem-reescrita.md) | Não reescrever o histórico (o repositório **já é público**) | H-20 | 3 |
| [0013](0013-releases-por-tag-semver-com-imagens-no-ghcr.md) | Tag semver → imagens multiarquitetura no GHCR; compose com imagens fixadas | H-20 | 3 |
| [0014](0014-escrever-cadastro-com-escopo-proprio-e-recurso-unico-de-motoristas.md) | Escopo `cadastro:escrever`; motoristas em `/api/v1/drivers` (recurso único; altera 0003, 0005, 0008) | H-23 | 3 |

Os ADRs 0001 e 0002 não estavam no pedido do orquestrador. São pré-requisitos sem os quais 0003–0011 não se sustentam.

## Atributos de qualidade (premissas marcadas com *)
- Escala*: uma instalação por organização, 1 instância de backend, ≤ 20 pessoas, ≤ 10 sistemas, ≤ 500 veículos, ingestão ≤ 50 req/s.
- Telemetria `GET` de um veículo: **p95 < 100 ms no servidor** com 1 milhão de linhas no veículo e 10 milhões na tabela. O alvo do PRD (< 500 ms) é viável com folga (ADR-0010).
- Listagens: p95 < 200 ms*. `dashboard/stats`: p95 < 300 ms* (consolidar 11 queries em 2 agregações, SEC-05).
- Revogação de chave de API: imediata. Revogação de sessão de pessoa: ≤ 5 min.
- Primeira execução: ≤ 15 min (métrica do PRD). Imagens prontas (ADR-0013) e um único segredo obrigatório (ADR-0011).
- Disponibilidade: fora de escopo definir. É self-hosted e quem instala opera. Backup é responsabilidade de quem instala (documentar em H-19).

## C4: contexto
```
[Gestor / Operador] --HTTPS(ou http://localhost)--> [Fleet-Track]
[Administrador]     --mesmo canal-->                [Fleet-Track]
[Sistema externo: ERP, rastreador, script] --HTTP + Bearer ftk_…--> [Fleet-Track]
[Navegador] --tiles--> [CARTO basemaps] (terceiro, só imagens do mapa)
Quem instala = controlador LGPD; opera Docker, TLS e backup.
```

## C4: contêineres
```
host: ${FLEET_BIND_ADDRESS:-127.0.0.1}:${FRONTEND_PORT:-3000}
        │
┌───────▼──────────── rede edge ────────────────────────────┐
│ frontend (nginx-unprivileged :8080, read-only, sem root)   │
│  - SPA React estática (fontes locais)                      │
│  - cabeçalhos de segurança, limit_req no login, timeouts   │
│  - /api/* → backend:8080                                   │
└───────┬──────────── rede interna (internal: true) ─────────┘
        │
┌───────▼──────────────────────────┐      ┌──────────────────────────┐
│ backend (.NET 10, USER app :8080)│─────▶│ db (postgres:16, volume) │
│  - Identity + cookie │ ApiKey    │ SQL  │  sem portas publicadas    │
│  - API /api/v1 + OpenAPI         │      └──────────────────────────┘
│  - migrações na subida (0002)    │
│  - SimulacaoJob (só demo, 0007)  │
│  - (H-12) ExpurgoJob — prazo TBD │
└──────────────────────────────────┘
```
Componentes que importam no backend: `Auth` (esquemas, políticas, setup), `Ingestao` (H-16), `Consulta` (listas por cursor), `Admin` (usuários, chaves, motoristas, auditoria), `Jobs` (simulação; expurgo depende de H-12). Monólito modular: **nenhum serviço novo**.

## Modelo de dados (alvo da fase 2–3)
Todos os instantes em `timestamptz` (hoje são `timestamp`). A migração ocorre na baseline (ADR-0002).

| Tabela | Colunas principais | Índices | Dado pessoal |
|---|---|---|---|
| `vehicles` | id uuid PK, plate (exibição), **plate_normalizada** (única, ADR-0014), model, status (enum do contrato), latitude, longitude, speed, fuel_level, updated_at, **driver_id → drivers ON DELETE SET NULL** | `UNIQUE(plate_normalizada)`, `(plate, id)` | indireto (posição atual) |
| `drivers` (novo, 0008) | id uuid PK, nome, criado_em | PK | **sim** (nome) |
| `deliveries` | id, vehicle_id FK, origin, destination, status, created_at, delivered_at | `(created_at DESC, id DESC)`, `(status, created_at DESC)`, `(vehicle_id)` | não |
| `telemetry_records` | id uuid (v7 gerado na app), vehicle_id FK, latitude, longitude, speed, fuel_level, recorded_at, received_at | **`UNIQUE(vehicle_id, recorded_at DESC)`**; BRIN(`recorded_at`) se o expurgo de H-12 precisar | **sim** (trilha de posição do veículo) |
| `users`, `roles`, `user_roles`, … (Identity) | id, user_name, password_hash, security_stamp, lockout_end, access_failed_count, **must_change_password** | padrão do Identity | **sim** (usuário, nome) |
| `api_keys` (0005) | id (público, 12 caracteres), nome, escopos text[], segredo_hash, criada_por, criada_em, ultimo_uso_em, expira_em, revogada_em | PK | não |
| `audit_events` | id, ocorrido_em, ator_tipo, ator_id, acao, alvo_tipo, alvo_id, detalhes jsonb (**sem dado pessoal**) | `(ocorrido_em DESC)` | não (só ids) |
| `data_protection_keys` (0004) | id, friendly_name, xml | PK | não (segredo de sessão) |

Retenção da telemetria e da auditoria: **não definida aqui** (H-12 pendente). O modelo suporta o expurgo por `recorded_at`.

## Contratos (convenções da `v1`; o arquivo é gerado do código, ADR-0009)
- Base `/api/v1`. Saúde em `/api/health` (`status`, `version`, `setupPending`).
- Erros em RFC 9457 `application/problem+json`, com `type` estável (`…/errors/validation`, `…/not-found`, `…/unauthorized`, `…/forbidden`, `…/rate-limited`). 400 traz `errors{campo:[mensagens]}` dizendo o formato aceito (H-03, H-11).
- Coleções: `?limit=1..200 (padrão 50)&cursor=` → `{data, page{limit, nextCursor}}` (ADR-0010).
- Status com vocabulário único (enum no contrato, H-21). Veículo: `em_rota`, `parado`, `manutencao`. Entrega: `pendente`, `em_transito`, `entregue`, `cancelado`. Como as chaves JSON são camelCase em inglês e os valores em português, revisar antes de congelar a `v1`.
- Ingestão (H-16, formato próprio): `POST /api/v1/positions` `{ "plate" | "vehicleId", "latitude", "longitude", "recordedAt", "speed"?, "fuelLevel"? }`.
  - Exatamente um identificador de veículo, `plate` ou `vehicleId`. A placa é o que o integrador conhece.
  - Validação: lat −90..90, lon −180..180, `recordedAt` até +2 min no futuro* (tolerância documentada).
  - Respostas: 201 quando novo, 200 em duplicata (mesmo veículo + instante, idempotente pelo índice único), 404 para veículo inexistente.
  - Atualiza a posição atual do veículo se `recordedAt` for mais novo.
  - Lote de posições é evolução aditiva, fora da v1.
- Cadastro (H-23, ADR-0014). Só `POST` e `PUT`, sem `DELETE` de veículo e sem lote.
  - `POST /api/v1/vehicles` `{ plate, model, status?=parado, driverId? }` e `PUT /api/v1/vehicles/{id}` com corpo completo (`driverId: null` desvincula).
  - `POST /api/v1/drivers` `{ name }` (1..150) e `PUT /api/v1/drivers/{id}`.
  - `PUT` nunca cria: id inexistente → 404.
  - Placa normalizada (trim, maiúsculas, sem espaço e hífen), formato `^[A-Z0-9]{5,10}$`*. Placa repetida → 409 `…/errors/conflict`.
  - `driverId` inexistente → **400** `errors.driverId`. O 404 fica só para o recurso da URL.
  - Posição, velocidade e combustível não são graváveis pelo cadastro: só `positions` os altera.
  - Nome do motorista nunca aparece em mensagem de erro nem em log (sem log de corpo nessas rotas).
  - Auditoria `veiculo|motorista.criado|atualizado` com ator e ids. Os detalhes trazem só os nomes dos campos alterados.
  - `GET /api/v1/drivers` e `/{id}` são só `admin` (tela de lista). `DELETE /api/v1/drivers/{id}` é H-13 (ADR-0008, rota movida de `/admin/drivers`).
- Escritas autenticadas por cookie exigem `X-Requested-With: fleet-track` (ADR-0004). Escritas com chave de API dispensam.
- `Idempotency-Key` não é exigido:
  - A ingestão já é idempotente pela chave natural.
  - As operações admin (criar chave ou usuário) são raras e confirmadas na UI.
  - Um `POST /vehicles` repetido cai no 409 pela placa.
  - Um `POST /drivers` repetido **duplica** o motorista. Isso fica documentado no guia de integração, e `Idempotency-Key` opcional é evolução aditiva (ADR-0014).

### Matriz de autorização
Escopos de sistema combináveis numa mesma chave (ADR-0005, ADR-0014). A coluna de cada escopo mostra o resultado com **apenas** aquele escopo.

| Operação | Anônimo | Pessoa `operador` | Pessoa `admin` | Sistema `frota:ler` | Sistema `telemetria:escrever` | Sistema `cadastro:escrever` |
|---|---|---|---|---|---|---|
| `GET /api/health` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `POST /api/v1/setup` (só com código, 409 depois) | ✔* | 409 | 409 | 409 | 409 | 409 |
| `POST /api/v1/auth/login`, `logout`, `me`, `password` | login ✔ | ✔ | ✔ | 403 | 403 | 403 |
| `GET vehicles`, `vehicles/{id}`, `vehicles/{id}/telemetry`, `deliveries`, `deliveries/{id}` | 401 | ✔ | ✔ | ✔ | 403 | 403 |
| `GET dashboard/stats` | 401 | ✔ | ✔ | 403 | 403 | 403 |
| `POST positions` | 401 | 403 | 403 | 403 | ✔ | 403 |
| `POST vehicles`, `PUT vehicles/{id}`, `POST drivers`, `PUT drivers/{id}` (H-23) | 401 | 403 | ✔ | 403 | 403 | ✔ |
| `GET drivers`, `GET drivers/{id}` | 401 | 403 | ✔ | 403 | 403 | 403 |
| `DELETE drivers/{id}` (H-13) | 401 | 403 | ✔ | 403 | 403 | 403 |
| `/admin/users`, `/admin/api-keys`, `/admin/audit` | 401 | 403 | ✔ | 403 | 403 | 403 |
| `GET /api/v1/openapi.json` | 401 | ✔ | ✔ | ✔ | ✔ | ✔ |

\* exceção a H-05, ver ADR-0011.

Regra testável: **nenhuma chave de sistema acessa `/api/v1/admin/*`**, seja qual for o escopo. Em `/drivers`, o teste de matriz cobre método × principal (ADR-0014).

## Threat model inicial (STRIDE, fluxos novos)
| Fronteira / fluxo | Ameaça mais provável | Controle |
|---|---|---|
| Navegador → Nginx → login | **S**poofing por força bruta ou credential stuffing | Bloqueio por conta (5/15 min), `limit_req` por IP, mensagem genérica, senha ≥ 12 |
| Navegador com sessão → API | **T**ampering via CSRF; roubo de sessão via XSS | SameSite=Strict + cabeçalho obrigatório + CORS fechado; HttpOnly; CSP sem `unsafe-inline` em script |
| Primeira execução (`/setup`) | **E**levação: terceiro cria o admin antes do dono | Código de uso único no log, loopback por padrão, 409 após setup (0011) |
| Sistema externo → ingestão | **S**poofing com chave vazada; **D**oS por volume | Chave revogável na hora, prefixo detectável por scanners, rate limit por chave, corpo ≤ 64 KB |
| Sistema externo → ingestão | **T**ampering: posições falsas ou fora de faixa | Escopo `telemetria:escrever` separado de leitura; validação de faixa e tempo; auditoria de chave |
| Sistema externo → cadastro (H-23) | **T**ampering: chave de rastreador vazada cria veículos ou motoristas; **I**: nome do motorista em log ou erro | Escopo próprio `cadastro:escrever` (ingestão não escreve cadastro, cadastro não escreve posição); auditoria por ação sem valores; sem log de corpo; erro não ecoa valor |
| Chave de sistema → rotas de pessoa | **E**levação | Tipo de principal na política → 403 (0003) |
| API → dados pessoais | **I**nformation disclosure (motorista, trilha) | Autenticação em tudo, sem rota anônima com dados, `no-store`, remoção do motorista (0008), retenção (H-12) |
| Ações admin | **R**epudiation | `audit_events` com ator, ação e alvo, sem dado pessoal |
| Containers | **E**levação após RCE | Sem root, `cap_drop ALL`, `no-new-privileges`, read-only, rede interna sem saída |
| Banco / volume | **I**nformation disclosure (backup do host) | Fora do controle do app: documentar em H-19 (controlador); sem porta publicada |

## Falhas de dependências
- **Postgres indisponível:** health → 503; API → 503 Problem Details. Retry do Npgsql (`EnableRetryOnFailure`, 3 tentativas, backoff exponencial até 5 s) só para leitura e para escrita idempotente. A ingestão é idempotente, então o integrador pode reenviar. Na subida, `depends_on: service_healthy` + migração com retry. O front mostra "serviço indisponível, tentar de novo" (H-21).
- **Tiles do CARTO fora do ar:** o mapa fica sem fundo e os marcadores continuam. Não bloqueia nada. Documentar como trocar o provedor de tiles.
- **Backend → nada externo:** a rede interna não tem saída. Nenhuma outra dependência de terceiros em tempo de execução. A fonte Inter passa a ser servida localmente (CSP + privacidade).

## Divergências entre a UX e os ADRs (alinhar antes do tech-lead)
1. **`/setup` sem proteção** (UX §3.3): precisa do campo "Código de configuração". Sem ele, a tela permite tomada de controle (ADR-0011).
2. **Aba "Token de Acesso" pessoal no login** (UX §3.1): não existe token pessoal. Pessoas usam só usuário e senha. Tokens são de sistemas e não abrem o painel (ADR-0003/0005, H-07). Remover a aba.
3. **Senha mínima de 8** (UX) contra **12** (ADR-0003, premissa). A NIST SP 800-63B rev.4 recomenda 15 para senha como fator único: decisão do appsec ou do humano. A UX deve seguir o número final.
4. **cURL do quickstart** (UX §3.3): usa `localhost:5000` (porta não publicada, ADR-0006) e não tem `Authorization`. Correto: `curl -X POST http://localhost:3000/api/v1/positions -H "Authorization: Bearer ftk_…" -H "Content-Type: application/json" -d '{"plate":"FT-001","latitude":-23.55,"longitude":-46.63,"recordedAt":"2026-10-31T12:00:00Z"}'`. No passo 2 do wizard ainda não existe chave: o snippet precisa levar à criação de uma ou usar um marcador `<SUA_CHAVE>`.
5. **Prefixo** `ft_live_` (UX) → `ftk_` (ADR-0005). **Escopos** "acesso a /telemetry e /deliveries" (UX) → **3 opções combináveis** na criação, com pelo menos uma marcada (ADR-0014):
   - `frota:ler`: ler veículos, entregas e telemetria.
   - `telemetria:escrever`: enviar posições.
   - `cadastro:escrever`: criar e editar veículos e motoristas. Mostrar o aviso "inclui dado pessoal (nome do motorista)".

   A lista de chaves mostra os escopos de cada uma.
6. **Paginação**: a UX deve prever "próxima/anterior" ou "carregar mais", sem "ir para a página N" e sem total (ADR-0010).
7. **Remoção de motorista**: o modal de confirmação já existe na UX. Falta a opção "também apagar a telemetria dos veículos vinculados" com o aviso de semântica (ADR-0008) e a tela de lista de motoristas (admin). A tela usa `GET /api/v1/drivers` e `DELETE /api/v1/drivers/{id}` (ADR-0014). Não há formulário de cadastro (H-23 é só API).

## Premissas e decisões que o humano deve confirmar
1. Leitura provisória de H-10 (ADR-0007): o front não chama a simulação, o job roda só em demo e com intervalo fixo, e o endpoint é removido.
2. Migrar para .NET 10 na fase 1 (ADR-0001).
3. Instalações anteriores à v1.0 são recriadas (`down -v`), sem migração da base antiga (ADR-0002).
4. `POST /api/v1/setup` como exceção anônima à regra de H-05 (ADR-0011).
5. Repositório **já público**: manter público até a fase 2 ou torná-lo privado? E-mail pessoal em 2 commits: aceitar ou reescrever só a autoria antes de divulgar (ADR-0012)?
6. ~~Lacuna de escopo~~ resolvida pelo PM (H-23) e pelo ADR-0014. Confirmar:
   - um escopo único `cadastro:escrever`, e não dois;
   - formato de placa genérico `^[A-Z0-9]{5,10}$`, sem impor o padrão Mercosul;
   - aceitar duplicata de motorista em `POST` repetido na v1.
7. Números marcados com * (limites, escala, timeouts, tolerância de 2 min, tamanho mínimo de senha, formato de placa).
8. Fora daqui, por restrição do pedido: prazo de retenção (H-12) e formato de rastreador de terceiros (H-16).

Próximo: tech-lead | entradas: este README + ADR-0001…0014 (ordem sugerida: 0001, 0002 na fase 1; 0003–0008, 0010 na fase 2; 0009, 0011–0014 na fase 3; 0014 antes de H-16 fora do demo)
