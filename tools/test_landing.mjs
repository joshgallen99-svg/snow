// headless check: a clean landing after air gives a speed boost that grows with airtime;
// a near-flat slam (close to the crash limit) doesn't
import { threeIIFE, gameSources } from './build.mjs';
const src = threeIIFE() + gameSources((f) => /^(00|01|02|03|04|05|10)_/.test(f));
const M = new Function(src + '\nreturn {generateTerrain, World, Scatter, Player, Input};')();
const g = M.generateTerrain(); for (const s of g.steps) s(); M.World.init(g.finish());
const st = []; M.Scatter.run(st); for (const s of st) s();
const { World, Player, Input } = M;
Input.is = () => false; Input.hit = () => false; Input.steer = () => 0; Input.fwd = () => 0;
const rd = World.runData.find((r) => r.run.id === 'center');
let fail = 0, lastGain = 0;
for (const [drop, yawOff, expect] of [[2, 0, true], [4, 0, true], [6, 0, true], [9, 0, false]]) {
  const c = World.pathAt(rd, rd.path.len * 0.25);
  Player.reset(c.x, c.z, Math.atan2(c.tx, c.tz), 12);
  Player.yaw += yawOff; Player.ground = false; Player.takeoff(false);
  Player.pos.y += drop;
  let ev = null, before = 0, n = 0, imp = 0;
  while (!Player.ground && n++ < 2000) { before = Math.hypot(Player.vel.x, Player.vel.z); Player.step(1 / 120); for (const e of Player.events) { if (e.type === 'perfectLand') ev = e; if (e.type === 'land') imp = e.impact; } Player.events.length = 0; }
  const after = Math.hypot(Player.vel.x, Player.vel.z);
  const ok = !!ev === expect && !Player.crashed && (!ev || ev.gain > lastGain);
  if (ev) lastGain = ev.gain;
  if (!ok) fail++;
  console.log(`drop ${drop} m, yaw off ${yawOff}: ${ev ? `perfect, air ${ev.air.toFixed(2)} s, +${(ev.gain * 3.6).toFixed(1)} km/h` : 'no boost'}; impact ${imp.toFixed(1)}; speed ${before.toFixed(1)} -> ${after.toFixed(1)} m/s ${ok ? 'OK' : 'FAIL'}`);
}
process.exit(fail ? 1 : 0);
