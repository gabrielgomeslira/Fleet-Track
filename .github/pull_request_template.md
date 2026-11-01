## O quê e por quê

<!-- O que muda e qual problema resolve. O título do PR segue Conventional Commits (tipo(escopo): descrição em pt-BR). -->

Refs: T-NN

## Como testar

<!-- Comandos e passos para conferir. -->

## Breaking change?

- [ ] Não
- [ ] Sim. Descreva o que quebra e como migrar:

## SQL da migração

<!-- Se houver migração, cole aqui a saída de `dotnet ef migrations script`. Senão, escreva "não se aplica". -->

## Checklist

- [ ] Testes do caminho feliz e dos erros citados nos critérios
- [ ] CI verde (build, testes e typecheck)
- [ ] Nenhum segredo, senha, chave `ftk_` real ou `.env` no PR; nenhum dado pessoal em log, exemplo ou teste
- [ ] Nenhum TODO novo
- [ ] Migração reversível (`Down` implementado), se houver
- [ ] Erros da API em Problem Details, se mexeu na API
- [ ] Menos de 400 linhas alteradas (sem lockfile, migração gerada e snapshot OpenAPI)
- [ ] README, `CHANGELOG.md` (`Unreleased`) e ADR atualizados, se o comportamento visível ou a arquitetura mudou
- [ ] Variável de ambiente nova está no `.env.example` e no README
- [ ] `dotnet format --verify-no-changes`, `npm run lint` e `npm run format:check` passam (quando existirem)
