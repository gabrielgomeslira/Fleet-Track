# ADR-0016: Desenhar o mapa com OpenFreeMap e MapLibre em chunk, e ler as rotas de um campo novo da entrega
Status: aceito
Data: 2026-11-01. Decisões do humano na mesma data: base B2, rotas C3.
Histórias: pedido do humano sobre o mapa, H-22, H-24 (fecha a "decisão estrutural" dela), H-38
Altera: ADR-0015 §4 e a premissa "zero origens externas além dos tiles"; ADR-0006 (CSP); tarefas T-81, T-33 e T-61; DoD-4.9.
Revisão: 2026-11-02, com o que foi verificado no produto (próxima seção). A decisão não muda.

## Verificado no produto (2026-11-02, `master` em `fa67a8f`)
**Como ler este ADR:** quase todos os "testado" e "medido" do texto abaixo vêm de uma **bancada descartável, fora do repositório**, escrita para esta decisão, e não do produto. Ela não previu os dois defeitos que apareceram na T-81, ambos do CSS e da integração no app. Vale o quadro abaixo.

### Defeito aberto: `MAP_STYLE_URL` não funciona
Este ADR, o README do projeto e o plano de saída ("Estilo próprio de quem instala") prometem que a variável substitui TileJSON e glifos. **Ela é aceita e ignorada.**
- `estiloMapa.ts:159-173` devolve um estilo só com fundo liso, e o `FleetMap.tsx:94-101` passa esse objeto ao MapLibre. Nenhum código busca a URL. O comentário em `estiloMapa.ts:158` diz o contrário.
- **O que quem instala vê:** mapa liso, sem aviso, com o estado `pronto` e o crédito do provedor.
- **Prova:** sonda sobre a build atual, numa cópia do `test:layout` fora do repositório: `estado: pronto`, 1 camada, 0 fontes.
- Enquanto não for corrigido, essa saída do plano não existe. As outras (desligar, outro serviço no esquema OpenMapTiles, B4) não dependem disso.
- A correção é do tech-lead. Ao corrigir, `setStyle` e nova tentativa precisam usar a URL, e o aviso da T-94 precisa cobrir falha ao buscar o estilo.

### O que cada verificação cobre
| Item | Situação | Evidência |
|---|---|---|
| Altura do mapa e marcadores na posição certa | **Corrigido e coberto.** Dois defeitos que o Vitest não pegou: altura colapsada a 2 px por conflito de CSS (`1033d26`) e marcadores sem posição absoluta (`cd6ceb0`). O `FleetMap` é simulado no `App.test.tsx`, e o jsdom não faz layout | `npm run test:layout` rodado hoje: sucesso em 8 cenários (2 viewports × 2 temas × 2 modos) |
| Mapa real, com provedor real, na pilha em Docker | **Verificado à mão** na T-87: fundo pronto, crédito visível, 16 pedidos no desktop e 4 no celular. Testes negativos reprovaram com provedor bloqueado | `T-87.resultado.md`, Edge + Playwright |
| Template do Nginx e `/config/mapa.json` | **Verificado em Docker** na T-92, incluindo o desligamento com valor vazio. **Sem `read_only` e sem `tmpfs`:** isso fica para a T-32. A T-92 achou 2 defeitos que este ADR não previu | `T-92.resultado.md` |
| gzip | **Verificado em imagem** na T-91, antes do mapa novo. MIME do `.mjs` corrigido em `ad63730`. O tamanho do bundle atual em Nginx não foi medido | `T-91.resultado.md` |
| Falha do provedor | **Parcial.** A máquina de estados tem testes com eventos simulados (T-94), e a T-87 viu o estado `falha` com o provedor bloqueado. A tabela de falhas (503, 429, CORS, travado) foi medida **só na bancada** | `estadoFundo.test.ts` |
| Teclado no popup | **Parcial.** O teste usa `.click()` e `KeyboardEvent` sintéticos, não teclas reais. Leitor de tela continua sem teste | `test-map-layout.mjs:605-628` |
| Troca de tema < 100 ms | **Só bancada.** Sem medição no produto | Item 4 da decisão |
| **CSP** | **Não está no ar.** O `default.conf.template` não emite nenhum cabeçalho, e `MAP_CSP_ORIGINS` não é usada. Os controles do threat model que dependem de CSP **ainda não existem**: "a CSP limita a saída" e "a CSP barra host fora da lista". O desligamento **não depende dela**: com a URL vazia, o front não faz o pedido | ADR-0006, T-33 |

### Limites do `test:layout`
Ele serve para o que foi feito: layout e projeção. **Não prova:**
- **Fundo desenhado.** O modo "com fundo" usa `MAP_STYLE_URL`, que é o defeito acima: nos 4 cenários desse modo, o mapa tem 0 fontes. Hoje os dois modos testam o mesmo fundo liso.
- API, Nginx, CSP e provedor: tudo é simulado por um servidor Node próprio, com 10 veículos fixos.
- Renderização com GPU.

**Ele não roda na CI:** `ci.yml:89` só chama `npm test`. Um defeito de layout passa no PR se ninguém rodar o script. Roda com a `dist` que existir, então é preciso `npm run build` antes.

### Peso real
Medido hoje em `frontend/dist`, build de `be31c78` (depois dele, só `package.json` mudou em `frontend/`), com gzip no nível ótimo do .NET. KiB = 1.024 bytes.

| Parte | Bancada (ADR) | Produto | Orçamento |
|---|---|---|---|
| JS inicial | 202,8 | **224,8 KiB** (230,2 kB) | ≤ 300 KB: ok |
| Chunk do mapa | 294,0 | **304,7 KiB** (312,0 kB) | |
| Worker | 146,9 | **144,2 KiB** (147,7 kB) | |
| Chunk + worker | 440,9 | **448,9 KiB** (459,7 kB) | ≤ 460 KB*: **no limite** |
| JS com o mapa aberto | ≈ 644 | **673,7 KiB** (689,9 kB) | sem orçamento |
| CSS inicial + mapa | 10,1 (só mapa) | 11,0 + 11,0 KiB | ≤ 60 KB*: ok |

- O humano decidiu ciente de ≈ 641 KB; o real é cerca de 5% maior. O inicial está 22 KiB acima da bancada; não investiguei a causa.
- O orçamento não define se KB é 1.000 ou 1.024, e a margem do chunk + worker depende disso: 0,3 kB ou 11 KiB. O Nginx comprime no nível 5, menos que esta medição. **Definir a unidade e medir pelo Nginx.**
- Bytes de tiles por vista não foram medidos no produto.

### Outros itens do texto abaixo
- "Lacuna fora deste ADR" (H-38): fechada no ADR-0019. Com a demo a 30 s (ADR-0007), são 240 pontos em 2 h, não 1.440.
- "Rotas": `route_path` está na `master` (T-95), mas ainda não vai ao contrato (T-104) nem ao mapa (T-105). **O mapa ainda não desenha rota.**
- "Documentos a atualizar": feito nesta rodada, exceto o README do projeto, que é da T-106.
- `window.__fleetMap` fica exposto em produção (`FleetMap.tsx:197-198`), para o `test:layout`. Não há segredo nele, mas é gancho de teste na build publicada. O relatório da T-87 diz que o mapa não é exposto; o código diz que é.

## Resumo
- **Base do mapa:** MapLibre em chunk separado, lendo os tiles vetoriais do OpenFreeMap. Sem chave, sem cadastro e sem nada guardado em disco.
- **Visual:** só terra, água, limites, vias e nomes de lugares, com um estilo escrito por nós. Vegetação, usos do solo, relevo, prédios e pontos de interesse não têm camada. Ver [tema claro](assets/0016-b2-claro.png), [tema escuro](assets/0016-b2-escuro.png) e [zoom de rua](assets/0016-b2-rua.png). A linha tracejada é uma rota de teste.
- **Privacidade:** IP, endereço da instalação e área vista vão ao provedor, passando pela Cloudflare. Quem instala é avisado e pode desligar o fundo sem mudar código.
- **Se o provedor cair ou bloquear:** marcadores, popups, tabela, rotas e troca de tema continuam funcionando, sobre [fundo liso](assets/0016-b2-falha.png), com um aviso e "Tentar de novo".
- **Peso:** o JS inicial cai de 248,2 para 202,8 KB gzip. Com o mapa aberto, somam-se 440,9 KB de JS e, no primeiro acesso, de 0,7 a 2 MB de tiles por vista.
- **Saída:** URL configurável para qualquer provedor no mesmo esquema; se o serviço acabar, o arquivo próprio (B4), já medido.
- **Rotas:** seguem como aceitas. O campo `route` da entrega é preenchido pela demo, com trajeto escrito à mão, e chega depois do mapa novo. Dependências reais da T-13: T-12 e T-09.

## Contexto

### Fatos verificados em 2026-11-01
- `FleetMap.tsx` usa `tile.openstreetmap.org` com `CircleMarker`. A vegetação faz parte do desenho desses tiles: um filtro CSS muda a cor, mas não tira o detalhe.
- **Hoje o marcador não é acessível por teclado.** `CircleMarker` é um `Path` do Leaflet, sem `tabindex`. A T-81 ainda não foi feita, então replanejá-la agora é barato.
- O JS inicial está em **248,2 KB gzip**, e o orçamento é de 300 KB. Sem Leaflet e react-leaflet, ele fica em 202,1 KB.
- **`frontend/nginx.conf` não liga gzip.** O orçamento é medido em gzip, mas o usuário pode estar recebendo 3,5× isso, e o plano não tem tarefa para esse ajuste. Com esta decisão, o ajuste fica obrigatório: sem gzip, o JS com o mapa aberto passa de 2,3 MB.
- `Delivery` tem `Origin` e `Destination` só em texto. Não existe `POST` de entregas, e a H-23 deixa esse cadastro fora do escopo. **Fora da demo, portanto, não há entregas hoje.**
- A telemetria devolve no máximo 50 registros por veículo (`TelemetryController.cs:21`). A simulação atual é um passeio aleatório (`:46-47`).
- O PRD deixa fora do escopo a roteirização, o traçado exato pelas ruas e o serviço externo de rotas. A H-24 exige uma "sequência predefinida de pontos, coerente com a entrega".

### O provedor, medido
- Os estilos prontos, o TileJSON (`/planet`), os tiles, os glifos e os sprites saem todos de `tiles.openfreemap.org`. O TileJSON aponta para uma versão datada (`/planet/20261025_080012_pt/{z}/{x}/{y}.pbf`), e os tiles vão até o z14.
- As respostas vêm da **Cloudflare** (`Server: cloudflare`; daqui, `CF-RAY …-GRU`). Os termos dizem "may use"; na prática, ela está no caminho hoje.
- Os tiles vêm com `Cache-Control: max-age=315360000`. Quem já viu uma área não a pede de novo enquanto o cache do navegador durar.
- Os estilos prontos trazem uma fonte raster de relevo sombreado (`ne2_shaded`), além de `landcover`, `landuse` e `park`. O nosso estilo não usa nenhuma delas.

### O que cabe na tela
Em zoom 4 do Leaflet e latitude −15°, 1 px equivale a cerca de 9,5 km. O mesmo enquadramento é o zoom 3 no MapLibre, que usa uma grade de 512 px. Os zooms da decisão são os do MapLibre.

| O que se quer ver | Distância | Tamanho nessa escala |
|---|---|---|
| Rastro de 50 registros a cada 5 s, a 90 km/h | 6 km | **menos de 1 px** |
| Rastro de 2 h a 90 km/h | 180 km | 19 px |
| Rota São Paulo → Rio de Janeiro, em linha reta | 361 km | 38 px |
| Veículo a 90 km/h | 1 px a cada 6 min | praticamente parado |

Conclusão: **no mapa nacional, "rota" só pode ser o trajeto da entrega.** O rastro da telemetria só faz sentido com zoom, na página do veículo.

### Atributos de qualidade (* = premissa)
- Subir sem chave nem cadastro, e sem dado de mapa em disco.
- JS inicial ≤ 300 KB gzip.
- Troca de tema nos dois temas, em < 100 ms (ADR-0015).
- Capturas do README no tema claro.
- Marcadores acessíveis (H-22).
- Queda do provedor não tira marcadores nem tabela. Aviso em até 15 s* mesmo se a conexão travar sem resposta.
- Quem instala consegue trocar ou desligar o provedor sem recompilar a imagem (ADR-0013).
- Até 500 veículos* (README).

## Alternativas

### A. Base do mapa
Medido com `maplibre-gl` 6.16.0 em Chrome headless sem GPU (SwiftShader), a 1280×800, sob a CSP desta decisão e com dados reais do provedor. Os valores de JS estão em KB gzip; a coluna "Situação" registra a decisão do humano.

| Opção | JS inicial | JS com o mapa aberto | Ruas e cidades | Disco | Origem externa | Situação |
|---|---|---|---|---|---|---|
| A0. OSM com filtro `grayscale` | 248,2 | 248,2 | Sim, mas densas | 0 | IP e área vista vão à OSMF | **Reprovada:** a vegetação continua no desenho |
| A1. Malha local, sem tiles | ≈ 251 | ≈ 251 | **Não** | 24 KB | Nenhuma | **Recusada pelo humano** |
| A3. Malha + Natural Earth | ≈ 251 | ≈ 251 | Só rodovias; **sem ruas** | ≈ 220 KB gzip | Nenhuma | **Reprovada:** não entrega ruas |
| B1. CARTO | 248,2 | 248,2 | Sim | 0 | IP vai à CARTO | **Reprovada:** cada instalação precisa de chave |
| **B2. OpenFreeMap + MapLibre em chunk** | **202,8** | **≈ 644** | **Sim, com nomes de rua** | **0** | **IP, endereço da instalação e área vista vão ao provedor** | **Escolhida pelo humano** |
| B2b. VersaTiles + MapLibre em chunk | ≈ 203 | ≈ 644 (não medi) | Sim | 0 | IP vai ao provedor | **Reprovada:** o próprio projeto chama o servidor de demo |
| B3. Arquivo local + `protomaps-leaflet` | 202,1 em chunk | ≤ 285,9 | Sim | ≈ 288 MB | Nenhuma | **Recusada:** ocupa disco, e a biblioteca está em manutenção |
| B4. Arquivo local + MapLibre em chunk | 202,8 | 646,7 | Sim | ≈ 288 MB | Nenhuma | **Não escolhida; é o plano de saída** |

O humano decidiu ciente do peso de ≈ 641 KB e do WebGL. A soma medida agora é 643,7 KB; a T-81 mede o chunk real.

**Composição da B2:**

| Parte | Quando carrega | KB (gzip) |
|---|---|---|
| JS inicial | Sempre | 202,8 |
| `maplibre-gl` (chunk) | Ao abrir o mapa | 294,0 |
| Worker do MapLibre | Ao abrir o mapa | 146,9 |
| CSS (`maplibre-gl.css`) | Ao abrir o mapa | 10,1 |
| TileJSON | Ao abrir o mapa | 19 (sem gzip) |
| Glifos, por vista | Ao abrir o mapa | 42 a 86 |
| **Tiles, por vista, sem cache** | Ao abrir o mapa | **738 (z7), 871 (z12), 1.958 (Brasil, z3,2), 2.128 (centro de SP, z15)** |

**Os tiles pesam mais do que na B4 (330 a 670 KB por vista), porque trazem as camadas que não desenhamos.** O servidor é do provedor, então não dá para cortá-las. A vista nacional, que é a de abertura, custa cerca de 2 MB no primeiro acesso. Esse número não estava na comparação que o humano viu.

**B2 e B4 lado a lado:**

| Atributo | B2. OpenFreeMap (escolhida) | B4. Arquivo próprio (saída) |
|---|---|---|
| Disco e download | Nenhum | ≈ 288 MB, uma vez, na imagem |
| Privacidade | Saem IP, endereço da instalação e área vista | Nada sai do nosso servidor |
| Continuidade | "may discontinue it at any time without notice"; sem SLA; custeado por doações | O arquivo é nosso. Só desatualiza |
| Sem internet | Sem fundo; o resto funciona | Funciona |
| Nomes de rua em zoom alto | **Melhor:** dados até z14 | Dados até z12 |
| Manutenção nossa | Nenhuma nos dados | Script e nova geração, cerca de 1× por ano* |
| CSP | Uma origem externa em `connect-src` | Só `'self'` |

### D. Como quem instala configura o mapa
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| D1. URL fixa no código | Nada a fazer | Trocar exige fork; não dá para desligar | Baixo |
| D2. `VITE_*` no build | Padrão do Vite | Não funciona com as imagens prontas do ADR-0013; a CSP do Nginx fica à parte e pode divergir | Baixo |
| **D3. Variáveis lidas na subida do container: o template do Nginx gera a CSP e o `/config/mapa.json`** | **Funciona com imagem pronta; URL e CSP nascem do mesmo lugar; dá para desligar** | Um template a mais; `read_only` exige saída em `tmpfs` | **Baixo** |

### C. Dados das rotas (aceita: C3)
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| C0. Só posições e rastro da telemetria | Nenhuma mudança no backend | Menos de 1 px no mapa nacional; uma requisição por veículo; hoje o rastro é zigue-zague. **Não mostra rota** | Baixo |
| C1. Tabela no frontend: texto → coordenada | Sem backend | Só funciona com os nomes da demo; homônimos; "Rua X, 100" não casa; o veículo fica fora da linha porque o job não a conhece | Baixo |
| C2. Geocodificação externa | Aceita texto livre | Envia endereços de clientes a terceiros; a rede do backend não tem saída; fora do escopo no PRD | Médio |
| **C3. Campo `route` na entrega, preenchido pela demo** | **Uma fonte só para o mapa e para o job; serve a dados reais no futuro; contrato aditivo** | Migração e contrato novos; **fora da demo fica vazio** | **Baixo: coluna opcional** |
| C4. Só um catálogo da demo, resolvido por id na API | Sem mudança no banco | Prende o contrato à demo; não evolui para dados reais | Médio |
| C5. Tabela de pontos ou PostGIS | Permite consultas espaciais | Nenhuma consulta espacial está prevista; muda a imagem do banco | Alto |

## Decisão

### Base do mapa
1. **Opção B2.** `maplibre-gl` entra com versão exata, e o `FleetMap` carrega em `React.lazy`. Saem `leaflet`, `react-leaflet` e `@types/leaflet`. O restante do Dashboard aparece sem esperar o mapa.
2. **Configuração (opção D3).** Variáveis do serviço `frontend`:

   | Variável | Padrão | Para que serve |
   |---|---|---|
   | `MAP_TILEJSON_URL` | `https://tiles.openfreemap.org/planet` | TileJSON no esquema OpenMapTiles. **Vazia, desliga o fundo** e nada sai para terceiros |
   | `MAP_GLYPHS_URL` | `https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf` | Glifos. O servidor precisa ter `Noto Sans Regular` e `Noto Sans Bold` |
   | `MAP_STYLE_URL` | vazia | Estilo completo de quem instala, necessário em outro esquema. Substitui as duas acima e **não acompanha o tema** |
   | `MAP_CSP_ORIGINS` | `https://tiles.openfreemap.org` | Origens em `connect-src`, separadas por espaço. Vazia, se o fundo estiver desligado |
   | `MAP_CREDIT` | `OpenFreeMap\|https://openfreemap.org;© OpenMapTiles\|https://www.openmaptiles.org/` | Crédito do provedor, em pares `texto\|link`. O do OpenStreetMap é fixo no código |

   - O Nginx entrega isso em `/config/mapa.json`, gerado do template na subida. `npm run dev` usa um arquivo equivalente em `public/`.
   - **Falha fechada:** se o `/config/mapa.json` não vier ou tiver URL que não seja `https`, o front trata o fundo como desligado. Nunca cai num padrão externo embutido no código, para não reativar um provedor que quem instala desligou.
   - **Armadilhas para o devops:**
     - No compose, usar `${MAP_TILEJSON_URL-…}`, **sem os dois-pontos**. Com `:-`, o valor vazio vira o padrão e o desligamento deixa de funcionar.
     - O script de template da imagem só troca variáveis definidas. Definir todas com `ENV` no Dockerfile, ou o Nginx recebe `${MAP_…}` literal.
     - Com `read_only: true` e sem pasta de saída gravável, o script só registra o erro em log e **segue sem gerar o arquivo**. Apontar `NGINX_ENVSUBST_OUTPUT_DIR` para um `tmpfs` e incluir essa pasta no `nginx.conf`.
3. **Estilo escrito por nós**, como objeto no código, sem baixar um estilo pronto. Os termos permitem: "When you use a customized style, you need to host the style JSON yourself". O estilo não declara `sprite`. Lista do que entra, no esquema OpenMapTiles:

   | Camada do tile | O que acontece |
   |---|---|
   | `background` | Cor de terra |
   | `water` | Entra, sem túneis |
   | `waterway` | Só `river` e `canal`, a partir do z10 |
   | `boundary` | País contínuo; UF (`admin_level` 4) tracejada, a partir do z3; sem limites marítimos |
   | `transportation` | `motorway` e `trunk` do z5, `primary` do z7, `secondary` e `tertiary` do z10, `minor` do z12. Sem túneis |
   | `transportation_name` | A partir do z14, ao longo da linha, só nas classes acima. Sem esse filtro, aparecem nomes soltos, como "Ciclovia da Avenida Paulista" |
   | `place` | `city` do z3, `town` do z8, `village` e `suburb` do z11, `state` do z4 ao z6, `country` até o z4 |
   | **`landcover`, `landuse`, `park`** (vegetação e usos do solo) | **Sem camada** |
   | **Fonte raster `ne2_shaded`** (relevo) | **Sem fonte** |
   | **`building`, `poi`, `housenumber`, `mountain_peak`, `aeroway`, `aerodrome_label`, `water_name`** | **Sem camada** |
   | Classes `service`, `track`, `path`, `rail`, `transit`, `ferry`, `busway`, `raceway` | **Fora do filtro** |

   - Nomes: `coalesce(name:pt, name:latin, name)`.
   - **Teste de lista:** um teste de unidade falha se o estilo declarar uma camada ou fonte fora da lista, ou um `sprite`.
   - Os dados dessas camadas continuam chegando no tile e pesando; só não são desenhados.
4. **Tema.** O estilo é uma função de tokens lidos com `useThemeTokens()` e aplicada com `setStyle(…, { diff: true })`. Os tokens `--ft-map-land`, `-water`, `-boundary`, `-road`, `-road-casing`, `-road-minor`, `-label`, `-label-halo` e `-route` têm valor nos dois temas e ficam com a ui-ux; os das capturas são provisórios. `--ft-map-tile-filter` e `.map-tiles-dark` saem.
   - **O estilo precisa de `transition: { duration: 0, delay: 0 }`.** Sem isso, a cor leva 300 ms para mudar, e o medidor registra o tempo de um quadro antigo: foi o que aconteceu na minha primeira rodada.
   - Medido, da chamada até o fim do quadro, sem GPU: **12 a 73 ms** em quatro vistas. O pior caso é o z12 de São Paulo, com 31 mil feições. Abaixo dos 100 ms. Com GPU, não medi.
   - A fonte do mapa é **Noto Sans**, não IBM Plex (ADR-0015). É a que o provedor serve.
5. **Navegação.** Enquadramento inicial pelo Brasil, `maxZoom` 16* e zoom fracionário. Acima de z14, o MapLibre amplia os dados.
6. **Capturas do README no tema claro.** Funcionam em headless sem GPU; as deste ADR saíram assim. O script espera o evento `idle` e **falha com erro** se o fundo não vier em 30 s*, para não publicar captura sem mapa. Roda à mão, não na CI (item 10).
7. **Marcadores (H-22).** `Marker` com `element` sendo um `<button>` nosso, com forma por status e `aria-label` gravado por `setAttribute`.
   - Testado em Chrome: o botão recebe foco, e o Enter abre o popup e leva o foco ao botão de fechar.
   - **O que falta, visto no mesmo teste:** o Esc não fecha o popup, e depois do popup o Tab cai no `body`. A T-81 precisa fazer o Esc fechar e devolver o foco ao marcador.
   - Os textos padrão estão em inglês ("Map", "Close popup"): usar a opção `locale` em pt-BR.
   - Conteúdo só por `textContent` e `setDOMContent`, **nunca HTML com dado da API**.
   - Origem e destino aparecem em texto no popup, e a tabela de veículos segue como alternativa com muitos marcadores.
   - A linha de rota não pode depender só de cor. O desenho fica com a ui-ux.
8. **CSP (revisa o ADR-0006).** O valor final, gerado do template:

   ```
   default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ${MAP_CSP_ORIGINS}; worker-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
   ```

   - **O provedor só entra em `connect-src`.** Tiles, TileJSON e glifos são buscados por `fetch`. O teste com o estilo pronto `liberty`, que tem raster e sprite, também passou só com isso: nenhum erro nem violação.
   - `img-src` perde a CARTO e ganha `blob:`. `worker-src 'self'` vale porque o worker é servido da nossa origem, com `setWorkerUrl`. Não foi preciso `unsafe-eval`.
   - A resposta do worker precisa levar os mesmos cabeçalhos, porque ele tem CSP própria. Cuidado com `add_header` dentro de `location`, que descarta os herdados.
   - **`Referrer-Policy` não muda.** Testei `same-origin`: o `Referer` some, mas o `Origin` do CORS continua indo, com o mesmo dado. Não há ganho.
   - Testado sob essa política: aba Network só com a nossa origem e `tiles.openfreemap.org`. Sem o provedor na política, a CSP barra o pedido e o mapa cai no comportamento de falha.
9. **Crédito.** Ver "Licenças". Componente React nosso, fora do canvas, com `attributionControl: false`. Assim, o `attribution` em HTML do TileJSON do provedor nunca entra no DOM (testado: nenhum `.maplibregl-ctrl-attrib`).
10. **Uso permitido pelos termos.** Ver "Termos do provedor". CI, testes e bancada (T-65) **não acessam o provedor**: usam estilo sem fonte externa. Nada de proxy com cache nem pré-download de tiles.
11. **Nginx.**
    - **Ligar gzip** para JS, CSS e `application/json`, inclusive o worker. Sem isso, o JS trafega com 2,3 MB.
    - Conferir que `.mjs` sai com MIME de JavaScript.

### Comportamento em falha do provedor
Medido com um proxy local que simula o provedor, com 503, 403, 429, conexão cortada, CORS ausente, resposta que nunca chega e CSP sem a origem.

**O que se vê:** o [fundo liso](assets/0016-b2-falha.png) na cor de terra do tema, com os marcadores, a rota e o crédito por cima. No painel do mapa, um aviso discreto: "Mapa de fundo indisponível. Veículos e tabela seguem atualizados." e o botão "Tentar de novo", com `role="status"`. O texto final fica com a ui-ux. **Sem o fundo, não há referência geográfica:** os pontos ficam soltos numa cor lisa, e a localização passa a depender do popup e da tabela.

| Falha | O que o MapLibre faz (medido) | O que o app faz |
|---|---|---|
| TileJSON com 503, 403, 429, conexão cortada, sem CORS ou barrado pela CSP | `error` com `sourceId: 'base'` em até 1 s; zero feições do fundo | Aviso e nova tentativa |
| Tiles com 503 | Um `error` por tile | Aviso e nova tentativa |
| **Resposta que nunca chega** (TileJSON, tile ou glifo) | **Nenhum evento:** `load` e `idle` não disparam. Com o glifo travado, o fundo não desenha, mesmo com os tiles já recebidos | **Vigia de tempo:** `!map.loaded()` por 15 s* mostra o aviso |
| Glifo com 503 | Nenhum evento. Os nomes continuam, com uma fonte do sistema | Nada a avisar |
| **Tile com 404** (pode ocorrer se a versão datada sair do ar com a aba aberta*) | **Nenhum evento**; o fundo some sem aviso | Reler o TileJSON a cada 24 h*, com a aba visível |
| Caiu depois de carregar | Os tiles já baixados ficam; 92 feições caíram para 15 numa vista nova. Quando o provedor volta, o mapa não se recupera por inteiro só com o movimento | Aviso e nova tentativa |

**Regras para a implementação:**
- **Nada depende do evento `load`.** Ele pode nunca disparar. Medido com tudo travado: 8 marcadores na tela e com foco, rota desenhada e tema trocando em 11 ms.
- **Nova tentativa é `setStyle(estilo, { diff: false })`.** Testado: relê o TileJSON, recupera o fundo, mantém a câmera e os marcadores. Com `diff: true`, nenhum pedido sai.
- **A rota fica dentro do objeto de estilo,** para sobreviver à troca de tema e à nova tentativa.
- **Espera entre tentativas automáticas:** 30 s, 60 s, 120 s e depois 300 s*. Com 403 ou 429, começa em 300 s*. Pausa com a aba oculta. O botão tenta na hora.
- O aviso some no primeiro `idle` sem erro novo do fundo.
- Se o fundo estiver desligado por configuração, não há aviso de erro, nova tentativa nem crédito; só um texto fixo: "Mapa de fundo desligado nesta instalação".

### O que aparece com cada dado
| Conteúdo | Dados | Backend | Quando |
|---|---|---|---|
| Brasil, ruas, cidades e marcadores com a posição atual | Provedor + atuais | Não muda | Fase 1 |
| Rastro de 2 h na página do veículo (H-38) | Telemetria | Precisa buscar a janela de 2 h (ver "Pontos para o tech-lead") | M3 |
| **Rotas das entregas em andamento, na demo** | `route` | **Muda: coluna, contrato, trajetos e job** | Fase 2 |
| Trecho já percorrido e trecho restante | `route` + posição | Não muda além da fase 2: o front projeta a posição na linha | Fase 2, se a ui-ux quiser |
| Rotas fora da demo | Não existem | Exige cadastro de entregas, fora de escopo | Sem data: **nenhuma linha é inventada** |

### Rotas (aceita pelo humano em 2026-11-01)
12. **Opção C3, no modelo de dados.** `deliveries.route_path jsonb NULL`, em migração só de expansão.
    - Formato GeoJSON `LineString` (RFC 7946, **`[longitude, latitude]`**), de 2 a 200 pontos*, validado na aplicação. O MapLibre lê esse formato direto, em uma fonte `geojson` com camada `line`.
    - Dado pessoal: **indireto** (entrega → veículo → motorista). Na demo é fictício, e fora dela a coluna fica nula. Receber rota real exige rever a LGPD e a retenção (H-12) em um novo ADR.
    - **A rota não vai ao provedor.** Ela é desenhada no navegador, a partir da nossa API.
13. **Contrato (aditivo, segue ADR-0009 e ADR-0010).**
    - `GET /api/v1/deliveries?status=em_transito&include=route` traz `route: { type: "LineString", coordinates: [...] } | null`, com a paginação por cursor de sempre.
    - Sem `include=route`, o campo não vem. `GET /api/v1/deliveries/{id}` sempre o traz.
    - A autorização não muda (matriz do README). As rotas não mudam durante a entrega, então o front as atualiza a cada 60 s*, à parte das posições.
14. **Trajetos da demo: recurso embutido no backend** (`backend/Demo/corredores.json`).
    - Sequências de sedes de município, escritas à mão, em quantidade suficiente para as 8 entregas em andamento da H-29.
    - **Não copiar geometria do OSM nem usar serviço de rotas:** evita levar a obrigação da ODbL ao banco da aplicação e respeita o PRD. Por isso, a linha é o trajeto entre cidades e não segue as ruas do fundo. Com zoom alto, ela corta quarteirões. **O humano aceitou isso em 2026-11-01.**
    - O seed copia o corredor para `route_path`. O job interpola sobre os pontos da própria entrega, e assim mapa e simulação não divergem. O teste de distância da H-24 continua valendo.
    - Recomendação para a H-27: retomar o progresso projetando a última posição na rota, sem coluna nova. A escolha final fica com o tech-lead.

## Termos do provedor (lidos na fonte em 2026-11-01)
[Termos](https://openfreemap.org/tos/) atualizados em 2026-10-14; [privacidade](https://openfreemap.org/privacy/), em 2026-10-08. Empresa: Hyperknot Software Kft., Hungria.

| Ponto | O que dizem | O que fazemos |
|---|---|---|
| Uso e custo | "completely free"; sem limite de visualizações ou requisições, sem cadastro, chave ou cookies. Uso comercial permitido ([página inicial](https://openfreemap.org/)) | Usamos sem chave |
| Continuidade | "may discontinue it at any time without notice"; "AS-IS"; sem responsabilidade por danos | Comportamento em falha e plano de saída |
| Coleta automatizada | Proibido "Collect data from the service in automated ways", salvo download offline pequeno (até 3.000 tiles ou 50 MB, 4 pedidos em paralelo, User-Agent próprio) | Sem proxy com cache, sem pré-download; CI e bancada fora do provedor |
| Estabilidade do serviço | Proibido "Disrupt the service" | Espera crescente entre tentativas; teste de carga nunca aponta para ele |
| Crédito | Obrigatório. "If you are using MapLibre, they are automatically added"; em outros casos, "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" | Como desligamos o controle automático, o crédito é nosso e tem os três nomes e links |
| Quem pode integrar | "at least 18 years old" | Consta do aviso a quem instala |
| Mudanças | "We may update these Terms at any time"; anúncio no X e no Bluesky; continuar usando significa aceitar | Conferir a data dos termos a cada release |
| Foro | Lei húngara; arbitragem em Budapeste | Consta do aviso a quem instala |
| Cloudflare | "We may use Cloudflare as a CDN"; usar o site implica consentir | Consta do aviso a quem instala |

As rodadas de teste deste ADR fizeram algumas dezenas de abertura de página, sem guardar tile em disco, como um navegador comum. Essa leitura dos termos é minha, não aconselhamento jurídico.

## Aviso de privacidade para quem instala (entra na T-61)
Vai em `docs/lgpd.md`, com um resumo e link no início do README e um comentário nas variáveis do `.env.example`. Quem instala lê antes de subir. Texto proposto:

> **Mapa de fundo e terceiros.** Por padrão, o navegador de quem abre o Fleet-Track baixa o mapa de fundo do OpenFreeMap (Hyperknot Software Kft., Hungria), passando pela Cloudflare.
>
> **O que o provedor recebe a cada pedido:** o endereço IP, os dados do navegador, o endereço desta instalação e os blocos de mapa pedidos, que revelam a área e o zoom consultados. Quando alguém amplia o mapa sobre um veículo, a área pedida fica perto dele.
>
> **O que não recebe:** placas, nomes, entregas, rotas e dados da API.
>
> **O que o provedor declara:** registros de acesso sem IP; registros de erro com IP e URL, apagados em 7 dias; registro de IP por até 30 dias em incidente de segurança. A Cloudflare tem política própria. Não há contrato com o provedor, garantia nem SLA, e o serviço pode acabar sem aviso. Os termos exigem ao menos 18 anos e adotam a lei húngara, com arbitragem em Budapeste.
>
> **Sua responsabilidade:** como controlador, avalie a base legal, informe operadores e motoristas e avalie a transferência internacional (LGPD, art. 33).
>
> **Para não enviar nada:** deixe `MAP_TILEJSON_URL` e `MAP_CSP_ORIGINS` vazias. O painel continua funcionando, com os veículos sobre fundo liso. Para usar outro serviço, veja as variáveis `MAP_*`.
>
> Este texto não é aconselhamento jurídico.

A T-61 passa a listar também, entre os dados tratados, o que vai ao provedor. Sobre a transferência: há notícia de [decisão de adequação recíproca entre Brasil e União Europeia](https://cesconbarrieu.com.br/decisao-de-adequacao-reciproca-entre-brasil-e-uniao-europeia-implicacoes-para-fluxos-transfronteiricos-de-dados/) (Resolução ANPD 32/2026). A fonte é secundária: não li o texto, e a decisão não resolveria a Cloudflare, que pode tratar dados fora da UE. Por isso, o aviso não a cita como solução.

## Licenças (lidas na fonte em 2026-11-01)
| Item | Licença | Obrigação |
|---|---|---|
| Dados do mapa (OpenStreetMap, pelo provedor) | **ODbL 1.0** | Crédito sempre visível. Como não guardamos nem distribuímos o banco, a oferta da cópia e o aviso de ODbL da B4 não se aplicam. **Voltam se a saída for o arquivo próprio** |
| Esquema OpenMapTiles | Crédito exigido pelo provedor | "© OpenMapTiles" no crédito |
| `maplibre-gl` | BSD-3-Clause | Aviso no arquivo de licenças de terceiros (ADR-0015 §8) |
| Glifos Noto Sans | SIL OFL 1.1 | Nenhuma nossa: quem serve é o provedor |

**Crédito sempre visível no canto do mapa:** "OpenFreeMap · © OpenMapTiles · © OpenStreetMap", com link em cada nome. O do OpenStreetMap aponta para `openstreetmap.org/copyright`, como pedem as diretrizes da OSMF. Sem modo compacto, legível nos dois temas e também durante a falha do provedor, porque os tiles já baixados podem continuar na tela. Só some com o fundo desligado por configuração, caso em que nenhum dado do OSM é mostrado. As capturas do README levam o crédito.

## Falhas
| Falha | O que o usuário vê |
|---|---|
| Provedor fora, bloqueando ou sem resposta | Ver "Comportamento em falha do provedor" |
| CSP sem a origem, por erro de configuração | O mesmo aviso; o console do navegador mostra a violação de `connect-src` |
| `/config/mapa.json` ausente ou inválido | Fundo desligado; nada sai para terceiros |
| Chunk do mapa não carrega | Aviso com nova tentativa no painel do mapa; o resto do Dashboard funciona |
| Navegador sem WebGL | Aviso "mapa indisponível neste navegador", e a tabela de veículos segue como alternativa |
| Rotas com erro ou lentas | Marcadores sem linhas e aviso com nova tentativa (H-21). A chamada das rotas não bloqueia a das posições |
| Entrega com `route: null` | Só o marcador; origem e destino em texto no popup |
| Posição ausente ou inválida | Veículo fora do mapa e "sem dado" na tabela (H-21) |

## Threat model (STRIDE, fluxos novos)
| Fronteira | Ameaça | Controle |
|---|---|---|
| Navegador → provedor | **I**: IP, endereço da instalação e área vista saem para terceiro | Aceito pelo humano. URL só com `z/x/y`, sem placa nem id; aviso a quem instala; desligamento por variável; a CSP limita a saída às origens listadas |
| Provedor → navegador (TileJSON) | **T**: HTML malicioso em `attribution`; `tiles` apontando para outro host | Controle automático de crédito desligado, com crédito nosso (testado); a CSP barra host fora da lista (testado) |
| Provedor → navegador (estilo) | **T**: estilo remoto trocado | O estilo padrão é nosso, no bundle. `MAP_STYLE_URL` é escolha de quem instala, e a CSP vale igual |
| Conteúdo do OSM → rótulos | **T**: texto malicioso em nome de rua | Rótulo desenhado no WebGL, nunca como HTML |
| Provedor fora ou lento | **D**: mapa travado sem erro | Vigia de 15 s*, tentativas com espera crescente, nada depende de `load` |
| Variáveis `MAP_*` → Nginx | **T**: valor altera a CSP ou o arquivo de configuração | Quem instala já controla o container. O front só aceita URL `https` |
| API → marcador e popup | **T**: XSS com texto de placa, origem ou destino | Só `textContent`/`setDOMContent`, `aria-label` por `setAttribute`, `script-src 'self'` |
| API → navegador (`route`) | **I**: trajeto de entrega exposto | Mesma autorização das entregas; `include` explícito |
| Escrita de `route_path` | **D**: geometria enorme | Limite de 200 pontos*; hoje só o seed escreve |

## Plano de saída
**Gatilhos:** aviso de encerramento, mudança nos termos que impeça o uso, bloqueio ou indisponibilidade por mais de 7 dias*, ou instalação que não possa enviar dados para fora.

| Saída | Quando usar | O que muda | Custo |
|---|---|---|---|
| **Desligar o fundo** | Na hora, em qualquer instalação | `MAP_TILEJSON_URL` e `MAP_CSP_ORIGINS` vazias | Nenhum. Fica sem referência geográfica |
| **Outro serviço no esquema OpenMapTiles** | Existe um que atenda | Variáveis `MAP_*`; o estilo continua valendo. Autohospedar o OpenFreeMap exige cerca de 200 GB, e a documentação só cita `monaco` e `planet` | Baixo. Pode exigir chave |
| **Estilo próprio de quem instala** | Outro esquema | `MAP_STYLE_URL` | Baixo. Perde a troca de tema |
| **B4, arquivo próprio do Brasil** | O serviço acabou, ou o projeto quer zero terceiros por padrão | `pmtiles` no chunk (≈ 646,7 KB no total), estilo reescrito no esquema Protomaps v4, ≈ 288 MB a mais com dados até o z12, script de geração e obrigações da ODbL | Médio, cerca de 1 a 2 semanas*. Medições e capturas em [revisão B4](assets/0016-revisao-b4.md) |

O número dos 288 MB vem de soma e amostra; o arquivo não foi gerado. A forma de distribuir o arquivo se decide em novo ADR, se a saída for acionada. O formato do `route` e os marcadores não mudam em nenhuma saída.

## Consequências
- **Positivas:**
  - Ruas e cidades ao fundo, sem vegetação nem relevo, sem ocupar disco e sem pipeline de dados.
  - Mais nomes de rua em zoom alto do que no arquivo próprio.
  - O JS inicial cai 45,4 KB, abrindo folga para o resto do produto.
  - Troca de tema abaixo dos 100 ms, mesmo sem GPU.
  - A H-24 ganha resposta: o trajeto mora na entrega.
- **Negativas:**
  - **Dependência de um terceiro sem garantia.** Sem provedor, o mapa fica sem referência geográfica.
  - **IP, endereço da instalação e área vista saem para o provedor e a Cloudflare.** Quem instala fica com o trabalho de avaliar isso na LGPD.
  - **O Dashboard baixa ≈ 644 KB de JS gzip com o mapa aberto, contra 248,2 KB hoje (2,6×), mais cerca de 2 MB de tiles na primeira vista nacional.** O orçamento só é cumprido porque mede o JS inicial. Em 4G, o mapa aparece bem depois do restante. A interpretação do MapLibre (1,6 MB de JS) não foi medida em aparelho fraco.
  - **Exige WebGL.** Sem ele, não há mapa, só a tabela. Não testei navegadores antigos.
  - **Dependência nova e com curva de aprendizado:** o time conhece Leaflet, não MapLibre. Versões novas quase toda semana: fixar a versão e atualizar em lote. A T-81 precisa ser refeita, e o foco do popup fica por nossa conta.
  - **O estilo fica preso ao esquema OpenMapTiles.** O provedor promete o esquema sem modificação, mas não há versão fixa dos dados: a aparência pode mudar sem aviso.
  - **Fora da demo não há rotas**, só posições. Na demo, a linha não acompanha as ruas.
  - **No mapa nacional, os veículos parecem parados** (1 px a cada 6 min a 90 km/h). Acelerar violaria a H-25.
  - **As rotas dependem da fila do backend:** T-13 (depende de T-12 e T-09; P2 e P3 já decididas como sim), T-17, T-35 e T-36. A fase 1 chega antes e mostra o mapa ainda sem linhas.
- **Monitorar:**
  - JS inicial e chunk do mapa a cada PR, com orçamento próprio para o chunk: ≤ 460 KB*, somando o worker (hoje, 440,9 KB).
  - Aba Network só com a nossa origem e as de `MAP_CSP_ORIGINS`.
  - Data dos termos e da política de privacidade do provedor, a cada release.
  - Se o humano quiser reduzir o custo da primeira vista: abrir o enquadramento em outro zoom muda quantos tiles pesados são pedidos. Não medi alternativas.

## Como voltar atrás
Ver "Plano de saída". A troca de provedor é configuração. A saída para a B4 é o único caminho com custo real, e não mexe em dados da aplicação.

## O que não testei
Lista original de 2026-11-01. Para o que já foi verificado depois, vale a seção "Verificado no produto".
- **Nada em Docker:** o Docker não respondeu nesta máquina. Ficam para o aceite: o template gerando a CSP e o `/config/mapa.json` em `tmpfs` com `read_only`; valor com `{fontstack}` no template; valor vazio passando pelo compose; cabeçalhos na resposta do worker. O script de template foi lido na fonte, não executado. *(Atualização: a T-92 cobriu `{fontstack}` e o valor vazio. Seguem abertos a CSP, `read_only` com `tmpfs` e os cabeçalhos do worker.)*
- **O proxy de teste não é o provedor.** Ele reproduz as respostas de falha; o caminho real foi testado à parte, com o provedor funcionando.
- **404 por troca de versão:** não sei por quanto tempo o provedor mantém versões antigas. Testei só o efeito do 404. A releitura a cada 24 h* é cautela.
- **Peso real em HTTPS:** medi com gzip, passando pelo proxy. Tile de amostra: 313 KB sem compressão, 168 KB com gzip. Pedindo só `br`, o provedor respondeu sem compressão.
- **Com GPU:** os tempos deste ADR são sem GPU.
- **Fonte de reserva dos nomes:** com glifo em 503, os nomes vêm de uma fonte do sistema. Só vi em Windows.
- **Ordem de Tab entre vários marcadores e popup em React.** O teste de teclado cobriu um marcador com popup de texto.
- **Leitor de tela.** Só conferi foco, Enter e `aria-label` em Chrome.

## Pontos para o tech-lead (a T-81 muda, as tarefas são suas)
- **Fase 1, só frontend:** T-81 sobre MapLibre em chunk. Forma por status, tema e popup continuam. Entram Esc, retorno do foco, `locale` em pt-BR, estilo por lista, crédito próprio, aviso de falha, vigia de tempo e novas tentativas.
- **Aceite novo no lugar de "Network só com `tile.openstreetmap.org`":** Network só com a nossa origem e as de `MAP_CSP_ORIGINS`. O DoD-4.9 e a linha da T-33 sobre `img-src` acompanham.
- **Trabalho novo (devops):** template do Nginx com CSP e `/config/mapa.json`, variáveis `MAP_*` no compose e no `.env.example`, gzip e MIME no Nginx, cópia do worker e aviso de licença. Atenção às três armadilhas do item 2.
- **T-61 cresce:** aviso de privacidade, com o texto deste ADR. Hoje ela depende da T-40, mas o mapa novo chega antes. **Recomendo que o resumo no README entre junto com a T-81,** para quem instala não ficar sem aviso nesse intervalo.
- **Testes:**
  - O jsdom não tem WebGL, e o `App.test.tsx` já simula o `FleetMap`.
  - Em unidade: a função de estilo (lista de camadas e os dois temas), a máquina de estados do fundo, com eventos simulados, e a leitura da configuração, incluindo a falha fechada.
  - CI e bancada não acessam o provedor. O script de capturas roda à mão.
- **Documentos a atualizar:** ADR-0015 §4 e "Nenhuma dependência nova para mapa", ADR-0006 (CSP e o exemplo da CARTO), README dos ADRs (C4, modelo de dados, falhas, threat model) e README do projeto (linhas 98 e 104). Nesta rodada, só o índice do README dos ADRs foi atualizado.
- **Lacuna fora deste ADR:** a H-38 pede 2 h de trajeto. A 5 s, são 1.440 pontos, e o limite da API é de 200 por página (ADR-0010). Falta decidir entre filtrar por período com redução de pontos ou seguir o cursor.
- **Lógica da T-35:** ela "reaproveita" o passeio aleatório atual, que a H-24 proíbe. O job precisa nascer lendo `route_path`, ou a T-35 será refeita.
- **Dependências reais da T-13:** T-12 e T-09. P2 e P3 já foram decididas como sim, então a T-13 não está mais bloqueada por decisão. O plano ainda diz "bloqueada: decisão humana (P3)" na linha 217.

## O que o humano decidiu (2026-11-01)
1. Serviço externo OpenFreeMap, com nada guardado em disco.
2. MapLibre, ciente dos ≈ 641 KB com o mapa aberto e do WebGL obrigatório.
3. Crédito do OpenStreetMap sempre visível.
4. Rota da demo desenhada à mão, sem seguir as ruas, depois do mapa novo e só na demonstração.
5. Ciente de que IP e área vista vão a um provedor sem garantia.

## Premissas e fatos novos a confirmar antes da implementação
1. **Fato novo:** cerca de 2 MB de tiles na primeira vista nacional. Não estava na comparação da decisão.
2. **Fato novo:** além do IP e da área, o provedor recebe o endereço da instalação (`Origin`), e isso não dá para evitar.
3. **Limitação:** sem provedor, o fundo fica liso, sem contorno do Brasil. O contorno local (A1, 24 KB) poderia servir só de reserva, mas exige revisar a licença do IBGE. **Fora desta decisão**; fica como evolução se o humano quiser.
4. Números com *: `maxZoom` 16, vigia de 15 s, esperas de 30 a 300 s, releitura em 24 h, capturas em 30 s, gatilho de 7 dias, 460 KB, 200 pontos, 60 s, 1 a 2 semanas.

## Fontes
- Medições de 2026-11-01: `maplibre-gl` 6.16.0 em Chrome headless sem GPU; bancada descartável fora do repositório. Capturas: [claro](assets/0016-b2-claro.png), [escuro](assets/0016-b2-escuro.png), [zoom de rua](assets/0016-b2-rua.png), [falha](assets/0016-b2-falha.png).
- Provedor: [OpenFreeMap](https://openfreemap.org/), [início rápido](https://openfreemap.org/quick_start/), [termos](https://openfreemap.org/tos/), [privacidade](https://openfreemap.org/privacy/), [autohospedagem](https://github.com/hyperknot/openfreemap/blob/main/docs/self_hosting.md), [estilo `liberty`](https://tiles.openfreemap.org/styles/liberty), [TileJSON](https://tiles.openfreemap.org/planet); [política de privacidade da Cloudflare](https://www.cloudflare.com/privacypolicy/).
- Licenças: [copyright do OSM](https://www.openstreetmap.org/copyright); [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/); [atribuição](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines).
- Bibliotecas e infraestrutura: [maplibre-gl](https://www.npmjs.com/package/maplibre-gl); [CSP do MapLibre](https://maplibre.org/maplibre-gl-js/docs/); [script de template do Nginx](https://github.com/nginxinc/docker-nginx/blob/master/entrypoint/20-envsubst-on-templates.sh).
- LGPD: [adequação Brasil–UE, fonte secundária](https://cesconbarrieu.com.br/decisao-de-adequacao-reciproca-entre-brasil-e-uniao-europeia-implicacoes-para-fluxos-transfronteiricos-de-dados/).
- Alternativas e plano de saída: [revisão B4](assets/0016-revisao-b4.md), com as fontes das opções recusadas; [comparação das opções](assets/0016-opcoes.png).
- [RFC 7946, GeoJSON](https://www.rfc-editor.org/rfc/rfc7946).

Próximo: tech-lead | entradas: este ADR, `assets/0016-b2-*.png`. Premissas e fatos novos a confirmar: seção acima.
