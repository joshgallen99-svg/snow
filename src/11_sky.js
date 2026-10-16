// ============================================================================
//  sky — dome shader, sun/moon/stars/clouds, day cycle palettes, weather
// ============================================================================
const PALETTE = [
  // e = sin(sun elevation)
  // night: moonlit snow stays readable, blue and bright enough to ride by
  { e: -0.35, zen: 0x0a1328, hor: 0x1f2c50, sun: 0x9fb4e6, si: 0.32, hs: 0x5468a0, hg: 0x283350, hi: 1.0,  fog: 0x1c2846, exp: 1.65 },
  { e: -0.1,  zen: 0x13204a, hor: 0x3a4c80, sun: 0xa8bae6, si: 0.3,  hs: 0x5a6ca2, hg: 0x2a3250, hi: 0.95, fog: 0x34426c, exp: 1.45 },
  { e: 0.0,   zen: 0x27407a, hor: 0xf08a6a, sun: 0xff9a6b, si: 0.9,  hs: 0x7a86b8, hg: 0x40384a, hi: 0.7,  fog: 0xc99086, exp: 1.05 },
  { e: 0.1,   zen: 0x3a68b8, hor: 0xffbf8e, sun: 0xffb070, si: 2.3,  hs: 0x98aed8, hg: 0x6a6270, hi: 0.78, fog: 0xe8c2a4, exp: 0.95 },
  // golden hour: low warm sun, cool blue shadows
  { e: 0.2,   zen: 0x3b70c8, hor: 0xf4d6bc, sun: 0xffd09a, si: 2.6,  hs: 0xa6bce4, hg: 0x7c7888, hi: 0.84, fog: 0xdccabc, exp: 0.84 },
  { e: 0.32,  zen: 0x3d78d6, hor: 0xc9dcf2, sun: 0xfff0dc, si: 2.85, hs: 0xb8d0f0, hg: 0x8892a8, hi: 0.9,  fog: 0xc5d6ea, exp: 0.8 },
  { e: 0.9,   zen: 0x2f6fd8, hor: 0xbcd6f4, sun: 0xfff8ef, si: 3.2,  hs: 0xc2d8f6, hg: 0x929eb4, hi: 0.95, fog: 0xbfd3ec, exp: 0.77 },
];
const OVERCAST = { zen: 0x9aa6b4, hor: 0xc9d0d8, fog: 0xc4cbd3, hs: 0xc2cad4, hg: 0x9aa2ae };
const OVERCAST_NIGHT = { zen: 0x161c28, hor: 0x2a3242, fog: 0x2a3242, hs: 0x4c5668, hg: 0x262c38 };

const Sky = {
  time: 9.2, dayLength: 24 * 60, cycle: true,
  weather: { overcast: 0, snow: 0, wind: 0.2, target: { overcast: 0, snow: 0, wind: 0.2 }, state: 'clear', next: 200 },
  night: 0, sunE: 0.5, sunDir: new V3(), moonDir: new V3(),
  dome: null, sun: null, hemi: null, snowPts: null, exposure: 0.9, fogColor: new THREE.Color(),

  init(scene) {
    this.scene = scene;
    const geo = new THREE.SphereGeometry(9000, 48, 24);
    this.uniforms = {
      uSunDir: { value: new V3() }, uMoonDir: { value: new V3() }, uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() },
      uSunC: { value: new THREE.Color() }, uNight: { value: 0 }, uOver: { value: 0 }, uTime: U.uTime, uFog: { value: new THREE.Color() },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
      fragmentShader: /* glsl */`
        uniform vec3 uSunDir, uMoonDir, uZen, uHor, uSunC, uFog; uniform float uNight, uOver, uTime;
        varying vec3 vDir;
        float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y); }
        float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*vn(p); p*=2.03; a*=0.5; } return s; }
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHor, uZen, pow(clamp(h, 0.0, 1.0), 0.5));
          col = mix(col, uFog, 1.0 - smoothstep(-0.02, 0.12, h));
          float sd = max(dot(d, uSunDir), 0.0);
          float clear = 1.0 - uOver * 0.85;
          col += uSunC * (pow(sd, 6.0) * 0.18 + pow(sd, 90.0) * 0.6) * clear;
          col += uSunC * smoothstep(0.99955, 0.9998, sd) * 12.0 * (1.0 - uOver) * step(-0.02, uSunDir.y);
          float md = dot(d, uMoonDir);
          col += vec3(0.85, 0.9, 1.0) * smoothstep(0.9993, 0.99955, md) * 1.6 * uNight * (1.0 - uOver);
          col += vec3(0.25, 0.3, 0.45) * pow(max(md, 0.0), 40.0) * 0.25 * uNight * clear;
          // stars
          vec3 sp = d * 420.0; vec3 cell = floor(sp);
          float r = h3(cell);
          float tw = 0.6 + 0.4 * sin(uTime * (2.0 + r * 5.0) + r * 40.0);
          float star = smoothstep(0.9988, 1.0, r) * smoothstep(0.02, 0.25, h) * tw;
          col += vec3(0.85, 0.9, 1.0) * star * uNight * (1.0 - uOver) * 1.8;
          // clouds on a plane above the world
          if (h > 0.0) {
            vec2 uv = d.xz / (h + 0.12) * 1.4 + vec2(uTime * 0.004, uTime * 0.0015);
            float c = fbm(uv);
            float cov = mix(0.62, 0.25, uOver);
            float m = smoothstep(cov, cov + 0.25, c) * smoothstep(0.0, 0.18, h);
            vec3 cc = mix(vec3(1.0), uSunC * 0.9 + 0.25, 0.35 + 0.4 * (1.0 - smoothstep(0.0, 0.4, uSunDir.y)));
            cc *= mix(1.0, 0.12, uNight);
            cc = mix(cc, uHor * 1.05, uOver * 0.5);
            col = mix(col, cc, m * 0.9);
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.dome = new THREE.Mesh(geo, mat);
    this.dome.frustumCulled = false; this.dome.renderOrder = -10;
    scene.add(this.dome);

    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 900;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun); scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd4f6, 0x8a96aa, 0.9);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xc5d6ea, 0.0003);
    this.initSnow(scene);
    this.distantRange(scene);
  },

  // mountains outside the play area, so the views go on forever: a ring of ridged terrain
  // with a big lone volcano across the valley, shaded by height and slope
  distantRange(scene) {
    const R0 = 6150, R1 = 17000, NA = 1024, NR = 72;
    const noise = makeSimplex(77), rnd = mulberry32(8);
    const peaks = [
      // the symmetric volcano across the valley, like the one opposite the real resort
      { a: 2.3, d: 10200, h: 1850, r: 3600, cone: 1 },
      { a: 1.15, d: 9000, h: 1100, r: 2200, cone: 0.4 },
      { a: 3.55, d: 9600, h: 1250, r: 2600, cone: 0.3 },
      { a: 4.3, d: 10400, h: 1450, r: 3000, cone: 0.5 },
      { a: 5.15, d: 9400, h: 1150, r: 2400, cone: 0.3 },
      { a: 0.25, d: 9900, h: 1250, r: 2800, cone: 0.35 },
    ];
    for (let i = 0; i < 18; i++) peaks.push({ a: rnd() * TAU, d: 8200 + rnd() * 5000, h: 450 + rnd() * 700, r: 1100 + rnd() * 1400, cone: rnd() * 0.3 });
    const ridged = (x, z) => {
      let f = 1 / 2600, a = 1, sum = 0, w = 1;
      for (let o = 0; o < 6; o++) {
        let n = 1 - Math.abs(noise(x * f, z * f));
        n *= n; sum += n * a * w; w = clamp(n * 1.6, 0, 1);
        f *= 2.05; a *= 0.48;
      }
      return sum;
    };
    const height = (x, z, r) => {
      let h = ridged(x, z) * 520 * sstep(R0 + 300, R0 + 2200, r);
      for (const p of peaks) {
        const px = Math.cos(p.a) * p.d, pz = Math.sin(p.a) * p.d;
        const d = Math.hypot(x - px, z - pz) / p.r;
        if (d > 1.6) continue;
        // a volcano is a smooth concave cone with gullies down its flanks; others are rougher massifs
        const cone = Math.max(0, 1 - d) ** 1.6;
        const ang = Math.atan2(z - pz, x - px);
        const gully = 1 - 0.08 * p.cone * Math.abs(Math.sin(ang * 13 + p.a * 7)) * sstep(0.1, 0.6, d);
        const rough = 1 + (ridged(x * 1.7, z * 1.7) - 0.9) * 0.35 * (1 - p.cone);
        h += p.h * cone * gully * rough * (1 - Math.max(0, 0.06 - d) * 6 * p.cone);
      }
      return h * (1 - sstep(R1 * 0.8, R1, r) * 0.7) + 110;
    };
    const pos = new Float32Array((NA + 1) * (NR + 1) * 3);
    for (let j = 0; j <= NR; j++) {
      const t = j / NR, r = R0 + (R1 - R0) * t * t * (0.6 + 0.4 * t) / 1.0;
      for (let i = 0; i <= NA; i++) {
        const a = (i / NA) * TAU, x = Math.cos(a) * r, z = Math.sin(a) * r;
        const k = (j * (NA + 1) + i) * 3;
        pos[k] = x; pos[k + 1] = height(x, z, r); pos[k + 2] = z;
      }
    }
    const idx = new Uint32Array(NA * NR * 6);
    let q = 0;
    for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) {
      const a = j * (NA + 1) + i, b = a + 1, c = a + NA + 1, d = c + 1;
      idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    patchStandard(mat, {
      key: 'range',
      fragColor: /* glsl */`
        {
          vec3 n = normalize(vWNrm);
          float slope = 1.0 - n.y;
          float big = dn(vWPos * 0.0011), fine = dn(vWPos * 0.006);
          float tree = 520.0 + big * 260.0;
          // snowy forest reads as a blue-grey speckle from this far away
          vec3 forest = mix(vec3(0.33, 0.39, 0.42), vec3(0.62, 0.68, 0.74), fine * 0.6 + slope * 0.3);
          vec3 rock = mix(vec3(0.36, 0.38, 0.42), vec3(0.5, 0.5, 0.53), fine);
          vec3 snow = vec3(0.93, 0.95, 0.98);
          float below = 1.0 - smoothstep(tree - 60.0, tree + 60.0, vWPos.y);
          vec3 c = mix(snow, forest, below * (0.55 + 0.45 * smoothstep(0.08, 0.3, slope)));
          // steep faces and ridge crests shed their snow
          float bare = smoothstep(0.48 + big * 0.12, 0.62 + big * 0.12, slope) * (1.0 - below * 0.5);
          c = mix(c, rock, bare);
          diffuseColor.rgb = c;
        }`,
    });
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    m.renderOrder = -5;
    scene.add(m);
    this.range = m;
  },

  initSnow(scene) {
    const N = 9000, pos = new Float32Array(N * 3), rnd = mulberry32(5), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = rnd() * 140; pos[i * 3 + 1] = rnd() * 70; pos[i * 3 + 2] = rnd() * 140; seed[i] = rnd(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.snowU = { uTime: U.uTime, uCam: { value: new V3() }, uAmt: { value: 0 }, uWind: { value: new THREE.Vector2(0.6, 0.2) }, uCol: { value: new THREE.Color(1, 1, 1) }, uPx: { value: 1 } };
    const m = new THREE.ShaderMaterial({
      uniforms: Object.assign(this.snowU, THREE.UniformsUtils.clone(THREE.UniformsLib.fog)), transparent: true, depthWrite: false, fog: true,
      vertexShader: /* glsl */`
        attribute float aSeed; uniform float uTime, uAmt, uPx; uniform vec3 uCam; uniform vec2 uWind;
        varying float vA;
        #include <fog_pars_vertex>
        void main(){
          vec3 box = vec3(140.0, 70.0, 140.0);
          vec3 p = position;
          float fall = 1.4 + aSeed * 1.2;
          p.y -= uTime * fall;
          p.x += uTime * uWind.x * (3.0 + aSeed * 2.0) + sin(uTime * (0.6 + aSeed) + aSeed * 30.0) * 1.2;
          p.z += uTime * uWind.y * (3.0 + aSeed * 2.0) + cos(uTime * (0.5 + aSeed) + aSeed * 20.0) * 1.2;
          p = mod(p - uCam + box * 0.5, box) + uCam - box * 0.5;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          float vis = step(aSeed, uAmt);
          gl_PointSize = vis * uPx * (0.06 + aSeed * 0.05) * 300.0 / -mvPosition.z;
          vA = vis * smoothstep(1.0, 4.0, -mvPosition.z);
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uCol; varying float vA;
        #include <fog_pars_fragment>
        void main(){
          vec2 c = gl_PointCoord - 0.5; float d = length(c);
          float a = smoothstep(0.5, 0.15, d) * vA * 0.9;
          gl_FragColor = vec4(uCol, a);
          #include <fog_fragment>
        }`,
    });
    this.snowPts = new THREE.Points(g, m);
    this.snowPts.frustumCulled = false;
    scene.add(this.snowPts);
  },

  // a small captured sky for reflections on goggles, helmets, boards and steel
  makeEnv(renderer) {
    const sc = new THREE.Scene();
    const g = new THREE.SphereGeometry(50, 48, 24);
    const pos = g.attributes.position, col = [];
    const zen = new THREE.Color(0x3f7fd8), hor = new THREE.Color(0xd8e6f6), gnd = new THREE.Color(0xeef2f7), shade = new THREE.Color(0x9aa8bc);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 50;
      const c = y > 0 ? hor.clone().lerp(zen, Math.pow(y, 0.6)) : gnd.clone().lerp(shade, Math.min(1, -y * 1.4));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    sc.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const sun = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 7.6, 7) }));
    sun.position.set(20, 30, 25); sc.add(sun);
    // distant ridge line so reflections have a horizon
    const ridge = new THREE.Mesh(new THREE.CylinderGeometry(48, 48, 6, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x2f3c4a, side: THREE.BackSide }));
    ridge.position.y = 1; sc.add(ridge);
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromScene(sc, 0.03);
    pm.dispose();
    return rt.texture;
  },
  setWeather(state, snap = false) {
    const T = this.weather.target;
    this.weather.state = state;
    if (state === 'clear') Object.assign(T, { overcast: 0.05, snow: 0, wind: 0.15 });
    else if (state === 'cloudy') Object.assign(T, { overcast: 0.6, snow: 0.05, wind: 0.3 });
    else if (state === 'snow') Object.assign(T, { overcast: 0.82, snow: 0.45, wind: 0.35 });
    else if (state === 'storm') Object.assign(T, { overcast: 1, snow: 1, wind: 0.9 });
    if (snap) Object.assign(this.weather, { overcast: T.overcast, snow: T.snow, wind: T.wind });
  },
  weatherTick(dt) {
    const W = this.weather;
    W.next -= dt;
    if (W.next < 0 && this.autoWeather) {
      const order = { clear: ['clear', 'cloudy'], cloudy: ['clear', 'snow', 'cloudy'], snow: ['cloudy', 'storm', 'snow'], storm: ['snow'] };
      const opts = order[W.state];
      this.setWeather(opts[Math.floor(Math.random() * opts.length)]);
      W.next = 150 + Math.random() * 220;
    }
    for (const k of ['overcast', 'snow', 'wind']) W[k] = damp(W[k], W.target[k], 0.08, dt);
  },

  update(dt, cam, focus, mode) {
    if (this.cycle) this.time = (this.time + (dt * 24) / this.dayLength) % 24;
    this.weatherTick(dt);
    const T = this.time;
    const ph = ((T - 6.3) / 24) * TAU; // 0 at sunrise, pi/2 at noon
    const elev = 58 * DEG * Math.sin(ph);
    this.sunDir.set(Math.cos(ph) * Math.cos(elev), Math.sin(elev), Math.sin(ph) * Math.cos(elev)).normalize();
    this.moonDir.set(-this.sunDir.x * 0.8 + 0.2, -this.sunDir.y * 0.85 + 0.1, -this.sunDir.z * 0.8 - 0.3).normalize();
    const e = this.sunDir.y;
    this.sunE = e;
    // palette lookup
    let i = 0; while (i < PALETTE.length - 2 && PALETTE[i + 1].e < e) i++;
    const a = PALETTE[i], b = PALETTE[i + 1], t = sstep(a.e, b.e, e);
    const C = (k) => new THREE.Color(a[k]).lerp(new THREE.Color(b[k]), t);
    const ov = this.weather.overcast;
    this.night = 1 - sstep(-0.12, 0.05, e);
    const dayLight = sstep(-0.12, 0.35, e);
    const mixO = (c, k) => c.lerp(new THREE.Color(OVERCAST[k]).lerp(new THREE.Color(OVERCAST_NIGHT[k]), this.night).multiplyScalar(lerp(0.5, 1, dayLight) * (this.night > 0.5 ? 1 : 1)), ov * 0.9);
    const zen = mixO(C('zen'), 'zen'), hor = mixO(C('hor'), 'hor'), fog = mixO(C('fog'), 'fog');
    const sunC = C('sun');
    const si = lerp(a.si, b.si, t) * (1 - ov * 0.75);
    const u = this.uniforms;
    u.uSunDir.value.copy(this.sunDir); u.uMoonDir.value.copy(this.moonDir);
    u.uZen.value.copy(zen); u.uHor.value.copy(hor); u.uSunC.value.copy(sunC); u.uNight.value = this.night; u.uOver.value = ov; u.uFog.value.copy(fog);
    // the directional light follows the sun by day and the moon by night
    const useMoon = e < -0.04;
    const ldir = useMoon ? this.moonDir : this.sunDir;
    this.sun.color.copy(useMoon ? new THREE.Color(0x9db0e0) : sunC);
    this.sun.intensity = useMoon ? 0.9 * (1 - ov * 0.6) * sstep(0.0, 0.25, this.moonDir.y) : si * sstep(-0.04, 0.04, e);
    this.sun.position.copy(focus).addScaledVector(ldir, 420);
    this.sun.target.position.copy(focus);
    // snap the shadow camera to texels so shadows don't swim
    this.hemi.color.copy(mixO(C('hs'), 'hs'));
    this.hemi.groundColor.copy(mixO(C('hg'), 'hg'));
    this.hemi.intensity = lerp(a.hi, b.hi, t) * (1 + ov * 0.25);
    this.exposure = lerp(a.exp, b.exp, t) * (1 + ov * 0.12);
    this.fogColor.copy(fog);
    const fogD = mode === 'map' ? 0.00008 + this.weather.snow * 0.00012 : 0.00011 + this.weather.snow * 0.0042 + ov * 0.00035;
    Sky.scene.fog.color.copy(fog);
    Sky.scene.fog.density = fogD;
    U.uSunDir.value.copy(ldir); U.uSunColor.value.copy(this.sun.color).multiplyScalar(this.sun.intensity * 0.4);
    U.uNight.value = sstep(0.25, 0.8, this.night + ov * 0.25);
    U.uLampOn.value = sstep(0.35, 0.75, this.night + ov * 0.3);
    this.dome.position.copy(cam.position);
    // snowfall around the camera
    this.snowU.uCam.value.copy(cam.position);
    this.snowU.uAmt.value = this.weather.snow * (mode === 'map' ? 0.0 : 1);
    this.snowU.uWind.value.set(this.weather.wind * 1.0, this.weather.wind * 0.35);
    this.snowU.uCol.value.copy(this.hemi.color).multiplyScalar(this.hemi.intensity).add(new THREE.Color(this.sun.color).multiplyScalar(this.sun.intensity * 0.15));
  },
  label() {
    const h = Math.floor(this.time), m = Math.floor((this.time - h) * 60);
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  },
};
