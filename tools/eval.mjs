import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.addInitScript(() => { localStorage.setItem('kitakaze-peak.v1', JSON.stringify({ settings: { quality: 'low', time: '11.5', weather: 'clear', unlockAll: true, music: 0, sfx: 0 } })); });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('file://' + path.join(root, 'index.html'));
await page.waitForFunction(() => typeof Game !== 'undefined' && Game.state !== 'loading', null, { timeout: 120000 });
for (const code of process.argv.slice(2)) {
  const r = await page.evaluate(code);
  console.log(JSON.stringify(r));
  await page.waitForTimeout(1500);
}
await browser.close();
