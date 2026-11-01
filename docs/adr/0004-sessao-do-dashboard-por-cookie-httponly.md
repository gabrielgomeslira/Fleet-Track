# ADR-0004: Manter a sessão do dashboard em cookie HttpOnly na mesma origem, sem token acessível ao JavaScript
Status: proposto
Data: 2026-10-31
Histórias: H-06 (e o 401 → login de H-21)

## Contexto
- O front (React + Vite) é servido pelo Nginx, que também faz proxy de `/api/` para o backend (`frontend/nginx.conf`). Front e API já estão na **mesma origem**.
- H-06 exige:
  - Expiração com retorno ao ponto onde a pessoa estava.
  - Ação de sair.
  - Bloqueio após tentativas falhas.
  - Mensagem de erro que não revela qual campo errou.
- Os dados exibidos são pessoais (LGPD). Em XSS, o principal risco é roubo de credencial.
- Atributos (premissas): sessão ociosa expira em 30 min e a sessão absoluta em 12 h. Revogação de sessão (troca de senha, usuário desativado) em ≤ 5 min.

## Alternativas
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| A. JWT de acesso + refresh guardados em `localStorage` | Comum em SPA. Sem estado no servidor | Token legível por qualquer XSS. Exige montar rotação de refresh e revogação. Mais código no front | Médio |
| B. JWT em memória + refresh em cookie HttpOnly | Reduz a janela de XSS | Mesma complexidade de A, mais um endpoint de refresh e um *race* entre abas | Médio |
| **C. Cookie de autenticação do ASP.NET (ticket cifrado com Data Protection), HttpOnly, SameSite=Strict** | Nativo. O JS nunca vê a credencial. Expiração deslizante e *security stamp* já vêm prontos. O front só reage a 401 | Exige proteção contra CSRF nas escritas. Revogação de uma sessão isolada só vem com store no servidor | Baixo. Trocar por store de sessão no banco (`ITicketStore`) é aditivo |

## Decisão
Opção C.
- **Cookie `ftk_session`:** `HttpOnly`, `SameSite=Strict`, `Path=/`.
  - `Secure` sempre que a URL pública for HTTPS (`FLEET_PUBLIC_URL`).
  - Em `http://localhost` (avaliação), `SameAsRequest`, com aviso no log de que a instância está sem HTTPS.
- **Expiração:** deslizante de 30 min e absoluta de 12 h. O *security stamp* é revalidado a cada 5 min: troca de senha, desativação ou "sair de todos os dispositivos" derrubam a sessão em até 5 min.
- **API, não páginas:** os eventos `OnRedirectToLogin` e `OnRedirectToAccessDenied` devolvem **401** e **403** em Problem Details (RFC 9457), em vez de redirecionar. O front guarda a rota atual, vai para o login e volta depois (H-06).
- **Endpoints:**
  - `POST /api/v1/auth/login`: erro genérico "usuário ou senha inválidos". Bloqueio do Identity após 5 falhas por 15 min e mensagem genérica de bloqueio temporário.
  - `POST /api/v1/auth/logout`.
  - `GET /api/v1/auth/me`.
  - `POST /api/v1/auth/password`.
- **CSRF:** escritas autenticadas por cookie exigem o cabeçalho `X-Requested-With: fleet-track`. Esse cabeçalho dispara *preflight*, e o CORS está fechado (ADR-0006). Somado ao `SameSite=Strict`, isso basta. Chamadas com chave de API não precisam dele.
- **Chaves do Data Protection** persistidas no Postgres (tabela `data_protection_keys`). Se ficassem no container, cada reinício derrubaria todas as sessões. Nenhum segredo novo é exigido de quem instala.
- **Limite por IP no login** no Nginx (ADR-0006), além do bloqueio por conta.

## Consequências
- Positivas: zero token no JS e menos código no front. A revogação é previsível (≤ 5 min) e documentada.
- Negativas:
  - Sem lista de sessões ativas por usuário. Se for preciso, adicionar `ITicketStore` no Postgres.
  - As chaves do Data Protection ficam no banco sem cifra adicional. Quem obtém acesso ao banco já tem todos os dados, então o risco foi aceito e fica documentado.
- Monitorar: taxa de 401 por sessão expirada (é UX, não ataque) e bloqueios por conta.
