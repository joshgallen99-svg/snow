// ============================================================================
//  ui — DOM screens, HUD, popups, map panel
// ============================================================================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const diffIco = (d) => `<span class="diff-${d}" style="display:inline-flex"><i class="d-ico"></i></span>`;

const UI = {
  panels: ['title', 'locker', 'records', 'settings', 'controls', 'pause', 'results'],
  lockerTab: 'boards',
  init() {
    $('bRide').onclick = () => { Sound.init(); Sound.ui(); Game.openMap(); };
    $('bLocker').onclick = () => { Sound.init(); Sound.ui(); Game.openLocker(); };
    $('bRecords').onclick = () => { Sound.ui(); this.renderRecords(); this.open('records'); };
    $('bSettings').onclick = () => { Sound.ui(); this.open('settings'); };
    $('bControls').onclick = () => { Sound.ui(); this.open('controls'); };
    document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => { Sound.ui(); Game.closePanel(); }));
    $('pResume').onclick = () => Game.resume();
    $('pRestart').onclick = () => Game.restartRun();
    $('pMap').onclick = () => Game.openMap();
    $('pSettings').onclick = () => this.open('settings', true);
    $('pControls').onclick = () => this.open('controls', true);
    $('pLodge').onclick = () => Game.toLodge();
    $('rAgain').onclick = () => Game.rideAgain();
    $('rMap').onclick = () => Game.openMap();
    $('rFree').onclick = () => Game.freeRideOn();
    $('mZoomIn').onclick = () => MapView.zoom(0.7);
    $('mZoomOut').onclick = () => MapView.zoom(1.4);
    $('mRotL').onclick = () => (MapView.yaw += 0.35);
    $('mRotR').onclick = () => (MapView.yaw -= 0.35);
    $('mReset').onclick = () => MapView.reset();
    $('mLodge').onclick = () => Game.toLodge();
    this.bindSettings();
  },
  loading(p, text) { $('loadBar').style.width = (p * 100).toFixed(0) + '%'; $('loadStep').textContent = text; },
  doneLoading() { $('loading').hidden = true; },
  open(id, overPause = false) {
    for (const p of this.panels) $(p).hidden = p !== id;
    this.returnToPause = overPause;
    if (id === 'settings') this.syncSettings();
  },
  closeAll() { for (const p of this.panels) $(p).hidden = true; },
  fade(on) { $('fade').style.opacity = on ? 1 : 0; },

  // ---- title -------------------------------------------------------------------
  refreshTitle() {
    const S = Game.save;
    $('tFlakes').textContent = Game.flakeCount();
    $('tRuns').textContent = Object.keys(S.done).length;
    const n = Object.keys(S.best).length;
    $('bRecNote').textContent = n ? `${n} best time${n === 1 ? '' : 's'}` : 'No times yet';
  },

  // ---- locker --------------------------------------------------------------------
  renderLocker() {
    const tabs = [['boards', 'Boards', BOARDS, 'board'], ['jackets', 'Jackets', JACKETS, 'jacket'], ['pants', 'Pants', PANTS, 'pants'], ['helmets', 'Helmets', HELMETS, 'helmet']];
    const flakes = Game.flakeCount();
    $('lkFlakes').textContent = flakes;
    $('lkTabs').innerHTML = tabs.map(([id, label]) => `<button class="tab" role="tab" aria-selected="${id === this.lockerTab}" data-tab="${id}">${label}</button>`).join('');
    $('lkTabs').querySelectorAll('.tab').forEach((b) => (b.onclick = () => { this.lockerTab = b.dataset.tab; Sound.ui(); this.renderLocker(); }));
    const [, , list, key] = tabs.find((t) => t[0] === this.lockerTab);
    $('lkCards').innerHTML = list.map((it) => {
      const locked = it.cost > flakes, sel = Game.save.gear[key] === it.id;
      const sw = it.top ? `linear-gradient(115deg, ${it.top[0]} 0 55%, ${it.top[1]} 55% 100%)` : it.c;
      return `<button class="card ${sel ? 'sel' : ''} ${locked ? 'lock' : ''}" data-id="${it.id}" ${locked ? 'aria-disabled="true"' : ''}>
        <span class="sw" style="background:${sw}"></span><span class="nm">${esc(it.name)}</span>
        <span class="ct">${sel ? 'Equipped' : locked ? `Needs ${it.cost} snowflakes` : it.cost ? 'Unlocked' : 'Starter gear'}</span></button>`;
    }).join('');
    $('lkCards').querySelectorAll('.card').forEach((c) => (c.onclick = () => {
      const it = list.find((x) => x.id === c.dataset.id);
      if (it.cost > flakes) { Sound.gate(false); this.toast(`Collect ${it.cost - flakes} more snowflakes to unlock ${it.name}`); return; }
      Game.save.gear[key] = it.id; Game.persist(); Game.applyGear(); Sound.ui(); this.renderLocker();
    }));
  },

  // ---- records -------------------------------------------------------------------
  renderRecords() {
    const S = Game.save;
    $('recBody').innerHTML = RUNS.map((r) => {
      const toks = Scatter.tokens.filter((t) => t.run === r.index);
      const got = toks.filter((t) => FX.collected.has(t.id)).length;
      const best = S.best[r.id];
      return `<tr><td class="n">${diffIco(r.diff)}<span>${esc(r.name)}</span></td><td>${esc(LIFT_BY_ID[r.lift].name)}</td>
        <td class="num">${best ? fmtTime(best.t) : '—'}</td><td class="num">${got}/${toks.length}</td><td class="${S.done[r.id] ? 'done' : ''}">${S.done[r.id] ? 'Yes' : '—'}</td></tr>`;
    }).join('');
  },

  // ---- settings ---------------------------------------------------------------------
  bindSettings() {
    const S = () => Game.settings;
    const on = (id, fn) => $(id).addEventListener('input', () => { fn($(id).value); Game.applySettings(); Game.persist(); });
    on('sMusic', (v) => (S().music = +v));
    on('sSfx', (v) => (S().sfx = +v));
    on('sQuality', (v) => (S().quality = v));
    on('sTime', (v) => (S().time = v));
    on('sWeather', (v) => (S().weather = v));
    on('sStance', (v) => (S().stance = +v));
    on('sCine', (v) => (S().cine = v === '1'));
    on('sGhost', (v) => (S().ghost = v === '1'));
    on('sUnlock', (v) => (S().unlockAll = v === '1'));
    let armed = false;
    $('sReset').onclick = () => {
      if (!armed) { armed = true; $('sReset').textContent = 'Click again to erase everything'; setTimeout(() => { armed = false; $('sReset').textContent = 'Reset progress'; }, 3000); return; }
      Game.resetProgress(); armed = false; $('sReset').textContent = 'Progress reset';
    };
  },
  syncSettings() {
    const s = Game.settings;
    $('sMusic').value = s.music; $('sSfx').value = s.sfx; $('sQuality').value = s.quality; $('sTime').value = s.time;
    $('sWeather').value = s.weather; $('sStance').value = String(s.stance); $('sCine').value = s.cine ? '1' : '0';
    $('sGhost').value = s.ghost ? '1' : '0'; $('sUnlock').value = s.unlockAll ? '1' : '0';
  },

  // ---- HUD ---------------------------------------------------------------------------------
  hud(on) { $('hud').hidden = !on; },
  setRunHeader(run, mode) {
    $('hRunIco').parentElement.className = 'runline diff-' + (run ? run.diff : 'none');
    $('hRunIco').style.display = run ? '' : 'none';
    $('hRun').textContent = run ? run.name : 'Free ride';
    $('hMode').textContent = mode === 'tt' ? 'Time trial' : 'Free ride';
    $('hTimerBox').hidden = mode !== 'tt';
    $('hSplit').textContent = '';
  },
  updateHud(pl, G2) {
    $('hSpeed').textContent = Math.round(pl.speed * 3.6);
    $('hAlt').textContent = `${Math.round(pl.pos.y + 230)} m · ${G2.surfaceName}`;
    $('hClock').textContent = `${Sky.label()} · ${G2.weatherName}`;
    $('hScore').textContent = G2.score.toLocaleString();
    $('hProg').style.width = (G2.progress * 100).toFixed(1) + '%';
    if (G2.run) {
      const toks = Scatter.tokens.filter((t) => t.run === G2.run.index);
      $('hFlakes').textContent = `${toks.filter((t) => FX.collected.has(t.id)).length}/${toks.length}`;
    } else $('hFlakes').textContent = Game.flakeCount();
    if (G2.mode === 'tt') $('hTimer').textContent = fmtTime(G2.timer);
    const c = pl.combo;
    $('combo').textContent = c.n > 1 ? `COMBO ×${Math.min(4, 1 + 0.5 * (c.n - 1)).toFixed(1)} · ${c.pts.toLocaleString()}` : '';
  },
  split(delta) {
    const el = $('hSplit');
    if (delta == null) { el.textContent = ''; return; }
    el.textContent = (delta < 0 ? '−' : '+') + Math.abs(delta).toFixed(2);
    el.className = 'split num ' + (delta < 0 ? 'ahead' : 'behind');
  },
  trick(e) {
    const box = $('tricks');
    const d = document.createElement('div');
    d.className = 'trick glass' + (e.sketch ? ' sketch' : '');
    d.innerHTML = `${esc(e.name)}<b class="num">+${e.pts.toLocaleString()}</b>${e.mult > 1 ? `<em>×${e.mult.toFixed(1)}</em>` : ''}${e.sketch ? '<em>sketchy</em>' : ''}`;
    box.prepend(d);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => d.classList.add('out'), 2200);
    setTimeout(() => d.remove(), 2800);
  },
  message(big, small = '', ms = 1800) {
    const el = $('msg');
    el.innerHTML = `<div class="big">${esc(big)}</div>${small ? `<div class="small">${esc(small)}</div>` : ''}`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    el.hidden = false;
    clearTimeout(this._msgT);
    this._msgT = setTimeout(() => (el.hidden = true), ms);
  },
  prompt(text) { const p = $('prompt'); if (!text) { p.hidden = true; return; } p.hidden = false; p.innerHTML = text; },
  toast(text, ms = 2600) {
    const t = $('toast'); t.textContent = text; t.hidden = false; t.style.opacity = 1;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { t.style.opacity = 0; setTimeout(() => (t.hidden = true), 300); }, ms);
  },
  liftHint(text) { const h = $('liftHint'); h.hidden = !text; if (text) h.innerHTML = text; },

  // ---- map -------------------------------------------------------------------------------
  map(on) {
    $('mapUI').hidden = !on;
    if (!on) $('liftPanel').hidden = true;
  },
  mapTick() {
    $('mClock').textContent = '· ' + Sky.label();
    $('mWeather').textContent = '· ' + Game.weatherName();
  },
  mapHover(i) {
    if (MapView.selected < 0) this.showLiftPanel(i, true);
  },
  showLiftPanel(i, preview = false) {
    const el = $('liftPanel');
    if (i < 0) { el.hidden = true; return; }
    const lift = Structures.lifts[i], L = lift.def, T = LIFT_TYPES[L.type];
    const unlocked = Game.liftUnlocked(i);
    const vert = Math.round(lift.stationB.y - lift.stationA.y);
    const ride = Math.round(lift.len / T.speed);
    const runs = RUNS.filter((r) => r.lift === L.id);
    const need = L.unlock - Game.ridden();
    let html = `<div class="eyebrow">${esc(T.label)}</div>
      <h3><span class="sw" style="background:#${new THREE.Color(L.color).getHexString()}"></span>${esc(L.name)}</h3>
      <div class="stats"><span>Length <b class="num">${Math.round(lift.len)} m</b></span><span>Vertical <b class="num">${vert} m</b></span><span>Ride <b class="num">${Math.floor(ride / 60)}:${String(ride % 60).padStart(2, '0')}</b></span></div>`;
    if (!unlocked) html += `<div class="lockmsg">Clouds are still sitting on this part of the mountain. Ride ${need} more run${need === 1 ? '' : 's'} to open ${esc(L.name)}.</div>`;
    for (const r of runs) {
      const rd = World.runData[r.index];
      const toks = Scatter.tokens.filter((t) => t.run === r.index);
      const got = toks.filter((t) => FX.collected.has(t.id)).length;
      const best = Game.save.best[r.id];
      html += `<div class="runrow">
        <div class="h">${diffIco(r.diff)}<span>${esc(r.name)}</span><span class="len num">${Math.round(rd.path.len)} m · ${DIFF[r.diff].label}</span></div>
        <p>${esc(r.blurb)}</p>
        <div class="meta"><span>Best <b class="num">${best ? fmtTime(best.t) : '—'}</b></span><span>Snowflakes <b class="num">${got}/${toks.length}</b></span>${Game.save.done[r.id] ? '<span class="done">Ridden</span>' : ''}</div>
        ${unlocked && !preview ? `<div class="acts"><button class="btn small primary" data-run="${r.id}" data-mode="free">Free ride</button><button class="btn small" data-run="${r.id}" data-mode="tt">Time trial</button></div>` : ''}
      </div>`;
    }
    if (preview && unlocked) html += `<div class="runrow"><p>Click the lift to choose a run.</p></div>`;
    el.innerHTML = html;
    el.hidden = false;
    el.querySelectorAll('[data-run]').forEach((b) => (b.onclick = () => { Sound.ui(); Game.chooseRun(b.dataset.run, b.dataset.mode); }));
  },

  // ---- results ----------------------------------------------------------------------------
  results(r) {
    $('rEyebrow').textContent = r.mode === 'tt' ? 'Time trial' : 'Free ride';
    $('rRun').innerHTML = esc(r.run.name) + (r.newBest ? '<span class="newbest">New best</span>' : '');
    $('rTime').textContent = r.mode === 'tt' ? fmtTime(r.time) : fmtTime(r.time);
    const cells = [];
    if (r.mode === 'tt') {
      cells.push(['Best', r.best ? fmtTime(r.best) : '—']);
      cells.push(['Gates', `${r.gates - r.missed}/${r.gates}`]);
      if (r.missed) cells.push(['Penalty', `+${(r.missed * 3).toFixed(0)} s`]);
    }
    cells.push(['Snowflakes', `${r.flakes}/${r.flakesTotal}`]);
    cells.push(['Trick points', r.score.toLocaleString()]);
    cells.push(['Top speed', `${Math.round(r.topSpeed * 3.6)} km/h`]);
    if (r.crashes) cells.push(['Crashes', r.crashes]);
    if (r.unlocked) cells.push(['Opened', r.unlocked]);
    $('rGrid').innerHTML = cells.map(([k, v]) => `<div><span class="eyebrow">${esc(k)}</span><b class="num">${esc(v)}</b></div>`).join('');
    this.open('results');
  },
};
