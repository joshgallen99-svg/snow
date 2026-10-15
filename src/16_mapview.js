// ============================================================================
//  map view — a live camera over the whole resort with trail-map overlays:
//  thin run lines (dotted when ungroomed), lift lines, boundary, night areas,
//  cloud cover over locked terrain, labels and lift hover picking
// ============================================================================
const MapView = {
  group: null, target: new V3(-60, 0, -40), dist: 3200, yaw: -0.3, pitch: 0.9,
  hover: -1, selected: -1, labels: [], lines: [], fog: null, dragging: false,
  pose: { pos: new V3(), look: new V3(), fov: 38, roll: 0 },
  wantTarget: null,

  lineMaterial(color, widthPx, opts = {}) {
    return new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uWidth: { value: widthPx }, uPx: this.pxU, uDash: { value: opts.dash || 0 }, uAlpha: { value: opts.alpha ?? 1 }, uLift: { value: opts.lift || 0 } },
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        attribute vec3 aDir; attribute float aSide; attribute float aDist;
        uniform float uWidth, uPx, uLift; varying float vDist; varying float vCam;
        void main(){
          vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
          float cd = distance(cameraPosition, wp);
          vec3 lat = normalize(cross(vec3(0.0, 1.0, 0.0), aDir));
          wp += lat * aSide * uWidth * 0.5 * cd * uPx;
          wp += normalize(cameraPosition - wp) * min(cd * 0.012, 40.0) + vec3(0.0, uLift, 0.0);
          vDist = aDist; vCam = cd;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform float uDash, uAlpha, uPx; varying float vDist; varying float vCam;
        void main(){
          if (uDash > 0.0) { float period = uDash * vCam * uPx; if (fract(vDist / period) > 0.5) discard; }
          gl_FragColor = vec4(uColor, uAlpha);
        }`,
    });
  },
  ribbon(pts, yOff = 2.5) {
    const pos = [], dir = [], side = [], dist = [], idx = [];
    let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      if (i) acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const y = pts[i][2] != null ? pts[i][2] : World.height(pts[i][0], pts[i][1]) + yOff;
      for (const s of [-1, 1]) { pos.push(pts[i][0], y, pts[i][1]); dir.push((b[0] - a[0]) / l, 0, (b[1] - a[1]) / l); side.push(s); dist.push(acc); }
      if (i < pts.length - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 3));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
    g.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  },

  init(scene) {
    this.group = new THREE.Group(); this.group.visible = false; this.group.name = 'mapOverlay';
    scene.add(this.group);
    this.pxU = { value: 0.001 };
    // night-lit areas (yellow bands, like the trail map)
    for (const rd of World.runData) {
      const lamps = rd.run.features.filter((f) => f.k === 'lamps');
      for (const f of lamps) {
        const pts = rd.path.pts.filter((p, i) => rd.path.s[i] >= f.t0 * rd.path.len && rd.path.s[i] <= f.t1 * rd.path.len).filter((p, i) => i % 2 === 0);
        if (pts.length < 2) continue;
        const m = new THREE.Mesh(this.ribbon(pts, 2), this.lineMaterial(0xffd84a, 11, { alpha: 0.38 }));
        m.renderOrder = 10; m.userData.run = rd.run.index; m.userData.night = true;
        this.group.add(m); this.lines.push(m);
      }
    }
    // runs: white casing + colored core
    for (const rd of World.runData) {
      const pts = rd.path.pts.filter((p, i) => i % 2 === 0 || i === rd.path.n - 1);
      const g = this.ribbon(pts);
      const col = DIFF[rd.run.diff].color;
      const casing = new THREE.Mesh(g, this.lineMaterial(0xffffff, 4.6, { alpha: 0.9 }));
      const core = new THREE.Mesh(g, this.lineMaterial(col, 2.4, { dash: rd.run.groomed ? 0 : 7 }));
      casing.renderOrder = 11; core.renderOrder = 12;
      casing.userData = { run: rd.run.index, casing: true }; core.userData = { run: rd.run.index, core: true, color: new THREE.Color(col) };
      this.group.add(casing, core); this.lines.push(casing, core);
    }
    // lifts: thin dark lines with station dots, fading out up close where the real lift shows
    for (const lift of Structures.lifts) {
      const pts = [];
      for (let k = 0; k <= 30; k++) { const t = k / 30; pts.push([lerp(lift.def.a[0], lift.def.b[0], t), lerp(lift.def.a[1], lift.def.b[1], t), lift.cableY(t)]); }
      const m = new THREE.Mesh(this.ribbon(pts), this.lineMaterial(0x15181d, 1.8, { alpha: 0.85 }));
      m.renderOrder = 13; m.userData = { lift: lift.index };
      this.group.add(m); this.lines.push(m);
    }
    // boundary: red dotted
    const bpts = resamplePath(BOUNDARY, 6);
    const bm = new THREE.Mesh(this.ribbon(bpts, 1.5), this.lineMaterial(0xd8332b, 2.2, { dash: 5 }));
    bm.renderOrder = 13; this.group.add(bm);
    this.initFog(scene);
    this.initLabels();
    this.initControls();
  },

  // ---- cloud cover over locked terrain --------------------------------------------
  initFog(scene) {
    const rnd = mulberry32(404);
    const puffs = [];
    for (const lift of Structures.lifts) {
      const pts = [];
      for (let t = 0; t <= 1; t += 0.12) pts.push([lerp(lift.def.a[0], lift.def.b[0], t), lerp(lift.def.a[1], lift.def.b[1], t)]);
      for (const rd of World.runData) if (rd.run.lift === lift.def.id) for (let i = 0; i < rd.path.n; i += 18) pts.push(rd.path.pts[i]);
      for (const p of pts) {
        for (let k = 0; k < 2; k++) {
          const x = p[0] + (rnd() - 0.5) * 120, z = p[1] + (rnd() - 0.5) * 120;
          puffs.push([x, World.height(x, z) + 70 + rnd() * 70, z, 150 + rnd() * 140, lift.index, rnd()]);
        }
      }
    }
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
    const off = new Float32Array(puffs.length * 4), meta = new Float32Array(puffs.length * 2);
    puffs.forEach((p, i) => { off.set([p[0], p[1], p[2], p[3]], i * 4); meta.set([p[4], p[5]], i * 2); });
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
    g.setAttribute('aMeta', new THREE.InstancedBufferAttribute(meta, 2));
    g.instanceCount = puffs.length;
    this.fogU = { uCover: { value: new Array(LIFTS.length).fill(1) }, uTime: U.uTime, uLight: { value: new THREE.Color(1, 1, 1) } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.fogU, transparent: true, depthWrite: false,
      vertexShader: /* glsl */`
        attribute vec4 aOff; attribute vec2 aMeta; uniform float uCover[${LIFTS.length}]; uniform float uTime;
        varying vec2 vUv; varying float vA; varying float vSeed;
        void main(){
          float cover = 0.0;
          for (int i = 0; i < ${LIFTS.length}; i++) if (abs(float(i) - aMeta.x) < 0.5) cover = uCover[i];
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          float s = aOff.w * (0.6 + 0.4 * cover);
          vec3 c = aOff.xyz + vec3(sin(uTime * 0.05 + aMeta.y * 6.0) * 20.0, (1.0 - cover) * 120.0, cos(uTime * 0.04 + aMeta.y * 5.0) * 20.0);
          vec3 wp = c + right * position.x * s + up * position.y * s;
          vUv = uv; vA = cover; vSeed = aMeta.y;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uLight; uniform float uTime; varying vec2 vUv; varying float vA; varying float vSeed;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main(){
          vec2 p = vUv - 0.5; float r = length(p) * 2.0;
          float f = n(vUv * 4.0 + vSeed * 10.0 + uTime * 0.02) * 0.6 + n(vUv * 9.0 - vSeed * 7.0) * 0.4;
          float a = smoothstep(1.0, 0.2, r + (f - 0.5) * 0.7) * vA * 0.92;
          if (a < 0.01) discard;
          vec3 col = uLight * mix(0.82, 1.05, f) * mix(1.0, 0.9, r);
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.fog = new THREE.Mesh(g, m);
    this.fog.frustumCulled = false; this.fog.renderOrder = 20; this.fog.visible = false;
    scene.add(this.fog);
  },

  // ---- labels ---------------------------------------------------------------------------
  initLabels() {
    const root = document.getElementById('mapLabels');
    root.innerHTML = '';
    for (const lift of Structures.lifts) {
      const el = document.createElement('button');
      el.className = 'lift-tag';
      el.innerHTML = `<span class="lt-bar" style="background:#${new THREE.Color(lift.def.color).getHexString()}"></span><span class="lt-name">${lift.def.name}</span><span class="lt-lock" aria-hidden="true"></span>`;
      el.addEventListener('pointerenter', () => { this.labelHover = lift.index; });
      el.addEventListener('pointerleave', () => { if (this.labelHover === lift.index) this.labelHover = -1; });
      el.addEventListener('click', (e) => { e.stopPropagation(); this.select(lift.index); });
      root.appendChild(el);
      this.labels.push({ el, kind: 'lift', lift, pos: new V3(lift.def.b[0], lift.stationB.y + 18, lift.def.b[1]) });
    }
    for (const rd of World.runData) {
      const el = document.createElement('div');
      el.className = 'run-tag diff-' + rd.run.diff;
      el.innerHTML = `<i class="d-ico"></i><span>${rd.run.name}</span>`;
      root.appendChild(el);
      const mid = rd.path.pts[Math.floor(rd.path.n * 0.45)];
      this.labels.push({ el, kind: 'run', run: rd.run, pos: new V3(mid[0], World.height(mid[0], mid[1]) + 6, mid[1]) });
    }
    this.labelHover = -1;
  },

  // ---- controls -----------------------------------------------------------------------------
  initControls() {
    const el = document.getElementById('game');
    el.addEventListener('pointerdown', (e) => {
      if (Game.state !== 'map') return;
      this.dragging = { x: e.clientX, y: e.clientY, moved: 0, rot: e.button === 2 || e.shiftKey };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (Game.state !== 'map' || !this.dragging) return;
      const d = this.dragging, dx = e.clientX - d.x, dy = e.clientY - d.y;
      d.x = e.clientX; d.y = e.clientY; d.moved += Math.abs(dx) + Math.abs(dy);
      if (d.rot) { this.yaw -= dx * 0.005; this.pitchBias = clamp((this.pitchBias || 0) + dy * 0.003, -0.35, 0.3); }
      else {
        const k = this.dist * 0.0011;
        const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
        this.target.x -= (dx * c + dy * s) * k; this.target.z -= (-dx * s + dy * c) * k;
        this.clampTarget();
      }
    });
    el.addEventListener('pointerup', (e) => {
      if (Game.state !== 'map' || !this.dragging) return;
      const d = this.dragging; this.dragging = false;
      if (d.moved < 6 && e.button === 0) {
        if (this.hover >= 0) this.select(this.hover); else this.select(-1);
      }
    });
    el.addEventListener('contextmenu', (e) => { if (Game.state === 'map') e.preventDefault(); });
  },
  clampTarget() {
    this.target.x = clamp(this.target.x, -1300, 1300);
    this.target.z = clamp(this.target.z, -1300, 1400);
  },
  zoom(f) { this.dist = clamp(this.dist * f, 160, 4200); },
  reset() { this.target.set(-60, 0, -40); this.dist = 3200; this.yaw = -0.3; this.pitchBias = 0; this.wantTarget = null; },
  focusLift(i) {
    const L = LIFTS[i];
    this.wantTarget = new V3((L.a[0] + L.b[0]) / 2, 0, (L.a[1] + L.b[1]) / 2);
    this.wantDist = clamp(Math.hypot(L.a[0] - L.b[0], L.a[1] - L.b[1]) * 1.25 + 300, 500, 2400);
  },
  select(i) {
    this.selected = i;
    if (i >= 0) { this.focusLift(i); Sound.ui(); }
    UI.showLiftPanel(i);
  },

  update(dt, cam, viewport) {
    // keyboard pan / rotate / zoom
    const k = this.dist * 0.6 * dt;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const fx = (Input.is('KeyD', 'ArrowRight') ? 1 : 0) - (Input.is('KeyA', 'ArrowLeft') ? 1 : 0);
    const fz = (Input.is('KeyS', 'ArrowDown') ? 1 : 0) - (Input.is('KeyW', 'ArrowUp') ? 1 : 0);
    if (fx || fz) { this.target.x += (fx * c + fz * s) * k; this.target.z += (-fx * s + fz * c) * k; this.clampTarget(); this.wantTarget = null; }
    if (Input.is('KeyQ')) this.yaw += dt * 0.8;
    if (Input.is('KeyE')) this.yaw -= dt * 0.8;
    if (Input.is('Equal', 'NumpadAdd')) this.zoom(1 - dt * 1.4);
    if (Input.is('Minus', 'NumpadSubtract')) this.zoom(1 + dt * 1.4);
    if (Input.mouse.wheel) { this.zoom(Math.exp(Input.mouse.wheel * 0.0012)); this.wantTarget = null; }
    if (this.wantTarget) {
      this.target.lerp(this.wantTarget, 1 - Math.exp(-3 * dt));
      this.dist = damp(this.dist, this.wantDist, 3, dt);
      if (this.target.distanceTo(this.wantTarget) < 2) this.wantTarget = null;
    }
    this.target.y = World.height(this.target.x, this.target.z);
    const pitch = clamp(lerp(0.95, 0.44, sstep(350, 3000, this.dist)) + (this.pitchBias || 0), 0.22, 1.35);
    const P = this.pose;
    P.pos.set(this.target.x + Math.sin(this.yaw) * Math.cos(pitch) * this.dist, this.target.y + Math.sin(pitch) * this.dist, this.target.z + Math.cos(this.yaw) * Math.cos(pitch) * this.dist);
    P.look.copy(this.target);
    P.fov = 38;
    // screen-space width factor for the overlay lines
    this.pxU.value = (2 * Math.tan((cam.fov * DEG) / 2)) / viewport.h;
    // fade the drawn lift lines near the real geometry
    const close = 1 - sstep(250, 900, this.dist);
    for (const m of this.lines) {
      const u = m.material.uniforms;
      if (m.userData.lift != null) { u.uAlpha.value = 0.85 * (1 - close * 0.75) * (this.hover === m.userData.lift || this.selected === m.userData.lift ? 0.3 : 1); continue; }
      if (m.userData.run == null) continue;
      const run = RUNS[m.userData.run];
      const unlocked = Game.liftUnlocked(LIFT_BY_ID[run.lift].index);
      const focus = this.hover >= 0 ? this.hover : this.selected;
      const related = focus < 0 || LIFT_BY_ID[run.lift].index === focus;
      m.visible = unlocked || m.userData.casing;
      if (m.userData.night) { u.uAlpha.value = unlocked ? 0.38 * Sky.night + 0.12 : 0; continue; }
      if (m.userData.core) {
        u.uColor.value.copy(unlocked ? m.userData.color : new THREE.Color(0x9aa3ad));
        u.uWidth.value = related && focus >= 0 ? 3.6 : 2.4;
        u.uAlpha.value = related ? 1 : 0.45;
      } else {
        u.uWidth.value = related && focus >= 0 ? 6.4 : 4.6;
        u.uAlpha.value = unlocked ? (related ? 0.95 : 0.4) : 0;
      }
    }
    // cloud cover lifts away from unlocked lifts
    for (let i = 0; i < LIFTS.length; i++) {
      const want = Game.liftUnlocked(i) ? 0 : 1;
      this.fogU.uCover.value[i] = damp(this.fogU.uCover.value[i], want, 0.9, Math.max(dt, 1 / 60));
    }
    this.fogU.uLight.value.copy(Sky.hemi.color).multiplyScalar(Sky.hemi.intensity * 0.9).add(new THREE.Color(Sky.sun.color).multiplyScalar(Math.min(1, Sky.sun.intensity * 0.25)));
    this.updatePick(cam, viewport);
    this.updateLabels(cam, viewport);
  },

  // hover: nearest lift line in screen space
  updatePick(cam, vp) {
    const mx = Input.mouse.x, my = Input.mouse.y;
    let best = -1, bd = 14;
    if (this.labelHover >= 0) best = this.labelHover;
    else if (Input.mouse.inside && !this.dragging) {
      const v = new V3();
      const proj = (x, y, z) => { v.set(x, y, z).project(cam); return v.z < 1 ? [(v.x * 0.5 + 0.5) * vp.w, (-v.y * 0.5 + 0.5) * vp.h] : null; };
      for (const lift of Structures.lifts) {
        let prev = null;
        for (let k = 0; k <= 12; k++) {
          const t = k / 12;
          const p = proj(lerp(lift.def.a[0], lift.def.b[0], t), lift.cableY(t), lerp(lift.def.a[1], lift.def.b[1], t));
          if (p && prev) {
            const d = segDist(mx, my, prev[0], prev[1], p[0], p[1], [0, 0, 0])[0];
            if (d < bd) { bd = d; best = lift.index; }
          }
          prev = p;
        }
      }
    }
    if (best !== this.hover) { this.hover = best; if (best >= 0) Sound.ui(); UI.mapHover(best); }
  },
  updateLabels(cam, vp) {
    const v = new V3();
    const placed = [];
    // lifts first, then runs; a run label that would overlap something already placed is hidden
    for (const L of this.labels) {
      v.copy(L.pos).project(cam);
      let show = v.z < 1 && v.x > -1.1 && v.x < 1.1 && v.y > -1.1 && v.y < 1.1;
      if (L.kind === 'run') show = show && Game.liftUnlocked(LIFT_BY_ID[L.run.lift].index);
      const x = (v.x * 0.5 + 0.5) * vp.w, y = (-v.y * 0.5 + 0.5) * vp.h;
      if (show) {
        if (!L.w) { L.el.hidden = false; L.w = L.el.offsetWidth || 120; L.h = L.el.offsetHeight || 22; }
        const box = [x - L.w / 2 - 3, y - L.h / 2 - 2, x + L.w / 2 + 3, y + L.h / 2 + 2];
        const hit = placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
        const focus = this.hover >= 0 ? this.hover : this.selected;
        const mine = L.kind === 'run' && focus >= 0 && LIFT_BY_ID[L.run.lift].index === focus;
        if (hit && L.kind === 'run' && !mine) show = false;
        else placed.push(box);
      }
      L.el.hidden = !show;
      if (!show) continue;
      L.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      if (L.kind === 'lift') {
        const i = L.lift.index;
        L.el.classList.toggle('locked', !Game.liftUnlocked(i));
        L.el.classList.toggle('hot', this.hover === i || this.selected === i);
      } else {
        const focus = this.hover >= 0 ? this.hover : this.selected;
        L.el.classList.toggle('dim', focus >= 0 && LIFT_BY_ID[L.run.lift].index !== focus);
      }
    }
  },
  show(on) {
    this.group.visible = on; this.fog.visible = on;
    if (on) {
      // clouds start where they were last seen; lifts opened since then clear in front of you
      this.seen = this.seen || LIFTS.map((_, i) => Game.liftUnlocked(i));
      for (let i = 0; i < LIFTS.length; i++) this.fogU.uCover.value[i] = this.seen[i] ? 0 : 1;
      this.seen = LIFTS.map((_, i) => Game.liftUnlocked(i));
    }
    document.getElementById('mapLabels').hidden = !on;
    if (!on) { this.hover = -1; this.selected = -1; }
  },
};
