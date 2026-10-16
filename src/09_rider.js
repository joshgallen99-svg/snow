// ============================================================================
//  rider — procedural low-poly snowboarder. Joints are solved in board space
//  from pose parameters, or simulated as a verlet ragdoll after a crash; the
//  same part groups draw both. Gear colors are baked into vertex colors and
//  rebuilt when the gear changes.
// ============================================================================
const J = { head: 0, neck: 1, pelvis: 2, lHand: 3, rHand: 4, lElbow: 5, rElbow: 6, lKnee: 7, rKnee: 8, lFoot: 9, rFoot: 10 };
// where each hand goes for each grab, in board space before mirroring for stance (L = front hand for regular)
const RIDER_GRABS = {
  indy: { R: [-0.05, 0.15, 0.15] }, melon: { L: [0.05, 0.15, -0.15] }, tail: { R: [-0.66, 0.14, 0.02] }, nose: { L: [0.66, 0.14, 0.02] },
  truck: { L: [0.08, 0.15, -0.15], R: [-0.08, 0.15, 0.15] }, method: { L: [-0.02, 0.15, -0.16] }, japan: { L: [0.0, 0.15, 0.16] },
  stalefish: { R: [-0.12, 0.15, -0.16] }, mute: { L: [0.12, 0.15, 0.16] }, crail: { R: [0.55, 0.15, 0.13] },
};
const NJ = 11;
let ENV_MAP = null; // set by the game once the sky has been captured

function boardTexture(design) {
  const [a, b] = design.top;
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = a; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = b; ctx.strokeStyle = b; ctx.lineWidth = 8;
    const p = design.pattern;
    if (p === 'stripe') { ctx.fillRect(0, h * 0.4, w, h * 0.2); ctx.fillRect(w * 0.2, 0, 14, h); ctx.fillRect(w * 0.8 - 14, 0, 14, h); }
    else if (p === 'blackout') { ctx.fillRect(0, h * 0.44, w, h * 0.12); ctx.fillRect(w * 0.12, 0, 6, h); ctx.fillRect(w * 0.88 - 6, 0, 6, h); ctx.globalAlpha = 0.25; ctx.fillStyle = '#ffffff'; ctx.font = '800 34px Outfit, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('KITAKAZE', w / 2, h * 0.24); ctx.globalAlpha = 1; }
    else if (p === 'chevron') { for (let x = -40; x < w; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 30, h / 2); ctx.lineTo(x, h); ctx.stroke(); } }
    else if (p === 'facets') { for (let i = 0; i < 14; i++) { ctx.globalAlpha = 0.3 + (i % 3) * 0.2; ctx.beginPath(); ctx.moveTo(i * 40, 0); ctx.lineTo(i * 40 + 70, h); ctx.lineTo(i * 40 - 20, h); ctx.fill(); } ctx.globalAlpha = 1; }
    else if (p === 'trees') { for (let x = 30; x < w; x += 52) { ctx.beginPath(); ctx.moveTo(x, 18); ctx.lineTo(x + 20, h - 22); ctx.lineTo(x - 20, h - 22); ctx.fill(); } }
    else if (p === 'wave') { ctx.lineWidth = 12; for (let k = 0; k < 3; k++) { ctx.beginPath(); for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * (0.3 + k * 0.2) + Math.sin(x / 40 + k) * 12); ctx.stroke(); } }
    else if (p === 'sun') { ctx.beginPath(); ctx.arc(w / 2, h, h * 0.75, Math.PI, 0); ctx.fill(); for (let i = 0; i < 5; i++) ctx.fillRect(0, h * 0.12 + i * 14, w, 4); }
    else if (p === 'stars') { const r = mulberry32(3); for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.arc(r() * w, r() * h, 1 + r() * 3, 0, TAU); ctx.fill(); } }
    else if (p === 'circle') { ctx.beginPath(); ctx.arc(w / 2, h / 2, h * 0.36, 0, TAU); ctx.fill(); ctx.fillRect(0, h / 2 - 3, w, 6); }
    // sidewall wear
    ctx.globalAlpha = 0.18; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, 4); ctx.fillRect(0, h - 4, w, 4); ctx.globalAlpha = 1;
  });
}

function boardGeometry() {
  // rounded nose and tail outline, extruded thin
  const s = new THREE.Shape(), L = 0.78, W = 0.145, r = 0.13;
  s.moveTo(-L + r, -W); s.lineTo(L - r, -W); s.quadraticCurveTo(L, -W, L, -W + r * 0.9); s.lineTo(L, W - r * 0.9); s.quadraticCurveTo(L, W, L - r, W);
  s.lineTo(-L + r, W); s.quadraticCurveTo(-L, W, -L, W - r * 0.9); s.lineTo(-L, -W + r * 0.9); s.quadraticCurveTo(-L, -W, -L + r, -W);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 5 });
  g.rotateX(-Math.PI / 2); // shape XY → board XZ, thickness up
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + L) / (2 * L), (p.getZ(i) + W) / (2 * W));
  // curl the nose and tail up, and a touch of camber
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), ax = Math.abs(x);
    let y = p.getY(i) + 0.006 * Math.cos((x / L) * Math.PI * 0.5);
    if (ax > L - 0.2) y += Math.pow((ax - (L - 0.2)) / 0.2, 2) * 0.07;
    p.setY(i, y);
  }
  g.computeVertexNormals();
  return g;
}

// box whose top face is a different size than its bottom (jackets, gloves)
function taperBox(wb, wt, h, db, dt, zShiftTop = 0) {
  const g = new THREE.BoxGeometry(1, h, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const top = p.getY(i) > 0;
    p.setX(i, p.getX(i) * (top ? wt : wb));
    p.setZ(i, p.getZ(i) * (top ? dt : db) + (top ? zShiftTop : 0));
  }
  g.computeVertexNormals();
  return g;
}

class RiderModel {
  constructor(opts = {}) {
    this.group = new THREE.Group();
    this.ghost = !!opts.ghost;
    this.mats = {
      cloth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 }),
      gloss: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.05 }),
      lens: new THREE.MeshStandardMaterial({ color: 0xe0201c, roughness: 0.06, metalness: 0.9, emissive: 0x3a0505 }),
      board: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0.08 }),
      base: new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.5 }),
    };
    if (this.ghost) {
      const g = new THREE.MeshStandardMaterial({ color: 0x9fd4ff, emissive: 0x2a5a8a, transparent: true, opacity: 0.32, depthWrite: false });
      for (const k in this.mats) this.mats[k] = g;
    }
    this.parts = {};
    const names = ['torso', 'hips', 'lShoulder', 'rShoulder', 'lUpper', 'rUpper', 'lElbowJ', 'rElbowJ', 'lFore', 'rFore', 'lMitt', 'rMitt', 'lThigh', 'rThigh', 'lKneeJ', 'rKneeJ', 'lShin', 'rShin', 'lBoot', 'rBoot', 'head', 'board'];
    for (const n of names) {
      const g = new THREE.Group(); g.matrixAutoUpdate = false;
      this.group.add(g); this.parts[n] = g;
    }
    this.J = Array.from({ length: NJ }, () => new V3());
    this.bx = new V3(1, 0, 0); this.by = new V3(0, 1, 0); this.bz = new V3(0, 0, 1); this.bpos = new V3();
    this.stance = 1; // 1 regular (left foot toward nose), -1 goofy
    this.pose = { crouch: 0.2, lean: 0, tuck: 0, arms: 0.3, grab: null, grabAmt: 0, twist: 0, sit: 0, brake: 0, look: 0.7, wave: 0, turn: 0, react: 0 };
    this.ragdoll = null;
    this.buildParts(this.palette({}));
  }
  palette(gear) {
    const find = (list, id) => list.find((x) => x.id === id) || list[0];
    const jacket = new THREE.Color(find(JACKETS, gear.jacket).c), pants = new THREE.Color(find(PANTS, gear.pants).c);
    const helmet = new THREE.Color(find(HELMETS, gear.helmet).c);
    const shade = (c, k) => c.clone().multiplyScalar(k);
    const lum = (c) => c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
    // trim reads lighter on dark gear and darker on light gear
    const trim = (c) => (lum(c) < 0.12 ? c.clone().lerp(new THREE.Color(0x4a4f58), 0.5) : shade(c, 0.72));
    return {
      jacket, jacketTrim: trim(jacket), pants, pantsTrim: trim(pants), helmet, helmetTrim: trim(helmet),
      glove: new THREE.Color(0x111215), gloveTrim: new THREE.Color(0x2a2c31), boot: new THREE.Color(0x141519), sole: new THREE.Color(0x2c2e33),
      gaiter: new THREE.Color(0x151619), zip: new THREE.Color(0x8a8f98), skin: new THREE.Color(0xd9a988), accent: new THREE.Color(find(GOGGLES, gear.goggles).frameAccent || 0xd32424),
      binding: new THREE.Color(0x17181c), buckle: new THREE.Color(0xd32424), strap: new THREE.Color(0x1d1f23),
    };
  }
  setGear(gear) {
    if (this.ghost) return;
    const find = (list, id) => list.find((x) => x.id === id) || list[0];
    const gg = find(GOGGLES, gear.goggles);
    this.mats.lens.color.set(gg.lens); this.mats.lens.emissive.set(gg.glow);
    const bd = find(BOARDS, gear.board);
    if (this.mats.board.map) this.mats.board.map.dispose();
    this.mats.board.map = boardTexture(bd); this.mats.board.needsUpdate = true;
    this.buildParts(this.palette(gear));
  }
  applyEnv() {
    if (this.ghost || !ENV_MAP) return;
    for (const k of ['lens', 'gloss', 'board']) { this.mats[k].envMap = ENV_MAP; this.mats[k].needsUpdate = true; }
    this.mats.lens.envMapIntensity = 1.4; this.mats.gloss.envMapIntensity = 0.5; this.mats.board.envMapIntensity = 0.4;
  }

  // ---- geometry: each part is a group of meshes (cloth / gloss / lens) ---------------
  buildParts(P) {
    const set = (name, layers) => {
      const g = this.parts[name];
      for (const c of [...g.children]) { g.remove(c); if (c.geometry && c.userData.own) c.geometry.dispose(); }
      for (const [matKey, builder] of layers) {
        if (!builder || !builder.count) continue;
        const m = new THREE.Mesh(builder.build(), this.mats[matKey]);
        m.userData.own = true; m.castShadow = !this.ghost; m.receiveShadow = !this.ghost;
        g.add(m);
      }
    };
    const B = () => new GeoBuilder({ smooth: true });
    const cap = (r, len, rs = 14) => new THREE.CapsuleGeometry(r, len, 5, rs);
    const ball = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
    const tube = (rt, rb, h, rs = 16) => new THREE.CylinderGeometry(rt, rb, h, rs, 1);
    // torso: origin at chest center, x = shoulder line, y up, z = facing. A soft padded shell.
    {
      const c = B();
      c.add(cap(0.19, 0.2, 18), { y: 0.0, sx: 1.08, sz: 0.68, color: P.jacket });           // jacket body
      c.add(cap(0.2, 0.06, 18), { y: -0.2, sx: 1.04, sz: 0.7, color: P.jacketTrim });          // cinched hem
      c.add(ball(0.2), { y: 0.16, sx: 1.1, sy: 0.55, sz: 0.68, color: P.jacket });              // chest and shoulders
      c.add(tube(0.1, 0.12, 0.1), { y: 0.3, z: 0.0, color: P.jacket });                         // collar
      c.add(ball(0.13), { y: 0.25, z: -0.13, sx: 1.25, sy: 0.75, sz: 0.7, color: P.jacket });   // rolled hood
      c.add(G.box(0.1, 0.075, 0.03), { x: 0.09, y: 0.11, z: 0.125, color: P.jacketTrim });        // chest pocket flap
      c.add(G.box(0.05, 0.032, 0.02), { x: -0.1, y: 0.15, z: 0.13, color: P.accent });           // logo patch
      const z = B();
      z.add(G.box(0.014, 0.5, 0.02), { y: 0.0, z: 0.13, color: P.zip });                       // zipper
      z.add(G.box(0.028, 0.036, 0.02), { y: 0.24, z: 0.136, color: P.zip });                    // zip pull
      set('torso', [['cloth', c], ['gloss', z]]);
    }
    {
      const c = B();
      c.add(ball(0.19), { sx: 1.0, sy: 0.62, sz: 0.72, color: P.pants });
      c.add(tube(0.185, 0.19, 0.05), { y: 0.08, sz: 0.72, color: P.pantsTrim });                 // waistband
      set('hips', [['cloth', c]]);
    }
    for (const s of ['l', 'r']) {
      const sh = B(); sh.add(ball(0.082), { color: P.jacket });
      set(s + 'Shoulder', [['cloth', sh]]);
      const up = B(); up.add(tube(0.072, 0.064, 1), { color: P.jacket });
      set(s + 'Upper', [['cloth', up]]);
      const el = B(); el.add(ball(0.066), { color: P.jacket });
      set(s + 'ElbowJ', [['cloth', el]]);
      const fo = B(); fo.add(tube(0.064, 0.056, 1), { color: P.jacket });
      fo.add(tube(0.069, 0.066, 0.32), { y: 0.35, color: P.glove });                          // glove gauntlet
      fo.add(tube(0.072, 0.072, 0.06), { y: 0.21, color: P.gloveTrim });                       // cinch
      set(s + 'Fore', [['cloth', fo]]);
      const mi = B(); mi.add(ball(0.062), { sx: 0.95, sy: 1.2, sz: 0.8, color: P.glove });
      mi.add(cap(0.022, 0.04, 8), { x: 0.05, y: -0.005, z: 0.03, rz: -0.6, color: P.glove });  // thumb
      set(s + 'Mitt', [['cloth', mi]]);
      const th = B(); th.add(tube(0.108, 0.092, 1), { color: P.pants });
      th.add(ball(0.05), { x: 0.095, y: -0.05, sy: 2.4, sx: 0.5, color: P.pants });            // soft cargo pocket
      set(s + 'Thigh', [['cloth', th]]);
      const kn = B(); kn.add(ball(0.094), { color: P.pants });
      kn.add(ball(0.06), { z: 0.05, sz: 0.5, color: P.pantsTrim });                             // knee patch
      set(s + 'KneeJ', [['cloth', kn]]);
      const sn = B(); sn.add(tube(0.092, 0.086, 1), { color: P.pants });
      sn.add(tube(0.1, 0.112, 0.3), { y: 0.35, color: P.pants });                               // baggy cuff over the boot
      sn.add(tube(0.114, 0.114, 0.05), { y: 0.49, color: P.pantsTrim });
      set(s + 'Shin', [['cloth', sn]]);
      const bo = B();
      bo.add(cap(0.072, 0.15, 12), { rx: Math.PI / 2, sx: 1.05, sy: 1, sz: 0.95, color: P.boot });  // rounded boot
      bo.add(G.box(0.15, 0.03, 0.31), { y: -0.065, color: P.sole });
      for (let k = 0; k < 3; k++) bo.add(G.box(0.07, 0.012, 0.014), { y: 0.066, z: -0.01 + k * 0.035, color: P.zip }); // laces
      set(s + 'Boot', [['gloss', bo]]);
    }
    // head: round helmet with vents and ear pads, curved red mirror goggles, neck gaiter
    {
      const shell = B();
      shell.add(new THREE.SphereGeometry(0.16, 24, 16, 0, TAU, 0, Math.PI * 0.62), { sy: 0.96, color: P.helmet });
      shell.add(new THREE.CylinderGeometry(0.163, 0.163, 0.04, 28, 1, true, -1.25, 2.5), { y: 0.0, ry: Math.PI, color: 0x101114 }); // strap round the back
      shell.add(G.box(0.05, 0.02, 0.012), { y: 0.0, z: -0.163, color: P.accent });                 // strap logo
      shell.add(new THREE.SphereGeometry(0.1615, 24, 6, -0.25, 0.5, 0.1, 0.9), { color: P.helmetTrim }); // vent strip over the crown
      for (const sd of [-1, 1]) shell.add(ball(0.055), { x: sd * 0.145, y: -0.06, sx: 0.5, color: P.helmetTrim });                  // ear pads
      const soft = B();
      soft.add(tube(0.085, 0.1, 0.12, 20), { y: -0.19, color: P.gaiter });                        // neck gaiter
      soft.add(ball(0.128, 22, 14), { y: -0.065, sx: 0.98, sy: 0.82, sz: 0.96, color: P.gaiter });  // face mask over the chin and nose
      soft.add(G.box(0.12, 0.03, 0.03), { y: -0.058, z: 0.112, color: P.skin });                    // a strip of face under the goggles
      // goggle frame: a curved band hugging the front of the helmet
      // the frame and lens are bands of a sphere, so the mirror curves both ways and catches the sky
      soft.add(new THREE.SphereGeometry(0.172, 32, 6, Math.PI / 2 - 1.15, 2.3, Math.PI / 2 - 0.27, 0.54), { y: -0.005, color: 0x0d0e10 });
      const lens = B();
      lens.add(new THREE.SphereGeometry(0.178, 32, 8, Math.PI / 2 - 1.02, 2.04, Math.PI / 2 - 0.2, 0.4), { y: -0.004, color: 0xffffff });
      set('head', [['gloss', shell], ['cloth', soft], ['lens', lens]]);
    }
    // board with bindings: baseplates, highbacks, ankle and toe straps, red buckles
    {
      const g = this.parts.board;
      for (const c of [...g.children]) { g.remove(c); if (c.userData.own) c.geometry.dispose(); }
      const top = new THREE.Mesh(this.boardGeo || (this.boardGeo = boardGeometry()), this.mats.board);
      top.castShadow = !this.ghost;
      g.add(top);
      const bind = B(), buckles = B();
      for (const sd of [-1, 1]) {
        const x = sd * 0.27;
        bind.add(G.box(0.2, 0.02, 0.27), { x, y: 0.035, color: P.binding });
        bind.add(G.box(0.19, 0.22, 0.024), { x, y: 0.15, z: -0.14, rx: -0.22, color: P.binding });   // highback
        bind.add(G.box(0.21, 0.045, 0.11), { x, y: 0.135, z: -0.005, color: P.strap });              // ankle strap
        bind.add(G.box(0.2, 0.035, 0.05), { x, y: 0.09, z: 0.11, color: P.strap });                  // toe strap
        for (const s2 of [-1, 1]) buckles.add(G.box(0.03, 0.04, 0.03), { x: x + s2 * 0.105, y: 0.12, z: 0.0, color: P.buckle });
      }
      const bm = new THREE.Mesh(bind.build(), this.mats.gloss); bm.userData.own = true; bm.castShadow = !this.ghost;
      const km = new THREE.Mesh(buckles.build(), this.mats.cloth); km.userData.own = true;
      g.add(bm, km);
    }
  }

  // board frame: origin at contact, bx = nose, by = up, bz = toe side
  setBoard(pos, bx, by) {
    this.bpos.copy(pos); this.bx.copy(bx).normalize();
    this.by.copy(by).addScaledVector(this.bx, -this.by.dot(this.bx)).normalize();
    this.bz.crossVectors(this.bx, this.by);
  }
  local(out, x, y, z) {
    return out.copy(this.bpos).addScaledVector(this.bx, x).addScaledVector(this.by, y).addScaledVector(this.bz, z);
  }

  solvePose(dt) {
    const P = this.pose, s = this.stance, Jt = this.J;
    const c = clamp(P.crouch + P.react, 0, 1), lean = clamp(P.lean, -1, 1);
    const tuckUp = P.grabAmt * 0.32;
    // feet bound to the board
    this.local(Jt[J.lFoot], 0.27 * s, 0.11, 0);
    this.local(Jt[J.rFoot], -0.27 * s, 0.11, 0);
    if (P.sit > 0.01) return this.solveSit();
    // pelvis: low when crouched, shifts over the toe or heel edge with lean
    const ph = 0.93 - c * 0.3 - tuckUp - P.tuck * 0.08;
    const pz = lean * 0.2 - P.brake * 0.12 - c * 0.04;
    this.local(Jt[J.pelvis], P.twist * 0.02 + P.turn * 0.03 * s + (P.press || 0) * 0.2, ph + Math.abs(P.press || 0) * 0.04, pz);
    // torso tilts forward with crouch and tuck, and twists toward the turn
    const tilt = 0.18 + c * 0.42 + P.tuck * 0.35 + lean * 0.25 - P.brake * 0.25;
    const tx = Math.sin(P.twist) * 0.25 + P.turn * 0.12;
    _v.copy(this.by).multiplyScalar(Math.cos(tilt)).addScaledVector(this.bz, Math.sin(tilt)).addScaledVector(this.bx, tx * s).normalize();
    const up = _v.clone();
    Jt[J.neck].copy(Jt[J.pelvis]).addScaledVector(up, 0.54);
    Jt[J.head].copy(Jt[J.neck]).addScaledVector(up, 0.2).addScaledVector(this.by, 0.03);
    // knees: two-bone IK toward the toe side
    this.ik(Jt[J.lKnee], new V3().copy(Jt[J.pelvis]).addScaledVector(this.bx, 0.1 * s), Jt[J.lFoot], 0.46, 0.46, this.bz);
    this.ik(Jt[J.rKnee], new V3().copy(Jt[J.pelvis]).addScaledVector(this.bx, -0.1 * s), Jt[J.rFoot], 0.46, 0.46, this.bz);
    // hands
    const shL = new V3().copy(Jt[J.neck]).addScaledVector(this.bx, 0.2 * s).addScaledVector(this.by, -0.05);
    const shR = new V3().copy(Jt[J.neck]).addScaledVector(this.bx, -0.2 * s).addScaledVector(this.by, -0.05);
    const arms = clamp(P.arms, 0, 1);
    const handL = new V3(), handR = new V3();
    const sw = Math.sin(P.wave) * 0.06;
    // relaxed: hands out along the board for balance; in a carve the front hand leads into the turn
    const lead = P.turn * 0.18;
    handL.copy(shL).addScaledVector(this.bx, (0.25 + arms * 0.25) * s).addScaledVector(this.by, -0.42 + arms * 0.32 + sw).addScaledVector(this.bz, 0.12 + P.tuck * 0.25 + lead);
    handR.copy(shR).addScaledVector(this.bx, -(0.25 + arms * 0.2) * s).addScaledVector(this.by, -0.42 + arms * 0.3 - sw).addScaledVector(this.bz, 0.08 + P.tuck * 0.25 - lead);
    if (P.grab && P.grabAmt > 0.01) {
      const t = new V3(), g = P.grab;
      // grab targets on the board edges (board space: x along the board, z toward the toe edge)
      const G = RIDER_GRABS[g] || RIDER_GRABS.indy;
      if (G.L) { this.local(t, G.L[0] * s, G.L[1], G.L[2]); handL.lerp(t, P.grabAmt); }
      if (G.R) { this.local(t, G.R[0] * s, G.R[1], G.R[2]); handR.lerp(t, P.grabAmt); }
    }
    Jt[J.lHand].copy(handL); Jt[J.rHand].copy(handR);
    this.ik(Jt[J.lElbow], shL, handL, 0.3, 0.3, new V3().copy(this.by).multiplyScalar(-0.5).addScaledVector(this.bz, -0.6).addScaledVector(this.bx, 0.3 * s));
    this.ik(Jt[J.rElbow], shR, handR, 0.3, 0.3, new V3().copy(this.by).multiplyScalar(-0.5).addScaledVector(this.bz, -0.6).addScaledVector(this.bx, -0.3 * s));
  }
  solveSit() {
    const Jt = this.J, s = this.stance;
    // sitting on a chair: the seat is ~0.5 above the board when the legs dangle
    this.local(Jt[J.pelvis], 0, 0.62, -0.32);
    Jt[J.neck].copy(Jt[J.pelvis]).addScaledVector(this.by, 0.53).addScaledVector(this.bz, -0.05);
    Jt[J.head].copy(Jt[J.neck]).addScaledVector(this.by, 0.21);
    this.local(Jt[J.lKnee], 0.1 * s, 0.6, 0.12); this.local(Jt[J.rKnee], -0.1 * s, 0.6, 0.12);
    this.local(Jt[J.lFoot], 0.18 * s, 0.12, 0.16); this.local(Jt[J.rFoot], -0.14 * s, 0.12, 0.16);
    this.local(Jt[J.lHand], 0.22 * s, 0.75, 0.1); this.local(Jt[J.rHand], -0.22 * s, 0.75, 0.1);
    this.local(Jt[J.lElbow], 0.24 * s, 0.85, -0.15); this.local(Jt[J.rElbow], -0.24 * s, 0.85, -0.15);
  }
  ik(out, a, b, l1, l2, pole) {
    pole = pole.clone(); a = a.clone();
    const d = new V3().subVectors(b, a); const len = d.length();
    const L = clamp(len, 0.05, l1 + l2 - 1e-3);
    const ax = d.divideScalar(len || 1);
    const x = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    const p = pole.clone().addScaledVector(ax, -pole.dot(ax)).normalize();
    out.copy(a).addScaledVector(ax, x).addScaledVector(p, h);
  }

  // place a unit-height part between two points; the side hint keeps it from twisting
  placeSeg(part, a, b, side) {
    const y = new V3().subVectors(b, a); const len = y.length() || 1e-3; y.divideScalar(len);
    const x = new V3().copy(side).addScaledVector(y, -side.dot(y)).normalize();
    const z = new V3().crossVectors(x, y);
    part.matrix.makeBasis(x, y, z);
    part.matrix.scale(_s.set(1, len, 1));
    part.matrix.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    part.matrixWorldNeedsUpdate = true;
  }
  placeAt(part, p, x, y, off) {
    const z = new V3().crossVectors(x, y);
    part.matrix.makeBasis(x, y, z);
    part.matrix.setPosition(p.x + (off ? off.x : 0), p.y + (off ? off.y : 0), p.z + (off ? off.z : 0));
    part.matrixWorldNeedsUpdate = true;
  }

  draw() {
    const Jt = this.J, P = this.parts;
    let bx, by, bz, bpos;
    if (this.ragdoll) {
      // board frame from the ragdoll feet and knees
      bx = new V3().subVectors(Jt[J.lFoot], Jt[J.rFoot]).multiplyScalar(this.stance).normalize();
      const knees = new V3().addVectors(Jt[J.lKnee], Jt[J.rKnee]).multiplyScalar(0.5);
      const feet = new V3().addVectors(Jt[J.lFoot], Jt[J.rFoot]).multiplyScalar(0.5);
      bz = knees.sub(feet); bz.addScaledVector(bx, -bz.dot(bx)).normalize();
      by = new V3().crossVectors(bz, bx).normalize();
      bpos = feet.addScaledVector(by, -0.11);
    } else { bx = this.bx; by = this.by; bz = this.bz; bpos = this.bpos; }
    this.placeAt(P.board, bpos.clone().addScaledVector(by, 0.006), bx, by);
    const side = bx;
    const up = new V3().subVectors(Jt[J.neck], Jt[J.pelvis]).normalize();
    const sideO = new V3().copy(side).addScaledVector(up, -side.dot(up)).normalize();
    const mid = new V3().addVectors(Jt[J.pelvis], Jt[J.neck]).multiplyScalar(0.5).addScaledVector(up, 0.02);
    this.placeAt(P.torso, mid, sideO, up);
    const fwd = new V3().crossVectors(side, up).normalize();
    this.placeAt(P.hips, Jt[J.pelvis], sideO, up);
    const s = this.stance;
    const hipL = new V3().copy(Jt[J.pelvis]).addScaledVector(side, 0.1 * s), hipR = new V3().copy(Jt[J.pelvis]).addScaledVector(side, -0.1 * s);
    this.placeSeg(P.lThigh, hipL, Jt[J.lKnee], side); this.placeSeg(P.rThigh, hipR, Jt[J.rKnee], side);
    this.placeSeg(P.lShin, Jt[J.lKnee], Jt[J.lFoot], side); this.placeSeg(P.rShin, Jt[J.rKnee], Jt[J.rFoot], side);
    // round joints hide the seams where the limb segments meet
    const kneeFwd = (k, f) => { const y = new V3().subVectors(Jt[k], Jt[f]).normalize(); const x = new V3().copy(side).addScaledVector(y, -side.dot(y)).normalize(); return [x, y]; };
    const [klx, kly] = kneeFwd(J.lKnee, J.lFoot), [krx, kry] = kneeFwd(J.rKnee, J.rFoot);
    this.placeAt(P.lKneeJ, Jt[J.lKnee], klx, kly); this.placeAt(P.rKneeJ, Jt[J.rKnee], krx, kry);
    const shL = new V3().copy(Jt[J.neck]).addScaledVector(sideO, 0.2 * s).addScaledVector(up, -0.06);
    const shR = new V3().copy(Jt[J.neck]).addScaledVector(sideO, -0.2 * s).addScaledVector(up, -0.06);
    this.placeAt(P.lShoulder, shL, sideO, up); this.placeAt(P.rShoulder, shR, sideO, up);
    this.placeSeg(P.lUpper, shL, Jt[J.lElbow], fwd); this.placeSeg(P.rUpper, shR, Jt[J.rElbow], fwd);
    this.placeSeg(P.lFore, Jt[J.lElbow], Jt[J.lHand], fwd); this.placeSeg(P.rFore, Jt[J.rElbow], Jt[J.rHand], fwd);
    this.placeAt(P.lElbowJ, Jt[J.lElbow], sideO, up); this.placeAt(P.rElbowJ, Jt[J.rElbow], sideO, up);
    // mitts point along the forearm
    for (const [part, e, h] of [[P.lMitt, J.lElbow, J.lHand], [P.rMitt, J.rElbow, J.rHand]]) {
      const ay = new V3().subVectors(Jt[h], Jt[e]).normalize();
      const ax = new V3().copy(fwd).addScaledVector(ay, -fwd.dot(ay)).normalize();
      this.placeAt(part, Jt[h], ax, ay, ay.clone().multiplyScalar(0.03));
    }
    // boots sit in the bindings
    this.placeAt(P.lBoot, Jt[J.lFoot], bx, by, by.clone().multiplyScalar(-0.025));
    this.placeAt(P.rBoot, Jt[J.rFoot], bx, by, by.clone().multiplyScalar(-0.025));
    // head looks partly toward the nose (direction of travel)
    const hy = new V3().subVectors(Jt[J.head], Jt[J.neck]).normalize();
    const look = this.ragdoll ? 0 : this.pose.look;
    const faceDir = new V3().copy(fwd).multiplyScalar(1 - look).addScaledVector(bx, look * s * (this.pose.lookDir || 1)).normalize();
    faceDir.addScaledVector(hy, -faceDir.dot(hy)).normalize();
    const hx = new V3().crossVectors(hy, faceDir).normalize();
    this.placeAt(P.head, Jt[J.head], hx, hy);
  }

  // ---- ragdoll ----------------------------------------------------------------
  startRagdoll(vel, spin) {
    const Jt = this.J;
    const prev = Jt.map((p) => p.clone().addScaledVector(vel, -1 / 120));
    // add tumble: rotate the previous positions around the center of mass
    const com = new V3(); for (const p of Jt) com.add(p); com.divideScalar(NJ);
    for (let i = 0; i < NJ; i++) {
      const r = new V3().subVectors(Jt[i], com);
      prev[i].sub(new V3().crossVectors(spin, r).multiplyScalar(1 / 120));
    }
    const C = [];
    const link = (a, b, k = 1, mode = 0) => C.push([a, b, Jt[a].distanceTo(Jt[b]), k, mode]);
    link(J.head, J.neck); link(J.neck, J.pelvis); link(J.head, J.pelvis, 0.6);
    link(J.neck, J.lElbow); link(J.lElbow, J.lHand); link(J.neck, J.rElbow); link(J.rElbow, J.rHand);
    link(J.pelvis, J.lKnee); link(J.lKnee, J.lFoot); link(J.pelvis, J.rKnee); link(J.rKnee, J.rFoot);
    link(J.lFoot, J.rFoot); link(J.lKnee, J.rFoot, 0.25); link(J.rKnee, J.lFoot, 0.25);
    link(J.pelvis, J.lFoot, 0.5, 1); link(J.pelvis, J.rFoot, 0.5, 1); link(J.lHand, J.pelvis, 0.2, 1); link(J.rHand, J.pelvis, 0.2, 1);
    this.ragdoll = { prev, C, t: 0, still: 0, col: [], colT: 0 };
  }
  stepRagdoll(dt) {
    const R = this.ragdoll, Jt = this.J;
    R.t += dt;
    let ke = 0;
    for (let i = 0; i < NJ; i++) {
      const p = Jt[i], q = R.prev[i];
      const vx = (p.x - q.x) * 0.995, vy = (p.y - q.y) * 0.995, vz = (p.z - q.z) * 0.995;
      q.copy(p);
      p.x += vx; p.y += vy - 9.81 * dt * dt; p.z += vz;
      ke += vx * vx + vy * vy + vz * vz;
    }
    // obstacles near the body (refreshed a few times a second)
    R.colT -= dt;
    if (R.colT <= 0) { R.colT = 0.1; World.queryColliders(Jt[J.pelvis].x, Jt[J.pelvis].z, 3, R.col); }
    for (let it = 0; it < 6; it++) {
      for (const [a, b, rest, k, mode] of R.C) {
        const pa = Jt[a], pb = Jt[b];
        const d = _v.subVectors(pb, pa); const l = d.length() || 1e-6;
        if (mode === 1 && l < rest) continue; // max-length only
        const diff = ((l - rest) / l) * 0.5 * k;
        pa.addScaledVector(d, diff); pb.addScaledVector(d, -diff);
      }
      for (let i = 0; i < NJ; i++) {
        const p = Jt[i], q = R.prev[i];
        // trees, rocks, buildings
        for (const c of R.col) {
          if (p.y > c.top) continue;
          const n = World.colliderPush(c, p.x, p.z, 0.1);
          if (n) { p.x += n.x; p.z += n.z; q.x = lerp(q.x, p.x, 0.5); q.z = lerp(q.z, p.z, 0.5); }
        }
        // the snow
        const g = World.groundHeight(p.x, p.z) + (i === J.head ? 0.14 : 0.07);
        if (p.y < g) {
          p.y = g;
          q.x = lerp(q.x, p.x, 0.12); q.z = lerp(q.z, p.z, 0.12);
          if (q.y < p.y - 0.02) q.y = p.y - (q.y - p.y) * -0.15;
        }
      }
    }
    const v = Math.sqrt(ke / NJ) / dt;
    R.still = v < 0.6 ? R.still + dt : 0;
    return R;
  }
  stopRagdoll() { this.ragdoll = null; }
}
