// ============================================================================
//  structures — lifts, village, huts, lamps, snow guns, park, signs, river
// ============================================================================
const LIFT_LAYER0 = 4; // lift i renders on layer LIFT_LAYER0 + i for the hover outline

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function drawDiffIcon(ctx, diff, x, y, r) {
  const col = DIFF[diff].color;
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = col; ctx.strokeStyle = '#fff'; ctx.lineWidth = r * 0.18;
  const diamond = (ox) => { ctx.beginPath(); ctx.moveTo(ox, -r); ctx.lineTo(ox + r * 0.8, 0); ctx.lineTo(ox, r); ctx.lineTo(ox - r * 0.8, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); };
  if (diff === 'green') { ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, TAU); ctx.fill(); ctx.stroke(); }
  else if (diff === 'red') { ctx.fillRect(-r * 0.78, -r * 0.78, r * 1.56, r * 1.56); ctx.strokeRect(-r * 0.78, -r * 0.78, r * 1.56, r * 1.56); }
  else if (diff === 'black') diamond(0);
  else if (diff === 'double') { diamond(-r * 0.7); diamond(r * 0.7); }
  else { ctx.beginPath(); ctx.roundRect(-r, -r * 0.62, r * 2, r * 1.24, r * 0.3); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = `800 ${r * 0.8}px Outfit, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('P', 0, r * 0.05); }
  ctx.restore();
}

const Structures = {
  group: null, lifts: [], windowsMat: null, glowMat: null, lampHeads: [], smokeVents: [], gunNozzles: [],
  gateGroup: null,

  init(scene) {
    this.group = new THREE.Group(); this.group.name = 'structures';
    scene.add(this.group);
    this.propMat = stdMat({ roughness: 0.8 }, { key: 'prop' });
    this.metalMat = stdMat({ roughness: 0.45, metalness: 0.3 }, { key: 'metal' });
    this.windowsMat = stdMat({ roughness: 0.25, metalness: 0.1, flatShading: true }, {
      key: 'windows', uniforms: { uNight: U.uNight }, fragHead: 'uniform float uNight;',
      fragColor: 'vec3 litC = diffuseColor.rgb; diffuseColor.rgb = vec3(0.05, 0.065, 0.085) + litC * 0.04;',
      fragTail: 'outgoingLight += litC * uNight * 2.4;',
    });
    this.snowMat = stdMat({ roughness: 0.9, flatShading: false, vertexColors: true }, { key: 'snowprop' });
    for (const L of LIFTS) this.lifts.push(this.buildLift(L));
    this.buildBuildings();
    this.buildLamps();
    this.buildGuns();
    this.buildPark();
    this.buildCornices();
    this.buildBoundary();
    this.buildRiver();
    this.buildSnowcats();
    this.gateGroup = new THREE.Group(); this.group.add(this.gateGroup);
  },
  // separated so canvas text waits for webfonts
  buildSigns() {
    for (const s of Scatter.signs) {
      const run = RUNS[s.run];
      const tex = canvasTexture(512, 256, (ctx, w, h) => {
        ctx.fillStyle = '#5a3b26'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#f4efe6'; ctx.fillRect(10, 10, w - 20, h - 20);
        drawDiffIcon(ctx, run.diff, 92, h / 2, 54);
        ctx.fillStyle = '#1b1d22'; ctx.font = '800 54px Outfit, sans-serif'; ctx.textBaseline = 'middle';
        ctx.fillText(run.name, 170, h / 2 - 22, w - 190);
        ctx.font = '600 30px Outfit, sans-serif'; ctx.fillStyle = '#5b5f68';
        ctx.fillText(DIFF[run.diff].label.toUpperCase(), 172, h / 2 + 36);
      });
      const g = new THREE.Group();
      const post = new THREE.Mesh(G.cyl(0.08, 0.1, 2.6, 6), this.propMat);
      post.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(post.geometry.attributes.position.count * 3).fill(0.32), 3));
      post.position.y = 1.3; g.add(post);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
      board.position.set(0, 2.25, 0.09); g.add(board);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
      back.rotation.y = Math.PI; back.position.set(0, 2.25, -0.09); g.add(back);
      const cap = new THREE.Mesh(G.box(2.3, 0.14, 0.32), this.snowMat);
      cap.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(cap.geometry.attributes.position.count * 3).fill(0.95), 3));
      cap.position.y = 2.86; g.add(cap);
      g.position.set(s.x, s.y, s.z); g.rotation.y = s.rot + Math.PI;
      g.traverse((o) => { o.castShadow = true; });
      this.group.add(g);
    }
    for (const lift of this.lifts) {
      const L = lift.def;
      const tex = canvasTexture(512, 160, (ctx, w, h) => {
        ctx.fillStyle = '#' + new THREE.Color(L.color).getHexString(); ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#fff'; ctx.font = '800 58px Outfit, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(L.name.toUpperCase(), w / 2, h / 2 - 14, w - 30);
        ctx.font = '600 28px Outfit, sans-serif'; ctx.fillText(LIFT_TYPES[L.type].label, w / 2, h / 2 + 40, w - 30);
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.9), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
      const st = lift.stationA;
      m.position.set(st.x - lift.dir.x * 9, st.y + (LIFT_TYPES[L.type].surface ? 3.2 : 6.6), st.z - lift.dir.z * 9);
      m.rotation.y = Math.atan2(-lift.dir.x, -lift.dir.z);
      this.group.add(m);
    }
  },

  // ---------------------------------------------------------------------------
  //  lifts
  // ---------------------------------------------------------------------------
  buildLift(L) {
    const T = LIFT_TYPES[L.type];
    const ax = L.a[0], az = L.a[1], bx = L.b[0], bz = L.b[1];
    const len = Math.hypot(bx - ax, bz - az);
    const dir = { x: (bx - ax) / len, z: (bz - az) / len };
    const right = { x: -dir.z, z: dir.x };
    const gauge = T.cabin ? 6.2 : T.surface ? 3.0 : (T.seats === 6 ? 6.0 : T.seats === 4 ? 5.0 : 4.0);
    const wheelH = T.cabin ? 7.5 : T.surface ? 3.6 : 5.8;
    const minClear = T.cabin ? 10 : T.surface ? 3.4 : 7.5;
    const ya = World.height(ax, az), yb = World.height(bx, bz);
    const lift = { def: L, index: L.index, type: T, len, dir, right, gauge, layer: LIFT_LAYER0 + L.index, objects: [] };
    lift.stationA = { x: ax, z: az, y: ya }; lift.stationB = { x: bx, z: bz, y: yb };

    // supports: stations + towers along the line
    const nT = Math.max(1, Math.round(len / T.towerGap) - 1);
    const sup = [{ t: 0, h: wheelH, station: true }];
    for (let k = 1; k <= nT; k++) {
      let t = k / (nT + 1);
      // nudge towers out of run corridors
      for (let tries = 0; tries < 12; tries++) {
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        if (World.attr(World.inRun, x, z) < 40 && World.attr(World.inRun, x + right.x * 3, z + right.z * 3) < 40) break;
        t += ((tries & 1) ? -1 : 1) * (tries + 1) * (9 / len);
      }
      sup.push({ t: clamp(t, 0.03, 0.97), h: minClear + 1.5 });
    }
    sup.push({ t: 1, h: wheelH, station: true });
    sup.sort((p, q) => p.t - q.t);
    const tyAt = (t) => World.height(ax + (bx - ax) * t, az + (bz - az) * t);
    const cableY = (t) => {
      let i = 0; while (i < sup.length - 2 && sup[i + 1].t < t) i++;
      const p = sup[i], q = sup[i + 1], u = (t - p.t) / Math.max(1e-6, q.t - p.t);
      const span = (q.t - p.t) * len;
      return lerp(tyAt(p.t) + p.h, tyAt(q.t) + q.h, u) - span * 0.012 * 4 * u * (1 - u);
    };
    for (let iter = 0; iter < 8; iter++) {
      let worst = 0, wt = 0;
      for (let s = 0; s <= 1; s += 2 / len) {
        const def = minClear - (cableY(s) - tyAt(s));
        const nearStation = s * len < 18 || (1 - s) * len < 18;
        if (!nearStation && def > worst) { worst = def; wt = s; }
      }
      if (worst < 0.2) break;
      // raise the neighbours of the worst point, or add a tower
      let i = 0; while (i < sup.length - 2 && sup[i + 1].t < wt) i++;
      const p = sup[i], q = sup[i + 1];
      if (!p.station && p.h < 24) p.h += worst; if (!q.station && q.h < 24) q.h += worst;
      if ((p.station || p.h >= 24) && (q.station || q.h >= 24)) sup.splice(i + 1, 0, { t: wt, h: minClear + 2 });
    }
    lift.sup = sup;
    lift.cableY = cableY;

    // carriers loop: up the right line, around the top wheel, down the left line
    const loop = [];
    const steps = Math.max(40, Math.round(len / 6));
    const r = gauge / 2;
    for (let k = 0; k <= steps; k++) { const t = k / steps; loop.push([ax + (bx - ax) * t + right.x * r, cableY(t), az + (bz - az) * t + right.z * r]); }
    for (let k = 1; k < 10; k++) { const a = (k / 10) * Math.PI; loop.push([bx + right.x * r * Math.cos(a) + dir.x * r * Math.sin(a), yb + wheelH, bz + right.z * r * Math.cos(a) + dir.z * r * Math.sin(a)]); }
    for (let k = steps; k >= 0; k--) { const t = k / steps; loop.push([ax + (bx - ax) * t - right.x * r, cableY(t), az + (bz - az) * t - right.z * r]); }
    for (let k = 1; k < 10; k++) { const a = (k / 10) * Math.PI; loop.push([ax - right.x * r * Math.cos(a) - dir.x * r * Math.sin(a), ya + wheelH, az - right.z * r * Math.cos(a) - dir.z * r * Math.sin(a)]); }
    loop.push(loop[0].slice());
    const cum = [0];
    for (let i = 1; i < loop.length; i++) cum.push(cum[i - 1] + Math.hypot(loop[i][0] - loop[i - 1][0], loop[i][1] - loop[i - 1][1], loop[i][2] - loop[i - 1][2]));
    lift.loop = loop; lift.loopCum = cum; lift.loopLen = cum[cum.length - 1]; lift.upLen = cum[steps];

    // cables (always at least a pixel wide from the map camera)
    const cablePts = [];
    for (let i = 0; i < loop.length - 1; i++) cablePts.push(...loop[i], ...loop[i + 1]);
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cablePts, 3));
    const cable = new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0x1d2024, transparent: true, opacity: 0.9 }));
    this.addLiftObj(lift, cable);

    // towers
    const tb = new GeoBuilder();
    const steel = T.surface ? 0x8a8f96 : 0x6f7782, accent = L.color;
    for (const s of sup) {
      if (s.station) continue;
      const x = ax + (bx - ax) * s.t, z = az + (bz - az) * s.t, y = tyAt(s.t), top = cableY(s.t);
      const h = top - y + 0.6;
      const ry = Math.atan2(dir.x, dir.z);
      tb.add(G.box(1.6, 0.5, 1.6), { x, y: y + 0.1, z, ry, color: 0x8b8d8f });
      tb.add(G.cyl(T.surface ? 0.16 : 0.32, T.surface ? 0.22 : 0.5, h, 6), { x, y: y + h / 2, z, color: steel });
      tb.add(G.box(gauge + 1.4, 0.45, 0.5), { x, y: top + 0.55, z, ry: ry + Math.PI / 2, color: accent, colorFn: snowCap(0.6) });
      for (const sd of [-1, 1]) {
        tb.add(G.box(0.35, 0.35, 2.4), { x: x + right.x * r * sd, y: top + 0.1, z: z + right.z * r * sd, ry, color: 0x2a2d31 });
      }
      if (!T.surface) tb.add(G.box(0.08, h * 0.9, 0.5), { x: x - dir.x * 0.45, y: y + h * 0.48, z: z - dir.z * 0.45, ry: ry + Math.PI / 2, color: 0x3a3f45 }); // ladder
      World.addCollider(x, z, T.surface ? 0.35 : 0.75, top, 'tower', lift);
    }
    if (tb.count) { const m = new THREE.Mesh(tb.build(), this.metalMat); m.castShadow = true; m.receiveShadow = true; this.addLiftObj(lift, m); }

    // stations
    for (const end of [0, 1]) {
      const st = end ? lift.stationB : lift.stationA;
      const m = new THREE.Mesh(this.stationGeometry(lift, st, end), this.propMat);
      m.castShadow = true; m.receiveShadow = true;
      this.addLiftObj(lift, m);
      const sw = this.stationWindows(lift, st, end);
      if (sw) { const w = new THREE.Mesh(sw, this.windowsMat); this.addLiftObj(lift, w); }
      World.addCollider(st.x - dir.x * (end ? -4 : 4), st.z - dir.z * (end ? -4 : 4), T.cabin ? 9 : T.surface ? 2 : 5, st.y + 8, 'station', lift);
    }

    // carriers
    const carrierGeo = this.carrierGeometry(lift);
    const count = Math.floor(lift.loopLen / T.carrierGap);
    const inst = new THREE.InstancedMesh(carrierGeo, this.metalMat, count);
    inst.castShadow = true;
    inst.frustumCulled = false;
    lift.carriers = inst; lift.carrierCount = count; lift.phase = 0;
    this.addLiftObj(lift, inst);
    this.updateLift(lift, 0);
    return lift;
  },
  addLiftObj(lift, o) {
    o.layers.enable(lift.layer);
    lift.objects.push(o);
    this.group.add(o);
  },
  // point on the loop at arc length s → position + tangent
  loopAt(lift, s, out) {
    const cum = lift.loopCum, loop = lift.loop;
    s = ((s % lift.loopLen) + lift.loopLen) % lift.loopLen;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
    const u = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
    const a = loop[lo], b = loop[hi];
    out.x = lerp(a[0], b[0], u); out.y = lerp(a[1], b[1], u); out.z = lerp(a[2], b[2], u);
    const l = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
    out.tx = (b[0] - a[0]) / l; out.tz = (b[2] - a[2]) / l;
    return out;
  },
  updateLift(lift, dt) {
    lift.phase += lift.type.speed * dt;
    const p = {}, gap = lift.loopLen / lift.carrierCount;
    for (let i = 0; i < lift.carrierCount; i++) {
      this.loopAt(lift, lift.phase + i * gap, p);
      _m4.compose(_v.set(p.x, p.y, p.z), _q.setFromAxisAngle(_v2.set(0, 1, 0), Math.atan2(p.tx, p.tz)), _s.set(1, 1, 1));
      lift.carriers.setMatrixAt(i, _m4);
    }
    lift.carriers.instanceMatrix.needsUpdate = true;
  },

  carrierGeometry(lift) {
    const T = lift.type, b = new GeoBuilder(), c = lift.def.color;
    const dark = 0x2b2f35;
    b.add(G.box(0.3, 0.25, 0.45), { y: 0.0, color: dark }); // grip
    if (T.cabin) {
      b.add(G.cyl(0.06, 0.06, 1.7, 5), { y: -0.85, color: 0x8a9099 });
      b.add(G.box(0.12, 0.12, 0.9), { y: -0.1, z: 0.0, color: dark });
      b.add(G.box(2.1, 2.1, 1.9), { y: -2.75, color: c });
      b.add(G.box(2.16, 0.85, 1.96), { y: -2.45, color: 0x24303c });
      b.add(G.box(2.0, 0.18, 1.8), { y: -1.62, color: 0xf2f5f9 });
      b.add(G.box(2.2, 0.2, 2.0), { y: -3.85, color: 0x30353c });
    } else if (T.surface) {
      b.add(G.box(0.25, 0.5, 0.25), { y: -0.35, color: 0x9aa0a8 });
      b.add(G.cyl(0.03, 0.03, 2.4, 4), { y: -1.8, color: 0x7d838b });
      if (lift.def.type === 'tbar') b.add(G.box(1.1, 0.07, 0.07), { y: -3.0, color: c });
      else b.add(G.cyl(0.2, 0.2, 0.05, 8), { y: -3.0, color: c });
    } else {
      const seats = T.seats, w = seats * 0.6;
      b.add(G.cyl(0.05, 0.05, 2.3, 5), { y: -1.15, color: 0x8a9099 });
      b.add(G.box(0.08, 0.08, 0.6), { y: -2.3, z: -0.25, color: 0x8a9099 });
      b.add(G.box(w, 0.1, 0.55), { y: -2.45, z: 0.15, color: dark });
      b.add(G.box(w, 0.09, 0.5), { y: -2.36, z: 0.15, color: c });
      b.add(G.box(w, 0.62, 0.08), { y: -2.05, z: -0.15, rx: -0.15, color: c });
      b.add(G.box(w, 0.05, 0.05), { y: -1.6, z: 0.65, color: 0x9aa0a8 }); // safety bar
      b.add(G.box(w * 0.9, 0.05, 0.3), { y: -2.95, z: 0.55, color: 0x9aa0a8 }); // foot rest
      for (const sd of [-1, 1]) b.add(G.box(0.05, 0.5, 0.05), { x: sd * w / 2, y: -2.2, z: 0.2, color: 0x9aa0a8 });
      if (T.hood) {
        b.add(G.box(w + 0.1, 0.06, 0.9), { y: -1.42, z: 0.25, rx: 0.25, color: 0xff8a1f });
        b.add(G.box(w + 0.1, 0.9, 0.06), { y: -1.82, z: 0.72, rx: 0.15, color: 0xffa64d });
      }
    }
    return b.build();
  },

  stationGeometry(lift, st, end) {
    const T = lift.type, b = new GeoBuilder(), d = lift.dir;
    const ry = Math.atan2(d.x, d.z);
    const at = (fwd, side) => ({ x: st.x + d.x * fwd + lift.right.x * side, z: st.z + d.z * fwd + lift.right.z * side });
    const snow = 0xf1f5f9, concrete = 0x9b9c9e, c = lift.def.color;
    const o = (p, opts) => Object.assign({ x: p.x, z: p.z, ry }, opts);
    const sgn = end ? 1 : -1; // bullwheel sits on the far side of the line end
    if (T.cabin) {
      const p = at(sgn * 6, 0);
      b.add(G.box(16, 0.8, 24), o(p, { y: st.y + 0.2, color: concrete }));
      b.add(G.box(14, 7.5, 22), o(p, { y: st.y + 4.4, color: 0xb9b3a7 }));
      b.add(G.box(14.6, 1.4, 22.6), o(p, { y: st.y + 8.6, color: c }));
      b.add(roofGeometry(23.6, 15.8, 3.6), o(p, { y: st.y + 9.2, ry: ry + Math.PI / 2, color: 0x3a3f46 }));
      b.add(roofGeometry(23.9, 16.4, 3.85), o(p, { y: st.y + 9.35, ry: ry + Math.PI / 2, color: snow }));
      this.icicles(b, p, ry, 23.6, 15.8, st.y + 9.2);
      this.smokeVents.push({ x: p.x, y: st.y + 12.5, z: p.z, rate: 0.6 });
    } else if (T.surface) {
      const p = at(sgn * 1.5, 0);
      b.add(G.cyl(0.3, 0.4, 3.8, 6), o(p, { y: st.y + 1.9, color: 0x8a8f96 }));
      b.add(G.cyl(T.surface ? 1.6 : 2, 1.6, 0.25, 12), o(p, { y: st.y + 3.6, color: c }));
      if (!end) {
        const hp = at(-6, 5);
        b.add(G.box(2.6, 2.6, 2.6), o(hp, { y: st.y + 1.3, color: 0x7a5236 }));
        b.add(roofGeometry(3.4, 3.4, 1.2), o(hp, { y: st.y + 2.6, color: 0x7a2b25 }));
        b.add(roofGeometry(3.6, 3.7, 1.35), o(hp, { y: st.y + 2.72, color: snow }));
      }
    } else {
      // chairlift terminal: bullwheel bonnet on a column, loading ramp, operator hut
      const p = at(sgn * 3, 0), detach = T.speed > 4;
      b.add(G.box(lift.gauge + 4, 0.6, detach ? 18 : 9), o(at(sgn * 1, 0), { y: st.y + 0.1, color: concrete }));
      if (detach) {
        b.add(G.box(lift.gauge + 2.4, 2.8, 14), o(p, { y: st.y + 6.0, color: 0xd9dcdf }));
        b.add(G.box(lift.gauge + 2.6, 0.5, 14.2), o(p, { y: st.y + 7.6, color: c, colorFn: snowCap(0.6) }));
        b.add(G.box(1.6, 5, 1.6), o(p, { y: st.y + 2.5, color: 0x7f868e }));
        b.add(G.box(1.6, 5, 1.6), o(at(sgn * 8, 0), { y: st.y + 2.5, color: 0x7f868e }));
      } else {
        b.add(G.cyl(lift.gauge / 2 + 0.3, lift.gauge / 2 + 0.3, 0.5, 14), o(p, { y: st.y + 5.9, color: c, colorFn: snowCap(0.6) }));
        b.add(G.box(1.2, 5.6, 1.2), o(p, { y: st.y + 2.8, color: 0x7f868e }));
      }
      const hp = at(end ? 4 : -7, lift.gauge / 2 + 5);
      b.add(G.box(3.4, 2.8, 3.0), o(hp, { y: st.y + 1.4, color: 0x7a5236 }));
      b.add(roofGeometry(3.4, 3.0, 1.3), o(hp, { y: st.y + 2.8, color: 0x2f4f3a }));
      b.add(roofGeometry(3.8, 3.6, 1.5), o(hp, { y: st.y + 2.92, color: snow }));
      this.icicles(b, hp, ry + Math.PI / 2, 3.4, 3.0, st.y + 2.8);
      this.smokeVents.push({ x: hp.x, y: st.y + 4.6, z: hp.z, rate: 0.25 });
      // maze fence at the bottom
      if (!end) for (let k = -2; k <= 2; k++) b.add(G.box(0.08, 1.0, 10), o(at(-12, k * 1.6), { y: st.y + 0.5, color: 0x2a6fc0 }));
    }
    return b.build();
  },
  stationWindows(lift, st, end) {
    const T = lift.type, d = lift.dir, ry = Math.atan2(d.x, d.z);
    const b = new GeoBuilder();
    const at = (fwd, side) => ({ x: st.x + d.x * fwd + lift.right.x * side, z: st.z + d.z * fwd + lift.right.z * side });
    if (T.cabin) {
      const p = at((end ? 1 : -1) * 6, 0);
      for (let k = -4; k <= 4; k++) for (const sd of [-1, 1]) {
        const q = { x: p.x + d.x * k * 2.3 + lift.right.x * sd * 7.05, z: p.z + d.z * k * 2.3 + lift.right.z * sd * 7.05 };
        b.add(G.box(0.1, 1.4, 1.5), { x: q.x, z: q.z, y: st.y + 5.6, ry, color: 0xffc977 });
      }
    } else if (!T.surface) {
      const hp = at(end ? 4 : -7, lift.gauge / 2 + 5);
      b.add(G.box(3.5, 0.9, 1.4), { x: hp.x, z: hp.z, y: st.y + 1.7, ry, color: 0xffc977 });
    } else return null;
    return b.build();
  },
  icicles(b, p, ry, w, d, y) {
    const rnd = mulberry32(Math.floor(p.x * 13 + p.z * 7));
    const c = Math.cos(ry), s = Math.sin(ry);
    for (const side of [-1, 1]) {
      for (let u = -w / 2 + 0.3; u < w / 2; u += 0.55 + rnd() * 0.5) {
        const len = 0.15 + rnd() * rnd() * 0.9;
        // eave line runs along local z (width) at local x = ±d/2
        const lx = side * (d / 2 + 0.15), lz = u;
        const x = p.x + lx * c + lz * s, z = p.z - lx * s + lz * c;
        b.add(G.cone(0.05 + len * 0.04, len, 4), { x, z, y: y - len / 2 + 0.02, rx: Math.PI, color: 0xd9ecf7 });
      }
    }
  },

  // ---------------------------------------------------------------------------
  //  village, huts
  // ---------------------------------------------------------------------------
  buildBuildings() {
    const b = new GeoBuilder(), win = new GeoBuilder();
    const snow = 0xf2f6fa;
    const rnd = mulberry32(99);
    for (const bd of Scatter.buildings) {
      const fh = 3.1, H = bd.floors * fh;
      const o = (opts) => Object.assign({ x: bd.x, z: bd.z, ry: bd.rot }, opts);
      const local = (lx, lz) => ({ x: bd.x + lx * Math.cos(bd.rot) + lz * Math.sin(bd.rot), z: bd.z - lx * Math.sin(bd.rot) + lz * Math.cos(bd.rot) });
      const wallC = new THREE.Color(bd.wall);
      b.add(G.box(bd.w + 0.6, 0.8, bd.d + 0.6), o({ y: bd.y + 0.2, color: 0x6e6a66 }));
      b.add(G.box(bd.w, H, bd.d), o({ y: bd.y + H / 2 + 0.4, color: bd.wall }));
      const top = bd.y + H + 0.4;
      if (bd.flat) {
        b.add(G.box(bd.w + 0.3, 0.5, bd.d + 0.3), o({ y: top + 0.25, color: bd.roof }));
        b.add(G.box(bd.w - 0.2, 0.55, bd.d - 0.2), o({ y: top + 0.55, color: snow }));
      } else {
        const rh = bd.kind === 'lodge' ? bd.d * 0.55 : bd.d * 0.42;
        b.add(roofGeometry(bd.w + 1.2, bd.d + 1.4, rh), o({ y: top, color: bd.roof }));
        b.add(roofGeometry(bd.w + 1.3, bd.d + 1.7, rh + 0.35), o({ y: top + 0.18, color: snow }));
        this.icicles(b, { x: bd.x, z: bd.z }, bd.rot + Math.PI / 2, bd.w + 1.2, bd.d + 1.4, top);
        if (bd.kind !== 'hotel') {
          const cp = local(bd.w * 0.25, -bd.d * 0.15);
          b.add(G.box(0.9, rh + 1.6, 0.9), { x: cp.x, z: cp.z, y: top + rh * 0.5 + 0.6, ry: bd.rot, color: 0x5d5148 });
          b.add(G.box(1.1, 0.35, 1.1), { x: cp.x, z: cp.z, y: top + rh + 1.45, ry: bd.rot, color: snow });
          this.smokeVents.push({ x: cp.x, y: top + rh + 1.8, z: cp.z, rate: bd.kind === 'lodge' ? 0.7 : 0.3 });
        }
      }
      // windows on both long faces + the ends
      const lit = () => (rnd() < 0.7 ? 0xffc46e : rnd() < 0.5 ? 0xffe2a8 : 0x101418);
      for (let f = 0; f < bd.floors; f++) {
        const y = bd.y + 0.4 + f * fh + fh * 0.55;
        const big = bd.kind === 'lodge' && f === 0;
        const step = big ? 3.2 : 2.6;
        for (let u = -bd.w / 2 + step * 0.7; u < bd.w / 2 - step * 0.4; u += step) {
          for (const sd of [-1, 1]) {
            const p = local(u, sd * (bd.d / 2 + 0.04));
            win.add(G.box(big ? 2.6 : 1.3, big ? 2.2 : 1.35, 0.12), { x: p.x, z: p.z, y, ry: bd.rot, color: lit() });
          }
          if (bd.kind === 'hotel' && f > 0 && rnd() < 0.5) {
            const p = local(u, bd.d / 2 + 0.6);
            b.add(G.box(step * 0.8, 0.12, 1.1), { x: p.x, z: p.z, y: y - 0.85, ry: bd.rot, color: 0x3a3632, colorFn: snowCap(0.6) });
          }
        }
        for (let v = -bd.d / 2 + 2; v < bd.d / 2 - 1; v += 2.8) {
          for (const sd of [-1, 1]) {
            const p = local(sd * (bd.w / 2 + 0.04), v);
            win.add(G.box(0.12, 1.3, 1.2), { x: p.x, z: p.z, y, ry: bd.rot, color: lit() });
          }
        }
      }
      // entrance canopy
      const ep = local(0, bd.d / 2 + 1.2);
      b.add(G.box(Math.min(6, bd.w * 0.4), 0.25, 2.4), { x: ep.x, z: ep.z, y: bd.y + 3.0, ry: bd.rot, color: bd.roof, colorFn: snowCap(0.6) });
      if (bd.kind === 'lodge') {
        // deck with benches and a board rack out front
        const dp = local(0, -bd.d / 2 - 4);
        b.add(G.box(bd.w * 0.8, 0.4, 7), { x: dp.x, z: dp.z, y: bd.y + 0.6, ry: bd.rot, color: 0x6b4a33, colorFn: snowCap(0.7) });
        for (let k = -2; k <= 2; k++) {
          const rp = local(k * 3.5, -bd.d / 2 - 7.4);
          b.add(G.box(2.6, 0.12, 0.6), { x: rp.x, z: rp.z, y: bd.y + 1.25, ry: bd.rot, color: 0x5b3d2a });
        }
      }
    }
    const m = new THREE.Mesh(b.build(), this.propMat); m.castShadow = true; m.receiveShadow = true; this.group.add(m);
    const w = new THREE.Mesh(win.build(), this.windowsMat); this.group.add(w);
  },

  // ---------------------------------------------------------------------------
  //  night lighting, snow guns
  // ---------------------------------------------------------------------------
  buildLamps() {
    const b = new GeoBuilder(), glow = new GeoBuilder();
    for (const L of Scatter.lamps) {
      const ry = Math.atan2(L.aimX, L.aimZ);
      b.add(G.cyl(0.1, 0.16, 10, 6), { x: L.x, y: L.y + 5, z: L.z, color: 0x4a4f56 });
      b.add(G.box(1.6, 0.12, 0.12), { x: L.x, y: L.y + 9.6, z: L.z, ry: ry + Math.PI / 2, color: 0x4a4f56 });
      for (const sd of [-0.6, 0.6]) {
        const hx = L.x + Math.cos(ry) * sd + L.aimX * 0.3, hz = L.z - Math.sin(ry) * sd + L.aimZ * 0.3;
        b.add(G.box(0.55, 0.35, 0.4), { x: hx, y: L.y + 9.75, z: hz, ry, rx: 0.5, color: 0x30343a, colorFn: snowCap(0.7) });
        glow.add(G.box(0.45, 0.06, 0.32), { x: hx + L.aimX * 0.05, y: L.y + 9.55, z: hz + L.aimZ * 0.05, ry, rx: 0.5, color: 0xfff1c9 });
      }
      this.lampHeads.push({ x: L.x + L.aimX * 6, y: L.y + 9.5, z: L.z + L.aimZ * 6, gx: L.x + L.aimX * 0.3, gz: L.z + L.aimZ * 0.3, gy: L.y + 9.6 });
    }
    if (!b.count) return;
    const m = new THREE.Mesh(b.build(), this.metalMat); m.castShadow = true; this.group.add(m);
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: 0x000000 });
    this.glowMesh = new THREE.Mesh(glow.build(), this.glowMat); this.group.add(this.glowMesh);
  },
  buildGuns() {
    const b = new GeoBuilder();
    for (const g of Scatter.guns) {
      const ry = Math.atan2(g.aimX, g.aimZ);
      for (let k = 0; k < 3; k++) {
        const a = ry + k * TAU / 3;
        b.add(G.cyl(0.05, 0.06, 2.4, 4), { x: g.x + Math.sin(a) * 0.6, y: g.y + 1.0, z: g.z + Math.cos(a) * 0.6, rx: Math.cos(a) * 0.45, rz: -Math.sin(a) * 0.45, color: 0x3a3f45 });
      }
      b.add(G.cyl(0.65, 0.55, 1.3, 10), { x: g.x, y: g.y + 2.4, z: g.z, ry, rx: Math.PI / 2 - 0.35, order: 'YXZ', color: 0xe9e3d1, colorFn: snowCap(0.85) });
      b.add(G.cyl(0.7, 0.7, 0.16, 10), { x: g.x + g.aimX * 0.6, y: g.y + 2.6, z: g.z + g.aimZ * 0.6, ry, rx: Math.PI / 2 - 0.35, order: 'YXZ', color: 0x2c3036 });
      this.gunNozzles.push({ x: g.x + g.aimX * 0.9, y: g.y + 2.75, z: g.z + g.aimZ * 0.9, ax: g.aimX, az: g.aimZ });
    }
    if (b.count) { const m = new THREE.Mesh(b.build(), this.metalMat); m.castShadow = true; this.group.add(m); }
  },

  // ---------------------------------------------------------------------------
  //  terrain park: kickers, boxes, rails
  // ---------------------------------------------------------------------------
  buildPark() {
    const snowB = new GeoBuilder();
    const pos = [], col = [], idx = [];
    const cSnow = new THREE.Color(0xe8eef6), cLip = new THREE.Color(0x2f7bd8), cSide = new THREE.Color(0xc9d6e6);
    for (const k of World.kickers) {
      const nu = 14, nv = 8, base = pos.length / 3;
      const hw = k.w / 2 + 0.9;
      for (let iu = 0; iu <= nu; iu++) {
        const u = (iu / nu) * (k.len + k.back);
        for (let iv = 0; iv <= nv; iv++) {
          const v = -hw + (iv / nv) * hw * 2;
          const x = k.x0 + k.dx * u - k.dz * v, z = k.z0 + k.dz * u + k.dx * v;
          const y = World.height(x, z) + World.kickerOffset(k, x, z) + 0.03;
          pos.push(x, y, z);
          const lipLine = Math.abs(u - k.len) < k.len / nu * 0.6 && Math.abs(v) < k.w / 2;
          const c = lipLine ? cLip : (Math.abs(v) > k.w / 2 ? cSide : cSnow);
          col.push(c.r, c.g, c.b);
        }
      }
      for (let iu = 0; iu < nu; iu++) for (let iv = 0; iv < nv; iv++) {
        const a = base + iu * (nv + 1) + iv, bb = a + 1, c2 = a + nv + 1, d = c2 + 1;
        idx.push(a, bb, c2, bb, d, c2);
      }
    }
    if (pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, stdMat({ flatShading: false, roughness: 0.75 }, { key: 'kicker' }));
      m.receiveShadow = true; m.castShadow = true; this.group.add(m);
    }
    const b = new GeoBuilder();
    for (const gr of World.grinds) {
      const mx = (gr.ax + gr.bx) / 2, mz = (gr.az + gr.bz) / 2, my = (gr.ay + gr.by) / 2;
      const ry = Math.atan2(gr.dx, gr.dz);
      const pitch = Math.atan2(gr.ay - gr.by, gr.len);
      if (gr.kind === 'box') {
        b.add(G.box(gr.w * 2, 0.08, gr.len), { x: mx, y: my - 0.04, z: mz, ry, rx: pitch, color: 0xc8ccd2 });
        b.add(G.box(gr.w * 2 - 0.06, gr.h, gr.len), { x: mx, y: my - gr.h / 2 - 0.08, z: mz, ry, rx: pitch, color: 0xff8a1f });
        // snow on-ramp
        const sx = gr.ax - gr.dx * 0.9, sz = gr.az - gr.dz * 0.9;
        b.add(G.box(gr.w * 2 + 0.6, gr.h, 1.8), { x: sx, y: World.height(sx, sz) + gr.h / 2 - 0.25, z: sz, ry, rx: 0.3, color: 0xe8eef6 });
      } else {
        b.add(G.cyl(0.055, 0.055, gr.len, 8), { x: mx, y: my, z: mz, ry, rx: Math.PI / 2 + pitch, order: 'YXZ', color: 0xd9dde2 });
        for (const t of [0.12, 0.88]) {
          const px = lerp(gr.ax, gr.bx, t), pz = lerp(gr.az, gr.bz, t), py = lerp(gr.ay, gr.by, t);
          const gy = World.height(px, pz);
          b.add(G.cyl(0.05, 0.05, py - gy + 0.3, 5), { x: px, y: (py + gy) / 2 - 0.1, z: pz, color: 0x2a2d31 });
        }
      }
    }
    if (b.count) { const m = new THREE.Mesh(b.build(), this.metalMat); m.castShadow = true; m.receiveShadow = true; this.group.add(m); }
  },
  buildCornices() {
    const b = new GeoBuilder();
    for (const c of Scatter.cornices) {
      const ry = Math.atan2(c.tx, c.tz);
      for (let k = -6; k <= 6; k++) {
        const lat = (k / 6) * c.w * 0.5;
        const x = c.x - c.tz * lat, z = c.z + c.tx * lat;
        const y = World.height(x - c.tx * 3, z - c.tz * 3);
        b.add(G.sphere(2.4 + Math.abs(Math.sin(k * 1.7)) * 0.8, 7, 5), { x: x + c.tx * 1.4, y: y - 0.9, z: z + c.tz * 1.4, sy: 0.55, ry, color: 0xf3f7fb });
      }
    }
    if (b.count) { const m = new THREE.Mesh(b.build(), this.snowMat); m.castShadow = true; m.receiveShadow = true; this.group.add(m); }
  },
  buildBoundary() {
    const b = new GeoBuilder(), rope = [];
    const P = Scatter.boundaryPoles;
    P.forEach((p, i) => {
      b.add(G.cyl(0.04, 0.05, 1.6, 4), { x: p.x, y: p.y + 0.8, z: p.z, color: i % 2 ? 0xff5a1f : 0x1f1f1f });
      if (i % 8 === 0) b.add(G.box(0.7, 0.5, 0.04), { x: p.x, y: p.y + 1.3, z: p.z, ry: i, color: 0xd62d20 });
      if (i < P.length - 1) {
        const q = P[i + 1];
        for (let k = 0; k < 4; k++) {
          const t0 = k / 4, t1 = (k + 1) / 4, sag = (t) => -0.25 * 4 * t * (1 - t);
          rope.push(lerp(p.x, q.x, t0), lerp(p.y, q.y, t0) + 1.4 + sag(t0), lerp(p.z, q.z, t0), lerp(p.x, q.x, t1), lerp(p.y, q.y, t1) + 1.4 + sag(t1), lerp(p.z, q.z, t1));
        }
      }
    });
    const m = new THREE.Mesh(b.build(), this.propMat); this.group.add(m);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(rope, 3));
    this.group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xe0471c })));
  },
  buildRiver() {
    const pts = resamplePath(RIVER, 10);
    const pos = [], uv = [];
    const idx = [];
    let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], c = pts[Math.min(pts.length - 1, i + 1)];
      const l = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
      const nx = -(c[1] - a[1]) / l, nz = (c[0] - a[0]) / l;
      if (i) acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const y = World.height(pts[i][0], pts[i][1]) + 1.3;
      for (const sd of [-1, 1]) { pos.push(pts[i][0] + nx * 9 * sd, y, pts[i][1] + nz * 9 * sd); uv.push(sd * 0.5 + 0.5, acc / 20); }
      if (i < pts.length - 1) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x24434d, roughness: 0.12, metalness: 0.1 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.uTime;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float edge = abs(vUv.x - 0.5) * 2.0;
          float ice = smoothstep(0.62, 0.8, edge + sin(vUv.y * 7.0) * 0.08);
          float flow = sin(vUv.y * 40.0 - uTime * 2.0 + sin(vUv.x * 9.0) * 2.0) * 0.5 + 0.5;
          diffuseColor.rgb = mix(diffuseColor.rgb * (0.85 + flow * 0.2), vec3(0.82, 0.88, 0.93), ice);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(0.12, 0.6, smoothstep(0.62, 0.8, abs(vUv.x - 0.5) * 2.0));');
    };
    mat.defines = { USE_UV: '' };
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; this.group.add(m);
    // bridge where the south road crosses
    const bp = { x: -655, z: 1356 };
    const by = World.height(bp.x, bp.z - 24) + 0.4;
    const b = new GeoBuilder();
    b.add(G.box(8, 0.6, 46), { x: bp.x, y: by, z: bp.z, ry: 0.05, color: 0x6a6460, colorFn: snowCap(0.7) });
    for (const sd of [-1, 1]) {
      b.add(G.box(0.25, 1.0, 46), { x: bp.x + sd * 3.9, y: by + 0.7, z: bp.z, ry: 0.05, color: 0xb03a2e, colorFn: snowCap(0.7) });
    }
    const bm = new THREE.Mesh(b.build(), this.propMat); bm.castShadow = true; bm.receiveShadow = true; this.group.add(bm);
  },
  buildSnowcats() {
    const b = new GeoBuilder();
    const spots = [[-200, -180, 0.4], [-560, 900, 2.2], [880, 560, -0.6]];
    for (const [x, z, ry] of spots) {
      const y = World.height(x, z);
      b.add(G.box(3.4, 1.0, 6.0), { x, y: y + 0.6, z, ry, color: 0x2a2d31 }); // tracks
      b.add(G.box(3.0, 1.4, 4.2), { x, y: y + 1.7, z, ry, color: 0xd62d20 });
      b.add(G.box(2.6, 1.2, 2.2), { x: x + Math.sin(ry) * 0.8, y: y + 3.0, z: z + Math.cos(ry) * 0.8, ry, color: 0xd62d20, colorFn: snowCap(0.8) });
      b.add(G.box(4.2, 1.2, 0.3), { x: x + Math.sin(ry) * 3.4, y: y + 0.9, z: z + Math.cos(ry) * 3.4, ry, color: 0xbfc4ca });
      World.addCollider(x, z, 3.2, y + 3.5, 'cat', null);
    }
    const m = new THREE.Mesh(b.build(), this.propMat); m.castShadow = true; m.receiveShadow = true; this.group.add(m);
  },

  // ---------------------------------------------------------------------------
  //  time-trial course dressing: start, gates, finish
  // ---------------------------------------------------------------------------
  showGates(runId) {
    while (this.gateGroup.children.length) { const c = this.gateGroup.children.pop(); c.geometry && c.geometry.dispose(); }
    if (!runId) return;
    const rd = World.runData[RUN_BY_ID[runId].index], gates = Scatter.gatesByRun[runId];
    const b = new GeoBuilder();
    gates.forEach((g, i) => {
      const c = i % 2 ? 0x2a6be0 : 0xd8332b;
      const ry = Math.atan2(g.tx, g.tz);
      for (const sd of [-1, 1]) {
        const x = g.x - g.tz * g.w * 0.5 * sd, z = g.z + g.tx * g.w * 0.5 * sd, y = World.height(x, z);
        b.add(G.cyl(0.04, 0.05, 1.9, 5), { x, y: y + 0.95, z, color: c });
        b.add(G.box(0.03, 0.6, 0.9), { x: x + g.tz * 0.45 * sd, y: y + 1.5, z: z - g.tx * 0.45 * sd, ry: ry + Math.PI / 2, color: c });
      }
    });
    // start and finish arches
    const arch = (s, color) => {
      const c = World.pathAt(rd, s), w = rd.run.w * 0.9;
      const ry = Math.atan2(c.tx, c.tz);
      for (const sd of [-1, 1]) {
        const x = c.x - c.tz * w * sd, z = c.z + c.tx * w * sd, y = World.height(x, z);
        b.add(G.cyl(0.5, 0.6, 5.5, 8), { x, y: y + 2.75, z, color });
      }
      const y = World.height(c.x, c.z);
      b.add(G.box(w * 2 + 1, 1.3, 0.8), { x: c.x, y: y + 5.6, z: c.z, ry: ry + Math.PI / 2, color, colorFn: snowCap(0.8) });
    };
    arch(6, 0x2fa84f);
    arch(rd.path.len - 12, 0xd8332b);
    const m = new THREE.Mesh(b.build(), this.propMat); m.castShadow = true;
    this.gateGroup.add(m);
  },

  update(dt, night) {
    for (const lift of this.lifts) this.updateLift(lift, dt);
    if (this.glowMat) this.glowMat.color.setScalar(0.15 + night * 3.0);
  },
};
