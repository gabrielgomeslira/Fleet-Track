# ADR-0017: Guardar o instante do último sinal no veículo e aceitar posição nula
Status: aceito (2026-11-02: decisão do humano). Confirma a T-42 com quatro ajustes (seção "Ajustes na T-42").
Data: 2026-11-02
Histórias: H-12, H-32, H-37, H-40, H-23, H-16
Altera: modelo de dados do README dos ADRs. Não contradiz ADR vigente.

## Contexto
- O humano decidiu a retenção de 24 h, com piso de 2 h (P8). Fora da demo, o expurgo apaga a última posição, mas o alerta "sem sinal" precisa continuar (H-12, H-32).
- A página do veículo distingue três estados (H-32, H-37): nunca enviou, enviando e posição expirada. O modelo atual não representa nenhum deles sem inventar dado.
- Verificado no código em `fa67a8f`:
  - `vehicles.latitude` e `longitude` são `NOT NULL` com padrão **-23.55 / -46.63** (`AppDbContext.cs:35-38`). Um veículo sem posição "está em São Paulo".
  - `vehicles.speed` tem padrão 0 e `fuel_level`, padrão 100 (`:39-42`). Um veículo que nunca enviou nada mostraria "0 km/h, 100%". A H-40 e a H-31 proíbem isso: "sem dado, nunca zero".
  - A ingestão aceita `speed` e `fuelLevel` opcionais (README §Contratos), e `telemetry_records` tem os mesmos padrões (`:78-81`). Sem mudança, leitura omitida viraria 0 km/h, o que parece parada.
  - `updated_at` não serve como sinal: o `PUT /vehicles/{id}` da H-23 também o altera, e um cadastro apagaria um "sem sinal".
  - **O front quebra com nulo.** `VehiclesPage.tsx:45-47` e `VehicleTable.tsx:31` chamam `.toFixed` direto, e `types.ts:7-8` declara `number`. O `FleetMap` e o `mapaUtils` já filtram nulo.
- A `v1` ainda não existe na `master` (T-16 pendente). Campo nascer anulável não é quebra; virar anulável depois da primeira tag é, e o `oasdiff` reprovaria (ADR-0009).

**Atributos:** leitura de sinal em O(1) por veículo, sem tocar na telemetria (≤ 500 veículos*). Nenhuma posição além da retenção, em nenhuma tabela.

## Alternativas
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| A. Derivar o sinal de `max(recorded_at)` | Sem coluna | O expurgo apaga a fonte. **Não cumpre a H-12** | Baixo |
| B. Manter a posição no veículo e só apagar a telemetria | Sem migração de nulo | Guarda a última posição além da retenção, contra a H-12. É a trilha de um trabalhador | Baixo |
| C. Coordenada sentinela (0,0) e flag `position_expired` | Sem nulo no contrato | Dado falso no banco; o mapa precisa saber da sentinela; um esquecimento desenha um caminhão no Atlântico | Médio |
| **D. `last_signal_at timestamptz NULL` + posição, velocidade e combustível anuláveis** | **Os três estados saem de dois campos; nada inventado; contrato honesto** | Todo consumidor trata nulo | **Baixo: migração reversível, com a perda abaixo** |

## Decisão
Opção D.

**Estados** (derivados, sem coluna de estado):
| Estado | `last_signal_at` | `latitude`, `longitude` | Na tela |
|---|---|---|---|
| Nunca enviou | nulo | nulo | "aguardando primeira posição", sem alerta |
| Com posição | preenchido | preenchidos | Posição e horário do último sinal |
| Posição expirada | preenchido | nulo | "posição expirada" e o instante do último sinal; alerta continua |

**Esquema (uma migração só de expansão):**
- `vehicles.last_signal_at timestamptz NULL`. Sem índice: a leitura varre no máximo 500 veículos*.
- `vehicles.latitude`, `longitude`, `speed` e `fuel_level` aceitam nulo e **perdem o valor padrão**, inclusive no modelo do EF.
- `telemetry_records.speed` e `fuel_level` aceitam nulo e perdem o padrão. `latitude` e `longitude` da telemetria continuam obrigatórias: um registro sem posição não é posição.
- `CHECK ((latitude IS NULL) = (longitude IS NULL))`.
- `CHECK (latitude IS NULL OR last_signal_at IS NOT NULL)`: quem tem posição tem sinal.
- Preenchimento: `last_signal_at = COALESCE(max(recorded_at) do veículo, updated_at)`, antes dos `CHECK`. O plano dizia só `updated_at`; ele serve hoje, mas a telemetria é a fonte correta.

**Regras de escrita:**
- `last_signal_at` só é escrito pelo job da demo e pela ingestão. O cadastro (H-23) nunca o toca.
- Atualização condicional, em um único `UPDATE`: só altera se `last_signal_at IS NULL OR last_signal_at < recordedAt`. Posição atrasada entra na telemetria, mas não recua o veículo.
- `recordedAt` aceita até +2 min no futuro*, então a duração calculada é limitada a ≥ 0.
- `updated_at` passa a significar só "última alteração da linha". O "horário da última atualização" da H-37 usa `lastSignalAt`.

**Expurgo (T-42), em uma transação e com um corte só:**
1. `DELETE` da telemetria com `recorded_at < corte`.
2. `UPDATE vehicles SET latitude = NULL, longitude = NULL, speed = NULL WHERE last_signal_at < corte`.
3. Na demo, preserva o último registro e não faz o passo 2 (H-12, H-29).

`fuel_level` **fica**: não é localização, e a H-31 pede o alerta com a idade da leitura. A idade é a de `last_signal_at`. Um rastreador que envia combustível só às vezes terá idade subestimada: limite aceito, porque guardar `fuel_read_at` não paga o custo hoje.

**Contrato (reflexo em `v1`, T-16):**
```
latitude: number | null
longitude: number | null
speed: number | null
fuelLevel: number | null
lastSignalAt: string (ISO 8601 UTC) | null
```
- O campo sempre vem, com `null`. Nunca é omitido.
- Vale para `GET /vehicles` e `GET /vehicles/{id}`. Na telemetria, `speed` e `fuelLevel` são anuláveis; posição, não.

## Ajustes na T-42 (para o tech-lead)
1. **Entram na mesma migração:** `speed`, `fuel_level` (veículo e telemetria), a remoção dos padrões e os dois `CHECK`. A T-97 muda o tipo de `fuel_level` para `double precision`: a ordem entre elas precisa ser combinada.
2. **O front entra junto:** `types.ts`, `VehiclesPage.tsx:45-47,53,59`, `VehicleTable.tsx:31-32`, `TelemetryPage.tsx:76,82,187-188`, `PopupVeiculo.ts:51`, `MarcadorVeiculo.ts:15`. Sem isso, a tela de veículos lança `TypeError` no primeiro veículo sem posição (`null.toFixed`). A T-42 hoje não lista arquivo de front.
3. **O corte do passo 2 é por `last_signal_at`,** não por "ficou sem registro": evita subconsulta por veículo.
4. **`Down` tem perda:** para restaurar `NOT NULL`, preenche os nulos com os padrões antigos, e veículo expirado volta "em São Paulo". É aceitável só como recuperação; registrar no PR.

## Falhas
- Veículo com posição nula: fora do mapa, "sem dado" na tabela (ADR-0016 "Falhas"; já implementado no filtro do mapa, não na tabela).
- Velocidade nula: **não** conta como parado (H-33). A regra exige `speed = 0`.

## LGPD
- `last_signal_at` fica até o veículo ser removido. É dado indireto (veículo → motorista), sem localização. A T-61 lista isso entre os dados tratados.
- A última posição em `vehicles` passa a respeitar a retenção. Antes desta decisão, ela ficaria para sempre.

## Consequências
- **Positivas:** H-12, H-32 e H-37 cumpridas com dois campos; alerta "sem sinal" sem tocar na telemetria; fim da posição e do combustível inventados.
- **Negativas:** migração e front precisam entrar juntos; todo consumidor trata nulo; o `Down` perde informação.
- **Monitorar:** quantidade de veículos com posição expirada, no log do expurgo. Não medido: nada disso está implementado.

## Contradição encontrada nas histórias
A H-10 ainda diz "intervalo **e retenção** não são configuráveis por variável"; a H-12 e a T-42 definem `FLEET_TELEMETRY_RETENTION_HOURS`. Sigo a H-12, que é a decisão mais recente do humano. O PM ajusta o texto da H-10.

Próximo: tech-lead | entradas: este ADR, T-42.
