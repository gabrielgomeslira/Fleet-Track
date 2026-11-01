# ADR-0012: Manter o histórico do Git sem reescrita antes de anunciar o projeto
Status: proposto
Data: 2026-10-31
Histórias: H-20 (risco "histórico com binários e caminhos locais" do PRD)

## Contexto
- Fatos verificados em 2026-10-31:
  - **O repositório já é público**: `https://github.com/gabrielgomeslira/Fleet-Track` responde HTTP 200 sem login. A recomendação do PRD ("tornar público só depois da fase 2") já não se aplica. O que ainda dá para controlar é o **anúncio**.
  - O histórico tem 7 commits e o pack ocupa 686 KB. Os commits `baf11a4`…`c21c223` são de um exercício antigo (`DIO.Series`, .NET 5): `bin/`, `obj/`, `.vs/`, `.exe`, `.dll`, `.pdb`. O maior binário tem 126 KB.
  - Caminhos locais do autor (`C:\Users\<usuário>\...`) aparecem em `obj/*.json` e `runtimeconfig.dev.json` antigos.
  - A senha de desenvolvimento do banco aparece em `.env.example` (`4109c68`). Ela nunca foi credencial de produção e deixa de ser padrão com H-08.
  - Nenhum segredo real foi encontrado (appsec SEC-06, mais `git grep` no histórico).
  - Dois commits recentes têm o e-mail pessoal do autor como autor. Os antigos usam o e-mail `noreply` do GitHub.
- Reescrever o histórico de um repositório já publicado não apaga o que foi clonado, cacheado ou arquivado. Só quebra SHAs e forks.

## Alternativas
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| **A. Manter o histórico como está** | Zero risco operacional. SHAs estáveis. Transparência | Binários antigos e caminhos locais continuam visíveis (cerca de 300 KB e o nome de usuário Windows) | Nulo agora. Reescrever depois é possível, mas fica cada vez mais caro com forks |
| B. `git filter-repo` para remover `bin/`, `obj/` e `.vs/` + force-push | Histórico mais limpo | Exige force-push na branch principal de um repositório público. O conteúdo já está exposto. Ganho cosmético | Irreversível para quem já clonou |
| C. Recomeçar com um commit único (squash) em repositório novo | Histórico limpo e "1.0" | Perde autoria e rastreabilidade. Os links e estrelas atuais ficam no repositório antigo | Alto |

## Decisão
Opção A. O conteúdo indesejado não é sensível: binários de exercício, nome de usuário local e uma senha de desenvolvimento que nunca protegeu dado real. Ele já está público, então reescrever não traz proteção real e quebra referências.
- Higiene sem reescrita:
  - `.gitignore` cobrindo `bin/`, `obj/`, `.vs/`, `.env` (já no working tree).
  - `gitleaks` na CI (H-08) varrendo o **histórico completo** uma vez e os PRs depois.
  - Opcional: `.mailmap` para padronizar a autoria **exibida**, se o autor preferir o `noreply`. Ele não remove o e-mail dos objetos. Remover exigiria a opção B, e é decisão do humano.
- Como o repositório já é público, o anúncio (README, divulgação, tag v1.0) só sai depois da fase 2. Até lá, o README ganha um aviso no topo: "Em desenvolvimento: sem autenticação até a v1.0. Não use com dados reais."

## Consequências
- Positivas: nenhum force-push e nenhum fork quebrado. O esforço fica nas fases 1–3.
- Negativas: arquivos antigos irrelevantes continuam no histórico.
- **Decisão do humano necessária:** (1) aceitar o e-mail pessoal nos commits `7c4eace` e `4109c68` ou reescrever só a autoria (opção B restrita) **antes** de divulgar. (2) Manter o repositório público até a fase 2 ou torná-lo privado temporariamente (o GitHub permite, com efeito sobre estrelas e forks).
