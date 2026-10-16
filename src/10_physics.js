// ============================================================================
//  input + rider physics: carving, air, tricks, grinds, crashes
// ============================================================================
const Input = {
  down: new Set(), hits: new Set(), mouse: { x: 0, y: 0, dx: 0, dy: 0, buttons: 0, wheel: 0, inside: false },
  init(el) {
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      const k = e.code;
      if (!this.down.has(k)) this.hits.add(k);
      this.down.add(k);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
    el.addEventListener('pointermove', (e) => {
      this.mouse.dx += e.movementX || 0; this.mouse.dy += e.movementY || 0;
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true;
    });
    el.addEventListener('pointerdown', (e) => { this.mouse.buttons = e.buttons; this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.hits.add('Mouse' + e.button); });
    addEventListener('pointerup', (e) => { this.mouse.buttons = e.buttons; });
    el.addEventListener('pointerleave', () => { this.mouse.inside = false; });
    el.addEventListener('wheel', (e) => { this.mouse.wheel += e.deltaY * (e.ctrlKey ? 3 : 1); e.preventDefault(); }, { passive: false });
  },
  is(...codes) { return codes.some((c) => this.down.has(c)); },
  hit(...codes) { return codes.some((c) => this.hits.has(c)); },
  endFrame() { this.hits.clear(); this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0; },
  steer() { return (this.is('KeyA', 'ArrowLeft') ? 1 : 0) - (this.is('KeyD', 'ArrowRight') ? 1 : 0); },
  fwd() { return (this.is('KeyW', 'ArrowUp') ? 1 : 0) - (this.is('KeyS', 'ArrowDown') ? 1 : 0); },
};

const GRAB_KEYS = { KeyJ: 'indy', KeyK: 'melon', KeyL: 'tail', KeyI: 'nose' };
// two grab keys at once make a two-handed or tweaked grab
const GRAB_COMBOS = { 'indy+melon': 'truck', 'melon+tail': 'method', 'indy+nose': 'japan', 'indy+tail': 'stalefish', 'melon+nose': 'mute', 'nose+tail': 'crail' };
const GRAB_NAMES = { indy: 'Indy', melon: 'Melon', tail: 'Tail Grab', nose: 'Nose Grab', truck: 'Truck Driver', method: 'Method', japan: 'Japan', stalefish: 'Stalefish', mute: 'Mute', crail: 'Crail' };
// how each grab bends the board (roll about its length, pitch nose up)
const GRAB_TWEAK = { indy: [0.22, 0], melon: [-0.22, 0], tail: [0, 0.3], nose: [0, -0.3], truck: [0, 0], method: [-0.75, 0.15], japan: [0.5, -0.35], stalefish: [-0.4, 0.1], mute: [0.35, -0.1], crail: [0.15, -0.45] };
const PRESS_KEYS = { lead: 'KeyQ', trail: 'KeyF' };
const UP = new V3(0, 1, 0);

const Player = {
  pos: new V3(), vel: new V3(), yaw: 0, n: new V3(0, 1, 0), ground: true, stance: 1,
  edge: 0, crouch: 0.2, charge: 0, tuck: 0, brake: 0, steerS: 0,
  air: null, grind: null, crashed: false, crashT: 0,
  airUp: new V3(0, 1, 0), flip: 0, flipVel: 0, spinVel: 0,
  surf: { groom: 0, powder: 0, road: 0, run: 255 },
  events: [], safe: null, safeT: 0, lastLand: -10, time: 0, ride: 1, skid: 0, speed: 0,
  combo: { n: 0, pts: 0, t: 0 }, frozen: false, sink: 0, carve: 0,
  press: 0, pitch: 0, butter: null, butterSpin: 0, tweakR: 0, tweakP: 0,
  _col: [],

  reset(x, z, yaw, speed = 0) {
    const y = World.groundHeight(x, z);
    this.pos.set(x, y, z);
    this.yaw = yaw;
    World.groundNormal(x, z, this.n);
    const f = new V3(Math.sin(yaw), 0, Math.cos(yaw));
    f.addScaledVector(this.n, -f.dot(this.n)).normalize();
    this.vel.copy(f).multiplyScalar(speed);
    Object.assign(this, { ground: true, air: null, grind: null, crashed: false, crashT: 0, edge: 0, charge: 0, flip: 0, flipVel: 0, spinVel: 0, ride: 1, skid: 0, press: 0, pitch: 0, butter: null, butterSpin: 0, tweakR: 0, tweakP: 0 });
    this.airUp.copy(this.n);
    this.safe = { x, z, yaw };
    this.combo = { n: 0, pts: 0, t: 0 };
  },
  fallLineYaw(x, z) {
    const n = World.normal(x, z, new V3());
    return Math.atan2(n.x, n.z);
  },
  emit(type, data = {}) { this.events.push(Object.assign({ type, t: this.time }, data)); },
  surface() {
    const x = this.pos.x, z = this.pos.z;
    this.surf.groom = World.attr(World.groom, x, z) / 255;
    this.surf.powder = World.attr(World.powder, x, z) / 255;
    this.surf.road = Scatter.road ? World.attr(Scatter.road, x, z) / 255 : 0;
    this.surf.run = World.attr(World.runId, x, z);
    return this.surf;
  },

  step(dt) {
    this.time += dt;
    if (this.crashed || this.frozen) return;
    const steer = Input.steer(), fb = Input.fwd();
    this.steerS = damp(this.steerS, steer, 10, dt);
    // Q presses the leading end of the board into the snow, F the trailing end
    const pressIn = Input.is(PRESS_KEYS.lead) ? 1 : Input.is(PRESS_KEYS.trail) ? -1 : 0;
    this.press = damp(this.press, this.ground || this.grind ? pressIn : 0, 12, dt);
    // board pitch: the pressed end goes down (positive = nose up)
    this.pitch = -this.press * this.ride * 0.26;
    if (!this.air) { this.tweakR = damp(this.tweakR, 0, 10, dt); this.tweakP = damp(this.tweakP, 0, 10, dt); }
    if (this.grind) this.stepGrind(dt, steer);
    else if (this.ground) this.stepGround(dt, steer, fb);
    else this.stepAir(dt, steer, fb);
    if (!this.crashed && !this.grind) this.collide();
    this.speed = this.vel.length();
    // combo window
    if (this.combo.n && this.time - this.lastLand > 2.6 && this.ground) {
      this.emit('comboEnd', { pts: this.combo.pts, n: this.combo.n });
      this.combo = { n: 0, pts: 0, t: 0 };
    }
  },

  stepGround(dt, steer, fb) {
    const S = this.surface();
    const n = World.groundNormal(this.pos.x, this.pos.z, this.n);
    const f = _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const fwd = new V3().copy(f).addScaledVector(n, -f.dot(n)).normalize();
    let vT = new V3().copy(this.vel).addScaledVector(n, -this.vel.dot(n));
    let speed = vT.length();
    const tuck = fb > 0 ? 1 : 0, brake = fb < 0 ? 1 : 0;
    this.tuck = damp(this.tuck, tuck, 6, dt);
    this.brake = damp(this.brake, brake, 8, dt);
    // which way are we riding relative to the nose
    if (speed > 1.2) this.ride = vT.dot(fwd) >= 0 ? 1 : -1;
    const travel = new V3().copy(fwd).multiplyScalar(this.ride);
    // steering: board yaw follows input; slower in powder, quicker at low speed
    const turnRate = lerp(2.7, 1.25, sstep(0, 26, speed)) * (1 - S.powder * 0.3) * (1 - this.tuck * 0.35);
    const B = this.updateButter(dt, steer, speed, S);
    if (B) {
      // buttering: the board pivots on the pressed end while you keep sliding the way you were going
      this.yaw += this.butterSpin * dt;
      B.spin += this.butterSpin * dt;
    } else this.yaw += steer * turnRate * dt * (this.charge > 0 ? 0.6 : 1) * (1 - Math.abs(this.press) * 0.4);
    if (this.brake > 0.05 && speed > 1.5 && !B) {
      // skid: swing the board across the fall line, toward the uphill side of travel
      const vh = Math.atan2(vT.x, vT.z);
      const side = Math.abs(steer) > 0.1 ? steer : (this.lastSkidSide || 1);
      this.lastSkidSide = side;
      this.yaw = dampAngle(this.yaw, vh + side * 1.35 * this.ride, 7 * this.brake, dt);
    }
    // grip: rotate the velocity toward the board; whatever doesn't rotate skids
    let skid = 0;
    if (speed > 0.6) {
      const lat = new V3().crossVectors(n, travel);
      const a = Math.atan2(vT.dot(lat), vT.dot(travel));
      const grip = (S.groom > 0.5 ? 7.5 : 5.5) * (1 - S.powder * 0.35) * (this.brake > 0.3 ? 0.25 : 1) * (B ? 0.04 : 1);
      const rot = clamp(a, -grip * dt, grip * dt);
      vT.applyAxisAngle(n, -rot);
      skid = Math.abs(Math.sin(clamp(a - rot, -Math.PI / 2, Math.PI / 2)));
      // skidding sideways sheds speed; a butter pivots on one end, so it barely scrubs
      const loss = ((B ? 0.12 : 0.9) * skid + this.brake * 0.35) * 9.81 * n.y * dt;
      speed = vT.length();
      if (speed > 1e-4) vT.multiplyScalar(Math.max(0, speed - loss) / speed);
    }
    this.skid = damp(this.skid, B ? skid * 0.25 : skid, 12, dt);
    // forces
    const g = new V3(0, -9.81, 0); g.addScaledVector(n, 9.81 * n.y);
    vT.addScaledVector(g, dt);
    speed = vT.length();
    // deep snow bogs you down when slow and lets you plane on top when fast
    const bog = 1 + 0.9 * (1 - sstep(4, 15, speed));
    const mu = lerp(lerp(0.055, 0.035, S.groom), 0.1 * bog, S.powder * (1 - S.groom)) + S.road * 0.6;
    const drag = this.tuck > 0.5 ? 0.0021 : 0.0036 + this.brake * 0.003;
    if (speed > 1e-3) {
      const dec = (mu * 9.81 * n.y + drag * speed * speed) * dt;
      vT.multiplyScalar(Math.max(0, speed - dec) / speed);
    }
    // skating push on the flats
    if (fb > 0 && speed < 4 && n.y > 0.97) vT.addScaledVector(travel, 1.4 * dt);
    if (vT.length() < 0.25 && fb > 0) vT.addScaledVector(travel, 0.8 * dt);
    // ollie charge / pop
    if (Input.is('Space')) { this.charge = Math.min(1, this.charge + dt * 2.2); }
    else if (this.charge > 0) {
      const k = World.nearKicker(this.pos.x, this.pos.z);
      let pop = 3.2 + 2.6 * this.charge;
      let perfect = false;
      const popDir = n.clone();
      if (k) {
        // on a kicker the ramp does the work; popping right at the edge of the lip adds a burst of speed and height
        const u = (this.pos.x - k.x0) * k.dx + (this.pos.z - k.z0) * k.dz;
        const toLip = k.len - u;
        popDir.lerp(UP, 0.6).normalize();
        if (toLip >= -0.2 && toLip < 1.8) { perfect = true; pop = 1.6 + this.charge * 0.8; vT.multiplyScalar(1.07); }
        else pop = 0.6 + this.charge * 0.6;
      }
      this.vel.copy(vT).addScaledVector(popDir, pop);
      this.charge = 0;
      // popping off the pressed nose is a nollie
      const nollie = this.press * this.ride > 0.5 && !k;
      if (this.butter) this.endButter(true);
      this.takeoff(true);
      this.air.nollie = nollie;
      if (perfect) { this.air.perfect = true; this.emit('perfectPop', {}); }
      return;
    }
    this.carve = Math.abs(steer) * sstep(3, 12, speed);
    // integrate and follow the ground
    const prevY = this.pos.y;
    const kOn = World.nearKicker(this.pos.x, this.pos.z);
    const uPrev = kOn ? (this.pos.x - kOn.x0) * kOn.dx + (this.pos.z - kOn.z0) * kOn.dz : 0;
    this.pos.addScaledVector(vT, dt);
    if (kOn) {
      // leave the lip along the ramp's own angle (ground normals blur across the lip edge)
      const uNew = (this.pos.x - kOn.x0) * kOn.dx + (this.pos.z - kOn.z0) * kOn.dz;
      const L = kOn.len - 0.4;
      if (uPrev < L && uNew >= L) {
        const lat = -(this.pos.x - kOn.x0) * kOn.dz + (this.pos.z - kOn.z0) * kOn.dx;
        const at = (u) => World.groundHeight(kOn.x0 + kOn.dx * u - kOn.dz * lat, kOn.z0 + kOn.dz * u + kOn.dx * lat);
        const slope = (at(L) - at(L - 0.6)) / 0.6;
        const sp = vT.length(), hx = vT.x, hz = vT.z, hl = Math.hypot(hx, hz) || 1;
        const along = (hx * kOn.dx + hz * kOn.dz) / hl;
        this.vel.set(hx / hl, slope * along, hz / hl).normalize().multiplyScalar(sp);
        this.pos.y = at(uNew) + 0.02;
        this.takeoff(false);
        return;
      }
    }
    const h = World.groundHeight(this.pos.x, this.pos.z);
    if (h - this.pos.y > 0.45) {
      // a step too tall to ride up (a drop seen from below, a cliff band): treat it as a wall
      this.pos.x -= vT.x * dt; this.pos.z -= vT.z * dt; this.pos.y = prevY;
      const gn = World.groundNormal(this.pos.x + vT.x * dt * 2, this.pos.z + vT.z * dt * 2, new V3());
      const gl = Math.hypot(gn.x, gn.z) || 1, gx = gn.x / gl, gz = gn.z / gl;
      const into = -(vT.x * gx + vT.z * gz);
      if (into > 9) return this.crash('Hit a wall');
      if (into > 0) { vT.x += gx * into * 1.2; vT.z += gz * into * 1.2; }
      vT.multiplyScalar(0.8);
      this.vel.copy(vT);
      this.emit('bump', { kind: 'wall', into });
      return;
    }
    const gap = this.pos.y - h;
    const needA = (2 * gap) / (dt * dt); // acceleration needed to stay on the ground
    if ((gap > 0.035 && speed > 1.5) || (gap > 0.006 && needA > Math.max(20, 9.81 * n.y * 1.6))) {
      // the ground fell away faster than we did: we're airborne
      this.vel.copy(vT);
      this.takeoff(false);
      return;
    }
    this.pos.y = h;
    if (this.tryGrindGround()) return;
    // re-project velocity on the new plane, keeping speed
    const n2 = World.groundNormal(this.pos.x, this.pos.z, new V3());
    const sp = vT.length();
    vT.addScaledVector(n2, -vT.dot(n2));
    if (vT.lengthSq() > 1e-8) vT.setLength(sp);
    this.vel.copy(vT);
    // visuals
    const edgeT = this.butter ? 0 : clamp(steer * sstep(1, 8, sp) * 0.5 + this.brake * 0.45 * (this.lastSkidSide || 1), -0.75, 0.75);
    this.edge = damp(this.edge, edgeT, 9, dt);
    this.crouch = damp(this.crouch, 0.18 + Math.abs(this.edge) * 0.45 + this.tuck * 0.35 + this.charge * 0.55, 8, dt);
    this.sink = damp(this.sink, S.powder * (1 - S.groom) * 0.16, 4, dt);
    if (typeof Snow !== 'undefined') Snow.stampBoard(this);
    // remember safe spots to respawn
    this.safeT += dt;
    if (this.safeT > 0.6 && sp > 2 && n2.y > 0.8 && S.road < 0.5) {
      this.safeT = 0;
      World.queryColliders(this.pos.x, this.pos.z, 5, this._col);
      if (!this._col.length) this.safe = { x: this.pos.x, z: this.pos.z, yaw: this.yaw };
    }
  },

  // ---- butters: press one end of the board and pivot on it -------------------
  updateButter(dt, steer, speed, S) {
    const pressing = Math.abs(this.press) > 0.55 && speed > 0.8 && S.road < 0.5;
    let B = this.butter;
    if (pressing && !B) B = this.butter = { t: 0, spin: 0, end: Math.sign(this.press), ride0: this.ride };
    if (!B) { this.butterSpin = damp(this.butterSpin, 0, 10, dt); return null; }
    if (!pressing || Math.sign(this.press) !== B.end) { this.endButter(false); return null; }
    B.t += dt;
    // spin with A/D; with no input the board eases back to the nearest straight line
    if (steer) this.butterSpin = damp(this.butterSpin, steer * 5.2, 6, dt);
    else {
      const vh = Math.atan2(this.vel.x, this.vel.z);
      const off = wrapAngle(this.yaw - vh), tgt = Math.abs(off) < Math.PI / 2 ? 0 : Math.PI;
      const d = wrapAngle(off - tgt);
      // keep rolling through to the next straight line if we're spinning fast
      this.butterSpin = Math.abs(this.butterSpin) > 2.5 && Math.abs(d) > 0.25 ? damp(this.butterSpin, Math.sign(this.butterSpin) * 3.4, 4, dt) : damp(this.butterSpin, -d * 7, 10, dt);
    }
    return B;
  },
  endButter(popped) {
    const B = this.butter;
    this.butter = null; this.butterSpin = 0;
    if (!B) return;
    // straighten up if we're nearly lined up
    const vh = Math.atan2(this.vel.x, this.vel.z);
    const off = wrapAngle(this.yaw - vh), tgt = Math.abs(off) < Math.PI / 2 ? 0 : Math.PI, d = wrapAngle(off - tgt);
    if (Math.abs(d) < 0.7) this.yaw -= d;
    const deg = Math.round(Math.abs(B.spin) / Math.PI) * 180;
    const lead = B.end > 0;
    if (deg >= 180) this.registerTrick(`${lead ? 'Nose' : 'Tail'} Butter ${deg}`, Math.round(150 + (deg / 180) * 220 + (deg / 180) ** 2 * 60 + B.t * 60), false);
    else if (B.t > 0.5 && !popped) this.registerTrick(`${lead ? 'Nose' : 'Tail'} Press`, Math.round(60 + Math.min(B.t, 4) * 110), false);
  },

  takeoff(ollie) {
    if (this.butter) this.endButter(true);
    this.ground = false;
    this.coyote = ollie ? 0 : this.charge;
    this.air = {
      t: 0, yaw0: this.yaw, spin: 0, flipTot: 0, grabs: {}, grab: null, ollie, ride: this.ride, y0: this.pos.y,
      maxH: 0, n0: this.n.clone(), latchS: Input.steer(), latchF: Input.fwd(), kicker: !!World.nearKicker(this.pos.x - this.vel.x * 0.05, this.pos.z - this.vel.z * 0.05),
    };
    this.airUp.copy(this.n);
    this.flip = 0; this.flipVel = 0; this.spinVel = 0;
    this.pos.y += 0.02;
    this.emit('takeoff', { ollie });
  },

  stepAir(dt, steer, fb) {
    const A = this.air;
    A.t += dt;
    // fall a little faster than you rise: jumps feel weighty without shortening the climb
    this.vel.y -= 9.81 * (this.vel.y < 0 ? 1.4 : 1) * dt;
    // released Space a moment after rolling off a lip: still counts as a pop
    if (this.coyote > 0 && A.kicker && A.t < 0.14 && !Input.is('Space')) {
      const vh = Math.hypot(this.vel.x, this.vel.z) || 1;
      this.vel.x *= 1 + 0.06 * this.coyote; this.vel.z *= 1 + 0.06 * this.coyote;
      this.vel.y += 1.2 + this.coyote * 0.7;
      this.coyote = 0; A.perfect = true; A.ollie = true;
      this.emit('perfectPop', {});
    } else if (A.t >= 0.14) this.coyote = 0;
    const sp = this.vel.length();
    this.vel.multiplyScalar(1 - 0.0022 * sp * dt);
    // spin and flip with momentum
    // tiny hops off bumps keep carving instead of spinning
    const trickAir = A.ollie || A.kicker || A.fromGrind || A.t > 0.28;
    // inputs held from the ground into the air are latched: carving or tucking into a
    // jump shouldn't start a spin or a flip until the key is pressed again in the air
    if (A.latchS !== 0 && steer !== A.latchS) A.latchS = 0;
    if (A.latchF !== 0 && fb !== A.latchF) A.latchF = 0;
    const spinIn = A.latchS ? 0 : steer, flipIn = A.latchF ? 0 : fb;
    // coming off a boardslide you turn back to straight on your own unless you're spinning
    if (A.fromGrind && !spinIn && Math.abs(this.spinVel) < 1) {
      const vh = Math.atan2(this.vel.x, this.vel.z), off = wrapAngle(this.yaw - vh);
      const d = wrapAngle(off - (Math.abs(off) < Math.PI / 2 ? 0 : Math.PI));
      this.yaw -= clamp(d, -7 * dt, 7 * dt);
    }
    this.spinVel = damp(this.spinVel, trickAir ? spinIn * 6.9 : 0, spinIn ? 7 : 3.5, dt);
    if (!trickAir || A.latchS) this.yaw += steer * 1.6 * dt;
    this.yaw += this.spinVel * dt; A.spin += this.spinVel * dt;
    this.flipVel = damp(this.flipVel, trickAir ? -flipIn * 6.0 : 0, flipIn ? 6 : 3.0, dt);
    this.flip += this.flipVel * dt; A.flipTot += this.flipVel * dt;
    // grabs
    const held = [];
    for (const k in GRAB_KEYS) if (Input.is(k)) held.push(GRAB_KEYS[k]);
    held.sort();
    let g = held.length >= 2 ? GRAB_COMBOS[held[0] + '+' + held[1]] || held[0] : held[0] || null;
    if (g) A.grabs[g] = (A.grabs[g] || 0) + dt;
    A.grab = g;
    // hold a grab and it gets tweaked further
    const tw = g ? GRAB_TWEAK[g] : null, tk = g ? sstep(0.05, 0.6, A.grabs[g]) : 0;
    this.tweakR = damp(this.tweakR, tw ? tw[0] * tk : 0, 7, dt);
    this.tweakP = damp(this.tweakP, tw ? tw[1] * tk : 0, 7, dt);
    this.crouch = damp(this.crouch, g ? 0.75 : 0.35, 10, dt);
    this.edge = damp(this.edge, 0, 4, dt);
    this.tuck = damp(this.tuck, 0, 4, dt);
    this.charge = 0;
    // level the board toward the slope we're going to land on
    const ahead = World.groundNormal(this.pos.x + this.vel.x * 0.3, this.pos.z + this.vel.z * 0.3, new V3());
    this.airUp.lerp(ahead, 1 - Math.exp(-3 * dt)).normalize();
    const prev = this.pos.clone();
    this.pos.addScaledVector(this.vel, dt);
    const h = World.groundHeight(this.pos.x, this.pos.z);
    A.maxH = Math.max(A.maxH, this.pos.y - h);
    // grind capture
    if (this.tryGrind(prev)) return;
    // landing assist: settle spin to the nearest clean angle just before touchdown
    const tti = (this.pos.y - h) / Math.max(0.5, -this.vel.y);
    if (tti < 0.22 && !spinIn) {
      const vh = Math.atan2(this.vel.x, this.vel.z);
      const off = wrapAngle(this.yaw - vh);
      const target = Math.abs(off) < Math.PI / 2 ? 0 : Math.PI;
      const d = wrapAngle(off - target);
      if (Math.abs(d) < 0.8) this.yaw -= d * Math.min(1, 9 * dt);
      const fr = wrapAngle(this.flip);
      if (!flipIn && Math.abs(fr) < 1.0) this.flip -= fr * Math.min(1, 8 * dt);
    }
    // leaving a kicker, ignore its own back wall; and you can't land while still rising
    const hLand = A.kicker && A.t < 0.35 ? World.height(this.pos.x, this.pos.z) : h;
    if (this.pos.y <= hLand && !(this.vel.y > 0.3 && A.t < 0.25 && this.pos.y > hLand - 0.6)) { this.pos.y = hLand; this.land(); }
  },

  land() {
    const A = this.air;
    const n = World.groundNormal(this.pos.x, this.pos.z, this.n);
    const vn = this.vel.dot(n);
    const vT = new V3().copy(this.vel).addScaledVector(n, -vn);
    const vh = Math.atan2(vT.x, vT.z);
    const off = wrapAngle(this.yaw - vh);
    const mis = Math.min(Math.abs(off), Math.PI - Math.abs(off));
    const flipRes = Math.abs(wrapAngle(this.flip));
    this.ground = true; this.air = null;
    const hard = -vn;
    // touchdown evaluation
    const speedT = vT.length();
    let reason = null;
    if (flipRes > 0.9) reason = 'Over-rotated';
    else if (mis > 0.95 && speedT > 3) reason = 'Caught an edge';
    else if (hard > 19) reason = 'Flat landing';
    if (reason) { this.vel.copy(vT).addScaledVector(n, vn * 0.3); return this.crash(reason); }
    // absorb: speed loss for sketchy landings, compression for big ones
    const sketch = mis > 0.45 || (A.grab && A.t > 0.4);
    const keep = sketch ? 0.82 : 0.97;
    this.vel.copy(vT).multiplyScalar(keep);
    this.ride = Math.abs(off) < Math.PI / 2 ? 1 : -1;
    this.flip = 0; this.flipVel = 0; this.spinVel = 0;
    this.crouch = Math.min(1, 0.4 + hard * 0.05);
    if (Math.abs(this.tweakR) + Math.abs(this.tweakP) > 0.25 && A.grab) { this.vel.multiplyScalar(0.92); }
    this.emit('land', { impact: hard, air: A.t, sketch });
    if (typeof Snow !== 'undefined') Snow.stampLanding(this, hard);
    this.scoreTrick(A, sketch);
  },

  scoreTrick(A, sketch) {
    // off a rail you can spin out in quarter turns (a boardslide exits sideways)
    const deg = A.fromGrind ? Math.round(Math.abs(A.spin) / (Math.PI / 2)) * 90 : Math.round(Math.abs(A.spin) / Math.PI) * 180;
    const flips = Math.round(Math.abs(A.flipTot) / TAU);
    let bestGrab = null, gt = 0;
    for (const k in A.grabs) if (A.grabs[k] > gt) { gt = A.grabs[k]; bestGrab = k; }
    if (gt < 0.18) bestGrab = null;
    if (A.t < 0.45 && deg < 180 && !flips && !bestGrab) return;
    const parts = [];
    let pts = Math.round(A.t * 110 + A.maxH * 30);
    const front = A.flipTot < 0;
    const multi = flips > 1 ? (flips === 2 ? 'Double ' : 'Triple ') : '';
    // frontside = chest opens downhill first; mirrored for goofy and for switch
    const fs = (A.spin > 0 ? 1 : -1) * this.stance * A.ride > 0;
    const side = A.nollie ? (fs ? 'Nollie Frontside' : 'Nollie Backside') : A.ride < 0 ? (fs ? 'Cab' : 'Switch Backside') : fs ? 'Frontside' : 'Backside';
    if (flips && deg >= 360) {
      // spinning and flipping at once goes off-axis: corks, rodeos and mistys
      parts.push(front ? `${multi}Misty ${deg}` : flips > 1 ? `${side} ${multi}Cork ${deg}` : fs ? `${side} Cork ${deg}` : `${side} Rodeo ${deg}`);
      const k = deg / 180;
      pts += 900 * flips + 400 * (flips - 1) + 260 * k + 80 * k * k + 300;
    } else {
      if (flips) {
        parts.push(multi + (front ? 'Frontflip' : 'Backflip'));
        pts += 900 * flips + 400 * (flips - 1);
      }
      if (deg >= 180) {
        parts.push(side + ' ' + deg + (A.fromGrind ? ' Out' : ''));
        const k = deg / 180;
        pts += 200 * k + 60 * k * k;
      } else if (A.nollie && !flips && parts.length === 0) parts.push('Nollie');
      else if (A.ride < 0 && parts.length === 0 && bestGrab) parts.push('Switch');
    }
    if (bestGrab) {
      const combo = !['indy', 'melon', 'tail', 'nose'].includes(bestGrab);
      parts.push((gt > 0.8 ? 'Tweaked ' : '') + GRAB_NAMES[bestGrab]);
      pts += Math.round(150 + gt * 420 + (combo ? 180 : 0) + (gt > 0.8 ? 120 : 0));
    }
    if (!parts.length) parts.push(A.t > 1.2 ? 'Big Air' : 'Air');
    if (sketch) pts = Math.round(pts * 0.6);
    this.registerTrick(parts.join(' '), pts, sketch);
  },
  registerTrick(name, pts, sketch) {
    const inCombo = this.time - this.lastLand < 2.6 && this.combo.n > 0;
    if (!inCombo) this.combo = { n: 0, pts: 0, t: this.time };
    this.combo.n++;
    const mult = Math.min(4, 1 + 0.5 * (this.combo.n - 1));
    const total = Math.round(pts * mult);
    this.combo.pts += total;
    this.lastLand = this.time;
    this.emit('trick', { name, pts: total, base: pts, mult, sketch, combo: this.combo.n });
  },

  // ---- rails and boxes -------------------------------------------------------
  tryGrind(prev) {
    for (const g of World.grinds) {
      const ex = this.pos.x - g.ax, ez = this.pos.z - g.az;
      const u = ex * g.dx + ez * g.dz;
      if (u < 0.2 || u > g.len - 0.4) continue;
      const v = -ex * g.dz + ez * g.dx;
      if (Math.abs(v) > g.w + 0.75) continue;
      const top = lerp(g.ay, g.by, u / g.len);
      const along = this.vel.x * g.dx + this.vel.z * g.dz;
      if (along < 1.2) continue;
      if (this.pos.y > top - 0.45 && this.pos.y < top + 1.1 && (this.vel.y <= 1.0 || prev.y >= top - 0.15)) {
        this.startGrind(g, u, along);
        return true;
      }
    }
    return false;
  },
  // riding up a box's snow ramp puts you straight onto the box
  tryGrindGround() {
    for (const g of World.grinds) {
      if (g.kind !== 'box') continue;
      const ex = this.pos.x - g.ax, ez = this.pos.z - g.az;
      const u = ex * g.dx + ez * g.dz;
      if (u < -0.05 || u > 1.2) continue;
      if (Math.abs(-ex * g.dz + ez * g.dx) > g.w + 0.2) continue;
      const along = this.vel.x * g.dx + this.vel.z * g.dz;
      if (along < 1.5) continue;
      this.startGrind(g, Math.max(0.05, u), along);
      return true;
    }
    return false;
  },
  startGrind(g, u, along) {
    const railYaw = Math.atan2(g.dx, g.dz);
    const off = wrapAngle(this.yaw - railYaw);
    // closer to parallel → 50-50, closer to perpendicular → boardslide
    const slide = Math.abs(Math.sin(off)) > 0.6;
    const target = slide ? railYaw + Math.sign(Math.sin(off) || 1) * Math.PI / 2 : railYaw + (Math.abs(off) > Math.PI / 2 ? Math.PI : 0);
    // balance: a needle that wanders off on its own; A and D push it back
    this.grind = { g, u, v: along, t: 0, slide, yawT: target, airBefore: this.air, bal: (Math.random() - 0.5) * 0.5, balV: (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.7), good: 0, seed: Math.random() * 100, snap: 0,
      railYaw, chain: [], pressT: 0, pressEnd: 0, swT: 0, spinOn: 0, extra: 0 };
    // spinning onto the rail: count the rotation in the air plus what's left to line up with the rail
    const A = this.air;
    if (A && (A.ollie || A.kicker || A.t > 0.2)) {
      const tot = Math.abs(A.spin + wrapAngle(target - this.yaw));
      const deg = Math.round(tot / (Math.PI / 2)) * 90;
      if (deg >= 180) this.grind.spinOn = deg;
    }
    this.air = null; this.ground = false;
    this.flip = 0; this.spinVel = 0;
    this.emit('grindStart', { kind: g.kind });
  },
  stepGrind(dt, steer) {
    const G2 = this.grind, g = G2.g;
    G2.t += dt;
    const slope = (g.ay - g.by) / g.len;
    G2.v += (9.81 * slope / Math.sqrt(1 + slope * slope) - 0.06 * 9.81) * dt;
    G2.v = Math.max(G2.v, 0.6);
    G2.u += G2.v * dt;
    this.yaw = dampAngle(this.yaw, G2.yawT, 16, dt);
    // switch-ups: W turns the board 180 on the rail, S a quarter turn between 50-50 and boardslide
    G2.swT -= dt;
    if (G2.swT <= 0 && G2.t > 0.25) {
      const w = Input.hit('KeyW', 'ArrowUp'), s = Input.hit('KeyS', 'ArrowDown');
      if (w || s) {
        G2.chain.push(this.grindName(G2));
        const dir = G2.lastDir = -(G2.lastDir || 1);
        G2.yawT += dir * (w ? Math.PI : Math.PI / 2);
        if (s) G2.slide = !G2.slide;
        G2.extra += w ? 200 : 110;
        G2.swT = 0.35; G2.pressT = 0;
        G2.balV += (Math.random() - 0.5) * 2.4;
        this.emit('switchUp', { deg: w ? 180 : 90 });
      }
    }
    // pressing on the rail: noseslides, tailslides and presses wobble more and score more
    if (Math.abs(this.press) > 0.55) { G2.pressT += dt; G2.pressEnd = Math.sign(this.press); }
    const top = lerp(g.ay, g.by, G2.u / g.len);
    this.pos.set(g.ax + g.dx * G2.u, top, g.az + g.dz * G2.u);
    this.vel.set(g.dx * G2.v, -slope * G2.v, g.dz * G2.v);
    // the wobble grows the longer you stay on, and comes in irregular gusts
    const t = G2.t + G2.seed;
    const wob = Math.sin(t * 2.3) * 0.9 + Math.sin(t * 5.1 + 1.7) * 0.6 + Math.sin(t * 9.7 + 0.4) * 0.35 + (Math.random() - 0.5) * 3.2;
    const push = -steer; // D moves the needle right, A left
    const pk = Math.abs(this.press) > 0.55 ? 1.3 : 1;
    G2.balV += (wob * (2.1 + G2.t * 0.6) * pk + G2.bal * 2.4 + push * 6.8) * dt;
    G2.balV *= Math.exp(-1.6 * dt);
    G2.bal += G2.balV * dt;
    if (Math.abs(G2.bal) < 0.35) G2.good += dt;
    G2.snap = Math.min(1, G2.snap + dt * 6);
    this.edge = damp(this.edge, G2.bal * 0.35, 10, dt);
    this.crouch = damp(this.crouch, 0.35 + Math.abs(G2.bal) * 0.2, 8, dt);
    this.n.set(0, 1, 0);
    this.airUp.set(0, 1, 0);
    if (Math.abs(G2.bal) > 1) {
      // lost it: slip off the side the needle went
      const sd = Math.sign(G2.bal);
      this.vel.x += -g.dz * sd * 2.2; this.vel.z += g.dx * sd * 2.2; this.vel.y += 1.2;
      this.endGrind(true);
      return;
    }
    const off = Input.hit('Space');
    if (G2.u >= g.len || off) {
      if (off) { this.vel.y += 4.5; this.emit('railPop', {}); }
      this.endGrind();
    }
  },
  // what the current section of a grind is called
  grindName(G2) {
    const sw = Math.abs(wrapAngle(G2.yawT - G2.railYaw)) > Math.PI / 2 + 0.3;
    if (G2.pressT > 0.35) {
      // pressing the leading end on a 50-50 is a nose press; on a boardslide it's a noseslide
      const lead = G2.pressEnd > 0;
      return G2.slide ? (lead ? 'Noseslide' : 'Tailslide') : (lead ? 'Nose Press' : 'Tail Press');
    }
    return G2.slide ? 'Boardslide' : sw ? 'Switch 50-50' : '50-50';
  },
  endGrind(fell = false) {
    const G2 = this.grind;
    this.grind = null;
    const segs = G2.chain.concat(this.grindName(G2)).filter((n, i, a) => i === 0 || n !== a[i - 1]);
    const name = (G2.spinOn ? `${G2.spinOn} on ` : '') + segs.join(' to ') + (G2.g.kind === 'box' ? ' (box)' : '');
    this.takeoff(false);
    this.air.ride = this.ride;
    this.air.fromGrind = true;
    this.emit('grindEnd', { fell });
    if (fell) { this.emit('lostBalance', {}); return; }
    // time spent in the sweet spot of the balance bar is worth the most
    this.registerTrick(name + (G2.good / Math.max(G2.t, 0.01) > 0.7 && G2.t > 0.6 ? ' · locked in' : ''), Math.round((150 + G2.t * 240 + G2.good * 620 + G2.u * 18 + G2.extra + G2.spinOn * 1.6) * (G2.pressT > 0.35 ? 1.35 : 1)), false);
  },

  // ---- obstacles ---------------------------------------------------------------
  collide() {
    const p = this.pos, R = 0.35, vel = this.vel;
    World.queryColliders(p.x, p.z, 4, this._col);
    const limit = { tree: 8.5, rock: 6.5, building: 6, station: 6, cat: 6, tower: 7, pole: 7, gun: 7, sign: 7, box: 6.5, rail: 6.5 };
    const names = { tree: 'Hugged a tree', rock: 'Hit a rock', building: 'Ran into a building', station: 'Hit the lift station', tower: 'Hit a lift tower', rail: 'Clipped the rail', box: 'Clipped the box', cat: 'Ran into a snowcat' };
    for (const c of this._col) {
      if (p.y > c.top) continue;
      // brushing through low fir branches knocks their snow loose
      if (c.kind === 'tree' && c.ref) {
        const t = c.ref, canopy = t.s * (t.type ? 1.0 : 1.9) + R;
        const dc = Math.hypot(p.x - c.x, p.z - c.z);
        if (dc < canopy && this.speed > 3 && this.time - (t.brushT || -9) > 1.6) {
          t.brushT = this.time;
          vel.multiplyScalar(0.96);
          this.emit('brush', { tree: t });
        }
      }
      const push = World.colliderPush(c, p.x, p.z, R);
      if (!push) continue;
      const into = -(vel.x * push.nx + vel.z * push.nz);
      if (into > (limit[c.kind] || 7)) return this.crash(names[c.kind] || 'Ran into something');
      p.x += push.x; p.z += push.z;
      if (into > 0) {
        // slide along the obstacle: lose the speed going into it, a bit of the rest to friction
        vel.x += push.nx * into * 1.15; vel.z += push.nz * into * 1.15;
        vel.multiplyScalar(1 - Math.min(0.3, into * 0.035));
        this.emit('bump', { kind: c.kind, into });
      }
    }
  },

  crash(reason) {
    if (this.crashed) return;
    this.crashed = true; this.crashT = 0; this.grind = null; this.air = null;
    if (this.combo.n) this.emit('comboLost', { pts: this.combo.pts });
    this.combo = { n: 0, pts: 0, t: 0 };
    this.emit('crash', { reason, speed: this.vel.length() });
  },

  // board frame for drawing
  boardFrame(outX, outY) {
    const f = new V3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    if (this.ground) {
      const n = this.n;
      outX.copy(f).addScaledVector(n, -f.dot(n)).normalize();
      const travel = outX.clone().multiplyScalar(this.ride);
      const left = new V3().crossVectors(n, travel).normalize();
      outY.copy(n).addScaledVector(left, Math.tan(this.edge)).normalize();
    } else {
      const up = this.airUp;
      const fx = f.clone().addScaledVector(up, -f.dot(up)).normalize();
      // flip about the toe-heel axis
      outX.copy(fx).multiplyScalar(Math.cos(this.flip)).addScaledVector(up, Math.sin(this.flip));
      outY.copy(up).multiplyScalar(Math.cos(this.flip)).addScaledVector(fx, -Math.sin(this.flip));
    }
    // presses pitch the board onto one end; tweaked grabs bend it about both axes
    const pitch = (this.ground || this.grind ? this.pitch : 0) + this.tweakP, roll = this.tweakR;
    if (Math.abs(pitch) > 1e-3) {
      const c = Math.cos(pitch), s = Math.sin(pitch), x = outX.clone();
      outX.multiplyScalar(c).addScaledVector(outY, s);
      outY.multiplyScalar(c).addScaledVector(x, -s);
    }
    if (Math.abs(roll) > 1e-3) {
      const z = new V3().crossVectors(outX, outY);
      outY.multiplyScalar(Math.cos(roll)).addScaledVector(z, Math.sin(roll)).normalize();
    }
  },
};
