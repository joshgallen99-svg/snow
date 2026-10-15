// ============================================================================
//  fx — particles (spray, powder, smoke, mist, sparkle), the compacted snow
//  trail, hovering snowflake tokens, lamp glows
// ============================================================================
const FX = {
  N: 7000, cursor: 0, alive: 0,
  init(scene) {
    const N = this.N;
    this.p = new Float32Array(N * 3); this.v = new Float32Array(N * 3);
    this.life = new Float32Array(N); this.max = new Float32Array(N); this.size0 = new Float32Array(N); this.size1 = new Float32Array(N);
    this.drag = new Float32Array(N); this.grav = new Float32Array(N); this.alpha0 = new Float32Array(N);
    this.col = new Float32Array(N * 3);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('aSize', this.aSize); g.setAttribute('aAlpha', this.aAlpha); g.setAttribute('aCol', this.aCol);
    this.light = { value: new THREE.Color(1, 1, 1) };
    const m = new THREE.ShaderMaterial({
      uniforms: Object.assign({ uLight: this.light, uPx: { value: 1 } }, THREE.UniformsUtils.clone(THREE.UniformsLib.fog)), transparent: true, depthWrite: false, fog: true,
      vertexShader: /* glsl */`
        attribute float aSize; attribute float aAlpha; attribute vec3 aCol; uniform float uPx;
        varying float vA; varying vec3 vC;
        #include <fog_pars_vertex>
        void main(){ vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = aSize * uPx * 420.0 / max(0.5, -mvPosition.z); vA = aAlpha; vC = aCol;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uLight; varying float vA; varying vec3 vC;
        #include <fog_pars_fragment>
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d) * vA;
          gl_FragColor = vec4(vC * uLight, a);
          #include <fog_fragment>
        }`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.mat = m;
    this.initTrail(scene);
    this.initTokens(scene);
    this.initGlows(scene);
  },
  spawn(x, y, z, vx, vy, vz, life, s0, s1, a0, r = 1, g = 1, b = 1, grav = 1, drag = 1.5) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.N;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = life; this.max[i] = life; this.size0[i] = s0; this.size1[i] = s1; this.alpha0[i] = a0;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.grav[i] = grav; this.drag[i] = drag;
  },
  burst(x, y, z, n, speed, opts = {}) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU, u = Math.random();
      this.spawn(x, y + 0.1, z, Math.cos(a) * speed * u + (opts.vx || 0), (0.4 + Math.random()) * speed * (opts.up ?? 0.7) + (opts.vy || 0), Math.sin(a) * speed * u + (opts.vz || 0),
        (opts.life || 1.2) * (0.6 + Math.random() * 0.6), opts.s0 || 0.25, opts.s1 || 0.9, opts.a || 0.85, opts.r ?? 1, opts.g ?? 1, opts.b ?? 1, opts.grav ?? 0.6, opts.drag ?? 2.2);
    }
  },
  update(dt) {
    const N = this.N, p = this.p, v = this.v, P = this.aPos.array, S = this.aSize.array, A = this.aAlpha.array, C = this.aCol.array;
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) { if (A[i] !== 0) A[i] = 0; continue; }
      this.life[i] -= dt;
      const t = 1 - this.life[i] / this.max[i];
      const dr = Math.exp(-this.drag[i] * dt);
      v[i * 3] *= dr; v[i * 3 + 2] *= dr; v[i * 3 + 1] = v[i * 3 + 1] * dr - 9.81 * this.grav[i] * dt;
      p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
      P[i * 3] = p[i * 3]; P[i * 3 + 1] = p[i * 3 + 1]; P[i * 3 + 2] = p[i * 3 + 2];
      S[i] = lerp(this.size0[i], this.size1[i], Math.sqrt(t));
      A[i] = this.alpha0[i] * (1 - t) * (1 - t) * Math.min(1, t * 12 + 0.2);
      C[i * 3] = this.col[i * 3]; C[i * 3 + 1] = this.col[i * 3 + 1]; C[i * 3 + 2] = this.col[i * 3 + 2];
    }
    this.aPos.needsUpdate = true; this.aSize.needsUpdate = true; this.aAlpha.needsUpdate = true; this.aCol.needsUpdate = true;
  },

  // ---- board spray from the edge ------------------------------------------------
  boardSpray(dt, pl) {
    if (!pl.ground || pl.crashed || pl.grind) return;
    const sp = pl.speed;
    if (sp < 2) return;
    const S = pl.surf;
    const carve = Math.abs(pl.edge) * sstep(4, 14, sp);
    const skid = pl.skid + pl.brake * 0.8;
    const powder = S.powder * (1 - S.groom);
    const rate = (carve * 90 + skid * 260 + powder * sp * 6) * dt;
    const n = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
    if (!n) return;
    const f = new V3(Math.sin(pl.yaw), 0, Math.cos(pl.yaw));
    const left = new V3().crossVectors(pl.n, pl.vel).normalize();
    const outward = left.clone().multiplyScalar(pl.edge > 0 ? -1 : 1); // spray leaves the outside of the turn
    for (let k = 0; k < n; k++) {
      const along = (Math.random() - 0.5) * 1.3;
      const x = pl.pos.x + f.x * along, z = pl.pos.z + f.z * along;
      const out = 2 + sp * 0.18 * (skid + carve) + Math.random() * 2;
      this.spawn(x, pl.pos.y + 0.08, z,
        pl.vel.x * 0.35 + outward.x * out + (Math.random() - 0.5) * 1.5, 1.2 + Math.random() * (2 + powder * 3), pl.vel.z * 0.35 + outward.z * out + (Math.random() - 0.5) * 1.5,
        0.5 + Math.random() * 0.6 + powder * 0.6, 0.08 + powder * 0.1, 0.35 + powder * 0.9, 0.9, 1, 1, 1, 0.55, 2.4);
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
        vec3 packed = mix(vec3(0.80, 0.85, 0.93), vec3(0.68, 0.76, 0.88), depth);
        float wall = smoothstep(0.55, 0.95, abs(across));
        diffuseColor.rgb = mix(packed, vec3(0.96, 0.98, 1.0), wall * (0.4 + depth * 0.5));
        diffuseColor.a = vTrail.y * (0.55 + 0.35 * depth) * (1.0 - smoothstep(0.92, 1.0, abs(across)));`,
    });
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      prev(sh, r);
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float ac = vTrail.x;
          // slope of the groove cross-section: carved down the middle, raised lips
          float sl = -ac * 0.9 * (0.35 + vTrail.z) + sign(ac) * smoothstep(0.7, 1.0, abs(ac)) * 0.8;
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
    this.tPos[o] = x + lx * hw; this.tPos[o + 1] = y; this.tPos[o + 2] = z + lz * hw;
    this.tPos[o + 3] = x - lx * hw; this.tPos[o + 4] = y; this.tPos[o + 5] = z - lz * hw;
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
          this.burst(tk.x, tk.y, tk.z, 26, 3, { r: 0.75, g: 0.9, b: 1.4, s0: 0.12, s1: 0.04, life: 0.9, grav: 0.1, up: 0.4 });
          onPick(tk);
        }
      }
    });
    m.instanceMatrix.needsUpdate = true; sm.instanceMatrix.needsUpdate = true;
  },

  // ---- glows for lamps and windows at night -------------------------------------------
  initGlows(scene) {
    const heads = Structures.lampHeads;
    const pos = new Float32Array(heads.length * 3);
    heads.forEach((h, i) => pos.set([h.gx, h.gy, h.gz], i * 3));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.glowU = { uOn: { value: 0 }, uPx: { value: 1 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.glowU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'uniform float uOn, uPx; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uOn * uPx * 2600.0 / max(1.0, -mv.z); }',
      fragmentShader: 'uniform float uOn; void main(){ float d = length(gl_PointCoord - 0.5); float a = pow(max(0.0, 1.0 - d * 2.0), 2.4); gl_FragColor = vec4(vec3(1.0, 0.82, 0.55) * a * uOn * 0.9, 1.0); }',
    });
    this.glows = new THREE.Points(g, m);
    this.glows.frustumCulled = false;
    scene.add(this.glows);
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
