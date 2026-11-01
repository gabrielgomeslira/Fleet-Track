# ADR-0001: Migrar o backend para .NET 10 LTS antes do primeiro release
Status: proposto
Data: 2026-10-31
Histórias: base para H-05, H-15, H-20 (pré-requisito, não estava na lista do orquestrador)

## Contexto
- O backend está em `net8.0` (`backend/FleetApi.csproj`), com EF Core 8.0.11 e Npgsql 8.0.11.
- **O .NET 8 sai de suporte em 10/11/2026**, daqui a 10 dias. O .NET 9 também. Depois dessa data, eles não recebem mais correções de segurança. O .NET 10 é LTS e tem suporte até nov/2028 ([Microsoft .NET Blog](https://devblogs.microsoft.com/dotnet/?p=60346), [InfoWorld](https://www.infoworld.com/article/4191704/end-of-support-looms-for-net-8-and-net-9.html)).
- A guarda 1 do PRD é "zero achados críticos ou altos a cada release". Um runtime sem patch gera achado alto em qualquer varredura (SCA ou imagem base), e o primeiro release público sai depois da fase 2.
- As decisões seguintes dependem da versão:
  - O lock de migração do EF Core 9+ (ADR-0002).
  - A geração nativa de OpenAPI 3.1 no build (ADR-0009).
  - `Guid.CreateVersion7()` para ids de telemetria (README §Modelo de dados).

## Alternativas
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| A. Ficar no .NET 8 | Zero esforço agora | Sem patch a partir de 10/11/2026. Imagem base `aspnet:8.0` vira achado de segurança. Bloqueia a guarda 1 | Não se aplica |
| B. Ir para o .NET 9 | Salto menor | Também sai de suporte em 10/11/2026 | Não se aplica |
| **C. Ir para o .NET 10 LTS** | Suporte até 2028. EF Core 10 com lock de migração e OpenAPI nativo | Mudança de TFM, pacotes e imagens base. Há breaking changes de EF 9/10 para revisar | Baixo. A base de código é pequena: 4 controllers, 3 entidades |

## Decisão
Mudar para `net10.0`, EF Core 10 e Npgsql 10, com imagens `mcr.microsoft.com/dotnet/{sdk,aspnet}:10.0` fixadas por digest (H-04). A migração entra na **fase 1**, junto com o projeto de testes. Assim, a CI já valida no runtime final e nenhum código novo de autenticação é escrito sobre uma versão sem suporte.

## Consequências
- Positivas: o primeiro release público sai com runtime suportado e ganha os recursos usados nos ADRs 0002, 0009 e 0010.
- Negativas: cerca de 1 dia de trabalho na fase 1. É preciso revisar as breaking changes do EF Core 9 e 10, por exemplo `Migrate` dentro de transação explícita, que agora lança exceção.
- Monitorar: o fim de suporte do .NET 10 (nov/2028). Planejar o .NET 12 LTS no ciclo de 2027–2028.
