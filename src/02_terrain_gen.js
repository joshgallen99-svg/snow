// ============================================================================
//  terrain generation — authored mountain + carved runs, baked into a grid
//  Pure JS (no THREE) so it can be tested headless.
// ============================================================================
function cone(r, peak, R, p) { const t = 1 - r / R; return t <= 0 ? 0 : (peak - 35) * Math.pow(t, p); }

const RIDGE_FEATURES = [
  // east spur that Super Ridge follows
  { pts: [[160, -760], [330, -620], [520, -470], [690, -300], [800, -80], [870, 150], [905, 380]], h: 30, w: 105 },
];
const GULLY_FEATURES = [
  // North Couloir: narrow slot with raised rock walls
  { pts: [[150, -862], [200, -742], [228, -622], [238, -520]], depth: 16, w: 12, wall: 12 },
  // the west ravine, strictly off limits
  { pts: [[-330, -470], [-470, -250], [-600, 0], [-720, 260], [-830, 520], [-930, 780], [-1010, 1000], [-1060, 1220], [-1080, 1360]], depth: 58, w: 46, wall: 0 },
];
const RIVER = [[-6400, 1900], [-4200, 1650], [-2600, 1420], [-1600, 1340], [-1080, 1372], [-600, 1350], [-150, 1318], [300, 1262], [800, 1196], [1250, 1150], [1600, 1120], [2600, 1180], [4200, 1500], [6400, 1700]];
const BOWLS = [{ x: -70, z: -700, r: 240, depth: 24 }];

function polyDist(pts, x, z, tmp) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    segDist(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], tmp);
    if (tmp[0] < best) best = tmp[0];
  }
  return best;
}

const _tmp3 = [0, 0, 0];
const _featBoxes = [...RIDGE_FEATURES.map((f) => [f, f.w * 3]), ...GULLY_FEATURES.map((f) => [f, f.w * 4 + 40])].map(([f, m]) => {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const p of f.pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  f.box = [x0 - m, x1 + m, z0 - m, z1 + m];
  return f;
});
const inBox = (b, x, z) => x > b[0] && x < b[1] && z > b[2] && z < b[3];

// large-scale shape, evaluated on a 4 m grid and upsampled
function baseCoarse(x, z) {
  const wx = x + 45 * noiseB(x / 650, z / 650), wz = z + 45 * noiseB(x / 650 + 9, z / 650 + 3);
  const dx = wx - SUMMIT[0], dz = wz - SUMMIT[1];
  const rr = Math.hypot(dx, dz);
  const ang = Math.atan2(-dx, dz); // 0 = south; the seam points north, behind the summit
  const stretch = 1 - 0.1 * Math.cos(ang - 0.45); // longer apron toward the south-west village
  let h = cone(rr * stretch, 735, 2450, 2.0);
  h = smin(h, 668, 40); // rounded summit dome
  h = smax(h, cone(Math.hypot(x + 1720, z + 420), 560, 1380, 1.6), 90);  // western neighbour peak
  h = smax(h, cone(Math.hypot(x - 1950, z + 1350), 480, 1350, 1.6), 90); // north-east shoulder
  const alt = sstep(90, 560, h);
  // volcanic ribs radiating from the summit
  const ribA = 20 * sstep(260, 700, rr) * (1 - sstep(1500, 2150, rr));
  h += (ridged(noiseC, ang * 6.5, rr / 330, 3) - 0.5) * ribA;
  h += fbm(noiseA, x / 900, z / 900, 3) * (6 + 16 * alt);
  for (const f of RIDGE_FEATURES) {
    if (!inBox(f.box, x, z)) continue;
    const d = polyDist(f.pts, x, z, _tmp3);
    h += f.h * Math.exp(-(d * d) / (f.w * f.w));
  }
  for (const g of GULLY_FEATURES) {
    if (!inBox(g.box, x, z)) continue;
    const d = polyDist(g.pts, x, z, _tmp3);
    h -= g.depth * Math.exp(-(d * d) / (g.w * g.w * 2));
    if (g.wall) h += g.wall * Math.exp(-((d - g.w * 2.1) ** 2) / (g.w * g.w * 0.7));
  }
  for (const b of BOWLS) {
    const d = Math.hypot(x - b.x, z - b.z) / b.r;
    if (d < 1) { const t = 1 - d * d; h -= b.depth * t * t; }
  }
  // the valley river
  if (z > 1000) {
    const d = polyDist(RIVER, x, z, _tmp3);
    if (d < 60) h -= 5.5 * (1 - sstep(6, 26, d)) + 1.5 * (1 - sstep(20, 60, d));
  }
  h += fbm(noiseB, x / 140, z / 140, 3) * (1.8 + 7 * alt);
  // beyond the resort: rolling forested hills and the far side of the valley
  const out = sstep(1300, 2600, Math.max(Math.abs(x), Math.abs(z) - (z > 0 ? 300 : 0)));
  if (out > 0) h += out * ((fbm(noiseA, x / 1100 + 5, z / 1100, 4) * 0.5 + 0.5) * 230 + (ridged(noiseC, x / 520 + 3, z / 520, 4) - 0.4) * 150) + sstep(2400, 5200, z) * 180;
  return h + 35;
}
function baseFine(x, z, h) {
  const alt = sstep(90, 560, h);
  return noiseA(x / 26, z / 26) * (0.45 + 1.1 * alt) + noiseC(x / 9, z / 9) * 0.22;
}
function baseHeight(x, z) { const h = baseCoarse(x, z); return h + baseFine(x, z, h); }

// Build run geometry data: dense path, cumulative length, profile, tangents
function buildRunPath(run) {
  const step = 4;
  const pts = resamplePath(run.pts, step);
  const n = pts.length;
  const s = new Float32Array(n), tx = new Float32Array(n), tz = new Float32Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    tx[i] = (b[0] - a[0]) / l; tz[i] = (b[1] - a[1]) / l;
  }
  // curvature (signed) for banking
  const curv = new Float32Array(n);
  for (let i = 2; i < n - 2; i++) {
    const c = tx[i - 2] * tz[i + 2] - tz[i - 2] * tx[i + 2];
    curv[i] = c / (s[i + 2] - s[i - 2]);
  }
  const curvS = new Float32Array(n);
  for (let i = 0; i < n; i++) { let a = 0, c = 0; for (let k = -6; k <= 6; k++) { const j = clamp(i + k, 0, n - 1); a += curv[j]; c++; } curvS[i] = a / c; }
  return { pts, n, s, tx, tz, curv: curvS, len: s[n - 1], step };
}

function computeProfile(run, path, sampleBase) {
  const n = path.n, d = DIFF[run.diff];
  const nat = new Float32Array(n);
  for (let i = 0; i < n; i++) nat[i] = sampleBase(path.pts[i][0], path.pts[i][1]);
  // smooth natural
  const sm = new Float32Array(n);
  for (let i = 0; i < n; i++) { let a = 0, c = 0; for (let k = -5; k <= 5; k++) { const j = clamp(i + k, 0, n - 1); a += nat[j]; c++; } sm[i] = a / c; }
  sm[0] = nat[0]; sm[n - 1] = nat[n - 1];
  const fw = new Float32Array(n), bw = new Float32Array(n);
  fw[0] = sm[0];
  for (let i = 1; i < n; i++) {
    const ds = path.s[i] - path.s[i - 1];
    fw[i] = clamp(sm[i], fw[i - 1] - d.maxG * ds, fw[i - 1] - d.minG * ds);
  }
  bw[n - 1] = sm[n - 1];
  for (let i = n - 2; i >= 0; i--) {
    const ds = path.s[i + 1] - path.s[i];
    bw[i] = clamp(sm[i], bw[i + 1] + d.minG * ds, bw[i + 1] + d.maxG * ds);
  }
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) { const w = sstep(0, 1, i / (n - 1)); y[i] = lerp(fw[i], bw[i], w); }
  // smooth then re-clamp
  for (let pass = 0; pass < 3; pass++) {
    const t = Float32Array.from(y);
    for (let i = 1; i < n - 1; i++) { let a = 0, c = 0; for (let k = -4; k <= 4; k++) { const j = clamp(i + k, 0, n - 1); a += t[j]; c++; } y[i] = a / c; }
    for (let i = 1; i < n; i++) {
      const ds = path.s[i] - path.s[i - 1];
      y[i] = clamp(y[i], y[i - 1] - d.maxG * 1.05 * ds, y[i - 1] - d.minG * 0.9 * ds);
    }
  }
  return { y, nat };
}

// feature offsets along s (rollers, drops, kicker landings)
function profileOffset(run, path, s) {
  let off = 0;
  const L = path.len;
  for (const f of run.features) {
    if (f.k === 'rollers') {
      const a = f.t0 * L, b = f.t1 * L;
      if (s > a && s < b) {
        const env = sstep(a, a + f.wl, s) * sstep(b, b - f.wl, s);
        off += f.amp * env * Math.sin(((s - a) / f.wl) * TAU);
      }
    } else if (f.k === 'kicker') {
      const K = KICKER_SIZES[f.size];
      const lip = f.t * L + K[0] * 0.5;              // lip position (kicker centered on t)
      const g0 = lip + K[0] * 0.25, g1 = g0 + K[4] * 0.55, g2 = g1 + K[4] * 4.0;
      if (s > g0) {
        if (s < g1) off -= K[3] * sstep(g0, g1, s);
        else if (s < g2) off -= K[3] * (1 - sstep(g1, g2, s));
      }
    } else if (f.k === 'drop' || f.k === 'cornice') {
      const H = f.k === 'cornice' ? 6 : f.h;
      const p = f.t * L, w = f.k === 'cornice' ? 7 : 5;
      const rec = 220;
      if (s > p) {
        if (s < p + w) off -= H * sstep(p, p + w, s);
        else if (s < p + w + rec) off -= H * (1 - sstep(p + w, p + w + rec, s));
      }
    }
  }
  return off;
}

function lateralShape(run, path, s, lat) {
  // moguls: staggered bumps
  let off = 0;
  for (const f of run.features) {
    if (f.k !== 'moguls') continue;
    const a = f.t0 * path.len, b = f.t1 * path.len;
    if (s > a && s < b) {
      const env = sstep(a, a + 20, s) * sstep(b, b - 20, s);
      const row = Math.floor(s / 6.5);
      const ph = (row & 1) ? 0.5 : 0;
      const u = s / 6.5 - row, v = lat / 6 + ph;
      const bump = Math.sin(u * Math.PI) * (0.5 + 0.5 * Math.cos(v * TAU));
      off += f.amp * env * (bump * 1.6 - 0.6);
    }
  }
  return off;
}

function featureRange(run, kind) {
  return run.features.filter((f) => f.k === kind);
}

// ---------------------------------------------------------------------------
function generateTerrain(progress) {
  const N = WORLD.N, res = WORLD.res, half = WORLD.half;
  const H = new Float32Array(N * N);
  const runId = new Uint8Array(N * N).fill(255);
  const groom = new Uint8Array(N * N);     // 0..255 groomed corduroy
  const powder = new Uint8Array(N * N);    // 0..255 snow depth
  const dir = new Uint8Array(N * N);       // run tangent angle 0..pi
  const inRun = new Uint8Array(N * N);     // 0..255 how far inside a run corridor
  const gx = (i) => -half + i * res;

  const steps = [];
  // 1) base terrain
  const Nc = (N - 1) / 2 + 1;
  const C = new Float32Array(Nc * Nc);
  steps.push(() => {
    for (let j = 0; j < Nc; j++) { const z = -half + j * res * 2; for (let i = 0; i < Nc; i++) C[j * Nc + i] = baseCoarse(-half + i * res * 2, z); }
  });
  steps.push(() => {
    const cr = (a, b, c, d) => (-a + 9 * b + 9 * c - d) * 0.0625;
    const Cc = (i, j) => C[clamp(j, 0, Nc - 1) * Nc + clamp(i, 0, Nc - 1)];
    for (let j = 0; j < N; j += 2) {
      const cj = j >> 1;
      for (let i = 0; i < N; i++) {
        const ci = i >> 1;
        H[j * N + i] = (i & 1) ? cr(Cc(ci - 1, cj), Cc(ci, cj), Cc(ci + 1, cj), Cc(ci + 2, cj)) : Cc(ci, cj);
      }
    }
    for (let j = 1; j < N; j += 2) {
      for (let i = 0; i < N; i++) {
        const r = (jj) => H[clamp(jj, 0, N - 1) * N + i];
        H[j * N + i] = cr(r(j - 3), r(j - 1), r(j + 1), r(j + 3));
      }
    }
    for (let j = 0; j < N; j++) { const z = gx(j); for (let i = 0; i < N; i++) { const k = j * N + i; H[k] += baseFine(gx(i), z, H[k]); } }
  });
  const sample = (x, z) => {
    const fx = clamp((x + half) / res, 0, N - 1.001), fz = clamp((z + half) / res, 0, N - 1.001);
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j;
    const k = j * N + i;
    return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + N] * (1 - u) + H[k + N + 1] * u) * v;
  };
  // 2) station pads
  const pads = [];
  for (const L of LIFTS) { pads.push({ x: L.a[0], z: L.a[1], r: 26 }); pads.push({ x: L.b[0], z: L.b[1], r: 24 }); }
  pads.push({ x: VILLAGE.center[0], z: VILLAGE.center[1], r: 90 }); // village plaza
  pads.push({ x: VILLAGE.east[0], z: VILLAGE.east[1], r: 45 });  // east base
  const applyPads = (scale) => {
    for (const p of pads) {
      const h0 = sample(p.x, p.z);
      p.h = h0;
      const R = p.r * 2.2 * scale;
      const i0 = Math.max(0, Math.floor((p.x - R + half) / res)), i1 = Math.min(N - 1, Math.ceil((p.x + R + half) / res));
      const j0 = Math.max(0, Math.floor((p.z - R + half) / res)), j1 = Math.min(N - 1, Math.ceil((p.z + R + half) / res));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(gx(i) - p.x, gx(j) - p.z);
        const t = 1 - sstep(p.r * scale, R, d);
        if (t > 0) { const k = j * N + i; H[k] = lerp(H[k], h0, t); }
      }
    }
  };
  steps.push(() => applyPads(1));

  // 3) runs
  const runData = [];
  const sumW = new Float32Array(N * N), sumWT = new Float32Array(N * N), maxIn = new Float32Array(N * N);
  const bestD = new Float32Array(N * N), bestS = new Float32Array(N * N), bestL = new Float32Array(N * N), bestSeg = new Int32Array(N * N);
  steps.push(() => {
    for (const run of RUNS) {
      const path = buildRunPath(run);
      const prof = computeProfile(run, path, sample);
      runData.push({ run, path, prof });
    }
  });
  steps.push(() => {
    for (const rd of runData) {
      const { run, path, prof } = rd;
      const W = run.w, E = 18 + W * 0.6, R = W + E + 4;
      // bounding box
      let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
      for (const p of path.pts) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]); }
      const i0 = Math.max(0, Math.floor((minx - R + half) / res)), i1 = Math.min(N - 1, Math.ceil((maxx + R + half) / res));
      const j0 = Math.max(0, Math.floor((minz - R + half) / res)), j1 = Math.min(N - 1, Math.ceil((maxz + R + half) / res));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) bestD[j * N + i] = 1e9;
      const tmp = [0, 0, 0];
      for (let k = 0; k < path.n - 1; k++) {
        const a = path.pts[k], b = path.pts[k + 1];
        const ci0 = Math.max(i0, Math.floor((Math.min(a[0], b[0]) - R + half) / res)), ci1 = Math.min(i1, Math.ceil((Math.max(a[0], b[0]) + R + half) / res));
        const cj0 = Math.max(j0, Math.floor((Math.min(a[1], b[1]) - R + half) / res)), cj1 = Math.min(j1, Math.ceil((Math.max(a[1], b[1]) + R + half) / res));
        for (let j = cj0; j <= cj1; j++) {
          const z = gx(j);
          for (let i = ci0; i <= ci1; i++) {
            segDist(gx(i), z, a[0], a[1], b[0], b[1], tmp);
            const idx = j * N + i;
            if (tmp[0] < bestD[idx]) {
              bestD[idx] = tmp[0];
              bestS[idx] = path.s[k] + tmp[1] * (path.s[k + 1] - path.s[k]);
              bestL[idx] = tmp[2] > 0 ? tmp[0] : -tmp[0];
              bestSeg[idx] = k;
            }
          }
        }
      }
      // accumulate
      const ri = run.index;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const idx = j * N + i;
        const d = bestD[idx];
        if (d > R) continue;
        const s = bestS[idx], k = bestSeg[idx], lat = bestL[idx];
        // run-end caps: fade the corridor past the ends so it doesn't carve a trench beyond
        const endFade = 1;
        const kk = Math.min(path.n - 1, k + 1), tt = (s - path.s[k]) / Math.max(0.001, path.s[kk] - path.s[k]);
        const yBase = lerp(prof.y[k], prof.y[kk], clamp(tt, 0, 1));
        const curv = lerp(path.curv[k], path.curv[kk], clamp(tt, 0, 1));
        const bank = clamp(-curv * run.bank * 220, -0.35, 0.35) * lat; // outer edge higher
        const nat = H[idx];
        const crossKeep = run.groomed ? 0.12 : 0.3;
        let target = yBase + profileOffset(run, path, s) + bank + lateralShape(run, path, s, lat);
        target = lerp(target, target + (nat - yBase) * crossKeep * sstep(0, W, d), 1);
        const inner = (1 - sstep(W * 0.8, W + E, d)) * endFade;
        if (inner <= 0) continue;
        const w = inner * inner + 1e-4;
        sumW[idx] += w; sumWT[idx] += w * target;
        if (inner > maxIn[idx]) {
          maxIn[idx] = inner;
          const core = 1 - sstep(W * 0.75, W * 1.05, d);
          if (core > 0.01) {
            runId[idx] = ri;
            inRun[idx] = Math.round(core * 255);
            groom[idx] = run.groomed ? Math.round(core * 255) : 0;
            const ang = Math.atan2(path.tz[k], path.tx[k]);
            dir[idx] = Math.round((((ang % Math.PI) + Math.PI) % Math.PI) / Math.PI * 255);
          }
        }
      }
    }
  });
  steps.push(() => {
    for (let idx = 0; idx < N * N; idx++) {
      if (maxIn[idx] > 0) H[idx] = lerp(H[idx], sumWT[idx] / sumW[idx], maxIn[idx]);
    }
    applyPads(0.6);
  });
  // 4) powder depth field
  steps.push(() => {
    const powderRanges = runData.map((rd) => featureRange(rd.run, 'powder').map((f) => [f.t0 * rd.path.len, f.t1 * rd.path.len]));
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const idx = j * N + i;
      const h = H[idx];
      // off-piste: moderate snow, deeper higher up
      let p = 0.35 + 0.35 * sstep(300, 900, h) + 0.15 * noiseB(gx(i) / 60, gx(j) / 60);
      const ri = runId[idx];
      if (ri !== 255) {
        const core = inRun[idx] / 255;
        const g = groom[idx] / 255;
        p = lerp(p, 0.05, g);
        if (!RUNS[ri].groomed) p = Math.max(p, 0.45);
        // explicit powder zones need s; approximate via any powder feature on run
        if (powderRanges[ri].length) p = lerp(p, 0.95, core * 0.9);
      }
      powder[idx] = Math.round(clamp(p, 0, 1) * 255);
    }
  });

  return { steps, finish: () => ({ H, runId, groom, powder, dir, inRun, runData, pads, sample }) };
}
