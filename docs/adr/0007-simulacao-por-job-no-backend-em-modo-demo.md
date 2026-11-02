# ADR-0007: Simular a frota com um único job no backend, ligado só em modo demo, e remover o endpoint de simulação
Status: aceito (P1 confirmada pelo humano em 2026-11-01). **Revisto em 2026-11-02: intervalo de 30 s** (decisão D1 do plano, H-25).
Data: 2026-10-31; revisão em 2026-11-02
Histórias: H-10 (sem tag ARQ, registrado a pedido do orquestrador), H-14, H-24, H-25, H-27

**Estado na `master` (`fa67a8f`):** ainda não implementado. `POST /api/telemetry/simulate` continua em `TelemetryController.cs:39-68`, e o front continua chamando-o. A T-35 faz a troca.

## Contexto
- Na decisão original, cada aba aberta chamava `POST /api/telemetry/simulate` a cada 5 s. O endpoint é público e altera todos os veículos `em_rota` (SEC-01): N abas geram N vezes mais escritas.
- Leitura confirmada pelo humano: o front não chama mais o endpoint, um job do backend move os veículos só no modo demo, o intervalo é fixo e as variáveis `Simulation__*` saem.
- **Volume do job, a 30 s:** um registro por veículo em cada ciclo, inclusive os parados (T-35). Com 10 veículos, são **28,8 mil linhas por dia**, contra 172,8 mil a 5 s. Em 2 h, **240 pontos por veículo**, contra 1.440. Com a retenção de 24 h (H-12), a tabela estabiliza perto de 28,8 mil linhas. O texto original estimava 104 mil por dia, com 6 veículos a 5 s.
- **Por que 30 s:** é o maior valor que mantém o limite de 15 km/h da H-25. No mapa nacional, a diferença é invisível: 1 px a cada 6 min (ADR-0016). O poll do front continua em 5 s.

## Alternativas
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| A. Manter o endpoint protegido (só `admin`) e um cron externo | Explícito | Peça externa (cron) e mais um passo na primeira execução | Baixo |
| **B. `BackgroundService` no backend, `PeriodicTimer` de 30 s (era 5 s), ligado só com `FLEET_DEMO_MODE=true`, e endpoint removido** | Nativo, uma execução por instância e zero superfície HTTP | Com mais de uma instância, os jobs se multiplicariam (resolvido com lock consultivo) | Baixo |
| C. Container `simulator` separado que posta posições pela API de ingestão (H-16) | Exercita o caminho real de integração | Exige chave de API provisionada automaticamente e um serviço a mais. Depende da fase 3 | Médio |

## Decisão
Opção B.
- `POST /api/telemetry/simulate` é **removido**. Ele não é protegido nem mantido: endpoint que não existe não pode ser chamado.
- O job roda só se `FLEET_DEMO_MODE=true`. O padrão do aplicativo é `false`. O `.env.example` traz `true`, com um comentário pedindo para desligar em produção, porque a primeira execução é de avaliação.
- O intervalo de **30 s** é constante no código. Não há variável (H-10, H-25).
- Cada ciclo tenta `pg_try_advisory_lock(<constante>)`. Se outra instância detém o lock, o ciclo é pulado. Assim só existe um job, mesmo com réplicas.
- O instante do registro é o do ciclo, alinhado a múltiplos de 30 s (UTC). Com o índice único `(vehicle_id, recorded_at)` e `ON CONFLICT DO NOTHING`, repetir um ciclo é inofensivo (D6, H-27).
- O job lê a rota da entrega (`route_path`, ADR-0016) e escreve `last_signal_at` (ADR-0017). O passeio aleatório do endpoint antigo não é reaproveitado (H-24).
- O mesmo `FLEET_DEMO_MODE` controla o *seeder* de dados fictícios (H-14, ADR-0002). Fora do modo demo, nada é semeado nem alterado.
- Evolução natural: se a fase 3 validar a ingestão, a opção C pode substituir esta (ADR futuro).

## Consequências
- Positivas: escritas constantes, independentes do número de abas, e superfície de escrita anônima eliminada.
- Negativas: o veículo só muda de posição a cada 30 s, embora o front consulte a 5 s. Em 5 de cada 6 consultas, nada muda. Mudar o poll do front é decisão à parte.
- O expurgo (T-42) mantém a tabela em tamanho constante; a retenção foi decidida na H-12. Até a T-42 entrar, ela cresce 28,8 mil linhas por dia.
- Reverter continua barato: o job fica isolado num único serviço.
