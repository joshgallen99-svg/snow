import { threeIIFE, gameSources } from './build.mjs';
const src = threeIIFE() + gameSources((f) => /^(00|01|02|03|04|05|10)_/.test(f));
const M = new Function(src + '\nreturn {generateTerrain, World, Scatter, Player, Input};')();
const g = M.generateTerrain(); for (const s of g.steps) s(); M.World.init(g.finish());
const st = []; M.Scatter.run(st); for (const s of st) s();
const { World, Player, Input } = M;
let space = false; Input.steer = () => 0; Input.fwd = () => 0; Input.is = (k) => k === 'Space' && space; Input.hit = () => false;
for (const [i, k] of World.kickers.entries()) {
  for (const mode of ['roll', 'pop']) {
    Player.reset(k.x0 - k.dx * 25, k.z0 - k.dz * 25, Math.atan2(k.dx, k.dz), +(process.env.V || 15));
    let t = 0, air = 0, maxH = 0, took = false, perfect = false, popped = false;
    while (t < 8) {
      if (mode === 'pop' && Player.ground) {
        const u = (Player.pos.x - k.x0) * k.dx + (Player.pos.z - k.z0) * k.dz;
        space = u > k.len - 5 && u < k.len - 0.8;
      } else space = false;
      Player.step(1 / 120); t += 1 / 120;
      for (const e of Player.events) if (e.type === 'perfectPop') perfect = true;
      Player.events.length = 0;
      if (!Player.ground && !Player.grind) { took = true; air += 1 / 120; maxH = Math.max(maxH, Player.pos.y - World.height(Player.pos.x, Player.pos.z)); }
      else if (took) break;
      if (Player.crashed) break;
    }
    console.log('kicker', i, 'size', k.size, mode.padEnd(4), 'air', air.toFixed(2) + 's', 'height', maxH.toFixed(1) + 'm', perfect ? 'PERFECT' : '', Player.crashed ? 'CRASH' : '');
  }
}
