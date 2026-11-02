#!/usr/bin/env node
/**
 * Gera as imagens do README (T-87, ADR-0016 itens 6 e 10), sempre no tema claro (g10).
 *
 * Uso (à mão, numa máquina de desenvolvimento com internet e a stack rodando):
 *   cd frontend && npm run capturas
 *
 * Variáveis:
 *   CAPTURAS_URL            endereço do painel (padrão http://127.0.0.1:3000)
 *   CAPTURAS_SAIDA          pasta das imagens (padrão <repo>/docs/images)
 *   CAPTURAS_NAVEGADOR      canal do Chromium para o Playwright (padrão "msedge"; use "chrome" se preferir)
 *   CAPTURAS_PLAYWRIGHT_DIR pasta com node_modules contendo playwright ou playwright-core, quando o
 *                           pacote não está instalado no projeto
 *
 * Regras:
 *   - Nunca roda na CI: encerra com erro se CI estiver definida, antes de abrir qualquer navegador.
 *   - Consumo do provedor de mapa: só Dashboard e Veículos abrem o mapa. O Veículos é aberto por
 *     navegação interna na mesma página do Dashboard desktop, e o mobile abre o Dashboard de novo.
 *     No máximo 1 nova tentativa por captura. Sem proxy, sem cache em disco, sem pré-download.
 *   - Não guarda dado de tile: o produto é só o PNG, com o crédito do mapa visível.
 *   - Falha (e não grava a imagem) se o fundo não ficar "pronto" em 30 s, se o mapa tiver menos de
 *     300 px de altura, se algum marcador estiver fora do mapa ou fora da projeção do mapa, ou se o
 *     crédito não estiver visível na tela da captura.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ESPERA_FUNDO_MS = 30_000;
const ALTURA_MINIMA_MAPA_PX = 300;
const TOLERANCIA_PROJECAO_PX = 4;
const MAX_TENTATIVAS = 2; // 1 tentativa + no máximo 1 nova
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

if (process.env.CI) {
  console.error(
    "capturas-readme: recusado, a variável CI está definida. O script roda só à mão.",
  );
  process.exit(1);
}

const aqui = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = (process.env.CAPTURAS_URL || "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const SAIDA = path.resolve(
  process.env.CAPTURAS_SAIDA || path.join(aqui, "..", "docs", "images"),
);
const CANAL = process.env.CAPTURAS_NAVEGADOR ?? "msedge";

async function carregarPlaywright() {
  const alvos = ["playwright", "playwright-core"];
  for (const nome of alvos) {
    try {
      return await import(nome);
    } catch {
      /* tenta o próximo */
    }
  }
  const dir = process.env.CAPTURAS_PLAYWRIGHT_DIR;
  if (dir) {
    const req = createRequire(
      pathToFileURL(path.join(path.resolve(dir), "x.js")),
    );
    for (const nome of alvos) {
      try {
        return req(nome);
      } catch {
        /* tenta o próximo */
      }
    }
  }
  throw new Error(
    "Playwright não encontrado. Instale playwright (versão exata) no frontend ou aponte CAPTURAS_PLAYWRIGHT_DIR.",
  );
}

/** Mede mapa, crédito e marcadores dentro da página. Roda no navegador. */
function medirMapa(minAltura) {
  const mapa = document.querySelector('[data-testid="map-container"]');
  if (!mapa) return { erros: ["container do mapa não encontrado"] };
  const caixa = mapa.getBoundingClientRect();
  const erros = [];
  if (caixa.height < minAltura) {
    erros.push(
      `mapa com ${Math.round(caixa.height)} px de altura (mínimo ${minAltura})`,
    );
  }
  if (caixa.width <= 0) erros.push("mapa sem largura");

  const credito = document.querySelector('[data-testid="map-credit"]');
  let creditoOk = false;
  if (credito) {
    const c = credito.getBoundingClientRect();
    const estilo = getComputedStyle(credito);
    creditoOk =
      c.width > 0 &&
      c.height > 0 &&
      estilo.visibility !== "hidden" &&
      estilo.display !== "none" &&
      Number(estilo.opacity) > 0 &&
      c.left >= caixa.left - 1 &&
      c.right <= caixa.right + 1 &&
      c.top >= caixa.top - 1 &&
      c.bottom <= caixa.bottom + 1 &&
      c.left >= 0 &&
      c.top >= 0 &&
      c.right <= window.innerWidth &&
      c.bottom <= window.innerHeight &&
      (credito.textContent || "").trim().length > 0;
  }
  if (!creditoOk) erros.push("crédito do mapa ausente ou fora da área visível");

  const marcadores = [...document.querySelectorAll(".ft-map-marker")].map(
    (el) => {
      const r = el.getBoundingClientRect();
      return {
        placa: el.getAttribute("data-plate"),
        lat: Number(el.getAttribute("data-lat")),
        lng: Number(el.getAttribute("data-lng")),
        x: r.left + r.width / 2 - caixa.left,
        y: r.top + r.height / 2 - caixa.top,
        largura: r.width,
        altura: r.height,
      };
    },
  );
  return {
    erros,
    caixa: { largura: caixa.width, altura: caixa.height },
    marcadores,
  };
}

/**
 * Confere os marcadores contra a projeção Web Mercator do mapa. O objeto do MapLibre não é exposto
 * pela página, então ajusta-se px = a·mx + bx e py = a·my + by (mesma escala nos dois eixos, é
 * a assinatura de map.project) aos marcadores e exige que cada um caia a poucos px do ajuste.
 * Marcador solto, empilhado no canto ou fora da projeção aparece como resíduo grande.
 */
function validarMarcadores(medicao, minimo) {
  const erros = [];
  const { marcadores, caixa } = medicao;
  if (marcadores.length < minimo) {
    erros.push(
      `${marcadores.length} marcadores no mapa (esperado ao menos ${minimo})`,
    );
  }
  for (const m of marcadores) {
    const dentro =
      m.x >= 0 && m.x <= caixa.largura && m.y >= 0 && m.y <= caixa.altura;
    if (!dentro) {
      erros.push(
        `marcador ${m.placa} fora da área do mapa (${Math.round(m.x)}, ${Math.round(m.y)}) em ${Math.round(caixa.largura)}×${Math.round(caixa.altura)}`,
      );
    }
    if (!(m.largura > 0 && m.altura > 0))
      erros.push(`marcador ${m.placa} sem tamanho`);
  }
  const merc = (lat, lng) => {
    const s = Math.sin((lat * Math.PI) / 180);
    return {
      mx: (lng + 180) / 360,
      my: 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI),
    };
  };
  const pts = marcadores.map((m) => ({ ...m, ...merc(m.lat, m.lng) }));
  if (pts.length >= 2) {
    const n = pts.length;
    const mediaMx = pts.reduce((s, p) => s + p.mx, 0) / n;
    const mediaMy = pts.reduce((s, p) => s + p.my, 0) / n;
    const mediaX = pts.reduce((s, p) => s + p.x, 0) / n;
    const mediaY = pts.reduce((s, p) => s + p.y, 0) / n;
    let num = 0;
    let den = 0;
    for (const p of pts) {
      num +=
        (p.mx - mediaMx) * (p.x - mediaX) + (p.my - mediaMy) * (p.y - mediaY);
      den += (p.mx - mediaMx) ** 2 + (p.my - mediaMy) ** 2;
    }
    const a = den > 0 ? num / den : 0;
    if (!(a > 0)) {
      erros.push(
        "marcadores não seguem uma projeção do mapa (escala não positiva)",
      );
    } else {
      for (const p of pts) {
        const ex = mediaX + a * (p.mx - mediaMx);
        const ey = mediaY + a * (p.my - mediaMy);
        const res = Math.hypot(p.x - ex, p.y - ey);
        if (res > TOLERANCIA_PROJECAO_PX) {
          erros.push(
            `marcador ${p.placa} a ${res.toFixed(1)} px da projeção do mapa (limite ${TOLERANCIA_PROJECAO_PX})`,
          );
        }
      }
    }
  }
  return erros;
}

async function esperarFundoPronto(page) {
  const mapa = page.locator('[data-testid="fleet-map"]');
  await mapa.waitFor({ state: "visible", timeout: ESPERA_FUNDO_MS });
  try {
    await page.waitForSelector(
      '[data-testid="fleet-map"][data-estado-fundo="pronto"]',
      {
        timeout: ESPERA_FUNDO_MS,
      },
    );
  } catch {
    const estado = await mapa
      .getAttribute("data-estado-fundo")
      .catch(() => "?");
    throw new Error(
      `fundo do mapa não ficou "pronto" em ${ESPERA_FUNDO_MS / 1000} s (estado: ${estado}). Provedor fora? Não publique sem mapa; tente outro dia.`,
    );
  }
}

async function conferirMapa(page, minimoMarcadores) {
  // Deixa o mapa assentar (resize, fitBounds, fontes) antes de medir.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  const medicao = await page.evaluate(medirMapa, ALTURA_MINIMA_MAPA_PX);
  const erros = [...medicao.erros];
  if (medicao.marcadores)
    erros.push(...validarMarcadores(medicao, minimoMarcadores));
  if (erros.length)
    throw new Error("mapa reprovado:\n  - " + erros.join("\n  - "));
  return medicao;
}

async function gravar(page, nome, opcoes = {}) {
  const arquivo = path.join(SAIDA, nome);
  await page.screenshot({ path: arquivo, type: "png", ...opcoes });
  console.log(
    `  gravado ${path.relative(process.cwd(), arquivo)} (${fs.statSync(arquivo).size} bytes)`,
  );
}

/** Executa uma captura com no máximo 1 nova tentativa (recarregando a página). */
async function comTentativa(rotulo, page, fn) {
  let ultimo;
  for (let i = 1; i <= MAX_TENTATIVAS; i++) {
    try {
      return await fn(i);
    } catch (e) {
      ultimo = e;
      console.warn(
        `  [${rotulo}] tentativa ${i}/${MAX_TENTATIVAS} falhou: ${e.message.split("\n")[0]}`,
      );
    }
  }
  throw ultimo;
}

async function main() {
  const playwright = await carregarPlaywright();
  const chromium = playwright.chromium ?? playwright.default?.chromium;
  fs.mkdirSync(SAIDA, { recursive: true });

  const navegador = await chromium.launch({ channel: CANAL || undefined, headless: true });
  const pedidosProvedor = { desktop: 0, mobile: 0 };
  const falhas = [];

  async function novoContexto(viewport, rotulo, extra = {}) {
    // Contexto novo por execução: sem cookies, sem cache e sem armazenamento anterior.
    const ctx = await navegador.newContext({
      viewport,
      deviceScaleFactor: 1,
      colorScheme: "light",
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
      reducedMotion: "reduce",
      ...extra,
    });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("ft-theme", "light");
      } catch {
        /* sem armazenamento */
      }
    });
    ctx.on("request", (req) => {
      if (/openfreemap\.org/.test(req.url())) pedidosProvedor[rotulo]++;
    });
    return ctx;
  }

  async function prepararPagina(page) {
    await page.waitForLoadState("domcontentloaded");
    const tema = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    if (tema !== "light")
      throw new Error(`tema aplicado é "${tema}", esperado "light"`);
  }

  try {
    // ---------- Desktop: Dashboard e Veículos (navegação interna), depois Entregas e Telemetria
    const ctxDesktop = await novoContexto(DESKTOP, "desktop");
    const page = await ctxDesktop.newPage();
    page.on("pageerror", (e) => console.warn("  erro de página:", e.message));

    console.log("Dashboard desktop 1440×900");
    await comTentativa("dashboard", page, async (i) => {
      if (i > 1) await page.reload({ waitUntil: "domcontentloaded" });
      else await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
      await prepararPagina(page);
      await esperarFundoPronto(page);
      await conferirMapa(page, 10);
      await gravar(page, "dashboard.png");
    });

    console.log("Veículos desktop 1440×900");
    await comTentativa("veiculos", page, async (i) => {
      if (i > 1) await page.reload({ waitUntil: "domcontentloaded" });
      else await page.locator('a[href="/vehicles"]').first().click();
      await page.waitForURL("**/vehicles");
      await esperarFundoPronto(page);
      await conferirMapa(page, 10);
      await gravar(page, "veiculos.png");
    });

    console.log("Entregas desktop 1440×900");
    await page.locator('a[href="/deliveries"]').first().click();
    await page.waitForURL("**/deliveries");
    await page.waitForSelector("table tbody tr", { timeout: 15_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    await gravar(page, "entregas.png");

    console.log("Telemetria desktop 1440×900");
    await page.locator('a[href="/telemetry"]').first().click();
    await page.waitForURL("**/telemetry");
    const seletor = page.locator("select").first();
    if (await seletor.count()) {
      const opcao = seletor.locator("option", { hasText: "ABC-1234" });
      await seletor.selectOption({
        value: await opcao.first().getAttribute("value"),
      });
    } else {
      await page.getByRole("combobox").first().click();
      await page
        .getByRole("option", { name: /ABC-1234/ })
        .first()
        .click();
    }
    await page.waitForSelector(".recharts-surface", { timeout: 15_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1500); // animação dos gráficos (reducedMotion já reduz)
    await gravar(page, "telemetria.png");
    await ctxDesktop.close();

    // ---------- Mobile: Dashboard
    console.log("Dashboard mobile 390×844");
    const ctxMobile = await novoContexto(MOBILE, "mobile", {
      isMobile: true,
      hasTouch: true,
    });
    const pm = await ctxMobile.newPage();
    await comTentativa("dashboard-mobile", pm, async (i) => {
      if (i > 1) await pm.reload({ waitUntil: "domcontentloaded" });
      else await pm.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
      await prepararPagina(pm);
      await esperarFundoPronto(pm);
      // No celular o mapa fica abaixo da dobra: centraliza o mapa na tela, para o crédito aparecer.
      await pm
        .locator('[data-testid="fleet-map"]')
        .evaluate((el) => el.scrollIntoView({ block: "center" }));
      await conferirMapa(pm, 10);
      await gravar(pm, "dashboard-mobile.png");
    });
    await ctxMobile.close();
  } catch (e) {
    falhas.push(e);
  } finally {
    await navegador.close();
  }

  console.log(
    `Pedidos ao provedor do mapa: desktop ${pedidosProvedor.desktop}, mobile ${pedidosProvedor.mobile}`,
  );
  if (falhas.length) {
    console.error(
      "\ncapturas-readme: FALHOU\n" + falhas.map((f) => f.message).join("\n"),
    );
    process.exit(1);
  }
  console.log(
    "Capturas concluídas. Otimize os PNG e confira cada imagem antes de publicar.",
  );
}

main().catch((e) => {
  console.error("capturas-readme: FALHOU\n" + (e?.stack || e));
  process.exit(1);
});
