import { chromium } from "playwright";

const EMAIL = "ravn.construcciones@gmail.com";
const PASSWORD = "RAVN-283580-Mando";

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  // Login
  const loginPage = await context.newPage();
  await loginPage.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
  await loginPage.waitForSelector('input[type="email"]', { timeout: 15000 });
  await loginPage.fill('input[type="email"]', EMAIL);
  await loginPage.fill('input[type="password"]', PASSWORD);
  await Promise.all([
    loginPage.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
    loginPage.click('button[type="submit"]'),
  ]);
  let attempts = 0;
  while (loginPage.url().includes("/login") && attempts < 15) {
    await loginPage.waitForTimeout(1000);
    attempts++;
  }
  console.log("Logged in, url:", loginPage.url());
  await loginPage.close();

  const page = await context.newPage();
  const requests = [];
  page.on("request", (req) => {
    if (!req.url().includes("_next") && !req.url().includes("favicon") && !req.url().includes("woff")) {
      requests.push({ url: req.url(), t: Date.now() });
    }
  });

  const navStart = Date.now();
  await page.goto("http://localhost:3000/cashflow", { waitUntil: "domcontentloaded" });
  console.log("DOMContentLoaded at:", Date.now() - navStart, "ms");
  await page.waitForTimeout(6000);
  console.log("Requests made (non-next):"); 
  requests.forEach((r) => console.log(`  +${r.t - navStart}ms ${r.url}`));
  
  const allReqs = await page.evaluate(() => {
    return performance.getEntriesByType("resource")
      .filter(e => !e.name.includes("_next") && !e.name.includes("woff"))
      .map(e => ({ name: e.name, start: Math.round(e.requestStart), end: Math.round(e.responseEnd), dur: Math.round(e.duration) }));
  });
  console.log("\nPerformance entries:");
  allReqs.forEach(e => console.log(`  start:${e.start}ms dur:${e.dur}ms ${e.name}`));

  await browser.close();
}

run().catch(console.error);
