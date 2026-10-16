// ride straight at rocks of different sizes at different speeds and report what happens
import { threeIIFE, gameSources } from './build.mjs';
const src = threeIIFE() + gameSources((f) => /^(00|01|02|03|04|05|10)_/.test(f));
const M = new Function(src + '\nreturn {generateTerrain, World, Scatter, Player, Input};')();
const g = M.generateTerrain(); for (const s of g.steps) s(); M.World.init(g.finish());
const st = []; M.Scatter.run(st); for (const s of st) s();
const { World, Scatter, Player, Input } = M;
Input.steer = () => 0; Input.fwd = () => 0; Input.is = () => false; Input.hit = () => false;
const rocks = Scatter.rocks.filter((r) => !r.cliff && World.attr(World.inRun, r.x, r.z) > 0).sort((a, b) => a.r - b.r);
const pick = [rocks[0], rocks[Math.floor(rocks.length / 2)], rocks[rocks.length - 1]];
for (const r of pick) {
  for (const sp of [5, 10, 16]) {
    for (const [off, ang] of [[0, 0], [0.6, 0], [0, 1.2], [0, -1.2]]) {
      // approach from uphill, aimed at the rock (or at its edge)
      const n = World.normal(r.x, r.z, new (Player.pos.constructor)());
      const fl = Math.atan2(n.x, n.z) + ang, dx = Math.sin(fl), dz = Math.cos(fl);
      const sx = r.x - dx * 14 + dz * off * r.ax, sz = r.z - dz * 14 - dx * off * r.ax;
      Player.reset(sx, sz, fl, sp);
      let t = 0, out = 'passed', maxUp = 0, air = 0, minD = 99;
      Player.events.length = 0;
      while (t < 3) {
        Player.step(1 / 120); t += 1 / 120;
        if (!Player.ground) air += 1 / 120;
        maxUp = Math.max(maxUp, Player.pos.y - World.height(Player.pos.x, Player.pos.z));
        minD = Math.min(minD, Math.hypot(Player.pos.x - r.x, Player.pos.z - r.z));
        const cr = Player.events.find((e) => e.type === 'crash'); if (cr) { out = 'CRASH ' + cr.reason; break; }
        const b = Player.events.find((e) => e.type === 'bump' && e.kind === 'wall'); if (b && out === 'passed') out = 'wall-slide';
        Player.events.length = 0;
      }
      const vis = r.y + r.ay - World.height(r.x, r.z);
      console.log(`rock r=${r.r.toFixed(1)} sticks up ${vis.toFixed(2)}m  speed ${sp} off ${off} angle ${ang}: ${out}, rose ${maxUp.toFixed(2)}m, air ${air.toFixed(2)}s, closest ${minD.toFixed(1)}m, end speed ${Player.speed.toFixed(1)}`);
    }
  }
}
