# ADR-0020: Guardar o prazo na entrega e calcular a situação e a taxa de pontualidade no servidor
Status: aceito (2026-11-02: decisão do humano, inclusive `dueAt` e `situation` visíveis a `frota:ler`; ver "Decisão do humano")
Data: 2026-11-02
Histórias: H-30b, H-42, H-43, H-44, H-45, H-47; H-46 continua adiada
Responde: A4 (T-114, T-115). Confirma a D4: a data de conclusão é `deliveries.delivered_at` (`Delivery.cs:11`).

## Contexto
- Decisão do humano: cadastro de entregas por API fora. O prazo só existe nas entregas da demo.
- `GET /deliveries` é paginado, sem total (ADR-0010). O front não enxerga todas as entregas, então **não consegue calcular a taxa**.
- A H-44 exige fórmula, janela de 30 × 24 h e arredondamento exatos. "A taxa bate com a contagem da lista" é o critério de sucesso.
- Volume: 30 entregas na demo, 0 fora dela.

**Atributos:** `GET /deliveries/punctuality` p95 < 200 ms* com o volume da demo (não medido). Sem tolerância: 1 s depois do prazo já é atraso (H-43).

## Alternativas

### 1. Onde guardar o prazo
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| **A. `deliveries.due_at timestamptz NULL`** | **Aditivo e instantâneo. Existentes ficam "sem prazo", como a H-42 pede** | Nenhum relevante | **Baixo** |
| B. Tabela `delivery_deadlines` | Permite histórico de prazo | Junção por um campo 1:1; nenhuma história pede histórico | Médio |

### 2. Onde calcular a situação e a taxa
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| A. Só `dueAt`; o front calcula a situação, e a taxa percorre todas as páginas | Sem endpoint | Relógio do navegador muda a situação; regra em dois lugares; varre a coleção | Médio |
| **B. Situação em cada entrega + `GET /api/v1/deliveries/punctuality`** | **Regra única, usada pela linha e pela taxa: não divergem. Relógio do servidor** | Endpoint novo | **Baixo: aditivo** |
| C. Taxa em `dashboard/stats` | Sem rota nova | Mistura com os agregados do Dashboard. Toda carga do Dashboard pagaria por algo que a área de entregas usa; muda um contrato com testes estáveis (T-06) | Baixo |
| D. Tabela de agregados | Leitura O(1) | Um contador para no máximo 30 linhas | Médio |

## Decisão
**1A + 2B.**

**Esquema:** `ALTER TABLE deliveries ADD COLUMN due_at timestamptz NULL`. Só expansão, sem preenchimento; o `Down` remove. **Sem índice:** a tabela tem 30 linhas na demo e está vazia fora dela. Se o cadastro de entregas abrir, entra um índice parcial `(due_at) WHERE due_at IS NOT NULL`.

**Regra única (`SituacaoEntrega`, função pura com `TimeProvider`):**
| Status | Condição | `situation` |
|---|---|---|
| `pendente`, `em_transito` | `agora <= due_at` | `no_prazo` |
| `pendente`, `em_transito` | `agora > due_at` | `atrasada` |
| `entregue` | `delivered_at <= due_at` | `concluida_no_prazo` |
| `entregue` | `delivered_at > due_at` | `concluida_com_atraso` |
| `entregue` | `delivered_at` nulo | `null`, fora da taxa |
| `cancelado` | qualquer | `null`, fora da taxa |
| qualquer | `due_at` nulo | `null`, fora da taxa |

**Contrato (aditivo):**
```
GET /api/v1/deliveries e /deliveries/{id} ganham:
  dueAt: string (ISO UTC) | null
  situation: "no_prazo" | "atrasada" | "concluida_no_prazo" | "concluida_com_atraso" | null

GET /api/v1/deliveries/punctuality
200 {
  "evaluatedAt": "ISO UTC",
  "windowStart": "ISO UTC",     // agora − 30 × 24 h
  "withDueDate": 28,            // com prazo, não canceladas, sem janela
  "onTime": 15,                 // concluídas no prazo, na janela
  "base": 20,                   // concluídas com prazo + abertas atrasadas, na janela
  "ratePercent": 75 | null,     // null quando base < 5
  "overdue": { "count": 2 }     // abertas atrasadas agora, sem janela (H-45)
}
```
- **A rota não conflita** com `/deliveries/{id}`, que tem a restrição `{id:guid}`.
- **Estados da tela, todos a partir do dado:**
  | Dado | Tela (H-44) |
  |---|---|
  | `withDueDate = 0` | "Não há entregas com prazo" |
  | `withDueDate > 0` e `base = 0` | "Ainda não há o que calcular" |
  | `0 < base < 5` | Só a contagem |
  | `base >= 5` | "15 de 20, 75%" |
- **Arredondamento em inteiros, sem ponto flutuante:** `(200 × onTime + base) / (2 × base)`, com divisão inteira. 2/3 = 67; 149/200 = 75. Em `double`, 74,5 pode cair para 74.
- Consulta: agregação única sobre `deliveries`. O `count` de `overdue` e os da janela saem do mesmo instante `evaluatedAt`.
- `há quanto tempo` (H-45) o front calcula com `dueAt` e `evaluatedAt`, não com o relógio do navegador.

**Autorização:**
| Operação | Anônimo | `operador` | `admin` | `frota:ler` | `telemetria:escrever` | `cadastro:escrever` |
|---|---|---|---|---|---|---|
| `GET deliveries/punctuality` | 401 | ✔ | ✔ | 403 | 403 | 403 |
| `GET deliveries`, `deliveries/{id}` | sem mudança | | | | | |

**Escrita:** só o seed e o rodízio da demo gravam `due_at` (T-114). Nenhuma rota aceita prazo. Gravar direto no banco não é caminho suportado (M4).

## Duas leituras: uma com o PM, outra confirmada
1. **Janela da H-44.** A história diz "30 × 24 h a partir de agora" e também "concluída com prazo ainda futuro entra na taxa". Adoto `due_at >= agora − 30 × 24 h`, **sem limite superior**. Consequência: aberta atrasada há mais de 30 dias sai da taxa, mas continua em `overdue.count`. O PM confirma.
2. **`dueAt` visível para `frota:ler`.** A H-46 está adiada, mas `GET /deliveries` é a mesma rota para pessoas e sistemas. Filtrar campo por tipo de principal é lógica nova sem ganho: fora da demo, o valor é sempre nulo. **Os campos ficam visíveis; o que continua adiado é o teste de conformidade e a documentação de integração.** Confirmada pelo humano; ver "Decisão do humano".

## Threat model (STRIDE)
| Fronteira | Ameaça | Controle |
|---|---|---|
| Navegador → `punctuality` | **I**: indicador da operação sem sessão | Política de pessoa; linha na T-26 |
| Sistema → `punctuality` | **E**: chave lendo rota de pessoa | Tipo de principal → 403 |
| Escrita de `due_at` | **T**: alterar prazo para melhorar a taxa | Nenhuma rota escreve. Com o cadastro de entregas, `due_at` exige auditoria própria, em novo ADR |

Nenhum campo novo é dado pessoal. A entrega só leva ao motorista pelo veículo, como já leva hoje.

## Falhas
| Falha | O que a pessoa vê |
|---|---|
| `punctuality` falha | Erro com nova tentativa no bloco da taxa; a lista continua (H-44) |
| Lista falha | Erro com nova tentativa na lista; a taxa continua |
| Fora da demo | `withDueDate = 0`, tela vazia com o motivo, sem erro (H-47) |

## Consequências
- **Positivas:** uma regra só para linha, taxa e atrasadas; migração sem risco; demo reproduzível com relógio simulado.
- **Negativas:** dois campos a mais no contrato de entregas e uma rota nova, sem uso fora da demo até existir cadastro.
- **Monitorar:** a conferência manual da H-44 ("taxa bate com a lista") **com a pilha real**. Teste de unidade da função não prova o que aparece na tela.

## Decisão do humano
**Aceito em 2026-11-02:** `dueAt` e `situation` aparecem para chaves `frota:ler` em `GET /deliveries`, com a H-46 adiada. Motivo da recomendação aceita: é leitura, não custa nada, e fora da demo é sempre nulo.

Próximo: tech-lead | entradas: este ADR, T-114, T-115, T-116, T-117.
