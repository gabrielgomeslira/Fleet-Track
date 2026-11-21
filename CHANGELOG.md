# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Adicionado

- Licença MIT.
- Documentação de comunidade: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` e `SECURITY.md`.
- Trajeto do dia na tela de Telemetria: o caminho percorrido no mapa, com distância, duração e velocidades.
- `GET /api/telemetry/{vehicleId}/route?from=&to=`: trajeto de um veículo num período de até 7 dias.

### Alterado

- Retenção padrão da telemetria passa de 24 h para 90 dias, para o gestor poder rever trajetos antigos.
