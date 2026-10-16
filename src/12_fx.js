// ============================================================================
//  fx — particles (edge spray, powder plumes, skid fans, landing puffs, smoke,
//  mist), the compacted snow trail, hovering snowflake tokens, lamp glows
// ============================================================================
// Particles are lit puffs: each one is a point sprite with a fake sphere normal,
// eroded by a tiling noise texture so no two look alike. "Hard" particles are
// crisp chunks of snow that catch the sun; soft ones are drifting powder.
const FX = {
  N: 22000, cursor: 0, _lc: new THREE.Color(),
  init(scene) {
    const N = this.N;
    this.p = new Float32Array(N * 3); this.v = new Float32Array(N * 3);
    this.life = new Float32Array(N); this.max = new Float32Array(N); this.size0 = new Float32Array(N); this.size1 = new Float32Array(N);
    this.drag = new Float32Array(N); this.grav = new Float32Array(N); this.alpha0 = new Float32Array(N);
    this.flags = new Uint8Array(N); this.floor = new Float32Array(N);
    const g = new THREE.BufferGeometry();
    const dyn = (n, k) => new THREE.BufferAttribute(new Float32Array(n * k), k).setUsage(THREE.DynamicDrawUsage);
    this.aPos = dyn(N, 3); this.aSize = dyn(N, 1); this.aAlpha = dyn(N, 1); this.aCol = dyn(N, 3); this.aMisc = dyn(N, 3);
    g.setAttribute('position', this.aPos); g.setAttribute('aSize', this.aSize); g.setAttribute('aAlpha', this.aAlpha);
    g.setAttribute('aCol', this.aCol); g.setAttribute('aMisc', this.aMisc);
    g.setDrawRange(0, 0);
    this.light = { value: new THREE.Color(1, 1, 1) };
    this.uni = {
      uLight: this.light, uPx: { value: 1 }, uNoise: { value: this.makeNoise() },
      uSunV: { value: new V3(0, 1, 0) }, uSunC: { value: new THREE.Color(1, 1, 1) }, uAmb: { value: new THREE.Color(0.6, 0.65, 0.75) },
      uRiderV: { value: new V3(0, 0, 1e5) },
    };
    const m = new THREE.ShaderMaterial({
      uniforms: Object.assign(this.uni, THREE.UniformsUtils.clone(THREE.UniformsLib.fog)), transparent: true, depthWrite: false, fog: true,
      vertexShader: /* glsl */`
        attribute float aSize; attribute float aAlpha; attribute vec3 aCol; attribute vec3 aMisc; uniform float uPx; uniform vec3 uRiderV;
        varying float vA; varying vec3 vC; varying vec3 vM;
        #include <fog_pars_vertex>
        void main(){ vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
          float px = aSize * uPx * 420.0 / max(0.3, -mvPosition.z);
          // sub-pixel specks fade out instead of flickering
          vA = aAlpha * clamp(px / 2.0, 0.0, 1.0) * smoothstep(1.2, 5.5, -mvPosition.z); gl_PointSize = max(px, 1.5);
          // big puffs right in front of the lens would white out the view: fade those harder
          vA *= 1.0 - smoothstep(60.0, 260.0, px) * 0.75;
          // keep a window open onto the rider: puffs between the camera and the rider thin out
          {
            float rr = dot(uRiderV, uRiderV);
            float t = dot(mvPosition.xyz, uRiderV) / max(rr, 1e-3);
            if (t > 0.0 && t < 0.97) {
              float d = length(mvPosition.xyz - uRiderV * t);
              vA *= mix(0.18, 1.0, smoothstep(0.4, 1.4 + aSize * 0.5, d));
            }
          }
          if (aAlpha <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          vC = aCol; vM = aMisc;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uNoise; uniform vec3 uSunV, uSunC, uAmb;
        varying float vA; varying vec3 vC; varying vec3 vM;
        #include <fog_pars_fragment>
        void main(){
          vec2 c = gl_PointCoord * 2.0 - 1.0; c.y = -c.y;
          float r2 = dot(c, c); if (r2 > 1.0) discard;
          float seed = vM.x, hard = vM.y, lit = vM.z;
          float a = seed * 6.2832; vec2 rc = mat2(cos(a), -sin(a), sin(a), cos(a)) * c;
          vec4 nz = texture2D(uNoise, rc * 0.32 + vec2(seed * 7.13, seed * 3.71));
          float n = nz.r * 0.6 + nz.g * 0.4;
          // soft: a smooth gaussian veil, barely broken by noise, so many overlapping puffs merge
          // into one continuous sheet of powder; hard: a chunk with a ragged edge
          float soft = exp(-r2 * 3.2) * (1.0 - r2) * (0.72 + 0.28 * n);
          float chunk = smoothstep(0.0, 0.22, 1.0 - sqrt(r2) - (nz.b - 0.5) * 0.55);
          float alpha = mix(soft, chunk, hard) * vA;
          if (alpha < 0.004) discard;
          // a veil is lit almost flat; only chunks get a lumpy sphere normal
          vec3 N = normalize(vec3(c * (0.35 + hard * 0.65) + (nz.rg - 0.5) * hard * 0.3, 1.0));
          float ndl = dot(N, uSunV);
          float wrap = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
          float diff = mix(0.55 + 0.45 * wrap, max(ndl, 0.0), hard);
          // looking toward the sun, thin powder glows
          float scatter = pow(max(0.0, -uSunV.z), 3.0) * (1.0 - hard) * 1.2;
          float spark = pow(max(0.0, dot(reflect(-uSunV, N), vec3(0.0, 0.0, 1.0))), 60.0) * hard * step(0.55, nz.a) * 3.0;
          vec3 shade = uAmb * (0.85 + 0.15 * N.y) + uSunC * (diff + scatter + spark);
          vec3 col = mix(vC, vC * shade, lit);
          gl_FragColor = vec4(col, alpha);
          #include <fog_fragment>
        }`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    scene.add(this.points);
    this.mat = m;
    this.hi = 0; // highest slot ever used, so the draw range stays tight
    this.em = { dist: 0, last: null, plume: 0, mist: 0, butter: 0 };
    this.initTrail(scene);
    this.initTokens(scene);
  },
  // tiling fbm noise, four decorrelated channels
  makeNoise() {
    const S = 64, data = new Uint8Array(S * S * 4), rnd = mulberry32(91);
    for (let ch = 0; ch < 4; ch++) {
      const oct = [];
      for (let o = 0, c = 4; o < 4; o++, c *= 2) { const g = new Float32Array(c * c); for (let i = 0; i < g.length; i++) g[i] = rnd(); oct.push({ c, g }); }
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        let v = 0, amp = 0.5, tot = 0;
        for (const { c, g } of oct) {
          const fx = (x / S) * c, fy = (y / S) * c, ix = Math.floor(fx), iy = Math.floor(fy);
          let u = fx - ix, w = fy - iy; u = u * u * (3 - 2 * u); w = w * w * (3 - 2 * w);
          const at = (a, b) => g[((b + c) % c) * c + ((a + c) % c)];
          v += amp * lerp(lerp(at(ix, iy), at(ix + 1, iy), u), lerp(at(ix, iy + 1), at(ix + 1, iy + 1), u), w);
          tot += amp; amp *= 0.55;
        }
        data[(y * S + x) * 4 + ch] = Math.round(clamp((v / tot - 0.5) * 1.6 + 0.5, 0, 1) * 255);
      }
    }
    const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  },
  // flags: 1 = settles on the snow instead of falling through it
  spawn(x, y, z, vx, vy, vz, life, s0, s1, a0, r = 1, g = 1, b = 1, grav = 1, drag = 1.5, hard = 0, lit = 1, flags = 0) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.N;
    if (i >= this.hi) { this.hi = i + 1; this.points.geometry.setDrawRange(0, this.hi); }
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = life; this.max[i] = life; this.size0[i] = s0; this.size1[i] = s1; this.alpha0[i] = a0;
    const C = this.aCol.array, M = this.aMisc.array;
    C[i * 3] = r; C[i * 3 + 1] = g; C[i * 3 + 2] = b;
    M[i * 3] = Math.random(); M[i * 3 + 1] = hard; M[i * 3 + 2] = lit;
    this.spawned = true;
    this.grav[i] = grav; this.drag[i] = drag; this.flags[i] = flags;
    if (flags) this.floor[i] = this.snowTop(x, z) + (flags & 2 ? 0.25 : 0);
    return i;
  },
  // the fresh snow surface (the layer sits on the ground)
  snowTop(x, z) {
    const gr = World.attr(World.groom, x, z) / 255, pw = World.attr(World.powder, x, z) / 255;
    return World.height(x, z) + lerp(0.3, 0.13, gr) + pw * (1 - gr) * 0.3;
  },
  burst(x, y, z, n, speed, opts = {}) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU, u = Math.random();
      this.spawn(x, y + 0.1, z, Math.cos(a) * speed * u + (opts.vx || 0), (0.4 + Math.random()) * speed * (opts.up ?? 0.7) + (opts.vy || 0), Math.sin(a) * speed * u + (opts.vz || 0),
        (opts.life || 1.2) * (0.6 + Math.random() * 0.6), opts.s0 || 0.25, opts.s1 || 0.9, opts.a || 0.85, opts.r ?? 1, opts.g ?? 1, opts.b ?? 1, opts.grav ?? 0.6, opts.drag ?? 2.2,
        opts.hard ?? 0, opts.lit ?? 1, opts.flags ?? 0);
    }
  },
  // a snow impact: a ring of heavy chunks thrown out low, and a cloud that rolls outward and hangs
  impact(x, y, z, vx, vz, power, powder) {
    const R = Math.random;
    const nC = Math.round(16 + power * 50), nP = Math.round(18 + power * (40 + powder * 60));
    for (let k = 0; k < nC; k++) {
      const a = R() * TAU, s = (1.5 + R() * 4) * (0.6 + power);
      this.chunk(x + Math.cos(a) * 0.3, y + 0.15, z + Math.sin(a) * 0.3, vx * 0.45 + Math.cos(a) * s, 2 + R() * 4 * (0.5 + power), vz * 0.45 + Math.sin(a) * s, 0.06 + R() * 0.1, 0.9 + R() * 0.7);
    }
    for (let k = 0; k < nP; k++) {
      // a ring of cloud thrown out and up, carried on with the rider's momentum
      const a = R() * TAU, s = (1 + R() * 3) * (0.5 + power);
      this.puff(x + Math.cos(a) * 0.5, y + 0.2 + R() * 0.3, z + Math.sin(a) * 0.5, vx * 0.35 + Math.cos(a) * s, 1.5 + R() * (2.5 + powder * 2.5) * (0.5 + power), vz * 0.35 + Math.sin(a) * s,
        1.2 + powder * 1.4 + power * 1.2 + R() * 0.8, 1.4 + R() * 1.2 + powder, 0.55, 0.45, 1.2);
    }
  },
  update(dt) {
    const H = this.hi, p = this.p, v = this.v, P = this.aPos.array, S = this.aSize.array, A = this.aAlpha.array;
    for (let i = 0; i < H; i++) {
      if (this.life[i] <= 0) { if (A[i] !== 0) A[i] = 0; continue; }
      this.life[i] -= dt;
      if (this.life[i] <= 0) { A[i] = 0; continue; }
      const t = 1 - this.life[i] / this.max[i];
      const dr = Math.exp(-this.drag[i] * dt), i3 = i * 3;
      v[i3] *= dr; v[i3 + 2] *= dr; v[i3 + 1] = v[i3 + 1] * dr - 9.81 * this.grav[i] * dt;
      p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
      const fl = this.flags[i];
      if (fl && p[i3 + 1] < this.floor[i] && v[i3 + 1] < 0) {
        p[i3 + 1] = this.floor[i]; v[i3 + 1] = 0;
        if (fl & 1) {
          // a chunk landed: slide to a stop on the surface and melt into it
          v[i3] *= 0.35; v[i3 + 2] *= 0.35;
          if (this.life[i] > 0.35) { this.life[i] = 0.35; this.max[i] = 0.35 / Math.max(0.05, 1 - t); }
        } else {
          // a cloud settling: it rolls out along the snow as it thins
          v[i3] *= 0.7; v[i3 + 2] *= 0.7; this.grav[i] = 0;
        }
        this.floor[i] = this.snowTop(p[i3], p[i3 + 2]) + (fl & 2 ? 0.25 : 0);
      }
      P[i3] = p[i3]; P[i3 + 1] = p[i3 + 1]; P[i3 + 2] = p[i3 + 2];
      S[i] = lerp(this.size0[i], this.size1[i], 1 - (1 - t) * (1 - t));
      A[i] = this.alpha0[i] * Math.min(1, t * 14 + 0.15) * (1 - t * t);
    }
    this.aPos.needsUpdate = true; this.aSize.needsUpdate = true; this.aAlpha.needsUpdate = true;
    // colour and per-particle constants only change when something spawns
    if (this.spawned) { this.aCol.needsUpdate = true; this.aMisc.needsUpdate = true; this.spawned = false; }
  },
  // light the particles like the rest of the scene
  updateLight(cam, rider) {
    const u = this.uni, s = Sky.sun;
    if (rider) u.uRiderV.value.set(rider.x, rider.y + 0.9, rider.z).applyMatrix4(cam.matrixWorldInverse); else u.uRiderV.value.set(0, 0, 1e5);
    u.uSunV.value.copy(U.uSunDir.value).transformDirection(cam.matrixWorldInverse);
    u.uSunC.value.copy(s.color).multiplyScalar(s.intensity * 0.55);
    u.uAmb.value.copy(Sky.hemi.color).multiplyScalar(Sky.hemi.intensity * 0.95);
    // lamps light the snow you throw up at night
    const lamp = U.uLampOn ? U.uLampOn.value : 0;
    if (lamp > 0) u.uAmb.value.add(this._lc.setRGB(0.32, 0.24, 0.14).multiplyScalar(lamp));
  },

  // ---- board snow: distance-based, so the amount of snow thrown doesn't depend on frame rate ----
  // Emitters walk the path the board took this frame and drop particles every few centimetres,
  // interpolating position so fast riding leaves a continuous sheet rather than clumps.
  // a cloud puff: starts small and dense, swells as it rises, arcs over and settles back on the snow
  puff(x, y, z, vx, vy, vz, size, life, alpha, grav = 0.5, drag = 1.4) {
    return this.spawn(x, y, z, vx, vy, vz, life, size * 0.3, size, alpha, 1, 1, 1, grav, drag, 0, 1, 2);
  },
  // a chunk of snow on a ballistic arc
  chunk(x, y, z, vx, vy, vz, size, life) {
    return this.spawn(x, y, z, vx, vy, vz, life, size, size * 0.8, 1, 1, 1, 1, 1, 0.5, 1, 1, 1);
  },
  boardSpray(dt, pl) {
    const E = this.em;
    const on = pl.ground && !pl.crashed && !pl.grind;
    if (!on || pl.speed < 0.8) { E.last = null; return; }
    const p = pl.pos;
    if (!E.last) { E.last = p.clone(); return; }
    const step = E.last.distanceTo(p);
    if (step > 6) { E.last.copy(p); return; }
    const sp = pl.speed, S = pl.surf;
    const R = Math.random;
    const powder = S.powder * (1 - S.groom) * (1 - S.road);
    const fresh = (1 - S.groom * 0.7) * (1 - S.road);
    const carve = Math.abs(pl.edge) * sstep(3, 12, sp);
    const skid = clamp(pl.skid * 1.5 + pl.brake * 0.8, 0, 1.3) * sstep(0.8, 4, sp);
    const press = Math.abs(pl.press || 0);
    // board frame
    const f = _v.set(Math.sin(pl.yaw), 0, Math.cos(pl.yaw));
    const vh = Math.hypot(pl.vel.x, pl.vel.z) || 1, dx = pl.vel.x / vh, dz = pl.vel.z / vh;
    const lx = -dz, lz = dx; // left of travel
    const turnSide = pl.edge > 0 ? -1 : 1; // spray leaves the outside of the turn
    const ox = lx * turnSide, oz = lz * turnSide;
    const tail = -pl.ride; // the tail is behind along the board
    const fx = f.x, fz = f.z;
    const wind = Sky.weather ? Sky.weather.wind : 0;
    // every emitter is "so many per metre" plus "so many per second": steady whatever the frame rate,
    // spread along the path the board took this frame so fast riding leaves a continuous sheet
    const emit = (perM, perS, fn, key) => {
      E[key] = (E[key] || 0) + perM * step + perS * dt;
      let n = Math.floor(E[key]); E[key] -= n;
      while (n-- > 0) { const k = R(); fn(E.last.x + (p.x - E.last.x) * k, E.last.y + (p.y - E.last.y) * k, E.last.z + (p.z - E.last.z) * k); }
    };
    // carve: a sheet of snow off the tail half of the edge, thrown out of the turn and up, then falling back
    emit(carve * (22 + sp * 3) * (0.5 + fresh), carve * 45, (x, y, z) => {
      const along = tail * (0.1 + R() * 0.75);
      const ex = x + fx * along + ox * 0.15, ez = z + fz * along + oz * 0.15;
      const out = (1.8 + R() * 2.8) * (0.6 + carve) + sp * 0.14;
      const up = 1.6 + R() * (2.2 + powder * 2.5) + sp * 0.06;
      if (R() < 0.85) this.puff(ex, y + 0.08, ez, pl.vel.x * 0.5 + ox * out, up, pl.vel.z * 0.5 + oz * out, 1.3 + powder * 1.8 + R() * 0.8, 1.1 + R() * 0.9, 0.24, 0.55, 1.5);
      else this.chunk(ex, y + 0.06, ez, pl.vel.x * 0.55 + ox * out * 1.2, up * 1.2, pl.vel.z * 0.55 + oz * out * 1.2, 0.05 + R() * 0.08, 0.7 + R() * 0.5);
    }, 'edgeA');
    // braking: the whole downhill edge scrapes up a wall of snow and throws it ahead and up in a big
    // arc; it hangs for a moment, then rains back down and settles
    emit(skid * (70 + sp * 6) * (0.7 + fresh * 0.6), skid * 180, (x, y, z) => {
      const along = (R() - 0.5) * 1.5;
      const ex = x + fx * along, ez = z + fz * along;
      const fan = (R() - 0.5) * 1.4;
      const fwd = sp * (0.45 + R() * 0.45) + 1.5;
      const side = (1.2 + sp * 0.12) * (0.5 + R());
      const vx = dx * fwd + (lx * fan + ox * 0.7) * side, vz = dz * fwd + (lz * fan + oz * 0.7) * side;
      const up = 2.4 + R() * 3.2 + sp * 0.12 + powder * 2;
      if (R() < 0.86) this.puff(ex, y + 0.1, ez, vx, up, vz, 1.5 + powder * 2 + sp * 0.06 + R() * 1.2, 1.3 + R() * 1.2, 0.26, 0.6, 1.25);
      else this.chunk(ex, y + 0.08, ez, vx * 1.1, up * 1.15, vz * 1.1, 0.06 + R() * 0.1, 0.9 + R() * 0.6);
    }, 'skidA');
    // powder: a rooster tail behind the board that climbs, hangs in the air and drifts down with the wind
    emit(powder * (18 + sp * 2.2), powder * 24 * sstep(1, 5, sp), (x, y, z) => {
      const along = tail * (0.4 + R() * 0.5);
      const sd = (R() - 0.5) * 0.7;
      const ex = x + fx * along + lx * sd, ez = z + fz * along + lz * sd;
      if (R() < 0.9) this.puff(ex, y + 0.2, ez, pl.vel.x * 0.22 + lx * sd * 2.5 + wind * 0.8, 2.6 + R() * 2.6 + sp * 0.11, pl.vel.z * 0.22 + lz * sd * 2.5, 2.4 + R() * 2 + sp * 0.07, 1.9 + R() * 1.6, 0.2, 0.32, 1.0);
      else this.chunk(ex, y + 0.15, ez, pl.vel.x * 0.35 + lx * sd * 3, 3 + R() * 3.5 + sp * 0.1, pl.vel.z * 0.35 + lz * sd * 3, 0.06 + R() * 0.07, 0.9 + R() * 0.5);
    }, 'plumeA');
    // bow wave: deep snow piles up and splits around the nose
    if (powder > 0.3 && sp > 5) emit(powder * 4, 0, (x, y, z) => {
      const nose = pl.ride * 0.75, sd = R() < 0.5 ? -1 : 1;
      this.puff(x + fx * nose, y + 0.25, z + fz * nose, pl.vel.x * 0.75 + lx * sd * (1.2 + R() * 1.8), 1 + R() * 1.4, pl.vel.z * 0.75 + lz * sd * (1.2 + R() * 1.8), 0.9 + R() * 0.5, 0.6 + R() * 0.4, 0.45, 0.4, 2);
    }, 'bowA');
    // fine mist kicked up at speed, even on hardpack
    emit(sstep(8, 24, sp) * (0.8 + fresh) * 1.6, 0, (x, y, z) => {
      const along = tail * (0.3 + R() * 0.6);
      this.spawn(x + fx * along, y + 0.08, z + fz * along, pl.vel.x * 0.35 + (R() - 0.5), 0.4 + R() * 0.7, pl.vel.z * 0.35 + (R() - 0.5),
        0.8 + R() * 0.6, 0.2, 1.0 + R() * 0.6, 0.2 + powder * 0.12, 1, 1, 1, 0.05, 2.0, 0, 1, 2);
    }, 'mistA');
    // butters: the free end of the board sweeps a smear of snow around the pivot
    if (press > 0.1) emit(press * (pl.butterSpin ? 18 : 5), press * (pl.butterSpin ? 40 : 6), (x, y, z) => {
      const end = -pl.press * pl.ride * 0.75;
      const ex = x + fx * end, ez = z + fz * end;
      const sw = pl.butterSpin || 0;
      const vx = -fz * sw * 2.5 * Math.sign(end) + pl.vel.x * 0.4, vz = fx * sw * 2.5 * Math.sign(end) + pl.vel.z * 0.4;
      if (R() < 0.6) this.puff(ex, y + 0.08, ez, vx + (R() - 0.5), 1.2 + R() * 1.6, vz + (R() - 0.5), 0.7 + R() * 0.5, 0.7 + R() * 0.5, 0.5, 0.55, 1.6);
      else this.chunk(ex, y + 0.06, ez, vx, 1.4 + R() * 1.6, vz, 0.05 + R() * 0.06, 0.6 + R() * 0.4);
    }, 'butterA');
    E.last.copy(p);
  },
  // a crash: every limb that ploughs through the snow throws up a cloud
  bodySpray(joints, dt) {
    const prev = this._bodyPrev || (this._bodyPrev = joints.map((j) => j.clone()));
    const R = Math.random;
    for (let i = 0; i < joints.length; i++) {
      const p = joints[i], q = prev[i];
      const vx = (p.x - q.x) / Math.max(dt, 1e-3), vy = (p.y - q.y) / Math.max(dt, 1e-3), vz = (p.z - q.z) / Math.max(dt, 1e-3);
      q.copy(p);
      const sp = Math.hypot(vx, vz);
      if (sp < 1.5 || p.y - World.groundHeight(p.x, p.z) > 0.35) continue;
      let n = sp * dt * 5;
      n = Math.floor(n) + (R() < n % 1 ? 1 : 0);
      while (n-- > 0) {
        if (R() < 0.7) this.puff(p.x, p.y, p.z, vx * 0.45 + (R() - 0.5) * 2, 1.5 + R() * 2.5 + sp * 0.12 + Math.max(0, -vy) * 0.3, vz * 0.45 + (R() - 0.5) * 2, 0.9 + R() * 0.9 + sp * 0.05, 1.1 + R() * 0.9, 0.55, 0.5, 1.3);
        else this.chunk(p.x, p.y, p.z, vx * 0.5 + (R() - 0.5) * 3, 2 + R() * 3, vz * 0.5 + (R() - 0.5) * 3, 0.06 + R() * 0.09, 0.8 + R() * 0.5);
      }
    }
  },
  resetBody() { this._bodyPrev = null; },
  // rails: flecks of snow scraped off the top of the rail
  railSpray(dt, pl) {
    const G2 = pl.grind;
    if (!G2) return;
    const rate = (8 + G2.v * 3) * dt, n = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const s = Math.random() < 0.5 ? -1 : 1;
      this.spawn(pl.pos.x, pl.pos.y + 0.05, pl.pos.z, pl.vel.x * 0.6 - G2.g.dz * s * (0.6 + Math.random()), 0.6 + Math.random() * 1.2, pl.vel.z * 0.6 + G2.g.dx * s * (0.6 + Math.random()),
        0.35 + Math.random() * 0.3, 0.035, 0.03, 0.9, 1, 1, 1, 1, 1, 1, 1, 0);
    }
  },

  // ---- trail: ribbon of compacted snow ----------------------------------------------
  TN: 3600,
  initTrail(scene) {
    const TN = this.TN;
    this.tPos = new Float32Array(TN * 2 * 3); this.tData = new Float32Array(TN * 2 * 4); this.tHead = 0; this.tCount = 0;
    const idx = new Uint32Array((TN - 1) * 6);
    for (let i = 0; i < TN - 1; i++) { const a = i * 2; idx.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], i * 6); }
    const g = new THREE.BufferGeometry();
    this.tPA = new THREE.BufferAttribute(this.tPos, 3).setUsage(THREE.DynamicDrawUsage);
    this.tDA = new THREE.BufferAttribute(this.tData, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.tPA); g.setAttribute('aTrail', this.tDA);
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(TN * 2 * 3).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, side: THREE.DoubleSide });
    patchStandard(mat, {
      key: 'trail',
      vertexHead: 'attribute vec4 aTrail; varying vec4 vTrail;',
      vertexTail: 'vTrail = aTrail;',
      fragHead: 'varying vec4 vTrail;',
      fragColor: /* glsl */`
        float across = vTrail.x;           // -1..1 across the cut
        float depth = vTrail.z;            // 0 groomed .. 1 deep powder
        float groove = 1.0 - across * across;
        // compacted snow is smoother and a little grey-blue; the side walls catch light
        vec3 packed = mix(vec3(0.84, 0.88, 0.95), vec3(0.72, 0.8, 0.92), depth);
        float wall = smoothstep(0.55, 0.95, abs(across));
        diffuseColor.rgb = mix(packed, vec3(0.97, 0.98, 1.0), wall * (0.4 + depth * 0.5));
        diffuseColor.a = vTrail.y * (0.32 + 0.4 * depth) * (1.0 - smoothstep(0.6, 1.0, abs(across)));`,
    });
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      prev(sh, r);
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float ac = vTrail.x;
          // slope of the groove cross-section: carved down the middle, raised lips
          float sl = -ac * 0.45 * (0.3 + vTrail.z) + sign(ac) * smoothstep(0.7, 1.0, abs(ac)) * 0.5;
          vec3 side = vec3(cos(vTrail.w), 0.0, sin(vTrail.w));
          normal = normalize(normal + (viewMatrix * vec4(side * sl, 0.0)).xyz);
        }`);
    };
    this.trail = new THREE.Mesh(g, mat);
    this.trail.frustumCulled = false; this.trail.receiveShadow = true;
    this.trail.renderOrder = 1;
    scene.add(this.trail);
    this.lastTrail = null;
  },
  pushTrailPair(x, y, z, lx, lz, hw, strength, depth) {
    const ang = Math.atan2(lz, lx);
    const i = this.tHead;
    const o = i * 6, d = i * 8;
    // each edge sits on the ground under it, so the ribbon follows banks and gully walls
    const off = y - World.groundHeight(x, z);
    this.tPos[o] = x + lx * hw; this.tPos[o + 1] = World.groundHeight(x + lx * hw, z + lz * hw) + off; this.tPos[o + 2] = z + lz * hw;
    this.tPos[o + 3] = x - lx * hw; this.tPos[o + 4] = World.groundHeight(x - lx * hw, z - lz * hw) + off; this.tPos[o + 5] = z - lz * hw;
    this.tData.set([1, strength, depth, ang, -1, strength, depth, ang], d);
    this.tHead = (this.tHead + 1) % this.TN;
    // the quad that would join the newest and oldest pair across the ring wrap is hidden
    const w = this.tHead * 8;
    this.tData[w + 1] = 0; this.tData[w + 5] = 0;
    this.tPA.needsUpdate = true; this.tDA.needsUpdate = true;
  },
  trailUpdate(pl) {
    const on = pl.ground && !pl.crashed && pl.speed > 0.8 && !pl.grind;
    const p = pl.pos;
    if (!on) { if (this.lastTrail) { this.breakTrail(); } return; }
    const S = pl.surf;
    const depth = clamp(S.powder * (1 - S.groom) * 1.2, 0, 1) * (1 - S.road);
    const f = new V3(Math.sin(pl.yaw), 0, Math.cos(pl.yaw));
    const vdir = pl.vel.clone().setY(0).normalize();
    const lat = new V3(-vdir.z, 0, vdir.x);
    // a carve leaves a thin line; a skid smears the whole board length across the snow
    const across = Math.abs(f.x * lat.x + f.z * lat.z);
    const hw = 0.13 + across * 0.7 + depth * 0.2;
    if (this.lastTrail && p.distanceTo(this.lastTrail) < 0.35) return;
    const y = World.groundHeight(p.x, p.z) + 0.02 - depth * 0.04;
    if (!this.lastTrail) this.pushTrailPair(p.x, y, p.z, lat.x, lat.z, hw, 0, depth);
    this.pushTrailPair(p.x, y, p.z, lat.x, lat.z, hw, 1 - S.road * 0.8, depth);
    this.lastTrail = p.clone();
  },
  breakTrail() {
    const l = this.lastTrail;
    if (l) { const i = (this.tHead - 1 + this.TN) % this.TN; this.tData[i * 8 + 1] = 0; this.tData[i * 8 + 5] = 0; this.tDA.needsUpdate = true; }
    this.lastTrail = null;
  },

  // ---- tokens: snowflakes that spin and bob like dropped items ------------------------
  initTokens(scene) {
    const s = new THREE.Shape();
    const arms = 6, R = 0.55, r = 0.14, w = 0.09;
    for (let k = 0; k < arms; k++) {
      const a = (k / arms) * TAU, b = a + TAU / arms / 2;
      const p0 = [Math.cos(a - 0.17) * r, Math.sin(a - 0.17) * r];
      const tipL = [Math.cos(a) * R - Math.sin(a) * w, Math.sin(a) * R + Math.cos(a) * w];
      const tipR = [Math.cos(a) * R + Math.sin(a) * w, Math.sin(a) * R - Math.cos(a) * w];
      if (k === 0) s.moveTo(p0[0], p0[1]); else s.lineTo(p0[0], p0[1]);
      s.lineTo(tipR[0], tipR[1]); s.lineTo(Math.cos(a) * (R + 0.07), Math.sin(a) * (R + 0.07)); s.lineTo(tipL[0], tipL[1]);
      s.lineTo(Math.cos(b) * r * 1.3, Math.sin(b) * r * 1.3);
    }
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
    geo.center();
    const mat = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, emissive: 0x3aa0ff, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.3, flatShading: true });
    this.tokenMesh = new THREE.InstancedMesh(geo, mat, Scatter.tokens.length);
    this.tokenMesh.frustumCulled = false;
    scene.add(this.tokenMesh);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16), new THREE.MeshBasicMaterial({ color: 0x0a1420, transparent: true, opacity: 0.25, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    this.tokenShadow = new THREE.InstancedMesh(sh.geometry, sh.material, Scatter.tokens.length);
    this.tokenShadow.frustumCulled = false;
    scene.add(this.tokenShadow);
    this.collected = new Set();
  },
  updateTokens(t, pl, onPick) {
    const m = this.tokenMesh, sm = this.tokenShadow;
    Scatter.tokens.forEach((tk, i) => {
      if (this.collected.has(tk.id)) { _m4.makeScale(0, 0, 0); m.setMatrixAt(i, _m4); sm.setMatrixAt(i, _m4); return; }
      const bob = Math.sin(t * 2.2 + i) * 0.18;
      _m4.compose(_v.set(tk.x, tk.y + bob, tk.z), _q.setFromEuler(_e.set(0, t * 1.8 + i, 0)), _s.set(1, 1, 1));
      m.setMatrixAt(i, _m4);
      const gy = World.height(tk.x, tk.z) + 0.04;
      const k = 1 - clamp((tk.y + bob - gy) / 8, 0, 0.7);
      _m4.compose(_v.set(tk.x, gy, tk.z), _q.setFromEuler(_e.set(-Math.PI / 2, 0, 0)), _s.set(k, k, k));
      sm.setMatrixAt(i, _m4);
      if (pl && !pl.crashed) {
        const dx = pl.pos.x - tk.x, dy = pl.pos.y + 0.8 - tk.y - bob, dz = pl.pos.z - tk.z;
        if (dx * dx + dy * dy + dz * dz < 2.4 * 2.4) {
          this.collected.add(tk.id);
          this.burst(tk.x, tk.y, tk.z, 30, 3, { r: 0.75, g: 0.9, b: 1.4, s0: 0.1, s1: 0.04, life: 0.9, grav: 0.1, up: 0.4, hard: 1, lit: 0 });
          onPick(tk);
        }
      }
    });
    m.instanceMatrix.needsUpdate = true; sm.instanceMatrix.needsUpdate = true;
  },

  // ---- ambient emitters near the camera ---------------------------------------------------
  emitAmbient(dt, cam, night, wind) {
    const cx = cam.position.x, cz = cam.position.z;
    for (const s of Structures.smokeVents) {
      if (Math.abs(s.x - cx) > 450 || Math.abs(s.z - cz) > 450) continue;
      if (Math.random() < s.rate * dt * 6) this.spawn(s.x, s.y, s.z, wind * 1.5 + (Math.random() - 0.5) * 0.3, 0.9 + Math.random() * 0.4, (Math.random() - 0.5) * 0.3, 5 + Math.random() * 3, 0.8, 4.5, 0.18, 0.72, 0.72, 0.75, -0.01, 0.15);
    }
    // snowmaking runs at night and in the early morning
    const guns = night > 0.4 || Sky.time < 8.5;
    if (guns) for (const g of Structures.gunNozzles) {
      if (Math.abs(g.x - cx) > 350 || Math.abs(g.z - cz) > 350) continue;
      for (let k = 0; k < 3; k++) {
        if (Math.random() > dt * 40) continue;
        const sp = 9 + Math.random() * 5;
        this.spawn(g.x, g.y, g.z, g.ax * sp + (Math.random() - 0.5) * 2, 3 + Math.random() * 2, g.az * sp + (Math.random() - 0.5) * 2, 2.5 + Math.random() * 1.5, 0.3, 3.2, 0.32, 1, 1, 1, 0.12, 0.5);
      }
    }
  },
};
