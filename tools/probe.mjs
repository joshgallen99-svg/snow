import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
await page.addInitScript(() => { localStorage.setItem('kitakaze-peak.v1', JSON.stringify({ settings: { quality: 'low', time: '11.5', weather: 'clear', unlockAll: true, music: 0, sfx: 0 } })); });
await page.goto('file://' + path.join(root, 'index.html'));
await page.waitForFunction(() => typeof Game !== 'undefined' && Game.state !== 'loading', null, { timeout: 120000 });
await page.evaluate(() => { Game.openMap(); MapView.dist = 700; MapView.target.set(-20, 0, 60);
  const rd = World.runData[RUN_BY_ID.center.index];
  const pts = rd.path.pts.filter((p, i) => i % 2 === 0);
  const m = new THREE.Mesh(MapView.ribbon(pts), MapView.lineMaterial(0x00ff00, 40)); m.material.depthTest = false;
  m.renderOrder = 13; MapView.group.add(m); window.__dbg = m;
  // also take one existing run core out of the update loop
  const core = MapView.lines.find((x) => x.userData.core && x.userData.run === RUN_BY_ID.wonderland.index);
  MapView.lines.splice(MapView.lines.indexOf(core), 1);
});
await page.waitForTimeout(4000);
await page.waitForFunction(() => !Cam.from, null, { timeout: 120000 });
await page.waitForTimeout(3000);
const pts = await page.evaluate(() => {
  const rd = World.runData[RUN_BY_ID.center.index];
  return [0.3, 0.5, 0.7].map((t) => { const p = rd.path.pts[Math.floor(rd.path.n * t)]; const v = new THREE.Vector3(p[0], World.height(p[0], p[1]) + 2.5, p[1]).project(Game.cam); return [Math.round((v.x * 0.5 + 0.5) * innerWidth), Math.round((-v.y * 0.5 + 0.5) * innerHeight), +v.z.toFixed(4)]; });
});
console.log('center run screen pts', JSON.stringify(pts));
await page.screenshot({ path: path.join(root, 'tools/out/probe.png') });
await browser.close();
