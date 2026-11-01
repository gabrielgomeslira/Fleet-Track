# ADR-0005: Emitir credenciais de sistema como chaves de API opacas, com escopo e hash no banco
Status: proposto
Data: 2026-10-31
Histórias: H-07 (base de H-16 e H-17)

## Contexto
- Integradores (ERP, rastreador, script) precisam de credencial própria, separada das credenciais de pessoas e revogável.
- H-07 exige:
  - O segredo aparece uma única vez.
  - A lista mostra nome, data de criação, último uso e estado.
  - Uma chave revogada recebe 401 "imediatamente ou no prazo documentado".
- Escala (premissa): ≤ 10 chaves por instalação e ingestão de até 50 req/s no total.
- A primeira execução precisa permitir mandar uma posição com `curl` em poucos minutos (H-18).

## Alternativas
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| A. OAuth2 client credentials (client_id + secret trocados por JWT de curta duração) | Padrão de mercado e revogação por expiração | Exige servidor de token (endpoint, assinatura, rotação de chave). Duas chamadas por integração. O `curl` do README fica mais longo. A revogação só vale quando o JWT expira | Médio |
| B. Usuário "técnico" com senha e cookie | Reaproveita o Identity | Mistura pessoa com sistema (fere H-05 e H-07). Cookie é ruim para integração | Alto |
| **C. Chave opaca `ftk_<id>_<segredo>`, enviada em `Authorization: Bearer`, com hash SHA-256 no banco** | Uma chamada só, `curl` trivial. Revogação imediata (consulta por PK). Segredo nunca armazenado | Consulta ao banco a cada requisição (~1 ms por PK). Sem expiração automática, a menos que configurada | Baixo. É possível aceitar OAuth como esquema adicional depois |

## Decisão
Opção C.
- **Formato:** `ftk_` + `id` (12 caracteres base32, público e indexado) + `_` + segredo (32 bytes aleatórios de `RandomNumberGenerator`, base64url).
  - O prefixo permite que *secret scanners* reconheçam a chave. Registrar o padrão no `gitleaks` da CI (H-08).
- **Armazenamento** em `api_keys`: `id`, `nome`, `escopos text[]`, `segredo_hash` (SHA-256), `criada_por`, `criada_em`, `ultimo_uso_em`, `expira_em` (opcional), `revogada_em`.
  - SHA-256 sem *salt* é suficiente porque o segredo tem 256 bits de entropia. Hash lento (bcrypt) só acrescentaria latência a cada chamada.
  - Comparação em tempo constante (`CryptographicOperations.FixedTimeEquals`).
- **Validação a cada requisição, sem cache:** a revogação vale na requisição seguinte (prazo documentado: imediato).
  - `ultimo_uso_em` é atualizado no máximo uma vez por minuto por chave, para não gerar uma escrita por posição.
- **Escopos** (combináveis numa chave, pelo menos um):
  - `frota:ler` (H-17).
  - `telemetria:escrever` (H-16).
  - `cadastro:escrever` (H-23), acrescentado pelo ADR-0014.

  Chaves nunca acessam rotas de pessoa nem `/api/v1/admin/*`: o tipo de principal errado recebe 403 (ADR-0003).
- **Gestão:**
  - Endpoints apenas para `admin`: `POST`, `GET` e `DELETE` (revoga) em `/api/v1/admin/api-keys`.
  - A tela fica com o ux-ui. A API é a fonte da verdade, e a tela é opcional se ux-ui propuser outra coisa.
  - Criação e revogação geram registro em `audit_events`.
- **Limite de taxa** por chave no backend (`RateLimiter` particionado pelo `id` da chave, premissa 20 req/s com rajada de 40). Acima disso, 429 com `Retry-After`.

## Consequências
- Positivas: o integrador usa um único cabeçalho, o `curl` cabe no README e não existe segredo armazenado em texto.
- Negativas: uma leitura de PK no banco por requisição (desprezível na escala prevista). Quem perde a chave cria outra, porque não há recuperação.
- Monitorar: requisições com chave revogada ou inexistente (possível vazamento), 429 por chave e chaves sem uso há mais de 90 dias (sugerir revogar).
