'use strict';
// Кубомир: иконки, панель предметов, здоровье, инвентарь, крафт, сундуки и всё управление.
(function () {
  const KM = window.KM, G = window.G, B = KM.B;
  const $ = (id) => document.getElementById(id);

  // ---------- иконки ----------
  const iconCache = {};
  G.icon = function (id) {
    if (iconCache[id]) return iconCache[id];
    const S = KM.TS, A = KM.atlasCanvas, cv = document.createElement('canvas'); cv.width = cv.height = 32; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const tileXY = (t) => [(t % KM.ACOLS) * S, ((t / KM.ACOLS) | 0) * S];
    const df = KM.def(id);
    if (!df) return '';
    if (KM.isItem(id) || df.shape !== 'cube') { const [x, y] = tileXY(KM.isItem(id) ? df.tile : df.t[1]); g.drawImage(A, x, y, S, S, 0, 0, 32, 32); }
    else {
      // маленький кубик в изометрии: верх и две боковые грани
      const [tx, ty] = tileXY(df.t[0]), [sx, sy] = tileXY(df.t[1]);
      g.save(); g.setTransform(1, 0.5, -1, 0.5, 16, 1); g.drawImage(A, tx, ty, S, S, 0, 0, 15, 15); g.restore();
      g.save(); g.setTransform(1, 0.5, 0, 1, 1, 8.5); g.drawImage(A, sx, sy, S, S, 0, 0, 15, 15); g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 0, 15, 15); g.restore();
      g.save(); g.setTransform(1, -0.5, 0, 1, 16, 16); g.drawImage(A, sx, sy, S, S, 0, 0, 15, 15); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, 15, 15); g.restore();
    }
    return (iconCache[id] = cv.toDataURL());
  };
  function slotHTML(s, extra = '') {
    if (!s) return `<div class="slot" ${extra}></div>`;
    const it = KM.isItem(s[0]) ? KM.I[s[0]] : null, dur = it && it.tool ? 1 - (s[2] || 0) / it.tool.dur : 1;
    return `<div class="slot" ${extra} title="${KM.name(s[0])}"><img src="${G.icon(s[0])}" alt="">${s[1] > 1 ? `<b>${s[1]}</b>` : ''}${dur < 1 ? `<i style="width:${Math.max(4, dur * 100) * 0.84}%;background:${dur < 0.25 ? '#ff4f4f' : dur < 0.5 ? '#ffd447' : '#5df25d'}"></i>` : ''}</div>`;
  }

  // ---------- HUD ----------
  let hudKey = '', nameT = 0, lastHot = -1;
  G.tickHud = function (dt, fps) {
    const p = G.player;
    if (G.uiDirty || lastHot !== G.hot) {
      G.uiDirty = false;
      $('hotbar').innerHTML = G.inv.slice(0, 9).map((s, i) => slotHTML(s, `data-h="${i}"`)).join('') + '<button id="bagBtn" type="button" aria-label="Инвентарь">🎒</button>';
      $('hotbar').children[G.hot].classList.add('sel');
      if (lastHot !== G.hot) { const s = G.held(); $('itemName').textContent = s ? KM.name(s[0]) : ''; $('itemName').style.opacity = 1; nameT = 1.6; }
      lastHot = G.hot;
      if (!$('inv').hidden) G.renderInv();
    }
    if (nameT > 0) { nameT -= dt; if (nameT <= 0) $('itemName').style.opacity = 0; }
    const creative = G.mode === 'creative';
    const key = creative ? 'c' : p.hp + ':' + p.food + ':' + Math.ceil(p.air);
    if (key !== hudKey) {
      hudKey = key;
      if (creative) { $('hearts').textContent = '✨ Творчество'; $('food').textContent = ''; }
      else {
        let h = ''; for (let i = 0; i < 10; i++) h += p.hp >= (i + 1) * 2 ? '❤️' : p.hp === i * 2 + 1 ? '💔' : '🖤';
        let f = ''; for (let i = 0; i < 10; i++) f += p.food >= (i + 1) * 2 ? '🍖' : p.food === i * 2 + 1 ? '🦴' : '▫️';
        $('hearts').textContent = h; $('food').textContent = f + (p.air < 10 ? '  🫧' + Math.ceil(p.air) : '');
      }
    }
    const hh = Math.floor(((G.time + 0.25) % 1) * 24), mm = Math.floor((((G.time + 0.25) % 1) * 24 % 1) * 60);
    $('info').innerHTML = `${G.DIMN[p.d]} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}<br>${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)} · ${Math.round(fps)} к/с${G.netLine ? '<br>' + G.netLine() : ''}`;
    if (G.boss && !G.boss.dead) { $('bossbar').hidden = false; $('bossName').textContent = G.boss.T.n; $('bossHp').style.width = Math.max(0, G.boss.hp / G.boss.T.hp * 100) + '%'; }
    else $('bossbar').hidden = true;
  };
  G.toast = function (text, ms = 2600) {
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = text; el.style.animationDuration = ms + 'ms';
    $('toasts').appendChild(el); setTimeout(() => el.remove(), ms);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  };

  // ---------- окна ----------
  const screens = ['menu', 'newWorld', 'online', 'settings', 'help', 'pause', 'dead', 'inv'];
  let screenStack = [];
  G.show = function (id, push = false) {
    if (!push) screenStack = []; else { const cur = screens.find((s) => !$(s).hidden); if (cur) screenStack.push(cur); }
    for (const s of screens) $(s).hidden = s !== id;
    G.paused = G.state === 'play' && id !== null && id !== undefined && id !== 'none';
    if (!id || id === 'none') { for (const s of screens) $(s).hidden = true; G.paused = false; }
    $('backLink').hidden = G.state === 'play';
    if (G.paused && document.pointerLockElement) document.exitPointerLock();
  };
  G.closeScreen = function () {
    const prev = screenStack.pop();
    if (prev) { for (const s of screens) $(s).hidden = s !== prev; return; }
    if (G.state === 'play') { G.show('none'); G.cursor = null; renderCursor(); G.chestOpen = null; if (G.wantLock) G.wantLock(); }
    else G.show('menu');
  };
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { G.saveSettings(); G.closeScreen(); }));

  // ---------- инвентарь ----------
  G.cursor = null; G.chestOpen = null; let tab = 'bag';
  G.openInv = function (t = 'bag') {
    tab = t === 'craft' ? 'craft' : t;
    $('chestBox').hidden = !G.chestOpen;
    $('tabCreative').hidden = G.mode !== 'creative';
    G.show('inv'); G.renderInv();
  };
  G.openChest = function (x, y, z) {
    const W = G.world, d = G.player.d, k = d + ':' + x + ',' + y + ',' + z;
    if (!W.chests[k]) W.chests[k] = lootFor(W.getMeta(d, x, y, z), x, y, z);
    G.chestOpen = k; G.edited = true; G.openInv('bag'); G.sfx('click');
  };
  function lootFor(table, x, y, z) {
    const items = new Array(27).fill(null); if (!table) return items;
    let s = Math.floor(KM.hash(x, y, z, G.world.seed) * 1e9) || 1; const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const T = {
      1: [['apple', 1, 4], ['bread', 1, 3], ['torch', 4, 12], ['coal', 2, 8], ['seeds', 2, 6], ['planks', 4, 16], ['iron', 1, 3], ['wire', 4, 10], ['lever', 1, 2]],
      2: [['gold', 2, 6], ['iron', 2, 6], ['crystal', 1, 2], ['bomb', 1, 3], ['bread', 1, 4], ['arrow', 4, 12], ['bow', 1, 1]],
      3: [['iron', 2, 5], ['coal', 3, 10], ['crystal', 0, 2], ['meat', 1, 3], ['arrow', 3, 9], ['pick1', 1, 1], ['sword1', 1, 1], ['piston', 1, 2], ['lamp', 1, 2]],
      4: [['ember', 3, 9], ['gold', 2, 6], ['crystal', 1, 3], ['meat', 2, 4], ['sword2', 1, 1], ['glowstone', 2, 6]],
      5: [['feather', 2, 5], ['crystal', 2, 4], ['bread', 2, 4], ['arrow', 6, 16], ['pick2', 1, 1], ['obsidian', 2, 6]],
    }[table] || [];
    const n = 3 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) { const [k, a, b] = T[Math.floor(r() * T.length)], c = a + Math.floor(r() * (b - a + 1)); if (c > 0) items[Math.floor(r() * 27)] = [KM.byKey(k), c, 0]; }
    return items;
  }
  function stackMax(s) { return KM.stackOf(s[0]); }
  // нажатие на ячейку: взять, положить, обменять или сложить стопки
  function clickSlot(arr, i, half) {
    const s = arr[i], c = G.cursor;
    if (!c && s) { if (half && s[1] > 1) { const k = Math.ceil(s[1] / 2); G.cursor = [s[0], k, s[2]]; s[1] -= k; } else { G.cursor = s; arr[i] = null; } }
    else if (c && !s) { if (half) { arr[i] = [c[0], 1, c[2]]; c[1]--; if (!c[1]) G.cursor = null; } else { arr[i] = c; G.cursor = null; } }
    else if (c && s) {
      if (c[0] === s[0] && s[1] < stackMax(s) && !(KM.isItem(s[0]) && KM.I[s[0]].tool)) { const k = Math.min(stackMax(s) - s[1], half ? 1 : c[1]); s[1] += k; c[1] -= k; if (!c[1]) G.cursor = null; }
      else { arr[i] = c; G.cursor = s; }
    }
    G.edited = true; G.uiDirty = true; G.renderInv(); renderCursor();
  }
  function renderCursor() {
    const el = $('cursor');
    if (!G.cursor) { el.style.display = 'none'; return; }
    el.style.display = 'block'; el.querySelector('img').src = G.icon(G.cursor[0]); el.querySelector('b').textContent = G.cursor[1] > 1 ? G.cursor[1] : '';
  }
  addEventListener('pointermove', (e) => { if (G.cursor) { $('cursor').style.left = e.clientX + 'px'; $('cursor').style.top = e.clientY + 'px'; } });
  G.renderInv = function () {
    document.querySelectorAll('#inv .tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $('tabBag').hidden = tab !== 'bag'; $('tabCraft').hidden = tab !== 'craft'; $('tabAll').hidden = tab !== 'creative';
    if (tab === 'bag') {
      $('bagGrid').innerHTML = G.inv.slice(9).map((s, i) => slotHTML(s, `data-i="${i + 9}"`)).join('');
      $('bagHot').innerHTML = G.inv.slice(0, 9).map((s, i) => slotHTML(s, `data-i="${i}"`)).join('');
      if (G.chestOpen) { const items = G.world.chests[G.chestOpen]; $('chestGrid').innerHTML = items.map((s, i) => slotHTML(s, `data-c="${i}"`)).join(''); }
    } else if (tab === 'craft') renderCraft();
    else if (tab === 'creative' && !$('allGrid').children.length) {
      const all = [];
      for (let i = 1; i < KM.NBLOCKS; i++) if (!B[i].hidden && B[i].hard !== undefined && i !== KM.WATER) all.push(i);
      for (const k of Object.keys(KM.I)) all.push(+k);
      $('allGrid').innerHTML = all.map((id) => slotHTML([id, 1, 0], `data-a="${id}"`)).join('');
    }
  };
  $('inv').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; G.renderInv(); return; }
    const s = e.target.closest('.slot'); if (!s) return;
    if (s.dataset.i !== undefined) clickSlot(G.inv, +s.dataset.i, e.shiftKey);
    else if (s.dataset.c !== undefined) clickSlot(G.world.chests[G.chestOpen], +s.dataset.c, e.shiftKey);
    else if (s.dataset.a !== undefined) { const id = +s.dataset.a; G.give(id, KM.stackOf(id)); G.sfx('pop'); G.renderInv(); }
  });
  $('inv').addEventListener('contextmenu', (e) => { e.preventDefault(); const s = e.target.closest('.slot'); if (!s) return; if (s.dataset.i !== undefined) clickSlot(G.inv, +s.dataset.i, true); else if (s.dataset.c !== undefined) clickSlot(G.world.chests[G.chestOpen], +s.dataset.c, true); });
  $('trashBtn').addEventListener('click', () => { G.cursor = null; renderCursor(); });
  // при закрытии взятая стопка возвращается в инвентарь
  const origClose = G.closeScreen;
  G.closeScreen = function () { if (G.cursor && !$('inv').hidden) { G.give(G.cursor[0], G.cursor[1]); G.cursor = null; renderCursor(); } origClose(); };

  // ---------- крафт ----------
  function nearStation(id) {
    const p = G.player, W = G.world;
    for (let x = -4; x <= 4; x++) for (let y = -3; y <= 3; y++) for (let z = -4; z <= 4; z++) if (W.get(p.d, Math.floor(p.x) + x, Math.floor(p.y) + y, Math.floor(p.z) + z) === id) return true;
    return false;
  }
  function renderCraft() {
    const table = nearStation(KM.TABLE), furnace = nearStation(KM.FURNACE), creative = G.mode === 'creative';
    $('stationInfo').textContent = (table ? '🔨 Верстак рядом' : '🔨 Верстака рядом нет') + ' · ' + (furnace ? `🔥 Печь рядом (топлива на ${G.player.fuel} плавок)` : '🔥 Печи рядом нет');
    const rows = KM.RECIPES.map((r, i) => {
      const stOk = !r.st || (r.st === 'table' && table) || (r.st === 'furnace' && furnace);
      const have = r.ing.every(([id, n]) => G.count(id) >= n);
      const fuelOk = r.st !== 'furnace' || G.player.fuel > 0 || G.count(KM.COAL) > 0 || G.count(KM.EMBER) > 0;
      const ok = creative || (stOk && have && fuelOk);
      const ing = r.ing.map(([id, n]) => `${KM.name(id)} ×${n}`).join(', ');
      const need = !stOk ? (r.st === 'table' ? 'нужен верстак' : 'нужна печь') : !have ? 'не хватает материалов' : !fuelOk ? 'нужно топливо: уголь' : '';
      return { ok, html: `<div class="recipe ${ok ? '' : 'off'}"><img src="${G.icon(r.out)}" alt=""><div class="nm">${KM.name(r.out)}${r.n > 1 ? ' ×' + r.n : ''}<small>${ing}</small>${need && !creative ? `<small class="no">${need}</small>` : ''}</div><button type="button" data-r="${i}" ${ok ? '' : 'disabled'}>Сделать</button></div>` };
    });
    rows.sort((a, b) => b.ok - a.ok);
    $('recipeList').innerHTML = rows.map((r) => r.html).join('');
  }
  $('recipeList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    const r = KM.RECIPES[+b.dataset.r], creative = G.mode === 'creative';
    if (!creative) {
      if (!r.ing.every(([id, n]) => G.count(id) >= n)) return;
      if (r.st === 'furnace') { if (G.player.fuel <= 0) { if (G.count(KM.EMBER)) { G.take(KM.EMBER, 1); G.player.fuel += 30; } else if (G.count(KM.COAL)) { G.take(KM.COAL, 1); G.player.fuel += 8; } else return; } G.player.fuel--; }
      for (const [id, n] of r.ing) G.take(id, n);
    }
    G.give(r.out, r.n); G.sfx('craft'); G.edited = true; renderCraft();
  });

  // ---------- управление: клавиатура и мышь ----------
  const inp = G.input, keys = {};
  const playing = () => G.state === 'play' && !G.paused;
  addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (G.state !== 'play') return;
    if (e.code === 'KeyE' || e.code === 'KeyI') { e.preventDefault(); if (!$('inv').hidden) G.closeScreen(); else if (!G.paused) { G.chestOpen = null; G.openInv('bag'); } return; }
    if (!playing()) return;
    keys[e.code] = true;
    if (/^Digit[1-9]$/.test(e.code)) G.hot = +e.code.slice(5) - 1;
    if (e.code === 'KeyF' && G.mode === 'creative') { G.player.fly = !G.player.fly; G.toast(G.player.fly ? 'Полёт включён' : 'Полёт выключен'); }
    if (e.code === 'KeyC') G.openInv('craft');
    if (e.code === 'Space') { e.preventDefault(); const now = performance.now(); if (G.mode === 'creative' && now - lastSpace < 300) { G.player.fly = !G.player.fly; } lastSpace = now; }
    if (e.code === 'KeyQ') { const s = G.held(); if (s && G.mode !== 'creative') { s[1]--; if (!s[1]) G.inv[G.hot] = null; G.uiDirty = true; } }
    readKeys();
  });
  let lastSpace = 0;
  addEventListener('keyup', (e) => { keys[e.code] = false; readKeys(); });
  function readKeys() {
    if (G.settings.touch && touchActive) return;
    inp.f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    inp.s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    inp.jump = !!keys.Space; inp.down = !!(keys.ShiftLeft || keys.ShiftRight); inp.sprint = !!(keys.ControlLeft || keys.KeyR) && inp.f > 0;
  }
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; readKeys(); inp.breakHeld = false; });
  const canvas = $('gl');
  G.wantLock = () => { if (!G.settings.touch && canvas.requestPointerLock) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch {} } };
  canvas.addEventListener('mousedown', (e) => {
    if (G.state !== 'play' || G.settings.touch) return;
    G.unlockAudio();
    if (document.pointerLockElement !== canvas) { G.wantLock(); return; }
    if (G.paused) return;
    if (e.button === 0) { inp.breakHeld = true; G.primary(0, true); }
    if (e.button === 2) G.secondary();
    if (e.button === 1) { const h = G.raycast(5.5); if (h && G.mode === 'creative') { const i = G.inv.findIndex((s) => s && s[0] === h.id); if (i >= 0 && i < 9) G.hot = i; else { G.inv[G.hot] = [h.id, KM.stackOf(h.id), 0]; G.uiDirty = true; } } }
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) inp.breakHeld = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas && playing()) { const k = G.settings.sens * 0.00028; inp.lookDX += e.movementX * k; inp.lookDY += e.movementY * k; } });
  addEventListener('wheel', (e) => { if (playing()) { G.hot = (G.hot + (e.deltaY > 0 ? 1 : 8)) % 9; } }, { passive: true });
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && G.state === 'play' && !G.paused && !G.settings.touch) { inp.breakHeld = false; G.openPause(); } });
  $('hotbar').addEventListener('pointerdown', (e) => { e.stopPropagation(); const s = e.target.closest('[data-h]'); if (s) G.hot = +s.dataset.h; if (e.target.closest('#bagBtn')) { G.chestOpen = null; G.openInv('bag'); } });
  $('pauseBtn').addEventListener('click', () => G.openPause());

  // ---------- сенсорное управление ----------
  let touchActive = false, stickId = null, stickO = null, lookId = null, lookLast = null, lookStart = null, holdTimer = 0;
  const stick = $('stick'), knob = $('knob');
  G.applyTouch = () => { document.body.classList.toggle('touch', !!G.settings.touch); $('tFly').hidden = G.mode !== 'creative'; };
  const tz = $('touch');
  tz.addEventListener('pointerdown', (e) => {
    if (!playing() || e.target.closest('button')) return;
    G.unlockAudio(); touchActive = true; e.preventDefault();
    if (e.clientX < innerWidth * 0.42 && stickId === null) { stickId = e.pointerId; stickO = { x: e.clientX, y: e.clientY }; stick.style.display = 'block'; stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; knob.style.transform = ''; }
    else if (lookId === null) {
      lookId = e.pointerId; lookLast = { x: e.clientX, y: e.clientY }; lookStart = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
      clearTimeout(holdTimer); holdTimer = setTimeout(() => { if (lookId !== null && !lookStart.moved) { inp.breakHeld = true; G.primary(0, true); } }, 260);
    }
    try { tz.setPointerCapture(e.pointerId); } catch {}
  });
  tz.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickId) {
      const dx = e.clientX - stickO.x, dy = e.clientY - stickO.y, l = Math.hypot(dx, dy), m = Math.min(l, 50), k = l ? m / l : 0;
      knob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
      inp.s = Math.abs(dx) > 8 ? dx * k / 50 : 0; inp.f = Math.abs(dy) > 8 ? -dy * k / 50 : 0; inp.sprint = l > 70 && inp.f > 0.6;
    } else if (e.pointerId === lookId) {
      const dx = e.clientX - lookLast.x, dy = e.clientY - lookLast.y; lookLast = { x: e.clientX, y: e.clientY };
      if (Math.hypot(e.clientX - lookStart.x, e.clientY - lookStart.y) > 12) lookStart.moved = true;
      const k = G.settings.sens * 0.00075; inp.lookDX += dx * k; inp.lookDY += dy * k;
    }
  });
  const tEnd = (e) => {
    if (e.pointerId === stickId) { stickId = null; stick.style.display = 'none'; inp.f = inp.s = 0; inp.sprint = false; }
    else if (e.pointerId === lookId) {
      lookId = null; clearTimeout(holdTimer);
      const quick = performance.now() - lookStart.t < 260 && !lookStart.moved;
      if (inp.breakHeld) inp.breakHeld = false; else if (quick && playing()) { const mob = G.pickMob(4); if (mob) G.primary(0, true); else G.secondary(); }
    }
  };
  tz.addEventListener('pointerup', tEnd); tz.addEventListener('pointercancel', tEnd);
  const hold = (id, on, off) => { const b = $(id); b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); G.unlockAudio(); b.classList.add('on'); on(); }); const up = () => { b.classList.remove('on'); off && off(); }; b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up); };
  let lastJump = 0;
  hold('tJump', () => { inp.jump = true; const n = performance.now(); if (G.mode === 'creative' && n - lastJump < 300) G.player.fly = !G.player.fly; lastJump = n; }, () => { inp.jump = false; });
  hold('tDown', () => { inp.down = true; }, () => { inp.down = false; });
  hold('tFly', () => { G.player.fly = !G.player.fly; G.toast(G.player.fly ? 'Полёт включён' : 'Полёт выключен'); });
  hold('tAct', () => { inp.breakHeld = true; G.primary(0, true); }, () => { inp.breakHeld = false; });

  // ---------- пауза и смерть ----------
  G.openPause = function () {
    if (G.state !== 'play' || G.paused) return;
    $('pauseTitle').textContent = G.meta ? G.meta.name : 'Пауза';
    const p = G.player;
    $('pauseInfo').textContent = `${G.DIMN[p.d]} · ${G.mode === 'creative' ? 'творчество' : 'выживание'}${G.online ? ' · комната «' + G.online.room + '»' : ''} · стражей повержено: ${p.wins.length} из 3`;
    G.show('pause');
    if (G.saveWorld) G.saveWorld();
  };
  $('resumeBtn').addEventListener('click', () => { G.show('none'); G.wantLock(); });
  $('pSettings').addEventListener('click', () => G.show('settings', true));
  $('pHelp').addEventListener('click', () => G.show('help', true));
  G.die = function (why) {
    G.player.hp = 0; inp.breakHeld = false; $('deadWhy').textContent = why; G.show('dead');
    if (G.mode !== 'creative' && G.player.food < 6) G.player.food = 6;
  };
  $('respawnBtn').addEventListener('click', () => {
    const p = G.player; p.hp = 20; p.food = Math.max(p.food, 14); p.air = 10;
    if (p.d !== 0) G.travel(0, Math.floor(p.sx), Math.floor(p.sz));
    G.ensureArea(0, p.sx, p.sz, 1);
    const y = G.findSurface(0, Math.floor(p.sx), Math.floor(p.sz));
    p.x = p.sx; p.z = p.sz; p.y = y > 0 ? y : p.sy; p.vx = p.vy = p.vz = 0; p.fallFrom = p.y;
    G.clearMobs(); G.show('none'); G.wantLock();
  });

  // ---------- настройки ----------
  function syncSettings() {
    const s = G.settings;
    $('setDist').value = s.dist; $('setDistV').textContent = s.dist; $('setSens').value = s.sens; $('setFov').value = s.fov; $('setSound').checked = s.sound; $('setTouch').checked = s.touch;
  }
  $('setDist').addEventListener('input', (e) => { G.settings.dist = +e.target.value; $('setDistV').textContent = e.target.value; });
  $('setSens').addEventListener('input', (e) => { G.settings.sens = +e.target.value; });
  $('setFov').addEventListener('input', (e) => { G.settings.fov = +e.target.value; G.resize(); });
  $('setSound').addEventListener('change', (e) => { G.settings.sound = e.target.checked; });
  $('setTouch').addEventListener('change', (e) => { G.settings.touch = e.target.checked; G.applyTouch(); });
  $('settingsBtn').addEventListener('click', () => { syncSettings(); G.show('settings', true); });
  $('pSettings').addEventListener('click', syncSettings);
  $('helpBtn').addEventListener('click', () => G.show('help', true));
  syncSettings(); G.applyTouch();
})();
