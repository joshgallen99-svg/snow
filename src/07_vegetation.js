// ============================================================================
//  vegetation — instanced Sakhalin fir and white birch with near/far LOD,
//  and instanced rocks with snow caps
// ============================================================================
const Vegetation = {
  group: null, tiles: [], far: [], rockMeshes: [],

  firGeometry(lod) {
    const b = new GeoBuilder();
    const snow = 0xeef3f8;
    if (lod === 1) {
      b.add(G.cone(2.3, 8.6, 6), { y: 0.6 + 4.3, color: 0x183224 });
      b.add(G.cone(0.85, 2.3, 6), { y: 1.2 + 8.0 - 1.15 + 0.1, color: snow, ry: 0.3 });
      return b.build();
    }
    b.add(G.cyl(0.16, 0.27, 2.4, 6), { y: 1.2, color: 0x56392a });
    const tiers = [[2.6, 3.2, 1.3], [2.1, 2.9, 3.0], [1.6, 2.6, 4.6], [1.05, 2.2, 6.1]];
    tiers.forEach(([r, h, y0], i) => {
      const green = i % 2 ? 0x22432f : 0x1d3a29;
      b.add(G.cone(r, h, 7), { y: y0 + h / 2, color: green, ry: i * 0.7 });
      // snow sits in patches on the upper side of each tier, the needles still show
      b.add(G.cone(r * 0.52, h * 0.4, 7), { y: y0 + h - h * 0.2 + 0.06, color: snow, ry: i * 0.7 + 0.2 });
    });
    return b.build();
  },
  birchGeometry(lod) {
    const b = new GeoBuilder();
    const bark = 0xe9e5dc, mark = 0x3b3631, twig = 0x5e504b, crown = 0x8a7a78;
    if (lod === 1) {
      b.add(G.cone(0.14, 6, 3), { y: 3, color: bark });
      b.add(new THREE.OctahedronGeometry(1.5, 0), { y: 7.0, sy: 1.7, color: 0x857773 });
      return b.build();
    }
    // trunk in bands so the dark lenticels show
    const bands = [[0, 1.6, bark], [1.6, 0.25, mark], [1.85, 2.2, bark], [4.05, 0.18, mark], [4.23, 2.0, bark], [6.23, 0.15, mark], [6.38, 2.6, bark]];
    for (const [y0, h, c] of bands) {
      const rb = 0.17 - y0 * 0.011, rt = 0.17 - (y0 + h) * 0.011;
      b.add(G.cyl(Math.max(0.05, rt), Math.max(0.06, rb), h, 6), { y: y0 + h / 2, color: c });
    }
    const rnd = mulberry32(11);
    // bare winter crown: upswept branches ending in fine twig sprays (a purple-grey haze)
    for (let i = 0; i < 6; i++) {
      const y = 3.8 + i * 0.75, a = i * 2.4 + rnd(), len = 1.4 + rnd() * 1.4;
      const tilt = 0.45 + rnd() * 0.35;
      const cx = Math.cos(a) * Math.sin(tilt) * len * 0.5, cz = Math.sin(a) * Math.sin(tilt) * len * 0.5, cy = Math.cos(tilt) * len * 0.5;
      _q.setFromUnitVectors(_v.set(0, 1, 0), _v2.set(cx, cy, cz).normalize());
      _m4.compose(_v.set(cx, y + cy, cz), _q, _s.set(1, 1, 1));
      b.add(G.cyl(0.025, 0.055, len, 4), { matrix: _m4.clone(), color: twig });
      _m4.compose(_v.set(cx * 2.05, y + cy * 2.05 + 0.25, cz * 2.05), _q, _s.set(0.42, 1.25, 0.42));
      b.add(new THREE.OctahedronGeometry(0.7, 0), { matrix: _m4.clone(), color: crown, colorFn: snowCap(0.9) });
    }
    b.add(new THREE.OctahedronGeometry(0.6, 0), { y: 9.0, sx: 0.5, sy: 1.6, sz: 0.5, color: crown });
    return b.build();
  },
  rockGeometry(seed) {
    const g = G.ico(1, 1);
    const p = g.attributes.position, rnd = mulberry32(seed);
    const offs = new Map();
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      if (!offs.has(key)) offs.set(key, 0.75 + rnd() * 0.5);
      const k = offs.get(key);
      p.setXYZ(i, p.getX(i) * k * 1.15, p.getY(i) * k * 0.72, p.getZ(i) * k);
    }
    const b = new GeoBuilder();
    const rockA = new THREE.Color(0x56524e), rockB = new THREE.Color(0x45423f), snow = new THREE.Color(0xf0f4f8);
    b.add(g, { color: 0x56524e, colorFn: (nx, ny, nz, x, y, z) => (ny > 0.48 + (x * 7.1 % 0.1) ? snow : (y > 0 ? rockA : rockB)) });
    return b.build();
  },

  lodMaterial(near) {
    const mat = stdMat({ roughness: 0.92 }, {
      key: near ? 'treeNear' : 'treeFar',
      uniforms: { uLodCam: U.uLodCam, uLodR: U.uLodR },
      vertexHead: 'uniform vec3 uLodCam; uniform float uLodR;',
      vertexBegin: this.lodChunk(near),
    });
    return mat;
  },
  lodChunk(near) {
    return `
      {
        vec3 ipos = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float ld = distance(ipos.xz, uLodCam.xz);
        float lr = uLodR + fract(sin(dot(ipos.xz, vec2(12.9898, 78.233))) * 43758.5453) * 50.0;
        ${near ? 'if (ld > lr) transformed *= 0.0;' : 'if (ld < lr) transformed *= 0.0;'}
      }`;
  },
  depthMaterial() {
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uLodCam = U.uLodCam; sh.uniforms.uLodR = U.uLodR;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec3 uLodCam; uniform float uLodR;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + this.lodChunk(true));
    };
    return m;
  },

  init(scene) {
    this.group = new THREE.Group(); this.group.name = 'vegetation';
    scene.add(this.group);
    const geoNear = [this.firGeometry(0), this.birchGeometry(0)];
    const geoFar = [this.firGeometry(1), this.birchGeometry(1)];
    const matNear = this.lodMaterial(true), matFar = this.lodMaterial(false), depth = this.depthMaterial();
    const TS = 256, nt = Math.ceil((WORLD.half * 2) / TS);
    const buckets = new Map();
    const byType = [[], []];
    for (const t of Scatter.trees) {
      byType[t.type].push(t);
      const key = Math.floor((t.x + WORLD.half) / TS) * 100 + Math.floor((t.z + WORLD.half) / TS);
      let b = buckets.get(key); if (!b) buckets.set(key, (b = [[], []]));
      b[t.type].push(t);
    }
    const tint = new THREE.Color();
    const setInst = (mesh, list) => {
      list.forEach((t, i) => {
        _m4.compose(_v.set(t.x, t.y, t.z), _q.setFromAxisAngle(_v2.set(0, 1, 0), t.rot), _s.set(t.s, t.s * (0.9 + t.tint * 0.25), t.s));
        mesh.setMatrixAt(i, _m4);
        const k = 0.86 + t.tint * 0.24;
        mesh.setColorAt(i, tint.setRGB(k, k * (t.type ? 0.98 : 1.0), k));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    };
    for (const [key, b] of buckets) {
      const tx = Math.floor(key / 100), tz = key % 100;
      const tile = { cx: -WORLD.half + (tx + 0.5) * TS, cz: -WORLD.half + (tz + 0.5) * TS, meshes: [] };
      for (let type = 0; type < 2; type++) {
        if (!b[type].length) continue;
        const m = new THREE.InstancedMesh(geoNear[type], matNear, b[type].length);
        setInst(m, b[type]);
        m.castShadow = true; m.receiveShadow = true;
        m.customDepthMaterial = depth;
        this.group.add(m); tile.meshes.push(m);
      }
      this.tiles.push(tile);
    }
    for (let type = 0; type < 2; type++) {
      const m = new THREE.InstancedMesh(geoFar[type], matFar, byType[type].length);
      setInst(m, byType[type]);
      m.receiveShadow = false;
      this.group.add(m); this.far.push(m);
    }
    // rocks
    const rockGeos = [this.rockGeometry(1), this.rockGeometry(2), this.rockGeometry(3)];
    const rockMat = stdMat({ roughness: 0.95 }, { key: 'rock' });
    const lists = [[], [], []];
    Scatter.rocks.forEach((r, i) => lists[Math.floor(r.seed * 3) % 3].push(r));
    lists.forEach((list, v) => {
      if (!list.length) return;
      const m = new THREE.InstancedMesh(rockGeos[v], rockMat, list.length);
      list.forEach((r, i) => {
        _m4.compose(_v.set(r.x, r.y, r.z), _q.setFromAxisAngle(_v2.set(0, 1, 0), r.rot), _s.set(r.r, r.r * (r.cliff ? 1.3 : 1), r.r));
        m.setMatrixAt(i, _m4);
        const k = 0.85 + r.seed * 0.3;
        m.setColorAt(i, tint.setRGB(k, k, k));
      });
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m); this.rockMeshes.push(m);
    });
  },

  update(cam, mapMode) {
    U.uLodCam.value.copy(cam.position);
    U.uLodR.value = mapMode ? 0 : 380;
    const R = 380 + 260;
    for (const t of this.tiles) {
      const vis = !mapMode && Math.hypot(cam.position.x - t.cx, cam.position.z - t.cz) < R;
      for (const m of t.meshes) m.visible = vis;
    }
  },
};
