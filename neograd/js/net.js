'use strict';
// Неоград: онлайн-комнаты на Supabase Realtime (без таблиц). Игроки видят друг друга пешком и в транспорте,
// видят выстрелы и могут ранить друг друга.
(function () {
  const N = window.N, G = window.G, P = G.player;
  const SB_URL = 'https://ywqxrbmgmvpbeytxjkpi.supabase.co', SB_KEY = 'sb_publishable_igyJK68YpyJYo-0KNrVZPA_rm6_gIRg';
  const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
  const COLORS = ['#5df2a5', '#ffd23f', '#7cc4ff', '#ff9ec2', '#ff9f4a', '#c8ff6b', '#6bf0ff', '#ff7a6b'];
  const myId = Math.random().toString(36).slice(2, 10);
  let client = null, ch = null, status = 'off', sendT = 0, peers = new Map(), presence = {};
  G.myName = () => {
    try { const s = JSON.parse(localStorage.getItem('freasy-session') || 'null'); const n = s && s.user && s.user.user_metadata && s.user.user_metadata.username; if (n) return String(n).slice(0, 16); } catch {}
    let g = localStorage.getItem('freasy-guest-name'); if (!g) { g = 'Гость' + Math.floor(100 + Math.random() * 900); try { localStorage.setItem('freasy-guest-name', g); } catch {} } return g;
  };
  G.cleanRoom = (v) => String(v || '').trim().toLowerCase().replace(/[^a-zа-яё0-9_-]/gi, '').slice(0, 20) || 'общая';
  function loadLib() { if (window.supabase && window.supabase.createClient) return Promise.resolve(); return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = LIB; s.onload = ok; s.onerror = () => fail(new Error('lib')); document.head.appendChild(s); }); }
  G.netConnect = async function (room) {
    G.online = { room }; status = 'connecting';
    try { await loadLib(); } catch { status = 'error'; G.toast('Не удалось подключиться к сети'); return; }
    if (!G.online || G.online.room !== room) return;
    if (!client) client = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 20 } } });
    ch = client.channel('freasy-neograd-' + room, { config: { broadcast: { self: false }, presence: { key: myId } } });
    ch.on('broadcast', { event: 'p' }, ({ payload }) => onState(payload))
      .on('broadcast', { event: 's' }, ({ payload }) => { if (payload && payload.a && payload.b) G.tracer(new THREE.Vector3(...payload.a), new THREE.Vector3(...payload.b)); })
      .on('broadcast', { event: 'h' }, ({ payload }) => { if (payload && payload.to === myId && typeof payload.d === 'number') { const p = peers.get(payload.from); G.hurtPlayer(Math.min(60, payload.d), p ? p.name : 'другой игрок'); } })
      .on('presence', { event: 'sync' }, () => { presence = ch.presenceState(); for (const id of [...peers.keys()]) if (!presence[id]) drop(id); })
      .subscribe(async (st) => { if (st === 'SUBSCRIBED') { status = 'online'; await ch.track({ name: G.myName() }); G.toast('🌐 Ты в комнате «' + room + '»'); } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') status = 'error'; });
  };
  G.netDisconnect = () => { if (ch && client) client.removeChannel(ch); ch = null; status = 'off'; for (const id of [...peers.keys()]) drop(id); G.online = null; };
  G.netLine = () => G.online ? `🌐 ${G.online.room}: ${status === 'online' ? Math.max(peers.size + 1, Object.keys(presence).length) + ' игр.' : status === 'error' ? 'нет связи' : 'подключение…'}` : '';
  const send = (event, payload) => { if (status === 'online' && ch) ch.send({ type: 'broadcast', event, payload }); };

  function makeModel(p) {
    if (p.obj) G.scene.remove(p.obj);
    const s = p.s;
    if (s.m === 'car') p.obj = N.makeCar(s.vt || 'sedan', s.c || p.color);
    else if (s.m === 'plane') p.obj = N.makePlane(p.color);
    else if (s.m === 'heli') p.obj = N.makeHeli(p.color);
    else p.obj = N.makeHuman({ skin: '#f2c79b', shirt: p.color, pants: '#1f2a40', hair: '#2a1d10' });
    p.objMode = s.m + (s.vt || ''); G.scene.add(p.obj);
  }
  function onState(msg) {
    if (!msg || typeof msg.id !== 'string' || msg.id === myId || !msg.s) return;
    let p = peers.get(msg.id);
    if (!p) { const tag = document.createElement('div'); tag.className = 'nametag'; document.getElementById('tags').appendChild(tag); p = { id: msg.id, color: COLORS[[...msg.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length], tag, x: msg.s.x, y: msg.s.y, z: msg.s.z, yaw: msg.s.yaw, anim: 0 }; peers.set(msg.id, p); }
    p.name = String(msg.n || 'Игрок').slice(0, 16); p.tag.textContent = p.name; p.s = msg.s; p.heard = Date.now();
    if (!p.obj || p.objMode !== msg.s.m + (msg.s.vt || '')) makeModel(p);
  }
  function drop(id) { const p = peers.get(id); if (!p) return; if (p.obj) G.scene.remove(p.obj); p.tag.remove(); peers.delete(id); }
  G.remoteDots = () => [...peers.values()].filter((p) => p.s).map((p) => ({ x: p.x, z: p.z, color: p.color }));
  // попадание по другим игрокам
  G.netRayTest = (o, d, best, rayBox) => {
    let hit = null;
    for (const p of peers.values()) { if (!p.s || p.s.dead) continue; const big = p.s.m !== 'foot'; const t = rayBox(o, d, p.x, p.y, p.z, big ? 1.2 : 0.4, big ? 2.2 : 1.9, big ? 2.5 : 0.4, p.yaw); if (t !== null && t < best) { best = t; hit = { t, id: p.id }; } }
    return hit;
  };
  G.netHit = (id, dmg) => { send('h', { from: myId, to: id, d: Math.round(dmg) }); G.sfx('hit'); };
  G.netHitNear = (dmg, r) => { for (const p of peers.values()) if (p.s && p.s.m === 'foot' && Math.hypot(p.x - P.x, p.z - P.z) < r) { G.netHit(p.id, dmg); break; } };
  G.netShot = (a, b) => { if (peers.size) send('s', { a: [a.x, a.y, a.z].map((v) => +v.toFixed(1)), b: [b.x, b.y, b.z].map((v) => +v.toFixed(1)) }); };

  const v3 = new THREE.Vector3();
  G.tickNet = function (dt) {
    if (!G.online) return;
    sendT -= dt;
    if (sendT <= 0 && peers.size + Object.keys(presence).length > 1) {
      sendT = 0.15; const v = P.veh;
      send('p', { id: myId, n: G.myName(), s: { m: P.mode, vt: v && v.type, c: v && v.kind === 'car' ? '#' + (v.model.children[0].material.color.getHexString()) : undefined, x: +P.x.toFixed(2), y: +P.y.toFixed(2), z: +P.z.toFixed(2), yaw: +(v ? v.yaw : P.yaw).toFixed(2), pi: v ? +(v.pitch || 0).toFixed(2) : 0, ro: v ? +(v.roll || 0).toFixed(2) : 0, sp: +(v ? v.speed : P.speed).toFixed(1), dead: G.dead ? 1 : 0 } });
    }
    for (const p of peers.values()) {
      if (Date.now() - p.heard > 8000) { drop(p.id); continue; }
      if (!p.s || !p.obj) continue;
      const k = Math.min(1, dt * 8), s = p.s;
      p.x += (s.x - p.x) * k; p.y += (s.y - p.y) * k; p.z += (s.z - p.z) * k;
      let dy = s.yaw - p.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; p.yaw += dy * k;
      p.obj.position.set(p.x, p.y, p.z); p.obj.rotation.order = 'YXZ';
      if (s.m === 'plane') p.obj.rotation.set(-s.pi, p.yaw, s.ro); else if (s.m === 'heli') { p.obj.rotation.set(s.pi, p.yaw, s.ro); p.obj.userData.rotor.rotation.y += dt * 30; } else p.obj.rotation.set(s.dead ? -Math.PI / 2 : 0, p.yaw, 0);
      if (s.m === 'foot') { p.anim += dt * Math.abs(s.sp) * 2; N.animHuman(p.obj, p.anim, Math.abs(s.sp) / 4.6, false); }
      v3.set(p.x, p.y + (s.m === 'foot' ? 2.3 : 4), p.z).project(G.camera);
      const vis = v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1 && Math.hypot(p.x - P.x, p.z - P.z) < 150 && !G.paused;
      p.tag.style.display = vis ? 'block' : 'none';
      if (vis) { p.tag.style.left = (v3.x + 1) / 2 * innerWidth + 'px'; p.tag.style.top = (1 - v3.y) / 2 * innerHeight + 'px'; }
    }
  };
})();
