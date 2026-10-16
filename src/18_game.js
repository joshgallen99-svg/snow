// ============================================================================
//  game — boot, state machine, run sessions, lifts, saving, main loop
// ============================================================================
const SAVE_KEY = 'kitakaze-peak.v1';
const Game = {
  state: 'loading', renderer: null, scene: null, cam: null, timeScale: 1, slowmo: false,
  save: null, settings: null, session: null, liftRide: null, ghost: null, rec: null, rider: null, ghostModel: null,
  viewport: { w: 1, h: 1 }, acc: 0, last: 0, mapFrom: null, frame: 0,

  defaults() {
    return {
      v: 3, done: {}, best: {}, tokens: [], gear: { board: 'blackout', jacket: 'onyx', pants: 'jet', helmet: 'black', goggles: 'red' },
      settings: { music: 0.5, sfx: 0.8, quality: 'high', time: 'cycle', weather: 'auto', stance: 1, cine: false, ghost: false, unlockAll: false },
      ghosts: {},
    };
  },
  load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { s = null; }
    const d = this.defaults();
    this.save = Object.assign(d, s || {});
    this.save.gear = Object.assign(d.gear, (s && s.gear) || {});
    // first save format: move the old starter outfit onto the new all-black kit with red goggles
    if (s && !s.v) {
      const g = this.save.gear;
      if (g.jacket === 'tangerine' && g.pants === 'charcoal' && g.helmet === 'white' && g.board === 'birch') Object.assign(g, d.gear);
      g.goggles = g.goggles || 'red';
      this.save.v = 2;
    }
    // v3: the side-on jump camera is now off by default
    if (this.save.v < 3) { this.save.settings.cine = false; this.save.v = 3; }
    this.save.settings = Object.assign(this.defaults().settings, (s && s.settings) || {});
    this.settings = this.save.settings;
    FX.collected = new Set(this.save.tokens);
  },
  persist() {
    this.save.tokens = [...FX.collected];
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); }
    catch (e) {
      // ghosts are the big part; drop them if storage is full
      try { this.save.ghosts = {}; localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e2) { /* storage unavailable */ }
    }
  },
  resetProgress() {
    const keep = this.settings;
    this.save = this.defaults(); this.save.settings = keep; this.settings = keep;
    FX.collected = new Set();
    this.persist(); this.applyGear(); UI.refreshTitle();
    UI.toast('Progress reset. The clouds are back on the mountain.');
  },
  flakeCount() { return FX.collected.size; },
  ridden() { return Object.keys(this.save.done).length; },
  liftUnlocked(i) { return this.settings.unlockAll || this.ridden() >= LIFTS[i].unlock; },
  weatherName() { return { clear: 'Bluebird', cloudy: 'Overcast', snow: 'Snowing', storm: 'Whiteout' }[Sky.weather.state]; },

  // ---- boot -------------------------------------------------------------------
  async boot() {
    if (this.booted) return;
    this.booted = true;
    const tick = () => new Promise((r) => setTimeout(r, 0));
    this.load();
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    $('game').appendChild(renderer.domElement);
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.cam = Cam.init(innerWidth / innerHeight);
    Input.init(renderer.domElement);
    UI.init();

    const gen = generateTerrain();
    const labels = ['Raising the volcano', 'Smoothing the slopes', 'Padding the lift stations', 'Surveying the runs', 'Cutting the runs', 'Grading the pistes', 'Sifting the powder'];
    const total = gen.steps.length + 12;
    let k = 0;
    const step = async (label, fn) => { UI.loading(k / total, label); await tick(); const t0 = performance.now(); fn(); k++; console.info('[boot]', label, Math.round(performance.now() - t0) + 'ms'); };
    for (let i = 0; i < gen.steps.length; i++) await step(labels[i] || 'Shaping the mountain', gen.steps[i]);
    World.init(gen.finish());
    const sc = []; Scatter.run(sc);
    const scLabels = ['Plowing the roads', 'Building the village', 'Mapping the forest', 'Planting the birch and fir', 'Placing rocks and snowflakes'];
    for (let i = 0; i < sc.length; i++) await step(scLabels[i], sc[i]);
    await step('Laying the snow', () => TerrainMesh.init(this.scene));
    await step('Dumping fresh powder', () => Snow.init(this.scene, this.settings.quality));
    await step('Growing the forest', () => Vegetation.init(this.scene));
    await step('Stringing the lift cables', () => Structures.init(this.scene));
    await step('Lighting the sky', () => { Sky.init(this.scene); FX.init(this.scene); });
    await step('Printing the trail map', () => MapView.init(this.scene));
    await step('Polishing goggles', () => {
      ENV_MAP = Sky.makeEnv(renderer);
      for (const m of [Structures.metalMat]) { m.envMap = ENV_MAP; m.envMapIntensity = 0.45; m.needsUpdate = true; }
    });
    await step('Waxing your board', () => {
      this.rider = new RiderModel(); this.scene.add(this.rider.group);
      this.ghostModel = new RiderModel({ ghost: true }); this.scene.add(this.ghostModel.group); this.ghostModel.group.visible = false;
      this.applyGear();
      this.rider.applyEnv();
      Post.init(renderer);
    });
    this.onResize(); addEventListener('resize', () => this.onResize());
    this.applySettings();
    await step('Warming up', () => {
      this.setLodgeCam(true);
      Sky.update(0, this.cam, this.cam.position, 'title');
      TerrainMesh.update(this.cam, true);
      renderer.compile(this.scene, this.cam);
    });
    document.fonts && document.fonts.ready.then(() => Structures.buildSigns()).catch(() => Structures.buildSigns());
    UI.loading(1, 'Ready');
    await tick();
    UI.doneLoading();
    this.toLodge(true);
    this.last = performance.now();
    renderer.setAnimationLoop(() => this.loop());
    if (window.claude?.hot?.snapshot) window.claude.hot.snapshot(() => ({ state: this.state }));
  },
  onResize() {
    const q = this.settings.quality;
    const scale = this.perf ? this.perf.scale : 1;
    const pr = (q === 'low' ? 0.7 : q === 'medium' ? Math.min(1, devicePixelRatio) : Math.min(1.5, devicePixelRatio)) * scale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%';
    this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    if (Post.sceneRT) Post.resize(s.x, s.y);
    this.viewport = { w: innerWidth, h: innerHeight };
    FX.mat && (FX.mat.uniforms.uPx.value = s.y / 1080);
    Sky.snowU && (Sky.snowU.uPx.value = s.y / 1080);
    FX.glowU && (FX.glowU.uPx.value = s.y / 1080);
  },
  applySettings() {
    const s = this.settings;
    Sound.setVolumes(s.music, s.sfx);
    if (s.time === 'cycle') Sky.cycle = true; else { Sky.cycle = false; Sky.time = +s.time; }
    Sky.autoWeather = s.weather === 'auto';
    if (s.weather !== 'auto' && Sky.weather.state !== s.weather) Sky.setWeather(s.weather, !this.weatherApplied);
    this.weatherApplied = true;
    Cam.cineOn = s.cine;
    if (this.rider) this.rider.stance = s.stance;
    if (this.renderer) {
      const q = s.quality;
      Sky.sun && (Sky.sun.castShadow = q !== 'low');
      if (Sky.sun && Sky.sun.shadow.mapSize.x !== (q === 'high' ? 2048 : 1024)) {
        Sky.sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
        if (Sky.sun.shadow.map) { Sky.sun.shadow.map.dispose(); Sky.sun.shadow.map = null; }
      }
      this.onResize();
    }
  },
  applyGear() { if (this.rider) this.rider.setGear(this.save.gear); },

  // ---- screens ---------------------------------------------------------------------
  hideAllModes() {
    UI.closeAll(); UI.hud(false); UI.map(false); MapView.show(false); UI.liftHint(''); UI.prompt('');
    $('title').hidden = true;
    this.ghostModel.group.visible = false;
    Structures.showGates(null);
    this.setSlowmo(false);
  },
  toLodge(first = false) {
    this.hideAllModes();
    this.state = 'title';
    this.session = null;
    $('title').hidden = false;
    UI.refreshTitle();
    this.setLodgeCam(first);
    this.placeRiderAtLodge();
  },
  closePanel() {
    if (UI.returnToPause) { UI.open('pause'); return; }
    if (this.state === 'locker') { this.toLodge(); return; }
    UI.closeAll();
    if (this.state === 'title') $('title').hidden = false;
  },
  openLocker() {
    this.hideAllModes();
    this.state = 'locker';
    UI.renderLocker(); UI.open('locker');
    this.placeRiderAtLodge();
  },
  lodgeInfo() {
    const b = Scatter.buildings[0];
    const toPeak = new V3(SUMMIT[0] - b.x, 0, SUMMIT[1] - b.z).normalize();
    return { b, toPeak };
  },
  placeRiderAtLodge() {
    const { b, toPeak } = this.lodgeInfo();
    const side = new V3(-toPeak.z, 0, toPeak.x);
    const p = new V3(b.x, 0, b.z).addScaledVector(toPeak, b.d * 0.5 + 16).addScaledVector(side, 10);
    p.y = World.groundHeight(p.x, p.z);
    this.lodgeSpot = p;
    Player.reset(p.x, p.z, Math.atan2(side.x, side.z));
    Player.frozen = true;
    if (Snow.mesh) { Snow.recenter(p.x, p.z); Snow.stampRect(p.x, p.z, 1, 0, 0.8, 0.16, 1); for (let k = 1; k < 7; k++) Snow.stampCircle(p.x + k * 0.55, p.z + Math.sin(k) * 0.3, 0.17, 0.7); }
  },
  setLodgeCam(snap) {
    Cam.setMode('lodge', snap ? 0.01 : 1.2);
    if (snap) Cam.snap();
  },
  lodgePose(t) {
    const { b, toPeak } = this.lodgeInfo();
    const side = new V3(-toPeak.z, 0, toPeak.x);
    if (this.state === 'locker' && this.lodgeSpot) {
      const r = this.lodgeSpot;
      const a = t * 0.25;
      const o = new V3(Math.sin(a), 0, Math.cos(a));
      const right = new V3().crossVectors(o.clone().negate(), UP).normalize();
      // look a little to the right of the rider so they stand clear of the locker panel
      return { pos: r.clone().addScaledVector(o, 4.3).add(new V3(0, 1.45, 0)), look: r.clone().add(new V3(0, 0.85, 0)).addScaledVector(right, innerWidth > 800 ? 1.25 : 0), fov: 42 };
    }
    const sway = Math.sin(t * 0.05) * 18;
    const pos = new V3(b.x, b.y, b.z).addScaledVector(toPeak, -70).addScaledVector(side, 46 + sway).add(new V3(0, 14, 0));
    const look = new V3(b.x, b.y, b.z).addScaledVector(toPeak, 260).add(new V3(0, 120, 0));
    return { pos, look, fov: 50 };
  },

  // ---- map -------------------------------------------------------------------------
  openMap() {
    Sound.init();
    this.hideAllModes();
    this.state = 'map';
    this.session = null;
    UI.map(true); MapView.show(true);
    MapView.selected = -1; MapView.hover = -1;
    UI.showLiftPanel(-1);
    Cam.setMode('map', 1.4);
    Player.frozen = true;
  },
  chooseRun(runId, mode) {
    const run = RUN_BY_ID[runId];
    const lift = Structures.lifts[LIFT_BY_ID[run.lift].index];
    this.hideAllModes();
    this.startLiftRide(lift, () => this.startRun(run, mode));
  },

  // ---- lift ride cinematic -------------------------------------------------------------
  startLiftRide(lift, onDone) {
    this.state = 'lift';
    const dur = clamp(lift.len / 75, 9, 16);
    this.liftRide = { lift, t: 0, dur, onDone, shot: 0, shotT: 0, anchor: null };
    // the player's own chair / cabin / T-bar travels with them through the time-lapse
    if (!lift.playerCarrier) {
      lift.playerCarrier = new THREE.Mesh(lift.carriers.geometry, Structures.metalMat);
      lift.playerCarrier.castShadow = true;
      this.scene.add(lift.playerCarrier);
    }
    lift.playerCarrier.visible = true;
    Player.frozen = true;
    UI.liftHint(`Riding <b>${esc(lift.def.name)}</b> · <kbd>Space</kbd> to skip`);
    Cam.setMode('lift', 1.2);
    Sound.clack();
  },
  liftPose(dt) {
    const R = this.liftRide, lift = R.lift, T = lift.type;
    R.t += dt;
    const u = clamp(R.t / R.dur, 0, 1);
    const k = u * u * (3 - 2 * u) * 0.7 + u * 0.3;
    const s = 3 + k * (lift.upLen - 6);
    const p = Structures.loopAt(lift, s, {});
    const travel = new V3(p.tx, 0, p.tz);
    lift.playerCarrier.position.set(p.x, p.y, p.z);
    lift.playerCarrier.rotation.set(0, Math.atan2(p.tx, p.tz), 0);
    const ahead = Structures.loopAt(lift, s + 6, {});
    const slope = new V3(ahead.x - p.x, ahead.y - p.y, ahead.z - p.z).normalize();
    // rider placement
    const rm = this.rider;
    rm.group.visible = !T.cabin;
    if (T.surface) {
      const gy = World.height(p.x, p.z);
      const nose = travel.clone();
      rm.pose.sit = 0; rm.pose.crouch = 0.25; rm.pose.arms = 0.2; rm.pose.grab = null; rm.pose.grabAmt = 0;
      const n = World.normal(p.x, p.z, new V3());
      // sideways to the track, like real riders on a T-bar, nose uphill
      rm.setBoard(new V3(p.x, gy, p.z), nose, n);
    } else {
      rm.pose.sit = 1;
      const by = new V3(0, 1, 0), bz = travel.clone();
      const bx = new V3().crossVectors(by, bz);
      rm.setBoard(new V3(p.x, p.y - 3.05, p.z).addScaledVector(travel, 0.42), bx, by);
    }
    rm.solvePose(dt); rm.draw();
    // camera shots: behind, wide side, and a look back at the rider
    R.shotT += dt;
    if (R.shotT > 4.5) { R.shotT = 0; R.shot = (R.shot + 1) % 3; R.anchor = null; Sound.clack(); }
    const side = new V3(-travel.z, 0, travel.x);
    const seat = T.surface ? new V3(p.x, World.height(p.x, p.z) + 1.3, p.z) : new V3(p.x, p.y - (T.cabin ? 2.6 : 2.0), p.z);
    let pos, look, fov = 52;
    if (R.shot === 0) {
      pos = seat.clone().addScaledVector(slope, -6.5).addScaledVector(side, 2.6).add(new V3(0, 3.0, 0));
      look = seat.clone().addScaledVector(slope, 20).add(new V3(0, -4, 0));
    } else if (R.shot === 1) {
      if (!R.anchor) {
        const a = seat.clone().addScaledVector(slope, 30).addScaledVector(side, 22);
        a.y = Math.max(World.height(a.x, a.z) + 3, seat.y - 4);
        R.anchor = a;
      }
      pos = R.anchor; look = seat.clone(); fov = 40;
    } else {
      pos = seat.clone().addScaledVector(slope, 5.5).addScaledVector(side, -1.2).add(new V3(0, 0.6, 0));
      look = seat.clone().addScaledVector(slope, -10).add(new V3(0, -1.0, 0)); fov = 58;
    }
    const gy = World.height(pos.x, pos.z) + 1.2;
    if (pos.y < gy) pos.y = gy;
    if (R.t >= R.dur || Input.hit('Space', 'Enter', 'Mouse0')) {
      UI.liftHint('');
      lift.playerCarrier.visible = false;
      this.liftRide = null;
      rm.group.visible = true; rm.pose.sit = 0;
      R.onDone();
    }
    return { pos, look, fov };
  },

  // ---- riding -------------------------------------------------------------------------------
  startRun(run, mode) {
    this.hideAllModes();
    this.state = 'ride';
    const rd = World.runData[run.index];
    const c = World.pathAt(rd, 4);
    Player.frozen = false;
    Player.reset(c.x, c.z, Math.atan2(c.tx, c.tz), mode === 'tt' ? 0 : 3);
    Snow.recenter(c.x, c.z, true);
    Cam.setMode('chase', 0.9); Cam.dir.set(c.tx, 0, c.tz);
    const gates = mode === 'tt' ? Scatter.gatesByRun[run.id] : [];
    this.session = {
      run, rd, mode, timer: 0, started: mode !== 'tt', gi: 0, missed: 0, splits: [], hint: -1, progress: 0,
      score: 0, flakes0: this.runFlakes(run), crashes: 0, topSpeed: 0, finished: false, gates, startTop: true,
      runOn: run, freeRuns: {},
    };
    if (mode === 'tt') Structures.showGates(run.id);
    UI.setRunHeader(run, mode);
    UI.hud(true);
    UI.message(run.name, mode === 'tt' ? 'Time trial · the clock starts when you drop in' : 'Free ride · go anywhere', 2200);
    // ghost of the best run
    this.rec = { frames: [], t: 0 };
    this.ghost = null;
    if (mode === 'tt' && this.settings.ghost && this.save.ghosts[run.id]) {
      try { this.ghost = { data: this.decodeGhost(this.save.ghosts[run.id]), t: 0 }; } catch (e) { this.ghost = null; }
    }
    this.ghostModel.group.visible = !!this.ghost;
    FX.breakTrail();
  },
  freeRideOn() {
    const s = this.session;
    if (!s) return this.openMap();
    UI.closeAll();
    this.state = 'ride';
    s.mode = 'free'; s.finished = false;
    Structures.showGates(null);
    UI.setRunHeader(s.run, 'free'); UI.hud(true);
    Player.frozen = false;
  },
  rideAgain() {
    const s = this.session;
    if (!s) return this.openMap();
    const run = s.run, mode = s.mode;
    const lift = Structures.lifts[LIFT_BY_ID[run.lift].index];
    this.hideAllModes();
    this.startLiftRide(lift, () => this.startRun(run, mode));
  },
  restartRun() {
    const s = this.session;
    UI.closeAll();
    if (!s) return this.openMap();
    this.startRun(s.run, s.mode);
  },
  runFlakes(run) { return Scatter.tokens.filter((t) => t.run === run.index && FX.collected.has(t.id)).length; },
  pause() {
    if (this.state !== 'ride') return;
    this.state = 'paused';
    $('pRun').textContent = this.session ? this.session.run.name : 'Free ride';
    UI.open('pause');
  },
  resume() { UI.closeAll(); this.state = 'ride'; this.last = performance.now(); },
  setSlowmo(on) {
    this.slowmo = on;
    this.timeScale = on ? 0.22 : 1;
    if (on) { Cam.orbit.yaw = Math.atan2(-Cam.dir.x, -Cam.dir.z) + 0.8; Cam.orbit.pitch = 0.3; Cam.orbit.dist = 6; Cam.setMode('orbit', 0.5); }
    else if (Cam.mode === 'orbit') Cam.setMode('chase', 0.5);
  },

  handleEvents() {
    const s = this.session;
    for (const e of Player.events) {
      if (e.type === 'trick') { UI.trick(e); Sound.trick(e.mult); if (s) s.score += e.pts; }
      else if (e.type === 'land') {
        if (e.air > 0.15) { Sound.land(e.impact); Cam.kick(clamp(e.impact / 14, 0, 0.8)); const S = Player.surf; FX.impact(Player.pos.x, Player.pos.y, Player.pos.z, Player.vel.x, Player.vel.z, clamp(e.impact / 12, 0.1, 1.2), S.powder * (1 - S.groom)); }
        if (Cam.mode === 'cine') Cam.setMode('chase', 0.7);
      } else if (e.type === 'takeoff') { if (e.ollie) Sound.pop(); Cam.startCine(Player); FX.breakTrail(); }
      else if (e.type === 'crash') {
        Sound.crash(); Cam.kick(1.2);
        if (s) s.crashes++;
        UI.message(e.reason, 'Shake it off', 1800);
        const spin = new V3().crossVectors(UP, Player.vel).normalize().multiplyScalar(2 + Player.vel.length() * 0.35);
        spin.x += (Math.random() - 0.5) * 3; spin.z += (Math.random() - 0.5) * 3;
        this.rider.startRagdoll(Player.vel.clone().multiplyScalar(0.8), spin);
        FX.impact(Player.pos.x, Player.pos.y, Player.pos.z, Player.vel.x, Player.vel.z, 1.2, Player.surf.powder * (1 - Player.surf.groom) + 0.3);
        if (Cam.mode === 'cine') Cam.setMode('chase', 0.5);
      } else if (e.type === 'bump') { if (e.into > 2) Sound.bump(); }
      else if (e.type === 'brush') {
        // snow shaken off the branches falls around you
        const t = e.tree, n = t.type ? 14 : 34;
        for (let k = 0; k < n; k++) {
          const a = Math.random() * TAU, r = Math.random() * (t.type ? 1.2 : 2.2) * t.s, h = t.y + (1.5 + Math.random() * 6) * t.s;
          const clump = Math.random() < 0.45;
          if (clump) FX.spawn(t.x + Math.cos(a) * r, h, t.z + Math.sin(a) * r, Player.vel.x * 0.1, -0.5 - Math.random(), Player.vel.z * 0.1, 2.5, 0.09 + Math.random() * 0.08, 0.07, 1, 1, 1, 1, 1, 0.4, 1, 1, 1);
          else FX.spawn(t.x + Math.cos(a) * r, h, t.z + Math.sin(a) * r, Player.vel.x * 0.1, -0.5 - Math.random(), Player.vel.z * 0.1, 1.6 + Math.random(), 0.25, 1.5, 0.5, 1, 1, 1, 0.5, 1.4);
        }
        Sound.brush();
      }
      else if (e.type === 'grindStart') { Sound.grind(true); Cam.kick(0.15); }
      else if (e.type === 'lostBalance') { UI.message('Lost your balance', '', 1100); Sound.bump(); }
      else if (e.type === 'railPop') Sound.pop();
      else if (e.type === 'perfectPop') { UI.trick({ name: 'Perfect pop', pts: 0, mult: 1, pop: true }); Sound.chime(7); Cam.kick(0.2); }
      else if (e.type === 'comboEnd' && e.n > 1) UI.toast(`Combo ×${e.n} banked · ${e.pts.toLocaleString()} points`, 1800);
      else if (e.type === 'comboLost' && e.pts > 0) UI.toast(`Combo lost (${e.pts.toLocaleString()})`, 1600);
    }
    if (!Player.grind) Sound.grind(false);
    Player.events.length = 0;
  },

  respawn(msg) {
    const sf = Player.safe || { x: Player.pos.x, z: Player.pos.z };
    this.rider.stopRagdoll();
    Player.reset(sf.x, sf.z, Player.fallLineYaw(sf.x, sf.z), 0);
    Cam.setMode('chase', 0.6);
    FX.breakTrail();
    if (msg) UI.message(msg, '', 1200);
  },

  outOfBounds() {
    const p = Player.pos;
    if (!World.inBounds(p.x, p.z)) return true;
    return polyDist(RAVINE, p.x, p.z, _tmp3) < 70;
  },

  rideUpdate(dt) {
    const s = this.session, pl = Player;
    // physics at 120 Hz
    this.acc += dt;
    const h = 1 / 120;
    let n = 0;
    while (this.acc >= h && n < 12) { pl.step(h); this.acc -= h; n++; if (this.rider.ragdoll) this.rider.stepRagdoll(h); }
    if (n >= 12) this.acc = 0;
    if (pl.crashed) {
      pl.crashT += dt;
      pl.pos.copy(this.rider.J[J.pelvis]);
      Snow.stampBody(this.rider.J);
      const R = this.rider.ragdoll;
      if (R && (R.still > 1.1 || R.t > 5)) this.respawn();
    }
    this.handleEvents();
    if (!pl.crashed && this.outOfBounds()) { UI.message('Off limits', 'That ravine is closed. Back to the resort.', 2000); this.respawn(); }
    if (Input.hit('KeyR')) this.respawn('Respawned');
    // run tracking
    if (s && !pl.crashed) {
      const rd = s.rd;
      const near = World.nearestOnRun(rd, pl.pos.x, pl.pos.z, s.hint);
      s.hint = near.d < rd.run.w * 3 ? near.i : -1;
      if (near.d < rd.run.w * 2.5) s.progress = Math.max(s.progress, near.s / rd.path.len);
      s.topSpeed = Math.max(s.topSpeed, pl.speed);
      if (s.mode === 'tt') {
        if (!s.started && near.s > 8) { s.started = true; Sound.gate(true); }
        if (s.started && !s.finished) s.timer += dt;
        this.gateCheck(s);
      }
      if (!s.finished && near.s > rd.path.len - 14 && near.d < rd.run.w + 20) this.finishRun(s);
      // free ride: count other runs you ride top to bottom
      if (s.mode === 'free') this.trackFreeRuns(s);
    }
    // tokens
    FX.updateTokens(U.uTime.value, pl, (tk) => {
      Sound.chime(Math.random() * 3);
      this.persist();
      const run = RUNS[tk.run];
      const total = Scatter.tokens.filter((t) => t.run === tk.run).length;
      UI.toast(`Snowflake ${this.runFlakes(run)}/${total} on ${run.name}`, 1500);
    });
    // lift base prompt
    let prompt = '';
    if (!pl.crashed && pl.speed < 7) {
      for (const lift of Structures.lifts) {
        const a = lift.stationA;
        if (Math.hypot(pl.pos.x - a.x, pl.pos.z - a.z) < 34) {
          if (this.liftUnlocked(lift.index)) {
            prompt = `<kbd>E</kbd> Ride ${esc(lift.def.name)} &nbsp; <kbd>M</kbd> Mountain cam`;
            if (Input.hit('KeyE')) { this.hideAllModes(); this.startLiftRide(lift, () => this.startTopFreeRide(lift)); return; }
          } else prompt = `${esc(lift.def.name)} is still closed · ride more runs to open it`;
          break;
        }
      }
    }
    UI.prompt(prompt);
    // ghost
    this.recordGhost(dt);
    this.playGhost(dt);
  },
  startTopFreeRide(lift) {
    // drop in on the first run from this lift as a free ride
    const run = RUNS.find((r) => r.lift === lift.def.id);
    this.startRun(run, 'free');
  },
  trackFreeRuns(s) {
    const ri = World.attr(World.runId, Player.pos.x, Player.pos.z);
    if (ri === 255) return;
    const rd = World.runData[ri];
    const near = World.nearestOnRun(rd, Player.pos.x, Player.pos.z);
    const st = s.freeRuns[ri] || (s.freeRuns[ri] = { top: false });
    if (near.s < 80) st.top = true;
    if (st.top && near.s > rd.path.len - 16 && !this.save.done[rd.run.id]) this.markDone(rd.run);
  },
  markDone(run) {
    const before = LIFTS.map((_, i) => this.liftUnlocked(i));
    this.save.done[run.id] = true;
    this.persist();
    const opened = LIFTS.filter((L, i) => !before[i] && this.liftUnlocked(i)).map((L) => L.name);
    if (opened.length) setTimeout(() => UI.toast(`The clouds lift: ${opened.join(' and ')} ${opened.length > 1 ? 'are' : 'is'} now open`, 3800), 400);
    return opened.join(', ');
  },
  gateCheck(s) {
    const g = s.gates[s.gi];
    if (!g) return;
    const p = Player.pos;
    const along = (p.x - g.x) * g.tx + (p.z - g.z) * g.tz;
    if (along >= 0) {
      const lat = Math.abs(-(p.x - g.x) * g.tz + (p.z - g.z) * g.tx);
      const ok = lat <= g.w / 2 + 0.6;
      if (ok) {
        Sound.gate(true);
        s.splits.push(s.timer);
        const best = this.save.best[s.run.id];
        if (best && best.splits && best.splits[s.splits.length - 1] != null) UI.split(s.timer - best.splits[s.splits.length - 1]);
      } else {
        s.missed++; s.splits.push(null); Sound.gate(false);
        UI.message('Missed gate', '+3 seconds', 1200);
      }
      s.gi++;
    }
  },
  finishRun(s) {
    s.finished = true;
    const opened = !this.save.done[s.run.id] ? this.markDone(s.run) : '';
    const flakes = this.runFlakes(s.run), total = Scatter.tokens.filter((t) => t.run === s.run.index).length;
    if (s.mode === 'tt') {
      const time = s.timer + s.missed * 3;
      const prev = this.save.best[s.run.id];
      const newBest = !prev || time < prev.t;
      if (newBest) {
        this.save.best[s.run.id] = { t: time, splits: s.splits };
        try { this.save.ghosts[s.run.id] = this.encodeGhost(this.rec.frames); } catch (e) { /* ghost too large */ }
      }
      this.persist();
      Sound.chime(5);
      Player.frozen = true;
      this.state = 'results';
      UI.hud(false);
      UI.results({ mode: 'tt', run: s.run, time, best: prev ? prev.t : null, newBest: newBest && !!prev, gates: s.gates.length, missed: s.missed, flakes, flakesTotal: total, score: s.score, topSpeed: s.topSpeed, crashes: s.crashes, unlocked: opened });
    } else {
      UI.toast(`${s.run.name} ridden · ${flakes}/${total} snowflakes · ${s.score.toLocaleString()} points`, 3200);
      Sound.chime(3);
    }
  },

  // ---- ghost ----------------------------------------------------------------------------------
  recordGhost(dt) {
    const s = this.session;
    if (!s || s.mode !== 'tt' || !s.started || s.finished) return;
    this.rec.t += dt;
    if (this.rec.t < 1 / 15) return;
    this.rec.t = 0;
    const r = this.rider;
    this.rec.frames.push([r.bpos.x, r.bpos.y, r.bpos.z, r.bx.x, r.bx.y, r.bx.z, r.by.x, r.by.y, r.by.z, r.pose.crouch]);
  },
  playGhost(dt) {
    const G2 = this.ghost, s = this.session;
    if (!G2 || !s || !s.started) return;
    G2.t += dt;
    const f = G2.t * 15, i = Math.floor(f), u = f - i, d = G2.data;
    if (i >= d.length - 1) { this.ghostModel.group.visible = false; return; }
    const a = d[i], b = d[i + 1], L = (k) => lerp(a[k], b[k], u);
    const m = this.ghostModel;
    m.stance = this.settings.stance;
    m.setBoard(new V3(L(0), L(1), L(2)), new V3(L(3), L(4), L(5)), new V3(L(6), L(7), L(8)));
    m.pose.crouch = L(9);
    m.solvePose(dt); m.draw();
  },
  encodeGhost(frames) {
    const f = new Float32Array(frames.length * 10);
    frames.forEach((fr, i) => f.set(fr, i * 10));
    const bytes = new Uint8Array(f.buffer);
    let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  },
  decodeGhost(b64) {
    const s = atob(b64), bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    const f = new Float32Array(bytes.buffer), out = [];
    for (let i = 0; i < f.length; i += 10) out.push(Array.from(f.subarray(i, i + 10)));
    return out;
  },

  // ---- rider drawing ----------------------------------------------------------------------------
  drawRider(dt) {
    const pl = Player, m = this.rider;
    if (m.ragdoll) { m.draw(); return; }
    const bx = new V3(), by = new V3();
    pl.boardFrame(bx, by);
    const pos = pl.pos.clone();
    // on a press the board rests on one end, so its middle lifts off the snow
    if (!pl.air) pos.addScaledVector(pl.n, Math.abs(Math.sin(pl.pitch)) * 0.7);
    m.stance = this.settings.stance;
    m.setBoard(pos, bx, by);
    const P = m.pose;
    P.sit = 0;
    P.crouch = pl.crouch;
    P.tuck = pl.tuck;
    P.brake = pl.brake;
    const travel = bx.clone().multiplyScalar(pl.ride);
    const left = new V3().crossVectors(UP, travel).normalize();
    P.lean = damp(P.lean, clamp(pl.edge * left.dot(m.bz) * 1.7, -1, 1), 10, dt);
    P.arms = damp(P.arms, pl.ground ? 0.25 + sstep(5, 25, pl.speed) * 0.2 + Math.abs(pl.edge) * 0.3 : 0.75, 6, dt);
    const g = pl.air && pl.air.grab;
    if (g) P.grab = g;
    P.grabAmt = damp(P.grabAmt, g ? 1 : 0, 14, dt);
    if (P.grabAmt < 0.02) P.grab = null;
    P.twist = damp(P.twist, clamp(pl.spinVel * 0.06, -0.5, 0.5), 8, dt);
    P.look = 0.72; P.lookDir = pl.ride;
    // weight over the pressed end
    P.press = damp(P.press || 0, pl.air ? 0 : -Math.sign(pl.pitch) * Math.min(1, Math.abs(pl.pitch) * 4), 10, dt);
    P.wave += dt * (1 + pl.speed * 0.1);
    m.solvePose(dt); m.draw();
  },

  // ---- main loop -----------------------------------------------------------------------------------
  // dynamic resolution: keep the frame rate up on slower GPUs
  perfTick(raw) {
    const P = this.perf || (this.perf = { acc: 0, n: 0, scale: 1, wait: 3 });
    if (P.wait > 0) { P.wait -= raw; return; }
    P.acc += raw; P.n++;
    if (P.acc < 2) return;
    const avg = P.acc / P.n;
    P.acc = 0; P.n = 0;
    if (avg > 1 / 42 && P.scale > 0.55) { P.scale = Math.max(0.55, P.scale - 0.1); this.onResize(); }
    else if (avg < 1 / 57 && P.scale < 1) { P.scale = Math.min(1, P.scale + 0.05); this.onResize(); }
  },
  // run the game forward without drawing (headless checks and screenshots on slow renderers)
  simulate(sec, fps = 60) {
    this.noRender = true;
    const n = Math.round(sec * fps);
    for (let i = 0; i < n; i++) { this.fakeNow = this.last + 1000 / fps; this.loop(); }
    this.fakeNow = null; this.noRender = false; this.last = performance.now();
  },
  loop() {
    const now = this.fakeNow ?? performance.now();
    const raw = (now - this.last) / 1000;
    if (!this.testMode) this.perfTick(Math.min(raw, 0.5));
    let rdt = Math.min(0.05, raw);
    this.last = now;
    this.frame++;
    const dt = rdt * this.timeScale;
    U.uTime.value += rdt;
    const st = this.state;
    // global keys
    if (Input.hit('Escape', 'KeyP')) {
      if (st === 'ride') this.pause(); else if (st === 'paused') this.resume();
      else if (st === 'map' && MapView.selected >= 0) MapView.select(-1);
    }
    if (Input.hit('KeyN')) { Sound.init(); const on = Sound.toggleMusic(); UI.toast(on ? 'Music on' : 'Music off', 1200); }
    if (Input.hit('KeyM') && (st === 'ride' || st === 'results' || st === 'paused')) this.openMap();
    if (Input.hit('KeyC') && st === 'ride') this.setSlowmo(!this.slowmo);
    if (this.slowmo) {
      if (Input.mouse.buttons) { Cam.orbit.yaw -= Input.mouse.dx * 0.006; Cam.orbit.pitch = clamp(Cam.orbit.pitch + Input.mouse.dy * 0.004, -0.15, 1.3); }
      if (Input.mouse.wheel) Cam.orbit.dist = clamp(Cam.orbit.dist * Math.exp(Input.mouse.wheel * 0.001), 2, 30);
    }
    // state updates
    let pose = null;
    if (st === 'ride') { this.rideUpdate(dt); this.drawRider(dt); }
    else if (st === 'lift') pose = this.liftPose(rdt);
    else if (st === 'map') { MapView.update(rdt, this.cam, this.viewport); pose = MapView.pose; UI.mapTick(); }
    else if (st === 'title' || st === 'locker') {
      pose = this.lodgePose(U.uTime.value);
      if (st === 'locker' || st === 'title') this.drawIdle(rdt);
    } else if (st === 'paused' || st === 'results') { /* frozen */ }
    if (Cam.mode === 'cine' && Cam.cine) { Cam.cine.t += dt; if (Cam.cine.t > 4) Cam.setMode('chase', 0.6); }
    Cam.update(st === 'ride' ? dt : rdt, { player: Player, pose });
    // world
    Structures.update(rdt, Sky.night);
    Sky.update(rdt, this.cam, st === 'ride' || st === 'paused' ? Player.pos : this.cam.position.clone().setY(World.height(this.cam.position.x, this.cam.position.z)), st === 'map' ? 'map' : 'ride');
    this.updateLamps();
    if (st === 'ride') { FX.boardSpray(dt, Player); FX.railSpray(dt, Player); FX.trailUpdate(Player); this.speedMotes(dt); }
    if (st === 'ride' || st === 'title' || st === 'locker' || st === 'lift') FX.emitAmbient(dt, this.cam, Sky.night, Sky.weather.wind);
    FX.update(dt);
    FX.updateLight(this.cam);
    FX.glowU.uOn.value = U.uLampOn.value;
    if (st !== 'ride') FX.updateTokens(U.uTime.value, null, () => {});
    TerrainMesh.update(this.cam);
    // the fresh-snow layer follows whoever is standing in it
    const snowOn = st === 'ride' || st === 'paused' || st === 'results' || st === 'title' || st === 'locker';
    Snow.show(snowOn);
    if (snowOn) { const f = st === 'title' || st === 'locker' ? this.lodgeSpot : Player.pos; if (f) Snow.focus(f.x, f.z); }
    Snow.update();
    Vegetation.update(this.cam, st === 'map');
    this.rider.group.visible = st !== 'map' && !(st === 'lift' && this.liftRide && this.liftRide.lift.type.cabin);
    Sound.updateRide(Player, st === 'ride' ? 'ride' : st, Sky.weather);
    if (this.frame % 30 === 0) Sound.setMood(Sky.night, Sky.weather.snow);
    if (st === 'ride') UI.updateHud(Player, this.hudInfo());
    // post
    const envK = lerp(0.08, 1, sstep(-0.1, 0.25, Sky.sunE)) * (1 - Sky.weather.overcast * 0.4);
    if (this.rider.mats.lens.envMap) { this.rider.mats.lens.envMapIntensity = 1.4 * envK; this.rider.mats.gloss.envMapIntensity = 0.5 * envK; this.rider.mats.board.envMapIntensity = 0.4 * envK; }
    if (Structures.metalMat.envMap) Structures.metalMat.envMapIntensity = 0.45 * envK;
    Post.uni.uExposure.value = Sky.exposure;
    Post.uni.uBloom.value = this.settings.quality === 'low' ? 0 : lerp(0.22, 0.65, Sky.night);
    Post.uni.uSpeed.value = damp(Post.uni.uSpeed.value, st === 'ride' && !Player.crashed ? sstep(11, 30, Player.speed) : 0, 4, rdt);
    Post.uni.uLetter.value = damp(Post.uni.uLetter.value, this.slowmo || st === 'lift' ? 1 : 0, 5, rdt);
    Post.uni.uSat.value = this.slowmo ? 0.85 : 1.08;
    Post.uni.uGrade.value = 1 - Sky.night;
    const hov = st === 'map' ? (MapView.hover >= 0 ? MapView.hover : MapView.selected) : -1;
    if (!this.noRender) Post.render(this.scene, this.cam, hov >= 0 ? Structures.lifts[hov].layer : null);
    Input.endFrame();
  },
  // ice crystals hanging in the air ahead: they whip past the lens at speed
  speedMotes(dt) {
    const sp = Player.speed, rate = sstep(7, 30, sp) * 110 * dt;
    if (rate <= 0 || Player.crashed) return;
    const c = this.cam, f = new V3(), r = new V3(), u = new V3();
    c.getWorldDirection(f); r.crossVectors(f, UP).normalize(); u.crossVectors(r, f);
    let n = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
    while (n-- > 0) {
      const d = 5 + Math.random() * 20, x = (Math.random() - 0.5) * 16, y = (Math.random() - 0.4) * 7;
      const p = new V3().copy(c.position).addScaledVector(f, d).addScaledVector(r, x).addScaledVector(u, y);
      FX.spawn(p.x, p.y, p.z, Sky.weather.wind * 1.5, -0.2, 0, 1.1, 0.04, 0.04, 0.6, 1, 1, 1, 0.01, 0.2, 1, 1, 0);
    }
  },
  drawIdle(dt) {
    const m = this.rider, p = this.lodgeSpot;
    if (!p) return;
    m.stopRagdoll();
    const n = World.normal(p.x, p.z, new V3());
    const a = this.state === 'locker' ? 0 : 0.6;
    m.setBoard(p, new V3(Math.cos(a), 0, Math.sin(a)), n);
    Object.assign(m.pose, { sit: 0, crouch: 0.12 + Math.sin(U.uTime.value * 1.3) * 0.03, tuck: 0, brake: 0, lean: 0, arms: 0.15, grab: null, grabAmt: 0, twist: Math.sin(U.uTime.value * 0.5) * 0.2, look: 0.3, lookDir: 1 });
    m.pose.wave += dt;
    m.solvePose(dt); m.draw();
  },
  hudInfo() {
    const s = this.session, pl = Player, S = pl.surf;
    const surfaceName = pl.grind ? (pl.grind.g.kind === 'box' ? 'Box' : 'Rail') : !pl.ground ? 'Air' : S.road > 0.5 ? 'Road' : S.groom > 0.5 ? 'Groomed' : S.powder > 0.6 ? 'Powder' : 'Off-piste';
    return { run: s ? s.run : null, mode: s ? s.mode : 'free', timer: s ? s.timer + (s.missed || 0) * 3 : 0, progress: s ? s.progress : 0, score: s ? s.score : 0, surfaceName, weatherName: this.weatherName() };
  },
  updateLamps() {
    if (this.frame % 10 !== 0) return;
    const c = this.state === 'ride' ? Player.pos : this.cam.position;
    const heads = Structures.lampHeads.map((h) => [h, (h.x - c.x) ** 2 + (h.z - c.z) ** 2]).sort((a, b) => a[1] - b[1]);
    const L = U.uLamps.value;
    for (let i = 0; i < MAX_LAMPS; i++) {
      const h = heads[i];
      if (h) L[i].set(h[0].x, h[0].y, h[0].z, 9); else L[i].set(0, -1e5, 0, 0);
    }
  },
};

function startGame() {
  Game.boot().catch((e) => {
    console.error(e);
    const s = document.getElementById('loadStep');
    if (s) s.textContent = 'Something went wrong while building the mountain: ' + e.message;
  });
}
const bootWhenReady = () => (window.claude?.hot?.ready ? window.claude.hot.ready(startGame) : startGame());
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', bootWhenReady); else setTimeout(bootWhenReady, 0);
