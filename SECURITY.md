# Política de segurança

## Versões com suporte

O projeto ainda não tem versão estável. Correções de segurança são aplicadas na `master` e, depois do lançamento da v1.0, na versão estável mais recente.

## Como reportar uma vulnerabilidade

**Não abra issue pública** nem comente em PR sobre vulnerabilidades.

Use o *private vulnerability reporting* do GitHub: na aba **Security** do repositório, escolha **Report a vulnerability**. O relato fica visível só para o mantenedor.

Inclua, se possível:

- a versão, tag ou commit afetado;
- os passos para reproduzir e o impacto esperado;
- logs ou provas de conceito **sem dados pessoais e sem segredos reais**.

## O que você pode esperar

- Confirmação de recebimento em até `<PRAZO A DEFINIR PELO MANTENEDOR>`.
- Avaliação e plano de correção em até `<PRAZO A DEFINIR PELO MANTENEDOR>`.
- Aviso quando a correção for publicada, com crédito no CHANGELOG se você quiser.

Pedimos divulgação coordenada: aguarde a correção antes de publicar detalhes.

## Escopo

Este repositório contém a aplicação. A segurança da instalação (rede, backups, segredos, atualização de imagens) é responsabilidade de quem a opera.

Até a v1.0 o projeto **não tem autenticação**. Não o use com dados reais.
