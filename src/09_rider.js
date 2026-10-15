// ============================================================================
//  rider — procedural low-poly snowboarder. Joints are solved in board space
//  from pose parameters, or simulated as a verlet ragdoll after a crash; the
//  same segment meshes draw both.
// ============================================================================
const J = { head: 0, neck: 1, pelvis: 2, lHand: 3, rHand: 4, lElbow: 5, rElbow: 6, lKnee: 7, rKnee: 8, lFoot: 9, rFoot: 10 };
const NJ = 11;

function boardTexture(design) {
  const [a, b] = design.top;
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = a; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = b; ctx.strokeStyle = b; ctx.lineWidth = 8;
    const p = design.pattern;
    if (p === 'stripe') { ctx.fillRect(0, h * 0.4, w, h * 0.2); ctx.fillRect(w * 0.2, 0, 14, h); ctx.fillRect(w * 0.8 - 14, 0, 14, h); }
    else if (p === 'chevron') { for (let x = -40; x < w; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 30, h / 2); ctx.lineTo(x, h); ctx.stroke(); } }
    else if (p === 'facets') { for (let i = 0; i < 14; i++) { ctx.globalAlpha = 0.3 + (i % 3) * 0.2; ctx.beginPath(); ctx.moveTo(i * 40, 0); ctx.lineTo(i * 40 + 70, h); ctx.lineTo(i * 40 - 20, h); ctx.fill(); } ctx.globalAlpha = 1; }
    else if (p === 'trees') { for (let x = 30; x < w; x += 52) { ctx.beginPath(); ctx.moveTo(x, 18); ctx.lineTo(x + 20, h - 22); ctx.lineTo(x - 20, h - 22); ctx.fill(); } }
    else if (p === 'wave') { ctx.lineWidth = 12; for (let k = 0; k < 3; k++) { ctx.beginPath(); for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * (0.3 + k * 0.2) + Math.sin(x / 40 + k) * 12); ctx.stroke(); } }
    else if (p === 'sun') { ctx.beginPath(); ctx.arc(w / 2, h, h * 0.75, Math.PI, 0); ctx.fill(); for (let i = 0; i < 5; i++) ctx.fillRect(0, h * 0.12 + i * 14, w, 4); }
    else if (p === 'stars') { const r = mulberry32(3); for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.arc(r() * w, r() * h, 1 + r() * 3, 0, TAU); ctx.fill(); } }
    else if (p === 'circle') { ctx.beginPath(); ctx.arc(w / 2, h / 2, h * 0.36, 0, TAU); ctx.fill(); ctx.fillRect(0, h / 2 - 3, w, 6); }
  });
}

function boardGeometry() {
  // rounded nose and tail outline, extruded thin
  const s = new THREE.Shape(), L = 0.78, W = 0.145, r = 0.13;
  s.moveTo(-L + r, -W); s.lineTo(L - r, -W); s.quadraticCurveTo(L, -W, L, -W + r * 0.9); s.lineTo(L, W - r * 0.9); s.quadraticCurveTo(L, W, L - r, W);
  s.lineTo(-L + r, W); s.quadraticCurveTo(-L, W, -L, W - r * 0.9); s.lineTo(-L, -W + r * 0.9); s.quadraticCurveTo(-L, -W, -L + r, -W);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: false, curveSegments: 4 });
  g.rotateX(-Math.PI / 2); // shape XY → board XZ, thickness up
  // uv: map x across the texture
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + L) / (2 * L), (p.getZ(i) + W) / (2 * W));
  // curl the nose and tail up
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), ax = Math.abs(x); if (ax > L - 0.2) p.setY(i, p.getY(i) + Math.pow((ax - (L - 0.2)) / 0.2, 2) * 0.07); }
  g.computeVertexNormals();
  return g;
}

class RiderModel {
  constructor(opts = {}) {
    this.group = new THREE.Group();
    this.ghost = !!opts.ghost;
    const mk = (c) => {
      const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, flatShading: true });
      if (this.ghost) { m.transparent = true; m.opacity = 0.35; m.depthWrite = false; m.color.set(0x9fd4ff); m.emissive = new THREE.Color(0x2a5a8a); }
      return m;
    };
    this.mats = { jacket: mk(0xff7a2f), pants: mk(0x2c3036), helmet: mk(0xeef0f2), dark: mk(0x1d2026), goggle: mk(0xff9a2a), skin: mk(0xe0b08e), board: null };
    if (!this.ghost) { this.mats.goggle.metalness = 0.6; this.mats.goggle.roughness = 0.2; }
    const seg = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = !this.ghost; m.matrixAutoUpdate = false; this.group.add(m); return m; };
    const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    this.parts = {
      torso: seg(B(0.4, 0.56, 0.25), this.mats.jacket),
      hood: seg(B(0.3, 0.12, 0.2), this.mats.jacket),
      hips: seg(B(0.34, 0.2, 0.24), this.mats.pants),
      lThigh: seg(B(0.16, 1, 0.17), this.mats.pants), rThigh: seg(B(0.16, 1, 0.17), this.mats.pants),
      lShin: seg(B(0.15, 1, 0.16), this.mats.pants), rShin: seg(B(0.15, 1, 0.16), this.mats.pants),
      lUpper: seg(B(0.12, 1, 0.12), this.mats.jacket), rUpper: seg(B(0.12, 1, 0.12), this.mats.jacket),
      lFore: seg(B(0.11, 1, 0.11), this.mats.jacket), rFore: seg(B(0.11, 1, 0.11), this.mats.jacket),
      lMitt: seg(B(0.12, 0.12, 0.1), this.mats.dark), rMitt: seg(B(0.12, 0.12, 0.1), this.mats.dark),
      lBoot: seg(B(0.15, 0.13, 0.3), this.mats.dark), rBoot: seg(B(0.15, 0.13, 0.3), this.mats.dark),
      head: seg(new THREE.IcosahedronGeometry(0.15, 1), this.mats.helmet),
      goggle: seg(B(0.22, 0.075, 0.07), this.mats.goggle),
      face: seg(B(0.16, 0.08, 0.06), this.mats.skin),
    };
    this.boardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.1 });
    if (this.ghost) Object.assign(this.boardMat, { transparent: true, opacity: 0.35, depthWrite: false });
    this.board = seg(boardGeometry(), this.boardMat);
    this.J = Array.from({ length: NJ }, () => new V3());
    this.bx = new V3(1, 0, 0); this.by = new V3(0, 1, 0); this.bz = new V3(0, 0, 1); this.bpos = new V3();
    this.stance = 1; // 1 regular (left foot toward nose), -1 goofy
    this.pose = { crouch: 0.2, lean: 0, tuck: 0, arms: 0.3, grab: null, grabAmt: 0, twist: 0, sit: 0, brake: 0, look: 0.7, wave: 0 };
    this.ragdoll = null;
  }
  setGear(gear) {
    if (this.ghost) return;
    const find = (list, id) => list.find((x) => x.id === id) || list[0];
    this.mats.jacket.color.set(find(JACKETS, gear.jacket).c);
    this.mats.pants.color.set(find(PANTS, gear.pants).c);
    this.mats.helmet.color.set(find(HELMETS, gear.helmet).c);
    const bd = find(BOARDS, gear.board);
    if (this.boardMat.map) this.boardMat.map.dispose();
    this.boardMat.map = boardTexture(bd); this.boardMat.needsUpdate = true;
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
    const c = clamp(P.crouch, 0, 1), lean = clamp(P.lean, -1, 1);
    const tuckUp = P.grabAmt * 0.32;
    // feet bound to the board
    const fy = 0.1;
    this.local(Jt[J.lFoot], 0.27 * s, fy, 0);
    this.local(Jt[J.rFoot], -0.27 * s, fy, 0);
    if (P.sit > 0.01) return this.solveSit();
    // pelvis: low when crouched, shifts over the toe or heel edge with lean
    const ph = 0.93 - c * 0.3 - tuckUp - P.tuck * 0.08;
    const pz = lean * 0.2 - P.brake * 0.12 - c * 0.04;
    this.local(Jt[J.pelvis], P.twist * 0.02, ph, pz);
    // torso tilts forward with crouch/tuck
    const tilt = 0.18 + c * 0.42 + P.tuck * 0.35 + lean * 0.25 - P.brake * 0.25;
    const tx = Math.sin(P.twist) * 0.25;
    _v.copy(this.by).multiplyScalar(Math.cos(tilt)).addScaledVector(this.bz, Math.sin(tilt)).addScaledVector(this.bx, tx * s).normalize();
    Jt[J.neck].copy(Jt[J.pelvis]).addScaledVector(_v, 0.54);
    Jt[J.head].copy(Jt[J.neck]).addScaledVector(_v, 0.2).addScaledVector(this.by, 0.03);
    // knees: two-bone IK toward the toe side
    const hipL = _v2.copy(Jt[J.pelvis]).addScaledVector(this.bx, 0.1 * s);
    this.ik(Jt[J.lKnee], hipL, Jt[J.lFoot], 0.46, 0.46, this.bz);
    const hipR = _v2.copy(Jt[J.pelvis]).addScaledVector(this.bx, -0.1 * s);
    this.ik(Jt[J.rKnee], hipR, Jt[J.rFoot], 0.46, 0.46, this.bz);
    // hands
    const shL = new V3().copy(Jt[J.neck]).addScaledVector(this.bx, 0.2 * s).addScaledVector(this.by, -0.05);
    const shR = new V3().copy(Jt[J.neck]).addScaledVector(this.bx, -0.2 * s).addScaledVector(this.by, -0.05);
    const arms = clamp(P.arms, 0, 1);
    const handL = new V3(), handR = new V3();
    // relaxed: hands out along the board for balance; tuck: hands in front of knees
    const sw = Math.sin(P.wave) * 0.08;
    handL.copy(shL).addScaledVector(this.bx, (0.25 + arms * 0.25) * s).addScaledVector(this.by, -0.42 + arms * 0.32 + sw).addScaledVector(this.bz, 0.12 + P.tuck * 0.25);
    handR.copy(shR).addScaledVector(this.bx, -(0.25 + arms * 0.2) * s).addScaledVector(this.by, -0.42 + arms * 0.3 - sw).addScaledVector(this.bz, 0.08 + P.tuck * 0.25);
    if (P.grab && P.grabAmt > 0.01) {
      const t = new V3(), g = P.grab;
      // grab targets on the board edges (board space), rear hand = right hand for regular
      if (g === 'indy') this.local(t, -0.05 * s, 0.14, 0.15);
      else if (g === 'melon') this.local(t, 0.05 * s, 0.14, -0.15);
      else if (g === 'tail') this.local(t, -0.66 * s, 0.14, 0.02);
      else this.local(t, 0.66 * s, 0.14, 0.02);
      const useLeft = g === 'melon' || g === 'nose';
      (useLeft ? handL : handR).lerp(t, P.grabAmt);
    }
    Jt[J.lHand].copy(handL); Jt[J.rHand].copy(handR);
    this.ik(Jt[J.lElbow], shL, handL, 0.3, 0.3, _v.copy(this.by).multiplyScalar(-0.5).addScaledVector(this.bz, -0.6).addScaledVector(this.bx, 0.3 * s));
    this.ik(Jt[J.rElbow], shR, handR, 0.3, 0.3, _v.copy(this.by).multiplyScalar(-0.5).addScaledVector(this.bz, -0.6).addScaledVector(this.bx, -0.3 * s));
  }
  solveSit() {
    const Jt = this.J, s = this.stance;
    // sitting on a chair: the chair seat is ~0.5 above the board when legs dangle
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

  // place a box segment between two points, side axis hint keeps it from twisting
  placeSeg(mesh, a, b, side, thick = 1) {
    const y = _v.copy(b).sub(a); const len = y.length() || 1e-3; y.divideScalar(len);
    const x = _v2.copy(side).addScaledVector(y, -side.dot(y)).normalize();
    const z = new V3().crossVectors(x, y);
    mesh.matrix.makeBasis(x, y, z);
    mesh.matrix.scale(_s.set(thick, len, thick));
    mesh.matrix.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    mesh.matrixWorldNeedsUpdate = true;
  }
  placeAt(mesh, p, x, y, off) {
    const z = new V3().crossVectors(x, y);
    mesh.matrix.makeBasis(x, y, z);
    mesh.matrix.setPosition(p.x + (off ? off.x : 0), p.y + (off ? off.y : 0), p.z + (off ? off.z : 0));
    mesh.matrixWorldNeedsUpdate = true;
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
      bpos = feet.addScaledVector(by, -0.1);
    } else { bx = this.bx; by = this.by; bz = this.bz; bpos = this.bpos; }
    // board
    this.board.matrix.makeBasis(bx, by, bz);
    this.board.matrix.setPosition(bpos.x + by.x * 0.005, bpos.y + by.y * 0.005, bpos.z + by.z * 0.005);
    this.board.matrixWorldNeedsUpdate = true;
    const side = bx;
    const up = new V3().subVectors(Jt[J.neck], Jt[J.pelvis]).normalize();
    const sideO = new V3().copy(side).addScaledVector(up, -side.dot(up)).normalize();
    const mid = new V3().addVectors(Jt[J.pelvis], Jt[J.neck]).multiplyScalar(0.5).addScaledVector(up, 0.02);
    this.placeAt(P.torso, mid, sideO, up);
    const fwd = new V3().crossVectors(side, up).normalize();
    this.placeAt(P.hips, Jt[J.pelvis], sideO, up);
    this.placeAt(P.hood, Jt[J.neck], sideO, up, fwd.clone().multiplyScalar(-0.06));
    const s = this.stance;
    const hipL = new V3().copy(Jt[J.pelvis]).addScaledVector(side, 0.1 * s), hipR = new V3().copy(Jt[J.pelvis]).addScaledVector(side, -0.1 * s);
    this.placeSeg(P.lThigh, hipL, Jt[J.lKnee], side); this.placeSeg(P.rThigh, hipR, Jt[J.rKnee], side);
    this.placeSeg(P.lShin, Jt[J.lKnee], Jt[J.lFoot], side); this.placeSeg(P.rShin, Jt[J.rKnee], Jt[J.rFoot], side);
    const shL = new V3().copy(Jt[J.neck]).addScaledVector(side, 0.2 * s).addScaledVector(up, -0.06);
    const shR = new V3().copy(Jt[J.neck]).addScaledVector(side, -0.2 * s).addScaledVector(up, -0.06);
    this.placeSeg(P.lUpper, shL, Jt[J.lElbow], fwd); this.placeSeg(P.rUpper, shR, Jt[J.rElbow], fwd);
    this.placeSeg(P.lFore, Jt[J.lElbow], Jt[J.lHand], fwd); this.placeSeg(P.rFore, Jt[J.rElbow], Jt[J.rHand], fwd);
    this.placeAt(P.lMitt, Jt[J.lHand], bx, by); this.placeAt(P.rMitt, Jt[J.rHand], bx, by);
    this.placeAt(P.lBoot, Jt[J.lFoot], bx, by, by.clone().multiplyScalar(-0.03)); this.placeAt(P.rBoot, Jt[J.rFoot], bx, by, by.clone().multiplyScalar(-0.03));
    // head looks partly toward the nose (direction of travel)
    const hy = new V3().subVectors(Jt[J.head], Jt[J.neck]).normalize();
    const look = this.ragdoll ? 0 : this.pose.look;
    const faceDir = new V3().copy(fwd).multiplyScalar(1 - look).addScaledVector(bx, look * s * (this.pose.lookDir || 1)).normalize();
    faceDir.addScaledVector(hy, -faceDir.dot(hy)).normalize();
    const hx = new V3().crossVectors(hy, faceDir).normalize();
    this.placeAt(P.head, Jt[J.head], hx, hy);
    this.placeAt(P.goggle, Jt[J.head], hx, hy, faceDir.clone().multiplyScalar(0.125).addScaledVector(hy, 0.02));
    this.placeAt(P.face, Jt[J.head], hx, hy, faceDir.clone().multiplyScalar(0.115).addScaledVector(hy, -0.07));
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
    this.ragdoll = { prev, C, t: 0, still: 0 };
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
    for (let it = 0; it < 6; it++) {
      for (const [a, b, rest, k, mode] of R.C) {
        const pa = Jt[a], pb = Jt[b];
        const d = _v.subVectors(pb, pa); const l = d.length() || 1e-6;
        if (mode === 1 && l < rest) continue; // max-length only
        const diff = ((l - rest) / l) * 0.5 * k;
        pa.addScaledVector(d, diff); pb.addScaledVector(d, -diff);
      }
      // ground and obstacle contact
      for (let i = 0; i < NJ; i++) {
        const p = Jt[i], q = R.prev[i];
        const g = World.groundHeight(p.x, p.z) + (i === J.head ? 0.14 : 0.07);
        if (p.y < g) {
          p.y = g;
          // snow friction: drag the tangent motion
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
