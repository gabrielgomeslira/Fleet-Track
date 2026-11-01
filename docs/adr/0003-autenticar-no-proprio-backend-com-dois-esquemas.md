# ADR-0003: Autenticar no próprio backend com dois esquemas (pessoas e sistemas) e autorização fechada por padrão
Status: proposto
Data: 2026-10-31
Histórias: H-05 (decide mecanismo, armazenamento e papéis). Detalhes em ADR-0004 (sessão) e ADR-0005 (chaves de sistema).

## Contexto
- A API não tem nenhuma autenticação (SEC-01, crítico) e expõe nome de motorista e posição GPS.
- Requisitos:
  - Toda rota exige credencial, exceto a de saúde.
  - Credenciais de pessoas e de sistemas são distintas e revogáveis.
  - Sem credencial válida, 401. Com credencial válida e sem permissão, 403.
- Restrições:
  - Subir com um comando e chegar ao dashboard em ≤ 15 min (métrica principal).
  - Uma instalação por organização. Sem multiempresa, SSO ou login social (fora de escopo).
- Volume esperado (premissa): ≤ 20 pessoas e ≤ 10 sistemas por instalação. Ingestão de até 50 req/s.

## Alternativas
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| A. Provedor de identidade externo no compose (Keycloak, Authentik) | Recursos completos (OIDC, MFA, SSO) | Mais um container pesado (~500 MB a 1 GB de RAM), configuração de realm e client. Primeira execução muito mais lenta. Peça operacional nova para quem instala | Alto |
| B. JWT emitido pelo próprio backend para pessoas e sistemas | Um mecanismo só | JWT no navegador exige guardar o token em JS (risco de XSS) e montar refresh e revogação à mão. Revogar antes da expiração exige lista negada, ou seja, estado | Médio |
| **C. ASP.NET Core Identity (pessoas, cookie) + chave de API opaca (sistemas), no próprio backend** | Tudo nativo do .NET, sem container novo. Senha com PBKDF2, bloqueio por tentativas e *security stamp* já vêm prontos. Revogação imediata das chaves por consulta no banco | Dois esquemas para manter. Sem SSO (fora de escopo) | Médio. Se surgir demanda de SSO, dá para adicionar OIDC como terceiro esquema sem remover os atuais |

## Decisão
Opção C. Pontos principais:
- **Esquemas:**
  - `Cookie`, para pessoas (ADR-0004).
  - `ApiKey`, para sistemas (ADR-0005).
  - Um *policy scheme* escolhe `ApiKey` quando há `Authorization: Bearer ftk_…` e `Cookie` nos demais casos.
- **Autorização fechada por padrão:** `FallbackPolicy` exige usuário autenticado. Só `GET /api/health` é `[AllowAnonymous]`. Um teste automatizado enumera as rotas pelo `EndpointDataSource` e falha se houver alguma anônima além dessa.
- **Tipos de principal (claim `ftk:tipo`):**
  - `pessoa`, com papéis fixos no código: `admin` (gere usuários, chaves, motoristas e o cadastro de veículos) e `operador` (lê o dashboard).
  - `sistema`, com escopos escolhidos na criação da chave: `frota:ler`, `telemetria:escrever` e `cadastro:escrever` (ADR-0014).
- **Políticas nomeadas por operação.** A matriz completa está no README. Credencial válida do tipo errado resulta em **403**: pessoa no endpoint de ingestão e sistema em endpoint de administração. Isso atende H-07.
- **Armazenamento:**
  - Pessoas: tabelas do Identity (`AddIdentityCore<Usuario>` + roles), com nomes em snake_case e chave Guid.
  - Sistemas: tabela `api_keys`.
  - Não usar `MapIdentityApi`: ele expõe cadastro aberto e tokens próprios.
- **Senha:** mínimo de 12 caracteres e sem regras de composição (NIST SP 800-63B). Bloqueio após 5 falhas por 15 min (premissa).

## Consequências
- Positivas: nenhum serviço novo, primeira execução inalterada e revogação imediata das chaves.
- Negativas:
  - Os testes precisam cobrir 401 e 403 nos dois esquemas.
  - Sem MFA nesta entrega. Fica registrado como evolução.
  - Quem quiser SSO terá que esperar o esquema OIDC.
- Monitorar: falhas de login por IP e por conta (log estruturado, sem a senha) e uso de chave revogada.
