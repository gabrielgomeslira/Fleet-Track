# ADR-0018: Derivar os alertas na leitura, sem estado gravado, em uma rota só para pessoas
Status: aceito (2026-11-02: decisão do humano)
Data: 2026-11-02
Histórias: H-31, H-32, H-33, H-34, H-34b, H-37, H-47
Depende de: ADR-0017 (`last_signal_at`). Exceção declarada ao ADR-0010 (coleção sem cursor).
Responde: A1 (T-107, T-108, T-109).

## Contexto
- Regras em H-31 a H-33, sempre com o relógio do servidor. O alerta surge ou some em até 60 s, sem recarregar, e some sozinho quando a condição acaba (H-34).
- Nenhuma história pede histórico, reconhecimento ("ciente") ou notificação.
- Fora da demo, não há entregas (H-47), então "parado" nunca dispara. A telemetria pode ter sido expurgada (H-12).
- Volume: na demo, 10 veículos a 30 s, com no máximo 2.880 registros por veículo em 24 h. Escala: ≤ 500 veículos e ≤ 20 pessoas*.
- O que cada alerta precisa ler:
  | Alerta | Fonte | Custo |
  |---|---|---|
  | Combustível | `vehicles.fuel_level` | Linha do veículo |
  | Sem sinal | `vehicles.last_signal_at` (ADR-0017) | Linha do veículo |
  | Parado | `deliveries` + telemetria do período | Só para candidatos |

**Atributos (* = premissa, nada medido: o código não existe):**
- `GET /api/v1/alerts`: p95 < 300 ms* com 10 veículos e 24 h de telemetria.
- Sem alerta falso em falha: erro de leitura vira erro na central, nunca "tudo em ordem" (H-34).

## Alternativas

### 1. Onde calcular
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| A. No front | Sem endpoint | Relógio do navegador, contra a regra de M2; uma leitura de telemetria por veículo | Baixo |
| **B. Na leitura: `GET /api/v1/alerts`, função pura + consultas** | **Sem estado que possa divergir: corrige-se sozinho. Nada a expurgar. Testável com relógio injetado** | Custo a cada leitura; duração de "parado" limitada pela retenção | **Baixo** |
| C. Job grava tabela `alerts` | Leitura barata; abre caminho para histórico | Peça nova, rodando também fora da demo; atraso de um ciclo; tabela a manter coerente. Paga por uma função que nenhuma história pede | Médio |

### 2. Início do período "parado"
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| **A. Calcular da telemetria a cada leitura, só para candidatos** | **Fora da demo, custo zero, porque não há candidato. Estado correto sem lógica de escrita** | Lê até 2.880 linhas por candidato; acima da retenção, a duração para de crescer | **Baixo** |
| B. `stopped_since` + âncora no veículo, atualizados a cada posição | Leitura O(1); duração sobrevive ao expurgo | Mais lógica na ingestão (até 50 req/s*) **para um alerta que fora da demo nunca dispara**. Dois escritores (job e ingestão), com posições fora de ordem. Um erro fica gravado e não se corrige | Médio |

## Decisão
**1B + 2A.** Nada é gravado.

**Cálculo (`CalculadoraAlertas`, função pura com `TimeProvider`):**
1. Lê os veículos (`id, plate, speed, fuel_level, last_signal_at`) e os veículos com entrega `em_transito`. "Entrega em andamento" é esse status; `pendente` não conta.
2. **Combustível e sem sinal** saem dessas linhas (H-31, H-32). `last_signal_at` nulo: nenhum alerta de sinal.
3. **Candidato a parado:** tem entrega `em_transito`, `speed = 0` e sinal há menos de 10 min. `speed` nula não é candidato.
4. Para cada candidato, lê a telemetria desde o último registro com `speed > 0` e percorre **do mais antigo para o mais novo**: o primeiro registro é a âncora; distância > 50 m da âncora reinicia a âncora. O início do período é o instante da âncora (H-33). Usa o índice `(vehicle_id, recorded_at DESC)` da T-14.
5. O início não pode ser anterior ao `created_at` da entrega (H-33: "só corre com entrega em andamento").

**Limites assumidos:**
- **Duração acima da retenção.** Sem registro de reinício, o período começa no registro mais antigo que restou, e a resposta traz `durationIsMinimum: true`. A tela diz "há mais de 24 h". Leitura minha da H-34b: as durações "crescem até Crítico", e o Crítico vem em 2 h, então o nível não é afetado; só o número exibido.
- **Retenção abaixo de 2 h com demo ligada:** "parado" nunca chega a Crítico. Combinação improvável, sem tratamento.
- **Sem `started_at` na entrega.** Uma pendente promovida com o veículo já parado contaria desde a parada. Isso não ocorre na T-100, que promove a entrega na chegada. Coluna só com o cadastro de entregas.

**Gatilho para rever a opção 2A:** abrir o cadastro de entregas por API. Um rastreador a 1 s, com 24 h de retenção, são 86.400 linhas por candidato. Nesse dia, `stopped_since` passa a pagar o custo, em novo ADR.

**Contrato (aditivo, ADR-0009):**
```
GET /api/v1/alerts?vehicleId={id}   (vehicleId opcional, para a H-37)

200 {
  "data": [{
    "vehicleId": "uuid", "plate": "ABC1D23",
    "type": "sem_sinal" | "parado" | "combustivel",
    "level": "critico" | "atencao",
    "since": "ISO UTC" | null,          // sem_sinal e parado
    "durationSeconds": 900 | null,      // calculada no servidor
    "durationIsMinimum": false,
    "fuelLevel": 12.5 | null,           // combustivel
    "readingAt": "ISO UTC" | null       // combustivel: idade da leitura
  }],
  "total": 3,
  "evaluatedAt": "ISO UTC",
  "vehicleCount": 10,
  "stoppedEvaluated": true
}
```
- `data` já vem na ordem da H-34. **O corte de 8 é do front**, e "ver todos" não faz nova chamada.
- **Exceção ao ADR-0010, sem cursor.** A lista é calculada, cabe na memória e é limitada a 2 alertas por veículo: ≤ 1.000 itens*. `sem_sinal` e `parado` não coexistem. Um cursor sobre uma ordem que muda a cada leitura não teria significado.
- `vehicleCount = 0` → "não há veículos". `stoppedEvaluated = false` → não há entrega `em_transito`, e o aviso da H-47 aparece. **Vem do dado, não do campo `demo` do `/api/health` (T-102):** assim, nenhuma mudança é necessária quando o cadastro de entregas existir.
- Sem nome de motorista nem coordenada: o alerta não carrega dado pessoal direto.
- `GET` puro, com `no-store`. Veículo inexistente em `vehicleId`: 200 com lista vazia; o 404 vem do `GET /vehicles/{id}`.

**Atualização:** o front consulta a cada **30 s***, e não a 60 s: com 60 s exatos, o tempo de resposta estouraria o limite da H-34. Pausa com a aba oculta. Carga: 20 pessoas a 30 s = 0,67 req/s*.

**Autorização: só sessão de pessoa, como `dashboard/stats`.**
| Operação | Anônimo | `operador` | `admin` | `frota:ler` | `telemetria:escrever` | `cadastro:escrever` |
|---|---|---|---|---|---|---|
| `GET alerts` | 401 | ✔ | ✔ | 403 | 403 | 403 |

Nenhuma história pede alerta para integrador, e todo campo público entra no contrato congelado da `v1`. Abrir para `frota:ler` depois é aditivo; o contrário quebra quem já usa.

## Threat model (STRIDE)
| Fronteira | Ameaça | Controle |
|---|---|---|
| Navegador → `alerts` | **I**: ver a situação da frota sem sessão | Política de pessoa; linha na T-26 |
| Sistema → `alerts` | **E**: chave de integração lendo rota de pessoa | Tipo de principal → 403 (ADR-0003) |
| Sessão → `alerts` | **D**: leitura em laço | Custo limitado a ≤ 8 candidatos na demo. Sem limite de taxa próprio, a menos que a medição peça: a T-33 só limita o login |
| Ingestão → alerta | **T**: posição falsa apaga "sem sinal" | Escopo próprio e auditoria de chave (ADR-0005). `recordedAt` até +2 min |

## Falhas
| Falha | O que a pessoa vê |
|---|---|
| Banco fora | 503 Problem Details → central em erro com nova tentativa, **nunca** "tudo em ordem" |
| Consulta de telemetria falha para um candidato | A resposta inteira falha. Sem resultado parcial: um alerta omitido seria falso negativo silencioso |
| Telemetria vazia ou expurgada para um candidato | Sem alerta de parado; os outros seguem |
| Backend parado por mais de 10 min na demo | Todos "sem sinal" até a primeira rodada do job: aceito na H-34b |

## Consequências
- **Positivas:** nenhuma tabela, nenhum job e nada a expurgar; zero custo em telemetria fora da demo; regra numa função pura testável nas bordas.
- **Negativas:** duração de "parado" para de crescer na retenção; leitura proporcional ao tamanho do período; sem histórico de alertas.
- **Monitorar:** p95 de `GET /alerts`. **A T-107 mede em Postgres real, com 24 h de telemetria da demo,** e registra o número no PR. Sem essa medição, os 300 ms* continuam premissa.

Próximo: tech-lead | entradas: este ADR, ADR-0017, T-107, T-108, T-109.
