// ============================================================================
//  people — other skiers and riders carving down the runs, and passengers on
//  the chairs and surface lifts. Low-poly instanced figures: a tinted jacket
//  mesh plus a dark mesh for helmets, pants, boots, skis and boards.
// ============================================================================
const PEOPLE_COLORS = [0xd8342c, 0xf07a1e, 0xf2c335, 0x2aa59a, 0x2f6fc6, 0x6b4bb8, 0xe0559a, 0xf2f2ee, 0x2b2e34, 0x3f8f4a, 0x9fd0e8, 0xc9a37a];

const People = {
  npcs: [], lifts: [],

  init(scene) {
    this.group = new THREE.Group(); this.group.name = 'people';
    scene.add(this.group);
    this.mat = stdMat({ roughness: 0.8, flatShading: false }, { key: 'people' });
    this.buildSlopeFolk();
    this.buildPassengers();
  },

  // ---- figures, built in local space (x right, y up, z forward) ----------------------
  figure(kind) {
    const jacket = new GeoBuilder({ smooth: true }), dark = new GeoBuilder({ smooth: true });
    const W = 0xffffff, pants = 0x8a8f99, helm = 0x23262c, kit = 0x1b1d22;
    if (kind === 'skier') {
      for (const sd of [-1, 1]) {
        dark.add(G.box(0.09, 0.03, 1.7), { x: sd * 0.13, y: 0.03, z: 0.12, color: 0x3a3e46 });
        dark.add(G.box(0.12, 0.16, 0.3), { x: sd * 0.13, y: 0.13, color: kit });
        dark.add(G.cyl(0.07, 0.065, 0.48, 6), { x: sd * 0.13, y: 0.42, z: 0.08, rx: -0.35, color: pants });
        dark.add(G.cyl(0.08, 0.07, 0.42, 6), { x: sd * 0.12, y: 0.78, z: 0.06, rx: 0.4, color: pants });
        // poles trailing back
        dark.add(G.cyl(0.012, 0.012, 1.15, 4), { x: sd * 0.36, y: 0.62, z: -0.2, rx: -0.45, color: 0x9aa0a8 });
      }
      jacket.add(G.box(0.4, 0.55, 0.26), { y: 1.22, z: 0.12, rx: 0.35, color: W });
      for (const sd of [-1, 1]) jacket.add(G.cyl(0.055, 0.05, 0.5, 5), { x: sd * 0.25, y: 1.12, z: 0.18, rx: 0.9, rz: -sd * 0.25, color: W });
      dark.add(G.sphere(0.13, 8, 6), { y: 1.6, z: 0.25, color: helm });
      dark.add(G.box(0.2, 0.06, 0.06), { y: 1.6, z: 0.36, color: 0xff9a3a });
    } else {
      // a rider stands across the board; the board points along travel
      dark.add(G.box(0.27, 0.03, 1.5), { y: 0.03, color: 0x2a2e36 });
      for (const sd of [-1, 1]) {
        dark.add(G.box(0.3, 0.14, 0.13), { y: 0.11, z: sd * 0.27, color: kit });
        dark.add(G.cyl(0.075, 0.07, 0.48, 6), { x: 0.06, y: 0.4, z: sd * 0.25, rz: -0.3, color: pants });
        dark.add(G.cyl(0.085, 0.075, 0.42, 6), { x: 0.06, y: 0.76, z: sd * 0.17, rz: 0.3, rx: sd * 0.15, color: pants });
      }
      jacket.add(G.box(0.27, 0.56, 0.42), { x: 0.05, y: 1.2, rz: -0.2, color: W });
      for (const sd of [-1, 1]) jacket.add(G.cyl(0.055, 0.05, 0.55, 5), { x: 0.06, y: 1.08, z: sd * 0.33, rx: sd * 0.55, color: W });
      dark.add(G.sphere(0.13, 8, 6), { x: 0.08, y: 1.6, color: helm });
      dark.add(G.box(0.06, 0.06, 0.2), { x: 0.2, y: 1.6, color: 0xff9a3a });
    }
    return [jacket.build(), dark.build()];
  },
  seated() {
    // carrier space: the seat top is ~2.4 m under the grip, footrest at -2.95, facing +z
    const jacket = new GeoBuilder({ smooth: true }), dark = new GeoBuilder({ smooth: true });
    const W = 0xffffff, pants = 0x8a8f99;
    for (const sd of [-1, 1]) {
      dark.add(G.cyl(0.075, 0.075, 0.44, 6), { x: sd * 0.1, y: -2.3, z: 0.3, rx: Math.PI / 2, color: pants });
      dark.add(G.cyl(0.065, 0.06, 0.45, 6), { x: sd * 0.1, y: -2.58, z: 0.52, rx: 0.2, color: pants });
      dark.add(G.box(0.12, 0.14, 0.26), { x: sd * 0.1, y: -2.86, z: 0.6, color: 0x1b1d22 });
    }
    dark.add(G.box(0.3, 0.03, 1.4), { y: -2.95, z: 0.6, color: 0x2a2e36 });
    jacket.add(G.box(0.4, 0.55, 0.26), { y: -1.95, z: -0.02, rx: -0.12, color: W });
    for (const sd of [-1, 1]) jacket.add(G.cyl(0.055, 0.05, 0.45, 5), { x: sd * 0.24, y: -2.05, z: 0.12, rx: 1.0, color: W });
    dark.add(G.sphere(0.13, 8, 6), { y: -1.52, z: 0.0, color: 0x23262c });
    dark.add(G.box(0.2, 0.06, 0.06), { y: -1.52, z: 0.11, color: 0xff9a3a });
    return [jacket.build(), dark.build()];
  },
  instanced(geos, n) {
    const out = geos.map((g) => {
      const m = new THREE.InstancedMesh(g, this.mat, n);
      m.castShadow = true; m.receiveShadow = false; m.frustumCulled = false;
      this.group.add(m);
      return m;
    });
    return out;
  },

  // ---- people riding down -----------------------------------------------------------
  buildSlopeFolk() {
    const rnd = mulberry32(2024);
    const runs = World.runData;
    const total = runs.reduce((a, rd) => a + rd.path.len, 0);
    const N = 120;
    const speedOf = { green: 6, red: 9, park: 7, black: 9.5, double: 10 };
    for (let i = 0; i < N; i++) {
      // more people on the longer, easier runs
      let r = rnd() * total, rd = runs[0];
      for (const q of runs) { const w = q.path.len * (q.run.diff === 'green' ? 1.6 : q.run.diff === 'double' ? 0.4 : 1); if ((r -= w) <= 0) { rd = q; break; } }
      const skier = rnd() < 0.55;
      this.npcs.push({
        rd, skier, s: 10 + rnd() * (rd.path.len - 30), v: speedOf[rd.run.diff] * (0.75 + rnd() * 0.5),
        amp: rd.run.w * (0.18 + rnd() * 0.22), per: 22 + rnd() * 26, off: (rnd() - 0.5) * rd.run.w * 0.5, ph: rnd() * TAU,
        dodge: 0, col: PEOPLE_COLORS[Math.floor(rnd() * PEOPLE_COLORS.length)], pants: rnd(), wait: 0, roll: 0,
      });
    }
    const sk = this.npcs.filter((n) => n.skier), bd = this.npcs.filter((n) => !n.skier);
    this.skiMesh = this.instanced(this.figure('skier'), sk.length);
    this.boardMesh = this.instanced(this.figure('rider'), bd.length);
    const c = new THREE.Color();
    sk.forEach((n, i) => { n.mesh = this.skiMesh; n.idx = i; });
    bd.forEach((n, i) => { n.mesh = this.boardMesh; n.idx = i; });
    for (const n of this.npcs) {
      n.mesh[0].setColorAt(n.idx, c.set(n.col));
      n.mesh[1].setColorAt(n.idx, c.setScalar(0.6 + n.pants * 0.5));
    }
    for (const m of [...this.skiMesh, ...this.boardMesh]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  },
  // ---- passengers on the lifts ---------------------------------------------------------
  buildPassengers() {
    const rnd = mulberry32(77);
    const seatedGeo = this.seated(), standGeo = this.figure('skier');
    const c = new THREE.Color();
    for (const lift of Structures.lifts) {
      const T = lift.type;
      if (T.cabin) continue;
      const seats = T.surface ? 1 : T.seats, w = seats * 0.6;
      const slots = [];
      for (let i = 0; i < lift.carrierCount; i++) for (let k = 0; k < seats; k++) {
        // most chairs going up carry someone; hardly anyone rides down
        const busy = rnd() < (T.surface ? 0.55 : 0.42);
        if (!busy) continue;
        slots.push({ i, x: T.surface ? 0 : -w / 2 + 0.3 + k * 0.6, col: PEOPLE_COLORS[Math.floor(rnd() * PEOPLE_COLORS.length)], down: rnd() < 0.06 });
      }
      if (!slots.length) continue;
      const meshes = this.instanced(T.surface ? standGeo : seatedGeo, slots.length);
      slots.forEach((s, j) => { meshes[0].setColorAt(j, c.set(s.col)); meshes[1].setColorAt(j, c.setScalar(0.6 + rnd() * 0.5)); });
      for (const m of meshes) { if (m.instanceColor) m.instanceColor.needsUpdate = true; m.layers.enable(lift.layer); }
      this.lifts.push({ lift, slots, meshes });
    }
  },

  // ---- per frame ----------------------------------------------------------------------
  update(dt, cam, player, riding) {
    const cx = cam.position.x, cz = cam.position.z;
    const p = new V3();
    for (const n of this.npcs) {
      const rd = n.rd, L = rd.path.len;
      if (n.wait > 0) n.wait -= dt;
      else n.s += n.v * dt;
      if (n.s > L - 14) {
        // at the bottom: wait out of sight, then ride again from the top
        const c0 = World.pathAt(rd, L - 14);
        if (Math.hypot(c0.x - cx, c0.z - cz) > 140) { n.s = 8 + Math.random() * 30; n.wait = 0; } else { n.s = L - 14; n.wait = 0.5; }
      }
      const c = World.pathAt(rd, n.s);
      const k = TAU / n.per, ph = n.s * k + n.ph;
      // keep clear of the player
      if (player && !player.crashed) {
        const dx = player.pos.x - c.x, dz = player.pos.z - c.z;
        const latP = dx * -c.tz + dz * c.tx, along = dx * c.tx + dz * c.tz;
        if (Math.abs(along) < 12) n.dodge = damp(n.dodge, (Math.abs(latP - n.off) < 6 ? -Math.sign(latP - n.off || 1) * 5 : 0), 2, dt);
        else n.dodge = damp(n.dodge, 0, 1, dt);
      }
      const lat = clamp(n.off + n.dodge + Math.sin(ph) * n.amp, -rd.run.w * 0.85, rd.run.w * 0.85);
      const dl = Math.cos(ph) * n.amp * k;
      const x = c.x - c.tz * lat, z = c.z + c.tx * lat;
      const y = World.groundHeight(x, z);
      const hx = c.tx - c.tz * dl, hz = c.tz + c.tx * dl;
      const yaw = Math.atan2(hx, hz);
      // lean into the turn
      const acc = -Math.sin(ph) * n.amp * k * k * n.v * n.v;
      n.roll = damp(n.roll, clamp(acc * 0.09, -0.5, 0.5), 6, dt);
      const far = Math.hypot(x - cx, z - cz);
      const s = far > 900 ? 0 : 1;
      _q.setFromEuler(_e.set(0, yaw, 0, 'YXZ'));
      if (n.skier) _q.multiply(new THREE.Quaternion().setFromAxisAngle(_v2.set(0, 0, 1), -n.roll));
      else _q.multiply(new THREE.Quaternion().setFromAxisAngle(_v2.set(1, 0, 0), 0)).multiply(new THREE.Quaternion().setFromAxisAngle(_v2.set(0, 0, 1), -n.roll));
      _m4.compose(p.set(x, y, z), _q, _s.set(s, s, s));
      n.mesh[0].setMatrixAt(n.idx, _m4); n.mesh[1].setMatrixAt(n.idx, _m4);
      // snow off their edges when they're close
      if (far < 60 && Math.abs(Math.cos(ph)) < 0.35 && Math.random() < dt * 30) {
        const side = Math.sign(Math.sin(ph)) || 1;
        FX.spawn(x, y + 0.05, z, hx * n.v * 0.4 + c.tz * side * 2, 1 + Math.random(), hz * n.v * 0.4 - c.tx * side * 2, 0.5 + Math.random() * 0.4, 0.12, 0.6, 0.35, 1, 1, 1, 0.3, 2.4, 0, 1, 0);
      }
    }
    for (const m of [...this.skiMesh, ...this.boardMesh]) m.instanceMatrix.needsUpdate = true;
    // passengers ride with their carriers
    const q = {};
    for (const P of this.lifts) {
      const lift = P.lift, gap = lift.loopLen / lift.carrierCount, up = lift.upLen;
      P.slots.forEach((sl, j) => {
        const sA = lift.phase + sl.i * gap;
        const sm = ((sA % lift.loopLen) + lift.loopLen) % lift.loopLen;
        const going = sm < up;
        // nobody sits on the chair the player is riding, and hardly anyone rides down
        const show = (going ? true : sl.down) && !(riding && riding.lift === lift && riding.carrier === sl.i);
        Structures.loopAt(lift, sA, q);
        const yaw = Math.atan2(q.tx, q.tz);
        if (lift.type.surface) {
          // dragged up the track on the T-bar: standing on the snow under the cable
          const gx = q.x + Math.cos(yaw) * 0.0, gz = q.z;
          _m4.compose(p.set(gx, World.groundHeight(gx, gz), gz), _q.setFromAxisAngle(_v2.set(0, 1, 0), yaw), _s.setScalar(show && going ? 1 : 0));
        } else {
          _m4.compose(p.set(q.x, q.y, q.z), _q.setFromAxisAngle(_v2.set(0, 1, 0), yaw), _s.set(1, 1, 1));
          _m4.multiply(new THREE.Matrix4().makeTranslation(sl.x, 0, 0));
          if (!show) _m4.scale(_s.setScalar(0));
        }
        P.meshes[0].setMatrixAt(j, _m4); P.meshes[1].setMatrixAt(j, _m4);
      });
      for (const m of P.meshes) m.instanceMatrix.needsUpdate = true;
    }
  },
};
