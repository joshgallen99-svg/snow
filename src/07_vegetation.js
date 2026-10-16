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
      b.add(G.cone(r * 0.56, h * 0.5, 7), { y: y0 + h - h * 0.25 + 0.07, color: snow, ry: i * 0.7 + 0.22 });
    });
    return b.build();
  },
  // a fir buried in rime: lumpy white blobs leaning downwind, a little green showing through
  monsterGeometry(lod) {
    const b = new GeoBuilder({ smooth: true });
    const rime = 0xeef3f8, blue = 0xdbe5ef, green = 0x2a4a35;
    const rnd = mulberry32(lod ? 3 : 4);
    if (lod === 1) {
      b.add(G.ico(1, 1), { y: 3.4, sx: 1.9, sy: 3.6, sz: 1.8, color: rime });
      return b.build();
    }
    // a tapering core plastered with rime lumps, leaning downwind; a few needles show on the lee side
    b.add(G.ico(1, 1), { x: 0.3, y: 3.1, sx: 1.55, sy: 3.3, sz: 1.4, rz: -0.06, color: rime });
    b.add(G.ico(1, 1), { x: 0.0, y: 1.2, sx: 1.9, sy: 1.3, sz: 1.8, color: blue });
    for (let k = 0; k < 16; k++) {
      const h = 0.6 + rnd() * 5.6, prof = 1 - Math.pow(Math.abs(h - 3.1) / 3.4, 1.6);
      const a = rnd() * TAU, rr = (0.6 + 1.0 * prof) * (0.85 + rnd() * 0.3), r = 0.45 + rnd() * 0.55 * (0.4 + prof);
      b.add(G.ico(1, 0), { x: 0.3 + h * 0.05 + Math.cos(a) * rr, y: h, z: Math.sin(a) * rr, sx: r * 1.1, sy: r * 0.8, sz: r, ry: rnd() * TAU, color: rnd() < 0.3 ? blue : rime });
    }
    for (let k = 0; k < 4; k++) {
      const h = 1.4 + k * 1.1, a = Math.PI + (rnd() - 0.5) * 1.2, rr = 1.0 + (1 - k * 0.2) * 0.4;
      b.add(G.cone(0.45, 0.7, 6), { x: Math.cos(a) * rr, y: h, z: Math.sin(a) * rr, rz: 0.6, ry: -a, color: green });
    }
    b.add(G.ico(0.5, 1), { x: 0.55, y: 6.6, sy: 1.3, color: rime });
    return b.build();
  },
  birchGeometry(lod) {
    const b = new GeoBuilder();
    const bark = 0xe9e5dc, mark = 0x3b3631, twig = 0x7d6c68;
    // trunk in bands so the dark lenticels show; the fine crown is drawn on crossed planes
    const bands = [[0, 1.6, bark], [1.6, 0.25, mark], [1.85, 2.2, bark], [4.05, 0.18, mark], [4.23, 2.0, bark], [6.23, 0.15, mark], [6.38, 2.6, bark]];
    for (const [y0, h, c] of bands) {
      const rb = 0.17 - y0 * 0.011, rt = 0.17 - (y0 + h) * 0.011;
      b.add(G.cyl(Math.max(0.05, rt), Math.max(0.06, rb), h, 6), { y: y0 + h / 2, color: c });
    }
    // a few solid main limbs so the crown has some body up close
    const rnd = mulberry32(11);
    for (let i = 0; i < 5; i++) {
      const y = 3.6 + i * 0.95, a = i * 2.4 + rnd(), len = 1.6 + rnd() * 1.2, tilt = 0.5 + rnd() * 0.3;
      const cx = Math.cos(a) * Math.sin(tilt) * len * 0.5, cz = Math.sin(a) * Math.sin(tilt) * len * 0.5, cy = Math.cos(tilt) * len * 0.5;
      _q.setFromUnitVectors(_v.set(0, 1, 0), _v2.set(cx, cy, cz).normalize());
      _m4.compose(_v.set(cx, y + cy, cz), _q, _s.set(1, 1, 1));
      b.add(G.cyl(0.015, 0.035, len, 4), { matrix: _m4.clone(), color: twig });
    }
    return b.build();
  },
  // a bare birch crown drawn twig by twig: upswept limbs, forking branches and hanging twigs,
  // with a faint purple haze that keeps the crown from vanishing in the distance
  birchTexture(withTrunk) {
    return canvasTexture(256, 512, (ctx, w, h) => {
      const S = 40, rnd = mulberry32(withTrunk ? 7 : 5);
      const P = (x, y) => [w / 2 + x * S, h - y * S];
      ctx.clearRect(0, 0, w, h);
      // haze
      const g = ctx.createRadialGradient(...P(0, 7.4), 10, ...P(0, 7.4), 3.4 * S);
      g.addColorStop(0, 'rgba(86,76,80,0.2)'); g.addColorStop(1, 'rgba(86,76,80,0)');
      ctx.save(); ctx.translate(...P(0, 7.4)); ctx.scale(0.8, 1.15); ctx.translate(-P(0, 7.4)[0], -P(0, 7.4)[1]);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(...P(0, 7.4), 3.4 * S, 0, TAU); ctx.fill(); ctx.restore();
      ctx.lineCap = 'round';
      const line = (x0, y0, x1, y1, wpx, col) => { ctx.strokeStyle = col; ctx.lineWidth = wpx; ctx.beginPath(); ctx.moveTo(...P(x0, y0)); ctx.lineTo(...P(x1, y1)); ctx.stroke(); };
      const twigs = (x, y, ang, len, wpx, depth) => {
        const x1 = x + Math.sin(ang) * len, y1 = y + Math.cos(ang) * len;
        line(x, y, x1, y1, wpx, depth > 1 ? '#3a3132' : '#4a3d3e');
        if (depth <= 0) {
          // silver birch twigs hang down from the branch ends
          for (let k = 0; k < 2; k++) {
            const t = 0.5 + rnd() * 0.5, hx = x + (x1 - x) * t, hy = y + (y1 - y) * t, hl = 0.25 + rnd() * 0.4;
            line(hx, hy, hx + (rnd() - 0.5) * 0.25, hy - hl, 0.7, 'rgba(92,78,80,0.85)');
          }
          return;
        }
        const n = 2 + (rnd() < 0.5 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const t = 0.45 + rnd() * 0.5;
          const sx = x + (x1 - x) * t, sy = y + (y1 - y) * t;
          const da = (rnd() < 0.5 ? -1 : 1) * (0.3 + rnd() * 0.45);
          // children bend back toward vertical a little
          twigs(sx, sy, ang + da - ang * 0.25, len * (0.5 + rnd() * 0.2), wpx * 0.62, depth - 1);
        }
      };
      if (withTrunk) {
        // the trunk as seen from afar: white with dark bands
        for (let y = 0; y < 9.5; y += 0.5) {
          const wpx = Math.max(1.2, 7 - y * 0.6);
          line(0, y, 0, y + 0.5, wpx, rnd() < 0.18 ? '#3b3631' : '#ece8e0');
        }
      } else line(0, 8.6, 0, 10.6, 1.6, '#d8d2c8');
      for (let i = 0; i < 16; i++) {
        const y = 3.3 + i * 0.45 + rnd() * 0.3, side = i % 2 ? 1 : -1;
        const top = i / 16;
        const ang = side * (0.45 + rnd() * 0.5) * (1 - top * 0.4);
        twigs(0, y, ang, (2.4 - top * 1.3) * (0.8 + rnd() * 0.4), 2.6 - top, 3);
      }
    });
  },
  // three crossed planes carrying the crown texture, normals pointing up so they light evenly
  crossedPlanes(n, y0, y1, w) {
    const pos = [], nrm = [], uv = [], idx = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI, cx = Math.cos(a) * w / 2, cz = Math.sin(a) * w / 2, base = pos.length / 3;
      pos.push(-cx, y0, -cz, cx, y0, cz, cx, y1, cz, -cx, y1, -cz);
      for (let q = 0; q < 4; q++) nrm.push(0, 1, 0);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  },
  crownMaterial(tex, near) {
    const mat = new THREE.MeshStandardMaterial({ map: tex, color: 0xb0a8a8, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.95, metalness: 0, alphaToCoverage: true });
    patchStandard(mat, {
      key: near ? 'crownNear' : 'crownFar',
      uniforms: { uLodCam: U.uLodCam, uLodR: U.uLodR },
      vertexHead: 'uniform vec3 uLodCam; uniform float uLodR;',
      vertexBegin: this.lodChunk(near),
    });
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      prev(sh, r);
      // both faces light like the top: no dark backs on the crossed planes
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);');
    };
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.35, side: THREE.DoubleSide });
    depth.onBeforeCompile = (sh) => {
      sh.uniforms.uLodCam = U.uLodCam; sh.uniforms.uLodR = U.uLodR;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec3 uLodCam; uniform float uLodR;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + this.lodChunk(near));
    };
    return { mat, depth };
  },
  rockGeometry(seed) {
    const g = G.ico(1, 1);
    const p = g.attributes.position, rnd = mulberry32(seed);
    const offs = new Map();
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      // lumpy, but within a few percent of the ellipsoid the physics uses
      if (!offs.has(key)) offs.set(key, 0.92 + rnd() * 0.14);
      const k = offs.get(key);
      p.setXYZ(i, p.getX(i) * k * ROCK_SHAPE[0], p.getY(i) * k * ROCK_SHAPE[1], p.getZ(i) * k * ROCK_SHAPE[2]);
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
      fragColor: DETAIL.needles,
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
    const geoNear = [this.firGeometry(0), this.birchGeometry(0), this.monsterGeometry(0)];
    const geoFar = [this.firGeometry(1), this.crossedPlanes(2, 0, 12.8, 6.4), this.monsterGeometry(1)];
    const matNear = this.lodMaterial(true), matFar = this.lodMaterial(false), depth = this.depthMaterial();
    const crownGeo = this.crossedPlanes(3, 0, 12.8, 6.4);
    const crownNear = this.crownMaterial(this.birchTexture(false), true);
    const crownFar = this.crownMaterial(this.birchTexture(true), false);
    // near tiles are small so little full-detail geometry is drawn past the LOD radius
    const TS = 192, FT = 768;
    this.TS = TS;
    const buckets = new Map();
    const byType = [[], [], []];
    for (const t of Scatter.trees) {
      byType[t.type].push(t);
      const key = Math.floor((t.x + WORLD.half) / TS) * 100 + Math.floor((t.z + WORLD.half) / TS);
      let b = buckets.get(key); if (!b) buckets.set(key, (b = [[], [], []]));
      b[t.type].push(t);
    }
    const tint = new THREE.Color();
    const setInst = (mesh, list) => {
      list.forEach((t, i) => {
        _m4.compose(_v.set(t.x, t.y, t.z), _q.setFromAxisAngle(_v2.set(0, 1, 0), t.rot), _s.set(t.s, t.s * (0.9 + t.tint * 0.25), t.s));
        mesh.setMatrixAt(i, _m4);
        const k = 0.86 + t.tint * 0.24;
        mesh.setColorAt(i, t.type === 2 ? tint.setRGB(0.97 + t.tint * 0.03, 0.98, 1) : tint.setRGB(k, k * (t.type ? 0.98 : 1.0), k));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    };
    for (const [key, b] of buckets) {
      const tx = Math.floor(key / 100), tz = key % 100;
      const tile = { cx: -WORLD.half + (tx + 0.5) * TS, cz: -WORLD.half + (tz + 0.5) * TS, meshes: [] };
      for (let type = 0; type < 3; type++) {
        if (!b[type].length) continue;
        const m = new THREE.InstancedMesh(geoNear[type], matNear, b[type].length);
        setInst(m, b[type]);
        m.castShadow = true; m.receiveShadow = true;
        m.customDepthMaterial = depth;
        this.group.add(m); tile.meshes.push(m);
        if (type === 1) {
          const c = new THREE.InstancedMesh(crownGeo, crownNear.mat, b[type].length);
          setInst(c, b[type]);
          c.castShadow = true; c.receiveShadow = true; c.customDepthMaterial = crownNear.depth;
          this.group.add(c); tile.meshes.push(c);
        }
      }
      this.tiles.push(tile);
    }
    // far trees in big tiles, so the ones behind the camera get frustum-culled
    const farBuckets = new Map();
    for (const t of Scatter.trees) {
      const key = Math.floor((t.x + WORLD.half) / FT) * 100 + Math.floor((t.z + WORLD.half) / FT);
      let b = farBuckets.get(key); if (!b) farBuckets.set(key, (b = [[], [], []]));
      b[t.type].push(t);
    }
    for (const b of farBuckets.values()) for (let type = 0; type < 3; type++) {
      if (!b[type].length) continue;
      const m = new THREE.InstancedMesh(geoFar[type], type === 1 ? crownFar.mat : matFar, b[type].length);
      setInst(m, b[type]);
      m.receiveShadow = false;
      this.group.add(m); this.far.push(m);
    }
    // rocks
    const rockGeos = [this.rockGeometry(1), this.rockGeometry(2), this.rockGeometry(3)];
    const rockMat = stdMat({ roughness: 0.95 }, { key: 'rock', fragColor: DETAIL.rock });
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
    const R = 380 + this.TS * 0.72 + 50;
    for (const t of this.tiles) {
      const vis = !mapMode && Math.hypot(cam.position.x - t.cx, cam.position.z - t.cz) < R;
      for (const m of t.meshes) m.visible = vis;
    }
  },
};
