# ADR-0016, revisão B4 (substituída em 2026-11-01)

Cópia só para consulta. Não vale como decisão. O ADR vigente é [0016](../0016-desenhar-mapa-com-openfreemap-e-maplibre-e-ler-rotas-da-entrega.md); esta cópia guarda as medições do plano de saída (arquivo próprio).

Status: proposto. A parte de rotas já foi aceita pelo humano em 2026-11-01 (C3, mapa antes, rotas depois, só na demo). A base do mapa foi refeita e aguarda aceite.
Data: 2026-11-01 (revisão: o humano recusou o mapa só com contorno; quer ruas e cidades ao fundo, sem vegetação nem textura)
Histórias: pedido do humano sobre o mapa, H-22, H-24 (fecha a "decisão estrutural" dela), H-38
Altera, se aceito: ADR-0015 §4 e a premissa "zero origens externas além dos tiles"; ADR-0006 (CSP); tarefa T-81 e DoD-4.9.
Nota: o nome do arquivo ainda diz "malha local", para não quebrar referências durante a revisão. Renomear na aceitação.

## Resumo
- **Base do mapa:** MapLibre em chunk separado, lendo um arquivo PMTiles do Brasil servido pelo nosso Nginx. Sem chave, sem cadastro e sem nenhuma requisição externa em tempo de execução.
- **Visual:** só terra, água, limites, vias e nomes de lugares. Vegetação, usos do solo, prédios e pontos de interesse saem do próprio arquivo, e o arquivo não tem relevo. Capturas dos temas claro e escuro não versionadas.
- **Disco:** cerca de 288 MB (IC 95%: 268 a 306 MB), com dados até o z12. Fica em asset de release do GitHub, fora do git, e entra na imagem do frontend durante o build.
- **JS:** o inicial **cai** de 248,2 para 202,8 KB gzip. Com o mapa aberto, porém, o total sobe para **646,7 KB gzip**, e o Dashboard abre com o mapa. O orçamento é cumprido, mas o peso real aumenta: **o humano precisa aceitar isso**.
- **Rotas:** seguem como aceitas. O campo `route` na entrega é preenchido pela demo e chega depois do mapa. Dependências reais da T-13: T-12 e T-09.
- **Plano B:** a B3 (`protomaps-leaflet`) usa o mesmo arquivo e pesa 361 KB a menos, mas a biblioteca está em modo de manutenção.

## Contexto

### Fatos verificados em 2026-11-01
- `FleetMap.tsx` usa `tile.openstreetmap.org` com `CircleMarker`. A vegetação faz parte do desenho desses tiles: um filtro CSS muda a cor, mas não tira o detalhe.
- **Hoje o marcador não é acessível por teclado.** `CircleMarker` é um `Path` do Leaflet, sem `tabindex`. A T-81 ainda não foi feita, então replanejá-la agora é barato.
- O JS inicial está em **248,2 KB gzip** (`index-bE3hGK5y.js`, `gzip -9`; o build se reproduziu com o mesmo hash), e o orçamento é de 300 KB. A versão anterior deste ADR dizia 249,2 KB. Sem Leaflet e react-leaflet, ele fica em 202,1 KB.
- **`frontend/nginx.conf` não liga gzip.** O bundle de 863 KB trafega sem compressão, salvo se a configuração global da imagem ligar (não conferi). O orçamento é medido em gzip, mas o usuário pode estar recebendo 3,5× isso, e o plano não tem tarefa para esse ajuste. Com esta decisão, o ajuste fica obrigatório: sem gzip, o JS com o mapa aberto passa de 2,3 MB.
- `Delivery` tem `Origin` e `Destination` só em texto. Não existe `POST` de entregas, e a H-23 deixa esse cadastro fora do escopo. **Fora da demo, portanto, não há entregas hoje.**
- A telemetria devolve no máximo 50 registros por veículo (`TelemetryController.cs:21`). A simulação atual é um passeio aleatório (`:46-47`).
- O PRD deixa fora do escopo a roteirização, o traçado exato pelas ruas e o serviço externo de rotas. A H-24 exige uma "sequência predefinida de pontos, coerente com a entrega".
- O `protomaps-leaflet` declara no README do repositório: "maintenance mode", recomendado "only for legacy Leaflet-based systems". Última versão no npm: 5.1.0, de 2025-06-18.
- Os builds diários do Protomaps ficam disponíveis por cerca de uma semana. O de 2026-10-25 já respondeu 404, e os de 30/10 a 01/11 responderam 200. A documentação desencoraja o hotlink, então precisamos hospedar a nossa cópia.

### O que cabe na tela
Em zoom 4 do Leaflet e latitude −15°, 1 px equivale a cerca de 9,5 km. O mesmo enquadramento é o zoom 3 no MapLibre, que usa uma grade de 512 px. Os zooms das capturas e da decisão são os do MapLibre.

| O que se quer ver | Distância | Tamanho nessa escala |
|---|---|---|
| Rastro de 50 registros a cada 5 s, a 90 km/h | 6 km | **menos de 1 px** |
| Rastro de 2 h a 90 km/h | 180 km | 19 px |
| Rota São Paulo → Rio de Janeiro, em linha reta | 361 km | 38 px |
| Veículo a 90 km/h | 1 px a cada 6 min | praticamente parado |

Conclusão: **no mapa nacional, "rota" só pode ser o trajeto da entrega.** O rastro da telemetria só faz sentido com zoom, na página do veículo.

### Atributos de qualidade (* = premissa)
Critérios do humano:
- Subir sem chave nem cadastro.
- JS inicial ≤ 300 KB gzip.
- Troca de tema nos dois temas, em < 100 ms (ADR-0015).
- Capturas do README no tema claro.
- Marcadores acessíveis (H-22).
- Arquivo fora do git, sem inviabilizar `docker compose up`.

Premissas deste ADR:
- Zero requisições externas em tempo de execução* (privacidade, ADR-0006).
- Até 500 veículos* (README).
- Arquivo ≤ 350 MB*.

## Alternativas

### A. Base do mapa
Medido com o código atual e `vite build` fora do repositório, usando `maplibre-gl` 6.16.0 e `pmtiles` 4.5.0. Captura e tempos em Chrome headless, sob a CSP de destino, com dados reais do build 20261101.

| Opção | JS inicial | JS com o mapa aberto | Ruas e cidades | Disco | Origem externa | Situação |
|---|---|---|---|---|---|---|
| A0. OSM com filtro `grayscale` | 248,2 | 248,2 | Sim, mas densas | 0 | IP e área vista vão à OSMF | **Reprovada:** a vegetação continua no desenho |
| A1. Malha local, sem tiles (versão anterior) | ≈ 251 | ≈ 251 | **Não** | 24 KB | Nenhuma | **Recusada pelo humano** |
| A3. Malha + Natural Earth (rodovias e cidades) | ≈ 251 | ≈ 251 | Só rodovias; **sem ruas** | ≈ 220 KB gzip | Nenhuma | **Reprovada:** não entrega ruas |
| B1. CARTO | 248,2 | 248,2 | Sim | 0 | IP vai à CARTO | **Reprovada:** cada instalação precisa de chave |
| B2. OpenFreeMap + MapLibre em chunk | 202,8 | ≈ 641 | Sim, com mais nomes de rua | **0** | **IP e área vista vão ao provedor** | Cumpre os critérios; depende de terceiro sem garantia |
| B2b. VersaTiles + MapLibre em chunk | ≈ 203 | ≈ 641 (não medi) | Sim | 0 | IP vai ao provedor | **Reprovada:** o próprio projeto chama o servidor de demo |
| B3. PMTiles local + `protomaps-leaflet` | 202,1 em chunk; ≤ 285,9 sem chunk | **≤ 285,9** | Sim | ≈ 288 MB | Nenhuma | Cumpre os critérios; biblioteca em manutenção. **Plano B** |
| **B4. PMTiles local + MapLibre em chunk** | **202,8** | **646,7** | **Sim** | **≈ 288 MB** | **Nenhuma** | **Recomendada** |

O MapLibre carregado no JS inicial daria cerca de 499 KB e estouraria o orçamento, por isso só vale em chunk. O custo da B3 é um teto: é o `dist` completo do pacote, com PMTiles e dependências, medido em 37,7 KB gzip. O custo da A3 soma a malha (23,6 KB), as rodovias da Natural Earth 1:10m num retângulo do Brasil (190,4 KB) e as cidades (5,6 KB).

**Composição da B4 (gzip):**

| Parte | Quando carrega | KB |
|---|---|---|
| JS inicial | Sempre | 202,8 |
| `maplibre-gl` + `pmtiles` (chunk) | Ao abrir o mapa | 297,0 |
| Worker do MapLibre | Ao abrir o mapa | 146,9 |
| CSS (`maplibre-gl.css`) | Ao abrir o mapa | 10,1 |
| Glifos Noto Sans, intervalo 0-255, 2 pesos | Ao abrir o mapa, sem novo gzip | 153,7 |
| Tiles por vista, sem o corte de camadas | Ao abrir o mapa | 330 a 670 |

**B2 e B4 lado a lado.** A escolha real é entre elas:

| Atributo | B2. OpenFreeMap | B4. Arquivo próprio |
|---|---|---|
| Disco e download | Nenhum | ≈ 288 MB, uma vez, na imagem |
| Privacidade | Sai IP e área vista. Log de acesso sem IP, log de erro com IP por 7 dias, até 30 dias em incidente. A empresa fica na Hungria, e os termos citam a Cloudflare | Nada sai do nosso servidor |
| Continuidade | "may discontinue it at any time without notice"; sem SLA; custeado por doações | O arquivo é nosso e tem hash fixo. Só desatualiza |
| Sem internet | Sem base | Funciona |
| Autohospedagem | Planeta inteiro, ≈ 200 GB; a documentação só cita `monaco` e `planet` | É a própria opção |
| Nomes de rua em zoom alto | **Melhor:** dados até z14 | Menos nomes em z15; dados até z12 |
| Manutenção nossa | Nenhuma | Script e nova geração, cerca de 1× por ano* |
| CSP | Abre uma origem externa em `connect-src` | Só `'self'` |

**B3 e B4 lado a lado.** Mesmo arquivo, renderizadores diferentes:

| Atributo | B3. `protomaps-leaflet` | B4. MapLibre |
|---|---|---|
| JS com o mapa aberto | ≤ 285,9 KB | 646,7 KB |
| Saúde do projeto | Modo de manutenção; última versão em 2025-06 | Versão nova quase toda semana (6.13 a 6.16 em outubro) |
| Primeira troca de tema, GPU | 34 a 74 ms | **5 a 6 ms** |
| Primeira troca de tema, sem GPU | 218 a **926 ms** | **9 a 15 ms** |
| 500 marcadores, p95 do quadro (GPU / sem GPU) | 7,5 / 6,9 ms | 9,7 / 26,3 ms |
| WebGL | Não exige | **Exige** |
| Marcadores | Leaflet, como a T-81 já prevê | Refazer a T-81 |
| Rótulos | Mais densos, com sobreposição no zoom 7 ([comparação](0016-opcoes.png)) | Melhor distribuídos, com nome ao longo da rua |
| Worker e CSP | Sem worker | Pede `worker-src` e `blob:` |

Ressalvas da medição:
- A troca foi medida forçando a leitura de um pixel depois de desenhar, em três vistas de mesmo enquadramento. Na B3, o zoom do Leaflet é o do MapLibre + 1.
- Os rótulos da B3 usam um estilo mínimo que escrevi só para este teste, sem filtro por população nem nomes de via. Com ajuste, ela melhora. A captura não prova um limite da biblioteca.
- Os 500 marcadores são um teste sintético de arraste em headless, sem vsync. Nos dois casos, fica abaixo de um quadro a 30 fps.

### Quanto do Brasil guardar
Medido em 2026-11-01 lendo o diretório do build 20261101 (Protomaps 4.15.2, com 139 GB no planeta), por requisições de intervalo, sem baixar o planeta. Área: polígono das UFs com folga de cerca de 39 km. O corte remove `landcover`, `landuse`, `buildings` e `pois`, recomprimindo tiles reais, com até 1.500 por nível.

| Até o nível | O que aparece (captura não versionada) | Sem corte | **Com corte (IC 95%)** | Retângulo, sem corte |
|---|---|---|---|---|
| z8 | Rodovias e cidades | 16 MB | 4,7 MB | 21 MB |
| z10 | + avenidas e vias principais | 109 MB | 39 MB (36 a 42) | 149 MB |
| z11 | + vias médias. **Sem ruas locais** | 233 MB | 80 MB (74 a 87) | 316 MB |
| **z12** | **+ ruas locais. O salto que importa** | **565 MB** | **288 MB (268 a 306)** | **761 MB** |
| z13 | Quase igual em tela, com mais nomes | 1,17 GB | 684 MB (645 a 724) | 1,59 GB |
| z14 | Mais geometria | 2,27 GB | ≈ 1,3 GB (amostra de 200) | 3,09 GB |
| z15 | Máximo do arquivo | 4,46 GB | ≈ 2,3 GB (amostra de 200) | 6,16 GB |

O z13 custa 396 MB a mais e quase não muda a vista de zoom 13. Por isso, o corte fica em **z12**. O número ainda vem de soma e amostra, não de um arquivo gerado. O aceite da tarefa é o arquivo real ficar em ≤ 350 MB*.

### Onde o arquivo fica
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| Git ou Git LFS | Tudo em um lugar | O GitHub bloqueia arquivos acima de 100 MiB; LFS tem cota e pesa em cada clone | Alto (histórico) |
| Baixar do build diário no Dockerfile | Nada a publicar | Builds somem em cerca de uma semana; hotlink desencorajado; o corte não existe lá | Baixo |
| **Asset de release do GitHub + `ADD --checksum` no Dockerfile** | **Fora do git; < 2 GiB por arquivo e sem limite de banda declarado; hash fixo; cache de camada; o mesmo link cumpre a oferta da ODbL** | Precisa de rede no primeiro build, como o `npm install` já precisa | **Baixo** |
| Imagem só de dados no GHCR + `COPY --from` | Cache igual; registro já previsto no ADR-0013 | Mais um artefato e um workflow; gratuito "currently", com aviso de 1 mês | Baixo |
| Download na primeira subida, em volume | Imagem leve | Serviço a mais e rede em tempo de execução; atrito com o ADR-0006 | Médio |

**Efeito em `docker compose up --build`:** as imagens base somam 637 MB comprimidos hoje (node 61, nginx 26, postgres 116, SDK .NET 342, aspnet 92). O arquivo soma 45%:

| Conexão | Hoje | Com o arquivo |
|---|---|---|
| 50 Mbit/s | 1,7 min | 2,5 min |
| 10 Mbit/s | 8,5 min | **12,3 min, sem contar a compilação. Aperta a meta de 15 min do PRD** |

As imagens prontas do ADR-0013 aliviam esse caso, porque dispensam o SDK e o node (403 MB).

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
1. **Opção B4.** `maplibre-gl` e `pmtiles` entram com versão exata, e o `FleetMap` carrega em `React.lazy`. Saem `leaflet`, `react-leaflet` e `@types/leaflet`. O restante do Dashboard aparece sem esperar o mapa.
2. **Arquivo do Brasil até z12, sem as camadas cortadas.** Fica no asset de release `basemap-AAAA-MM` e entra na imagem com `ADD --checksum=sha256:… <url> /usr/share/nginx/html/map/br.pmtiles`.
   - Área: polígono largo, escrito à mão, sem derivar de outra base.
   - Geração em script versionado: `pmtiles extract --region --maxzoom=12` e depois a remoção de camadas. O `pmtiles` não filtra camadas, e a saída PMTiles do `tile-join` não foi confirmada. Remover as camadas tile a tile é simples, e foi como medi. A ferramenta fica com o tech-lead.
   - Atualização manual, cerca de 1× por ano*. O nome do tag (`basemap-*`) não pode disparar o release do ADR-0013.
   - Quem desenvolve com `npm run dev` baixa o mesmo arquivo para uma pasta ignorada pelo git. Sem ele, o mapa mostra marcadores sobre fundo liso.
3. **Estilo escrito por nós**, sem dependência de `@protomaps/basemaps`, e sem `sprite`.

   | Camada do arquivo | O que acontece |
   |---|---|
   | `earth` | Entra, cor de fundo |
   | `water` | Entra: áreas sempre; rios só a partir do zoom 10 |
   | `boundaries` | Entra: UF tracejada e país contínuo |
   | `roads` | Entra por tipo: rodovia a partir do zoom 5, principal do 7, média do 10, local do 12. Saem caminhos, trilhos, balsas, túneis e o tipo `other` |
   | `places` | Entra: cidades em todos os zooms, nomes de UF do 4 ao 6, países até o 5 |
   | Nome de via | Só a partir do zoom 14, ao longo da linha |
   | **`landcover`** (vegetação) | **Sai do arquivo.** Também dispensa o crédito da ESA WorldCover |
   | **`landuse`** (matas, parques, áreas urbanas) | **Sai do arquivo.** É o maior peso de z7 a z11 (63% em z10 e z11) |
   | **`buildings`** e **`pois`** | **Saem do arquivo** |
   | Relevo | Não existe no arquivo |

   Os valores de cor das capturas são provisórios e ficam com a ui-ux, em tokens `--ft-map-*`.
4. **Navegação.** Enquadramento inicial pelo Brasil, `maxZoom` 16* e zoom fracionário. Acima de z12, o MapLibre amplia os dados, sem buraco (captura em z15, não versionada). Veículo fora da área do arquivo continua visível, sobre fundo liso.
5. **Tema.** O estilo é uma função de tokens lidos com `useThemeTokens()`, aplicada com `setStyle(…, { diff: true })` e `transition: { duration: 0 }`. Medido na primeira troca: 5 a 6 ms com GPU e 9 a 15 ms sem GPU. Sai o "só CSS" da versão anterior, porque a cor do mapa fica no estilo. `--ft-map-tile-filter` e `.map-tiles-dark` saem.
6. **Capturas do README no tema claro.** Funcionam em headless sem GPU (SwiftShader). Medido: as capturas deste ADR saíram assim. O script espera o evento `idle` do mapa antes de capturar.
7. **Marcadores (H-22).** `Marker` com `element` sendo um `<button>` nosso, com forma por status e `aria-label` gravado por `setAttribute`.
   - Testado em Chrome: o botão recebe foco, e o Enter abre o popup e leva o foco ao botão de fechar.
   - **O que falta, visto no mesmo teste:** o Esc não fecha o popup, e depois do popup o Tab cai no `body`. A T-81 precisa fazer o Esc fechar e devolver o foco ao marcador.
   - Os textos padrão estão em inglês ("Map", "Close popup"): usar a opção `locale` em pt-BR.
   - Conteúdo só por `textContent` e `setDOMContent`, **nunca HTML com dado da API**.
   - Origem e destino aparecem em texto no popup, e a tabela de veículos segue como alternativa com muitos marcadores.
   - A linha de rota não pode depender só de cor. O desenho fica com a ui-ux.
8. **Sem origem externa.** A CSP passa a `img-src 'self' data: blob:`, `connect-src 'self'` e `worker-src 'self'`, sem a exceção de tiles (o ADR-0006 ainda cita a CARTO). Testado com essa política: nenhum erro, e só `127.0.0.1` na aba Network. O worker é servido da nossa origem, com `setWorkerUrl`. Não foi preciso `unsafe-eval`.
9. **Nginx.**
   - **Ligar gzip** para JS, CSS e `application/json`, inclusive o worker. Sem isso, o JS trafega com 2,3 MB.
   - **Não** incluir `.pmtiles` em `gzip_types`: os tiles já vêm comprimidos, e o arquivo depende de requisições de intervalo.
   - Conferir que `.mjs` sai com MIME de JavaScript.
10. **Licença e crédito.** Ver a seção "Licenças".

### O que aparece com cada dado
| Conteúdo | Dados | Backend | Quando |
|---|---|---|---|
| Brasil, ruas, cidades e marcadores com a posição atual | Arquivo + atuais | Não muda | Fase 1 |
| Rastro de 2 h na página do veículo (H-38) | Telemetria | Precisa buscar a janela de 2 h (ver "Pontos para o tech-lead") | M3 |
| **Rotas das entregas em andamento, na demo** | `route` | **Muda: coluna, contrato, trajetos e job** | Fase 2 |
| Trecho já percorrido e trecho restante | `route` + posição | Não muda além da fase 2: o front projeta a posição na linha | Fase 2, se a ui-ux quiser |
| Rotas fora da demo | Não existem | Exige cadastro de entregas, fora de escopo | Sem data: **nenhuma linha é inventada** |

### Rotas (aceita pelo humano em 2026-11-01)
11. **Opção C3, no modelo de dados.** `deliveries.route_path jsonb NULL`, em migração só de expansão.
    - Formato GeoJSON `LineString` (RFC 7946, **`[longitude, latitude]`**), de 2 a 200 pontos*, validado na aplicação. O MapLibre lê esse formato direto, em uma fonte `geojson` com camada `line`.
    - Dado pessoal: **indireto** (entrega → veículo → motorista). Na demo é fictício, e fora dela a coluna fica nula. Receber rota real exige rever a LGPD e a retenção (H-12) em um novo ADR.
12. **Contrato (aditivo, segue ADR-0009 e ADR-0010).**
    - `GET /api/v1/deliveries?status=em_transito&include=route` traz `route: { type: "LineString", coordinates: [...] } | null`, com a paginação por cursor de sempre.
    - Sem `include=route`, o campo não vem. `GET /api/v1/deliveries/{id}` sempre o traz.
    - A autorização não muda (matriz do README). As rotas não mudam durante a entrega, então o front as atualiza a cada 60 s*, à parte das posições.
13. **Trajetos da demo: recurso embutido no backend** (`backend/Demo/corredores.json`).
    - Sequências de sedes de município, escritas à mão, em quantidade suficiente para as 8 entregas em andamento da H-29.
    - **Não copiar geometria do OSM nem usar serviço de rotas:** evita ampliar a obrigação da ODbL ao banco da aplicação e respeita o PRD. Por isso, a linha é o trajeto entre cidades e não segue as ruas do fundo. Com zoom alto, ela vai cortar quarteirões. **O humano precisa saber disso agora que há ruas ao fundo.**
    - O seed copia o corredor para `route_path`. O job interpola sobre os pontos da própria entrega, e assim mapa e simulação não divergem. O teste de distância da H-24 continua valendo.
    - Recomendação para a H-27: retomar o progresso projetando a última posição na rota, sem coluna nova. A escolha final fica com o tech-lead.

## Licenças (lidas na fonte em 2026-11-01)
A malha do IBGE saiu da decisão, então a pendência de licença dela deixa de existir. O polígono do IBGE foi usado só para medir o tamanho e não será distribuído.

| Item | Licença | Obrigação |
|---|---|---|
| Arquivo do mapa (OpenStreetMap, via Protomaps) | **ODbL 1.0** | Crédito e oferta do banco, abaixo |
| Água e terra (osmdata.openstreetmap.de) | ODbL 1.0 | Já coberta |
| Natural Earth, nos níveis baixos | Domínio público | Nenhuma |
| ESA WorldCover (`landcover`) | CC BY 4.0 | **Nenhuma, porque a camada sai** |
| `maplibre-gl`, `pmtiles` | BSD-3-Clause | Aviso no arquivo de licenças de terceiros (ADR-0015 §8) |
| `fflate` (dependência do `pmtiles`) | MIT | Idem |
| Glifos Noto Sans | SIL OFL 1.1 | Incluir o `OFL.txt` |

Regras a cumprir:
1. **Crédito sempre visível no canto do mapa:** "© OpenStreetMap", com link para `openstreetmap.org/copyright`. É o que as diretrizes da OSMF pedem. Usar o controle sem modo compacto, como nas capturas. O crédito é escrito no nosso estilo, não lido do arquivo.
2. **Tratar o arquivo como banco derivado, por cautela.** O Protomaps o chama de *Produced Work*. A diretriz da OSMF, porém, considera banco o que serve à extração dos dados, e o filtro é uma alteração nossa. Tratando como banco, vale a seção 4.4 (o arquivo segue ODbL) e a 4.6 (oferecer a cópia ou o método). O asset público de release, com o script no repositório, cumpre as duas.
3. **O arquivo não entra na licença MIT.** A release leva o aviso de ODbL ao lado do arquivo, e o README deixa claro: código MIT, dados do mapa ODbL. As páginas lidas não tratam diretamente de aplicação MIT distribuída ao lado dos dados. Minha leitura é que a ODbL rege o arquivo e não contamina o código. A FAQ da OSMF avisa que não é aconselhamento jurídico.
4. **Não chamar o arquivo de "Protomaps".** O README deles pede outro nome para forks modificados.
5. **Área de pelo menos um país.** A diretriz de recortes regionais, voltada sobretudo a mapas visuais, só limita o compartilhamento ao recorte se ele tiver ao menos o tamanho de um país. O Brasil atende.

## Falhas
| Falha | O que o usuário vê |
|---|---|
| Arquivo ausente, ou proxy na frente sem suporte a intervalo | Marcadores sobre fundo liso, com aviso discreto. O mapa continua funcionando |
| Chunk do mapa não carrega | Aviso com nova tentativa no painel do mapa; o resto do Dashboard funciona |
| Navegador sem WebGL | Aviso "mapa indisponível neste navegador", e a tabela de veículos segue como alternativa |
| Rotas com erro ou lentas | Marcadores sem linhas e aviso com nova tentativa (H-21). A chamada das rotas não bloqueia a das posições |
| Entrega com `route: null` | Só o marcador; origem e destino em texto no popup |
| Posição ausente ou inválida | Veículo fora do mapa e "sem dado" na tabela (H-21) |
| Asset de release fora do ar no build | O build falha com erro claro, como falharia no `npm install`. Imagens já prontas não são afetadas |

Não há timeout nem circuit breaker de terceiros em tempo de execução, porque nenhuma dependência externa sobra.

## Threat model (STRIDE, fluxos novos)
| Fronteira | Ameaça | Controle |
|---|---|---|
| Navegador → provedor de tiles | **I**: IP e área vista saem para terceiro | Fluxo eliminado; CSP bloqueia qualquer retorno acidental. Testado: a CSP barrou o OpenFreeMap até mesmo a partir do worker |
| Release → build da imagem | **T**: arquivo trocado no asset | `ADD --checksum` com SHA-256 fixo: hash diferente falha o build |
| Conteúdo do OSM → rótulos | **T**: texto malicioso em nome de rua | Rótulo desenhado no WebGL, nunca como HTML. Crédito fixo no estilo, sem TileJSON nem metadado do arquivo como HTML |
| API → marcador e popup | **T**: XSS com texto de placa, origem ou destino | Só `textContent`/`setDOMContent`, `aria-label` por `setAttribute`, `script-src 'self'` |
| API → navegador (`route`) | **I**: trajeto de entrega exposto | Mesma autorização das entregas; `include` explícito |
| Escrita de `route_path` | **D**: geometria enorme | Limite de 200 pontos*; hoje só o seed escreve |
| Arquivo estático | **I**: servido sem login | Dado público, sem risco |
| Arquivo estático | **D**: muitas requisições de intervalo a arquivo grande | Respostas pequenas e sem processamento; `max_ranges` baixo no Nginx |

## Consequências
- **Positivas:**
  - Ruas e cidades ao fundo, com a vegetação eliminada na origem, não só escondida.
  - Sem chave, sem cadastro e sem terceiros em tempo de execução, o que também vale para instalação sem internet.
  - Sai a transferência de IP à OSMF, e quem instala tem uma preocupação a menos de LGPD.
  - O JS inicial cai 45,4 KB, abrindo folga para o resto do produto.
  - Troca de tema muito abaixo dos 100 ms, com ou sem GPU.
  - A H-24 ganha resposta: o trajeto mora na entrega.
- **Negativas:**
  - **O Dashboard baixa 646,7 KB de JS gzip com o mapa aberto, contra 248,2 KB hoje (2,6×).** O orçamento só é cumprido porque mede o JS inicial. Em rede interna pouco importa; em 4G, o mapa aparece segundos depois do restante. A interpretação do MapLibre (1,6 MB de JS) não foi medida em aparelho fraco.
  - **Mais 288 MB na imagem do frontend** e no primeiro download.
  - **Exige WebGL.** Sem ele, não há mapa, só a tabela. A documentação não define a versão mínima, e não testei navegadores antigos.
  - **Dependência nova e com curva de aprendizado:** o time conhece Leaflet, não MapLibre. Versões novas quase toda semana: fixar a versão e atualizar em lote. A T-81 precisa ser refeita, e o foco do popup fica por nossa conta.
  - **Pipeline de dados a manter:** script, release e checksum. Os dados envelhecem até a próxima geração.
  - **O estilo fica preso ao esquema do Protomaps v4.** O arquivo tem hash fixo, então só quebra ao gerar de novo: conferir o estilo a cada geração.
  - **A fonte do mapa é Noto Sans, não IBM Plex** (ADR-0015). O MapLibre exige glifos em formato próprio. Gerá-los em Plex é possível, com um passo a mais; a ui-ux decide se vale.
  - **Menos nomes de rua em zoom alto do que no OpenFreeMap** ([comparação](0016-opcoes.png)). Para "em que rua ele está?", o z12 atende nas vias maiores, e nem sempre nas locais.
  - **No mapa nacional, os veículos parecem parados** (1 px a cada 6 min a 90 km/h). Acelerar violaria a H-25.
  - **Fora da demo não há rotas**, só posições. Na demo, a linha não acompanha as ruas.
  - **As rotas dependem da fila do backend:** T-13 (depende de T-12 e T-09; P2 e P3 já decididas como sim), T-17, T-35 e T-36. A fase 1 chega antes e mostra o mapa ainda sem linhas.
- **Monitorar:**
  - JS inicial e chunk do mapa a cada PR, com orçamento próprio para o chunk: ≤ 460 KB*, somando o worker.
  - Tamanho real do arquivo gerado: ≤ 350 MB*.
  - Aba Network sem nenhuma origem externa.
  - Tempo da primeira execução em 10 Mbit/s, contra a meta de 15 min do PRD.
  - Saúde do `pmtiles` e do MapLibre a cada atualização.

## Como voltar atrás
- **Para a B3:** o arquivo não muda. Troca o renderizador, o estilo e a parte de marcadores. Custo médio, cerca de 1 semana*. É o caminho se os 361 KB pesarem.
- **Para a B2:** troca a fonte e o estilo, porque o esquema é outro (OpenMapTiles). Sai o arquivo, entra uma origem na CSP. Custo baixo.
- **Para z13 ou z10:** só gerar outro arquivo e mudar o hash.

## O que não testei
O Docker está desligado nesta máquina, então isto fica para o aceite da tarefa:
- **`ADD --checksum` com a URL de release**, que redireciona. Conferir também a permissão: de memória, o `ADD` remoto grava o arquivo com `600`, e o Nginx não leria. Usar `--chmod=644`.
- **Nginx respondendo 206** a `curl -r 0-99 …/map/br.pmtiles`. A documentação só implica o suporte a intervalos em arquivo estático, e o teste aqui passou por um servidor meu.
- **O arquivo real cortado.** Medi por soma e amostra; ele não foi gerado.
- **Ordem de Tab entre vários marcadores e popup em React.** O teste de teclado cobriu um marcador com popup de texto.
- **Leitor de tela.** Só conferi foco, Enter e `aria-label` em Chrome.

## Pontos para o tech-lead (a T-81 muda, as tarefas são suas)
- **Fase 1, só frontend:** T-81 sobre MapLibre em chunk, com o aceite "nenhuma origem externa" no lugar de "Network só com `tile.openstreetmap.org`". O DoD-4.9 acompanha. Forma por status, tema e popup continuam. Entram Esc, retorno do foco e `locale` em pt-BR.
- **Trabalho novo:** script e release do arquivo, `ADD` no Dockerfile, gzip e MIME no Nginx, CSP, cópia do worker e dos glifos, e aviso de licença.
- **Testes:** o jsdom não tem WebGL, e o `App.test.tsx` já simula o `FleetMap`. Testar a lógica do estilo à parte, e o mapa de verdade só no script de capturas.
- **Documentos a atualizar na aceitação:** ADR-0015 §4 e "Nenhuma dependência nova para mapa", ADR-0006 (CSP), README dos ADRs (índice, C4, modelo de dados, falhas), README do projeto (linhas 98 e 104) e o nome deste arquivo.
- **Lacuna fora deste ADR:** a H-38 pede 2 h de trajeto. A 5 s, são 1.440 pontos, e o limite da API é de 200 por página (ADR-0010). Falta decidir entre filtrar por período com redução de pontos ou seguir o cursor.
- **Lógica da T-35:** ela "reaproveita" o passeio aleatório atual, que a H-24 proíbe. O job precisa nascer lendo `route_path`, ou a T-35 será refeita.
- **Dependências reais da T-13:** T-12 e T-09. P2 e P3 já foram decididas como sim, então a T-13 não está mais bloqueada por decisão. O plano ainda diz "bloqueada: decisão humana (P3)" na linha 217.

## O que o humano precisa aceitar
1. **Peso:** 646,7 KB de JS gzip com o mapa aberto (hoje, 248,2), sem estourar o orçamento porque o mapa carrega depois. **Se não aceitar:** B3, com ≤ 285,9 KB e biblioteca em manutenção.
2. **Disco:** cerca de 288 MB a mais na imagem e no primeiro build. **Se não aceitar:** B2, sem disco, com IP e área vista saindo para um provedor sem garantia; ou arquivo até z10, com 39 MB e sem ruas locais.
3. **WebGL obrigatório** para ver o mapa.
4. **Dados ODbL ao lado do código MIT**, com crédito sempre visível. Não é aconselhamento jurídico.
5. **A linha da rota na demo não acompanha as ruas do fundo**, e isso agora fica visível com zoom.
6. Números com *: `maxZoom`, 350 MB, 460 KB, 200 pontos, 60 s, renovação anual.

## Fontes
- Medições de 2026-11-01: [build usado](https://build.protomaps.com/20261101.pmtiles); [formato PMTiles e CLI](https://docs.protomaps.com/pmtiles/cli); [retenção dos builds e licença](https://docs.protomaps.com/basemaps/downloads).
- Capturas reais: tema claro, tema escuro e limite de zoom (não versionadas), [comparação das opções](0016-opcoes.png). Sem commit.
- Licenças: [copyright do OSM](https://www.openstreetmap.org/copyright); [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/); [atribuição](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines); [Produced Work](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Produced_Work_-_Guideline); [recortes regionais](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Regional_Cuts_-_Guideline); [FAQ da OSMF](https://osmfoundation.org/wiki/Licence/Licence_and_Legal_FAQ); [README](https://github.com/protomaps/basemaps/blob/main/README.md), [LICENSE](https://github.com/protomaps/basemaps/blob/main/LICENSE.md) e [LICENSE_DATA](https://github.com/protomaps/basemaps/blob/main/LICENSE_DATA.md) do Protomaps; [fontes](https://github.com/protomaps/basemaps-assets/blob/main/fonts/OFL.txt); [termos da Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/).
- Bibliotecas: [maplibre-gl](https://www.npmjs.com/package/maplibre-gl); [CSP do MapLibre](https://maplibre.org/maplibre-gl-js/docs/); [pmtiles](https://www.npmjs.com/package/pmtiles); [protomaps-leaflet](https://github.com/protomaps/protomaps-leaflet).
- Provedores: [OpenFreeMap](https://openfreemap.org/), [privacidade](https://openfreemap.org/privacy/), [termos](https://openfreemap.org/tos/), [autohospedagem](https://github.com/hyperknot/openfreemap/blob/main/docs/self_hosting.md); [VersaTiles](https://docs.versatiles.org/guides/use_tiles_versatiles_org.html); [política de tiles da OSMF](https://operations.osmfoundation.org/policies/tiles/); [termos dos basemaps da CARTO](https://carto.com/legal/basemap-terms/).
- Distribuição: [releases do GitHub](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases); [arquivos grandes no GitHub](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github); [GitHub Packages](https://docs.github.com/en/billing/concepts/product-billing/github-packages); [`ADD --checksum`](https://docs.docker.com/reference/dockerfile/#add); [`max_ranges` do Nginx](https://nginx.org/en/docs/http/ngx_http_core_module.html#max_ranges).
- [RFC 7946, GeoJSON](https://www.rfc-editor.org/rfc/rfc7946).

Próximo: tech-lead, depois do aceite do humano | entradas: este ADR e `assets/0016-*.png`
