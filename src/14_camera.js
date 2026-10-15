// ============================================================================
//  camera rig — chase, cinematic jump cam, slow-mo orbit, lift ride, lodge,
//  map. Every mode produces a desired pose; switches blend smoothly.
// ============================================================================
const Cam = {
  cam: null, mode: 'lodge', pose: { pos: new V3(), look: new V3(), fov: 60, roll: 0 },
  from: null, blendT: 1, blendDur: 0.8,
  dir: new V3(0, 0, 1), shake: 0, cine: null, cineOn: true,
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
    const a = dampAngle(a0, a1, pl.ground ? 3.2 : 1.2, dt);
    this.dir.set(Math.sin(a), 0, Math.cos(a));
    const speed = pl.vel.length();
    const dist = 5.0 + speed * 0.075, height = 1.8 + speed * 0.025;
    const base = new V3().copy(pl.pos).add(new V3(0, 1.1, 0));
    out.pos.copy(base).addScaledVector(this.dir, -dist).add(new V3(0, height, 0));
    const gh = World.groundHeight(out.pos.x, out.pos.z) + 1.3;
    if (out.pos.y < gh) out.pos.y = gh;
    const mid = new V3().lerpVectors(base, out.pos, 0.5);
    const mh = World.groundHeight(mid.x, mid.z) + 1.0;
    if (mid.y < mh) out.pos.y += (mh - mid.y) * 2;
    out.look.copy(base).addScaledVector(this.dir, 3.5).addScaledVector(pl.vel, 0.12);
    out.fov = 60 + sstep(5, 30, speed) * 17 + pl.tuck * 3;
    out.roll = -pl.edge * 0.05 * pl.ride;
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
      cam.position.lerp(P.pos, 1 - Math.exp(-10 * dt));
      this.look.lerp(P.look, 1 - Math.exp(-14 * dt));
      cam.fov = damp(cam.fov, P.fov, 4, dt);
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
    const spd = ctx.player && m === 'chase' ? sstep(16, 32, ctx.player.speed) * 0.035 : 0;
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
