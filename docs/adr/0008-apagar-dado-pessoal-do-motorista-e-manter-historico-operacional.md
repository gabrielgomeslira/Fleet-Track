# ADR-0008: Extrair o motorista para uma entidade própria e atender à remoção apagando o dado pessoal, sem apagar entregas
Status: proposto
Data: 2026-10-31
Histórias: H-13 (influencia H-19)

## Contexto
- Hoje o motorista não é uma entidade. É a coluna `vehicles.driver_name`, exposta em `GET /api/vehicles`.
- `deliveries` e `telemetry_records` referenciam o **veículo**, não a pessoa.
- Pela LGPD, o titular pode pedir eliminação (art. 18, VI). Dado anonimizado é aquele que não permite reidentificação por meios razoáveis (art. 12).
- O nome é dado pessoal direto. A trilha de posições de um veículo é quase-identificadora: quem sabe quem dirigiu a placa X no dia Y reidentifica a pessoa.
- Sem entidade, não há como achar "todas as ocorrências desta pessoa". Seria preciso comparar texto de nome entre veículos, o que falha com homônimos e grafias diferentes.
- Integridade: entregas são registro operacional da transportadora e não contêm dado pessoal (origem e destino são cidades).

## Alternativas
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| A. Sobrescrever `vehicles.driver_name` com marcador, por veículo | Sem mudança de modelo | Operação por veículo, não por pessoa. Homônimos. Não há sujeito estável para auditoria | Baixo |
| B. Pseudonimizar (trocar o nome por um hash ou código) | Mantém a contagem por motorista | Pseudônimo continua sendo dado pessoal (art. 13 §4) e não atende eliminação | Médio |
| C. Apagar o motorista em cascata: entregas e telemetria dos veículos dele | Elimina tudo | Destrói registro operacional de terceiros (o veículo teve outros motoristas). Quebra relatórios de entregas | Irreversível |
| **D. Tabela `drivers` com `vehicles.driver_id` (FK `ON DELETE SET NULL`). A remoção faz `DELETE` físico do motorista. Entregas são mantidas. A telemetria dos veículos vinculados pode ser expurgada como opção explícita** | Operação por pessoa e eliminação real do dado direto. Entregas intactas. Telemetria sem vínculo com pessoa por desenho | Uma tabela e uma migração a mais | Médio |

## Decisão
Opção D.
- **Modelo:**
  - `drivers(id uuid, nome varchar(150) not null, criado_em timestamptz)`.
  - `vehicles.driver_id uuid null references drivers on delete set null`.
  - A migração (ADR-0002) copia os nomes distintos de `driver_name` e depois remove a coluna.
  - O contrato continua expondo `driverName` no veículo (via join) e `null` quando não há motorista.
- **Minimização deliberada:** telemetria e entregas **não** ganham `driver_id`. O histórico de posições nunca fica ligado diretamente a uma pessoa.
- **Remoção:** `DELETE /api/v1/drivers/{id}`, só para `admin`. A rota foi movida de `/admin/drivers` pelo ADR-0014, que unifica o recurso. O corpo traz a confirmação `{"confirmar": true}` e `expurgarTelemetria: bool` (padrão `false`).
  - Numa transação: `DELETE` do motorista (`SET NULL` nos veículos).
  - Com `expurgarTelemetria=true`, apaga também a telemetria dos veículos vinculados no momento da operação. A semântica fica documentada, porque pode remover pontos de outros motoristas desses veículos.
- **Auditoria:** registro em `audit_events` com quem (id do admin), quando, ação, `driver_id` e quantidade de linhas de telemetria removidas. **Nada de nome.** O `driver_id` órfão não identifica ninguém após a remoção.
- **Não há "anonimizar" separado de "remover":** para o titular, o efeito é o mesmo (o nome some de todo endpoint). Ter uma operação só simplifica a UI e a doc.
- **Limite documentado em H-19:** cópias de backup de quem instala mantêm o dado até a rotação delas. Quem instala é o controlador.

## Consequências
- Positivas: atende H-13 com operação por pessoa, sem quebrar entregas, e com auditoria sem dado pessoal.
- Negativas:
  - Não há cadastro de motorista pela UI (fora de escopo). A lacuna de cadastro fora do modo demo foi resolvida por API em H-23 / ADR-0014.
  - A opção `expurgarTelemetria` é grosseira por não haver período de vínculo motorista↔veículo. Um histórico de atribuições fica para quando houver cadastro.
- Monitorar: quantidade de remoções e linhas expurgadas (pela auditoria).
