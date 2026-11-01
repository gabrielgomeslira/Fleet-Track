# ADR-0011: Criar o primeiro administrador por wizard protegido por código de uso único exibido no log do backend
Status: proposto
Data: 2026-10-31
Histórias: H-18 (com H-08). UX de referência: documento de UX, §3.3

## Contexto
- Sem senha padrão (H-08), a instalação nasce sem nenhum usuário. É preciso um caminho guiado para criar o primeiro acesso.
- Métrica principal: ≥ 4 de 5 pessoas sem contexto chegam ao dashboard e enviam uma posição em ≤ 15 min.
- A UX já desenhou um wizard `/setup` (criar admin → quickstart). Do jeito que está, **qualquer pessoa que alcance a instância antes do dono vira administrador**. É a corrida clássica de instalador web: uma instância exposta na rede, ou um vizinho na mesma rede, assume o controle.
- O ponto de entrada padrão é o loopback (ADR-0006), o que reduz o risco, mas quem muda o bind para `0.0.0.0` antes de configurar fica exposto.

## Alternativas
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| A. Variáveis `FLEET_ADMIN_USER`/`FLEET_ADMIN_PASSWORD` no `.env` | Sem UI | A senha fica em texto no `.env` e no `docker inspect`. Vira "senha padrão" se alguém copiar exemplo | Baixo |
| B. Comando de terminal (`docker compose exec backend fleet create-admin`) | Zero superfície HTTP | Prompt interativo falha no Git Bash/mintty do Windows sem `winpty`. Ignora o wizard da UX. É mais um comando para decorar | Baixo |
| C. Wizard aberto enquanto não houver usuário (UX como está) | O caminho mais fácil | Corrida de tomada de controle (CWE-1188 / instalador exposto) | Baixo |
| **D. Wizard da UX + código de uso único gerado na subida e impresso no log do backend** | Mantém o wizard e a métrica. Só quem tem acesso ao host (logs) cria o admin. Funciona igual em Linux, macOS e Windows | Um passo a mais: copiar o código do log | Baixo |

## Decisão
Opção D.
- **Código de configuração:** na subida, se não existir nenhum usuário, o backend gera um código aleatório (128 bits, exibido em grupos legíveis, por exemplo `7KQ4-M2XD-…`). Ele guarda **apenas o hash** e imprime um bloco destacado no log: "Configuração inicial pendente. Abra http://localhost:3000/setup e informe o código: …".
  - O código vale até o primeiro admin ser criado ou até o backend reiniciar, quando é gerado outro.
  - Erros de código são limitados (5 por minuto por IP) além do limite do Nginx.
- **Endpoints da fase de setup:**
  - `POST /api/v1/setup`: código + nome, usuário, senha.
    - Cria o admin, inicia a sessão e devolve 201.
    - Depois que existe qualquer usuário, responde **409** para sempre.
  - `GET /api/health` inclui `"setupPending": true|false`, para o front decidir entre `/setup` e `/login`. Não revela dado pessoal.
  - **Exceção explícita à regra de H-05** ("única rota pública é a saúde"): `POST /api/v1/setup` é anônimo, mas protegido pelo código e inerte após o setup. Precisa do ok do PM e do appsec, e o teste de rotas anônimas (ADR-0003) a lista nominalmente.
- **README e UX:** o passo 1 do wizard ganha o campo "Código de configuração", com a dica `docker compose logs backend`. Quem roda `docker compose up` em primeiro plano já vê o código no terminal.
- **Recuperação:** o comando `docker compose exec backend fleet reset-admin <usuario>` gera uma senha temporária de troca obrigatória. Serve para quem perdeu o acesso: é recuperação, não caminho principal.
- **Segredos obrigatórios da instalação:** só `POSTGRES_PASSWORD` (H-08). O backend monta a string de conexão a partir de `POSTGRES_*`, eliminando a duplicação atual em `CONNECTION_STRING`. As chaves de sessão nascem sozinhas (ADR-0004).

## Consequências
- Positivas: nenhuma senha padrão, nenhum segredo em `.env` além do banco e nenhuma janela de tomada de controle. A UX quase não muda (um campo a mais).
- Negativas: um passo de terminal (ler o log), que entra no roteiro dos 5 testes de bancada. Se reprovar na métrica, o fallback é exibir o código também em `docker compose up` com `attach` (já é o padrão).
- Monitorar: tentativas inválidas de código (sinal de instância exposta antes do setup) e tempo até o primeiro login nos testes de bancada.
