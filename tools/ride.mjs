import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.addInitScript(() => { localStorage.setItem('kitakaze-peak.v1', JSON.stringify({ settings: { quality: 'low', time: '11.5', weather: 'clear', unlockAll: true, music: 0, sfx: 0 } })); });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('file://' + path.join(root, 'index.html'));
await page.waitForFunction(() => typeof Game !== 'undefined' && Game.state !== 'loading', null, { timeout: 120000 });
const run = process.argv[2] || 'railyard';
await page.evaluate((r) => Game.startRun(RUN_BY_ID[r], 'free'), run);
const script = JSON.parse(process.argv[3] || '[]');
let n = 0;
for (const [act, arg, ms] of script) {
  if (act === 'down') await page.keyboard.down(arg);
  else if (act === 'up') await page.keyboard.up(arg);
  else if (act === 'eval') console.log(JSON.stringify(await page.evaluate(arg)));
  else if (act === 'shot') { await page.screenshot({ path: path.join(root, 'tools/out', arg + '.png') }); console.log('shot', arg, JSON.stringify(await page.evaluate(() => ({ st: Game.state, sp: +Player.speed.toFixed(1), g: Player.ground, crashed: Player.crashed, cam: Cam.mode })))); }
  if (ms) await page.waitForTimeout(ms);
}
console.log(errs.slice(0, 10).join('\n') || 'no errors');
await browser.close();
