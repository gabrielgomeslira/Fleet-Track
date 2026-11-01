# ADR-0007: Simular a frota com um único job no backend, ligado só em modo demo, e remover o endpoint de simulação
Status: proposto, **dependente da confirmação do humano** (decisões 5 e 7 do maestro se contradizem; usa-se a leitura provisória abaixo)
Data: 2026-10-31
Histórias: H-10 (sem tag ARQ, registrado a pedido do orquestrador) e H-14

## Contexto
- Hoje cada aba aberta chama `POST /api/telemetry/simulate` a cada 5 s (`frontend/src/App.tsx:44-49`). O endpoint é público e altera todos os veículos `em_rota` (SEC-01): N abas geram N vezes mais escritas.
- Leitura provisória que este ADR adota: o front não chama mais o endpoint, um job do backend move os veículos só no modo demo, o intervalo é fixo e as variáveis `Simulation__*` saem.
- Volume do job: com 6 veículos em rota a cada 5 s, são cerca de 104 mil linhas de telemetria por dia. Sem expurgo, isso cresce sem limite. O prazo de retenção depende de H-12 e **não é definido aqui**.

## Alternativas
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| A. Manter o endpoint protegido (só `admin`) e um cron externo | Explícito | Peça externa (cron) e mais um passo na primeira execução | Baixo |
| **B. `BackgroundService` no backend, `PeriodicTimer` de 5 s, ligado só com `FLEET_DEMO_MODE=true`, e endpoint removido** | Nativo, uma execução por instância e zero superfície HTTP | Com mais de uma instância, os jobs se multiplicariam (resolvido com lock consultivo) | Baixo |
| C. Container `simulator` separado que posta posições pela API de ingestão (H-16) | Exercita o caminho real de integração | Exige chave de API provisionada automaticamente e um serviço a mais. Depende da fase 3 | Médio |

## Decisão
Opção B.
- `POST /api/telemetry/simulate` é **removido**. Ele não é protegido nem mantido: endpoint que não existe não pode ser chamado.
- O job roda só se `FLEET_DEMO_MODE=true`. O padrão do aplicativo é `false`. O `.env.example` traz `true`, com um comentário pedindo para desligar em produção, porque a primeira execução é de avaliação.
- O intervalo de 5 s é constante no código. Não há variável (H-10).
- Cada ciclo tenta `pg_try_advisory_lock(<constante>)`. Se outra instância detém o lock, o ciclo é pulado. Assim só existe um job, mesmo com réplicas.
- O mesmo `FLEET_DEMO_MODE` controla o *seeder* de dados fictícios (H-14, ADR-0002). Fora do modo demo, nada é semeado nem alterado.
- Evolução natural: se a fase 3 validar a ingestão, a opção C pode substituir esta (ADR futuro).

## Consequências
- Positivas: escritas constantes, independentes do número de abas, e superfície de escrita anônima eliminada.
- Negativas: em demo, a telemetria cresce cerca de 100 mil linhas por dia até H-12 definir o expurgo. Isso é aceitável numa avaliação e fica registrado como risco.
- Se o humano decidir outra coisa (por exemplo, manter `Simulation__*` configurável), este ADR é substituído. O custo é baixo, porque o job fica isolado num único serviço.
