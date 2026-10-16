// scripted scenes for screenshots: the game is stepped deterministically (no wall-clock), so
// slow software rendering doesn't change what happens. Usage:
//   node tools/scene.mjs '<json script>' [quality] [time] [weather]
// script items: ["run", id, distance?, speed?] ["sim", seconds] ["key", code, true|false]
//               ["eval", js] ["shot", name]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [script, quality = 'medium', time = '11.5', weather = 'clear', W = '1280', H = '720'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +W, height: +H } });
page.setDefaultTimeout(300000);
// LOCKED=1 keeps the lifts locked (cloud cover on the map)
await page.addInitScript(([q, t, w, u]) => { localStorage.setItem('kitakaze-peak.v1', JSON.stringify({ settings: { quality: q, time: t, weather: w, unlockAll: u, music: 0, sfx: 0 } })); }, [quality, time, weather, !process.env.LOCKED]);
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('file://' + path.join(root, 'index.html'));
await page.waitForFunction(() => typeof Game !== 'undefined' && Game.state !== 'loading', null, { timeout: 180000 });
await page.evaluate(() => { Game.testMode = true; });
for (const [act, a, b, c] of JSON.parse(script)) {
  if (act === 'run') {
    await page.evaluate(([id, d, sp]) => {
      Game.startRun(RUN_BY_ID[id], 'free');
      const rd = World.runData.find((r) => r.run.id === id), p = World.pathAt(rd, d || 4);
      Player.reset(p.x, p.z, Math.atan2(p.tx, p.tz), sp || 3);
      Snow.recenter(p.x, p.z, true); Cam.dir.set(p.tx, 0, p.tz); Cam.snap();
      UI.closeAll && 0;
    }, [a, b, c]);
    await page.evaluate(() => { Game.simulate(0.1); const P = Cam.pose; Game.cam.position.copy(P.pos); Cam.look.copy(P.look); });
  } else if (act === 'sim') await page.evaluate((s) => Game.simulate(s), a);
  else if (act === 'key') await page.evaluate(([k, on]) => { if (on) { Input.down.add(k); Input.hits.add(k); } else Input.down.delete(k); }, [a, b]);
  else if (act === 'eval') console.log(JSON.stringify(await page.evaluate(a)));
  else if (act === 'shot') {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: path.join(root, 'tools/out', a + '.png'), timeout: 300000 });
    console.log('shot', a, JSON.stringify(await page.evaluate(() => ({ st: Game.state, sp: +Player.speed.toFixed(1), g: Player.ground, crashed: Player.crashed }))));
  }
}
console.log(errs.slice(0, 10).join('\n') || 'no errors');
await browser.close();
