// ============================================================================
//  util — math helpers, seeded random, noise
// ============================================================================
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const dampAngle = (a, b, lambda, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
const smax = (a, b, k) => { const h = clamp(0.5 + 0.5 * (a - b) / k, 0, 1); return lerp(b, a, h) + k * h * (1 - h); };
const smin = (a, b, k) => -smax(-a, -b, k);

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2i(x, z) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function makeSimplex(seed) {
  const rnd = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512), pm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm[i] = (perm[i] % 12) * 2; }
  const g = new Float32Array([1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 1, 0, -1, 0, 0, 1, 0, -1, 0, 1, 0, -1]);
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  return function (xin, yin) {
    let n0 = 0, n1 = 0, n2 = 0;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const k = pm[ii + perm[jj]]; t0 *= t0; n0 = t0 * t0 * (g[k] * x0 + g[k + 1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const k = pm[ii + i1 + perm[jj + j1]]; t1 *= t1; n1 = t1 * t1 * (g[k] * x1 + g[k + 1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const k = pm[ii + 1 + perm[jj + 1]]; t2 *= t2; n2 = t2 * t2 * (g[k] * x2 + g[k + 1] * y2); }
    return 70 * (n0 + n1 + n2);
  };
}
const noiseA = makeSimplex(1337);
const noiseB = makeSimplex(4242);
const noiseC = makeSimplex(9001);

function fbm(n, x, z, oct, lac = 2.03, gain = 0.5) {
  let a = 1, f = 1, s = 0, norm = 0;
  for (let i = 0; i < oct; i++) { s += a * n(x * f, z * f); norm += a; a *= gain; f *= lac; }
  return s / norm;
}
function ridged(n, x, z, oct) {
  let a = 1, f = 1, s = 0, norm = 0, w = 1;
  for (let i = 0; i < oct; i++) {
    let v = 1 - Math.abs(n(x * f, z * f));
    v *= v; v *= w; w = clamp(v * 1.6, 0, 1);
    s += a * v; norm += a; a *= 0.5; f *= 2.1;
  }
  return s / norm;
}

// distance from point to segment (2D) returning [dist, t, signedSide]
function segDist(px, pz, ax, az, bx, bz, out) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1e-9;
  let t = ((px - ax) * dx + (pz - az) * dz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t, cz = az + dz * t;
  const ex = px - cx, ez = pz - cz;
  out[0] = Math.sqrt(ex * ex + ez * ez);
  out[1] = t;
  out[2] = dx * ez - dz * ex; // sign: >0 left of direction
  return out;
}

// Catmull-Rom (centripetal-ish, uniform) resample of 2D control points every `step` meters
function resamplePath(ctrl, step) {
  const dense = [];
  const P = (i) => ctrl[clamp(i, 0, ctrl.length - 1)];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const segs = 40;
    for (let k = 0; k < segs; k++) {
      const t = k / segs, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  dense.push(ctrl[ctrl.length - 1].slice());
  // arc-length resample
  const out = [dense[0].slice()];
  let acc = 0;
  for (let i = 1; i < dense.length; i++) {
    let ax = dense[i - 1][0], az = dense[i - 1][1];
    const bx = dense[i][0], bz = dense[i][1];
    let seg = Math.hypot(bx - ax, bz - az);
    while (acc + seg >= step) {
      const r = (step - acc) / seg;
      ax = ax + (bx - ax) * r; az = az + (bz - az) * r;
      out.push([ax, az]);
      seg = Math.hypot(bx - ax, bz - az);
      acc = 0;
    }
    acc += seg;
  }
  const last = dense[dense.length - 1];
  const lo = out[out.length - 1];
  if (Math.hypot(last[0] - lo[0], last[1] - lo[1]) > step * 0.3) out.push(last.slice());
  return out;
}

function fmtTime(t) {
  if (!isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
}
