// scripts/perf-cashflow.mjs
// Mide el tiempo hasta que los datos de /cashflow/resumen están disponibles.
// Métricas clave:
//   - resumenDuration: cuánto tarda el servidor en responder (el cuello de botella)
//   - timeToData: wall-clock desde navigationStart hasta que el fetch de resumen termina
// Uso: node scripts/perf-cashflow.mjs [--label "ANTES|DESPUES"]
import { chromium } from "playwright";

const label = process.argv[process.argv.indexOf("--label") + 1] ?? "medicion";
const CASHFLOW_URL = "http://localhost:3000/cashflow";
const RUNS = 3;

const EMAIL = "ravn.construcciones@gmail.com";
const PASSWORD = "RAVN-283580-Mando";

async function login(context) {
  const page = await context.newPage();
  await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
  let attempts = 0;
  while (page.url().includes("/login") && attempts < 15) {
    await page.waitForTimeout(1000);
    attempts++;
  }
  await page.close();
}

async function medirUnaVez(context) {
  const page = await context.newPage();

  // Capturar el tiempo de respuesta del endpoint directamente via Network events
  let resumenRequestStart = null;
  let resumenResponseEnd = null;

  page.on("request", (req) => {
    if (req.url().includes("/cashflow/resumen")) {
      if (resumenRequestStart == null) resumenRequestStart = Date.now();
    }
  });
  page.on("response", (res) => {
    if (res.url().includes("/cashflow/resumen")) {
      if (resumenResponseEnd == null) resumenResponseEnd = Date.now();
    }
  });

  const navStart = Date.now();
  await page.goto(CASHFLOW_URL, { waitUntil: "domcontentloaded" });
  const dcl = Date.now() - navStart;

  // Esperar a que el fetch de resumen complete
  // El prefetch inline lo lanza al parsear el HTML; fetchCompartido lo consume en hidratación.
  // Damos 10s máximo.
  let waited = 0;
  while (resumenResponseEnd == null && waited < 10000) {
    await page.waitForTimeout(100);
    waited += 100;
  }

  await page.close();

  const serverDuration = resumenRequestStart != null && resumenResponseEnd != null
    ? resumenResponseEnd - resumenRequestStart
    : null;
  const timeToData = resumenResponseEnd != null
    ? resumenResponseEnd - navStart
    : null;
  const requestDelay = resumenRequestStart != null
    ? resumenRequestStart - navStart
    : null;

  return { dcl, serverDuration, timeToData, requestDelay };
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  await login(context);

  const results = [];
  for (let i = 0; i < RUNS; i++) {
    const r = await medirUnaVez(context);
    results.push(r);
  }

  await browser.close();

  const avg = (arr) => {
    const valid = arr.filter((v) => v != null);
    return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : "N/A";
  };
  const min = (arr) => {
    const valid = arr.filter((v) => v != null);
    return valid.length ? Math.min(...valid) : "N/A";
  };

  const dcls = results.map((r) => r.dcl);
  const serverDurations = results.map((r) => r.serverDuration);
  const timesToData = results.map((r) => r.timeToData);
  const requestDelays = results.map((r) => r.requestDelay);

  console.log(`\n=== ${label} ===`);
  console.log(`DCL html-parse (avg):               ${avg(dcls)}ms`);
  console.log(`/resumen request delay (avg):        ${avg(requestDelays)}ms  ← cuándo arranca el fetch`);
  console.log(`/resumen server duration (avg):      ${avg(serverDurations)}ms  ← cuello de botella`);
  console.log(`/resumen server duration (min):      ${min(serverDurations)}ms`);
  console.log(`Time-to-data (navStart→resumen end): ${avg(timesToData)}ms  ← lo que siente el usuario`);
  console.log(`Raw serverDurations: [${serverDurations.map((v) => v ?? "N/A").join(", ")}]ms`);
  console.log(`Raw timesToData:     [${timesToData.map((v) => v ?? "N/A").join(", ")}]ms`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
