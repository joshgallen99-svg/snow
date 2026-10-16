import { threeIIFE, gameSources } from './build.mjs';
const src = threeIIFE() + gameSources((f) => /^(00|01|02|03|04|05|10)_/.test(f));
const M = new Function(src + '\nreturn {generateTerrain, World, Scatter, Player, Input};')();
const g = M.generateTerrain(); for (const s of g.steps) s(); M.World.init(g.finish());
const st = []; M.Scatter.run(st); for (const s of st) s();
const { World, Player, Input } = M;
const k = World.kickers[+process.argv[2] || 2], mode = process.argv[3] || 'roll';
console.log('kicker len', k.len, 'lip', k.lip.toFixed(2), 'p', k.p);
let space = false; Input.steer = () => 0; Input.fwd = () => 0; Input.is = (c) => c === 'Space' && space; Input.hit = () => false;
Player.reset(k.x0 - k.dx * 25, k.z0 - k.dz * 25, Math.atan2(k.dx, k.dz), 15);
let t = 0, took = false, n = 0;
while (t < 6) {
  const u = (Player.pos.x - k.x0) * k.dx + (Player.pos.z - k.z0) * k.dz;
  if (mode === 'pop' && Player.ground) space = u > k.len - 5 && u < k.len - 0.8; else space = false;
  Player.step(1 / 120); t += 1 / 120;
  for (const e of Player.events) console.log('   event', e.type, e.reason || '', e.impact ? e.impact.toFixed(1) : '');
  Player.events.length = 0;
  if (u > k.len - 3 && n++ % 6 === 0 && n < 140) console.log(`u ${u.toFixed(1).padStart(6)} y-terr ${(Player.pos.y - World.height(Player.pos.x, Player.pos.z)).toFixed(2).padStart(6)} vy ${Player.vel.y.toFixed(2).padStart(6)} sp ${Player.vel.length().toFixed(1)} ground ${Player.ground}`);
  if (!Player.ground) took = true; else if (took && n > 60) break;
}
