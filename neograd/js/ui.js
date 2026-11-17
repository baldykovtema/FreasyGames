'use strict';
// Неоград: HUD, миникарта, окна (задание, магазин, больница, пауза) и управление с клавиатуры, мыши и экрана.
(function () {
  const N = window.N, G = window.G, P = G.player;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => '$' + Math.floor(n).toLocaleString('ru-RU');

  // ---------- сообщения ----------
  G.toast = (text, ms = 2600) => { const el = document.createElement('div'); el.className = 'toast'; el.textContent = text; el.style.animationDuration = ms + 'ms'; $('toasts').appendChild(el); setTimeout(() => el.remove(), ms); while ($('toasts').children.length > 4) $('toasts').firstChild.remove(); };
  let bigT = 0;
  G.big = (title, sub) => { $('bigTitle').textContent = title; $('bigSub').textContent = sub || ''; $('big').hidden = false; bigT = 3.2; };

  // ---------- HUD ----------
  const mm = $('minimap'), mg = mm.getContext('2d');
  let hudKey = '';
  G.tickHud = function (dt) {
    if (bigT > 0) { bigT -= dt; if (bigT <= 0) $('big').hidden = true; }
    const W = G.WEAP[G.cur], ammo = G.weapons[G.cur];
    const key = [Math.ceil(P.hp), Math.ceil(P.armor), Math.floor(G.money), G.cur, ammo, Math.ceil(G.wanted), G.hidden, P.mode, G.missionText, Math.ceil(G.missionTimer || 0), P.veh && Math.ceil(P.veh.hp)].join('|');
    if (key !== hudKey || G.uiDirty) {
      hudKey = key; G.uiDirty = false;
      $('money').textContent = fmt(G.money);
      $('hpBar').style.width = Math.max(0, P.hp) + '%'; $('arBar').style.width = Math.max(0, P.armor) + '%'; $('arWrap').hidden = P.armor <= 0;
      $('weapon').textContent = P.mode === 'foot' ? W.n + (W.melee ? '' : ' · ' + ammo) : (P.veh ? P.veh.D.n + ' · ' + Math.max(0, Math.ceil(P.veh.hp / (P.veh.kind === 'car' ? P.veh.D.hp : 150) * 100)) + '%' : '');
      const st = Math.ceil(G.wanted); $('stars').innerHTML = '★'.repeat(st) + '<i>' + '★'.repeat(5 - st) + '</i>'; $('stars').classList.toggle('blink', !!(st && G.hidden));
      $('mission').hidden = !G.missionText; $('mission').innerHTML = (G.missionText || '') + (G.missionTimer > 0 ? ` <b>${Math.ceil(G.missionTimer)} с</b>` : '');
      // кнопки для текущего режима
      document.body.dataset.mode = P.mode;
      const nv = P.mode === 'foot' && G.nearVehicle();
      $('tEnter').classList.toggle('hot', !!nv || P.mode !== 'foot');
    }
    if (P.mode === 'foot' && Math.random() < 0.1) $('tEnter').classList.toggle('hot', !!G.nearVehicle());
    $('hurt').style.opacity = G.flash > 0 ? 0.6 : P.hp < 25 ? 0.25 : 0;
    $('speed').textContent = P.veh ? Math.round(Math.abs(P.veh.speed) * 3.6) + ' км/ч' + (P.veh.kind !== 'car' ? ' · высота ' + Math.round(P.veh.y) + ' м' + (P.veh.kind === 'plane' ? ' · газ ' + Math.round(P.veh.throttle * 100) + '%' : '') : '') : '';
    drawMinimap();
  };
  // миникарта поворачивается вместе с камерой
  function drawMinimap() {
    const S = mm.width, M = G.map, zoom = P.mode === 'plane' ? 0.45 : P.mode === 'heli' ? 0.7 : P.mode === 'car' ? 1.1 : 1.5;
    mg.save(); mg.fillStyle = '#2a6aa0'; mg.fillRect(0, 0, S, S);
    mg.translate(S / 2, S / 2); mg.rotate(G.cam.yaw - Math.PI); mg.scale(zoom, zoom);
    mg.drawImage(M.canvas, -M.X(P.x), -M.Z(P.z));
    const dot = (x, z, c, r = 4, sq) => { mg.fillStyle = c; const px = M.X(x) - M.X(P.x), pz = M.Z(z) - M.Z(P.z); if (sq) mg.fillRect(px - r / zoom, pz - r / zoom, 2 * r / zoom, 2 * r / zoom); else { mg.beginPath(); mg.arc(px, pz, r / zoom, 0, 7); mg.fill(); } };
    for (const s of G.spots()) dot(s.x, s.z, s.mission ? '#ffd447' : s.kind === 'shop' ? '#ff4f6d' : '#5ac8ff', 5, true);
    for (const v of G.vehicles) if (v.chase) dot(v.x, v.z, Math.floor(G.t * 4) % 2 ? '#ff3030' : '#3050ff', 4);
    for (const h of G.gang) if (h.state !== 'dead') dot(h.x, h.z, '#ff4f6d', 3);
    if (G.remoteDots) for (const r of G.remoteDots()) dot(r.x, r.z, r.color, 4);
    mg.restore();
    // цель: точка или стрелка у края
    if (G.target) {
      const dx = (M.X(G.target.x) - M.X(P.x)) * zoom, dz = (M.Z(G.target.z) - M.Z(P.z)) * zoom, a = -(G.cam.yaw - Math.PI);
      let px = dx * Math.cos(-a) - dz * Math.sin(-a), pz = dx * Math.sin(-a) + dz * Math.cos(-a);
      const lim = S / 2 - 8, l = Math.max(Math.abs(px), Math.abs(pz)); if (l > lim) { px *= lim / l; pz *= lim / l; }
      mg.fillStyle = '#ffd447'; mg.strokeStyle = '#000'; mg.lineWidth = 2; mg.beginPath(); mg.arc(S / 2 + px, S / 2 + pz, 6, 0, 7); mg.fill(); mg.stroke();
    }
    // игрок — стрелка
    mg.save(); mg.translate(S / 2, S / 2); const look = P.veh ? P.veh.yaw : P.yaw; mg.rotate(-(look - G.cam.yaw + Math.PI));
    mg.fillStyle = '#fff'; mg.strokeStyle = '#000'; mg.lineWidth = 1.5; mg.beginPath(); mg.moveTo(0, -8); mg.lineTo(6, 6); mg.lineTo(0, 3); mg.lineTo(-6, 6); mg.closePath(); mg.fill(); mg.stroke(); mg.restore();
  }
  // большая карта
  G.openMap = function () {
    const c = $('bigmap'), g = c.getContext('2d'), M = G.map; c.width = M.canvas.width; c.height = M.canvas.height;
    g.drawImage(M.canvas, 0, 0);
    const mark = (x, z, col, r = 6) => { g.fillStyle = col; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.arc(M.X(x), M.Z(z), r, 0, 7); g.fill(); g.stroke(); };
    for (const s of G.spots()) mark(s.x, s.z, s.mission ? '#ffd447' : s.kind === 'shop' ? '#ff4f6d' : '#5ac8ff', 7);
    if (G.target) mark(G.target.x, G.target.z, '#5aff8a', 8);
    mark(P.x, P.z, '#ffffff', 8);
    g.font = 'bold 14px Manrope, system-ui'; g.fillStyle = '#fff';
    g.fillText('Аэропорт', M.X(N.AIR.x0 + 20), M.Z(N.AIR.z0 + 30)); g.fillText('Пляж', M.X(N.BEACH - 30), M.Z(300)); g.fillText('Центр', M.X(N.roadX(7)), M.Z(N.roadX(6)));
    showScreen('mapScreen');
  };

  // ---------- окна ----------
  const SCREENS = ['menu', 'online', 'settings', 'help', 'pause', 'dead', 'brief', 'shop', 'mapScreen'];
  function showScreen(id) {
    for (const s of SCREENS) $(s).hidden = s !== id;
    G.paused = G.state === 'play' && !!id;
    $('backLink').hidden = G.state === 'play';
    if (G.paused && document.pointerLockElement) document.exitPointerLock();
    for (const k in G.inp) if (typeof G.inp[k] === 'boolean') G.inp[k] = false;
    G.inp.mx = G.inp.my = 0;
  }
  G.showScreen = showScreen;
  G.closeScreen = () => { if (G.state === 'play') { showScreen(null); lock(); } else showScreen('menu'); };
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { G.saveSettings(); if (G.state === 'play' && $('settings').hidden === false && G.fromPause) { G.fromPause = false; showScreen('pause'); return; } G.closeScreen(); }));
  G.openBrief = function (m) {
    if (G.activeMission()) return;
    $('briefTitle').textContent = m.n; $('briefText').textContent = m.brief; $('briefReward').textContent = 'Награда: ' + fmt(m.reward);
    G.briefM = m; showScreen('brief');
  };
  $('briefGo').addEventListener('click', () => { const m = G.briefM; G.closeScreen(); G.startMission(m); });
  G.openShop = function () { renderShop(); showScreen('shop'); };
  function renderShop() {
    const rows = [];
    for (const [k, w] of Object.entries(G.WEAP)) {
      if (w.melee) continue;
      const own = k in G.weapons;
      rows.push(`<div class="item"><div><b>${w.n}</b><small>${own ? 'патронов: ' + G.weapons[k] : 'урон ' + w.dmg + (w.pellets ? '×' + w.pellets : '') + (w.auto ? ', очередями' : '')}</small></div>${own ? `<button type="button" data-ammo="${k}" ${G.money < w.ammoPrice ? 'disabled' : ''}>+${w.pack} патронов · ${fmt(w.ammoPrice)}</button>` : `<button type="button" data-buy="${k}" ${G.money < w.price ? 'disabled' : ''}>Купить · ${fmt(w.price)}</button>`}</div>`);
    }
    rows.push(`<div class="item"><div><b>Бронежилет</b><small>поглощает часть урона</small></div><button type="button" data-armor ${G.money < 500 || P.armor >= 100 ? 'disabled' : ''}>Купить · $500</button></div>`);
    $('shopList').innerHTML = rows.join(''); $('shopMoney').textContent = fmt(G.money);
  }
  $('shopList').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.buy) { const w = G.WEAP[b.dataset.buy]; G.money -= w.price; G.weapons[b.dataset.buy] = w.pack; G.cur = b.dataset.buy; }
    if (b.dataset.ammo) { const w = G.WEAP[b.dataset.ammo]; G.money -= w.ammoPrice; G.weapons[b.dataset.ammo] += w.pack; }
    if (b.dataset.armor !== undefined) { G.money -= 500; P.armor = 100; }
    G.sfx('cash'); G.uiDirty = true; renderShop(); if (G.save) G.save();
  });
  G.openHospital = function () {
    if (P.hp >= 100) { G.toast('Ты здоров'); return; }
    if (G.money < 100) { G.toast('Лечение стоит $100'); return; }
    G.money -= 100; P.hp = 100; G.sfx('cash'); G.toast('Вылечен за $100'); G.uiDirty = true;
  };
  G.openPause = function () {
    if (G.state !== 'play' || G.paused) return;
    $('pauseInfo').textContent = `Заданий: ${G.done.size} из ${G.MISSIONS.length} · тайников: ${G.foundPkgs.size} из ${G.PKGS.length} · ${fmt(G.money)}${G.online ? ' · комната «' + G.online.room + '»' : ''}`;
    $('pCancel').hidden = !G.activeMission();
    showScreen('pause'); if (G.save) G.save();
  };
  $('resumeBtn').addEventListener('click', () => G.closeScreen());
  $('pMap').addEventListener('click', () => G.openMap());
  $('pSettings').addEventListener('click', () => { G.fromPause = true; syncSettings(); showScreen('settings'); });
  $('pCancel').addEventListener('click', () => { G.cancelMission('Ты отменил задание'); G.closeScreen(); });
  $('pauseBtn').addEventListener('click', () => G.openPause());
  $('mapBtn').addEventListener('click', () => G.openMap());
  G.onDeath = (why) => { setTimeout(() => { $('deadWhy').textContent = 'Причина: ' + why; showScreen('dead'); }, 1500); };
  $('respawnBtn').addEventListener('click', () => { G.respawn(); G.closeScreen(); });

  // ---------- клавиатура и мышь ----------
  const I = G.inp, keys = {};
  const canvas = $('gl');
  const playing = () => G.state === 'play' && !G.paused;
  function lock() { if (!G.settings.touch && canvas.requestPointerLock) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch {} } }
  G.lock = lock;
  function readKeys() {
    if (touchOn) return;
    const fly = P.mode === 'plane';
    I.mx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + (fly ? 0 : (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0));
    I.my = fly ? (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0) : (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
    if (fly) { I.mx += (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0); I.up = !!keys.KeyW; I.down = !!keys.KeyS; }
    else { I.up = false; I.down = !!(keys.ShiftLeft && P.mode === 'heli') || !!keys.KeyC; }
    I.jump = !!keys.Space; I.brake = !!keys.Space && P.mode === 'car'; I.sprint = !!keys.ShiftLeft && P.mode === 'foot';
  }
  addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    if (G.state !== 'play') return;
    if (e.code === 'Escape' && G.paused && $('pause').hidden === false) { G.closeScreen(); return; }
    if (e.code === 'KeyM') { if ($('mapScreen').hidden) G.openMap(); else G.closeScreen(); return; }
    if (!playing()) return;
    keys[e.code] = true; readKeys();
    if (e.code === 'KeyF' || e.code === 'Enter') { if (P.mode === 'foot') G.enterVehicle(G.nearVehicle()); else G.exitVehicle(); }
    if (e.code === 'KeyQ') G.nextWeapon(-1); if (e.code === 'KeyE') G.nextWeapon(1);
    if (/^Digit[1-5]$/.test(e.code)) { const k = Object.keys(G.WEAP)[+e.code.slice(5) - 1]; if (k in G.weapons) { G.cur = k; G.uiDirty = true; } }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; readKeys(); });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; readKeys(); I.fire = I.aim = false; });
  canvas.addEventListener('mousedown', (e) => {
    if (G.state !== 'play' || G.settings.touch) return; G.unlockAudio();
    if (document.pointerLockElement !== canvas) { lock(); return; }
    if (e.button === 0) I.fire = true; if (e.button === 2) I.aim = true;
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) I.fire = false; if (e.button === 2) I.aim = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas && playing()) { const k = G.settings.sens * 0.00028; I.lookDX += e.movementX * k; I.lookDY += e.movementY * k; G.lookingAround = true; clearTimeout(G.lookT); G.lookT = setTimeout(() => { G.lookingAround = false; }, 1200); } });
  addEventListener('wheel', (e) => { if (playing() && P.mode === 'foot') G.nextWeapon(e.deltaY > 0 ? 1 : -1); }, { passive: true });
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && playing() && !G.settings.touch) { I.fire = I.aim = false; G.openPause(); } });

  // ---------- сенсорное управление ----------
  let touchOn = false, stickId = null, stickO = null, lookId = null, lookLast = null;
  const stick = $('stick'), knob = $('knob'), tz = $('touch');
  G.applyTouch = () => { document.body.classList.toggle('touch', !!G.settings.touch); };
  tz.addEventListener('pointerdown', (e) => {
    if (!playing() || e.target.closest('button')) return; e.preventDefault(); G.unlockAudio(); touchOn = true;
    if (e.clientX < innerWidth * 0.45 && stickId === null) { stickId = e.pointerId; stickO = { x: e.clientX, y: e.clientY }; stick.style.display = 'block'; stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; knob.style.transform = ''; }
    else if (lookId === null) { lookId = e.pointerId; lookLast = { x: e.clientX, y: e.clientY }; }
    try { tz.setPointerCapture(e.pointerId); } catch {}
  });
  tz.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickId) { const dx = e.clientX - stickO.x, dy = e.clientY - stickO.y, l = Math.hypot(dx, dy), m = Math.min(l, 55), k = l ? m / l : 0; knob.style.transform = `translate(${dx * k}px,${dy * k}px)`; I.mx = Math.abs(dx) > 6 ? dx * k / 55 : 0; I.my = Math.abs(dy) > 6 ? dy * k / 55 : 0; I.sprint = P.mode === 'foot' && l > 75; }
    else if (e.pointerId === lookId) { const k = G.settings.sens * 0.0008; I.lookDX += (e.clientX - lookLast.x) * k; I.lookDY += (e.clientY - lookLast.y) * k; lookLast = { x: e.clientX, y: e.clientY }; G.lookingAround = true; clearTimeout(G.lookT); G.lookT = setTimeout(() => { G.lookingAround = false; }, 1200); }
  });
  const tEnd = (e) => { if (e.pointerId === stickId) { stickId = null; stick.style.display = 'none'; I.mx = I.my = 0; I.sprint = false; } if (e.pointerId === lookId) lookId = null; };
  tz.addEventListener('pointerup', tEnd); tz.addEventListener('pointercancel', tEnd);
  // кнопка держится, пока палец на ней; при этом пальцем по ней можно водить взглядом
  function hold(id, on, off, look) {
    const b = $(id); let last = null;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); G.unlockAudio(); touchOn = true; b.classList.add('on'); last = { x: e.clientX, y: e.clientY }; try { b.setPointerCapture(e.pointerId); } catch {} on(); });
    b.addEventListener('pointermove', (e) => { if (!look || !last) return; const k = G.settings.sens * 0.0008; I.lookDX += (e.clientX - last.x) * k; I.lookDY += (e.clientY - last.y) * k; last = { x: e.clientX, y: e.clientY }; });
    const up = () => { b.classList.remove('on'); last = null; off && off(); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  }
  hold('tFire', () => { I.fire = true; I.aim = true; }, () => { I.fire = false; I.aim = false; }, true);
  hold('tJump', () => { I.jump = true; I.brake = P.mode === 'car'; }, () => { I.jump = false; I.brake = false; });
  hold('tEnter', () => { if (P.mode === 'foot') G.enterVehicle(G.nearVehicle()); else G.exitVehicle(); });
  hold('tWeapon', () => G.nextWeapon(1));
  hold('tUp', () => { I.up = true; }, () => { I.up = false; });
  hold('tDown', () => { I.down = true; }, () => { I.down = false; });

  // ---------- настройки ----------
  function syncSettings() { $('setSens').value = G.settings.sens; $('setSound').checked = G.settings.sound; $('setTouch').checked = G.settings.touch; $('setQ').value = G.settings.quality; }
  $('setSens').addEventListener('input', (e) => { G.settings.sens = +e.target.value; });
  $('setSound').addEventListener('change', (e) => { G.settings.sound = e.target.checked; });
  $('setTouch').addEventListener('change', (e) => { G.settings.touch = e.target.checked; G.applyTouch(); });
  $('setQ').addEventListener('change', (e) => { G.settings.quality = +e.target.value; G.scene.fog.far = G.settings.quality ? 520 : 300; });
  $('settingsBtn').addEventListener('click', () => { syncSettings(); showScreen('settings'); });
  $('helpBtn').addEventListener('click', () => showScreen('help'));
  syncSettings(); G.applyTouch();
})();
