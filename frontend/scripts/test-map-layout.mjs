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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const pathname = url.pathname

  if (pathname === '/config/mapa.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        desligado: true,
        tilejsonUrl: '',
        glyphsUrl: '',
        styleUrl: '',
        credit: 'OpenFreeMap|https://openfreemap.org',
      }),
    )
    return
  }

  if (pathname === '/api/vehicles') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify([
        {
          id: 'v1',
          plate: 'BRA-2E19',
          model: 'Volvo FH 540',
          driverName: 'Carlos Silva',
          latitude: -23.5505,
          longitude: -46.6333,
          speed: 82,
          fuelLevel: 78,
          status: 'em_rota',
          updatedAt: '2026-11-01T22:00:00Z',
        },
        {
          id: 'v2',
          plate: 'RIO-1A23',
          model: 'Scania R450',
          driverName: 'Ana Souza',
          latitude: -22.9068,
          longitude: -43.1729,
          speed: 0,
          fuelLevel: 45,
          status: 'parado',
          updatedAt: '2026-11-01T22:00:00Z',
        },
      ]),
    )
    return
  }

  if (pathname === '/api/deliveries') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify([]))
    return
  }

  if (pathname === '/api/dashboard/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        totalVehicles: 2,
        enRoute: 1,
        stopped: 1,
        maintenance: 0,
        totalDeliveries: 0,
        delivered: 0,
        inTransit: 0,
        pending: 0,
        cancelled: 0,
        avgSpeed: 41,
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
    }

    function sendCommand(method, params = {}) {
      return new Promise((resolve) => {
        const cmdId = id++
        callbacks.set(cmdId, resolve)
        ws.send(JSON.stringify({ id: cmdId, method, params }))
      })
    }

    await sendCommand('Page.enable')
    await sendCommand('Runtime.enable')

    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 300))
      const res = await sendCommand('Runtime.evaluate', {
        expression: 'Boolean(document.querySelector(".map-container"))',
        returnByValue: true,
      })
      if (res.result?.result?.value) break
    }

    await new Promise((r) => setTimeout(r, 1000))

    const viewports = [
      { name: '1440x900', width: 1440, height: 900 },
      { name: '390x844', width: 390, height: 844 },
    ]
    const themes = ['dark', 'light']

    console.log('================================================================================')
    console.log('PROVA DE LAYOUT EM NAVEGADOR REAL (HEADLESS CHROMIUM / ZERO NOVAS DEPENDÊNCIAS)')
    console.log('================================================================================')

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

        await new Promise((r) => setTimeout(r, 400))

        const res = await sendCommand('Runtime.evaluate', {
          expression: `JSON.stringify((() => {
            const container = document.querySelector('.map-container');
            const canvasContainer = document.querySelector('.maplibregl-canvas-container');
            const canvas = document.querySelector('canvas.maplibregl-canvas');
            const fleetMap = document.querySelector('.fleet-map');
            const markers = document.querySelectorAll('.ft-map-marker');
            const cStyle = container ? window.getComputedStyle(container) : null;
            const cRect = container ? container.getBoundingClientRect() : null;
            const ccRect = canvasContainer ? canvasContainer.getBoundingClientRect() : null;
            const cvRect = canvas ? canvas.getBoundingClientRect() : null;
            const fmRect = fleetMap ? fleetMap.getBoundingClientRect() : null;
            return {
              className: container ? container.className : null,
              computedHeight: cStyle ? cStyle.height : null,
              boundingHeight: cRect ? Math.round(cRect.height) : 0,
              boundingWidth: cRect ? Math.round(cRect.width) : 0,
              canvasWidth: cvRect ? Math.round(cvRect.width) : 0,
              canvasHeight: cvRect ? Math.round(cvRect.height) : 0,
              canvasContainerHeight: ccRect ? Math.round(ccRect.height) : 0,
              fleetMapHeight: fmRect ? Math.round(fmRect.height) : 0,
              markerCount: markers.length
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
        const markersOk = (val?.markerCount || 0) >= 2

        if (!heightOk || !markersOk) {
          allPassed = false
        }

        console.log(`\nCenário: ${vp.name} | Tema: ${th}`)
        console.log(
          `  - .map-container: ${val?.boundingWidth}x${val?.boundingHeight} px (computed: ${val?.computedHeight}) -> ${heightOk ? 'OK (>= 300px)' : 'FALHA (< 300px)'}`,
        )
        console.log(`  - canvas.maplibregl-canvas: ${val?.canvasWidth}x${val?.canvasHeight} px`)
        console.log(`  - .fleet-map altura total: ${val?.fleetMapHeight} px`)
        console.log(`  - Marcadores visíveis: ${val?.markerCount} -> ${markersOk ? 'OK' : 'FALHA'}`)
      }
    }

    console.log(
      '\n================================================================================',
    )
    if (allPassed) {
      console.log(
        'RESULTADO: SUCESSO - Todas as medidas atendem aos critérios em todos os cenários.',
      )
    } else {
      console.error('RESULTADO: FALHA - Pelo menos um cenário não atingiu as medidas mínimas.')
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
