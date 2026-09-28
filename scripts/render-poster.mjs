// Renders the static fallback poster (public/fallback/jet-poster.jpg) from the
// live WebGL scene using headless Chromium, so the fallback always matches the site.
//
//   npm run build && npx vite preview --port 4173   (in another terminal)
//   npm run poster
//
// Env: URL (preview origin), SCROLL (section blend 0–5), WARP (seconds of flight), OUT.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = require(process.env.PW_PATH || 'playwright'));
}

const origin = process.env.URL || 'http://localhost:4173/';
const scroll = Number(process.env.SCROLL ?? 0);
const warp = Number(process.env.WARP ?? 14);
const out = process.env.OUT || 'public/fallback/jet-poster.jpg';

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(`${origin}?quality=high&debug`);
await page.waitForFunction(() => window.__rs, null, { timeout: 120000 });
await page.addStyleTag({
  content: '.hud,.topbar,.rail,main,.boot,.stage__scrim,.stage__poster{display:none!important}',
});
await page.evaluate(
  ({ scroll, warp }) => {
    window.__rs.setScroll(scroll);
    window.__rs.warp(warp);
  },
  { scroll, warp },
);
await page.waitForTimeout(4000);
await page.screenshot({ path: out, type: 'jpeg', quality: 82 });
console.log(`poster → ${out} (scroll ${scroll}, warp ${warp}s)`);
await browser.close();
