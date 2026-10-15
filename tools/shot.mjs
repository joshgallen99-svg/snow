// Headless browser smoke test: loads index.html, captures console errors, takes screenshots.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const steps = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const W = +(process.env.W || 800), H = +(process.env.H || 450);
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.addInitScript(([q, t, w, u]) => { try { localStorage.setItem('kitakaze-peak.v1', JSON.stringify({ settings: { quality: q, time: t, weather: w, unlockAll: u === '1', music: 0, sfx: 0 } })); } catch (e) {} }, [process.env.Q || 'low', process.env.T || '11.5', process.env.WX || 'clear', process.env.U || '1']);
const errors = [];
page.on('console', (m) => { if (m.type() === 'info') console.log(m.text()); if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
const t0 = Date.now();
await page.goto('file://' + path.join(root, 'index.html'));
try { await page.waitForFunction(() => typeof Game !== 'undefined' && Game.state !== 'loading', null, { timeout: 180000 }); }
catch (e) { console.log('load timeout; step:', await page.evaluate(() => document.getElementById('loadStep')?.textContent)); }
console.log('loaded in', ((Date.now() - t0) / 1000).toFixed(1), 's, state', await page.evaluate(() => typeof Game !== 'undefined' && Game.state));
for (const st of steps) {
  const [name, code, wait] = st.split('|');
  if (code && code.startsWith('MOUSE:')) { const xy = await page.evaluate(code.slice(6)); await page.mouse.move(xy[0], xy[1]); if (code.includes('CLICK')) await page.mouse.click(xy[0], xy[1]); }
  else if (code) await page.evaluate(code);
  const f0 = await page.evaluate(() => Game.frame);
  await page.waitForTimeout(+(wait || 4000));
  // let camera blends finish (software GL can be very slow)
  try { await page.waitForFunction(() => !Cam.from, null, { timeout: 120000 }); } catch (e) {}
  const f1 = await page.evaluate(() => Game.frame);
  console.log('  frames', f1 - f0);
  await page.screenshot({ timeout: 180000, path: path.join(root, 'tools/out', name + '.png') });
  console.log('shot', name, await page.evaluate(() => Game.state));
}
console.log(errors.slice(0, 30).join('\n') || 'no console errors');
await browser.close();
