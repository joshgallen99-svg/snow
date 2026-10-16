// ============================================================================
//  camera rig — chase, cinematic jump cam, slow-mo orbit, lift ride, lodge,
//  map. Every mode produces a desired pose; switches blend smoothly.
// ============================================================================
const Cam = {
  cam: null, mode: 'lodge', pose: { pos: new V3(), look: new V3(), fov: 60, roll: 0 },
  from: null, blendT: 1, blendDur: 0.8,
  dir: new V3(0, 0, 1), shake: 0, cine: null, cineOn: false,
  orbit: { yaw: 0, pitch: 0.25, dist: 6 },
  look: new V3(),

  init(aspect) {
    this.cam = new THREE.PerspectiveCamera(60, aspect, 0.15, 20000);
    this.cam.layers.enable(0);
    return this.cam;
  },
  setMode(mode, dur = 0.8) {
    if (mode === this.mode) return;
    this.from = { pos: this.cam.position.clone(), look: this.look.clone(), fov: this.cam.fov, roll: 0 };
    this.blendT = 0; this.blendDur = dur;
    this.mode = mode;
  },
  snap() { this.from = null; this.blendT = 1; },

  // ---- per-mode desired poses ------------------------------------------------------
  chasePose(pl, dt, out) {
    const vh = new V3(pl.vel.x, 0, pl.vel.z);
    const sp = vh.length();
    const want = sp > 2 ? vh.normalize() : new V3(Math.sin(pl.yaw) * pl.ride, 0, Math.cos(pl.yaw) * pl.ride);
    const a0 = Math.atan2(this.dir.x, this.dir.z), a1 = Math.atan2(want.x, want.z);
    // follow the direction of travel (spins don't change it, so the camera never swings with them)
    const a = dampAngle(a0, a1, 3.2, dt);
    this.dir.set(Math.sin(a), 0, Math.cos(a));
    const speed = pl.vel.length();
    const fast = sstep(8, 30, speed);
    const airborne = !pl.ground && !pl.grind && !pl.crashed;
    // jumps don't move the camera: it behaves exactly as on the ground, so landings stay readable
    this.airK = 0;
    const dist = 5.6 + speed * 0.04, height = 2.7 - fast * 0.55;
    // track the rider's height closely: a touch of lag in the air, none on the ground
    this.camY = pl.pos.y;
    const base = new V3(pl.pos.x, this.camY + 1.1, pl.pos.z);
    out.pos.copy(base).addScaledVector(this.dir, -dist).add(new V3(0, height, 0));
    // stay well above the snow (the fresh layer can be 60 cm deep), uphill of the rider included
    const gh = World.groundHeight(out.pos.x, out.pos.z) + 1.5;
    if (out.pos.y < gh) out.pos.y = gh;
    // look at the rider; on the ground lead the aim down the hill, in the air aim a little toward the landing
    const lookAt = new V3().copy(pl.pos).add(new V3(0, 0.9, 0));
    out.look.copy(lookAt).addScaledVector(this.dir, 3.5 * (1 - this.airK)).addScaledVector(pl.vel, 0.12 * (1 - this.airK));
    if (this.airK > 0.01) out.look.addScaledVector(this.dir, 1.2 * this.airK).add(new V3(0, clamp(pl.vel.y * 0.08, -1.2, 0.3) * this.airK, 0));
    // never through the snow, a building, a tree or a rock
    this.clear(this.eye(pl), out.pos, out.pos);
    // wide-angle rush at speed, plus a kick when you're accelerating hard
    const acc = (speed - (this.lastSpeed ?? speed)) / Math.max(dt, 1e-3);
    this.lastSpeed = speed;
    this.accFov = damp(this.accFov || 0, clamp(acc * 0.9, -2, 6), 3, dt);
    out.fov = 58 + Math.pow(fast, 1.3) * 30 * (1 - this.airK * 0.35) + pl.tuck * 5 + (pl.ground ? this.accFov : 0);
    out.roll = airborne ? 0 : -pl.edge * 0.06 * pl.ride;
    return out;
  },
  eye(pl) { return new V3().copy(pl.ragdollCenter || pl.pos).add(new V3(0, 1.0, 0)); },
  // first point along a → b that's inside something solid (1 = clear)
  _cc: [],
  blockedAt(a, b) {
    const len = a.distanceTo(b);
    World.queryColliders((a.x + b.x) / 2, (a.z + b.z) / 2, len / 2 + 6, this._cc);
    const n = Math.max(6, Math.ceil(len / 0.5));
    const p = new V3();
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      p.lerpVectors(a, b, t);
      if (p.y < World.groundHeight(p.x, p.z) + 0.8) return t;
      // whatever the rider is brushing past right now doesn't count
      if (t * len < 1.6) continue;
      for (const c of this._cc) {
        if (c.kind === 'rock' || c.kind === 'pole' || c.kind === 'sign' || c.kind === 'rail') continue;
        if (c.kind === 'tree') {
          const R = c.r * 2.6 + 0.4;
          if ((p.x - c.x) ** 2 + (p.z - c.z) ** 2 < R * R && p.y < c.top) return t;
        } else if (p.y < c.top + 0.4 && World.colliderPush(c, p.x, p.z, 0.45)) return t;
      }
    }
    return 1;
  },
  // move a camera position so the line from the rider to it is clear: lift it first, then pull it in
  clear(eye, want, out, lift = true) {
    const t0 = this.blockedAt(eye, want);
    if (t0 >= 1) { out.copy(want); return false; }
    const up = new V3();
    if (lift) for (const lift of [1.2, 2.5, 4]) {
      up.copy(want); up.y += lift;
      if (this.blockedAt(eye, up) >= 1) { out.copy(up); return true; }
    }
    // pulled in, but never right onto the rider's head
    const len = eye.distanceTo(want);
    out.lerpVectors(eye, want, clamp(Math.max(t0 - 0.1, 1.8 / Math.max(len, 1e-3)), 0, 1));
    return true;
  },
  cinePose(pl, out) {
    const C = this.cine;
    out.pos.copy(C.anchor);
    out.look.copy(pl.pos).add(new V3(0, 0.9, 0));
    out.fov = 46;
    out.roll = 0;
    return out;
  },
  startCine(pl) {
    return; // no cinematic jump camera: it made landings harder
    if (!this.cineOn) return;
    const vy = pl.vel.y, t = Math.max(0, (vy + Math.sqrt(Math.max(0, vy * vy + 2 * 9.81 * 3))) / 9.81);
    if (t < 1.05) return;
    const vh = new V3(pl.vel.x, 0, pl.vel.z), sp = vh.length(); vh.normalize();
    const apex = new V3().copy(pl.pos).addScaledVector(vh, sp * Math.min(t, 2.4) * 0.5);
    const side = new V3(-vh.z, 0, vh.x).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
    const anchor = apex.clone().addScaledVector(side, 11 + sp * 0.2).addScaledVector(vh, 3);
    anchor.y = Math.max(World.groundHeight(anchor.x, anchor.z) + 1.6, pl.pos.y - 1.5);
    this.cine = { anchor, t: 0 };
    this.setMode('cine', 0.35);
  },
  orbitPose(pl, out) {
    const O = this.orbit;
    const c = new V3().copy(pl.ragdollCenter || pl.pos).add(new V3(0, 0.9, 0));
    out.pos.set(c.x + Math.sin(O.yaw) * Math.cos(O.pitch) * O.dist, c.y + Math.sin(O.pitch) * O.dist, c.z + Math.cos(O.yaw) * Math.cos(O.pitch) * O.dist);
    const gh = World.groundHeight(out.pos.x, out.pos.z) + 0.4;
    if (out.pos.y < gh) out.pos.y = gh;
    out.look.copy(c);
    out.fov = 55; out.roll = 0;
    return out;
  },

  update(dt, ctx) {
    const P = this.pose;
    const m = this.mode;
    if (m === 'chase') this.chasePose(ctx.player, dt, P);
    else if (m === 'cine') this.cinePose(ctx.player, P);
    else if (m === 'orbit') this.orbitPose(ctx.player, P);
    else if (ctx.pose) { P.pos.copy(ctx.pose.pos); P.look.copy(ctx.pose.look); P.fov = ctx.pose.fov; P.roll = ctx.pose.roll || 0; }
    // smoothing: chase gets a spring so the camera lags a touch behind the action
    const cam = this.cam;
    if (!this.from && (m === 'chase')) {
      const air = this.airK || 0;
      cam.position.lerp(P.pos, 1 - Math.exp(-lerp(10, 5, air) * dt));
      this.look.lerp(P.look, 1 - Math.exp(-lerp(14, 7, air) * dt));
      cam.fov = damp(cam.fov, P.fov, 3, dt);
    } else if (!this.from) {
      cam.position.lerp(P.pos, 1 - Math.exp(-(m === 'cine' ? 30 : 12) * dt));
      this.look.lerp(P.look, 1 - Math.exp(-(m === 'cine' ? 30 : 12) * dt));
      cam.fov = damp(cam.fov, P.fov, 6, dt);
    } else {
      this.blendT = Math.min(1, this.blendT + dt / this.blendDur);
      const k = this.blendT * this.blendT * (3 - 2 * this.blendT);
      cam.position.lerpVectors(this.from.pos, P.pos, k);
      this.look.lerpVectors(this.from.look, P.look, k);
      cam.fov = lerp(this.from.fov, P.fov, k);
      if (this.blendT >= 1) this.from = null;
    }
    // whatever the smoothing did, the camera itself never ends up behind a wall or under the snow
    if (ctx.player && (m === 'chase' || m === 'cine' || m === 'orbit')) this.clear(this.eye(ctx.player), cam.position, cam.position, false);
    // shake: speed rumble + impact kicks
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const spd = ctx.player && m === 'chase' && ctx.player.ground ? sstep(12, 32, ctx.player.speed) * 0.07 : 0;
    const amp = spd + this.shake * 0.25;
    const t = U.uTime.value;
    const sx = (Math.sin(t * 37.1) + Math.sin(t * 23.3)) * amp, sy = (Math.sin(t * 41.7) + Math.cos(t * 29.1)) * amp;
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look.x + sx, this.look.y + sy, this.look.z);
    if (P.roll) cam.rotateZ(P.roll);
    // near plane per mode keeps depth precision where it's needed
    const near = m === 'map' ? clamp(cam.position.y * 0.0015, 0.5, 4) : m === 'lift' || m === 'lodge' ? 0.3 : 0.15;
    if (Math.abs(cam.near - near) > 0.01) cam.near = near;
    cam.updateProjectionMatrix();
  },
  kick(a) { this.shake = Math.min(1.5, this.shake + a); },
};
