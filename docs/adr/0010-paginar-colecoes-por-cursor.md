# ADR-0010: Paginar todas as coleções por cursor (keyset), sem total obrigatório
Status: proposto
Data: 2026-10-31
Histórias: H-11 e H-17 (valida o alvo de < 500 ms)

## Contexto
- Hoje `vehicles` e `deliveries` devolvem a tabela inteira, e a telemetria devolve as últimas 50 linhas fixas (SEC-05).
- H-11 pede página padrão, limite máximo com 400 e "total ou indicação de próxima página".
- H-17 pede a telemetria de um veículo com 1 milhão de registros em < 500 ms.
- A forma de paginação faz parte do contrato `v1` (ADR-0009). Trocar depois é mudança incompatível.
- Não há índice em `telemetry_records`, e a consulta atual faz *seq scan* + sort.

## Alternativas
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| A. `page`/`pageSize` (offset) com `total` | Familiar e permite pular para a página N | `OFFSET` alto lê e descarta todas as linhas anteriores (O(n)): página 10.000 da telemetria lê ~500 mil linhas. `COUNT(*)` em 1 milhão de linhas custa dezenas a centenas de ms. Páginas instáveis sob inserção contínua (a telemetria chega a cada 5 s) | Alto (contrato) |
| **B. Cursor opaco sobre a chave de ordenação (`limit` + `cursor`)** | Custo constante por página, com qualquer profundidade e volume. Estável sob inserção. Natural para integrador sincronizando | Sem "ir para a página N". O front usa "próxima/anterior" ou "carregar mais" | Alto (contrato) |
| C. Offset para coleções pequenas e cursor para telemetria | Ótimo local | Dois padrões no contrato confundem o integrador | Alto |

## Decisão
Opção B em todas as coleções.
- **Requisição:** `?limit=50&cursor=<opaco>`. O padrão é 50 e o máximo 200. `limit` fora de 1–200 ou cursor inválido resultam em 400 com o limite aceito.
- **Resposta:** `{ "data": [...], "page": { "limit": 50, "nextCursor": "…" | null } }`. Resultado vazio é 200 com `data: []`.
- **O cursor** é a última chave de ordenação em base64url: `recorded_at` na telemetria (único por veículo), `(created_at, id)` nas entregas e `(plate, id)` nos veículos. O desempate por `id` garante ordem total onde a chave pode repetir.
- **Telemetria:** `GET /api/v1/vehicles/{id}/telemetry?from=&to=&limit=&cursor=`, em ordem decrescente de `recorded_at`. Veículo inexistente é 404.
- **Sem `total`** no contrato. Se o front precisar de contagem para o dashboard, ela vem dos agregados de `/dashboard/stats`, não da listagem.
- **Índices** (migração, ADR-0002):
  - `UNIQUE telemetry_records (vehicle_id, recorded_at DESC)`. Como `recorded_at` é único por veículo, o cursor da telemetria é só `recorded_at`, sem desempate por `id`. O mesmo índice serve à idempotência da ingestão em H-16: o mesmo veículo e instante não duplicam (`ON CONFLICT DO NOTHING`, resposta 200 em vez de 201).
  - `deliveries (created_at DESC, id DESC)`, `deliveries (status, created_at DESC)`, `deliveries (vehicle_id)`.
  - `vehicles (plate, id)`.

## Validação do alvo de H-17 (< 500 ms com 1 milhão de registros)
- Consulta: `WHERE vehicle_id = $1 [AND recorded_at < $cursor] [AND recorded_at BETWEEN $from AND $to] ORDER BY recorded_at DESC LIMIT 50`.
- Com o índice composto, é uma *index scan* que lê cerca de 50 entradas e 50 tuplas (alguns poucos blocos), independente de haver 1 milhão ou 100 milhões de linhas. **Estimativa analítica, não medida:** < 10 ms no banco e < 50 ms ponta a ponta, em hardware modesto (2 vCPU, disco SSD).
- Sem o índice, ou com offset profundo, o mesmo cenário faz varredura de ~1 milhão de linhas: cerca de 100–400 ms com o cache quente e segundos com o cache frio. Fica no limite ou estoura o alvo.
- **Conclusão:** o alvo de 500 ms é viável com folga, **desde que** existam índice composto + cursor + ausência de `COUNT`. Proposta de alvo mais útil: **p95 < 100 ms no servidor**, com 1 milhão de linhas no veículo e 10 milhões na tabela, 10 req/s.
- **Como comprovar (tarefa da fase 3, para o tech-lead):** script de benchmark que popula 1 milhão de linhas para um veículo e 10 milhões no total (`generate_series`), roda `EXPLAIN (ANALYZE, BUFFERS)` e verifica `Index Scan` e tempo < 100 ms. Depois, carga com `k6` (10 req/s por 1 min) e verificação do p95. Rodar sob demanda, não em todo PR.
- Volume real: com um ponto a cada 5 s, 1 milhão de linhas é cerca de 58 dias de um veículo. O expurgo de H-12 limita esse crescimento (prazo não definido aqui).

## Consequências
- Positivas: desempenho previsível em qualquer volume. O mesmo índice resolve a consulta e a deduplicação da ingestão.
- Negativas: a UI perde "ir para a página N" (ux-ui precisa saber disso) e não há total nas listagens.
- Monitorar: p95 de `GET …/telemetry` e tamanho de `telemetry_records`. Se passar de cerca de 100 milhões de linhas, avaliar particionamento por tempo (não agora).
