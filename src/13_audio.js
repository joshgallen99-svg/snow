// ============================================================================
//  audio — synthesized SFX and a generative lo-fi soundtrack (WebAudio)
// ============================================================================
const Sound = {
  ctx: null, ready: false, musicVol: 0.55, sfxVol: 0.8, muted: false,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    let ctx;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxVol; this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = this.musicVol;
    this.musicLP = ctx.createBiquadFilter(); this.musicLP.type = 'lowpass'; this.musicLP.frequency.value = 5200;
    this.music.connect(this.musicLP); this.musicLP.connect(this.master);
    // noise buffer
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = nb;
    // continuous beds: wind, carve, skid, powder, lift hum
    this.beds = {};
    const bed = (name, type, freq, q) => {
      const src = ctx.createBufferSource(); src.buffer = nb; src.loop = true;
      src.playbackRate.value = 0.7 + Math.random() * 0.6;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.sfx); src.start();
      this.beds[name] = { f, g };
    };
    bed('wind', 'bandpass', 500, 0.6);
    bed('carve', 'bandpass', 2600, 1.4);
    bed('skid', 'lowpass', 1400, 0.7);
    bed('powder', 'lowpass', 520, 0.5);
    bed('ambient', 'lowpass', 300, 0.3);
    bed('whistle', 'bandpass', 2400, 5);
    bed('rumble', 'lowpass', 160, 0.7);
    this.ready = true;
    this.initMusic();
  },
  setVolumes(m, s) {
    this.musicVol = m; this.sfxVol = s;
    if (!this.ready) return;
    this.music.gain.setTargetAtTime(this.muted ? 0 : m, this.ctx.currentTime, 0.2);
    this.sfx.gain.setTargetAtTime(s, this.ctx.currentTime, 0.1);
  },
  toggleMusic() { this.muted = !this.muted; this.setVolumes(this.musicVol, this.sfxVol); return !this.muted; },
  bedSet(name, gain, freq) {
    const b = this.beds[name]; if (!b) return;
    const t = this.ctx.currentTime;
    b.g.gain.setTargetAtTime(gain, t, 0.06);
    if (freq) b.f.frequency.setTargetAtTime(freq, t, 0.08);
  },
  updateRide(pl, mode, weather) {
    if (!this.ready) return;
    const riding = mode === 'ride' && !pl.crashed;
    const sp = riding ? pl.speed : 0;
    const air = riding && !pl.ground;
    // wind roars and whistles harder the faster you go; the board chatters underfoot
    this.bedSet('wind', 0.02 + Math.pow(sstep(3, 32, sp), 1.3) * 0.42 + weather.wind * 0.12 + (air ? 0.08 : 0), 260 + sp * 42);
    this.bedSet('whistle', sstep(14, 32, sp) * 0.1 + (air ? sstep(10, 30, sp) * 0.05 : 0), 1700 + sp * 70);
    this.bedSet('rumble', riding && pl.ground && !pl.grind ? sstep(6, 30, sp) * 0.35 * (1 - pl.surf.powder * (1 - pl.surf.groom) * 0.6) : 0, 120 + sp * 4);
    const onSnow = riding && pl.ground && !pl.grind;
    const pw = pl.surf.powder * (1 - pl.surf.groom);
    this.bedSet('carve', onSnow ? sstep(2, 18, sp) * (0.05 + Math.abs(pl.edge) * 0.25) * (1 - pw * 0.6) : 0, 1800 + sp * 60);
    this.bedSet('skid', onSnow ? (pl.skid + pl.brake * 0.6) * sstep(1, 10, sp) * 0.4 : 0, 900 + sp * 40);
    this.bedSet('powder', onSnow ? pw * sstep(2, 14, sp) * 0.35 : 0, 380 + sp * 12);
    this.bedSet('ambient', mode === 'lift' ? 0.18 : 0.04, mode === 'lift' ? 180 : 300);
  },
  env(g, t, a, peak, decay) {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
  },
  burstNoise(t, type, freq, q, peak, decay, dest) {
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); src.connect(f); f.connect(g); g.connect(dest || this.sfx);
    this.env(g, t, 0.004, peak, decay); src.start(t, Math.random()); src.stop(t + decay + 0.1);
  },
  tone(t, type, f0, f1, peak, decay, dest, attack = 0.005) {
    const c = this.ctx, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + decay);
    const g = c.createGain(); o.connect(g); g.connect(dest || this.sfx);
    this.env(g, t, attack, peak, decay); o.start(t); o.stop(t + attack + decay + 0.05);
  },
  land(impact) {
    if (!this.ready) return; const t = this.ctx.currentTime, k = clamp(impact / 12, 0.15, 1);
    this.burstNoise(t, 'lowpass', 500 + k * 600, 0.7, 0.5 * k, 0.25 + k * 0.2);
    this.tone(t, 'sine', 90, 45, 0.45 * k, 0.22);
  },
  crash() {
    if (!this.ready) return; const t = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) this.burstNoise(t + i * 0.13 + Math.random() * 0.05, 'lowpass', 700, 0.8, 0.45 - i * 0.08, 0.3);
    this.tone(t, 'sine', 70, 35, 0.5, 0.35);
  },
  brush() { if (!this.ready) return; const t = this.ctx.currentTime; this.burstNoise(t, 'lowpass', 900, 0.6, 0.22, 0.45); this.burstNoise(t + 0.05, 'highpass', 3500, 0.5, 0.05, 0.3); },
  bump() { if (!this.ready) return; const t = this.ctx.currentTime; this.burstNoise(t, 'bandpass', 900, 1.2, 0.25, 0.12); },
  pop() { if (!this.ready) return; const t = this.ctx.currentTime; this.burstNoise(t, 'bandpass', 1500, 1.5, 0.25, 0.08); this.tone(t, 'sine', 220, 120, 0.12, 0.08); },
  grind(on) {
    if (!this.ready) return;
    if (on && !this.grindSrc) {
      const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3400; f.Q.value = 6;
      const g = c.createGain(); g.gain.value = 0.18; src.connect(f); f.connect(g); g.connect(this.sfx); src.start();
      this.grindSrc = { src, g };
    } else if (!on && this.grindSrc) { this.grindSrc.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03); this.grindSrc.src.stop(this.ctx.currentTime + 0.2); this.grindSrc = null; }
  },
  chime(pitch = 0) {
    if (!this.ready) return; const t = this.ctx.currentTime;
    const base = 1318.5 * Math.pow(2, pitch / 12);
    this.tone(t, 'sine', base, base, 0.18, 0.7, null, 0.003);
    this.tone(t + 0.07, 'sine', base * 1.5, base * 1.5, 0.12, 0.8, null, 0.003);
    this.tone(t, 'triangle', base * 2, base * 2, 0.04, 0.3, null, 0.002);
  },
  trick(mult) { if (!this.ready) return; const t = this.ctx.currentTime; const f = 660 * Math.pow(2, Math.min(mult - 1, 3) * 2 / 12); this.tone(t, 'triangle', f, f, 0.08, 0.25); this.tone(t + 0.08, 'triangle', f * 1.25, f * 1.25, 0.07, 0.3); },
  ui() { if (!this.ready) return; const t = this.ctx.currentTime; this.tone(t, 'sine', 880, 660, 0.06, 0.07); },
  gate(ok) { if (!this.ready) return; const t = this.ctx.currentTime; const f = ok ? 990 : 300; this.tone(t, ok ? 'sine' : 'square', f, f, ok ? 0.1 : 0.05, 0.18); },
  clack() { if (!this.ready) return; const t = this.ctx.currentTime; this.burstNoise(t, 'bandpass', 600, 3, 0.18, 0.06); this.burstNoise(t + 0.09, 'bandpass', 520, 3, 0.14, 0.06); },

  // -------------------------------------------------------------------------
  //  generative lo-fi: electric piano chords, round bass, soft swung drums,
  //  vinyl crackle, and an occasional pentatonic melody
  // -------------------------------------------------------------------------
  initMusic() {
    const c = this.ctx;
    this.bpm = 72; this.step = 0; this.nextT = c.currentTime + 0.3; this.bar = 0; this.mood = 'day';
    this.keysBus = c.createGain(); this.keysBus.gain.value = 0.5;
    const klp = c.createBiquadFilter(); klp.type = 'lowpass'; klp.frequency.value = 2300;
    const trem = c.createGain(); trem.gain.value = 0.85;
    const lfo = c.createOscillator(); lfo.frequency.value = 4.2; const lfoG = c.createGain(); lfoG.gain.value = 0.12; lfo.connect(lfoG); lfoG.connect(trem.gain); lfo.start();
    this.keysBus.connect(klp); klp.connect(trem); trem.connect(this.music);
    this.drumBus = c.createGain(); this.drumBus.gain.value = 0.55;
    const dlp = c.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 4200;
    const sat = c.createWaveShaper(); const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 1.6); } sat.curve = curve;
    this.drumBus.connect(sat); sat.connect(dlp); dlp.connect(this.music);
    this.bassBus = c.createGain(); this.bassBus.gain.value = 0.5;
    const blp = c.createBiquadFilter(); blp.type = 'lowpass'; blp.frequency.value = 380; this.bassBus.connect(blp); blp.connect(this.music);
    // crackle bed
    const cb = c.createBuffer(1, c.sampleRate * 3, c.sampleRate), cd = cb.getChannelData(0);
    for (let i = 0; i < cd.length; i++) cd[i] = (Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.8 : 0) + (Math.random() * 2 - 1) * 0.012;
    const cs = c.createBufferSource(); cs.buffer = cb; cs.loop = true;
    const chp = c.createBiquadFilter(); chp.type = 'highpass'; chp.frequency.value = 900;
    const cg = c.createGain(); cg.gain.value = 0.35; cs.connect(chp); chp.connect(cg); cg.connect(this.music); cs.start();
    this.timer = setInterval(() => this.schedule(), 25);
  },
  PROG: {
    day: [[50, [62, 66, 69, 73, 76]], [47, [59, 62, 66, 69, 73]], [43, [59, 62, 66, 69, 74]], [45, [62, 64, 67, 71, 74]]],     // Dmaj9 Bm9 Gmaj9 A13sus
    dusk: [[45, [60, 64, 67, 71, 74]], [50, [60, 65, 69, 72, 76]], [52, [62, 64, 67, 71, 74]], [48, [59, 62, 64, 67, 71]]],    // Am9 Dm9(ish) Em9 Cmaj7
    night: [[45, [57, 60, 64, 67, 71]], [41, [57, 60, 64, 65, 69]], [50, [57, 60, 62, 65, 69]], [52, [56, 59, 62, 64, 68]]],  // Am9 Fmaj7 Dm9 E7b9-ish
  },
  midi: (n) => 440 * Math.pow(2, (n - 69) / 12),
  schedule() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx, spb = 60 / this.bpm, s16 = spb / 4;
    while (this.nextT < c.currentTime + 0.15) {
      const st = this.step % 16;
      const swing = st % 2 === 1 ? s16 * 0.16 : 0;
      this.playStep(st, this.nextT + swing);
      this.nextT += s16; this.step++;
      if (st === 15) this.bar++;
    }
  },
  playStep(st, t) {
    const prog = this.PROG[this.mood];
    const chordI = Math.floor(this.bar / 2) % prog.length;
    const [root, notes] = prog[chordI];
    const sparse = this.mood === 'night';
    const rnd = mulberry32(this.bar * 16 + st + 7);
    // keys: chord on the downbeat of each 2-bar block, a lighter re-hit sometimes
    if (st === 0 && this.bar % 2 === 0) this.chord(t, notes, 0.11, 3.6);
    else if (st === 10 && rnd() < 0.5) this.chord(t, notes.slice(1, 4), 0.06, 1.6);
    // bass
    if (st === 0) this.bass(t, root, 0.5, spb(this) * 1.6);
    else if (st === 7 && rnd() < 0.7) this.bass(t, root + 7, 0.32, spb(this) * 0.7);
    else if (st === 14 && rnd() < 0.5) this.bass(t, root + (rnd() < 0.5 ? 5 : 10), 0.3, spb(this) * 0.4);
    // drums
    if (!sparse) {
      if (st === 0 || st === 10 || (st === 7 && rnd() < 0.3)) this.kick(t, st === 0 ? 0.9 : 0.6);
      if (st === 4 || st === 12) this.snare(t, 0.5);
      if (st % 2 === 0) this.hat(t, st % 4 === 0 ? 0.12 : 0.07 + rnd() * 0.04);
    } else {
      if (st === 0 && this.bar % 2 === 0) this.kick(t, 0.5);
      if (st === 12 && rnd() < 0.5) this.snare(t, 0.25);
    }
    // melody: pentatonic phrases every other 4 bars
    if (Math.floor(this.bar / 4) % 2 === 1 && st % 4 === 2 && rnd() < 0.42) {
      const scale = this.mood === 'day' ? [74, 76, 78, 81, 83, 86] : [69, 72, 74, 76, 79, 81];
      this.lead(t, scale[Math.floor(rnd() * scale.length)], 0.06);
    }
    function spb(self) { return 60 / self.bpm; }
  },
  chord(t, notes, vel, dur) {
    notes.forEach((n, i) => this.ep(t + i * 0.018, this.midi(n), vel * (i === 0 ? 0.8 : 1), dur));
  },
  ep(t, f, vel, dur) {
    const c = this.ctx;
    const g = c.createGain(); g.connect(this.keysBus);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.012);
    g.gain.exponentialRampToValueAtTime(vel * 0.45, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [mul, amp, type] of [[1, 1, 'sine'], [2, 0.22, 'triangle'], [3.01, 0.05, 'sine']]) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f * mul; o.detune.value = Math.sin(t * TAU * 0.35) * 7;
      const og = c.createGain(); og.gain.value = amp; o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.05);
    }
  },
  bass(t, n, vel, dur) {
    const c = this.ctx, f = this.midi(n - 12 > 30 ? n - 12 : n);
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f;
    const g = c.createGain(); o.connect(g); o2.connect(g); g.connect(this.bassBus);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  },
  kick(t, v) { this.tone(t, 'sine', 120, 42, v * 0.7, 0.28, this.drumBus); },
  snare(t, v) { this.burstNoise(t, 'bandpass', 1900, 0.8, v * 0.45, 0.16, this.drumBus); this.tone(t, 'triangle', 200, 160, v * 0.15, 0.08, this.drumBus); },
  hat(t, v) { this.burstNoise(t, 'highpass', 7500, 0.7, v, 0.035, this.drumBus); },
  lead(t, n, v) {
    const c = this.ctx, f = this.midi(n);
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const vib = c.createOscillator(); vib.frequency.value = 5; const vg = c.createGain(); vg.gain.value = 4; vib.connect(vg); vg.connect(o.frequency);
    const g = c.createGain(); o.connect(g); g.connect(this.keysBus);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.start(t); vib.start(t); o.stop(t + 1.2); vib.stop(t + 1.2);
  },
  setMood(night, storm) {
    if (!this.ready) return;
    const m = night > 0.7 ? 'night' : night > 0.25 ? 'dusk' : 'day';
    this.mood = m;
    this.bpm = m === 'night' ? 66 : 72;
    this.musicLP.frequency.setTargetAtTime(storm > 0.6 ? 1800 : 5200, this.ctx.currentTime, 1.5);
  },
};
