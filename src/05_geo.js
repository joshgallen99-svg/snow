// ============================================================================
//  geo — low-poly geometry builder, shared uniforms and shader snippets
// ============================================================================
const V3 = THREE.Vector3;
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new V3(), _v2 = new V3(), _s = new V3();
const _col = new THREE.Color();

// Merges transformed primitive geometries into one non-indexed, flat-shaded,
// vertex-colored BufferGeometry.
class GeoBuilder {
  constructor() { this.pos = []; this.col = []; this.extra = null; }
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
    g.computeVertexNormals();
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
const MAX_LAMPS = 20;
const U = {
  uTime: { value: 0 },
  uLamps: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector4(0, -1e5, 0, 0)) },
  uLampOn: { value: 0 },
  uLampColor: { value: new THREE.Color(1.0, 0.78, 0.5) },
  uSunDir: { value: new V3(0.4, 0.8, 0.3) },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uLodCam: { value: new V3() },
  uLodR: { value: 380 },
  uNight: { value: 0 },
  uMapMode: { value: 0 },
};

const LAMP_GLSL = /* glsl */`
uniform vec4 uLamps[${MAX_LAMPS}];
uniform float uLampOn;
uniform vec3 uLampColor;
vec3 lampLight(vec3 wp, vec3 wn) {
  vec3 acc = vec3(0.0);
  if (uLampOn < 0.01) return acc;
  for (int i = 0; i < ${MAX_LAMPS}; i++) {
    vec3 L = uLamps[i].xyz - wp;
    float d2 = dot(L, L);
    if (d2 > 2500.0) continue;
    float d = sqrt(d2);
    float ndl = max(dot(wn, L / d), 0.0) * 0.8 + 0.2;
    acc += uLampColor * uLamps[i].w * ndl / (1.0 + d2 * 0.02) * (1.0 - smoothstep(26.0, 50.0, d));
  }
  return acc * uLampOn;
}
`;

// Adds world position/normal varyings + lamp lighting to a standard material.
function patchStandard(mat, opts = {}) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, { uLamps: U.uLamps, uLampOn: U.uLampOn, uLampColor: U.uLampColor, uTime: U.uTime });
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
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\n' + LAMP_GLSL + (opts.fragHead || ''))
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

// snow-on-top coloring for props: faces pointing up become snow
function snowCap(threshold = 0.55, snow = 0xf2f6fb) {
  const sc = new THREE.Color(snow);
  return (nx, ny, nz, x, y, z, c) => (ny > threshold ? sc : c);
}
