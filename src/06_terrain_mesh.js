// ============================================================================
//  terrain mesh — chunked LOD with skirts, snow shader (corduroy, powder,
//  rock exposure, sparkle, forest floor, roads)
// ============================================================================
const TerrainMesh = {
  CH: 128, chunks: [], group: null, material: null, nc: 0,
  LODS: [{ seg: 64, dist: 300 }, { seg: 32, dist: 720 }],
  buildQueue: 0,

  init(scene) {
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    scene.add(this.group);
    this.material = this.makeMaterial();
    this.farMaterial = this.makeMaterial();
    Object.assign(this.farMaterial, { polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 });
    this.nc = Math.round((WORLD.half * 2) / this.CH);
    for (let j = 0; j < this.nc; j++) for (let i = 0; i < this.nc; i++) {
      const x0 = -WORLD.half + i * this.CH, z0 = -WORLD.half + j * this.CH;
      this.chunks.push({ i, j, x0, z0, cx: x0 + this.CH / 2, cz: z0 + this.CH / 2, meshes: [null, null], lod: -1 });
    }
    // one coarse mesh for the whole mountain, sitting a hair below the detailed chunks
    const far = new THREE.Mesh(this.makeGeometry({ x0: -WORLD.half, z0: -WORLD.half }, 384, WORLD.half * 2, false), this.farMaterial);
    far.position.y = -0.8; far.receiveShadow = true; far.frustumCulled = false;
    this.group.add(far); this.far = far;
    this.buildOuter();
  },
  // the land beyond the play area, so views and the mountain cam never see an edge
  buildOuter() {
    const R = 6400, step = 64, n = Math.round((R * 2) / step) + 1, half = WORLD.half;
    const pos = new Float32Array(n * n * 3), nrm = new Float32Array(n * n * 3), data = new Float32Array(n * n * 4), data2 = new Float32Array(n * n * 2);
    const hAt = (x, z) => (Math.abs(x) <= half && Math.abs(z) <= half ? World.height(x, z) : baseHeight(x, z));
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -R + i * step, z = -R + j * step, v = j * n + i;
      const y = hAt(x, z);
      pos.set([x, y, z], v * 3);
      const hx = hAt(x + 16, z) - hAt(x - 16, z), hz = hAt(x, z + 16) - hAt(x, z - 16), l = Math.hypot(hx, 32, hz);
      nrm.set([-hx / l, 32 / l, -hz / l], v * 3);
      const inside = Math.abs(x) <= half && Math.abs(z) <= half;
      const f = inside ? Scatter.forestAt(x, z) : clamp((0.75 * (1 - sstep(520, 640, y))) * sstep(-0.4, 0.2, fbm(noiseA, x / 400 + 4, z / 400, 3)) - (polyDist(RIVER, x, z, _tmp3) < 80 ? 0.6 : 0), 0, 1);
      data.set([0, 0.5, f, 0], v * 4);
    }
    const idx = [];
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const x0 = -R + i * step, z0 = -R + j * step;
      if (x0 >= -half && x0 + step <= half && z0 >= -half && z0 + step <= half) continue; // the world mesh covers this
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('aData', new THREE.BufferAttribute(data, 4));
    g.setAttribute('aData2', new THREE.BufferAttribute(data2, 2));
    g.setIndex(new THREE.Uint32BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.farMaterial);
    m.position.y = -1.2; m.frustumCulled = false;
    this.group.add(m); this.outer = m;
  },

  makeGeometry(c, seg, size = this.CH, withSkirt = true) {
    const W = World, CH = size, step = CH / seg, n = seg + 1;
    const skirt = withSkirt ? 4 * n : 0;
    const vCount = n * n + skirt;
    const pos = new Float32Array(vCount * 3), nrm = new Float32Array(vCount * 3);
    const data = new Float32Array(vCount * 4), data2 = new Float32Array(vCount * 2);
    const N = W.N, H = W.H, half = W.half, res = W.res;
    const gstep = Math.round(step / res);
    const gi0 = Math.round((c.x0 + half) / res), gj0 = Math.round((c.z0 + half) / res);
    const hAt = (gi, gj) => H[clamp(gj, 0, N - 1) * N + clamp(gi, 0, N - 1)];
    const road = Scatter.road;
    const writeVert = (v, gi, gj, yOff) => {
      gi = clamp(gi, 0, N - 1); gj = clamp(gj, 0, N - 1);
      const x = -half + gi * res, z = -half + gj * res, k = gj * N + gi;
      pos[v * 3] = x; pos[v * 3 + 1] = H[k] + yOff; pos[v * 3 + 2] = z;
      const e = Math.max(1, gstep >> 1);
      const hx = hAt(gi + e, gj) - hAt(gi - e, gj), hz = hAt(gi, gj + e) - hAt(gi, gj - e);
      const l = Math.hypot(hx, 2 * e * res, hz);
      nrm[v * 3] = -hx / l; nrm[v * 3 + 1] = (2 * e * res) / l; nrm[v * 3 + 2] = -hz / l;
      data[v * 4] = W.groom[k] / 255; data[v * 4 + 1] = W.powder[k] / 255;
      data[v * 4 + 2] = Scatter.forestAt(x, z); data[v * 4 + 3] = road ? road[k] / 255 : 0;
      data2[v * 2] = (W.dir[k] / 255) * Math.PI; data2[v * 2 + 1] = W.inRun[k] / 255;
    };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) writeVert(j * n + i, gi0 + i * gstep, gj0 + j * gstep, 0);
    // skirts: duplicate the border ring lowered
    const drop = 2 + step * 0.6;
    let v = n * n;
    const ring = [];
    if (withSkirt) {
      for (let i = 0; i < n; i++) ring.push([i, 0]);
      for (let j = 0; j < n; j++) ring.push([n - 1, j]);
      for (let i = n - 1; i >= 0; i--) ring.push([i, n - 1]);
      for (let j = n - 1; j >= 0; j--) ring.push([0, j]);
    }
    const skirtStart = v;
    for (const [i, j] of ring) { writeVert(v++, gi0 + i * gstep, gj0 + j * gstep, -drop); }
    const idx = [];
    for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
      const a = j * n + i, b = a + 1, c2 = a + n, d = c2 + 1;
      // alternate the split so the low-poly facets don't all lean one way
      if ((i + j) & 1) idx.push(a, c2, b, b, c2, d); else idx.push(a, c2, d, a, d, b);
    }
    for (let r = 0; r < ring.length - 1; r++) {
      const [i0, j0] = ring[r], [i1, j1] = ring[r + 1];
      const t0 = j0 * n + i0, t1 = j1 * n + i1, b0 = skirtStart + r, b1 = skirtStart + r + 1;
      idx.push(t0, b0, t1, t1, b0, b1, t0, t1, b0, t1, b1, b0); // both windings; skirts are hidden anyway
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('aData', new THREE.BufferAttribute(data, 4));
    g.setAttribute('aData2', new THREE.BufferAttribute(data2, 2));
    g.setIndex(vCount > 65000 ? new THREE.Uint32BufferAttribute(idx, 1) : idx);
    g.computeBoundingSphere();
    return g;
  },

  ensure(c, lod) {
    if (!c.meshes[lod]) {
      const m = new THREE.Mesh(this.makeGeometry(c, this.LODS[lod].seg), this.material);
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      m.visible = false;
      this.group.add(m);
      c.meshes[lod] = m;
    }
    return c.meshes[lod];
  },

  // detailed chunks near the camera, the single far mesh everywhere else
  update(cam, force = false) {
    let budget = force ? 999 : 3;
    const cx = cam.position.x, cz = cam.position.z, cy = cam.position.y;
    for (const c of this.chunks) {
      const dx = Math.max(Math.abs(cx - c.cx) - this.CH / 2, 0), dz = Math.max(Math.abs(cz - c.cz) - this.CH / 2, 0);
      const dy = Math.max(0, cy - World.height(c.cx, c.cz) - 60);
      const d = Math.hypot(dx, dz, dy);
      const want = d < this.LODS[0].dist ? 0 : d < this.LODS[1].dist ? 1 : -1;
      if (want === c.lod) continue;
      let use = want;
      if (want >= 0 && !c.meshes[want]) {
        if (budget > 0) { this.ensure(c, want); budget--; }
        else use = c.lod >= 0 && c.meshes[c.lod] ? c.lod : (c.meshes[1] ? 1 : -1);
      }
      if (use === c.lod) continue;
      if (c.lod >= 0 && c.meshes[c.lod]) c.meshes[c.lod].visible = false;
      if (use >= 0) this.ensure(c, use).visible = true;
      c.lod = use;
    }
    // free fine meshes we have moved away from
    for (const c of this.chunks) {
      for (let l = 0; l < 2; l++) {
        const m = c.meshes[l];
        if (m && c.lod !== l && Math.hypot(cx - c.cx, cz - c.cz) > this.LODS[l].dist * 2.2) {
          this.group.remove(m); m.geometry.dispose(); c.meshes[l] = null;
        }
      }
    }
  },

  // overlay = the deformable fresh-snow layer near the rider (see 12b_snow.js)
  makeMaterial(overlay = false) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    const uni = { uSunDir: U.uSunDir, uSunColor: U.uSunColor, uMapMode: U.uMapMode, uNight: U.uNight };
    if (overlay) Object.assign(uni, Snow.uniforms);
    const overlayHead = /* glsl */`
      uniform sampler2D uHMap, uSMap, uDMap, uComp;
      uniform vec2 uOrigin; uniform float uSize, uWN, uWHalf, uWRes, uCompRes;
      float hAt(vec2 w) {
        vec2 g = (w + uWHalf) / uWRes; vec2 i = floor(g); vec2 f = g - i;
        ivec2 ii = ivec2(clamp(i, vec2(0.0), vec2(uWN - 2.0)));
        float a = texelFetch(uHMap, ii, 0).r, b = texelFetch(uHMap, ii + ivec2(1, 0), 0).r;
        float c = texelFetch(uHMap, ii + ivec2(0, 1), 0).r, d = texelFetch(uHMap, ii + ivec2(1, 1), 0).r;
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      vec2 wUv(vec2 w) { return ((w + uWHalf) / uWRes + 0.5) / uWN; }
      // fresh snow depth over the ground, pressed down where the compaction map says so
      float snowDepth(vec2 loc, vec2 w, out float comp) {
        vec4 s = texture(uSMap, wUv(w));
        float d = mix(mix(0.30, 0.13, s.r), 0.62, s.g * (1.0 - s.r)) * (1.0 - s.a);
        vec2 l = abs(loc) / (uSize * 0.5);
        d *= 1.0 - smoothstep(0.62, 0.97, max(l.x, l.y));
        vec2 cuv = loc / uSize + 0.5;
        vec2 cg = texture(uComp, cuv).rg;
        // a small blur keeps the groove walls smooth between vertices
        float bp = 1.4 / uCompRes, px = 2.6 / uCompRes;
        float c4 = texture(uComp, cuv + vec2(bp, bp)).r + texture(uComp, cuv + vec2(-bp, bp)).r + texture(uComp, cuv + vec2(bp, -bp)).r + texture(uComp, cuv + vec2(-bp, -bp)).r;
        float cs = (cg.r * 2.0 + c4) / 6.0;
        float nb = max(max(texture(uComp, cuv + vec2(px, 0.0)).r, texture(uComp, cuv - vec2(px, 0.0)).r),
                       max(texture(uComp, cuv + vec2(0.0, px)).r, texture(uComp, cuv - vec2(0.0, px)).r));
        comp = cs;
        d *= 1.0 - cg.g * 0.8; // tree wells
        // in bottomless powder the board leaves a little snow under it; the push-out piles up as a lip
        float floorKeep = smoothstep(0.35, 0.62, d) * 0.12;
        return d * (1.0 - cs * (1.0 - floorKeep) + max(0.0, nb - cs) * 0.5);
      }
      // fresh snow doesn't stick on steep faces: set per vertex from the ground slope
      float gSlopeK = 1.0;
      float snowY(vec2 loc, out float comp) { vec2 w = loc + uOrigin; return hAt(w) + snowDepth(loc, w, comp) * gSlopeK; }
    `;
    patchStandard(mat, {
      key: overlay ? 'terrainSnow' : 'terrain',
      uniforms: uni,
      vertexHead: overlay
        ? 'varying vec4 vData; varying vec2 vData2; varying float vComp; varying vec2 vCuv; varying float vDepth; varying float vGSlope;' + overlayHead
        : 'attribute vec4 aData; attribute vec2 aData2; varying vec4 vData; varying vec2 vData2; varying float vComp; varying vec2 vCuv; varying float vDepth; varying float vGSlope;',
      vertexTail: overlay ? '' : 'vData = aData; vData2 = aData2; vComp = 0.0; vCuv = vec2(0.0); vDepth = 0.0; vGSlope = -1.0;',
      fragHead: /* glsl */`
        varying vec4 vData; varying vec2 vData2; varying float vComp; varying vec2 vCuv; varying float vDepth; varying float vGSlope;
        uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uMapMode; uniform float uNight;
        ${overlay ? 'uniform sampler2D uComp; uniform float uCompRes, uSize;' : ''}
        float th(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(th(i), th(i+vec2(1,0)), f.x), mix(th(i+vec2(0,1)), th(i+vec2(1,1)), f.x), f.y); }
      `,
      fragColor: /* glsl */`
        float groomA = vData.x, powderA = vData.y, forestA = vData.z, roadA = vData.w;
        float camD = length(vWPos - cameraPosition);
        vec3 wn = normalize(vWNrm);
        // the fresh-snow overlay takes rock from the ground under it, so groove walls stay snow
        float slope = vGSlope >= 0.0 ? vGSlope : 1.0 - wn.y;
        vec3 snow = vec3(0.86, 0.90, 0.97);
        // groomed snow is a touch warmer and smoother, powder a touch bluer and brighter
        snow = mix(snow, vec3(0.90, 0.92, 0.95), groomA * 0.6);
        snow = mix(snow, vec3(0.92, 0.95, 1.0), powderA * 0.3);
        // soft drifts: a few percent of albedo variation
        snow *= 0.97 + 0.05 * vnoise(vWPos.xz * 0.21) + 0.02 * vnoise(vWPos.xz * 1.7);
        // groomer passes: broad strips along the run
        float th0 = vData2.x; vec2 dirT = vec2(cos(th0), sin(th0)); vec2 dirN = vec2(-dirT.y, dirT.x);
        float q = dot(vWPos.xz, dirN);
        float strip = th(vec2(floor(q / 4.6), floor(dot(vWPos.xz, dirT) / 60.0)));
        snow *= 1.0 - groomA * (0.035 * strip) * (1.0 - smoothstep(200.0, 500.0, camD));
        // packed snow in a groove is denser and a little blue
        snow = mix(snow, snow * vec3(0.84, 0.89, 0.98), clamp(vComp, 0.0, 1.0) * 0.7);
        // rock on steep faces, with strata and lichen-dark patches
        float rn = vnoise(vWPos.xz * 0.15) * 0.08 + vnoise(vWPos.xz * 0.8) * 0.04;
        float rock = smoothstep(0.36, 0.46, slope + rn) * (1.0 - groomA);
        float strata = fract(vWPos.y * 0.21 + rn * 4.0);
        vec3 rockC = mix(vec3(0.20, 0.19, 0.19), vec3(0.33, 0.31, 0.29), strata * 0.6) * (0.85 + 0.3 * vnoise(vWPos.xz * 2.3 + vWPos.y));
        rockC = mix(rockC, vec3(0.86, 0.9, 0.96), smoothstep(0.55, 0.85, vnoise(vWPos.xz * 1.1 + 3.0)) * 0.55); // snow caught on ledges
        vec3 col = mix(snow, rockC, rock);
        // forest floor: shaded snow, needle and twig litter close up, a dark mass from afar
        float far = smoothstep(250.0, 1400.0, camD);
        col = mix(col, vec3(0.62, 0.68, 0.74), forestA * 0.35 * (1.0 - far));
        float litter = step(0.93, th(floor(vWPos.xz * 7.0))) * smoothstep(0.25, 0.7, forestA) * (1.0 - groomA) * (1.0 - smoothstep(0.2, 0.6, vData2.y)) * (1.0 - smoothstep(8.0, 30.0, camD)) * (1.0 - clamp(vComp, 0.0, 1.0));
        col = mix(col, vec3(0.28, 0.22, 0.18), litter * 0.55);
        // from afar a forest is a speckle of dark firs and grey-brown bare birch over the snow
        float stand = vnoise(vWPos.xz * 0.045) * 0.6 + vnoise(vWPos.xz * 0.19) * 0.4;
        vec3 woodC = mix(vec3(0.035, 0.06, 0.065), vec3(0.2, 0.2, 0.235), smoothstep(0.5, 0.8, vnoise(vWPos.xz * 0.008 + 9.0)) * 0.8);
        float dens = clamp(forestA * 1.3, 0.0, 1.0) * (0.75 + 0.5 * stand);
        col = mix(col, woodC, clamp(dens, 0.0, 0.97) * (0.1 + 0.86 * far) * (1.0 - rock));
        // plowed roads
        float tracks = smoothstep(0.35, 0.5, abs(fract(q * 0.45) - 0.5));
        col = mix(col, mix(vec3(0.34, 0.34, 0.36), vec3(0.22, 0.22, 0.24), tracks * 0.7), roadA);
        diffuseColor.rgb = col;
      `,
      fragTail: /* glsl */`
        // sun glitter on fresh snow (packed snow doesn't sparkle)
        {
          vec3 V = normalize(cameraPosition - vWPos);
          vec3 Hh = normalize(uSunDir + V);
          vec3 cellP = floor(vWPos * 22.0);
          float rnd = th(cellP.xz + cellP.y * 7.13 + floor(V.xz * 6.0));
          float spec = pow(max(dot(normalize(vWNrm), Hh), 0.0), 18.0);
          float spark = step(0.993, rnd) * spec * (1.0 - smoothstep(15.0, 120.0, length(vWPos - cameraPosition)));
          outgoingLight += uSunColor * spark * 5.0 * (1.0 - vData.w) * (1.0 - clamp(vComp, 0.0, 1.0)) * max(uSunDir.y, 0.0);
        }
      `,
    });
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      prev(sh, r);
      if (overlay) {
        // the overlay builds its own position and normal from the world maps
        sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', /* glsl */`
          vec2 sLoc = position.xz;
          float sComp, sTmp;
          {
            vec2 w0 = sLoc + uOrigin;
            float gx = hAt(w0 + vec2(1.5, 0.0)) - hAt(w0 - vec2(1.5, 0.0)), gz = hAt(w0 + vec2(0.0, 1.5)) - hAt(w0 - vec2(0.0, 1.5));
            float grade = length(vec2(gx, gz)) / 3.0;
            gSlopeK = 1.0 - smoothstep(0.55, 1.1, grade) * 0.8;
            vGSlope = 1.0 - inversesqrt(1.0 + grade * grade);
          }
          float sY = snowY(sLoc, sComp);
          float e = 0.12;
          float yx1 = snowY(sLoc + vec2(e, 0.0), sTmp), yx0 = snowY(sLoc - vec2(e, 0.0), sTmp);
          float yz1 = snowY(sLoc + vec2(0.0, e), sTmp), yz0 = snowY(sLoc - vec2(0.0, e), sTmp);
          vec3 objectNormal = normalize(vec3(yx0 - yx1, 2.0 * e, yz0 - yz1));
          vec2 sW = sLoc + uOrigin;
          vec3 snowPos = vec3(sW.x, sY, sW.y);
          vData = texture(uSMap, wUv(sW));
          vData.x *= 1.0 - sComp;
          vec2 dd = texelFetch(uDMap, ivec2(clamp(floor((sW + uWHalf) / uWRes + 0.5), vec2(0.0), vec2(uWN - 1.0))), 0).rg;
          vData2 = vec2(dd.x * 3.14159265, dd.y);
          vComp = sComp; vCuv = sLoc / uSize + 0.5; vDepth = sY - hAt(sW);
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3(tangent.xyz);
          #endif
        `).replace('#include <begin_vertex>', 'vec3 transformed = snowPos;');
      }
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', /* glsl */`
        #include <normal_fragment_maps>
        {
          float camD2 = length(vWPos - cameraPosition);
          float near = 1.0 - smoothstep(25.0, 75.0, camD2);
          float th1 = vData2.x; vec2 dT = vec2(cos(th1), sin(th1)); vec2 dN = vec2(-dT.y, dT.x);
          float q2 = dot(vWPos.xz, dN);
          float cord = sin(q2 * 6.2831 / 0.11) * vData.x * (1.0 - smoothstep(5.0, 22.0, camD2)) * 0.2;
          // wind ripples (sastrugi) on ungroomed snow, stretched across the wind
          vec2 rp = vWPos.xz * vec2(0.9, 0.35);
          float rip = (vnoise(rp) - 0.5 + (vnoise(rp * 3.1) - 0.5) * 0.4) * (1.0 - vData.x) * (0.25 + vData.y * 0.4) * (1.0 - smoothstep(20.0, 90.0, camD2));
          // fine grain: small lumps you only see up close
          float g1 = vnoise(vWPos.xz * 6.0) - 0.5, g2 = vnoise(vWPos.zx * 6.0 + 11.0) - 0.5;
          // and a coarser crust a hand's width across: the surface reads rough, not plastic
          float g3 = vnoise(vWPos.xz * 1.9 + 5.0) - 0.5, g4 = vnoise(vWPos.zx * 1.9 + 23.0) - 0.5;
          vec3 pw = vec3(dN.x, 0.0, dN.y) * cord + vec3(0.6, 0.0, 0.3) * rip + vec3(g1 + g3 * 0.8, 0.0, g2 + g4 * 0.8) * 0.26 * near * (1.0 - vData.w);
          ${overlay ? `
          // crisp groove walls from the compaction map
          {
            float cpx = 1.0 / uCompRes;
            float cx1 = texture(uComp, vCuv + vec2(cpx, 0.0)).r, cx0 = texture(uComp, vCuv - vec2(cpx, 0.0)).r;
            float cz1 = texture(uComp, vCuv + vec2(0.0, cpx)).r, cz0 = texture(uComp, vCuv - vec2(0.0, cpx)).r;
            float k = vDepth / max(vComp < 0.99 ? (1.0 - vComp) : 1.0, 0.05) / (2.0 * uSize * cpx);
            pw += vec3(cx1 - cx0, 0.0, cz1 - cz0) * clamp(k, 0.0, 3.0);
          }` : ''}
          normal = normalize(normal + (viewMatrix * vec4(pw, 0.0)).xyz);
        }
      `).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.62, 0.5, vData.x); roughnessFactor = mix(roughnessFactor, 0.45, vData.w);
        roughnessFactor = mix(roughnessFactor, 0.48, clamp(vComp, 0.0, 1.0));`);
    };
    if (overlay) {
      mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -2;
    }
    return mat;
  },
};
