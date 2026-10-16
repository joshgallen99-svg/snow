// ============================================================================
//  lights — every light on the mountain: run floodlights, station and park
//  LEDs, village lanterns, festoon strings, door lamps, lift tower lights and
//  snowcat headlights and beacons. Each one can light the snow around it
//  (the nearest few dozen go to the shaders), glow as a sprite from far away,
//  throw a beam that shows up in falling snow, and leave a warm pool on the
//  ground that you can see from the mountain cam.
// ============================================================================
const LIGHT_KINDS = {
  //          colour                 intensity radius glow size
  flood:   { c: [1.0, 0.78, 0.5],   I: 9,   R: 50, glow: 1.0 },  // sodium floodlights along night runs
  led:     { c: [0.82, 0.9, 1.0],   I: 11,  R: 60, glow: 1.1 },  // park towers and lift stations
  lantern: { c: [1.0, 0.6, 0.28],   I: 2.6, R: 18, glow: 0.45 }, // village street lanterns
  door:    { c: [1.0, 0.66, 0.36],  I: 1.8, R: 13, glow: 0.3 },  // over doors and on decks
  bulb:    { c: [1.0, 0.72, 0.42],  I: 1.4, R: 12, glow: 0.12 }, // festoon string (one light per string, many glows)
  tower:   { c: [1.0, 0.55, 0.25],  I: 0.8, R: 10, glow: 0.22 }, // small lights on lift towers
  head:    { c: [0.92, 0.95, 1.0],  I: 7,   R: 34, glow: 0.5 },  // snowcat headlights
  beacon:  { c: [1.0, 0.48, 0.08],  I: 3.5, R: 22, glow: 0.5 },  // snowcat roof beacons
  window:  { c: [1.0, 0.7, 0.4],    I: 1.6, R: 16, glow: 0 },    // light spilling out of big windows
};

const Lights = {
  list: [], glowPts: [], beams: [], pools: [],

  // add a light; o.glow:false for no sprite, o.beam = {dx,dy,dz,len,ang} for a visible cone, o.blink = rate
  add(x, y, z, kind, o = {}) {
    const K = LIGHT_KINDS[kind];
    const L = { x, y, z, kind, c: o.c || K.c, I: (o.I ?? K.I), R: o.R || K.R, blink: o.blink || 0, phase: o.phase ?? Math.random() * TAU, lit: o.lit !== false };
    if (L.lit) this.list.push(L);
    if (o.glow !== false && K.glow > 0) this.glowPts.push({ x, y, z, c: L.c, s: (o.glowS || 1) * K.glow, blink: L.blink, phase: L.phase });
    if (o.beam) this.beams.push(Object.assign({ x, y, z, c: L.c, blink: L.blink, phase: L.phase }, o.beam));
    if (o.pool !== false && L.lit) {
      // where the light lands: straight below, or along the beam
      let px = x, pz = z;
      if (o.beam) { const t = Math.min(o.beam.len * 0.6, (y - World.height(x, z)) / Math.max(0.2, -o.beam.dy)); px += o.beam.dx * t; pz += o.beam.dz * t; }
      this.pools.push({ x: px, z: pz, r: L.R * 0.5, c: L.c, I: L.I, blink: L.blink, phase: L.phase });
    }
    return L;
  },

  init(scene) {
    this.fixtures = new GeoBuilder({ smooth: false });
    this.glass = new GeoBuilder();
    this.cables = [];
    this.placeRunLamps();
    this.placeStations();
    this.placePark();
    this.placeVillage();
    this.placeCats();
    this.group = new THREE.Group(); this.group.name = 'lights';
    scene.add(this.group);
    if (this.fixtures.count) { const m = new THREE.Mesh(this.fixtures.build(), Structures.metalMat); m.castShadow = true; this.group.add(m); }
    if (this.glass.count) this.group.add(new THREE.Mesh(this.glass.build(), Structures.glowMat));
    this.buildCables();
    this.buildGlows();
    this.buildBeams();
    this.buildPools();
  },

  // ---- placement ---------------------------------------------------------------
  placeRunLamps() {
    // the floodlight poles along night runs are built by Structures; light them here
    for (const L of Scatter.lamps) {
      const hy = L.y + 9.6;
      const ry = Math.atan2(L.aimX, L.aimZ);
      for (const sd of [-0.6, 0.6]) {
        const hx = L.x + Math.cos(ry) * sd + L.aimX * 0.3, hz = L.z - Math.sin(ry) * sd + L.aimZ * 0.3;
        const aim = new V3(L.aimX, -0.62, L.aimZ).normalize();
        // one lit light per pole (two heads), two beams and glows
        this.add(hx, hy - 0.15, hz, 'flood', { lit: sd < 0, I: 9, R: 52, pool: sd < 0, beam: { dx: aim.x, dy: aim.y, dz: aim.z, len: 22, ang: 0.42 } });
      }
    }
  },
  placeStations() {
    for (const lift of Structures.lifts) {
      const T = lift.type, d = lift.dir, r = lift.right;
      for (const [st, end] of [[lift.stationA, false], [lift.stationB, true]]) {
        const sgn = end ? 1 : -1;
        // two LED floods on poles at the loading area, aimed at the ramp
        for (const side of [-1, 1]) {
          const off = (T.cabin ? 11 : 7) * side;
          const x = st.x + r.x * off - d.x * sgn * (T.cabin ? 4 : 3), z = st.z + r.z * off - d.z * sgn * (T.cabin ? 4 : 3);
          const y = World.height(x, z), h = T.surface ? 6 : 8;
          this.pole(x, y, z, h);
          const aim = new V3(-r.x * side * 0.6 - d.x * sgn * 0.5, -0.75, -r.z * side * 0.6 - d.z * sgn * 0.5).normalize();
          this.head(x, y + h, z, aim, 0.5);
          this.add(x + aim.x * 0.3, y + h - 0.1, z + aim.z * 0.3, 'led', { I: 7, R: 40, beam: { dx: aim.x, dy: aim.y, dz: aim.z, len: 16, ang: 0.5 } });
        }
        // warm light from the operator hut / station
        this.add(st.x - d.x * sgn * 6 + r.x * 5, st.y + 3, st.z - d.z * sgn * 6 + r.z * 5, 'window', { glow: false });
      }
      // a small amber light on top of each tower, so lift lines trace across the mountain at night
      for (const tw of lift.towers || []) this.add(tw.x, tw.y + 0.6, tw.z, 'tower', { lit: false, pool: false });
    }
  },
  placePark() {
    // tall light towers along the park, each with three heads
    const park = World.runData.find((r) => r.run.diff === 'park');
    if (!park) return;
    const L = park.path.len;
    let side = 1;
    for (let s = 30; s < L - 20; s += 70) {
      const c = World.pathAt(park, s);
      const nx = -c.tz, nz = c.tx, off = park.run.w + 9;
      const x = c.x + nx * off * side, z = c.z + nz * off * side, y = World.height(x, z);
      const h = 15;
      this.pole(x, y, z, h, 0.22);
      World.addCollider(x, z, 0.4, y + h, 'pole', null);
      for (const k of [-1, 0, 1]) {
        const ax = -nx * side + c.tx * k * 0.5, az = -nz * side + c.tz * k * 0.5;
        const aim = new V3(ax, -0.7, az).normalize();
        const hx = x + c.tx * k * 0.8, hz = z + c.tz * k * 0.8;
        this.head(hx, y + h, hz, aim, 0.7);
        this.add(hx + aim.x * 0.4, y + h - 0.2, hz + aim.z * 0.4, 'led', { lit: k === 0, pool: k === 0, I: 8, R: 55, beam: { dx: aim.x, dy: aim.y, dz: aim.z, len: 26, ang: 0.38 } });
      }
      side = -side;
    }
  },
  placeVillage() {
    const rnd = mulberry32(31);
    // lanterns along the village streets and the east base access road
    for (const [ri, gap] of [[1, 20], [2, 24], [3, 26], [4, 30], [0, 34]]) {
      const pts = resamplePath(ROADS[ri].pts, 4);
      let acc = 0, side = 1;
      for (let i = 1; i < pts.length; i++) {
        const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
        const seg = Math.hypot(x1 - x0, z1 - z0); acc += seg;
        if (acc < gap) continue;
        acc = 0;
        const tx = (x1 - x0) / seg, tz = (z1 - z0) / seg;
        const off = ROADS[ri].w + 2.2;
        const x = x1 - tz * off * side, z = z1 + tx * off * side;
        // the long valley road only gets lanterns near the village and the east base
        if (ri === 0 && Math.abs(x + 600) > 450 && Math.abs(x - 850) > 250) continue;
        if (World.attr(World.inRun, x, z) > 30) continue;
        const y = World.height(x, z);
        this.lantern(x, y, z);
        World.addCollider(x, z, 0.2, y + 3.4, 'pole', null);
        side = -side;
      }
    }
    // door lamps on every building, and big warm windows on lodges and huts
    for (const b of Scatter.buildings) {
      const cs = Math.cos(b.rot), sn = Math.sin(b.rot);
      const local = (lx, lz) => ({ x: b.x + lx * cs + lz * sn, z: b.z - lx * sn + lz * cs });
      const front = local(0, -b.d / 2 - 0.35);
      this.add(front.x, b.y + 3.0, front.z, 'door', { I: b.kind === 'lodge' ? 2.6 : 1.8 });
      this.glass.add(G.box(0.35, 0.45, 0.35), { x: front.x, y: b.y + 3.1, z: front.z, ry: b.rot, color: 0xffd9a0 });
      if (b.kind === 'lodge' || b.kind === 'hut') {
        const back = local(b.w * 0.3, b.d / 2 + 0.5);
        this.add(back.x, b.y + 2.5, back.z, 'window', { glow: false });
        this.add(local(-b.w * 0.3, -b.d / 2 - 3).x, b.y + 2.5, local(-b.w * 0.3, -b.d / 2 - 3).z, 'window', { glow: false });
      }
    }
    // festoon strings zig-zagging across the main street and over lodge decks
    const strings = [];
    const main = resamplePath(ROADS[1].pts, 2), cross = resamplePath(ROADS[2].pts, 2);
    const across = (pts, i, w) => {
      const [x0, z0] = pts[Math.max(0, i - 1)], [x1, z1] = pts[Math.min(pts.length - 1, i + 1)];
      const l = Math.hypot(x1 - x0, z1 - z0) || 1, nx = -(z1 - z0) / l, nz = (x1 - x0) / l;
      const [x, z] = pts[i];
      return [[x + nx * w, z + nz * w], [x - nx * w, z - nz * w]];
    };
    for (let i = 4; i < main.length - 4; i += 9) {
      const [a, b] = across(main, i, ROADS[1].w + 2.4), [c] = across(main, i + 9 < main.length ? i + 9 : i, ROADS[1].w + 2.4);
      strings.push([a, b]); if (c) strings.push([b, c]);
    }
    for (let i = 10; i < cross.length - 10; i += 14) { const [a, b] = across(cross, i, ROADS[2].w + 2.2); strings.push([a, b]); }
    for (const b of Scatter.buildings) {
      if (b.kind !== 'lodge') continue;
      const cs = Math.cos(b.rot), sn = Math.sin(b.rot);
      const local = (lx, lz) => [b.x + lx * cs + lz * sn, b.z - lx * sn + lz * cs];
      strings.push([local(-b.w * 0.4, -b.d / 2 - 1), local(b.w * 0.4, -b.d / 2 - 1)]);
      strings.push([local(-b.w * 0.4, -b.d / 2 - 7.5), local(b.w * 0.4, -b.d / 2 - 7.5)]);
    }
    const bulbCols = [[1.0, 0.75, 0.45], [1.0, 0.62, 0.3], [1.0, 0.85, 0.6]];
    for (const [[x0, z0], [x1, z1]] of strings) {
      const y0 = World.height(x0, z0) + 4.6, y1 = World.height(x1, z1) + 4.6;
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 3 || len > 60) continue;
      for (const [x, z, y] of [[x0, z0, y0], [x1, z1, y1]]) this.fixtures.add(G.cyl(0.06, 0.08, 4.8, 5), { x, y: y - 2.4, z, color: 0x3a2c22 });
      const pts = [];
      const n = Math.max(4, Math.round(len / 1.6));
      for (let k = 0; k <= n; k++) {
        const t = k / n, sag = Math.sin(t * Math.PI) * len * 0.07;
        pts.push(new V3(lerp(x0, x1, t), lerp(y0, y1, t) - sag, lerp(z0, z1, t)));
      }
      this.cables.push(pts);
      for (let k = 1; k < n; k++) {
        const p = pts[k];
        this.glowPts.push({ x: p.x, y: p.y - 0.12, z: p.z, c: bulbCols[Math.floor(rnd() * 3)], s: LIGHT_KINDS.bulb.glow, blink: 0, phase: 0 });
      }
      const m = pts[n >> 1];
      this.add(m.x, m.y - 0.3, m.z, 'bulb', { glow: false, R: Math.max(10, len * 0.6) });
    }
  },
  placeCats() {
    for (const cat of Structures.cats || []) {
      const { x, z, y, ry } = cat;
      const fx = Math.sin(ry), fz = Math.cos(ry), rx = Math.cos(ry), rz = -Math.sin(ry);
      for (const s of [-0.9, 0.9]) {
        const hx = x + fx * 2.2 + rx * s, hz = z + fz * 2.2 + rz * s;
        const aim = new V3(fx, -0.18, fz).normalize();
        this.add(hx, y + 2.3, hz, 'head', { lit: s < 0, pool: s < 0, beam: { dx: aim.x, dy: aim.y, dz: aim.z, len: 18, ang: 0.32 } });
      }
      this.add(x + fx * 0.6, y + 3.8, z + fz * 0.6, 'beacon', { blink: 5.5, pool: false });
      this.glass.add(G.cyl(0.16, 0.18, 0.28, 8), { x: x + fx * 0.6, y: y + 3.75, z: z + fz * 0.6, color: 0xff8a1a });
    }
  },

  // ---- fixtures ------------------------------------------------------------------
  pole(x, y, z, h, r = 0.13) {
    this.fixtures.add(G.cyl(r * 0.7, r, h, 6), { x, y: y + h / 2, z, color: 0x41464d });
    this.fixtures.add(G.cyl(0.03, 0.03, 0.01, 3), { x, y: y + h, z, color: 0x41464d });
  },
  head(x, y, z, aim, s) {
    const ry = Math.atan2(aim.x, aim.z), rx = Math.acos(clamp(-aim.y, -1, 1));
    this.fixtures.add(G.box(0.9 * s + 0.2, 0.5 * s + 0.15, 0.35), { x, y, z, ry, rx: Math.PI / 2 - rx + 0.0, order: 'YXZ', color: 0x2c3036, colorFn: snowCap(0.7) });
    this.glass.add(G.box(0.8 * s + 0.15, 0.06, 0.3), { x: x + aim.x * 0.05, y: y - 0.2 * s - 0.05, z: z + aim.z * 0.05, ry, rx: Math.PI / 2 - rx, order: 'YXZ', color: 0xf4f6ff });
  },
  lantern(x, y, z) {
    // a dark iron post with a little glass lantern box and a snow cap
    this.fixtures.add(G.cyl(0.06, 0.09, 3.0, 6), { x, y: y + 1.5, z, color: 0x2a2826 });
    this.fixtures.add(G.box(0.46, 0.08, 0.46), { x, y: y + 3.05, z, color: 0x2a2826 });
    this.glass.add(G.box(0.34, 0.42, 0.34), { x, y: y + 3.3, z, color: 0xffc078 });
    this.fixtures.add(G.cone(0.38, 0.28, 4), { x, y: y + 3.65, z, ry: Math.PI / 4, color: 0x2a2826, colorFn: snowCap(0.4) });
    this.add(x, y + 3.3, z, 'lantern');
  },

  // ---- render pieces ---------------------------------------------------------------
  buildCables() {
    if (!this.cables.length) return;
    const pos = [];
    for (const pts of this.cables) for (let k = 0; k < pts.length - 1; k++) pos.push(pts[k].x, pts[k].y, pts[k].z, pts[k + 1].x, pts[k + 1].y, pts[k + 1].z);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1d1f22, fog: true })));
  },
  // sprites: a soft core and a wide halo; they stay a few pixels wide however far away they are
  buildGlows() {
    const P = this.glowPts, n = P.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), aux = new Float32Array(n * 3);
    P.forEach((p, i) => { pos.set([p.x, p.y, p.z], i * 3); col.set(p.c, i * 3); aux.set([p.s, p.blink, p.phase], i * 3); });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aAux', new THREE.BufferAttribute(aux, 3));
    this.glowU = { uOn: { value: 0 }, uPx: { value: 1 }, uTime: U.uTime, uHaze: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.glowU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute vec3 aCol, aAux; uniform float uOn, uPx, uTime, uHaze; varying vec3 vC; varying float vK;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          float d = -mv.z;
          float blink = aAux.y > 0.0 ? pow(max(0.0, sin(uTime * aAux.y + aAux.z)), 6.0) : 1.0;
          float px = aAux.x * uPx * 2400.0 / max(1.0, d) * (1.0 + uHaze * 1.5);
          // far lights shrink to a bright pin-prick instead of vanishing
          float far = max(px, 3.0 * uPx * sqrt(aAux.x));
          gl_PointSize = far * step(0.01, uOn);
          vK = uOn * blink * clamp(px / far, 0.35, 1.0) * exp(-d * 0.00012 * (1.0 + uHaze * 6.0));
          vC = aCol;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vC; varying float vK;
        void main(){
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float core = exp(-d * d * 22.0), halo = pow(max(0.0, 1.0 - d), 2.2) * 0.35;
          gl_FragColor = vec4(mix(vC, vec3(1.0), core * 0.6) * (core * 1.4 + halo) * vK, 1.0);
        }`,
    });
    this.glows = new THREE.Points(g, m);
    this.glows.frustumCulled = false; this.glows.renderOrder = 3;
    this.group.add(this.glows);
  },
  // light shafts: open cones, brightest along the axis and near the lamp, much stronger in falling snow
  buildBeams() {
    const B = this.beams;
    if (!B.length) return;
    const seg = 14, pos = [], dat = [], col = [], idx = [];
    for (const b of B) {
      const ax = new V3(b.dx, b.dy, b.dz).normalize();
      const u = new V3().crossVectors(ax, Math.abs(ax.y) > 0.9 ? new V3(1, 0, 0) : UP).normalize(), w = new V3().crossVectors(ax, u);
      const base = pos.length / 3, R = Math.tan(b.ang) * b.len;
      pos.push(b.x, b.y, b.z); dat.push(0, 0, b.blink, b.phase); col.push(...b.c);
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * TAU, cx = Math.cos(a), sx = Math.sin(a);
        const p = new V3(b.x, b.y, b.z).addScaledVector(ax, b.len).addScaledVector(u, cx * R).addScaledVector(w, sx * R);
        pos.push(p.x, p.y, p.z); dat.push(1, k / seg, b.blink, b.phase); col.push(...b.c);
      }
      for (let k = 0; k < seg; k++) idx.push(base, base + 1 + k, base + 2 + k);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aDat', new THREE.Float32BufferAttribute(dat, 4));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    this.beamU = { uOn: { value: 0 }, uHaze: { value: 0 }, uTime: U.uTime };
    const m = new THREE.ShaderMaterial({
      uniforms: Object.assign(this.beamU, THREE.UniformsUtils.clone(THREE.UniformsLib.fog)), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true,
      vertexShader: /* glsl */`
        attribute vec4 aDat; attribute vec3 aCol; uniform float uTime; varying float vT; varying vec3 vC; varying vec3 vW; varying float vB;
        #include <fog_pars_vertex>
        void main(){ vT = aDat.x; vC = aCol; vB = aDat.z > 0.0 ? pow(max(0.0, sin(uTime * aDat.z + aDat.w)), 6.0) : 1.0;
          vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
          vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform float uOn, uHaze; varying float vT; varying vec3 vC; varying vec3 vW; varying float vB;
        #include <fog_pars_fragment>
        void main(){
          // softer toward the end of the cone, and faded where it would slice into the camera
          float a = pow(1.0 - vT, 1.6) * smoothstep(0.0, 0.08, vT);
          float near = smoothstep(1.5, 8.0, distance(vW, cameraPosition));
          float k = a * near * uOn * vB * (0.04 + uHaze * 0.2);
          gl_FragColor = vec4(vC * k, 1.0);
          #ifdef USE_FOG
            #ifdef FOG_EXP2
              gl_FragColor.rgb *= exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
            #endif
          #endif
        }`,
    });
    this.beamMesh = new THREE.Mesh(g, m);
    this.beamMesh.frustumCulled = false; this.beamMesh.renderOrder = 4;
    this.group.add(this.beamMesh);
  },
  // pools of light on the ground for lights too far away to be among the shader lights
  buildPools() {
    const P = this.pools, n = P.length;
    const pos = [], dat = [], col = [], idx = [];
    for (const p of P) {
      const nrm = World.normal(p.x, p.z, new V3());
      const u = new V3().crossVectors(nrm, new V3(0, 0, 1)).normalize(), w = new V3().crossVectors(u, nrm);
      const y = World.height(p.x, p.z) + 0.35, base = pos.length / 3;
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        pos.push(p.x + (u.x * a + w.x * b) * p.r, y + (u.y * a + w.y * b) * p.r, p.z + (u.z * a + w.z * b) * p.r);
        dat.push(a, b, p.I, p.blink); col.push(...p.c);
      }
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aDat', new THREE.Float32BufferAttribute(dat, 4));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    this.poolU = { uOn: { value: 0 }, uNear: { value: 160 } };
    const m = new THREE.ShaderMaterial({
      uniforms: Object.assign(this.poolU, THREE.UniformsUtils.clone(THREE.UniformsLib.fog)), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
      vertexShader: /* glsl */`
        attribute vec4 aDat; attribute vec3 aCol; uniform float uNear; varying vec2 vUv; varying vec3 vC; varying float vK;
        #include <fog_pars_vertex>
        void main(){ vUv = aDat.xy; vC = aCol;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          // fade in only beyond the range where the real shader lights take over
          vK = aDat.z * smoothstep(uNear * 0.8, uNear * 1.3, distance(wp.xyz, cameraPosition));
          vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform float uOn; varying vec2 vUv; varying vec3 vC; varying float vK;
        #include <fog_pars_fragment>
        void main(){ float d = length(vUv); float a = pow(max(0.0, 1.0 - d), 2.0);
          gl_FragColor = vec4(vC * a * vK * uOn * 0.07, 1.0);
          #ifdef USE_FOG
            #ifdef FOG_EXP2
              gl_FragColor.rgb *= exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
            #endif
          #endif
        }`,
    });
    this.poolMesh = new THREE.Mesh(g, m);
    this.poolMesh.frustumCulled = false; this.poolMesh.renderOrder = 1;
    this.group.add(this.poolMesh);
  },

  // ---- per frame: pick the lights that matter for the shaders --------------------------
  _sel: [],
  update(focus, cam, on, haze, px, frame) {
    this.glowU.uOn.value = on; this.glowU.uPx.value = px; this.glowU.uHaze.value = haze;
    if (this.beamU) { this.beamU.uOn.value = on; this.beamU.uHaze.value = haze; }
    this.poolU.uOn.value = on;
    const Lu = U.uLamps.value, Cu = U.uLampC.value;
    const t = U.uTime.value;
    if (frame % 8 === 0 || !this._sel.length) {
      // brighter lights win from further away
      const S = this._sel; S.length = 0;
      for (const L of this.list) {
        const d2 = (L.x - focus.x) ** 2 + (L.z - focus.z) ** 2;
        if (d2 > 260 * 260) continue;
        S.push([L, d2 / (L.I * L.R)]);
      }
      S.sort((a, b) => a[1] - b[1]);
      if (S.length > MAX_LAMPS) S.length = MAX_LAMPS;
    }
    for (let i = 0; i < MAX_LAMPS; i++) {
      const s = this._sel[i];
      if (!s) { Lu[i].set(0, -1e5, 0, 0); Cu[i].set(0, 0, 0, 1); continue; }
      const L = s[0];
      const k = L.blink ? Math.pow(Math.max(0, Math.sin(t * L.blink + L.phase)), 6) : 1;
      Lu[i].set(L.x, L.y, L.z, L.I * k);
      Cu[i].set(L.c[0], L.c[1], L.c[2], L.R);
    }
    // the ground pools take over where the shader lights end
    this.poolU.uNear.value = this._sel.length >= MAX_LAMPS ? Math.sqrt(this._sel[MAX_LAMPS - 1][1] * 60) : 260;
  },
};
