// ============================================================================
//  terrain mesh — chunked LOD with skirts, snow shader (corduroy, powder,
//  rock exposure, sparkle, forest floor, roads)
// ============================================================================
const TerrainMesh = {
  CH: 128, chunks: [], group: null, material: null, nc: 0,
  LODS: [{ seg: 64, dist: 300 }, { seg: 32, dist: 700 }, { seg: 16, dist: 1e9 }],
  buildQueue: 0,

  init(scene) {
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    scene.add(this.group);
    this.material = this.makeMaterial();
    this.nc = Math.round((WORLD.half * 2) / this.CH);
    for (let j = 0; j < this.nc; j++) for (let i = 0; i < this.nc; i++) {
      const x0 = -WORLD.half + i * this.CH, z0 = -WORLD.half + j * this.CH;
      this.chunks.push({ i, j, x0, z0, cx: x0 + this.CH / 2, cz: z0 + this.CH / 2, meshes: [null, null, null], lod: -1, want: 2, used: [0, 0, 0] });
    }
    // build all coarse chunks up front so the whole mountain exists immediately
    for (const c of this.chunks) this.ensure(c, 2);
  },

  makeGeometry(c, seg) {
    const W = World, CH = this.CH, step = CH / seg, n = seg + 1;
    const skirt = 4 * n;
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
    for (let i = 0; i < n; i++) ring.push([i, 0]);
    for (let j = 0; j < n; j++) ring.push([n - 1, j]);
    for (let i = n - 1; i >= 0; i--) ring.push([i, n - 1]);
    for (let j = n - 1; j >= 0; j--) ring.push([0, j]);
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
    g.setIndex(idx);
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

  // pick LOD per chunk from camera distance; build at most a few chunks per frame
  update(cam, force = false) {
    let budget = force ? 999 : 3;
    const cx = cam.position.x, cz = cam.position.z, cy = cam.position.y;
    for (const c of this.chunks) {
      const dx = Math.max(Math.abs(cx - c.cx) - this.CH / 2, 0), dz = Math.max(Math.abs(cz - c.cz) - this.CH / 2, 0);
      const dy = Math.max(0, cy - World.height(c.cx, c.cz) - 60);
      const d = Math.hypot(dx, dz, dy);
      let want = 2;
      if (d < this.LODS[0].dist) want = 0; else if (d < this.LODS[1].dist) want = 1;
      if (want !== c.lod) {
        let use = want;
        if (!c.meshes[want]) {
          if (budget > 0) { this.ensure(c, want); budget--; } else use = c.meshes[c.lod] ? c.lod : 2;
        }
        if (use !== c.lod) {
          if (c.lod >= 0 && c.meshes[c.lod]) c.meshes[c.lod].visible = false;
          this.ensure(c, use).visible = true;
          c.lod = use;
        }
      }
    }
    // free far fine meshes to cap memory
    for (const c of this.chunks) {
      for (let l = 0; l < 2; l++) {
        const m = c.meshes[l];
        if (m && c.lod !== l && Math.hypot(cx - c.cx, cz - c.cz) > this.LODS[l].dist * 2.2) {
          this.group.remove(m); m.geometry.dispose(); c.meshes[l] = null;
        }
      }
    }
  },
  // rebuild everything (after terrain edits)
  rebuildAll() {
    for (const c of this.chunks) for (let l = 0; l < 3; l++) if (c.meshes[l]) { this.group.remove(c.meshes[l]); c.meshes[l].geometry.dispose(); c.meshes[l] = null; }
    for (const c of this.chunks) { c.lod = -1; this.ensure(c, 2); }
  },

  makeMaterial() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    const uni = { uSunDir: U.uSunDir, uSunColor: U.uSunColor, uMapMode: U.uMapMode, uNight: U.uNight };
    patchStandard(mat, {
      key: 'terrain',
      uniforms: uni,
      vertexHead: 'attribute vec4 aData; attribute vec2 aData2; varying vec4 vData; varying vec2 vData2;',
      vertexTail: 'vData = aData; vData2 = aData2;',
      fragHead: /* glsl */`
        varying vec4 vData; varying vec2 vData2;
        uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uMapMode; uniform float uNight;
        float th(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(th(i), th(i+vec2(1,0)), f.x), mix(th(i+vec2(0,1)), th(i+vec2(1,1)), f.x), f.y); }
      `,
      fragColor: /* glsl */`
        float groomA = vData.x, powderA = vData.y, forestA = vData.z, roadA = vData.w;
        float camD = length(vWPos - cameraPosition);
        vec3 wn = normalize(vWNrm);
        float slope = 1.0 - wn.y;
        vec3 snow = vec3(0.86, 0.90, 0.97);
        // groomed snow is a touch warmer and smoother, powder a touch bluer and brighter
        snow = mix(snow, vec3(0.90, 0.92, 0.95), groomA * 0.6);
        snow = mix(snow, vec3(0.92, 0.95, 1.0), powderA * 0.3);
        // groomer passes: broad strips along the run
        float th0 = vData2.x; vec2 dirT = vec2(cos(th0), sin(th0)); vec2 dirN = vec2(-dirT.y, dirT.x);
        float q = dot(vWPos.xz, dirN);
        float strip = th(vec2(floor(q / 4.6), floor(dot(vWPos.xz, dirT) / 60.0)));
        snow *= 1.0 - groomA * (0.035 * strip) * (1.0 - smoothstep(200.0, 500.0, camD));
        // rock on steep faces, with a little strata
        float rn = vnoise(vWPos.xz * 0.15) * 0.08 + vnoise(vWPos.xz * 0.8) * 0.04;
        float rock = smoothstep(0.36, 0.46, slope + rn) * (1.0 - groomA);
        vec3 rockC = mix(vec3(0.20, 0.19, 0.19), vec3(0.32, 0.30, 0.28), fract(vWPos.y * 0.21 + rn * 4.0) * 0.6);
        vec3 col = mix(snow, rockC, rock);
        // forest floor: shaded snow and needle litter, and a dark mass from afar
        float far = smoothstep(250.0, 1400.0, camD);
        col = mix(col, vec3(0.62, 0.68, 0.74), forestA * 0.35 * (1.0 - far));
        col = mix(col, vec3(0.13, 0.19, 0.20), forestA * (0.08 + 0.5 * far) * (1.0 - rock));
        // plowed roads
        float tracks = smoothstep(0.35, 0.5, abs(fract(q * 0.45) - 0.5));
        col = mix(col, mix(vec3(0.42, 0.42, 0.43), vec3(0.30, 0.30, 0.31), tracks * 0.7), roadA);
        diffuseColor.rgb = col;
      `,
      fragTail: /* glsl */`
        // sun glitter on fresh snow
        {
          vec3 V = normalize(cameraPosition - vWPos);
          vec3 Hh = normalize(uSunDir + V);
          vec3 cellP = floor(vWPos * 22.0);
          float rnd = th(cellP.xz + cellP.y * 7.13 + floor(V.xz * 6.0));
          float spec = pow(max(dot(normalize(vWNrm), Hh), 0.0), 18.0);
          float spark = step(0.9965, rnd) * spec * (1.0 - smoothstep(10.0, 70.0, length(vWPos - cameraPosition)));
          outgoingLight += uSunColor * spark * 3.5 * (1.0 - vData.w) * max(uSunDir.y, 0.0);
        }
      `,
    });
    // normal perturbation for corduroy and wind ripples goes in after normals are known
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      prev(sh, r);
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', /* glsl */`
        #include <normal_fragment_maps>
        {
          float camD2 = length(vWPos - cameraPosition);
          float th1 = vData2.x; vec2 dT = vec2(cos(th1), sin(th1)); vec2 dN = vec2(-dT.y, dT.x);
          float q2 = dot(vWPos.xz, dN);
          float cord = sin(q2 * 6.2831 / 0.11) * vData.x * (1.0 - smoothstep(6.0, 28.0, camD2)) * 0.35;
          vec2 rp = vWPos.xz * vec2(0.9, 0.35);
          float rip = (vnoise(rp) - 0.5) * (1.0 - vData.x) * (0.25 + vData.y * 0.4) * (1.0 - smoothstep(20.0, 90.0, camD2));
          vec3 pw = vec3(dN.x, 0.0, dN.y) * cord + vec3(0.6, 0.0, 0.3) * rip;
          normal = normalize(normal + (viewMatrix * vec4(pw, 0.0)).xyz);
        }
      `).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.92, 0.72, vData.x); roughnessFactor = mix(roughnessFactor, 0.45, vData.w);`);
    };
    return mat;
  },
};
