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
    // in the air the heading holds steady (spins don't swing the camera)
    const a = dampAngle(a0, a1, pl.ground || pl.grind ? 3.2 : 0.6, dt);
    this.dir.set(Math.sin(a), 0, Math.cos(a));
    const speed = pl.vel.length();
    const fast = sstep(8, 30, speed);
    // the camera tucks in lower and a little closer as you go faster
    const dist = 5.2 + speed * 0.04, height = 1.9 - fast * 0.55;
    // vertically, the camera rides a smoothed height in the air so it glides instead of bobbing
    const airborne = !pl.ground && !pl.grind && !pl.crashed;
    if (this.airY == null || !airborne) this.airY = pl.pos.y;
    else this.airY = damp(this.airY, pl.pos.y, pl.vel.y < 0 ? 2.6 : 1.4, dt);
    this.airK = damp(this.airK || 0, airborne ? 1 : 0, airborne ? 3 : 5, dt);
    const base = new V3().copy(pl.pos).add(new V3(0, 1.1, 0));
    base.y = lerp(pl.pos.y, lerp(this.airY, pl.pos.y, 0.35), this.airK) + 1.1;
    out.pos.copy(base).addScaledVector(this.dir, -dist).add(new V3(0, height, 0));
    const gh = World.groundHeight(out.pos.x, out.pos.z) + 1.3;
    if (out.pos.y < gh) out.pos.y = gh;
    // keep the camera out of tree canopies: pull in toward the rider before the first one
    World.queryColliders((base.x + out.pos.x) / 2, (base.z + out.pos.z) / 2, dist * 0.6 + 4, this._cc || (this._cc = []));
    let tMin = 1;
    for (const c of this._cc) {
      if (c.kind !== 'tree') continue;
      const R = c.r * 2.6 + 0.4;
      for (let k = 2; k <= 10; k++) {
        const t = k / 10;
        const x = lerp(base.x, out.pos.x, t), z = lerp(base.z, out.pos.z, t);
        if ((x - c.x) ** 2 + (z - c.z) ** 2 < R * R && lerp(base.y, out.pos.y, t) < c.top) { tMin = Math.min(tMin, t - 0.1); break; }
      }
    }
    if (tMin < 1) out.pos.lerpVectors(base, out.pos, Math.max(0.35, tMin)).add(new V3(0, (1 - tMin) * 1.2, 0));
    const mid = new V3().lerpVectors(base, out.pos, 0.5);
    const mh = World.groundHeight(mid.x, mid.z) + 1.0;
    if (mid.y < mh) out.pos.y += (mh - mid.y) * 2;
    // look at the rider; in the air drift the aim toward where you'll come down
    const lookAt = new V3().copy(pl.pos).add(new V3(0, 0.9, 0));
    out.look.copy(lookAt).addScaledVector(this.dir, 3.5 * (1 - this.airK)).addScaledVector(pl.vel, 0.12 * (1 - this.airK));
    if (this.airK > 0.01) out.look.addScaledVector(this.dir, 2.5 * this.airK).add(new V3(0, -0.6 * this.airK, 0));
    // wide-angle rush at speed, plus a kick when you're accelerating hard
    const acc = (speed - (this.lastSpeed ?? speed)) / Math.max(dt, 1e-3);
    this.lastSpeed = speed;
    this.accFov = damp(this.accFov || 0, clamp(acc * 0.9, -2, 6), 3, dt);
    out.fov = 58 + Math.pow(fast, 1.3) * 30 + pl.tuck * 5 + (pl.ground ? this.accFov : 0);
    out.roll = airborne ? 0 : -pl.edge * 0.06 * pl.ride;
    return out;
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
