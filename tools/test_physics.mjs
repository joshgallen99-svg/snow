import fs from 'fs';
import { threeIIFE, gameSources } from './build.mjs';
const keep = (f) => /^(00|01|02|03|04|05|10)_/.test(f);
const src = threeIIFE() + gameSources(keep);
const M = new Function(src + '\nreturn {generateTerrain, World, Scatter, RUNS, Player, Input, wrapAngle, clamp};')();
const g = M.generateTerrain(); for (const s of g.steps) s();
M.World.init(g.finish());
const steps=[]; M.Scatter.run(steps); for (const s of steps) s();
const { World, Player, Input, RUNS } = M;
let ap = { steer: 0, fwd: 0 };
Input.steer = () => ap.steer; Input.fwd = () => ap.fwd; Input.is = () => false; Input.hit = () => false;
const maxV = { green: 13, red: 18, park: 12, black: 17, double: 16 };
for (const rd of World.runData) {
  const run = rd.run;
  const c = World.pathAt(rd, 8);
  Player.reset(c.x, c.z, Math.atan2(c.tx, c.tz), 0);
  let t = 0, crashes = [], vmax = 0, stuck = 0, hint = 0, finished = false, airs = 0, jumpsAir = 0;
  Player.events.length = 0;
  while (t < 400) {
    const dt = 1 / 120;
    const near = World.nearestOnRun(rd, Player.pos.x, Player.pos.z, hint); hint = near.i;
    if (near.s > rd.path.len - 12) { finished = true; break; }
    const tgt = World.pathAt(rd, near.s + 22);
    const des = Math.atan2(tgt.x - Player.pos.x, tgt.z - Player.pos.z);
    const head = Player.ride > 0 ? Player.yaw : Player.yaw + Math.PI;
    const err = M.wrapAngle(des - head);
    ap.steer = M.clamp(err * 2.5, -1, 1);
    ap.fwd = !Player.ground ? 0 : Player.speed > maxV[run.diff] ? -1 : (Player.speed < 4 ? 1 : 0);
    Player.step(dt); t += dt;
    vmax = Math.max(vmax, Player.speed);
    if (Player.crashed) {
      crashes.push(Player.events.filter(e=>e.type==='crash').pop().reason + '@' + Math.round(near.s));
      const sf = Player.safe; Player.reset(sf.x, sf.z, Player.fallLineYaw(sf.x, sf.z), 0);
    }
    stuck = Player.speed < 0.4 ? stuck + dt : 0;
    if (stuck > 6) { crashes.push('STUCK@' + Math.round(near.s)); break; }
    for (const e of Player.events) if (e.type === 'land' && e.air > 0.3) airs++;
    Player.events.length = 0;
  }
  console.log(run.id.padEnd(12), finished ? 'FINISH' : 'DNF   ', 't=' + t.toFixed(1).padStart(6), 'len', rd.path.len.toFixed(0).padStart(5), 'vmax', (vmax * 3.6).toFixed(0).padStart(3) + 'km/h', 'airs', airs, crashes.slice(0, 8).join(' '));
}
