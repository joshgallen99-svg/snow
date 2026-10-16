// ============================================================================
//  snow — a layer of fresh snow sitting on top of the ground around the rider.
//  The board presses it down into a groove (with lips where the snow is pushed
//  aside), skids smear a wide path, crashes leave a body print and trees have
//  wells. Compaction lives in a texture that scrolls with the rider; the layer
//  rebuilds its surface on the GPU from world height and surface maps.
// ============================================================================
const Snow = {
  size: 64, res: 512, origin: { x: 0, z: 0 }, comp: null, tex: null, mesh: null, dirty: false, uniforms: null,
  _col: [],

  init(scene, quality) {
    const W = World, N = W.N;
    this.texel = this.size / this.res;
    // world maps: height (float), surface (groom, powder, forest, road), run direction + coverage
    const hTex = new THREE.DataTexture(W.H, N, N, THREE.RedFormat, THREE.FloatType);
    hTex.minFilter = hTex.magFilter = THREE.NearestFilter; hTex.needsUpdate = true;
    const S = new Uint8Array(N * N * 4), D = new Uint8Array(N * N * 2);
    const road = Scatter.road;
    for (let j = 0; j < N; j++) {
      const z = -W.half + j * W.res;
      for (let i = 0; i < N; i++) {
        const k = j * N + i, x = -W.half + i * W.res;
        S[k * 4] = W.groom[k]; S[k * 4 + 1] = W.powder[k];
        S[k * 4 + 2] = Math.round(Scatter.forestAt(x, z) * 255); S[k * 4 + 3] = road ? road[k] : 0;
        D[k * 2] = W.dir[k]; D[k * 2 + 1] = W.inRun[k];
      }
    }
    const sTex = new THREE.DataTexture(S, N, N, THREE.RGBAFormat); sTex.minFilter = sTex.magFilter = THREE.LinearFilter; sTex.needsUpdate = true;
    const dTex = new THREE.DataTexture(D, N, N, THREE.RGFormat); dTex.minFilter = dTex.magFilter = THREE.NearestFilter; dTex.needsUpdate = true;
    this.comp = new Uint8Array(this.res * this.res * 2);
    this.tex = new THREE.DataTexture(this.comp, this.res, this.res, THREE.RGFormat);
    this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter; this.tex.needsUpdate = true;
    this.uniforms = {
      uHMap: { value: hTex }, uSMap: { value: sTex }, uDMap: { value: dTex }, uComp: { value: this.tex },
      uOrigin: { value: new THREE.Vector2() }, uSize: { value: this.size }, uWN: { value: N }, uWHalf: { value: W.half }, uWRes: { value: W.res }, uCompRes: { value: this.res },
    };
    const seg = quality === 'low' ? 128 : quality === 'medium' ? 160 : 200;
    const geo = new THREE.PlaneGeometry(this.size, this.size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    // pack vertices toward the middle, where the rider is: ~12 cm apart there, coarse at the faded edges
    const pa = geo.attributes.position, hs = this.size / 2, a = 0.25;
    const warp = (v) => { const u = v / hs; return hs * (a * u + (1 - a) * u * u * u); };
    for (let i = 0; i < pa.count; i++) pa.setXYZ(i, warp(pa.getX(i)), 0, warp(pa.getZ(i)));
    this.mesh = new THREE.Mesh(geo, TerrainMesh.makeMaterial(true));
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false; // the shader places the vertices in world space
    scene.add(this.mesh);
    this.recenter(0, 0, true);
  },

  // keep the layer centred on the rider; scroll the compaction map in whole-metre steps
  focus(x, z) {
    if (Math.abs(x - this.origin.x) > 3.5 || Math.abs(z - this.origin.z) > 3.5) this.recenter(x, z);
  },
  recenter(x, z, clear = false) {
    const nx = Math.round(x), nz = Math.round(z);
    const R = this.res, C = this.comp;
    const sx = Math.round((nx - this.origin.x) / this.texel), sz = Math.round((nz - this.origin.z) / this.texel);
    if (clear || Math.abs(sx) >= R || Math.abs(sz) >= R) C.fill(0);
    else if (sx || sz) {
      const next = new Uint8Array(C.length);
      for (let j = 0; j < R; j++) {
        const oj = j + sz; if (oj < 0 || oj >= R) continue;
        for (let i = 0; i < R; i++) {
          const oi = i + sx; if (oi < 0 || oi >= R) continue;
          next[(j * R + i) * 2] = C[(oj * R + oi) * 2];
        }
      }
      C.set(next);
    }
    this.origin.x = nx; this.origin.z = nz;
    this.uniforms.uOrigin.value.set(nx, nz);
    this.buildWells();
    this.dirty = true;
  },
  // tree wells: the snow is shallow around trunks and rocks, where branches shelter it
  buildWells() {
    const R = this.res, C = this.comp, half = this.size / 2;
    for (let k = 1; k < C.length; k += 2) C[k] = 0;
    World.queryColliders(this.origin.x, this.origin.z, half + 2, this._col);
    for (const c of this._col) {
      if (c.kind !== 'tree' && c.kind !== 'rock') continue;
      const rad = c.kind === 'tree' ? 0.8 + (c.ref ? c.ref.s : 1) * 1.1 : c.r * 1.25;
      this.raster(c.x, c.z, rad, (i, j, d) => {
        const v = Math.round(255 * Math.pow(1 - d / rad, 0.6));
        const k = (j * R + i) * 2 + 1;
        if (v > C[k]) C[k] = v;
      });
    }
  },
  raster(x, z, rad, fn) {
    const R = this.res, t = this.texel, x0 = this.origin.x - this.size / 2, z0 = this.origin.z - this.size / 2;
    const i0 = Math.max(0, Math.floor((x - rad - x0) / t)), i1 = Math.min(R - 1, Math.ceil((x + rad - x0) / t));
    const j0 = Math.max(0, Math.floor((z - rad - z0) / t)), j1 = Math.min(R - 1, Math.ceil((z + rad - z0) / t));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(x0 + (i + 0.5) * t - x, z0 + (j + 0.5) * t - z);
      if (d < rad) fn(i, j, d);
    }
  },
  // press an oriented rectangle into the snow (value 0..1 = how far down)
  stampRect(x, z, ax, az, halfLen, halfWid, value) {
    const R = this.res, C = this.comp, t = this.texel, x0 = this.origin.x - this.size / 2, z0 = this.origin.z - this.size / 2;
    const ext = halfLen + halfWid + t * 3;
    const i0 = Math.max(0, Math.floor((x - ext - x0) / t)), i1 = Math.min(R - 1, Math.ceil((x + ext - x0) / t));
    const j0 = Math.max(0, Math.floor((z - ext - z0) / t)), j1 = Math.min(R - 1, Math.ceil((z + ext - z0) / t));
    if (i0 > i1 || j0 > j1) return;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = x0 + (i + 0.5) * t - x, pz = z0 + (j + 0.5) * t - z;
      const u = Math.abs(px * ax + pz * az), v = Math.abs(-px * az + pz * ax);
      const soft = t * 4.5;
      if (u > halfLen + soft || v > halfWid + soft) continue;
      // soft edges and rounded nose and tail, so the groove walls slump like real snow
      const ru = Math.max(0, u - (halfLen - halfWid));
      const rr = Math.hypot(ru, v);
      const edge = sstep(halfWid + soft, halfWid - t * 0.5, rr);
      const val = Math.round(255 * value * clamp(edge, 0, 1));
      const k = (j * R + i) * 2;
      if (val > C[k]) C[k] = val;
    }
    this.dirty = true;
  },
  stampCircle(x, z, rad, value) {
    const R = this.res, C = this.comp;
    this.raster(x, z, rad, (i, j, d) => {
      const val = Math.round(255 * value * Math.min(1, (rad - d) / (rad * 0.4)));
      const k = (j * R + i) * 2;
      if (val > C[k]) C[k] = val;
    });
    this.dirty = true;
  },
  // called by the physics every ground step
  stampBoard(pl) {
    if (!this.mesh || !this.mesh.visible) return;
    const ax = Math.sin(pl.yaw), az = Math.cos(pl.yaw);
    this.stampRect(pl.pos.x, pl.pos.z, ax, az, 0.8, 0.16, 1);
  },
  stampLanding(pl, impact) {
    if (!this.mesh || !this.mesh.visible) return;
    const ax = Math.sin(pl.yaw), az = Math.cos(pl.yaw);
    this.stampRect(pl.pos.x, pl.pos.z, ax, az, 0.95, 0.26 + Math.min(0.3, impact * 0.02), 1);
  },
  stampBody(joints) {
    if (!this.mesh || !this.mesh.visible) return;
    for (let i = 0; i < joints.length; i++) {
      const p = joints[i];
      if (p.y - World.groundHeight(p.x, p.z) < 0.25) this.stampCircle(p.x, p.z, i === J.pelvis ? 0.3 : 0.18, 0.85);
    }
  },
  clearTracks() { for (let k = 0; k < this.comp.length; k += 2) this.comp[k] = 0; this.dirty = true; },
  update() {
    if (this.dirty) { this.tex.needsUpdate = true; this.dirty = false; }
  },
  show(on) { if (this.mesh) this.mesh.visible = on; },
};
