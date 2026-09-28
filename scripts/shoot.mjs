// Dev helper: screenshots of each section using headless Chromium.
// usage: node scripts/shoot.mjs <outDir> [url] [width] [height]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = require(process.env.PW_PATH || 'playwright')); }

const out = process.argv[2] || '.';
const url = process.argv[3] || 'http://localhost:4173/?quality=high&debug&warp=10';
const width = Number(process.argv[4] || 1440);
const height = Number(process.argv[5] || 900);
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width, height } });
page.on('console', (m) => console.log('[console]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url);
await page.waitForFunction(() => document.body.classList.contains('is-ready'), null, { timeout: 60000 });
await page.waitForTimeout(3000);
const sections = (process.env.SECTIONS || 'home,about,skills,projects,training,contact').split(',');
for (const id of sections) {
  await page.evaluate((id) => {
    document.documentElement.style.scrollBehavior = 'auto';
    document.getElementById(id).scrollIntoView();
    window.dispatchEvent(new Event('scroll'));
  }, id);
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__rs?.warp(Number(new URLSearchParams(location.search).get('warp') || 10)));
  await page.waitForTimeout(Number(process.env.WAIT || 4000));
  await page.screenshot({ path: `${out}/${id}.png` });
  console.log('shot', id);
}
await browser.close();
