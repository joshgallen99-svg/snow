// ============================================================================
//  world — runtime queries over the baked terrain + placed features
// ============================================================================
const World = {
  H: null, N: 0, res: 2, half: 1536,
  runId: null, groom: null, powder: null, dir: null, inRun: null, forest: null,
  runData: [], pads: [],
  kickers: [], grinds: [], colliders: [], cgrid: new Map(), cell: 16,

  init(T) {
    Object.assign(this, { H: T.H, N: WORLD.N, res: WORLD.res, half: WORLD.half, runId: T.runId, groom: T.groom, powder: T.powder, dir: T.dir, inRun: T.inRun, runData: T.runData, pads: T.pads });
    for (const rd of this.runData) {
      rd.y = new Float32Array(rd.path.n);
      for (let i = 0; i < rd.path.n; i++) rd.y[i] = this.height(rd.path.pts[i][0], rd.path.pts[i][1]);
    }
    this.buildFeatures();
  },

  height(x, z) {
    const N = this.N, H = this.H;
    const fx = clamp((x + this.half) / this.res, 0, N - 1.0001), fz = clamp((z + this.half) / this.res, 0, N - 1.0001);
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * N + i;
    return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + N] * (1 - u) + H[k + N + 1] * u) * v;
  },
  // grid lookup (nearest) for byte attributes
  attr(arr, x, z) {
    const N = this.N;
    const i = clamp(Math.round((x + this.half) / this.res), 0, N - 1), j = clamp(Math.round((z + this.half) / this.res), 0, N - 1);
    return arr[j * N + i];
  },
  normal(x, z, out) {
    const e = 1.0;
    const hx = this.height(x + e, z) - this.height(x - e, z);
    const hz = this.height(x, z + e) - this.height(x, z - e);
    const l = Math.hypot(hx, 2 * e, hz);
    out.x = -hx / l; out.y = 2 * e / l; out.z = -hz / l;
    return out;
  },
  inBounds(x, z) { return Math.abs(x) < this.half - 40 && Math.abs(z) < this.half - 40; },

  // ---- run path helpers ---------------------------------------------------
  pathAt(rd, s) {
    const p = rd.path, n = p.n;
    s = clamp(s, 0, p.len);
    let i = Math.min(n - 2, Math.floor(s / p.step));
    while (i > 0 && p.s[i] > s) i--;
    while (i < n - 2 && p.s[i + 1] < s) i++;
    const t = (s - p.s[i]) / Math.max(1e-3, p.s[i + 1] - p.s[i]);
    const a = p.pts[i], b = p.pts[i + 1];
    return { x: lerp(a[0], b[0], t), z: lerp(a[1], b[1], t), tx: lerp(p.tx[i], p.tx[i + 1], t), tz: lerp(p.tz[i], p.tz[i + 1], t), i };
  },
  // nearest point on a run polyline; hint speeds up the search while riding
  nearestOnRun(rd, x, z, hint = -1) {
    const p = rd.path, tmp = [0, 0, 0];
    let best = 1e9, bi = 0, bt = 0, bside = 0;
    const lo = hint < 0 ? 0 : Math.max(0, hint - 40), hi = hint < 0 ? p.n - 1 : Math.min(p.n - 1, hint + 40);
    for (let i = lo; i < hi; i++) {
      segDist(x, z, p.pts[i][0], p.pts[i][1], p.pts[i + 1][0], p.pts[i + 1][1], tmp);
      if (tmp[0] < best) { best = tmp[0]; bi = i; bt = tmp[1]; bside = tmp[2]; }
    }
    return { d: best, i: bi, s: p.s[bi] + bt * (p.s[bi + 1] - p.s[bi]), side: bside > 0 ? 1 : -1 };
  },

  // ---- features -----------------------------------------------------------
  buildFeatures() {
    this.kickers.length = 0; this.grinds.length = 0;
    for (const rd of this.runData) {
      const run = rd.run, L = rd.path.len;
      for (const f of run.features) {
        if (f.k === 'kicker') {
          const K = KICKER_SIZES[f.size];
          const c = this.pathAt(rd, f.t * L);
          const nx = -c.tz, nz = c.tx; // left normal
          const x0 = c.x + nx * (f.lat || 0) - c.tx * K[0] * 0.5, z0 = c.z + nz * (f.lat || 0) - c.tz * K[0] * 0.5;
          this.kickers.push({ x0, z0, dx: c.tx, dz: c.tz, len: K[0], lip: K[1], w: K[2], back: 1.6, size: f.size, run: run.index });
        } else if (f.k === 'box' || f.k === 'rail') {
          const c = this.pathAt(rd, f.t * L);
          const nx = -c.tz, nz = c.tx;
          const cx = c.x + nx * (f.lat || 0), cz = c.z + nz * (f.lat || 0);
          const ax = cx - c.tx * f.len * 0.5, az = cz - c.tz * f.len * 0.5;
          const bx = cx + c.tx * f.len * 0.5, bz = cz + c.tz * f.len * 0.5;
          const h = f.k === 'box' ? 0.55 : (f.h || 0.9);
          const ay = this.height(ax, az) + h, by = this.height(bx, bz) + h;
          const gr = { kind: f.k, ax, az, ay, bx, bz, by, dx: c.tx, dz: c.tz, len: f.len, w: f.k === 'box' ? 0.5 : 0.07, h, run: run.index };
          this.grinds.push(gr);
          // solid sides: you get onto a box from its ramp and onto a rail with an ollie
          this.addBoxCollider(cx, cz, f.len / 2, gr.w + 0.04, Math.atan2(-c.tz, c.tx), Math.max(ay, by) - 0.06, f.k, gr);
        }
      }
    }
  },
  kickerOffset(k, x, z) {
    const ex = x - k.x0, ez = z - k.z0;
    const u = ex * k.dx + ez * k.dz;
    if (u < 0 || u > k.len + k.back) return 0;
    const v = Math.abs(-ex * k.dz + ez * k.dx);
    const hw = k.w * 0.5;
    if (v > hw + 0.9) return 0;
    const side = 1 - sstep(hw, hw + 0.9, v);
    let o;
    if (u <= k.len) { const t = u / k.len; o = k.lip * t * t; } else o = k.lip * (1 - (u - k.len) / k.back);
    return o * side;
  },
  // box entry ramps are ground; tops handled by the grind system
  boxRampOffset(g, x, z) {
    if (g.kind !== 'box') return 0;
    const ex = x - g.ax, ez = z - g.az;
    const u = ex * g.dx + ez * g.dz;
    const v = Math.abs(-ex * g.dz + ez * g.dx);
    if (u > 0 || u < -1.8 || v > g.w + 0.3) return 0;
    return g.h * (1 + u / 1.8) * (1 - sstep(g.w, g.w + 0.3, v));
  },
  // full ground height including kickers
  groundHeight(x, z) {
    let h = this.height(x, z), add = 0;
    for (let i = 0; i < this.kickers.length; i++) {
      const k = this.kickers[i];
      if (Math.abs(x - k.x0) > 26 || Math.abs(z - k.z0) > 26) continue;
      add = Math.max(add, this.kickerOffset(k, x, z));
    }
    for (let i = 0; i < this.grinds.length; i++) {
      const g = this.grinds[i];
      if (Math.abs(x - g.ax) > 20 || Math.abs(z - g.az) > 20) continue;
      add = Math.max(add, this.boxRampOffset(g, x, z));
    }
    return h + add;
  },
  groundNormal(x, z, out) {
    const e = 0.5;
    const hx = this.groundHeight(x + e, z) - this.groundHeight(x - e, z);
    const hz = this.groundHeight(x, z + e) - this.groundHeight(x, z - e);
    const l = Math.hypot(hx, 2 * e, hz);
    out.x = -hx / l; out.y = 2 * e / l; out.z = -hz / l;
    return out;
  },
  nearKicker(x, z) {
    for (const k of this.kickers) if (this.kickerOffset(k, x, z) > 0.02) return k;
    return null;
  },

  // ---- colliders: circles or oriented boxes in xz, each with a top height ----
  // box rotation follows three.js rotation.y: local x maps to world (cos r, -sin r)
  addBoxCollider(x, z, hw, hd, rot, top, kind, ref) {
    const c = this.addCollider(x, z, Math.hypot(hw, hd), top, kind, ref);
    Object.assign(c, { box: true, hw, hd, cr: Math.cos(rot), sr: Math.sin(rot) });
    return c;
  },
  // push needed to move a circle of radius R at (px, pz) out of collider c, with the contact normal
  colliderPush(c, px, pz, R) {
    const dx = px - c.x, dz = pz - c.z;
    if (!c.box) {
      const d = Math.hypot(dx, dz), min = c.r + R;
      if (d >= min) return null;
      const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
      return { x: nx * (min - d), z: nz * (min - d), nx, nz, depth: min - d };
    }
    const lx = dx * c.cr - dz * c.sr, lz = dx * c.sr + dz * c.cr;
    const qx = clamp(lx, -c.hw, c.hw), qz = clamp(lz, -c.hd, c.hd);
    let ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez), nlx, nlz, depth;
    if (d > 1e-6) {
      if (d >= R) return null;
      nlx = ex / d; nlz = ez / d; depth = R - d;
    } else {
      // inside the box: leave by the nearest face
      const px2 = c.hw - Math.abs(lx), pz2 = c.hd - Math.abs(lz);
      if (px2 < pz2) { nlx = Math.sign(lx) || 1; nlz = 0; depth = px2 + R; } else { nlx = 0; nlz = Math.sign(lz) || 1; depth = pz2 + R; }
    }
    const nx = nlx * c.cr + nlz * c.sr, nz = -nlx * c.sr + nlz * c.cr;
    return { x: nx * depth, z: nz * depth, nx, nz, depth };
  },
  addCollider(x, z, r, top, kind, ref) {
    const c = { x, z, r, top, kind, ref };
    const idx = this.colliders.push(c) - 1;
    const cs = this.cell;
    const i0 = Math.floor((x - r) / cs), i1 = Math.floor((x + r) / cs), j0 = Math.floor((z - r) / cs), j1 = Math.floor((z + r) / cs);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const key = i * 4096 + j;
      let a = this.cgrid.get(key);
      if (!a) this.cgrid.set(key, (a = []));
      a.push(idx);
    }
    return c;
  },
  queryColliders(x, z, r, out) {
    out.length = 0;
    const cs = this.cell;
    const i0 = Math.floor((x - r) / cs), i1 = Math.floor((x + r) / cs), j0 = Math.floor((z - r) / cs), j1 = Math.floor((z + r) / cs);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const a = this.cgrid.get(i * 4096 + j);
      if (!a) continue;
      for (const idx of a) { const c = this.colliders[idx]; if (out.indexOf(c) < 0) out.push(c); }
    }
    return out;
  },
};
