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
  // все значки для карт: задания, заведения, покраска, другие игроки
  function mapIcons() {
    const out = [];
    for (const s of G.spots()) if (s.mission) out.push({ x: s.x, z: s.z, icon: '❗', color: '#ffd447', label: s.mission.n, kind: 'mission' });
    if (G.venueSpots) for (const v of G.venueSpots()) out.push({ x: v.x, z: v.z, icon: v.icon, color: v.color, label: v.n, kind: 'venue', locked: v.venue && v.venue.type === 'home' && !G.homes.has(v.venue.home.id) });
    if (G.remoteDots) for (const r of G.remoteDots()) out.push({ x: r.x, z: r.z, icon: '●', color: r.color, label: r.name || 'Игрок', kind: 'player' });
    return out;
  }
  G.mapIcons = mapIcons;
  function drawMinimap() {
    const S = mm.width, M = G.map, zoom = P.mode === 'plane' ? 0.45 : P.mode === 'heli' ? 0.7 : P.mode === 'car' ? 1.1 : 1.5;
    const cx = G.inside ? G.inside.door.x : P.x, cz = G.inside ? G.inside.door.z : P.z, rot = G.cam.yaw;
    mg.save(); mg.fillStyle = '#2a6aa0'; mg.fillRect(0, 0, S, S);
    mg.translate(S / 2, S / 2); mg.rotate(rot); mg.scale(zoom, zoom);
    mg.drawImage(M.canvas, -M.X(cx), -M.Z(cz));
    const dot = (x, z, c, r = 4) => { mg.fillStyle = c; mg.beginPath(); mg.arc(M.X(x) - M.X(cx), M.Z(z) - M.Z(cz), r / zoom, 0, 7); mg.fill(); };
    for (const v of G.vehicles) if (v.chase) dot(v.x, v.z, Math.floor(G.t * 4) % 2 ? '#ff3030' : '#3050ff', 4);
    for (const h of G.gang) if (h.state !== 'dead') dot(h.x, h.z, '#ff4f6d', 3);
    mg.restore();
    // значки рисуем прямо (не поворачивая); задания и игроки за краем прижимаются к краю
    const toScreen = (x, z, clamp) => {
      const dx = (M.X(x) - M.X(cx)) * zoom, dz = (M.Z(z) - M.Z(cz)) * zoom;
      let px = dx * Math.cos(rot) - dz * Math.sin(rot), pz = dx * Math.sin(rot) + dz * Math.cos(rot);
      const lim = S / 2 - 10, l = Math.hypot(px, pz);
      if (l > lim) { if (!clamp) return null; px *= lim / l; pz *= lim / l; }
      return [S / 2 + px, S / 2 + pz];
    };
    mg.textAlign = 'center'; mg.textBaseline = 'middle';
    for (const ic of mapIcons()) {
      const p = toScreen(ic.x, ic.z, ic.kind !== 'venue'); if (!p) continue;
      mg.globalAlpha = ic.locked ? 0.45 : 1;
      mg.fillStyle = '#14162acc'; mg.beginPath(); mg.arc(p[0], p[1], 9, 0, 7); mg.fill();
      mg.strokeStyle = ic.color; mg.lineWidth = 2; mg.stroke();
      mg.font = (ic.kind === 'player' ? '14px' : '11px') + ' system-ui'; mg.fillStyle = ic.color; mg.fillText(ic.icon, p[0], p[1] + 1); mg.globalAlpha = 1;
    }
    if (G.target) { const p = toScreen(G.target.x, G.target.z, true); mg.fillStyle = '#5aff8a'; mg.strokeStyle = '#000'; mg.lineWidth = 2; mg.beginPath(); mg.arc(p[0], p[1], 6, 0, 7); mg.fill(); mg.stroke(); }
    // игрок — стрелка по направлению персонажа
    mg.save(); mg.translate(S / 2, S / 2); const look = P.veh ? P.veh.yaw : P.yaw; mg.rotate(Math.PI - (look - rot));
    mg.fillStyle = '#fff'; mg.strokeStyle = '#000'; mg.lineWidth = 1.5; mg.beginPath(); mg.moveTo(0, -8); mg.lineTo(6, 6); mg.lineTo(0, 3); mg.lineTo(-6, 6); mg.closePath(); mg.fill(); mg.stroke(); mg.restore();
    if (G.inside) { mg.fillStyle = '#000a'; mg.fillRect(0, S - 26, S, 26); mg.fillStyle = '#fff'; mg.font = 'bold 12px Manrope, system-ui'; mg.fillText('внутри', S / 2, S - 13); }
  }
  // большая карта: подписи, легенда, такси по нажатию на значок
  let mapMarks = [];
  G.openMap = function () {
    const c = $('bigmap'), g = c.getContext('2d'), M = G.map; c.width = M.canvas.width; c.height = M.canvas.height;
    g.drawImage(M.canvas, 0, 0);
    g.font = 'bold 15px Manrope, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffffffcc'; g.fillText('АЭРОПОРТ', M.X((N.AIR.x0 + N.AIR.x1) / 2), M.Z(N.AIR.z0 + 20)); g.fillText('ПЛЯЖ', M.X(N.BEACH - 20), M.Z(420)); g.fillText('МОРЕ', M.X(N.BEACH - 200), M.Z(300));
    mapMarks = [];
    const label = (x, z, icon, color, text, locked) => {
      const X = M.X(x), Z = M.Z(z);
      g.globalAlpha = locked ? 0.5 : 1;
      g.fillStyle = '#14162a'; g.beginPath(); g.arc(X, Z, 11, 0, 7); g.fill(); g.strokeStyle = color; g.lineWidth = 3; g.stroke();
      g.font = '13px system-ui'; g.fillStyle = color; g.fillText(icon, X, Z + 1);
      g.font = 'bold 12px Manrope, system-ui'; const w = g.measureText(text).width + 10;
      g.fillStyle = '#14162acc'; g.fillRect(X - w / 2, Z + 14, w, 17); g.fillStyle = '#fff'; g.fillText(text, X, Z + 23);
      g.globalAlpha = 1;
      mapMarks.push({ X, Z, x, z, text });
    };
    for (const ic of mapIcons()) label(ic.x, ic.z, ic.icon, ic.color, ic.label + (ic.locked ? ' (продаётся)' : ''), ic.locked);
    if (G.target) { g.fillStyle = '#5aff8a'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.arc(M.X(G.target.x), M.Z(G.target.z), 9, 0, 7); g.fill(); g.stroke(); }
    const px = G.inside ? G.inside.door.x : P.x, pz = G.inside ? G.inside.door.z : P.z;
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3; g.beginPath(); g.arc(M.X(px), M.Z(pz), 9, 0, 7); g.fill(); g.stroke();
    g.font = 'bold 13px Manrope, system-ui'; g.fillStyle = '#fff'; g.fillText('Ты', M.X(px), M.Z(pz) - 18);
    $('taxiBox').hidden = true;
    showScreen('mapScreen');
  };
  $('bigmap').addEventListener('click', (e) => {
    const c = $('bigmap'), r = c.getBoundingClientRect(), X = (e.clientX - r.left) / r.width * c.width, Z = (e.clientY - r.top) / r.height * c.height;
    let best = null, bd = 24; for (const m of mapMarks) { const d = Math.hypot(m.X - X, m.Z - Z); if (d < bd) { bd = d; best = m; } }
    if (!best) { $('taxiBox').hidden = true; return; }
    $('taxiText').textContent = `🚕 Такси до «${best.text}» — $${G.taxiCost(best.x, best.z)}`; $('taxiBox').hidden = false; G.taxiPick = best;
  });
  $('taxiGo').addEventListener('click', () => { const m = G.taxiPick; if (m && G.taxiTo(m.x, m.z, m.text)) G.closeScreen(); });

  // ---------- окна ----------
  const SCREENS = ['menu', 'online', 'settings', 'help', 'pause', 'dead', 'brief', 'shop', 'mapScreen', 'venue', 'garageScreen'];
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
  $('pCars').addEventListener('click', () => {
    $('garageList').innerHTML = G.garage.length ? G.garage.map((c, i) => `<div class="item"><div><b>${N.CARS[c.type].n}</b><small><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${c.color}"></span> подъедет к ближайшему перекрёстку</small></div><button type="button" data-call="${i}" ${G.money < 50 ? 'disabled' : ''}>Вызвать · $50</button></div>`).join('') : '<p>Своих машин пока нет. Купи в автосалоне «Мотор» 🚗.</p>';
    showScreen('garageScreen');
  });
  $('garageList').addEventListener('click', (e) => { const b = e.target.closest('[data-call]'); if (b && !b.disabled) { G.callCar(+b.dataset.call); G.closeScreen(); } });
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
    I.mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    I.my = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
    if (fly) { I.up = !!(keys.ShiftLeft || keys.ShiftRight || keys.Space); I.down = !!(keys.KeyC || keys.ControlLeft); }
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
