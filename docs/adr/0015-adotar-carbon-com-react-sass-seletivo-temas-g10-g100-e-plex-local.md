# ADR-0015: Adotar o Carbon por `@carbon/react` com Sass seletivo, temas g10/g100 por atributo no `<html>`, ícones Carbon, IBM Plex local e Recharts com a paleta do Carbon
Status: aceito (2026-11-01: o humano aprovou o DS 3.x sobre o Carbon, P12 "perfeito, pode implementar"; plano do tech-lead na seção 4.9 do plano de tarefas)
Data: 2026-11-01; revisão em 2026-11-02
Contexto de decisão: o humano decidiu adotar o IBM Carbon Design System. Este ADR decide **como** adotar, não **se** adota.
Altera: ADR-0006 (a fonte local passa a ser a IBM Plex, não a Inter) e a seção 4.9 do plano de tarefas (cai a regra "nenhuma biblioteca de UI nova"; T-30, T-75, T-77, T-79, T-80, T-81 e T-86 mudam).

## Revisões de 2026-11-02
O texto original abaixo fica como registro. Onde houver conflito, valem estas revisões:
1. **O mapa não é mais Leaflet + OSM.** O §4 da decisão foi substituído pelo ADR-0016: MapLibre em chunk, com tiles vetoriais do OpenFreeMap. Saíram `leaflet` e `react-leaflet`, e `--ft-map-tile-filter`.
2. **"Nenhuma dependência nova para gráficos e mapa" vale só para gráficos.** O mapa ganhou `maplibre-gl` 6.16.0, exigido pelo ADR-0016.
3. **Origem externa:** a premissa "zero origens externas além dos tiles do OSM" passa a ser "só as origens de `MAP_CSP_ORIGINS`, em `connect-src`". Veja o ADR-0006 para o estado real da CSP, que ainda não está no ar.
4. **Cor de status: vale o DS (versão atual 3.3.0, §4.1 e §4.2).** O plano cita a 3.2; o arquivo do DS já está na 3.3.0. Substitui os itens 3 e 4 desta decisão onde citam `--cds-support-*`:
   - Cada status tem **uma única cor** em Tag, gráfico e marcador. Em rota e Em trânsito são Cyan; Parado, amarelo; Manutenção e Cancelado, vermelho; Pendente, roxo; Entregue, verde.
   - **Teal é marca e ação, nunca status** (R-COR). Teal e Cyan têm a mesma luminosidade (1,01:1 no g100 e 1,00:1 no g10), então a distinção nunca depende só de cor: sempre forma ou ícone + texto.
   - Os tokens são `--ft-tag-*` e `--ft-map-marker-*`, e não `--cds-support-*`.
   - O `Tag` do Carbon 1.119 não tem tipo `yellow`, embora a tabela do DS o cite. O código usa `type="gray"` + `.ft-tag--parado` (T-79).
5. **`style-src 'unsafe-inline'`:** o motivo "Leaflet" caiu. Ver ADR-0006.
6. **Medição:** o JS inicial está em 224,8 KiB gzip (orçamento de 300 KB) e o CSS inicial, em 11,0 KiB (orçamento de 60 KB). Detalhes no ADR-0016, "Verificado no produto". A troca de tema em < 100 ms foi medida só em bancada.

## Pontos para a ux-ui (leia primeiro)
Concordo com as quatro premissas da ux-ui: `@carbon/react`, temas g10 e g100, IBM Plex e ícones Carbon. Há três pontos de atrito e um ponto em aberto:
1. **Gráficos: Recharts, não `@carbon/charts-react`.** Os gráficos usam a paleta de data-viz do Carbon, mas não a biblioteca. A ux-ui não deve especificar componentes do Carbon Charts.
2. **A IBM Plex Sans não tem peso 800** (a família vai de 100 a 700). O logo do DS v2.0.0 usa Inter 800. Ele precisa ser redesenhado em Plex Sans 600/700 ou ter o texto convertido em contorno (`<path>`). Recomendo o contorno, que não depende de fonte.
3. **Breakpoints e grid passam a ser os do Carbon** (sm 320, md 672, lg 1056, xlg 1312, max 1584 px). A sidebar fixa da T-77 passa de "≥ 1024 px" para "≥ lg (1056 px)". Os alvos de 390 px e 1440 px continuam valendo.
4. **Fechado na aceitação:** o shell usa o *UI Shell* do Carbon (`Header`, `SideNav`, `HeaderGlobalAction`, `SkipToContent`) no lugar da gaveta própria em `<dialog>` da T-77. Os critérios de aceite de teclado da T-77 continuam valendo e são o teste de aceitação do componente do Carbon.

Nota da aceitação: os 10 achados do tech-lead sobre o DS 3.1 (plano, seção 4.9) aplicam este ADR e não mudam nenhuma decisão. O logo com `<text>` em Plex (achado 8) é aceito como SVG inline; o contorno em `<path>` continua recomendado para usos fora da página (favicon, imagem de README), onde a fonte não carrega.

## Contexto
- Frontend em `master` `ab0c67e`: React 19, Vite 6, TS 5.7, Recharts 2.15, Leaflet 1.9 + react-leaflet 5, Lucide 0.468. CSS próprio em `global.css` com cores fixas. Licença do projeto: MIT.
- O ADR-0006 impõe CSP `font-src 'self'` e nenhum CDN em tempo de execução, por privacidade (o IP do usuário não pode ir a terceiros) e porque a instalação é self-hosted. O mapa usa `tile.openstreetmap.org` (commit `11b5704`), única origem externa de imagem.
- O plano (4.9) já prevê tokens por CSS custom properties, o script `theme-init.js` antes da pintura, a chave `ft-theme` e o hook `useThemeTokens()` para Recharts e Leaflet. Este ADR reaproveita essa mecânica e troca a fonte dos tokens.
- Fatos verificados em 2026-11-01 (manifestos no npm):
  - `@carbon/react` 1.119.0, Apache-2.0. Peer `react`/`react-dom` `… || ^19.0.0`. `sass` é peer **opcional**.
  - `@carbon/styles` 1.118.0 publica CSS pré-compilado de **1,19 MB minificado**, além de `scss/`.
  - `@carbon/icons-react` 11.91.0, Apache-2.0, peer `react >=16`.
  - `@carbon/charts-react` 1.27.25, Apache-2.0, React 19 aceito a partir de 1.23. Depende de `@carbon/charts`, que usa D3 (e `d3-cloud` e `d3-sankey`).
  - `@ibm/plex-sans` 1.1.0, OFL-1.1, publica `fonts/complete/woff2` e `fonts/split/woff2`.
  - Vários pacotes `@carbon/*` e `@ibm/plex-*` dependem de `@ibm/telemetry-js`, que coleta métricas de uso **durante o `npm install`/`npm ci`** (sobretudo na CI), salvo com `IBM_TELEMETRY_DISABLED=true`. O usuário final não é afetado, porque não há telemetria em tempo de execução no navegador.
- Atributos de qualidade (premissas*, a medir na primeira tarefa antes de qualquer troca):
  - JS inicial ≤ 300 KB gzip* e CSS total ≤ 60 KB gzip*. Fontes na primeira carga ≤ 150 KB*.
  - Sem flash do tema errado. Troca de tema sem recarregar, recolorindo gráficos e mapa em < 100 ms*.
  - Zero requisições a origens externas além dos tiles do OSM (a CSP do ADR-0006 continua sem mudança, exceto `img-src` dos tiles).
  - WCAG 2.2 AA nos dois temas (contraste conferido na T-55).

## Alternativas

### 1. Como consumir o Carbon
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| A. Só tokens, tipografia e grid do Carbon (`@carbon/themes`, `@carbon/grid`), com componentes próprios | Bundle mínimo. Controle total. Sem Sass se os tokens forem exportados em CSS | Reescreve à mão o que o Carbon já entrega acessível (tabela, modal, select, menu, notificação, tag). Diverge do que a ux-ui está desenhando. O "visual Carbon" vira imitação, que se desatualiza a cada versão | Baixo |
| B. `@carbon/react` + CSS pré-compilado (`@carbon/styles/css/styles.min.css`) | Sem Sass. Instalação trivial | 1,19 MB de CSS minificado, quase todo sem uso, o que estoura o orçamento de 60 KB gzip por larga margem. As `@font-face` do CSS pronto não apontam para os arquivos servidos pelo nosso Nginx, então a CSP do ADR-0006 bloqueia a fonte ou exige configurar o CDN | Médio |
| **C. `@carbon/react` + `@carbon/styles` por Sass, importando só tema, reset, tipografia, grid e os estilos dos componentes usados** | Componentes acessíveis e mantidos pela IBM. CSS proporcional ao uso. Controle das `@font-face` (fonte local). Temas gerados como custom properties `--cds-*` | Nova dependência de build (`sass-embedded`) e avisos de depreciação do Sass a silenciar. Cada componente novo exige um `@use` a mais (esquecer = componente sem estilo, visível no PR) | Alto (componentes espalhados pelas telas) |

### 2. Ícones
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| A. Manter Lucide | Zero trabalho | Traço e grade de 24 px destoam dos ícones de 16/20 px dos componentes Carbon, que já trazem `@carbon/icons-react` como dependência. Ficam duas bibliotecas de ícone no bundle | — |
| **B. `@carbon/icons-react` no lugar do Lucide** | Uma família só, já presente como dependência do `@carbon/react`. Import por ícone (tree-shaking) | Mapear ~15 ícones. Alguns conceitos de frota têm nome diferente (ex.: `DeliveryTruck`, `Van`) | Baixo |

### 3. Gráficos
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| A. `@carbon/charts-react` | Visual 100 % Carbon, opção `theme: 'g10' \| 'g100'`, tabela acessível embutida | Traz D3 + `d3-cloud` + `d3-sankey` + CSS próprio + telemetria, **em paralelo** ao Recharts até a migração terminar. Reescreve os 4 gráficos que funcionam. API configurada por objeto, menos tipada para o nosso uso | Médio |
| **B. Recharts + paleta de data-viz e tokens do Carbon via `useThemeTokens()`** | Nenhuma dependência nova. A T-80 já prevê o hook. Cor, tipografia, grade e tooltip seguem o tema | Fidelidade "Carbon" depende de disciplina (tooltip, eixos e legenda estilizados por nós) | Baixo |

### 4. Temas
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| A. `<GlobalTheme>`/`<Theme>` do `@carbon/react` decidindo em JS | Idiomático no Carbon | O tema só existe depois do React montar, o que causa flash na primeira pintura | Baixo |
| **B. Sass gera as custom properties de g10 sob `[data-theme="light"]` e de g100 sob `[data-theme="dark"]`. O `theme-init.js` (T-75) grava o atributo antes da pintura. O `<Theme>` do Carbon só para zonas** | Sem flash. Mesma regra da T-75 (`ft-theme`, `prefers-color-scheme`, `try/catch`). Recharts e Leaflet leem `--cds-*` calculado | Dois temas no CSS (≈ 2× os tokens, alguns KB) | Baixo |
| C. g90 no lugar de g100 | Escuro mais suave | Menos contraste com os tiles escurecidos do mapa. Não é o que a ux-ui desenhou | Baixo |

## Decisão
1. **Carbon completo por componentes, com Sass seletivo (opção 1C).**
   - Dependências: `@carbon/react` e `@carbon/styles` (versão exata no `package.json`; a 1.119.0 já aceita React 19). Em dev: `sass-embedded`.
   - Um único ponto de entrada `frontend/src/styles/carbon.scss`:
     - `@use '@carbon/styles/scss/config' with (...)` configurado para o Carbon **não** gerar `@font-face` nem usar CDN (sem `$use-akamai-cdn`). O nome exato da variável é conferido em `scss/_config.scss` da versão instalada. Se não houver como desligar, apontar `$font-path` para os nossos arquivos;
     - reset, tipografia, grid e temas;
     - um `@use '@carbon/styles/scss/components/<nome>'` por componente usado.
   - Componentes de domínio (`StatusBadge`, `StatCard`, `FleetMap`, `CursorPaginationBar`) são composições nossas sobre os componentes do Carbon (`Tag`, `Tile`, `Button`, `DataTable`). Não criar camada de *wrapper* genérica sobre o Carbon: as telas usam o Carbon direto.
   - Tokens próprios (prefixo `--ft-`) só para o que o Carbon não tem: mapa, paleta dos gráficos e mapeamento status → cor. Todo o resto usa `--cds-*`. A regra de lint da T-86 (nenhum hex/`rgba(` em `.tsx`) continua.
2. **Ícones: `@carbon/icons-react` substitui o `lucide-react` (opção 2B).** O Lucide sai do `package.json` quando o último uso sumir. A tabela status → ícone da DS §2.2 é refeita com nomes do Carbon.
3. **Gráficos: Recharts com a paleta do Carbon (opção 3B).**
   - Série categórica = paleta categórica de data-viz do Carbon (variante clara no g10 e escura no g100), definida como `--ft-dataviz-1..n` por tema.
   - Gráficos de **status** usam as cores semânticas (`--cds-support-success`, `-warning`, `-error`, `-info`) com rótulo em texto (H-22).
   - Eixos, grade e tooltip usam `--cds-text-secondary`, `--cds-border-subtle`, `--cds-layer` e Plex com números tabulares.
   - Reavaliar `@carbon/charts-react` só se surgir gráfico que o Recharts não faz (sankey, treemap, mapa de calor).
4. **Mapa: Leaflet + OSM sem mudança de provedor.**
   - Painel de tiles com `filter` só no tema escuro (`--ft-map-tile-filter`), **nunca** no container: marcadores, popup e controles ficam fora do filtro.
   - Popup, controles de zoom e atribuição estilizados com `--cds-layer`, `--cds-text-primary`, `--cds-border-subtle` e `--cds-focus`. A atribuição do OSM continua legível nos dois temas.
   - Marcadores em `L.divIcon` com forma por status (T-81) e cores `--cds-support-*`.
5. **Temas (opção 4B).** g10 (claro) e g100 (escuro).
   - Padrão: `prefers-color-scheme`. Escolha persistida em `localStorage['ft-theme']` (`light`/`dark`), com as regras e o script síncrono da T-75.
   - Toggle no `Header` (`HeaderGlobalAction`). `color-scheme` coerente com o tema, para os controles nativos.
6. **IBM Plex local (substitui a Inter da T-30).**
   - `@ibm/plex-sans` e `@ibm/plex-mono` (OFL-1.1). WOFF2 dos subconjuntos `split` Latin/Latin-1, importados pelo Vite (com hash, servidos pelo nosso Nginx: `font-src 'self'` sem mudança).
   - Pesos: Sans 400 e 600 (300 só se a ux-ui usar *display*), Mono 400. `font-display: swap`. `<link rel="preload">` só para Sans 400.
   - `@font-face` escritas por nós em `frontend/src/styles/fonts.scss`. Incluir `OFL.txt`.
7. **Telemetria de instalação desligada:** `IBM_TELEMETRY_DISABLED=true` nos workflows da CI, no estágio de build do `frontend/Dockerfile` e no `CONTRIBUTING.md` (quem quiser pode religar). Não usar `--ignore-scripts`, que quebraria outros pacotes.
8. **Licenças:** Apache-2.0 (Carbon) e OFL-1.1 (Plex) são compatíveis com o MIT do projeto. A Apache-2.0 exige preservar avisos ao redistribuir: o bundle publicado na imagem do GHCR (ADR-0013) leva um arquivo de licenças de terceiros gerado no build (ferramenta a critério do tech-lead).

## Consequências
- **Positivas:**
  - Componentes com teclado, foco e ARIA já resolvidos, o que reduz o trabalho de T-55, T-77 e T-78.
  - Visual coerente nos dois temas a partir de uma fonte de tokens só.
  - Fonte e CSP continuam 100 % locais.
  - Nenhuma dependência nova para gráficos e mapa.
- **Negativas:**
  - Dependência estrutural de um DS de terceiro. Trocar depois custa semanas (todas as telas).
  - Nova ferramenta de build (Sass) e atualizações frequentes do Carbon (minor quase semanal): fixar a versão e atualizar em lote, com revisão visual.
  - O plano 4.9 precisa ser refeito pelo tech-lead:
    - T-30 passa a ser Plex;
    - T-75 gera os temas pelo Sass do Carbon;
    - T-77 usa o UI Shell;
    - T-78 encolhe para as composições de domínio;
    - T-79 usa `Tag` + ícone Carbon;
    - T-80 e T-81 leem `--cds-*`.
  - `style-src 'unsafe-inline'` continua necessário (Leaflet e posicionamento do `@floating-ui` usado pelo Carbon).
- **Monitorar:**
  - Tamanho do bundle a cada PR (JS ≤ 300 KB gzip*, CSS ≤ 60 KB gzip*). Medir a linha de base em `ab0c67e` antes da primeira troca. Estourar = revisar os `@use`.
  - Nenhuma requisição externa além dos tiles (teste de fumaça da CSP do ADR-0006).
  - Contraste AA nos dois temas, inclusive nos gráficos e marcadores.
  - Avisos de depreciação do Sass a cada atualização do Carbon.

## Fontes
- [@carbon/react package.json](https://unpkg.com/@carbon/react/package.json), [@carbon/styles package.json](https://unpkg.com/@carbon/styles/package.json) e [arquivos CSS](https://app.unpkg.com/@carbon/styles@1.118.0/files/css), [@carbon/icons-react](https://unpkg.com/@carbon/icons-react/package.json), [@carbon/charts-react](https://unpkg.com/@carbon/charts-react/package.json) (React 19 desde [1.23.15](https://app.unpkg.com/@carbon/charts-react@1.23.15/files/package.json)).
- [@ibm/plex-sans](https://unpkg.com/@ibm/plex-sans/package.json), [fontes WOFF2](https://app.unpkg.com/@ibm/plex-sans@1.1.0/files/fonts/complete).
- [Configuração de fontes do `@carbon/styles`](https://github.com/carbon-design-system/carbon/blob/5fc4fb6311fe125c1fb92e2b57937ce727967783/packages/styles/scss/fonts/README.md) e [guia de migração v11](https://github.com/carbon-design-system/carbon/blob/5fc4fb6311fe125c1fb92e2b57937ce727967783/docs/migration/v11.md) (`$font-path`, `$use-akamai-cdn`). Conferir os nomes exatos das variáveis em `scss/_config.scss` da versão instalada.
- [@ibm/telemetry-js](https://www.npmjs.com/package/@ibm/telemetry-js) (opt-out `IBM_TELEMETRY_DISABLED`).
