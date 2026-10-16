// ============================================================================
//  geo — low-poly geometry builder, shared uniforms and shader snippets
// ============================================================================
const V3 = THREE.Vector3;
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new V3(), _v2 = new V3(), _s = new V3();
const _col = new THREE.Color();

// Merges transformed primitive geometries into one non-indexed, flat-shaded,
// vertex-colored BufferGeometry.
class GeoBuilder {
  // smooth: keep each primitive's own normals (round shapes shade smoothly, boxes stay crisp)
  constructor(opts = {}) { this.pos = []; this.col = []; this.nrm = []; this.smooth = !!opts.smooth; }
  add(geo, opts = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position;
    const m = opts.matrix || _m4.compose(
      _v.set(opts.x || 0, opts.y || 0, opts.z || 0),
      _q.setFromEuler(_e.set(opts.rx || 0, opts.ry || 0, opts.rz || 0, opts.order || 'YXZ')),
      _s.set(opts.sx ?? opts.s ?? 1, opts.sy ?? opts.s ?? 1, opts.sz ?? opts.s ?? 1));
    const c = _col.set(opts.color ?? 0xffffff);
    const cr = c.r, cg = c.g, cb = c.b;
    const fn = opts.colorFn;
    const tri = [];
    if (this.smooth) {
      const nm = new THREE.Matrix3().getNormalMatrix(m), na = g.attributes.normal;
      for (let i = 0; i < p.count; i++) { _v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); this.nrm.push(_v.x, _v.y, _v.z); }
    }
    for (let i = 0; i < p.count; i++) {
      _v2.fromBufferAttribute(p, i).applyMatrix4(m);
      this.pos.push(_v2.x, _v2.y, _v2.z);
      tri.push(_v2.x, _v2.y, _v2.z);
      if (!fn) this.col.push(cr, cg, cb);
      if (fn && tri.length === 9) {
        // per-face color callback gets the face normal and centroid
        const ax = tri[3] - tri[0], ay = tri[4] - tri[1], az = tri[5] - tri[2];
        const bx = tri[6] - tri[0], by = tri[7] - tri[1], bz = tri[8] - tri[2];
        let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        const out = fn(nx, ny, nz, (tri[0] + tri[3] + tri[6]) / 3, (tri[1] + tri[4] + tri[7]) / 3, (tri[2] + tri[5] + tri[8]) / 3, c);
        const oc = out || c;
        for (let k = 0; k < 3; k++) this.col.push(oc.r, oc.g, oc.b);
        tri.length = 0;
      }
    }
    if (g !== geo) g.dispose();
    return this;
  }
  get count() { return this.pos.length / 3; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.smooth && this.nrm.length === this.pos.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    else g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}
const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cyl: (rt, rb, h, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg, 1),
  cone: (r, h, seg = 7) => new THREE.ConeGeometry(r, h, seg, 1),
  ico: (r, d = 0) => new THREE.IcosahedronGeometry(r, d),
  sphere: (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h),
};
// A gable roof prism: width along x, depth along z, apex along x axis.
function roofGeometry(w, d, h) {
  const s = new THREE.Shape();
  s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.lineTo(-d / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  g.translate(0, 0, -w / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

// ---- shared uniforms ---------------------------------------------------------
const MAX_LAMPS = 32;
const U = {
  uTime: { value: 0 },
  uLamps: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector4(0, -1e5, 0, 0)) },
  uLampOn: { value: 0 },
  uLampC: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector4(1, 0.8, 0.5, 50)) },
  uSunDir: { value: new V3(0.4, 0.8, 0.3) },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uLodCam: { value: new V3() },
  uLodR: { value: 380 },
  uNight: { value: 0 },
  uMapMode: { value: 0 },
};

const LAMP_GLSL = /* glsl */`
uniform vec4 uLamps[${MAX_LAMPS}];
uniform vec4 uLampC[${MAX_LAMPS}];
uniform float uLampOn;
// xyz position, w intensity; colour rgb and reach in uLampC
vec3 lampLight(vec3 wp, vec3 wn) {
  vec3 acc = vec3(0.0);
  if (uLampOn < 0.01) return acc;
  for (int i = 0; i < ${MAX_LAMPS}; i++) {
    vec3 L = uLamps[i].xyz - wp;
    float d2 = dot(L, L), R = uLampC[i].w;
    if (d2 > R * R) continue;
    float d = sqrt(d2), k = 50.0 / R;
    float ndl = max(dot(wn, L / d), 0.0) * 0.8 + 0.2;
    acc += uLampC[i].rgb * uLamps[i].w * ndl / (1.0 + d2 * k * k * 0.02) * (1.0 - smoothstep(R * 0.52, R, d));
  }
  return acc * uLampOn;
}
`;

// Adds world position/normal varyings + lamp lighting to a standard material.
function patchStandard(mat, opts = {}) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, { uLamps: U.uLamps, uLampC: U.uLampC, uLampOn: U.uLampOn, uTime: U.uTime });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\n' + (opts.vertexHead || ''))
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 wpP = vec4(transformed, 1.0);
        vec3 wnP = objectNormal;
        #ifdef USE_INSTANCING
          wpP = instanceMatrix * wpP; wnP = mat3(instanceMatrix) * wnP;
        #endif
        wpP = modelMatrix * wpP;
        vWPos = wpP.xyz; vWNrm = normalize(mat3(modelMatrix) * wnP);
        ${opts.vertexTail || ''}`);
    if (opts.vertexBegin) sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + opts.vertexBegin);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\n' + LAMP_GLSL + DETAIL_GLSL + (opts.fragHead || ''))
      .replace('#include <opaque_fragment>', `
        outgoingLight += diffuseColor.rgb * lampLight(vWPos, normalize(vWNrm));
        ${opts.fragTail || ''}
        #include <opaque_fragment>`);
    if (opts.fragColor) sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + opts.fragColor);
    if (opts.uniforms) Object.assign(sh.uniforms, opts.uniforms);
  };
  mat.customProgramCacheKey = () => (opts.key || 'std') + (mat.vertexColors ? 'vc' : '');
  return mat;
}
function stdMat(params = {}, opts = {}) {
  return patchStandard(new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0 }, params)), opts);
}

// procedural surface detail shared by prop materials
const DETAIL_GLSL = /* glsl */`
  float dh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float dn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(dh(i), dh(i + vec3(1,0,0)), f.x), mix(dh(i + vec3(0,1,0)), dh(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(dh(i + vec3(0,0,1)), dh(i + vec3(1,0,1)), f.x), mix(dh(i + vec3(0,1,1)), dh(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;
const DETAIL = {
  // timber walls: planks with grain on warm-colored vertical faces
  wood: /* glsl */`{
    vec3 n = normalize(vWNrm); float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    float warm = step(diffuseColor.b * 1.12, diffuseColor.r) * step(lum, 0.72) * (1.0 - smoothstep(0.3, 0.6, abs(n.y)));
    float plank = smoothstep(0.88, 0.97, fract(vWPos.y * 3.3));
    float grain = dn(vec3(vWPos.x * 0.6 + vWPos.z * 0.6, vWPos.y * 22.0, 0.0));
    diffuseColor.rgb *= mix(1.0, (0.9 + 0.2 * grain) * (1.0 - plank * 0.35), warm);
    // weathering on everything else
    diffuseColor.rgb *= 0.94 + 0.12 * dn(vWPos * 1.7);
  }`,
  rock: /* glsl */`{
    vec3 n = normalize(vWNrm); float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    float bare = 1.0 - step(0.8, lum);
    float g = dn(vWPos * 3.1) * 0.6 + dn(vWPos * 9.0) * 0.4;
    vec3 c = diffuseColor.rgb * (0.78 + 0.42 * g);
    c = mix(c, vec3(0.42, 0.45, 0.3), smoothstep(0.72, 0.85, dn(vWPos * 1.3 + 5.0)) * 0.35); // lichen
    // a dusting of snow on the upward faces, with a ragged edge
    float dust = smoothstep(0.35, 0.65, n.y + (dn(vWPos * 2.4) - 0.5) * 0.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(c, vec3(0.93, 0.95, 0.98), dust), bare);
  }`,
  needles: /* glsl */`{
    float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    float leaf = 1.0 - step(0.7, lum);
    diffuseColor.rgb *= mix(1.0, 0.82 + 0.36 * dh(floor(vWPos * 3.0)), leaf);
  }`,
};

// snow-on-top coloring for props: faces pointing up become snow
function snowCap(threshold = 0.55, snow = 0xf2f6fb) {
  const sc = new THREE.Color(snow);
  return (nx, ny, nz, x, y, z, c) => (ny > threshold ? sc : c);
}
