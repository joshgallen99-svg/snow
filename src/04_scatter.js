// ============================================================================
//  scatter — deterministic placement of everything that sits on the mountain
// ============================================================================
const ROADS = [
  { pts: [[-1600, 1262], [-1100, 1290], [-640, 1268], [-200, 1236], [300, 1186], [800, 1120], [1250, 1080], [1600, 1060]], w: 6 }, // valley road
  { pts: [[-640, 1268], [-655, 1185], [-640, 1120]], w: 5 },               // village main street
  { pts: [[-905, 1150], [-760, 1160], [-640, 1150], [-470, 1130], [-330, 1150], [-200, 1236]], w: 4.5 }, // village cross street
  { pts: [[-640, 1268], [-660, 1420], [-700, 1600]], w: 5 },               // south road over the river
  { pts: [[905, 700], [920, 860], [880, 1000], [830, 1110]], w: 5 },        // east base access
];
const BOUNDARY = [[-250, -470], [-385, -235], [-505, 10], [-625, 268], [-730, 520], [-830, 770], [-905, 960], [-960, 1120]];
const RAVINE = GULLY_FEATURES[1].pts;

const Scatter = {
  trees: [], rocks: [], lamps: [], guns: [], tokens: [], signs: [], buildings: [], gatesByRun: {}, cornices: [], cliffs: [],
  forestGrid: null, fN: 0, fRes: 8,
  road: null,

  polyDistance(pts, x, z) { return polyDist(pts, x, z, [0, 0, 0]); },

  run(progressSteps) {
    progressSteps.push(() => this.applyRoads());
    progressSteps.push(() => this.layoutVillage());
    progressSteps.push(() => this.buildForestGrid());
    progressSteps.push(() => this.placeTrees());
    progressSteps.push(() => { this.placeRunFurniture(); this.placeRocks(); this.placeTokens(); this.placeGates(); });
  },

  // ---- roads: level the cross-section and mark the road mask ---------------
  applyRoads() {
    const W = World, N = W.N, res = W.res, half = W.half;
    this.road = new Uint8Array(N * N);
    const tmp = [0, 0, 0];
    for (const r of ROADS) {
      const pts = resamplePath(r.pts, 6);
      const ys = pts.map((p) => W.height(p[0], p[1]));
      // smooth the road profile
      for (let pass = 0; pass < 4; pass++) for (let i = 1; i < ys.length - 1; i++) ys[i] = (ys[i - 1] + ys[i] * 2 + ys[i + 1]) / 4;
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1], R = r.w + 10;
        const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - R + half) / res)), i1 = Math.min(N - 1, Math.ceil((Math.max(a[0], b[0]) + R + half) / res));
        const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - R + half) / res)), j1 = Math.min(N - 1, Math.ceil((Math.max(a[1], b[1]) + R + half) / res));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const x = -half + i * res, z = -half + j * res;
          segDist(x, z, a[0], a[1], b[0], b[1], tmp);
          if (tmp[0] > R) continue;
          const y = lerp(ys[k], ys[k + 1], tmp[1]) + 0.15;
          const idx = j * N + i;
          const t = 1 - sstep(r.w * 0.8, R, tmp[0]);
          W.H[idx] = lerp(W.H[idx], y, t);
          const m = Math.round((1 - sstep(r.w * 0.55, r.w * 0.85, tmp[0])) * 255);
          if (m > this.road[idx]) this.road[idx] = m;
        }
      }
    }
  },

  // ---- village ---------------------------------------------------------------
  layoutVillage() {
    const rnd = mulberry32(77);
    const B = this.buildings;
    const add = (b) => { B.push(b); return b; };
    const vc = VILLAGE.center;
    // signature buildings
    add({ kind: 'lodge', name: 'Welcome Center', x: -545, z: 1048, rot: 0.08, w: 46, d: 22, floors: 2, wall: '#7a5236', roof: '#3c3f46' });
    add({ kind: 'lodge', name: 'East Base Lodge', x: 935, z: 690, rot: -0.3, w: 30, d: 16, floors: 2, wall: '#6f4a2e', roof: '#3a3d42' });
    add({ kind: 'hut', name: 'Bell Hut', x: -170, z: -205, rot: 0.6, w: 18, d: 11, floors: 1, wall: '#8a5a34', roof: '#2f5b3a' });
    add({ kind: 'hut', name: 'Summit Hut', x: 128, z: -888, rot: -0.2, w: 9, d: 7, floors: 1, wall: '#7d6650', roof: '#7a2a24' });
    add({ kind: 'hut', name: 'Birch Cafe', x: -210, z: 470, rot: 0.2, w: 14, d: 9, floors: 1, wall: '#8c6239', roof: '#7a2a24' });
    // hotels and chalets on lots around the village
    const wallCols = ['#d9d2c5', '#a2783f', '#6e4b33', '#c9c2b8', '#8a6a4f', '#b5a48b', '#e6e0d4'];
    const roofCols = ['#3a3f47', '#7a2b25', '#2f4f3a', '#4a3a2c', '#2d3b52'];
    const blocked = (x, z, r) => {
      if (World.attr(World.inRun, x, z) > 0) return true;
      for (const b of B) if (Math.hypot(b.x - x, b.z - z) < r + Math.max(b.w, b.d) * 0.6) return true;
      for (const L of LIFTS) if (polyDist([L.a, L.b], x, z, [0, 0, 0]) < r + 12) return true;
      for (const L of LIFTS) if (Math.hypot(L.a[0] - x, L.a[1] - z) < r + 34) return true;
      for (const rd of ROADS) if (polyDist(rd.pts, x, z, [0, 0, 0]) < r + rd.w + 3) return true;
      if (polyDist(RIVER, x, z, [0, 0, 0]) < r + 22) return true;
      if (polyDist(RAVINE, x, z, [0, 0, 0]) < r + 70) return true;
      return false;
    };
    for (let tries = 0; tries < 900 && B.length < 70; tries++) {
      const a = rnd() * TAU, d = 60 + Math.pow(rnd(), 0.8) * 420;
      const x = vc[0] + Math.cos(a) * d * 1.25, z = vc[1] + Math.sin(a) * d * 0.7 + 60;
      if (z < 940) continue;
      const hotel = d < 260 && rnd() < 0.55;
      const w = hotel ? 22 + rnd() * 18 : 9 + rnd() * 6, dd = hotel ? 12 + rnd() * 8 : 8 + rnd() * 4;
      const r = Math.max(w, dd) * 0.62;
      if (blocked(x, z, r)) continue;
      // face the nearest road
      let best = 1e9, rot = 0;
      for (const rd of ROADS) {
        for (let i = 0; i < rd.pts.length - 1; i++) {
          const tmp = segDist(x, z, rd.pts[i][0], rd.pts[i][1], rd.pts[i + 1][0], rd.pts[i + 1][1], [0, 0, 0]);
          if (tmp[0] < best) { best = tmp[0]; rot = Math.atan2(rd.pts[i + 1][1] - rd.pts[i][1], rd.pts[i + 1][0] - rd.pts[i][0]); }
        }
      }
      add({
        kind: hotel ? 'hotel' : 'chalet', x, z, rot: -rot + (rnd() < 0.5 ? 0 : Math.PI) + (rnd() - 0.5) * 0.1, w, d: dd,
        floors: hotel ? 3 + Math.floor(rnd() * 5) : 1 + Math.floor(rnd() * 2),
        wall: wallCols[Math.floor(rnd() * wallCols.length)], roof: roofCols[Math.floor(rnd() * roofCols.length)],
        flat: hotel && rnd() < 0.35,
      });
    }
    // a few cabins near the east base
    for (let k = 0; k < 9; k++) {
      const x = 960 + (rnd() - 0.5) * 260, z = 820 + (rnd() - 0.2) * 300;
      if (blocked(x, z, 8)) continue;
      add({ kind: 'chalet', x, z, rot: rnd() * TAU, w: 9 + rnd() * 5, d: 7 + rnd() * 3, floors: 1 + (rnd() < 0.4 ? 1 : 0), wall: wallCols[k % wallCols.length], roof: roofCols[k % roofCols.length] });
    }
    for (const b of B) {
      b.y = World.height(b.x, b.z);
      // flatten a footprint so buildings sit nicely
      const N = World.N, res = World.res, half = World.half, R = Math.max(b.w, b.d) * 0.75 + 6;
      const i0 = Math.max(0, Math.floor((b.x - R + half) / res)), i1 = Math.min(N - 1, Math.ceil((b.x + R + half) / res));
      const j0 = Math.max(0, Math.floor((b.z - R + half) / res)), j1 = Math.min(N - 1, Math.ceil((b.z + R + half) / res));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const dd = Math.hypot(-half + i * res - b.x, -half + j * res - b.z);
        const t = 1 - sstep(R - 8, R, dd);
        const idx = j * N + i;
        World.H[idx] = lerp(World.H[idx], b.y, t);
      }
      World.addBoxCollider(b.x, b.z, b.w / 2 + 0.35, b.d / 2 + 0.35, b.rot, b.y + b.floors * 3.2 + 4, 'building', b);
    }
  },

  // ---- forest density on an 8 m grid -------------------------------------------
  buildForestGrid() {
    const fRes = this.fRes, fN = Math.round(WORLD.half * 2 / fRes) + 1, half = WORLD.half;
    this.fN = fN;
    const G = new Float32Array(fN * fN);
    const runMul = new Float32Array(fN * fN).fill(1);
    // run-side forest settings
    for (const rd of World.runData) {
      const run = rd.run, p = rd.path, W = run.w;
      const forest = run.features.filter((f) => f.k === 'forest');
      for (let i = 0; i < p.n; i += 2) {
        const t = p.s[i] / p.len;
        let d = 0.8;
        for (const f of forest) if (t >= f.t0 && t <= f.t1) d = f.d;
        const R = W + 60;
        const [x, z] = p.pts[i];
        const ci = Math.round((x + half) / fRes), cj = Math.round((z + half) / fRes), cr = Math.ceil(R / fRes);
        for (let j = cj - cr; j <= cj + cr; j++) for (let ii = ci - cr; ii <= ci + cr; ii++) {
          if (ii < 0 || j < 0 || ii >= fN || j >= fN) continue;
          const dist = Math.hypot(-half + ii * fRes - x, -half + j * fRes - z);
          if (dist > R) continue;
          const m = lerp(d * 1.15, 1, sstep(W + 12, R, dist));
          const idx = j * fN + ii;
          if (m < runMul[idx]) runMul[idx] = m;
        }
      }
    }
    for (let j = 0; j < fN; j++) for (let i = 0; i < fN; i++) {
      const x = -half + i * fRes, z = -half + j * fRes;
      const h = World.height(x, z);
      let d = 0.82 * (1 - sstep(470, 590, h));
      d *= sstep(-0.45, 0.15, fbm(noiseA, x / 300 + 4, z / 300, 3));
      d = Math.max(d, 0.25 * (1 - sstep(520, 600, h)) * (0.5 + 0.5 * noiseB(x / 90, z / 90)));
      d *= runMul[j * fN + i];
      // keep the plaza, lift lines, roads, river, and boundary corridor open
      if (Math.hypot(x - VILLAGE.center[0], z - VILLAGE.center[1]) < 150) d *= 0.15;
      for (const p of World.pads) { const pd = Math.hypot(x - p.x, z - p.z); if (pd < p.r * 2.4) d *= sstep(p.r * 1.2, p.r * 2.4, pd); }
      for (const L of LIFTS) { const ld = polyDist([L.a, L.b], x, z, _tmp3); if (ld < 30) d *= sstep(8, 30, ld); }
      const rv = polyDist(RIVER, x, z, _tmp3); if (rv < 40) d *= sstep(14, 40, rv) * 0.8 + 0.2 * sstep(30, 40, rv);
      // out of bounds stays dense: the ravine is dark forest
      const rav = polyDist(RAVINE, x, z, _tmp3); if (rav < 150) d = Math.max(d, 0.85 * (1 - sstep(470, 560, h)));
      G[j * fN + i] = clamp(d, 0, 1);
    }
    this.forestGrid = G;
  },
  forestAt(x, z) {
    const fN = this.fN, half = WORLD.half, fRes = this.fRes, G = this.forestGrid;
    const fx = clamp((x + half) / fRes, 0, fN - 1.001), fz = clamp((z + half) / fRes, 0, fN - 1.001);
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * fN + i;
    return (G[k] * (1 - u) + G[k + 1] * u) * (1 - v) + (G[k + fN] * (1 - u) + G[k + fN + 1] * u) * v;
  },

  // ---- trees ------------------------------------------------------------------
  placeTrees() {
    const rnd = mulberry32(2024);
    const cell = 8.4, half = WORLD.half - 20;
    const glades = World.runData.map((rd) => rd.run.features.filter((f) => f.k === 'glade'));
    const nrm = { x: 0, y: 1, z: 0 };
    const roadAt = (x, z) => World.attr(this.road, x, z);
    for (let z = -half; z < half; z += cell) {
      for (let x = -half; x < half; x += cell) {
        const px = x + rnd() * cell, pz = z + rnd() * cell;
        const r0 = rnd(), r1 = rnd(), r2 = rnd(), r3 = rnd();
        let d = this.forestAt(px, pz);
        const ri = World.attr(World.runId, px, pz), inR = World.attr(World.inRun, px, pz);
        if (ri !== 255 && inR > 30) {
          // glade: sparse trees inside the run, never on the center line
          const rd = World.runData[ri];
          let g = 0;
          if (glades[ri].length) {
            const n = World.nearestOnRun(rd, px, pz);
            const t = n.s / rd.path.len;
            for (const f of glades[ri]) if (t >= f.t0 && t <= f.t1) g = f.d * sstep(4, 12, n.d);
          }
          d = g * 0.55;
        }
        if (roadAt(px, pz) > 0) d = 0;
        if (r0 > d) continue;
        const h = World.height(px, pz);
        World.normal(px, pz, nrm);
        if (nrm.y < 0.72) continue; // too steep for trees
        const birchBias = sstep(400, 120, h) * 0.75 + 0.18 * noiseC(px / 120, pz / 120);
        let type = r1 < birchBias ? 1 : 0;
        const nearTreeline = sstep(430, 590, h);
        // up near the treeline the wind plasters firs in rime until they're snow monsters (juhyo)
        if (type === 0 && rnd() < sstep(470, 560, h) * 0.85) type = 2;
        const s = (type ? 0.85 + r2 * 0.5 : 0.75 + r2 * 0.75) * (1 - nearTreeline * 0.55);
        const t = { x: px, z: pz, y: h - 0.2, s, rot: r3 * TAU, type, tint: r2 };
        this.trees.push(t);
        World.addCollider(px, pz, type === 1 ? 0.35 * s + 0.25 : type === 2 ? 0.9 * s + 0.4 : 0.5 * s + 0.35, h + 8 * s, 'tree', t);
      }
    }
  },

  // ---- lamps, snow guns, signs, cornices, cliffs ---------------------------------
  placeRunFurniture() {
    for (const rd of World.runData) {
      const run = rd.run, L = rd.path.len;
      for (const f of run.features) {
        if (f.k === 'lamps' || f.k === 'guns') {
          let side = 1, k = 0;
          for (let s = f.t0 * L + 10; s < f.t1 * L - 6; s += f.gap) {
            const c = World.pathAt(rd, s);
            const nx = -c.tz, nz = c.tx;
            const off = run.w + (f.k === 'lamps' ? 3.5 : 2.5);
            const x = c.x + nx * off * side, z = c.z + nz * off * side;
            const y = World.height(x, z);
            const o = { x, z, y, aimX: -nx * side, aimZ: -nz * side, run: run.index, k: k++ };
            if (f.k === 'lamps') { this.lamps.push(o); World.addCollider(x, z, 0.35, y + 10, 'pole', o); }
            else { this.guns.push(o); World.addCollider(x, z, 0.6, y + 4, 'gun', o); }
            side = -side;
          }
        } else if (f.k === 'cornice') {
          const c = World.pathAt(rd, f.t * L);
          this.cornices.push({ x: c.x, z: c.z, tx: c.tx, tz: c.tz, w: run.w * 1.6, y: World.height(c.x - c.tx * 2, c.z - c.tz * 2) });
        } else if (f.k === 'drop') {
          const c = World.pathAt(rd, f.t * L);
          this.cliffs.push({ x: c.x, z: c.z, tx: c.tx, tz: c.tz, w: run.w, h: f.h, run: run.index });
        }
      }
      // trail sign at the top of every run
      const c = World.pathAt(rd, 14);
      const nx = -c.tz, nz = c.tx, off = Math.min(run.w * 0.9, 14);
      const x = c.x + nx * off, z = c.z + nz * off;
      this.signs.push({ x, z, y: World.height(x, z), rot: Math.atan2(c.tx, c.tz), run: run.index, kind: 'trail' });
      World.addCollider(x, z, 0.4, World.height(x, z) + 3, 'sign', null);
    }
    // boundary rope poles
    this.boundaryPoles = [];
    const bp = resamplePath(BOUNDARY, 9);
    for (const p of bp) this.boundaryPoles.push({ x: p[0], z: p[1], y: World.height(p[0], p[1]) });
  },

  placeRocks() {
    const rnd = mulberry32(555);
    for (const rd of World.runData) {
      const run = rd.run, L = rd.path.len;
      for (const f of run.features) {
        if (f.k !== 'rocks') continue;
        for (let k = 0; k < f.n; k++) {
          const s = lerp(f.t0, f.t1, rnd()) * L;
          const c = World.pathAt(rd, s);
          const side = rnd() < 0.5 ? -1 : 1;
          const lat = side * lerp(0.32, 0.88, rnd()) * run.w; // keep a clean line down the middle
          const x = c.x - c.tz * lat, z = c.z + c.tx * lat;
          const r = 0.8 + rnd() * 1.6;
          this.addRock(x, z, r, rnd());
        }
      }
    }
    // cliff bands either side of each drop
    for (const cl of this.cliffs) {
      for (let side = -1; side <= 1; side += 2) {
        for (let k = 0; k < 4; k++) {
          const lat = side * (cl.w * (0.45 + k * 0.22));
          const x = cl.x - cl.tz * lat + cl.tx * (1 + rnd() * 2), z = cl.z + cl.tx * lat + cl.tz * (1 + rnd() * 2);
          this.addRock(x, z, 1.4 + rnd() * 1.4, rnd(), true);
        }
      }
    }
    // natural rock on steep ground and the exposed upper cone
    const nrm = { x: 0, y: 1, z: 0 };
    for (let i = 0; i < 9000; i++) {
      const x = (rnd() * 2 - 1) * (WORLD.half - 30), z = (rnd() * 2 - 1) * (WORLD.half - 30);
      const h = World.height(x, z);
      World.normal(x, z, nrm);
      const steep = nrm.y < 0.8, high = h > 560;
      if (!steep && !(high && rnd() < 0.25)) continue;
      if (World.attr(World.inRun, x, z) > 0) continue;
      if (World.attr(this.road, x, z) > 0) continue;
      this.addRock(x, z, 0.8 + rnd() * (steep ? 2.6 : 1.4), rnd());
    }
  },
  addRock(x, z, r, seed, cliff = false) {
    const y = World.height(x, z);
    // the boulder is a squashed ellipsoid sunk a third into the ground; physics uses the same shape
    const rock = { x, z, y: y - r * 0.35, r, seed, rot: seed * TAU, cliff, ax: ROCK_SHAPE[0] * r, ay: ROCK_SHAPE[1] * r * (cliff ? 1.3 : 1), az: ROCK_SHAPE[2] * r };
    // boulders that stand well clear of the snow can't be ridden up: they're walls
    rock.wall = rock.y + rock.ay - y > 0.55;
    this.rocks.push(rock);
    World.addRock(rock);
    World.addCollider(x, z, Math.max(rock.ax, rock.az), rock.y + rock.ay, 'rock', rock);
  },

  // ---- snowflake tokens: hovering collectibles -------------------------------------
  placeTokens() {
    const rnd = mulberry32(31337);
    for (const rd of World.runData) {
      const run = rd.run, L = rd.path.len;
      const n = clamp(Math.round(L / 140), 4, 9);
      const list = [];
      // air tokens above kicker landings
      for (const k of World.kickers.filter((k) => k.run === run.index)) {
        const x = k.x0 + k.dx * (k.len + 4 + k.lip * 2.2), z = k.z0 + k.dz * (k.len + 4 + k.lip * 2.2);
        list.push({ x, z, y: World.height(k.x0 + k.dx * k.len, k.z0 + k.dz * k.len) + k.lip + 1.2, air: true });
      }
      for (const g of World.grinds.filter((g) => g.run === run.index)) {
        list.push({ x: (g.ax + g.bx) / 2, z: (g.az + g.bz) / 2, y: (g.ay + g.by) / 2 + 1.1, air: true });
      }
      while (list.length < n) {
        const s = ((list.length + 0.5) / n) * L * 0.92 + L * 0.03;
        const c = World.pathAt(rd, s);
        const lat = (rnd() * 2 - 1) * run.w * 0.7;
        const x = c.x - c.tz * lat, z = c.z + c.tx * lat;
        list.push({ x, z, y: World.height(x, z) + 1.1, air: false });
      }
      list.slice(0, Math.max(n, list.length)).forEach((t, i) => this.tokens.push({ ...t, id: run.id + ':' + i, run: run.index }));
    }
  },

  // ---- time-trial gates ---------------------------------------------------------------
  placeGates() {
    for (const rd of World.runData) {
      const run = rd.run, L = rd.path.len, gates = [];
      const gap = clamp(L / 9, 70, 130);
      let side = 1;
      for (let s = 55; s < L - 45; s += gap) {
        const c = World.pathAt(rd, s);
        const lat = side * run.w * 0.3;
        const x = c.x - c.tz * lat, z = c.z + c.tx * lat;
        gates.push({ s, x, z, tx: c.tx, tz: c.tz, w: clamp(run.w * 0.9, 9, 16), y: World.height(x, z), side });
        side = -side;
      }
      this.gatesByRun[run.id] = gates;
    }
  },
};
