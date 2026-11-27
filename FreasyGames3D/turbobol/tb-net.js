'use strict';
// Турбобол — сеть: пати, подбор игроков и сетевой матч. Всё на Supabase Realtime (broadcast + presence)
// общего проекта сайта, без таблиц.
//
// • Пати: канал tb-party-КОД. Лидер — тот, кто зашёл раньше всех. Лидер ставит пати в подбор или начинает свой матч.
// • Подбор: канал tb-q-<состав>-<режим>. Каждая пати (или одиночка) — одна запись. Самая старая запись — «сборщик»:
//   раскладывает записи по двум командам, не разрывая пати, и объявляет матч. Если людей мало, через 20 секунд
//   свободные места занимают боты.
// • Матч: канал tb-m-КОД. Ведущий (первый в составе) считает физику и 15 раз в секунду рассылает положение всего;
//   остальные присылают своё управление, а у себя считают ту же физику и плавно подтягивают её к данным ведущего.
(() => {
  const TB = window.TB;
  const SB_URL = 'https://ywqxrbmgmvpbeytxjkpi.supabase.co', SB_KEY = 'sb_publishable_igyJK68YpyJYo-0KNrVZPA_rm6_gIRg';
  const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
  const id = Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  const born = Date.now();
  const LET = 'АБВГДЕЖЗИКЛМНПРСТУФХ';
  const code4 = () => Array.from({ length: 4 }, () => LET[(Math.random() * LET.length) | 0]).join('');
  function name() {
    try { const s = JSON.parse(localStorage.getItem('freasy-session') || 'null'); const n = s && s.user && s.user.user_metadata && s.user.user_metadata.username; if (n) return String(n).slice(0, 16); } catch { /* гость */ }
    let g = ''; try { g = localStorage.getItem('freasy-guest-name') || ''; } catch { /* нет */ }
    if (!g) { g = 'Гость' + Math.floor(100 + Math.random() * 900); try { localStorage.setItem('freasy-guest-name', g); } catch { /* нет */ } }
    return g;
  }
  let client = null;
  async function sb() {
    if (!(window.supabase && window.supabase.createClient)) await new Promise((ok, fail) => { const s = document.createElement('script'); s.src = LIB; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
    if (!client) client = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 40 } } });
    return client;
  }
  const r2 = (v) => Math.round(v * 100) / 100;

  const Net = TB.Net = { id, name, onParty: null, onGo: null };

  // ——— Пати ———
  let party = null;   // { code, ch, members, leaderId }
  Net.party = () => party;
  Net.isLeader = () => !party || party.leaderId === id;
  Net.createParty = () => Net.joinParty(code4());
  Net.joinParty = async (code) => {
    code = String(code || '').toUpperCase().replace(/[^A-ZА-ЯЁ0-9]/g, '').slice(0, 8);
    if (code.length < 3) throw new Error('Введи код пати');
    Net.leaveParty();
    await sb();
    const ch = client.channel(`tb-party-${code}`, { config: { broadcast: { self: false }, presence: { key: id } } });
    party = { code, ch, members: [{ id, n: name(), look: TB.look(), t: born }], leaderId: id, status: '' };
    ch.on('presence', { event: 'sync' }, () => {
      if (!party || party.ch !== ch) return;
      const st = ch.presenceState();
      party.members = Object.entries(st).map(([k, m]) => ({ id: k, n: (m[0] && m[0].n) || 'Игрок', look: (m[0] && m[0].look) || {}, t: (m[0] && m[0].t) || 0 })).sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
      if (!party.members.some((m) => m.id === id)) party.members.unshift({ id, n: name(), look: TB.look(), t: born });
      party.leaderId = party.members[0].id;
      Net.onParty && Net.onParty();
    })
      .on('broadcast', { event: 'go' }, ({ payload }) => { if (payload && payload.info) Net.onGo && Net.onGo(payload.info); })
      .on('broadcast', { event: 'status' }, ({ payload }) => { if (party) { party.status = payload && payload.text || ''; Net.onParty && Net.onParty(); } })
      .subscribe(async (s) => { if (s === 'SUBSCRIBED') { await ch.track({ n: name(), look: TB.look(), t: born }); Net.onParty && Net.onParty(); } });
    Net.onParty && Net.onParty();
    return code;
  };
  Net.leaveParty = () => { if (party && client) client.removeChannel(party.ch); party = null; Net.onParty && Net.onParty(); };
  Net.updateLook = () => { if (party && party.ch) party.ch.track({ n: name(), look: TB.look(), t: born }); };
  Net.partySay = (event, payload) => { if (party && party.ch) party.ch.send({ type: 'broadcast', event, payload }); };
  const partyMembers = () => (party ? party.members : [{ id, n: name(), look: TB.look(), t: born }]);

  // Свой матч пати: лидер делит участников на две команды и добавляет ботов.
  Net.partyMatch = (opts) => {
    const mem = partyMembers();
    const size = Math.max(opts.size, Math.ceil(mem.length / 2));
    const players = mem.map((m, i) => ({ id: m.id, name: m.n, look: m.look, team: i % 2 }));
    const info = { code: code4() + code4(), host: id, size, rule: opts.rule, map: opts.map, players: fillBots(players, size, opts.bot) };
    Net.partySay('go', { info });
    return info;
  };
  function fillBots(players, size, level = 1) {
    const out = players.slice(), names = ['Бот Шустрик', 'Бот Гайка', 'Бот Турбо', 'Бот Колесо', 'Бот Мотор', 'Бот Искра'];
    let k = 0;
    for (const team of [0, 1]) {
      while (out.filter((p) => p.team === team).length < size) {
        const body = TB.CARS[(k * 2 + team) % TB.CARS.length].id;
        out.push({ id: 'bot' + k, name: names[k % names.length], team, bot: true, level, look: { body, color: team ? 'c1' : 'c0', accent: TB.COLORS[(k * 3 + 2) % TB.COLORS.length].id, wheels: TB.WHEELS[k % TB.WHEELS.length].id, topper: TB.TOPPERS[(k + 1) % TB.TOPPERS.length].id, antenna: 'none', trail: TB.TRAILS[k % TB.TRAILS.length].id } });
        k++;
      }
    }
    return out;
  }
  Net.fillBots = fillBots;

  // ——— Подбор игроков ———
  let queue = null;
  Net.queue = async ({ size, rule }, onStatus, onMatch) => {
    Net.cancelQueue();
    await sb();
    const key = `tb-q-${size}-${rule}`, joined = Date.now();
    const ch = client.channel(key, { config: { broadcast: { self: false }, presence: { key: id } } });
    const q = queue = { ch, timer: 0, done: false };
    const mine = () => partyMembers().map((m) => ({ id: m.id, n: m.n, look: m.look }));
    let entries = [];
    const read = () => {
      entries = Object.entries(ch.presenceState()).map(([k, m]) => ({ id: k, t: (m[0] && m[0].t) || 0, members: (m[0] && m[0].members) || [] })).filter((e) => e.members.length)
        .sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
    };
    const tick = () => {
      if (queue !== q || q.done) return;
      read();
      const humans = entries.reduce((s, e) => s + e.members.length, 0);
      const wait = Math.floor((Date.now() - joined) / 1000);
      onStatus(`Ищем игроков: ${humans} из ${size * 2} · ${wait} с` + (wait >= 8 ? ' · скоро добавим ботов' : ''));
      if (!entries.length || entries[0].id !== id) return;   // собирает только самая старая запись
      const teams = [[], []], used = [];
      for (const e of entries) {
        const n = e.members.length;
        const t = teams[0].length + n <= size ? 0 : teams[1].length + n <= size ? 1 : -1;
        if (t < 0) continue;
        e.members.forEach((m) => teams[t].push({ id: m.id, name: m.n, look: m.look, team: t }));
        used.push(e.id);
        if (teams[0].length === size && teams[1].length === size) break;
      }
      const full = teams[0].length === size && teams[1].length === size;
      if (!full && Date.now() - joined < 20000) return;
      // объявляем матч: людям — места, остальным — боты
      const arenas = TB.ARENAS;
      const info = { code: code4() + code4(), host: id, size, rule, map: arenas[(Math.random() * arenas.length) | 0], players: fillBots(teams[0].concat(teams[1]), size, 1) };
      q.done = true;
      const send = () => ch.send({ type: 'broadcast', event: 'match', payload: { to: used, info } });
      send(); setTimeout(send, 600);
      setTimeout(() => { if (queue === q) Net.cancelQueue(); }, 1500);
      onMatch(info);
    };
    ch.on('presence', { event: 'sync' }, tick)
      .on('broadcast', { event: 'match' }, ({ payload }) => {
        if (!payload || !payload.to || !payload.to.includes(id) || q.done) return;
        q.done = true; Net.cancelQueue(); onMatch(payload.info);
      })
      .subscribe(async (s) => { if (s === 'SUBSCRIBED') { await ch.track({ t: joined, members: mine() }); tick(); } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') onStatus('Нет связи с сервером. Проверь интернет'); });
    q.timer = setInterval(tick, 1000);
  };
  Net.cancelQueue = () => { if (queue) { clearInterval(queue.timer); if (client) client.removeChannel(queue.ch); queue = null; } };
  Net.inQueue = () => !!queue;

  // ——— Сетевой матч ———
  // host: считает всё и шлёт снимки; гость: шлёт своё управление и подтягивает свою симуляцию к снимкам.
  Net.joinMatch = async (info, match, hooks) => {
    await sb();
    const host = info.host === id;
    const ch = client.channel(`tb-m-${info.code}`, { config: { broadcast: { self: false }, presence: { key: id } } });
    const S = { ch, host, lastSnap: Date.now(), closed: false, present: new Set(), gone: new Map(), jc: 0, lastJc: {} };
    ch.on('broadcast', { event: 's' }, ({ payload }) => { if (!host && payload) { S.lastSnap = Date.now(); applySnap(match, payload, hooks.me); hooks.onSnap && hooks.onSnap(payload); } })
      .on('broadcast', { event: 'in' }, ({ payload }) => {
        if (!host || !payload) return;
        const c = match.cars.find((x) => x.id === payload.id); if (!c || c.bot) return;
        const [th, st, jump, boost, drift, jc] = payload.i;
        c.inp.th = th; c.inp.st = st; c.inp.boost = !!boost; c.inp.drift = !!drift;
        // нажатие прыжка не теряется, даже если кнопку отпустили между сообщениями
        if (jc !== S.lastJc[c.id]) { S.lastJc[c.id] = jc; c.prevJump = false; c.inp.jump = true; c.pendingRelease = !jump; } else c.inp.jump = !!jump;
      })
      .on('broadcast', { event: 'ev' }, ({ payload }) => { if (!host && payload) hooks.onEvent && hooks.onEvent(payload); })
      .on('presence', { event: 'sync' }, () => {
        S.present = new Set(Object.keys(ch.presenceState()));
        if (host) {
          // ушедшего игрока заменяет бот
          for (const c of match.cars) if (!c.bot && c.id !== id && !S.present.has(c.id)) { if (!S.gone.has(c.id)) S.gone.set(c.id, Date.now()); } else S.gone.delete(c.id);
        }
        hooks.onPresence && hooks.onPresence(S.present);
      })
      .subscribe(async (s) => { if (s === 'SUBSCRIBED') await ch.track({ n: name() }); });
    S.sendInput = (inp, jc) => { ch.send({ type: 'broadcast', event: 'in', payload: { id, i: [r2(inp.th), r2(inp.st), inp.jump ? 1 : 0, inp.boost ? 1 : 0, inp.drift ? 1 : 0, jc] } }); };
    S.sendSnap = () => {
      ch.send({ type: 'broadcast', event: 's', payload: snap(match) });
      for (const [cid, at] of S.gone) if (Date.now() - at > 4000) { const c = match.cars.find((x) => x.id === cid); if (c && !c.bot) { c.bot = true; c.level = 1; c.name += ' (бот)'; hooks.onEvent && hooks.onEvent({ k: 'left', who: c.name }); } S.gone.delete(cid); }
    };
    S.sendEvent = (e) => ch.send({ type: 'broadcast', event: 'ev', payload: e });
    S.close = () => { S.closed = true; if (client) client.removeChannel(ch); };
    return S;
  };

  function snap(m) {
    const b = m.ball;
    return {
      ph: m.phase, pt: r2(m.phaseT), tm: r2(m.time), ot: m.overtime ? 1 : 0, sc: m.score,
      b: [...b.p, ...b.v].map(r2),
      c: m.cars.map((c) => [r2(c.p[0]), r2(c.p[1]), r2(c.p[2]), r2(c.v[0]), r2(c.v[1]), r2(c.v[2]), r2(c.yaw), r2(c.pitch), r2(c.roll), Math.round(c.boost),
        (c.ground ? 1 : 0) | (c.demo > 0 ? 2 : 0) | (c.flip ? 4 : 0) | (c.inp.boost ? 8 : 0) | (c.inp.jump ? 16 : 0) | (c.inp.drift ? 32 : 0), r2(c.inp.th), r2(c.inp.st), c.bot ? 1 : 0,
        c.flip ? r2(c.flip.t) : 0, c.flip ? r2(c.flip.ax) : 0, c.flip ? r2(c.flip.ar) : 0]),
      pads: m.A.pads.map((p) => (p.t > 0 ? 1 : 0)).join(''),
      st: m.cars.map((c) => [c.stats.goals, c.stats.shots, c.stats.saves, c.stats.score]),
    };
  }
  // гость: данные ведущего главнее; своя машина подтягивается мягко, чтобы управление не дёргалось
  function applySnap(m, s, me) {
    m.phase = s.ph; m.phaseT = s.pt; m.time = s.tm; m.overtime = !!s.ot; m.score = s.sc; if (s.ph === 'over') m.over = true;
    const blend = (cur, tgt, k, snapDist) => { const d = Math.hypot(tgt[0] - cur[0], tgt[1] - cur[1], tgt[2] - cur[2]); if (d > snapDist) return tgt.slice(); return [cur[0] + (tgt[0] - cur[0]) * k, cur[1] + (tgt[1] - cur[1]) * k, cur[2] + (tgt[2] - cur[2]) * k]; };
    const b = m.ball;
    b.p = blend(b.p, s.b.slice(0, 3), 0.5, 6); b.v = s.b.slice(3, 6);
    s.c.forEach((a, i) => {
      const c = m.cars[i]; if (!c) return;
      const own = c.id === me, k = own ? 0.18 : 0.5;
      c.p = blend(c.p, [a[0], a[1], a[2]], k, own ? 5 : 8);
      if (!own) { c.v = [a[3], a[4], a[5]]; c.yaw = a[6]; c.pitch = a[7]; c.roll = a[8]; c.inp.th = a[11]; c.inp.st = a[12]; c.inp.boost = !!(a[10] & 8); c.inp.jump = !!(a[10] & 16); c.inp.drift = !!(a[10] & 32);
        c.flip = a[10] & 4 ? { t: a[14], ax: a[15], ar: a[16] } : null; }
      else { c.v = [c.v[0] + (a[3] - c.v[0]) * 0.25, c.v[1] + (a[4] - c.v[1]) * 0.25, c.v[2] + (a[5] - c.v[2]) * 0.25]; c.yaw += TB.wrapA(a[6] - c.yaw) * 0.12; }
      c.boost = a[9]; c.ground = !!(a[10] & 1); c.demo = a[10] & 2 ? Math.max(c.demo, 0.5) : 0; c.bot = !!a[13];
    });
    s.pads.split('').forEach((v, i) => { const p = m.A.pads[i]; if (p) p.t = v === '1' ? Math.max(p.t, 0.5) : 0; });
    if (s.st) s.st.forEach((x, i) => { const c = m.cars[i]; if (c) c.stats = { goals: x[0], shots: x[1], saves: x[2], score: x[3] }; });
  }
})();
