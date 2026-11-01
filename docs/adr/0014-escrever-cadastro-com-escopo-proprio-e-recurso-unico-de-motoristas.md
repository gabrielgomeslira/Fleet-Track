# ADR-0014: Escrever cadastro de veículos e motoristas com o escopo próprio `cadastro:escrever` e um recurso único `/api/v1/drivers`
Status: proposto
Data: 2026-10-31
Histórias: H-23 (destrava H-16 fora do modo demo). Altera ADR-0003 e ADR-0005 (lista de escopos) e ADR-0008 (rota de remoção).

## Contexto
- O PM decidiu (2026-10-31) que veículos e motoristas são criados e editados **só por API**, sem UI e sem exclusão. A remoção de motorista continua em H-13 / ADR-0008.
- Quem escreve: "integrador ou administrador", ou seja, uma pessoa `admin` (cookie) **e** um sistema (chave `ftk_`).
- Hoje a matriz tem só os escopos `frota:ler` e `telemetria:escrever`, e os motoristas ficam em `/admin/drivers`, rota exclusiva de pessoa `admin`. A H-23 pede `/api/v1/drivers`.
- O motorista tem dado pessoal (nome). Uma chave de ingestão vazada é o cenário mais provável de comprometimento (ela fica em rastreadores e scripts).
- Escala (premissa do README): ≤ 10 chaves e ≤ 500 veículos. O cadastro tem baixo volume (dezenas de escritas por dia). Nenhum requisito de desempenho além do p95 < 200 ms* das listagens.

## Decisão 1: qual credencial de sistema escreve cadastro
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| A. Reaproveitar `telemetria:escrever` | Nenhuma mudança na tela de chaves | Uma chave de rastreador vazada passa a criar veículos e **motoristas (dado pessoal)**. Fere o menor privilégio | Médio: depois seria preciso retirar o poder de chaves já emitidas |
| B. Só pessoa `admin` escreve | Nenhum escopo novo | Não atende "integrador" da H-23. O ERP precisaria de usuário humano (proibido por ADR-0003/0005) | Baixo |
| **C. Um escopo novo, `cadastro:escrever`, para veículos e motoristas** | Menor privilégio e um conceito só ("escrever cadastro", como na H-23). Combinável com os outros dois | Mais um item na tela de criação de chave | Baixo: dividir depois em dois escopos é aditivo (migração mapeia o antigo nos dois) |
| D. Dois escopos, `veiculos:escrever` e `motoristas:escrever` | Granularidade máxima: um ERP de frota sem motoristas não toca dado pessoal | Duas caixas a mais na UX para um ganho que nenhuma história pede hoje | Baixo |

**Escolha: C.** Um escopo único cobre a história com o menor custo de UX, e a divisão (D) continua barata se aparecer demanda. A pessoa `admin` também escreve pelas mesmas rotas. `operador` recebe 403.

## Decisão 2: onde fica o recurso motorista
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| A. Tudo em `/api/v1/admin/drivers` | Já está no README | Um sistema escrevendo em `/admin/*` quebra a regra "chave nunca acessa rota de admin" (ADR-0003), que fica mais fácil de testar se valer por prefixo | Baixo |
| B. Escrita em `/api/v1/drivers` e leitura/remoção em `/api/v1/admin/drivers` | Segue a H-23 sem mexer no ADR-0008 | O mesmo recurso fica com duas URLs, e o `id` criado num lugar é removido em outro. Contrato confuso | Médio |
| **C. Um recurso só, `/api/v1/drivers`, com política por operação** | Uma URL por recurso, igual a `vehicles`. `/admin/*` fica reservado à gestão da instalação (usuários, chaves, auditoria), e a regra por prefixo continua valendo | A política é por método, não por prefixo (o teste de matriz precisa cobrir cada método) | Baixo: nada está implementado (ADRs em "proposto") |

**Escolha: C.** `DELETE /api/v1/admin/drivers/{id}` (ADR-0008) passa a ser `DELETE /api/v1/drivers/{id}`, com a mesma semântica e ainda só para `admin`.

## Regras do contrato
**Rotas**
- `POST /api/v1/vehicles` e `PUT /api/v1/vehicles/{id}`
- `POST /api/v1/drivers` e `PUT /api/v1/drivers/{id}`
- `GET /api/v1/drivers` (lista por cursor, ADR-0010) e `GET /api/v1/drivers/{id}`: **só `admin`**. São a fonte da tela de lista de motoristas (UX, ADR-0008). Um sistema com `cadastro:escrever` não lista motoristas: ele guarda o `id` que recebeu no 201.

**Veículo**
- `POST` com `{ plate, model, status?, driverId? }`. `status` tem padrão `parado`.
- `PUT` com corpo completo `{ plate, model, status, driverId }`, em que `driverId: null` desvincula o motorista. Campo ausente → 400. O `PUT` nunca cria recurso: id inexistente → 404.
- Resposta: o mesmo formato do `GET /vehicles/{id}`.
- Posição, velocidade e combustível **não** são graváveis aqui. Só a ingestão (`telemetria:escrever`) os altera, o que mantém a separação entre os escopos.

**Placa**
- Normalização antes de validar e comparar: `trim`, maiúsculas, remover espaços e hífens.
- Formato aceito*: `^[A-Z0-9]{5,10}$` depois de normalizar. É genérico de propósito, porque o projeto é open source e não impõe o padrão Mercosul. O `FT-001` do seed passa.
- Colunas: `plate` guarda o valor exibido (com `trim` e em maiúsculas) e `plate_normalizada` recebe `UNIQUE`. `POST /positions` com `plate` também busca pela forma normalizada.
- Placa já existente (no `POST` ou no `PUT` para outro id) → **409** `…/errors/conflict` com `"A placa já está cadastrada."`. A corrida entre dois `POST` simultâneos é resolvida pelo índice único (violação → 409).

**Motorista**
- `{ name }`, com 1 a 150 caracteres depois do `trim` (coluna `nome varchar(150)`).
- Resposta `{ id, name, createdAt }`.

**Referência inexistente no corpo** (`driverId` de motorista que não existe) → **400** com `errors.driverId: ["Motorista não encontrado."]`. O 404 fica reservado ao recurso da URL, para o integrador distinguir "o veículo do PUT não existe" de "o campo está errado".

**Dado pessoal fora de erros e logs**
- Mensagens de validação descrevem a regra e nunca ecoam o valor recebido.
- O *logging* de requisição não grava corpo nessas rotas.

**Auditoria** (`audit_events`)
- Ações: `veiculo.criado`, `veiculo.atualizado`, `motorista.criado`, `motorista.atualizado`.
- Registra `ator_tipo` (`pessoa`/`sistema`), `ator_id` (id do usuário ou da chave) e o id do alvo.
- `detalhes` traz só os **nomes** dos campos alterados, nunca os valores.

**Idempotência**
- Veículo: o reenvio de um `POST` cai no 409 pela placa, o que é seguro.
- Motorista: não tem chave natural, então um `POST` repetido cria duplicata. A v1 documenta que o integrador não deve reenviar `POST /drivers` às cegas depois de um timeout. Suporte opcional a `Idempotency-Key` é evolução aditiva.

**Limite de taxa:** o mesmo por chave do ADR-0005.

## Impacto na UX (tela de criação de credencial)
- A escolha de escopos passa de 2 para **3 opções combináveis**, com pelo menos uma obrigatória:
  - `frota:ler`: ler veículos, entregas e telemetria.
  - `telemetria:escrever`: enviar posições.
  - `cadastro:escrever`: criar e editar veículos e motoristas. Mostrar o aviso "inclui dado pessoal (nome do motorista)".
- A lista de chaves exibe os escopos de cada uma.
- A tela de lista de motoristas (admin) consome `GET /api/v1/drivers`.

## Consequências
- Positivas: H-16 passa a funcionar fora do modo demo. Uma chave de ingestão vazada não cria nem edita cadastro. Um recurso tem uma URL só.
- Negativas:
  - O teste de matriz deixa de ser só por prefixo para `/drivers` e precisa cobrir método × principal.
  - `POST /drivers` repetido duplica motorista e espalha dado pessoal, o que dificulta a eliminação (H-13).
  - A resposta de veículo mostra `driverName` a quem só tem `cadastro:escrever`. É aceitável, porque quem vinculou o motorista já conhece o `id` dele.
- Monitorar:
  - 409 de placa por chave (integração mal sincronizada).
  - Motoristas com o mesmo nome criados pela mesma chave em menos de 1 min (indício de retry).
  - Uso de `cadastro:escrever` por chaves que também têm `telemetria:escrever` (sugerir separar).
