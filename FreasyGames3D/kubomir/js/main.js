'use strict';
// Кубомир: список миров, создание, сохранение в IndexedDB, вход и выход из игры.
(function () {
  const KM = window.KM, G = window.G;
  const $ = (id) => document.getElementById(id);

  // ---------- хранилище ----------
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((ok, fail) => { const r = indexedDB.open('kubomir', 1); r.onupgradeneeded = () => r.result.createObjectStore('worlds', { keyPath: 'id' }); r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); });
    return dbp;
  }
  async function tx(mode, fn) { const d = await db(); return new Promise((ok, fail) => { const t = d.transaction('worlds', mode), s = t.objectStore('worlds'); const r = fn(s); t.oncomplete = () => ok(r && r.result); t.onerror = () => fail(t.error); }); }
  const dbAll = () => tx('readonly', (s) => s.getAll());
  const dbGet = (id) => tx('readonly', (s) => s.get(id));
  const dbPut = (rec) => tx('readwrite', (s) => s.put(rec));
  const dbDel = (id) => tx('readwrite', (s) => s.delete(id));

  function serialize() {
    const W = G.world, edits = [];
    for (let d = 0; d < 3; d++) for (const [k, ed] of W.edits[d]) { const flat = []; for (const [i, v] of ed) flat.push(i, v); edits.push([d, k, flat]); }
    const p = G.player;
    return Object.assign({}, G.meta, {
      played: Date.now(), mode: G.mode, peaceful: G.peaceful, time: G.time, hot: G.hot, inv: G.inv, chests: W.chests,
      player: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, hp: p.hp, food: p.food, d: p.d, fly: p.fly, sx: p.sx, sy: p.sy, sz: p.sz, fuel: p.fuel, wins: p.wins },
      edits,
    });
  }
  let saving = false;
  G.saveWorld = async function () {
    if (!G.world || !G.meta || saving) return;
    saving = true;
    try { await dbPut(serialize()); } catch (e) { console.warn('save', e); }
    saving = false;
  };
  addEventListener('pagehide', () => { if (G.state === 'play') G.saveWorld(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') { G.saveWorld(); if (!G.paused && !G.noAutoPause) G.openPause(); } });

  // ---------- вход в мир ----------
  function enter(rec) {
    G.meta = { id: rec.id, name: rec.name, seed: rec.seed, created: rec.created || Date.now(), room: rec.room || null };
    const W = G.world = KM.World(rec.seed);
    if (rec.edits) for (const [d, k, flat] of rec.edits) { const m = new Map(); for (let i = 0; i < flat.length; i += 2) m.set(flat[i], flat[i + 1]); W.edits[d].set(k, m); }
    W.chests = rec.chests || {};
    G.mode = rec.mode || 'survival'; G.peaceful = !!rec.peaceful; G.time = rec.time ?? 0.3; G.hot = rec.hot || 0;
    G.inv = rec.inv && rec.inv.length === 36 ? rec.inv : G.invNew();
    let p;
    if (rec.player) { p = Object.assign(G.newPlayer(0, 0, 0), rec.player); p.vx = p.vy = p.vz = 0; p.fallFrom = p.y; p.wins = p.wins || []; }
    else {
      G.player = G.newPlayer(8, 60, 8);
      const s = G.spawnPoint(); p = G.newPlayer(s.x, s.y, s.z); p.sx = s.x; p.sy = s.y; p.sz = s.z;
      if (G.mode === 'creative') { p.fly = false; G.inv[0] = [KM.GRASS, 64, 0]; G.inv[1] = [KM.PLANKS, 64, 0]; G.inv[2] = [KM.GLASS, 64, 0]; G.inv[3] = [KM.TORCH, 64, 0]; G.inv[4] = [KM.LEVER, 64, 0]; G.inv[5] = [KM.WIRE, 64, 0]; G.inv[6] = [KM.LAMP, 64, 0]; G.inv[7] = [KM.PISTON, 64, 0]; G.inv[8] = [KM.BOMB, 64, 0]; }
    }
    G.player = p;
    G.ensureArea(p.d, p.x, p.z, 1);
    // если сохранились внутри блока — поднимаем наверх
    let guard = 0; while (G.collides(p.d, p.x, p.y, p.z, 0.3, 1.8) && guard++ < 100) p.y += 1;
    G.clearMobs(); G.clearMeshes();
    G.state = 'play'; G.uiDirty = true; G.applyTouch();
    $('hud').hidden = false; document.body.classList.add('playing'); G.show('none');
    G.toast(rec.player ? 'С возвращением в «' + rec.name + '»' : (G.mode === 'creative' ? 'Твори! F или двойной прыжок — полёт' : 'Добудь брёвна: держи левую кнопку на дереве'), 4000);
    if (rec.room) G.netConnect(rec.room);
    G.saveWorld();
  }
  async function quit() {
    await G.saveWorld();
    if (G.online) G.netDisconnect();
    G.clearMobs(); G.clearMeshes(); G.world = null; G.meta = null; G.state = 'menu';
    $('hud').hidden = true; document.body.classList.remove('touch', 'playing');
    G.show('menu'); renderWorlds();
  }
  $('quitBtn').addEventListener('click', quit);

  // ---------- меню ----------
  const fmt = (t) => { const d = new Date(t); return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function renderWorlds() {
    let list = [];
    try { list = await dbAll(); } catch { $('worldList').innerHTML = '<p>Сохранения недоступны в этом режиме браузера — мир будет жить до закрытия вкладки.</p>'; return; }
    list.sort((a, b) => (b.played || 0) - (a.played || 0));
    $('worldList').innerHTML = list.length ? list.map((w) => `<div class="world"><div><b>${w.room ? '🌐 ' : ''}${esc(w.name)}</b><small>${w.mode === 'creative' ? 'Творчество' : 'Выживание'} · ${G.DIMN[(w.player && w.player.d) || 0]} · ${fmt(w.played || w.created)}</small></div><button type="button" data-play="${esc(w.id)}">Играть</button><button type="button" class="x" data-del="${esc(w.id)}" aria-label="Удалить">✕</button></div>`).join('') : '<p>Миров пока нет — создай первый!</p>';
  }
  $('worldList').addEventListener('click', async (e) => {
    const pl = e.target.closest('[data-play]'), del = e.target.closest('[data-del]');
    if (pl) { G.unlockAudio(); const rec = await dbGet(pl.dataset.play); if (rec) { if (rec.room) { rec.mode = rec.mode || 'survival'; } enter(rec); } }
    if (del && confirm('Удалить этот мир навсегда?')) { await dbDel(del.dataset.del); renderWorlds(); }
  });
  $('newWorldBtn').addEventListener('click', () => G.show('newWorld', true));
  $('nwGo').addEventListener('click', () => {
    G.unlockAudio();
    const sv = $('nwSeed').value.trim();
    let seed = sv ? (/^\d+$/.test(sv) ? +sv >>> 0 : G.roomSeed(sv)) : Math.floor(Math.random() * 4e9);
    enter({ id: 'w' + Date.now().toString(36), name: $('nwName').value.trim() || 'Мой мир', seed, mode: $('nwMode').value, peaceful: $('nwDiff').value === 'peaceful', created: Date.now() });
  });
  $('onlineBtn').addEventListener('click', () => { $('onlineNote').textContent = 'Твоё имя в сети: ' + G.myName() + (localStorage.getItem('freasy-session') ? '' : ' (войди в аккаунт FreasyGames, чтобы играть под своим ником)'); G.show('online', true); });
  $('roomGo').addEventListener('click', async () => {
    G.unlockAudio();
    const room = G.cleanRoom($('roomName').value), id = 'room:' + room;
    let rec = null; try { rec = await dbGet(id); } catch {}
    if (!rec) rec = { id, name: 'Комната «' + room + '»', seed: G.roomSeed(room), room, created: Date.now() };
    rec.mode = $('roomMode').value; rec.room = room;
    enter(rec);
  });

  // для автоматических проверок (?test=1)
  if (new URLSearchParams(location.search).get('test') === '1') window.__km = { G, KM, enter };

  renderWorlds();
  G.show('menu');
  requestAnimationFrame(G.frame);
})();
