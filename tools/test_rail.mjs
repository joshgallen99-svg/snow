import { threeIIFE, gameSources } from './build.mjs';
const src = threeIIFE() + gameSources((f) => /^(00|01|02|03|04|05|10)_/.test(f));
const M = new Function(src + '\nreturn {generateTerrain, World, Scatter, Player, Input};')();
const g = M.generateTerrain(); for (const s of g.steps) s(); M.World.init(g.finish());
const st = []; M.Scatter.run(st); for (const s of st) s();
const { World, Player, Input } = M;
let steerV = 0; Input.steer = () => steerV; Input.fwd = () => 0; Input.is = () => false; Input.hit = () => false;
// a long test rail so balance, not length, ends the grind
const rail = Object.assign({}, World.grinds.find((r) => r.kind === 'rail'), { len: 400 });
rail.by = rail.ay - 400 * 0.05;
for (const mode of ['none', 'player', 'lazy']) {
  const times = [];
  for (let trial = 0; trial < 20; trial++) {
    Player.reset(rail.ax, rail.az, Math.atan2(rail.dx, rail.dz), 8);
    Player.startGrind(rail, 1, 8);
    let t = 0;
    while (Player.grind && t < 30) {
      const b = Player.grind.bal, v = Player.grind.balV;
      // a human-ish controller: reacts to where the needle is heading, with reaction delay noise
      if (mode === 'player') steerV = b + v * 0.35 > 0.12 ? 1 : b + v * 0.35 < -0.12 ? -1 : 0;
      else if (mode === 'lazy') steerV = b > 0.6 ? 1 : b < -0.6 ? -1 : 0;
      else steerV = 0;
      Player.step(1 / 120); t += 1 / 120;
    }
    times.push(t);
  }
  times.sort((a, b) => a - b);
  console.log(mode.padEnd(7), 'median time on rail', times[10].toFixed(1) + 's', 'min', times[0].toFixed(1), 'max', times[19].toFixed(1));
}
