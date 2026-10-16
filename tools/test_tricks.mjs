// headless checks for ground and rail tricks: butters, presses, switch-ups, spin-ons, combo grabs, corks
import { threeIIFE, gameSources } from './build.mjs';
const src = threeIIFE() + gameSources((f) => /^(00|01|02|03|04|05|10)_/.test(f));
const M = new Function(src + '\nreturn {generateTerrain, World, Scatter, Player, Input, RUNS};')();
const g = M.generateTerrain(); for (const s of g.steps) s(); M.World.init(g.finish());
const st = []; M.Scatter.run(st); for (const s of st) s();
const { World, Player, Input, RUNS } = M;
const keys = new Set(), hits = new Set();
Input.is = (...c) => c.some((k) => keys.has(k));
Input.hit = (...c) => c.some((k) => hits.has(k));
Input.steer = () => (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
Input.fwd = () => (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
const tricks = [];
const step = (n, fn) => { for (let i = 0; i < n; i++) { fn && fn(i); Player.step(1 / 120); hits.clear(); for (const e of Player.events) { if (e.type === 'trick') tricks.push(e.name + ' +' + e.base); if (e.type === 'crash') tricks.push('CRASH ' + e.reason); } Player.events.length = 0; } };
const tap = (k) => hits.add(k);
// a green groomer
const rd = World.runData.find((r) => r.run.diff === 'green');
const c0 = World.pathAt(rd, rd.path.len * 0.35);
function startOn(speed) { Player.reset(c0.x, c0.z, Math.atan2(c0.tx, c0.tz), speed); }
// 1) nose butter 360
startOn(7); step(30);
keys.add('KeyQ'); step(12); keys.add('KeyA'); step(150); keys.delete('KeyA'); step(40); keys.delete('KeyQ'); step(30);
console.log('butter:', tricks.splice(0).join(' | '), 'speed', Player.speed.toFixed(1), 'crashed', Player.crashed);
// 2) tail press
startOn(7); step(20); keys.add('KeyF'); step(120); keys.delete('KeyF'); step(30);
console.log('press:', tricks.splice(0).join(' | '));
// 3) nollie
startOn(8); step(20); keys.add('KeyQ'); step(30); keys.add('Space'); step(30); keys.delete('Space'); step(200); keys.delete('KeyQ'); step(60);
console.log('nollie:', tricks.splice(0).join(' | '));
// 4) rail: 50-50 with a 180 switch-up and a nose press
const rail = Object.assign({}, World.grinds.find((r) => r.kind === 'rail'), { len: 60 });
rail.by = rail.ay - 60 * 0.05;
const bal = () => { const G = Player.grind; if (!G) return; const b = G.bal + G.balV * 0.35; keys.delete('KeyA'); keys.delete('KeyD'); if (b > 0.12) keys.add('KeyA'); else if (b < -0.12) keys.add('KeyD'); };
Player.reset(rail.ax, rail.az, Math.atan2(rail.dx, rail.dz), 8);
Player.ground = false; Player.takeoff(true); Player.air.spin = Math.PI; Player.yaw += Math.PI;
Player.startGrind(rail, 1, 8);
step(60, bal); tap('KeyW'); step(60, bal); tap('KeyS'); step(10, bal); keys.add('KeyQ'); step(90, bal); keys.delete('KeyQ'); tap('Space'); step(1, bal); keys.delete('KeyA'); keys.delete('KeyD'); step(240);
console.log('rail:', tricks.splice(0).join(' | '));
// 5) cork 720 with a method off a big drop
const k = World.kickers[World.kickers.length - 1];
for (const [name, spin, flip, grab] of [['cork', 'KeyD', 'KeyS', ['KeyK', 'KeyL']], ['misty', 'KeyA', 'KeyW', ['KeyJ', 'KeyI']], ['japan', null, null, ['KeyJ', 'KeyI']]]) {
  Player.reset(k.x0 - k.dx * 30, k.z0 - k.dz * 30, Math.atan2(k.dx, k.dz), 9);
  let t = 0;
  while (Player.ground && t < 1200) { step(1); t++; }
  for (const g of grab) keys.add(g);
  step(5); if (spin) keys.add(spin); if (flip) keys.add(flip);
  let n = 0;
  while (!Player.ground && !Player.crashed && n < 600) {
    step(1); n++;
    if (flip && Math.abs(Player.flip) > Math.PI * 2 - 0.9) keys.delete(flip);
    if (spin && Math.abs(Player.air ? Player.air.spin : 0) > Math.PI * 4 - 1.0) keys.delete(spin);
    if (Player.air && (Player.pos.y - World.height(Player.pos.x, Player.pos.z)) / Math.max(0.5, -Player.vel.y) < 0.45) for (const g of grab) keys.delete(g);
  }
  keys.clear(); step(10);
  console.log(name + ':', tricks.splice(0).join(' | '), 'air', (n / 120).toFixed(2));
}
