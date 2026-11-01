# ADR-0002: Versionar o esquema do banco com migrações do EF Core aplicadas na subida do backend
Status: proposto
Data: 2026-10-31
Histórias: pré-requisito de H-05, H-07, H-13, H-14, H-17 (não estava na lista do orquestrador)

## Contexto
- Hoje o esquema e o seed vivem em `db/init.sql`, montado em `/docker-entrypoint-initdb.d`. O Postgres só executa esse arquivo quando o volume está **vazio**, então uma instalação existente nunca recebe mudança de esquema.
- A fase 2 cria tabelas (usuários, chaves, auditoria, chaves do Data Protection, motoristas) e índices. A fase 3 altera tipos (`timestamp` → `timestamptz`).
- Se cada release depender de "apague o volume", a pessoa que adotou perde dados. Isso inviabiliza o produto.
- O seed está no mesmo arquivo do esquema e roda sempre. Pela H-14, ele só pode rodar no modo demo.
- Escala real: uma instalação por organização e uma instância de backend (premissa). Um release por mês, no máximo.

## Alternativas
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| A. Manter `init.sql` e publicar scripts manuais de upgrade | Nada novo | Upgrade manual e propenso a erro. Não há registro de quais scripts já rodaram | Não se aplica |
| B. Ferramenta de SQL versionado (Flyway, DbUp) | SQL explícito e revisável | Dependência nova (Flyway exige outro container ou JVM). Modelo do EF e SQL podem divergir | Médio |
| **C. EF Core Migrations, aplicadas pelo backend na subida** | O time já usa EF Core. O modelo e o esquema ficam no mesmo lugar. O EF 9+ usa lock no banco, o que torna seguro subir duas instâncias | O SQL gerado precisa de revisão no PR. Erro de migração impede o backend de subir | Médio. Dá para exportar o SQL (`migrations script`) e trocar de ferramenta |
| D. EF Core Migrations em container avulso (`migrate`) antes do backend | É a recomendação da doc para deploy em escala | Um serviço a mais no compose e mais atrito na primeira execução | Baixo |

## Decisão
Opção C. O backend executa `Database.MigrateAsync()` na subida e **não** a envolve em transação externa, o que desligaria o lock do EF 9+. O mesmo binário aceita `migrate` como comando para quem preferir migrar no deploy (opção D sem custo extra). O `init.sql` deixa de criar o esquema. O seed de demonstração passa a ser um *seeder* idempotente no código, executado só quando `FLEET_DEMO_MODE=true` e o banco está vazio (H-14, ADR-0007).

Baseline: a primeira migração reproduz o esquema atual, já com as correções do README §Modelo de dados. Instalações anteriores à v1.0 contêm só dados de demonstração e são recriadas (`docker compose down -v`). Essa premissa precisa de confirmação do humano.

## Consequências
- Positivas: upgrade sem perda de dados a partir da v1.0, índices versionados e seed separado do esquema.
- Negativas: todo PR que muda o modelo traz uma migração, e o revisor lê o SQL (`dotnet ef migrations script`). Uma migração quebrada derruba o backend. Ela precisa de teste na CI contra o `services: postgres` da H-01.
- Regra: migração destrutiva (DROP, mudança de tipo com perda) só depois de um release em que o código já não usa a coluna (expand → migrate → contract). Antes da v1.0, essa regra é recomendada, mas não obrigatória.
- Monitorar: o tempo de migração na subida. Migrações de dados grandes, como reescrever toda a telemetria, vão em lote e fora do caminho de subida.
