// Medición de velocidad percibida de LOGIN y /obras.
// Uso: node scripts/perf-cockpit.mjs <baseURL> <etiqueta>
//   baseURL: https://ravn-app-one-five.vercel.app  o  http://localhost:3000
//   etiqueta: texto para el nombre de los screenshots (ej. "antes-prod")
import { chromium } from "playwright";

const BASE = process.argv[2] || "https://ravn-app-one-five.vercel.app";
const TAG = process.argv[3] || "run";
const EMAIL = "ravn.construcciones@gmail.com";
const PASSWORD = "RAVN-283580-Mando";
const OUT = "/tmp/qa-cockpit/perf2";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  // ───────────────────────── LOGIN (sin sesión) ─────────────────────────
  const lp = await context.newPage();
  const reqsLogin = [];
  lp.on("request", (r) => {
    const u = r.url();
    reqsLogin.push({ u, t: Date.now() });
  });
  const tL = Date.now();
  await lp.goto(`${BASE}/login`, { waitUntil: "commit" });
  // Form: medimos cuándo el botón INGRESAR + inputs son visibles.
  await lp.waitForSelector('button[type="submit"]', { state: "visible", timeout: 30000 });
  await lp.waitForSelector('input[type="email"]', { state: "visible", timeout: 30000 });
  const formAt = Date.now() - tL;
  // DOMContentLoaded
  const domLogin = await lp.evaluate(() =>
    Math.round(performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart)
  ).catch(() => null);
  // Canvas del shader: cuándo aparece en el DOM (three montó).
  let canvasAt = null;
  try {
    await lp.waitForSelector("canvas", { state: "attached", timeout: 15000 });
    canvasAt = Date.now() - tL;
  } catch { canvasAt = null; }
  // three.js en el bundle inicial del documento HTML?
  const threeChunks = reqsLogin
    .filter((r) => r.t - tL < 1500)
    .filter((r) => /three|chunk/i.test(r.u) && r.u.includes("_next"));
  await sleep(1200); // dejar entrar el fade del shader
  await lp.screenshot({ path: `${OUT}/login-${TAG}.png` });

  console.log(`\n=== LOGIN (${BASE}) [${TAG}] ===`);
  console.log(`  form visible (RAVN. + inputs + INGRESAR): ${formAt} ms`);
  console.log(`  DOMContentLoaded: ${domLogin} ms`);
  console.log(`  canvas shader attached: ${canvasAt} ms`);
  // Lista de chunks JS que cargan en el primer 1.5s (para ver si three está)
  const earlyJs = reqsLogin
    .filter((r) => r.t - tL < 1500 && /\.js(\?|$)/.test(r.u))
    .map((r) => `    +${r.t - tL}ms ${r.u.split("/").pop().slice(0, 60)}`);
  console.log(`  JS chunks en primer 1.5s (${earlyJs.length}):`);
  earlyJs.forEach((l) => console.log(l));

  // login real
  await lp.fill('input[type="email"]', EMAIL);
  await lp.fill('input[type="password"]', PASSWORD);
  await Promise.all([
    lp.waitForURL((u) => !u.toString().includes("/login"), { timeout: 30000 }).catch(() => {}),
    lp.click('button[type="submit"]'),
  ]);
  let tries = 0;
  while (lp.url().includes("/login") && tries < 20) { await sleep(800); tries++; }
  await lp.close();

  // ───────────────────────── /obras (con sesión) ─────────────────────────
  const op = await context.newPage();
  const reqs = [];
  op.on("request", (r) => reqs.push({ u: r.url(), t: Date.now(), method: r.method() }));
  op.on("response", (r) => {
    const m = reqs.find((x) => x.u === r.url() && x.done === undefined);
    if (m) { m.done = Date.now(); m.status = r.status(); }
  });
  const tO = Date.now();
  await op.goto(`${BASE}/obras`, { waitUntil: "commit" });
  // DOM
  const domObras = await op.evaluate(() =>
    Math.round(performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart)
  ).catch(() => null);
  // Cards con datos: la sección de proyecto renderiza un <h2> con el nombre.
  // Esperamos a que aparezca el primer h2 dentro de una <section> (o el vacío).
  let cardsAt = null;
  try {
    await op.waitForFunction(
      () => {
        const secs = document.querySelectorAll("section h2");
        const vacio = Array.from(document.querySelectorAll("p")).some((p) =>
          /Sin obras activas/i.test(p.textContent || "")
        );
        return secs.length > 0 || vacio;
      },
      { timeout: 30000 }
    );
    cardsAt = Date.now() - tO;
  } catch { cardsAt = null; }
  await sleep(800);
  await op.screenshot({ path: `${OUT}/obras-${TAG}.png`, fullPage: false });

  console.log(`\n=== /obras (${BASE}) [${TAG}] ===`);
  console.log(`  DOMContentLoaded: ${domObras} ms`);
  console.log(`  CARDS con datos visibles: ${cardsAt} ms`);
  // Requests de datos (no _next, no assets)
  const dataReqs = reqs
    .filter((r) => !/_next|favicon|\.woff|\.css|\.png|\.svg|\.ico/.test(r.u))
    .filter((r) => /supabase|cashflow|api|rest\/v1/.test(r.u))
    .map((r) => ({
      rel: r.t - tO,
      dur: r.done ? r.done - r.t : null,
      status: r.status,
      label: r.u.replace(BASE, "").split("?")[0].slice(0, 70),
      tabla: (r.u.match(/rest\/v1\/([a-z_]+)/) || [])[1] || "",
    }));
  console.log(`  Requests de DATOS (${dataReqs.length}), en orden de disparo:`);
  dataReqs
    .sort((a, b) => a.rel - b.rel)
    .forEach((r) =>
      console.log(
        `    +${String(r.rel).padStart(5)}ms  dur:${String(r.dur ?? "?").padStart(5)}ms  ${r.status ?? "?"}  ${r.tabla || r.label}`
      )
    );

  await browser.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
