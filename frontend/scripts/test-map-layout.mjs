import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.resolve(__dirname, '../dist')
const PORT = 5174

if (!fs.existsSync(DIST_DIR)) {
  console.error(
    `Erro: diretório de build não encontrado em ${DIST_DIR}. Rode 'npm run build' primeiro.`,
  )
  process.exit(1)
}

function findBrowserBinary() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean)

  for (const bin of candidates) {
    if (fs.existsSync(bin)) return bin
  }
  return null
}

const browserPath = findBrowserBinary()
if (!browserPath) {
  console.error('Navegador Chromium/Chrome/Edge não encontrado no sistema.')
  process.exit(1)
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
}

// 10 veículos da demonstração (conforme SeedDemonstracao.cs)
const DEMO_VEHICLES = [
  {
    id: 'v1',
    plate: 'ABC-1234',
    model: 'Volvo FH 540',
    driverName: 'Carlos Silva',
    latitude: -23.5505,
    longitude: -46.6333,
    speed: 72.5,
    fuelLevel: 68,
    status: 'em_rota',
    updatedAt: '2026-11-01T22:00:00Z',
  },
  {
    id: 'v2',
    plate: 'DEF-5678',
    model: 'Scania R450',
    driverName: 'Maria Oliveira',
    latitude: -22.9068,
    longitude: -43.1729,
    speed: 85.0,
    fuelLevel: 45,
    status: 'em_rota',
    updatedAt: '2026-11-01T22:00:00Z',
  },
  {
    id: 'v3',
    plate: 'GHI-9012',
    model: 'Mercedes Actros',
    driverName: 'João Santos',
    latitude: -25.4284,
    longitude: -49.2733,
    speed: 0,
    fuelLevel: 92,
    status: 'parado',
    updatedAt: '2026-11-01T22:00:00Z',
  },
  {
    id: 'v4',
    plate: 'JKL-3456',
    model: 'DAF XF',
    driverName: 'Ana Costa',
    latitude: -19.9167,
    longitude: -43.9345,
    speed: 63.2,
    fuelLevel: 55,
    status: 'em_rota',
    updatedAt: '2026-11-01T22:00:00Z',
  },
  {
    id: 'v5',
    plate: 'MNO-7890',
    model: 'Iveco Stralis',
    driverName: 'Pedro Lima',
    latitude: -23.5505,
    longitude: -46.6333,
    speed: 0,
    fuelLevel: 30,
    status: 'manutencao',
    updatedAt: '2026-11-01T22:00:00Z',
  },
  {
    id: 'v6',
    plate: 'PQR-1122',
    model: 'Volvo VM 270',
    driverName: 'Fernanda Souza',
    latitude: -21.1767,
    longitude: -47.8208,
    speed: 91.0,
    fuelLevel: 72,
    status: 'em_rota',
    updatedAt: '2026-11-01T22:00:00Z',
  },
  {
    id: 'v7',
    plate: 'STU-3344',
    model: 'Scania P320',
    driverName: 'Ricardo Alves',
    latitude: -30.0346,
    longitude: -51.2177,
    speed: 0,
    fuelLevel: 88,
    status: 'parado',
    updatedAt: '2026-11-01T22:00:00Z',
  },
  {
    id: 'v8',
    plate: 'VWX-5566',
    model: 'Mercedes Atego',
    driverName: 'Juliana Rocha',
    latitude: -15.7801,
    longitude: -47.9292,
    speed: 55.8,
    fuelLevel: 61,
    status: 'em_rota',
    updatedAt: '2026-11-01T22:00:00Z',
  },
  {
    id: 'v9',
    plate: 'YZA-7788',
    model: 'MAN TGX',
    driverName: 'Lucas Ferreira',
    latitude: -12.9714,
    longitude: -38.5124,
    speed: 78.3,
    fuelLevel: 39,
    status: 'em_rota',
    updatedAt: '2026-11-01T22:00:00Z',
  },
  {
    id: 'v10',
    plate: 'BCD-9900',
    model: 'Ford Cargo',
    driverName: 'Camila Dias',
    latitude: -3.7172,
    longitude: -38.5433,
    speed: 0,
    fuelLevel: 95,
    status: 'parado',
    updatedAt: '2026-11-01T22:00:00Z',
  },
  {
    id: 'v11',
    plate: 'SEM-0000',
    model: 'Mercedes Accelo',
    driverName: 'Sem Posição',
    latitude: null,
    longitude: null,
    speed: null,
    fuelLevel: null,
    status: 'parado',
    updatedAt: '2026-11-01T22:00:00Z',
  },
]

// Tile vetorial mock PBF codificado contendo feição válida na camada 'water' (34 bytes)
const MOCK_TILE_PBF_BASE64 = 'GiIKBXdhdGVyeAIogCASFAgBGAMiDgkAABqAQAAAgED/PwAP'

let fundoAtivo = false

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const pathname = url.pathname

  if (pathname === '/test-control/set-fundo') {
    fundoAtivo = url.searchParams.get('ativo') === 'true'
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ fundoAtivo }))
    return
  }

  if (pathname === '/config/mapa.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    if (fundoAtivo) {
      // Com fundo: URLs do provedor OpenFreeMap, interceptadas localmente via CDP (zero chamadas externas)
      res.end(
        JSON.stringify({
          desligado: false,
          tilejsonUrl: 'https://tiles.openfreemap.org/planet',
          glyphsUrl: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
          styleUrl: '',
          credit:
            'OpenFreeMap|https://openfreemap.org;© OpenMapTiles|https://www.openmaptiles.org/',
        }),
      )
    } else {
      // Sem fundo: contingência pura desligada (0 fontes de dados)
      res.end(
        JSON.stringify({
          desligado: true,
          tilejsonUrl: '',
          glyphsUrl: '',
          styleUrl: '',
          credit: 'OpenFreeMap|https://openfreemap.org',
        }),
      )
    }
    return
  }

  if (pathname === '/api/vehicles') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(DEMO_VEHICLES))
    return
  }

  if (pathname === '/api/deliveries') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify([
        {
          id: 'd1',
          vehicleId: 'v1',
          vehiclePlate: 'ABC-1234',
          origin: 'São Paulo, SP',
          destination: 'Rio de Janeiro, RJ',
          status: 'em_transito',
        },
        {
          id: 'd2',
          vehicleId: 'v2',
          vehiclePlate: 'DEF-5678',
          origin: 'Rio de Janeiro, RJ',
          destination: 'Belo Horizonte, MG',
          status: 'em_transito',
        },
      ]),
    )
    return
  }

  if (pathname === '/api/dashboard/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        totalVehicles: 10,
        enRoute: 6,
        stopped: 3,
        maintenance: 1,
        totalDeliveries: 2,
        delivered: 0,
        inTransit: 2,
        pending: 0,
        cancelled: 0,
        avgSpeed: 44.5,
        deliveryRate: 100,
        deliveriesPerDay: [],
      }),
    )
    return
  }

  let filePath = path.join(DIST_DIR, pathname === '/' ? 'index.html' : pathname)
  if (!fs.existsSync(filePath)) {
    filePath = path.join(DIST_DIR, 'index.html')
  }

  const ext = path.extname(filePath)
  const mime = MIME_TYPES[ext] || 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': mime })
  fs.createReadStream(filePath).pipe(res)
})

server.listen(PORT, async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-map-layout-'))
  const cdpPort = 9444

  const browserProc = spawn(browserPath, [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${tmpDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    `http://127.0.0.1:${PORT}/`,
  ])

  let allPassed = true

  try {
    let list = null
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 200))
      try {
        const resp = await fetch(`http://127.0.0.1:${cdpPort}/json/list`)
        list = await resp.json()
        if (list && list.length > 0) break
      } catch {}
    }

    if (!list || list.length === 0) {
      throw new Error('Não foi possível conectar à sessão CDP do navegador.')
    }

    const pageTarget = list.find((t) => t.type === 'page') || list[0]
    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl)

    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = reject
    })

    let id = 1
    const callbacks = new Map()
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg)
        callbacks.delete(msg.id)
      }

      if (msg.method === 'Target.attachedToTarget') {
        sendCommand(
          'Fetch.enable',
          { patterns: [{ urlPattern: '*tiles.openfreemap.org*' }] },
          msg.params.sessionId,
        )
      }

      if (msg.method === 'Fetch.requestPaused') {
        const url = msg.params.request.url
        const reqId = msg.params.requestId
        const sessId = msg.sessionId

        if (
          url.includes('tiles.openfreemap.org') &&
          url.includes('/planet') &&
          !url.includes('.pbf')
        ) {
          // TileJSON local mock
          const tileJsonBody = Buffer.from(
            JSON.stringify({
              tilejson: '3.0.0',
              name: 'openfreemap',
              tiles: ['https://tiles.openfreemap.org/planet/20261025_080012_pt/{z}/{x}/{y}.pbf'],
              minzoom: 0,
              maxzoom: 14,
              bounds: [-180, -85.0511, 180, 85.0511],
            }),
          ).toString('base64')
          sendCommand(
            'Fetch.fulfillRequest',
            {
              requestId: reqId,
              responseCode: 200,
              responseHeaders: [
                { name: 'Content-Type', value: 'application/json' },
                { name: 'Access-Control-Allow-Origin', value: '*' },
              ],
              body: tileJsonBody,
            },
            sessId,
          )
        } else if (url.includes('tiles.openfreemap.org') && url.includes('/fonts/')) {
          // Glifos vazios mock (200 OK sem conteúdo de glifo)
          sendCommand(
            'Fetch.fulfillRequest',
            {
              requestId: reqId,
              responseCode: 200,
              responseHeaders: [
                { name: 'Content-Type', value: 'application/x-protobuf' },
                { name: 'Access-Control-Allow-Origin', value: '*' },
              ],
              body: '',
            },
            sessId,
          )
        } else if (url.includes('tiles.openfreemap.org') && url.endsWith('.pbf')) {
          // Tile vetorial mock com geometria válida na camada water
          sendCommand(
            'Fetch.fulfillRequest',
            {
              requestId: reqId,
              responseCode: 200,
              responseHeaders: [
                { name: 'Content-Type', value: 'application/x-protobuf' },
                { name: 'Access-Control-Allow-Origin', value: '*' },
              ],
              body: MOCK_TILE_PBF_BASE64,
            },
            sessId,
          )
        } else {
          sendCommand('Fetch.continueRequest', { requestId: reqId }, sessId)
        }
      }
    }

    function sendCommand(method, params = {}, sessionId) {
      return new Promise((resolve) => {
        const cmdId = id++
        callbacks.set(cmdId, resolve)
        const payload = { id: cmdId, method, params }
        if (sessionId) payload.sessionId = sessionId
        ws.send(JSON.stringify(payload))
      })
    }

    await sendCommand('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
    })
    await sendCommand('Fetch.enable', { patterns: [{ urlPattern: '*tiles.openfreemap.org*' }] })
    await sendCommand('Page.enable')
    await sendCommand('Runtime.enable')

    async function aguardarMapaPronto(comFundo = false) {
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 200))
        const res = await sendCommand('Runtime.evaluate', {
          expression: comFundo
            ? 'Boolean(window.__fleetMap && window.__fleetMap.isSourceLoaded && window.__fleetMap.isSourceLoaded("base") && document.querySelectorAll(".ft-map-marker").length === 10)'
            : 'Boolean(window.__fleetMap && document.querySelectorAll(".ft-map-marker").length === 10)',
          returnByValue: true,
        })
        if (res.result?.result?.value) return true
      }
      return false
    }

    const mapaInicializado = await aguardarMapaPronto(false)
    if (!mapaInicializado) {
      console.error('Falha ao inicializar o mapa com os 10 veículos.')
      allPassed = false
    }

    const viewports = [
      { name: '1440x900', width: 1440, height: 900 },
      { name: '390x844', width: 390, height: 844 },
    ]
    const themes = ['dark', 'light']
    const fundos = [
      { name: 'sem fundo', ativo: false },
      { name: 'com fundo', ativo: true },
    ]

    console.log('================================================================================')
    console.log('PROVA DE LAYOUT E POSICIONAMENTO REAL DE MARCADORES (MAPLIBRE GL / ZERO PROVEDOR)')
    console.log('================================================================================')

    for (const fundo of fundos) {
      // Configura modo de fundo no servidor e recarrega a página para instanciar mapa com o novo config
      await fetch(`http://127.0.0.1:${PORT}/test-control/set-fundo?ativo=${fundo.ativo}`)
      await sendCommand('Page.reload', { ignoreCache: true })
      await aguardarMapaPronto(fundo.ativo)

      for (const vp of viewports) {
        for (const th of themes) {
          await sendCommand('Emulation.setDeviceMetricsOverride', {
            width: vp.width,
            height: vp.height,
            deviceScaleFactor: 1,
            mobile: vp.width < 500,
          })

          await sendCommand('Runtime.evaluate', {
            expression: `document.documentElement.setAttribute('data-theme', '${th}');`,
          })

          await sendCommand('Runtime.evaluate', {
            expression: 'window.dispatchEvent(new Event("resize"));',
          })

          await new Promise((r) => setTimeout(r, 300))

          // 1. Verificação de dimensões do container e de cada marcador (posição real vs projeção map.project)
          const res = await sendCommand('Runtime.evaluate', {
            expression: `JSON.stringify((() => {
              const map = window.__fleetMap;
              if (!map) return { error: 'Mapa ausente' };
              const container = document.querySelector('.map-container');
              const canvasContainer = document.querySelector('.maplibregl-canvas-container');
              const canvas = document.querySelector('canvas.maplibregl-canvas');
              const markers = Array.from(document.querySelectorAll('.ft-map-marker'));

              const cStyle = container ? window.getComputedStyle(container) : null;
              const cRect = container ? container.getBoundingClientRect() : null;
              const ccRect = canvasContainer ? canvasContainer.getBoundingClientRect() : null;
              const cvRect = canvas ? canvas.getBoundingClientRect() : null;

              const marcadoresInfo = markers.map((btn, index) => {
                const bRect = btn.getBoundingClientRect();
                const bStyle = window.getComputedStyle(btn);
                const lat = parseFloat(btn.getAttribute('data-lat') || '0');
                const lng = parseFloat(btn.getAttribute('data-lng') || '0');
                const plate = btn.getAttribute('data-plate') || ('#' + index);

                // Centro real no sistema de coordenadas do container do mapa
                const realX = bRect.left + bRect.width / 2 - cRect.left;
                const realY = bRect.top + bRect.height / 2 - cRect.top;

                // Posição projetada esperada pelo MapLibre
                const proj = map.project([lng, lat]);
                const diffX = Math.abs(realX - proj.x);
                const diffY = Math.abs(realY - proj.y);

                // Marcador inteiramente dentro da área visível do container do mapa (sem ser cortado, ADR-0016 / T-94)
                const dentro =
                  bRect.left >= cRect.left &&
                  bRect.right <= cRect.right &&
                  bRect.top >= cRect.top &&
                  bRect.bottom <= cRect.bottom;

                return {
                  index,
                  plate,
                  computedPosition: bStyle.position,
                  computedDisplay: bStyle.display,
                  realX: Math.round(realX * 10) / 10,
                  realY: Math.round(realY * 10) / 10,
                  projX: Math.round(proj.x * 10) / 10,
                  projY: Math.round(proj.y * 10) / 10,
                  diffX: Math.round(diffX * 10) / 10,
                  diffY: Math.round(diffY * 10) / 10,
                  dentro,
                  // Tolerância estrita de poucos pixels (subpixel/arredondamento <= 2.5px) e dentro da área visível
                  ok: diffX <= 2.5 && diffY <= 2.5 && dentro,
                };
              });

              return {
                computedHeight: cStyle ? cStyle.height : null,
                boundingHeight: cRect ? Math.round(cRect.height) : 0,
                boundingWidth: cRect ? Math.round(cRect.width) : 0,
                canvasContainerHeight: ccRect ? Math.round(ccRect.height) : 0,
                canvasContainerWidth: ccRect ? Math.round(ccRect.width) : 0,
                markerCount: markers.length,
                marcadores: marcadoresInfo,
                allMarkersInside: marcadoresInfo.length === 10 && marcadoresInfo.every(m => m.dentro),
                allMarkersOk: marcadoresInfo.length === 10 && marcadoresInfo.every(m => m.ok),
              };
            })())`,
            returnByValue: true,
          })

          let val = null
          try {
            val =
              typeof res.result?.result?.value === 'string'
                ? JSON.parse(res.result.result.value)
                : res.result?.value
          } catch {}

          const parsedHeight = parseInt(val?.computedHeight || '0', 10)
          const heightOk = parsedHeight >= 300
          const markersCountOk = (val?.markerCount || 0) === 10
          const markersPosOk = Boolean(val?.allMarkersOk)
          const markersInsideOk = Boolean(val?.allMarkersInside)

          // 0. Verificação do fundo cartográfico e das fontes de dados (ADR-0016 / Defeito 2)
          const resFundo = await sendCommand('Runtime.evaluate', {
            expression: `JSON.stringify((() => {
              const map = window.__fleetMap;
              if (!map) return { error: 'Mapa ausente' };
              const style = map.getStyle ? map.getStyle() : null;
              const sources = style ? Object.keys(style.sources || {}) : [];
              const layers = style ? (style.layers || []) : [];
              const isBaseLoaded = typeof map.isSourceLoaded === 'function' ? map.isSourceLoaded('base') : false;
              const isLoaded = typeof map.loaded === 'function' ? map.loaded() : false;
              const estadoFundo = document.querySelector('.fleet-map')?.getAttribute('data-estado-fundo') || '';
              return {
                sources,
                sourceCount: sources.length,
                layerCount: layers.length,
                isBaseLoaded,
                isLoaded,
                estadoFundo,
              };
            })())`,
            returnByValue: true,
          })

          let valFundo = null
          try {
            valFundo =
              typeof resFundo.result?.result?.value === 'string'
                ? JSON.parse(resFundo.result.result.value)
                : resFundo.result?.value
          } catch {}

          let fundoOk = false
          if (fundo.ativo) {
            // No modo com fundo:
            // - Deve ter fonte de dados 'base' carregada (> 0 fontes)
            // - Mais de 1 camada estilizada
            // - Estado pronto
            // Teste falha quando não há fundo desenhado!
            fundoOk =
              Boolean(valFundo) &&
              valFundo.sourceCount > 0 &&
              valFundo.sources.includes('base') &&
              valFundo.isBaseLoaded &&
              valFundo.estadoFundo === 'pronto' &&
              valFundo.layerCount > 1
          } else {
            // No modo sem fundo: 0 fontes de dados e estado desligado
            fundoOk =
              Boolean(valFundo) &&
              valFundo.sourceCount === 0 &&
              valFundo.estadoFundo === 'desligado' &&
              valFundo.layerCount === 1
          }

          if (!heightOk || !markersCountOk || !markersPosOk || !markersInsideOk || !fundoOk) {
            allPassed = false
          }

          console.log(`\nCenário: ${vp.name} | Tema: ${th} | Fundo: ${fundo.name}`)
          console.log(
            `  - Fundo cartográfico (${fundo.name}): ${
              fundoOk
                ? fundo.ativo
                  ? `OK (fonte "base" carregada, ${valFundo?.sourceCount} fonte(s), ${valFundo?.layerCount} camadas, estado pronto)`
                  : 'OK (0 fontes de dados, 1 camada background, estado desligado)'
                : `FALHA: ${fundo.ativo ? 'FUNDO NÃO DESENHADO' : 'FONTE INESPERADA EM MODO DESLIGADO'} (${JSON.stringify(valFundo)})`
            }`,
          )
          console.log(
            `  - .map-container: ${val?.boundingWidth}x${val?.boundingHeight} px -> ${heightOk ? 'OK' : 'FALHA'}`,
          )
          console.log(
            `  - .maplibregl-canvas-container: ${val?.canvasContainerWidth}x${val?.canvasContainerHeight} px`,
          )
          console.log(
            `  - Vista inicial: todos os marcadores dentro da área útil (${val?.markerCount}/10): ${markersInsideOk ? 'TODOS DENTRO DA ÁREA DO MAPA' : 'FALHA: MARCADORES FORA DA ÁREA OU CORTADOS'}`,
          )
          console.log(
            `  - Alinhamento de projeção (${val?.markerCount}/10): ${markersPosOk ? 'TODOS NA POSIÇÃO CORRETA' : 'FALHA DE ALINHAMENTO'}`,
          )

          if (val?.marcadores) {
            val.marcadores.forEach((m) => {
              const statusStr = m.ok ? 'OK' : !m.dentro ? 'CORTADO/FORA' : 'DESLOCADO'
              console.log(
                `      #${m.index} ${m.plate}: pos=(${m.realX}, ${m.realY}) proj=(${m.projX}, ${m.projY}) dentro=${m.dentro ? 'SIM' : 'NÃO'} -> ${statusStr}`,
              )
            })
          }

          // 2. Teste de Zoom e Arraste (Pan)
          await sendCommand('Runtime.evaluate', {
            expression: `(() => {
              const map = window.__fleetMap;
              map.zoomTo(map.getZoom() + 1, { duration: 0 });
              map.panBy([75, 45], { duration: 0 });
            })()`,
          })

          await new Promise((r) => setTimeout(r, 250))

          const resAposInteracao = await sendCommand('Runtime.evaluate', {
            expression: `JSON.stringify((() => {
              const map = window.__fleetMap;
              const container = document.querySelector('.map-container');
              const cRect = container.getBoundingClientRect();
              const markers = Array.from(document.querySelectorAll('.ft-map-marker'));

              const marcadores = markers.map((btn, index) => {
                const bRect = btn.getBoundingClientRect();
                const lat = parseFloat(btn.getAttribute('data-lat') || '0');
                const lng = parseFloat(btn.getAttribute('data-lng') || '0');
                const realX = bRect.left + bRect.width / 2 - cRect.left;
                const realY = bRect.top + bRect.height / 2 - cRect.top;
                const proj = map.project([lng, lat]);
                const diffX = Math.abs(realX - proj.x);
                const diffY = Math.abs(realY - proj.y);
                return {
                  index,
                  ok: diffX <= 2.5 && diffY <= 2.5,
                  diffX: Math.round(diffX * 10) / 10,
                  diffY: Math.round(diffY * 10) / 10,
                };
              });

              return {
                allOk: marcadores.length === 10 && marcadores.every(m => m.ok),
                falhas: marcadores.filter(m => !m.ok),
              };
            })())`,
            returnByValue: true,
          })

          let valInteracao = null
          try {
            valInteracao =
              typeof resAposInteracao.result?.result?.value === 'string'
                ? JSON.parse(resAposInteracao.result.result.value)
                : resAposInteracao.result?.value
          } catch {}

          if (!valInteracao?.allOk) {
            allPassed = false
            console.log(
              `  - Pós Zoom e Arraste: FALHA (${valInteracao?.falhas?.length || 0} marcadores deslocados)`,
            )
          } else {
            console.log(
              '  - Pós Zoom e Arraste: OK (todos os 10 marcadores acompanharam a projeção)',
            )
          }

          // Restaura o enquadramento inicial para o próximo cenário (ADR-0016 / T-94)
          await sendCommand('Runtime.evaluate', {
            expression: `(() => {
              if (window.__fleetMapEnquadrar) {
                window.__fleetMapEnquadrar();
              }
            })()`,
          })
          await new Promise((r) => setTimeout(r, 200))
        }
      }
    }

    // 3. Teste de Acessibilidade: Abrir e Fechar Popup e Foco por Teclado
    console.log(
      '\n================================================================================',
    )
    console.log('VERIFICAÇÃO DE INTERATIVIDADE: POPUP E FOCO POR TECLADO (WCAG 2.2 AA)')
    console.log('================================================================================')

    const resAcessibilidade = await sendCommand('Runtime.evaluate', {
      expression: `JSON.stringify((() => {
        const markers = Array.from(document.querySelectorAll('.ft-map-marker'));
        if (markers.length < 2) return { error: 'Marcadores insuficientes' };

        const m0 = markers[0];
        const m1 = markers[1];

        // Passo 1: Foco inicial no marcador #0
        m0.focus();
        const focoInicialOk = document.activeElement === m0;

        // Passo 2: Abrir popup via clique
        m0.click();
        const popup = document.querySelector('.ft-map-popup');
        const popupAbriu = Boolean(popup && popup.parentElement);

        // Passo 3: Foco capturado pelo botão de fechar do popup
        const closeBtn = popup ? popup.querySelector('.maplibregl-popup-close-button') : null;
        const closeFocado = document.activeElement === closeBtn;

        // Passo 4: Fechar via tecla Escape
        if (closeBtn) {
          closeBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        }
        const popupFechou = !document.querySelector('.ft-map-popup');

        // Passo 5: Foco devolvido ao marcador original
        const focoRetornou = document.activeElement === m0;

        // Passo 6: Tab no popup navega para o próximo marcador
        m0.click();
        const popupTab = document.querySelector('.ft-map-popup');
        const closeBtnTab = popupTab ? popupTab.querySelector('.maplibregl-popup-close-button') : null;
        let tabAcessivelOk = false;
        if (closeBtnTab) {
          closeBtnTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
          tabAcessivelOk = document.activeElement === m1;
        }

        // Limpeza: fecha qualquer popup remanescente
        const fecharRemanescente = document.querySelector('.maplibregl-popup-close-button');
        if (fecharRemanescente) {
          fecharRemanescente.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        }

        return {
          focoInicialOk,
          popupAbriu,
          closeFocado,
          popupFechou,
          focoRetornou,
          tabAcessivelOk,
          allOk: focoInicialOk && popupAbriu && closeFocado && popupFechou && focoRetornou && tabAcessivelOk,
        };
      })())`,
      returnByValue: true,
    })

    let valA11y = null
    try {
      valA11y =
        typeof resAcessibilidade.result?.result?.value === 'string'
          ? JSON.parse(resAcessibilidade.result.result.value)
          : resAcessibilidade.result?.value
    } catch {}

    if (!valA11y?.allOk) {
      allPassed = false
      console.log('Falha na interação de acessibilidade / popup:', valA11y)
    } else {
      console.log('  - Foco inicial no marcador: OK')
      console.log('  - Abertura de popup por clique/teclado: OK')
      console.log('  - Foco retido no botão Fechar do popup: OK')
      console.log('  - Fechamento com tecla Escape: OK')
      console.log('  - Foco retornado ao marcador de origem: OK')
      console.log('  - Navegação Tab entre marcadores acessíveis: OK')
    }

    // 4. Teste de Veículo sem Posição (T-42 / Achado 1)
    console.log(
      '\n================================================================================',
    )
    console.log('VERIFICAÇÃO DE VEÍCULO SEM POSIÇÃO (COORDENADAS NULAS) - MAPA E TABELA')
    console.log('================================================================================')

    // Verifica que o veículo v11 não possui marcador no mapa
    const resVeiculoSemPos = await sendCommand('Runtime.evaluate', {
      expression: `JSON.stringify((() => {
        const markerV11 = document.querySelector('[data-vehicle-id="v11"]');
        const totalMarkers = document.querySelectorAll('.ft-map-marker').length;
        return {
          semMarcadorNoMapa: markerV11 === null,
          totalMarkers,
        };
      })())`,
      returnByValue: true,
    })

    let valVeiculoSemPos = null
    try {
      valVeiculoSemPos =
        typeof resVeiculoSemPos.result?.result?.value === 'string'
          ? JSON.parse(resVeiculoSemPos.result.result.value)
          : resVeiculoSemPos.result?.value
    } catch {}

    const mapaSemPosOk = Boolean(
      valVeiculoSemPos?.semMarcadorNoMapa && valVeiculoSemPos?.totalMarkers === 10,
    )
    if (!mapaSemPosOk) {
      allPassed = false
      console.log('  - Mapa com veículo sem posição: FALHA', valVeiculoSemPos)
    } else {
      console.log(
        '  - Veículo sem posição não possui marcador no mapa (10 marcadores exibidos): OK',
      )
    }

    // Navega para /vehicles para verificar a tabela de veículos
    await sendCommand('Page.navigate', { url: `http://127.0.0.1:${PORT}/vehicles` })
    await new Promise((r) => setTimeout(r, 600))

    const resTabela = await sendCommand('Runtime.evaluate', {
      expression: `JSON.stringify((() => {
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        const rowV11 = rows.find(r => r.textContent.includes('SEM-0000'));
        if (!rowV11) return { error: 'Linha do veículo SEM-0000 não encontrada' };
        const cells = Array.from(rowV11.querySelectorAll('td')).map(td => td.textContent.trim());
        // Coluna 3: Latitude, Coluna 4: Longitude, Coluna 5: Velocidade, Coluna 6: Combustível
        const latCell = cells[3];
        const lngCell = cells[4];
        const speedCell = cells[5];
        const fuelCell = cells[6];
        const semDadoOk =
          latCell === 'sem dado' &&
          lngCell === 'sem dado' &&
          speedCell === 'sem dado' &&
          fuelCell === 'sem dado';
        const markerV11 = document.querySelector('[data-vehicle-id="v11"]');
        const fuelBarV11 = rowV11.querySelector('.fuel-bar');
        return {
          encontrado: true,
          latCell,
          lngCell,
          speedCell,
          fuelCell,
          semDadoOk: semDadoOk && fuelBarV11 === null,
          semMarcadorNoMapa: markerV11 === null,
        };
      })())`,
      returnByValue: true,
    })

    let valTabela = null
    try {
      valTabela =
        typeof resTabela.result?.result?.value === 'string'
          ? JSON.parse(resTabela.result.result.value)
          : resTabela.result?.value
    } catch {}

    if (!valTabela?.semDadoOk || !valTabela?.semMarcadorNoMapa) {
      allPassed = false
      console.log('  - Tabela /vehicles com veículo sem posição: FALHA', valTabela)
    } else {
      console.log(
        '  - Tabela /vehicles exibe "sem dado" para latitude, longitude, velocidade e combustível nulos (sem barra falsa): OK',
      )
      console.log('  - Mapa em /vehicles sem marcador para o veículo nulo: OK')
    }

    console.log(
      '\n================================================================================',
    )
    if (allPassed) {
      console.log(
        'RESULTADO: SUCESSO - Todas as medidas e posicionamentos atendem aos critérios em todos os cenários.',
      )
    } else {
      console.error(
        'RESULTADO: FALHA - Pelo menos um cenário não atingiu as medidas mínimas ou apresentou desvio de projeção.',
      )
    }
    console.log(
      '================================================================================\n',
    )

    ws.close()
  } catch (err) {
    console.error('Erro durante o teste de layout:', err)
    allPassed = false
  } finally {
    browserProc.kill()
    server.close()
    setTimeout(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      } catch {}
      process.exit(allPassed ? 0 : 1)
    }, 500)
  }
})
