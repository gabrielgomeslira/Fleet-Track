# ADR-0019: Compor a página do veículo com leituras separadas e ler o trajeto por cursor com teto
Status: aceito (2026-11-02: decisão do humano, inclusive o pedido automático ao provedor do mapa; ver "Decisão do humano")
Data: 2026-11-02
Histórias: H-35, H-36, H-37, H-38, H-39, H-40, H-41
Depende de: ADR-0010 (cursor), ADR-0017 (posição nula), ADR-0018 (alertas por veículo).
Responde: A2 (T-110, T-111) e A3 (T-112). Fecha a "lacuna" citada no ADR-0016.

## Contexto
- A H-41 pede identificação, status e posição em até 2 s; os demais blocos podem seguir carregando. A H-40 pede erro **por bloco**, sem derrubar o resto.
- `GET /api/vehicles/{id}` hoje traz as 5 últimas entregas (`VehiclesController.cs:42`). A T-16 ainda não criou o `VeiculoDto`, então a `v1` pode nascer com o formato certo.
- As rotas do front já são em inglês: `/vehicles`, `/deliveries`, `/telemetry` (`App.tsx:70-72`). O Nginx já devolve `index.html` em qualquer rota (`default.conf.template:39-41`).
- `Delivery.VehicleId` é obrigatório (`Delivery.cs:6`). A condição "entrega sem veículo" da H-36 não ocorre hoje; o front a trata mesmo assim, por `vehicleId` nulo no futuro.
- Volume do trajeto (H-38): a 30 s, 240 pontos em 2 h, ou **2 páginas** de 200. Um rastreador a 1 s gera 7.200, ou 36 páginas. A ingestão total é ≤ 50 req/s*: 1 s por veículo não cabe em 500 veículos, mas cabe em poucos.

**Atributos (* = premissa, nada medido):** bloco principal em até 2 s com o volume da demo; `GET /vehicles/{id}` p95 < 200 ms*; trajeto completo na demo < 1 s*.

## Decisão A2: endereço

| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| **A. `/vehicles/:id`, com o GUID à vista** | **Estável: a placa pode mudar por `PUT` sem quebrar link. Nada identifica o veículo em log de acesso nem no histórico** | URL longa, sem significado para quem lê | **Baixo** |
| B. `/vehicles/:placa` | Legível | Link quebra ao corrigir a placa; a placa, que identifica veículo e leva ao motorista, vai para log e histórico; placa não é chave primária | Médio |
| C. Id curto novo | Curto | Coluna e geração novas, sem ganho funcional | Médio |

**Opção A.** O GUID não é segredo nem controle de acesso: toda rota exige sessão, e numa instalação todo usuário vê a frota inteira, então não há risco de acesso por adivinhação de id.
- GUID malformado na URL: mesma tela de "não encontrado", sem chamar a API.
- Depois do login, a volta usa `/login?voltar=` (T-27). **`voltar` só aceita caminho relativo interno**, começando com uma única `/`, para não virar redirecionamento aberto.

## Decisão A2: composição

| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| A. `GET /vehicles/{id}/summary`, com tudo junto | Uma chamada | O bloco lento atrasa o principal, contra a H-41. Erro único, contra a H-40. Endpoint que espelha uma tela | Médio |
| B. Só as rotas atuais; o front acha a entrega em `GET /deliveries?vehicleId=` | Sem campo novo | Filtro novo, regra de ordem da H-39 no front e sem total (ADR-0010) | Baixo |
| **C. Compor leituras; `GET /vehicles/{id}` ganha `currentDelivery` e `activeDeliveryCount`** | **O bloco principal depende de uma leitura só. Erro por bloco. Regra da H-39 num lugar só, no servidor** | Uma consulta a mais no detalhe | **Baixo: aditivo** |

**Opção C.** A página faz três leituras independentes:
| Bloco | Chamada | Falha afeta |
|---|---|---|
| Identificação, estado, posição, entrega atual | `GET /api/v1/vehicles/{id}` | A página: é a única que decide 404 e "sem permissão" |
| Alertas ativos | `GET /api/v1/alerts?vehicleId={id}` (ADR-0018) | Só o bloco |
| Trajeto, evolução e 20 registros recentes | `GET /api/v1/vehicles/{id}/telemetry` | Só esses blocos |

**Contrato do detalhe (`VeiculoDto`, T-16 e T-110):**
```
currentDelivery: { id, origin, destination, status, createdAt } | null
activeDeliveryCount: number
```
- `currentDelivery` é só em `/{id}`, **nunca na lista**, para não criar N+1.
- Entrega atual é a `em_transito`. Ordem da H-39 no servidor: `created_at ASC, id ASC`. Depois da M4: `due_at ASC NULLS LAST, created_at ASC, id ASC`, e o objeto ganha `dueAt` e `situation` (ADR-0020).
- A consulta usa o índice de `vehicle_id` da chave estrangeira.
- **O array `deliveries` atual não passa para a `v1`.** Histórico de entregas por veículo não é pedido por nenhuma história.
- A autorização não muda: é a linha `vehicles/{id}` da matriz. `frota:ler` passa a ver a entrega atual, o que já podia ler em `/deliveries`.
- "Motivo fora da demo" (H-39): `activeDeliveryCount = 0` com `demo: false` no `/api/health` (T-102). O texto vem da T-113.

## Decisão A3: trajeto de 2 h

| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| A. Uma página só, de 200 | Trivial | Na demo, corta 40 de 240 pontos. **Não cumpre a H-38** | Baixo |
| B. Subir o limite para 7.200 nesta rota | Uma chamada | Exceção ao ADR-0010; resposta de ~850 KB* sem gzip; ainda corta acima de 1 s | Alto: contrato |
| **C. Seguir o cursor com teto de 5 páginas (1.000 pontos) e avisar o corte** | **Nada novo no contrato além de `meta`; cumpre a demo com 2 páginas; decisão reversível** | Até 5 chamadas em sequência. Rastreador mais rápido que 1 ponto a cada 7,2 s não mostra as 2 h inteiras | **Baixo** |
| D. Redução de pontos no servidor (`resolution`, por faixa de tempo) | Sempre 2 h, com peso fixo | SQL e parâmetro novos, sem nenhuma instalação real pedindo. A média some com o abastecimento da H-40. Contrato permanente | Médio |

**Opção C, a recomendação do plano, com o teto definido.**
- Chamada: `GET /api/v1/vehicles/{id}/telemetry?from=<agora − 2 h>&limit=200&cursor=`, decrescente, como o ADR-0010 já define.
- `TETO_PAGINAS = 5`*, constante no front. Com 1.000 pontos, as 2 h cabem inteiras até 1 ponto a cada 7,2 s.
- **Ao bater no teto com `nextCursor` preenchido:** mostra o trecho mais recente e avisa "Mostrando só desde HH:MM". Nunca corta em silêncio.
- **Uma busca só para os três blocos:** trajeto, evolução e os 20 recentes usam o mesmo resultado (T-112, T-113). Quem chega primeiro dispara, e os outros reaproveitam.
- O primeiro bloco aparece com a primeira página, sem esperar as demais.
- `from` usa o relógio do navegador. Relógio muito errado causa janela errada. Aceito: a regra de horário do servidor é de M2, não desta página.

**Falta na API, e é preciso para a H-38:** a tela só avisa "retenção abaixo de 2 h" se souber a retenção vigente, e nenhum contrato a expõe. **A resposta da telemetria ganha `meta: { retentionHours: 24 }`** (aditivo, ao lado de `data` e `page`, valor da T-42). Não vai no `/api/health`, que é anônimo.

**Reabrir se:** uma instalação real relatar corte frequente, ou a medição abaixo reprovar. A opção D é aditiva e continua disponível. O ADR-0016 estava certo em chamar isso de lacuna; com 30 s (ADR-0007), o caso da demo deixa de existir.

## Threat model (STRIDE)
| Fronteira | Ameaça | Controle |
|---|---|---|
| Navegador → página do veículo | **I**: reúne motorista e trajeto | Autenticação em todas as leituras; sem exportação (H-41). Registro de acesso fora do MVP: **não vejo obrigação legal que o exija agora**, mas é leitura minha e não aconselhamento jurídico; o appsec confirma |
| **Navegador → provedor do mapa** | **I**: a página enquadra o trajeto sozinha, e a área pedida ao OpenFreeMap passa a seguir **um veículo específico, a cada abertura**. Antes, isso só ocorria se a pessoa ampliasse o mapa | Sem `vehicleId` nem placa na URL do tile. Aviso da T-61 reescrito. Desligamento por variável. **Aceito pelo humano; ver "Decisão do humano"** |
| URL → logs e provedor | **I**: GUID em log de acesso | É opaco. `Referer` só com a origem (padrão do navegador; ADR-0006) |
| `voltar` no login | **S**: redirecionamento aberto | Só caminho interno |
| Cliente → `telemetry` | **D**: laço de páginas | Teto no front; `limit` ≤ 200 no servidor. O teto do front não é controle de segurança |

## Falhas
| Falha | O que a pessoa vê |
|---|---|
| `vehicles/{id}` 404 | Mensagem com saída para o Dashboard (H-36) |
| `vehicles/{id}` 401 ou 403 | Login e volta, ou "sem permissão" (H-36) |
| Telemetria falha na 1ª página | Erro com nova tentativa nos 3 blocos; o resto segue (H-40) |
| Telemetria falha depois da 1ª página | Mostra o que veio, com aviso e nova tentativa |
| Alertas falham | Erro só no bloco, **nunca** "sem alertas" |
| Provedor do mapa fora | Trajeto sobre fundo liso (ADR-0016) |

## Consequências
- **Positivas:** H-41 depende de uma leitura indexada; erros isolados por bloco; contrato quase sem novidade; a redução no servidor continua possível.
- **Negativas:** até 5 chamadas fora da demo; rastreador rápido não vê 2 h inteiras; Recharts com 1.000 pontos não foi testado.
- **Monitorar e medir (o que os testes de hoje não cobrem):**
  - **A T-111 mede os 2 s no navegador real, com a pilha em Docker,** como a T-87 fez. Vitest em jsdom não prova isso: dois defeitos do mapa passaram por ele.
  - A página nova entra no `test:layout` ou equivalente: o mapa do trajeto tem altura, e o desenho coincide com a projeção.
  - A T-112 testa o caso de corte com 1.000 pontos, e a T-113 mede o Recharts com 1.000 pontos. Se travar, reduz os pontos **só no gráfico**, preservando os abastecimentos.

## Decisão do humano
**Aceito em 2026-11-02:** a página do veículo faz o mapa pedir ao provedor a região do trajeto automaticamente, e o aviso da T-61 será reescrito. Isso amplia o que foi aceito em 2026-11-01. Motivo da recomendação aceita: sem o fundo, o trajeto fica sem referência geográfica, e quem precisa de sigilo já pode desligar o fundo.

Próximo: tech-lead | entradas: este ADR, T-110, T-111, T-112, T-113.
