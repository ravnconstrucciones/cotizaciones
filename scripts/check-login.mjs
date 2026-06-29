import { chromium } from "playwright";

const EMAIL = "ravn.construcciones@gmail.com";
const PASSWORD = "RAVN-283580-Mando";

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Navigate to login
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  console.log("URL after load:", page.url());
  
  // Fill form
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  
  console.log("Submitting form...");
  await page.click('button[type="submit"]');
  
  // Wait for any navigation
  try {
    await page.waitForNavigation({ timeout: 10000 });
    console.log("Navigation happened, URL:", page.url());
  } catch {
    console.log("No navigation in 10s, URL:", page.url());
  }
  
  await page.waitForTimeout(3000);
  console.log("Final URL:", page.url());
  
  const cookies = await context.cookies();
  console.log("Cookies:", cookies.map(c => c.name + "=" + c.value.substring(0, 20)).join(", "));
  
  await browser.close();
}

run().catch(console.error);
