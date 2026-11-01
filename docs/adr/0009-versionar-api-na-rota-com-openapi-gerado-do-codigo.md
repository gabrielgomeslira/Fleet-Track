# ADR-0009: Versionar a API pela rota (`/api/v1`) e publicar um OpenAPI gerado do código, verificado na CI
Status: proposto
Data: 2026-10-31
Histórias: H-15 (base de H-16, H-17 e H-21)

## Contexto
- Não existe contrato. As rotas são `api/[controller]` sem versão e as respostas são objetos anônimos.
- H-15 exige:
  - Especificação publicada com erros e exemplos.
  - Mudança incompatível = nova versão + CHANGELOG.
  - "A especificação servida corresponde ao comportamento real (verificado na CI)".
- Os integradores típicos (ERP, script, rastreador) usam ferramentas simples (`curl`, HTTP de ERP) e geram cliente a partir de OpenAPI.

## Alternativas
**Onde fica a versão**
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| **A. Na rota (`/api/v1/...`)** | Visível, cacheável e roteável no Nginx. Trivial em `curl` e em ERP | Uma URL nova por versão maior | Alto depois de publicada (é o próprio contrato) |
| B. Cabeçalho (`Api-Version: 1`) ou media type | URL estável | Invisível em logs e no navegador. Muitos clientes de ERP não definem cabeçalho customizado com facilidade. Proxy precisa variar cache | Alto |

**Fonte do contrato**
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| C. Contrato escrito à mão (YAML) e testes contra ele | Desenho primeiro | Duas fontes, que divergem. Exige ferramenta de validação de respostas | Médio |
| **D. Gerado do código (`Microsoft.AspNetCore.OpenApi`, OpenAPI 3.1, gerado no build), com snapshot versionado no repositório** | Uma fonte só. O diff do snapshot aparece no PR | Exige DTOs nomeados e atributos de resposta (hoje são anônimos) | Baixo |

## Decisão
A + D.
- **Rotas versionadas:** todo endpoint de dados vai para `/api/v1/...`. A saúde fica fora da versão (`/api/health`). As rotas atuais sem versão são **removidas**, não mantidas como alias: nenhum consumidor externo depende delas, e o front migra junto.
- **Versão maior só na rota.** Mudanças aditivas (campo novo, endpoint novo, valor de enum novo documentado como extensível) ficam em `v1`. Mudança incompatível cria `v2`, que convive com `v1` por pelo menos um release maior, com `Deprecation` e `Sunset` (RFC 8594) na `v1`.
  - A versão do contrato é independente da semver do produto. Um `v2` da API implica release *major* do produto (ADR-0013).
- **Contrato:**
  - Arquivo `docs/api/openapi.v1.json` versionado, gerado no build (`Microsoft.Extensions.ApiDescription.Server`) e servido em `/api/v1/openapi.json`, com autenticação, porque descreve dados pessoais.
  - Uma visualização estática (Redoc ou Scalar) publicada nas releases ou no GitHub Pages, sem expor a instância.
- **Verificação na CI:**
  1. O build regenera o arquivo e falha se ele diferir do versionado (*drift*).
  2. `oasdiff breaking` compara com o contrato da última tag. Mudança incompatível dentro de `v1` reprova o PR.
  3. Testes de integração (H-03, H-05) validam respostas reais contra os schemas do arquivo.
- **Convenções do contrato** (detalhes no README §Contratos):
  - Erros em Problem Details (RFC 9457, `AddProblemDetails`), com `type` estável por erro.
  - 400 com `errors` por campo.
  - Paginação por cursor (ADR-0010).
  - Datas em ISO 8601 UTC.
  - Vocabulário de status único, como enum no contrato (H-21).
  - `429` com `Retry-After`.
  - Exemplos (`curl`) por operação.

## Consequências
- Positivas: o integrador tem um contrato estável e verificável, o PR mostra o diff do contrato e a quebra acidental é barrada na CI.
- Negativas: é preciso trocar objetos anônimos por DTOs, o que é trabalho de fase 3. A `v1` congela nomes de campo: revisar nomes antes do primeiro release, por exemplo padronizar em inglês ou português.
- Monitorar: tempo de execução do job de contrato na CI e uso de `v1` depois que existir `v2`.
