// run the chase camera headlessly over every run and kicker: is the line from the rider to the camera
// ever blocked, and does the rider stay in frame in the air?
import { threeIIFE, gameSources } from './build.mjs';
const src = threeIIFE() + gameSources((f) => /^(00|01|02|03|04|05|10|14)_/.test(f));
const M = new Function(src + '\nreturn {generateTerrain, World, Scatter, Player, Input, Cam, U, wrapAngle, clamp, V3: THREE.Vector3};')();
const g = M.generateTerrain(); for (const s of g.steps) s(); M.World.init(g.finish());
const st = []; M.Scatter.run(st); for (const s of st) s();
const { World, Player, Input, Cam, wrapAngle, clamp, V3 } = M;
let ap = { steer: 0, fwd: 0, space: false };
Input.steer = () => ap.steer; Input.fwd = () => ap.fwd; Input.is = (k) => k === 'Space' && ap.space; Input.hit = () => false;
Cam.init(16 / 9); Cam.mode = 'chase';
const cam = Cam.cam;
let frames = 0, blocked = 0, offscreen = 0, airFrames = 0, minDist = 99;
for (const rd of World.runData) {
  const c = World.pathAt(rd, 8);
  Player.reset(c.x, c.z, Math.atan2(c.tx, c.tz), 6);
  Cam.dir.set(c.tx, 0, c.tz); Cam.camY = null; Cam.snap();
  cam.position.set(c.x - c.tx * 6, World.height(c.x, c.z) + 3, c.z - c.tz * 6); Cam.look.set(c.x, World.height(c.x, c.z), c.z);
  let t = 0, hint = 0;
  while (t < 60) {
    const near = World.nearestOnRun(rd, Player.pos.x, Player.pos.z, hint); hint = near.i;
    if (near.s > rd.path.len - 12 || Player.crashed) break;
    const tgt = World.pathAt(rd, near.s + 22);
    const des = Math.atan2(tgt.x - Player.pos.x, tgt.z - Player.pos.z);
    const head = Player.ride > 0 ? Player.yaw : Player.yaw + Math.PI;
    ap.steer = clamp(wrapAngle(des - head) * 2.5, -1, 1);
    ap.fwd = Player.speed > 16 ? -1 : 0;
    for (let k = 0; k < 2; k++) Player.step(1 / 120);
    t += 1 / 60;
    Cam.update(1 / 60, { player: Player });
    frames++;
    const eye = Cam.eye(Player);
    if (Cam.blockedAt(eye, cam.position) < 1) blocked++;
    minDist = Math.min(minDist, cam.position.distanceTo(eye));
    // is the rider inside the middle 80% of the view?
    const p = eye.clone().project(cam);
    if (!Player.ground) { airFrames++; if (Math.abs(p.x) > 0.8 || Math.abs(p.y) > 0.8 || p.z > 1) offscreen++; }
  }
}
console.log(`frames ${frames}, blocked ${blocked}, air frames ${airFrames}, rider off-centre in air ${offscreen}, closest camera ${minDist.toFixed(2)}m`);
// big airs off every kicker: where does the rider sit in the frame?
let worst = 0, worstK = -1, cnt = 0, off2 = 0;
for (const [i, k] of World.kickers.entries()) {
  Player.reset(k.x0 - k.dx * 25, k.z0 - k.dz * 25, Math.atan2(k.dx, k.dz), 13);
  Cam.dir.set(k.dx, 0, k.dz); Cam.camY = null;
  cam.position.copy(Player.pos).add(new V3(-k.dx * 6, 3, -k.dz * 6));
  let t = 0, took = false;
  while (t < 6) {
    if (Player.ground) { const u = (Player.pos.x - k.x0) * k.dx + (Player.pos.z - k.z0) * k.dz; ap.space = u > k.len - 4 && u < k.len - 0.8; } else ap.space = false;
    ap.steer = 0; ap.fwd = 0;
    for (let s = 0; s < 2; s++) Player.step(1 / 120);
    t += 1 / 60;
    Cam.update(1 / 60, { player: Player });
    if (!Player.ground) {
      took = true; cnt++;
      const p = Cam.eye(Player).project(cam);
      const m = Math.max(Math.abs(p.x), Math.abs(p.y));
      if (m > 0.75) off2++;
      if (m > worst) { worst = m; worstK = i; }
    } else if (took) break;
  }
}
console.log(`kicker air frames ${cnt}, rider outside middle 75% ${off2}, worst ${worst.toFixed(2)} (kicker ${worstK})`);
