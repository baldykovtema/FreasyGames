'use strict';
// Кубомир: игра по сети. Комната — канал Supabase Realtime (без таблиц): игроки шлют положение и правки блоков,
// а новичку старший игрок комнаты присылает все правки мира пачками.
(function () {
  const KM = window.KM, G = window.G;
  const SB_URL = 'https://ywqxrbmgmvpbeytxjkpi.supabase.co', SB_KEY = 'sb_publishable_igyJK68YpyJYo-0KNrVZPA_rm6_gIRg';
  const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
  const COLORS = ['#5df2a5', '#ffd23f', '#7cc4ff', '#ff9ec2', '#ff9f4a', '#c8ff6b', '#6bf0ff', '#ff7a6b'];
  const myId = Math.random().toString(36).slice(2, 10);
  let client = null, ch = null, status = 'off', joinedAt = 0, sendT = 0, flushT = 0, outEdits = [], peers = new Map(), presence = {};
  G.myName = () => {
    try { const s = JSON.parse(localStorage.getItem('freasy-session') || 'null'); const n = s && s.user && s.user.user_metadata && s.user.user_metadata.username; if (n) return String(n).slice(0, 16); } catch {}
    let g = localStorage.getItem('freasy-guest-name'); if (!g) { g = 'Гость' + Math.floor(100 + Math.random() * 900); try { localStorage.setItem('freasy-guest-name', g); } catch {} } return g;
  };
  G.roomSeed = (room) => { let h = 2166136261; for (const c of 'kubomir:' + room) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  G.cleanRoom = (v) => String(v || '').trim().toLowerCase().replace(/[^a-zа-яё0-9_-]/gi, '').slice(0, 20) || 'общая';

  function loadLib() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = LIB; s.onload = ok; s.onerror = () => fail(new Error('lib')); document.head.appendChild(s); });
  }
  G.netConnect = async function (room) {
    G.online = { room };
    status = 'connecting';
    try { await loadLib(); } catch { status = 'error'; G.toast('Не удалось подключиться к сети'); return; }
    if (!G.online || G.online.room !== room) return;
    if (!client) client = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 20 } } });
    joinedAt = Date.now();
    ch = client.channel('freasy-kubomir-' + room, { config: { broadcast: { self: false }, presence: { key: myId } } });
    ch.on('broadcast', { event: 'p' }, ({ payload }) => onPlayer(payload))
      .on('broadcast', { event: 'e' }, ({ payload }) => onEdits(payload))
      .on('broadcast', { event: 'hi' }, ({ payload }) => onHello(payload))
      .on('broadcast', { event: 'w' }, ({ payload }) => onWorld(payload))
      .on('presence', { event: 'sync' }, () => { presence = ch.presenceState(); for (const id of [...peers.keys()]) if (!presence[id]) dropPeer(id); })
      .subscribe(async (st) => {
        if (st === 'SUBSCRIBED') {
          status = 'online'; await ch.track({ name: G.myName(), at: joinedAt });
          G.toast('🌐 Ты в комнате «' + room + '»');
          setTimeout(() => { if (ch && Object.keys(presence).some((k) => k !== myId)) ch.send({ type: 'broadcast', event: 'hi', payload: { id: myId } }); }, 1500);
        } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') status = 'error';
      });
    G.world.onEdit = (d, x, y, z, id, m) => { outEdits.push([d, x, y, z, id, m]); };
  };
  G.netDisconnect = function () {
    if (ch && client) client.removeChannel(ch);
    ch = null; status = 'off'; for (const id of [...peers.keys()]) dropPeer(id); G.online = null; outEdits = [];
  };
  G.netLine = () => G.online ? `🌐 ${G.online.room}: ${status === 'online' ? Math.max(peers.size + 1, Object.keys(presence).length) + ' игр.' : status === 'error' ? 'нет связи' : 'подключение…'}` : '';

  // ----- старший игрок присылает мир новичку -----
  function oldest() { let best = myId, at = joinedAt; for (const [id, metas] of Object.entries(presence)) { const a = metas[0] && metas[0].at; if (a && a < at) { at = a; best = id; } } return best === myId; }
  function onHello(msg) {
    if (!msg || msg.id === myId || !oldest()) return;
    const all = [];
    for (let d = 0; d < 3; d++) for (const [k, ed] of G.world.edits[d]) for (const [i, v] of ed) all.push([d, k, i, v]);
    const B = 350, n = Math.max(1, Math.ceil(all.length / B));
    for (let p = 0; p < n; p++) setTimeout(() => { if (ch) ch.send({ type: 'broadcast', event: 'w', payload: { to: msg.id, part: p, of: n, time: G.time, l: all.slice(p * B, (p + 1) * B) } }); }, p * 120);
  }
  function onWorld(msg) {
    if (!msg || msg.to !== myId || !Array.isArray(msg.l)) return;
    if (msg.part === 0 && typeof msg.time === 'number') G.time = msg.time;
    const W = G.world;
    for (const [d, k, i, v] of msg.l) {
      if (d < 0 || d > 2 || typeof k !== 'string') continue;
      let ed = W.edits[d].get(k); if (!ed) { ed = new Map(); W.edits[d].set(k, ed); } ed.set(i, v);
      const c = W.dims[d].get(k); if (c) { c.blocks[i] = v >> 8; c.meta[i] = v & 255; c.dirty = true; }
    }
    G.edited = true;
    if (msg.part === msg.of - 1) G.toast('🌐 Мир комнаты загружен');
  }
  function onEdits(msg) {
    if (!msg || !Array.isArray(msg.l)) return;
    for (const e of msg.l) { const [d, x, y, z, id, m] = e; if (typeof id === 'number' && id >= 0 && id < KM.NBLOCKS) G.world.set(d, x, y, z, id, m, true); }
    G.edited = true;
  }

  // ----- другие игроки -----
  function makeAvatar(color) {
    const g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color }), skin = new THREE.MeshLambertMaterial({ color: '#f2c79b' }), dark = new THREE.MeshLambertMaterial({ color: '#3a3a5a' });
    const bx = (w, h, d, mat, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); o.position.set(x, y, z); g.add(o); return o; };
    bx(0.5, 0.7, 0.28, m, 0, 1.05, 0);                       // туловище
    bx(0.46, 0.46, 0.46, skin, 0, 1.64, 0);                  // голова
    bx(0.5, 0.14, 0.5, m, 0, 1.92, 0);                       // шапка
    for (const s of [-1, 1]) { bx(0.22, 0.7, 0.24, dark, s * 0.13, 0.35, 0); bx(0.18, 0.66, 0.2, m, s * 0.35, 1.05, 0); }
    const eye = new THREE.MeshBasicMaterial({ color: '#222' }); for (const s of [-1, 1]) bx(0.08, 0.08, 0.02, eye, s * 0.11, 1.68, -0.24);
    G.scene.add(g); return g;
  }
  function onPlayer(msg) {
    if (!msg || typeof msg.id !== 'string' || msg.id === myId) return;
    let p = peers.get(msg.id);
    if (!p) {
      const color = COLORS[[...msg.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length];
      const tag = document.createElement('div'); tag.className = 'nametag'; document.getElementById('tags').appendChild(tag);
      p = { id: msg.id, obj: makeAvatar(color), tag, x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw };
      peers.set(msg.id, p);
    }
    p.name = String(msg.n || 'Игрок').slice(0, 16); p.tag.textContent = p.name;
    p.tx = msg.x; p.ty = msg.y; p.tz = msg.z; p.tyaw = msg.yaw; p.d = msg.d; p.heard = Date.now();
  }
  function dropPeer(id) { const p = peers.get(id); if (!p) return; G.scene.remove(p.obj); p.tag.remove(); peers.delete(id); }

  const v3 = new THREE.Vector3();
  G.tickNet = function (dt) {
    if (!G.online) return;
    const me = G.player;
    if (status === 'online' && ch) {
      sendT -= dt; flushT -= dt;
      if (sendT <= 0 && peers.size) { sendT = 0.16; ch.send({ type: 'broadcast', event: 'p', payload: { id: myId, n: G.myName(), d: me.d, x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2), yaw: +me.yaw.toFixed(2) } }); }
      if (flushT <= 0 && outEdits.length) { flushT = 0.15; const l = outEdits.splice(0, 300); ch.send({ type: 'broadcast', event: 'e', payload: { l } }); }
    }
    for (const p of peers.values()) {
      if (Date.now() - p.heard > 8000) { dropPeer(p.id); continue; }
      const k = Math.min(1, dt * 10);
      p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; p.z += (p.tz - p.z) * k; p.yaw += (p.tyaw - p.yaw) * k;
      const show = p.d === me.d; p.obj.visible = show;
      p.obj.position.set(p.x, p.y, p.z); p.obj.rotation.y = p.yaw;
      v3.set(p.x, p.y + 2.1, p.z).project(G.camera);
      const vis = show && v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1 && Math.hypot(p.x - me.x, p.z - me.z) < 48;
      p.tag.style.display = vis && !G.paused ? 'block' : 'none';
      if (vis) { p.tag.style.left = (v3.x + 1) / 2 * innerWidth + 'px'; p.tag.style.top = (1 - v3.y) / 2 * innerHeight + 'px'; }
    }
  };
})();
