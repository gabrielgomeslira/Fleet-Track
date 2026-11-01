# ADR-0013: Publicar releases por tag semver, com imagens multiarquitetura no GHCR e compose que usa imagens fixadas
Status: proposto
Data: 2026-10-31
Histórias: H-20 (licença MIT já decidida pelo humano; aqui se decide o mecanismo de release). Afeta H-18 (tempo de primeira execução).

## Contexto
- H-20 exige semver, entrada no CHANGELOG e imagens publicadas com a mesma versão.
- Hoje o `docker-compose.yml` só tem `build:`. A primeira execução compila .NET e Node na máquina de quem avalia: vários minutos e consumo de rede e disco, o que pesa na métrica de ≤ 15 min.
- Há usuários em macOS com Apple Silicon (arm64), Windows e Linux (amd64). O PRD exige que funcione nos três.
- Hospedagem: o repositório está no GitHub e o `GITHUB_TOKEN` já publica no GHCR sem conta nova.

## Alternativas
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| A. Sem imagens publicadas (só `build`) | Nada a operar | Primeira execução lenta. "Imagens publicadas" de H-20 não é atendido | Não se aplica |
| B. Docker Hub | Registro mais conhecido | Conta e token extras. Limites de pull anônimo | Baixo |
| **C. GHCR (`ghcr.io/gabrielgomeslira/fleet-track-{backend,frontend}`)** | Integrado ao repositório e ao `GITHUB_TOKEN`. Gratuito para imagens públicas | Menos conhecido que o Hub (irrelevante com o nome completo no compose) | Baixo. Dá para espelhar no Hub depois |

## Decisão
Opção C.
- **Gatilho:** push de tag `vX.Y.Z` na branch principal. O workflow `release.yml`:
  1. Roda a CI completa.
  2. Constrói as imagens `linux/amd64` + `linux/arm64` (buildx), com bases fixadas por digest (H-04).
  3. Publica as tags `X.Y.Z`, `X.Y` e `X`. **Sem `latest`** no compose de exemplo.
  4. Gera atestado de proveniência (`actions/attest-build-provenance`) e SBOM.
  5. Cria a GitHub Release com a seção do CHANGELOG e o `docker-compose.yml` da versão como anexo.
- **Versão:**
  - SemVer 2.0. Antes da v1.0 (`0.y.z`), sem garantia de compatibilidade.
  - A v1.0 é a primeira versão anunciada, ao fim da fase 2 + contrato `v1`.
  - Mudança incompatível na API (novo `/api/v2`, ADR-0009), no esquema sem migração automática ou em variável obrigatória implica *major*.
  - O backend expõe a versão em `/api/health` e no cabeçalho `X-Fleet-Version`.
- **CHANGELOG:** formato *Keep a Changelog*, em pt-BR enquanto o idioma estiver pendente. A CI exige a seção `[X.Y.Z]` antes de publicar a tag.
- **Compose:**
  - `docker-compose.yml` usa `image: ghcr.io/…:${FLEET_VERSION}`, com a versão do release como padrão.
  - `compose.dev.yml` acrescenta `build:` para contribuidores (junto com as portas de desenvolvimento do ADR-0006).
  - Na branch principal, antes da primeira tag, o README instrui a usar o arquivo de dev.
- **Licença:** arquivo `LICENSE` com o texto MIT, mais o campo `license` no `package.json` e no `.csproj`.

## Consequências
- Positivas: a primeira execução vira download, não compilação, e ajuda a métrica de 15 min. As versões são rastreáveis e as imagens verificáveis.
- Negativas: build arm64 com emulação no runner deixa o release mais lento (aceitável, só em tag). Há mais um workflow para manter.
- Monitorar: tempo do workflow de release, pulls por versão (estatística do GHCR) e se alguém pede `latest` (decidir depois).
