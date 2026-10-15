// ============================================================================
//  post — HDR scene target, lift hover outline (white inside, black outside),
//  speed blur, ACES tone mapping, grade, vignette, grain, letterbox
// ============================================================================
const Post = {
  init(renderer) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const isGL2 = renderer.capabilities.isWebGL2;
    // a 24-bit depth texture: without it multisampled targets fall back to 16-bit depth,
    // which can't separate the trail-map lines from the ground at map distances
    const depthTexture = new THREE.DepthTexture(size.x, size.y, THREE.UnsignedIntType);
    this.sceneRT = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: isGL2 ? 4 : 0, depthTexture });
    this.maskRT = new THREE.WebGLRenderTarget(Math.ceil(size.x / 2), Math.ceil(size.y / 2), { depthBuffer: true });
    this.maskMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    // bloom: bright pass at quarter resolution, blurred, added before tone mapping
    const bw = Math.ceil(size.x / 4), bh = Math.ceil(size.y / 4);
    this.bloomA = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType, depthBuffer: false });
    this.bloomB = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType, depthBuffer: false });
    const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    this.brightMat = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: this.sceneRT.texture }, uExposure: { value: 1 }, uThr: { value: 1.1 } }, vertexShader: vs, depthTest: false, depthWrite: false,
      fragmentShader: 'uniform sampler2D tScene; uniform float uExposure, uThr; varying vec2 vUv; void main(){ vec3 c = texture2D(tScene, vUv).rgb * uExposure; float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); gl_FragColor = vec4(c * smoothstep(uThr, uThr + 0.8, l), 1.0); }',
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: vs, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tSrc, vUv).rgb * 0.227;
          c += (texture2D(tSrc, vUv + uDir * 1.385).rgb + texture2D(tSrc, vUv - uDir * 1.385).rgb) * 0.316;
          c += (texture2D(tSrc, vUv + uDir * 3.231).rgb + texture2D(tSrc, vUv - uDir * 3.231).rgb) * 0.07;
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.uni = {
      tScene: { value: this.sceneRT.texture }, tMask: { value: this.maskRT.texture },
      uRes: { value: new THREE.Vector2(size.x, size.y) }, uSpeed: { value: 0 }, uExposure: { value: 0.9 },
      uOutline: { value: 0 }, uTime: U.uTime, uLetter: { value: 0 }, uSat: { value: 1.08 }, uVig: { value: 0.32 }, uGrade: { value: 0 }, uFade: { value: 0 },
      tBloom: { value: this.bloomA.texture }, uBloom: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uni, depthTest: false, depthWrite: false, toneMapped: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tScene, tMask, tBloom; uniform vec2 uRes; uniform float uSpeed, uExposure, uOutline, uTime, uLetter, uSat, uVig, uGrade, uFade, uBloom;
        varying vec2 vUv;
        vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0); }
        vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){
          vec2 uv = vUv;
          vec3 col = texture2D(tScene, uv).rgb;
          // radial speed blur toward the edges
          if (uSpeed > 0.01) {
            vec2 d = uv - 0.5; float r = length(d);
            vec3 acc = col; float k = uSpeed * 0.028;
            for (int i = 1; i <= 7; i++) acc += texture2D(tScene, uv - d * k * float(i) / 7.0).rgb;
            col = mix(col, acc / 8.0, smoothstep(0.12, 0.55, r));
          }
          col *= uExposure;
          col += texture2D(tBloom, uv).rgb * uBloom;
          col = aces(col);
          // grade: gentle saturation, cool shadows, warm highlights
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(vec3(l), col, uSat);
          col += vec3(-0.012, 0.0, 0.02) * (1.0 - l) + vec3(0.02, 0.008, -0.01) * l * uGrade;
          // hover outline from the half-res mask
          if (uOutline > 0.5) {
            vec2 px = 1.0 / uRes;
            float m = texture2D(tMask, uv).r, inner = 0.0, outer = 0.0;
            for (int i = 0; i < 16; i++) {
              float a = float(i) / 16.0 * 6.2831853;
              vec2 o = vec2(cos(a), sin(a));
              inner = max(inner, texture2D(tMask, uv + o * px * 2.2).r);
              outer = max(outer, texture2D(tMask, uv + o * px * 4.6).r);
            }
            col = mix(col, vec3(1.0), m * 0.22);
            if (m < 0.5) {
              if (inner > 0.5) col = vec3(1.0);
              else if (outer > 0.5) col = vec3(0.0);
            }
          }
          // vignette and film grain
          vec2 q = uv - 0.5;
          col *= 1.0 - uVig * dot(q, q) * 1.8;
          col = toSRGB(clamp(col, 0.0, 1.0));
          col += (h(uv * uRes + fract(uTime) * 91.7) - 0.5) * 0.022;
          // letterbox for slow-mo
          float bar = uLetter * 0.1;
          if (uv.y < bar || uv.y > 1.0 - bar) col = vec3(0.0);
          col = mix(col, vec3(0.02, 0.03, 0.05), uFade);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
    this.quad = quad; this.finalMat = mat;
  },
  resize(w, h) {
    this.sceneRT.setSize(w, h);
    this.maskRT.setSize(Math.ceil(w / 2), Math.ceil(h / 2));
    this.uni.uRes.value.set(w, h);
    this.bloomA.setSize(Math.ceil(w / 4), Math.ceil(h / 4)); this.bloomB.setSize(Math.ceil(w / 4), Math.ceil(h / 4));
  },
  pass(mat, target) { this.quad.material = mat; this.renderer.setRenderTarget(target); this.renderer.render(this.quadScene, this.quadCam); },
  render(scene, camera, outlineLayer) {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);
    this.uni.uOutline.value = 0;
    if (outlineLayer != null) {
      const bg = scene.background, fog = scene.fog;
      scene.background = null; scene.fog = null; scene.overrideMaterial = this.maskMat;
      const prev = camera.layers.mask;
      camera.layers.set(outlineLayer);
      r.setRenderTarget(this.maskRT);
      r.setClearColor(0x000000, 1); r.clear();
      r.render(scene, camera);
      camera.layers.mask = prev;
      scene.background = bg; scene.fog = fog; scene.overrideMaterial = null;
      this.uni.uOutline.value = 1;
    }
    if (this.uni.uBloom.value > 0.001) {
      this.brightMat.uniforms.uExposure.value = this.uni.uExposure.value;
      this.pass(this.brightMat, this.bloomA);
      const px = 1 / this.bloomA.width, py = 1 / this.bloomA.height;
      for (let i = 0; i < 2; i++) {
        this.blurMat.uniforms.tSrc.value = this.bloomA.texture; this.blurMat.uniforms.uDir.value.set(px * (i + 1), 0); this.pass(this.blurMat, this.bloomB);
        this.blurMat.uniforms.tSrc.value = this.bloomB.texture; this.blurMat.uniforms.uDir.value.set(0, py * (i + 1)); this.pass(this.blurMat, this.bloomA);
      }
    }
    this.quad.material = this.finalMat;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  },
};
