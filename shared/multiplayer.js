'use strict';
// Multiplayer rooms for FreasyGames games: players in the same room see each other live as ghosts and a small
// room scoreboard. It runs on Supabase Realtime (broadcast + presence) of the shared project, so it needs no tables.
// It is off until the player turns it on in the game's settings; the choice is kept per game.
//
// const mp = FreasyMultiplayer({
//   key: 'orbita',                        // game key: room channel and saved settings
//   sessionKey: 'orbita-session',         // where the game keeps the signed-in session, for the nickname
//   describe: (s) => `✦ ${s.score}`,      // a peer's state as a short line for the room scoreboard
//   wrap: { x: 100 },                     // optional: fields that wrap around, so they are not smoothed across the edge
//   boardTop: 70,                         // optional: where the room scoreboard starts, in px from the top
// });
// mp.send({ ... }) every frame (sent at most 5 times a second); mp.peers() → [{ id, name, color, s }], s smoothed.
// mp.openSettings() shows the settings sheet; mp.enabled(), mp.setEnabled(on), mp.room(), mp.setRoom(name) for own UIs.
window.FreasyMultiplayer = (opts) => {
  const SB_URL = 'https://ywqxrbmgmvpbeytxjkpi.supabase.co', SB_KEY = 'sb_publishable_igyJK68YpyJYo-0KNrVZPA_rm6_gIRg';
  const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
  const COLORS = ['#5df2a5', '#ffd23f', '#7cc4ff', '#ff9ec2', '#ff9f4a', '#c8ff6b', '#6bf0ff', '#ff7a6b'];
  const SEND_EVERY = 200, STALE = 6000;
  const { key } = opts, wrap = opts.wrap || {};
  const store = { get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cleanRoom = (v) => String(v || '').trim().toLowerCase().replace(/[^a-zа-яё0-9_-]/gi, '').slice(0, 20) || 'общая';
  const cleanName = (v) => String(v || '').trim().replace(/\s+/g, ' ').slice(0, 16);

  let on = store.get(key + '-mp', '0') === '1', room = cleanRoom(store.get(key + '-mp-room', 'общая'));
  let guest = store.get('freasy-guest-name', '');
  if (!guest) { guest = 'Гость' + Math.floor(100 + Math.random() * 900); store.set('freasy-guest-name', guest); }
  const myId = Math.random().toString(36).slice(2, 10);
  let client = null, channel = null, status = 'off', lastSent = 0, lastState = null, peers = new Map(), joinTry = 0;

  function signedName() {
    try { const s = JSON.parse(store.get(opts.sessionKey, 'null')); return s && s.user && s.user.user_metadata && s.user.user_metadata.username; } catch { return null; }
  }
  const name = () => signedName() || guest;
  const colorOf = (id) => COLORS[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length];

  // ——— Connection ———
  function loadLib() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise((ok, fail) => {
      const s = document.createElement('script'); s.src = LIB; s.onload = ok; s.onerror = () => fail(new Error('lib'));
      document.head.appendChild(s);
    });
  }

  async function connect() {
    const attempt = ++joinTry;
    setStatus('connecting');
    try { await loadLib(); } catch { if (attempt === joinTry) setStatus('error'); return; }
    if (attempt !== joinTry || !on) return;
    if (!client) client = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 10 } } });
    const ch = client.channel(`freasy-${key}-${room}`, { config: { broadcast: { self: false }, presence: { key: myId } } });
    channel = ch;
    ch.on('broadcast', { event: 'st' }, ({ payload }) => receive(payload))
      .on('presence', { event: 'sync' }, () => syncPresence(ch))
      .subscribe(async (st) => {
        if (ch !== channel) return;
        if (st === 'SUBSCRIBED') { setStatus('online'); await ch.track({ name: name() }); lastSent = 0; }
        else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') setStatus('error');
        else if (st === 'CLOSED' && on) setStatus('connecting');
      });
  }

  function disconnect() {
    joinTry++;
    if (channel && client) client.removeChannel(channel);
    channel = null; peers.clear(); setStatus('off');
  }

  function syncPresence(ch) {
    const state = ch.presenceState(), seen = new Set();
    for (const [id, metas] of Object.entries(state)) {
      if (id === myId) continue;
      seen.add(id);
      const p = peers.get(id) || { id, color: colorOf(id), s: null, from: null, to: null, at: 0, every: SEND_EVERY, heard: Date.now() };
      p.name = cleanName(metas[0] && metas[0].name) || 'Игрок';
      peers.set(id, p);
    }
    for (const id of [...peers.keys()]) if (!seen.has(id)) peers.delete(id);
    renderBoard();
  }

  // Each update moves the ghost smoothly from where it is drawn now to the new place over one send interval.
  function receive(msg) {
    if (!msg || typeof msg.id !== 'string' || msg.id === myId || typeof msg.s !== 'object' || !msg.s) return;
    const now = Date.now();
    let p = peers.get(msg.id);
    if (!p) { p = { id: msg.id, color: colorOf(msg.id), name: cleanName(msg.n) || 'Игрок', s: null, from: null, to: null, at: 0, every: SEND_EVERY }; peers.set(msg.id, p); }
    if (msg.n) p.name = cleanName(msg.n) || p.name;
    p.from = p.to ? current(p, now) : msg.s; p.to = msg.s;
    p.every = p.at ? Math.min(600, Math.max(80, now - p.at)) : SEND_EVERY; p.at = now; p.heard = now;
    renderBoardSoon();
  }

  function current(p, now) {
    const k = Math.min(1, (now - p.at) / p.every), out = { ...p.to };
    for (const f of Object.keys(p.to)) {
      const a = p.from && p.from[f], b = p.to[f];
      if (typeof a !== 'number' || typeof b !== 'number') continue;
      if (wrap[f] && Math.abs(b - a) > wrap[f] / 2) continue;
      if (p.from.run !== p.to.run) continue;
      out[f] = a + (b - a) * k;
    }
    return out;
  }

  function send(state) {
    if (status !== 'online' || !channel) return;
    lastState = state;
    const now = Date.now();
    // Nobody to show it to: keep quiet, the room quota is shared by all the games.
    if (!peers.size || now - lastSent < SEND_EVERY) return;
    lastSent = now;
    channel.send({ type: 'broadcast', event: 'st', payload: { id: myId, n: name(), s: state } });
  }

  function list() {
    const now = Date.now(), out = [];
    for (const p of peers.values()) {
      if (!p.to || now - p.heard > STALE) continue;
      out.push({ id: p.id, name: p.name, color: p.color, s: current(p, now) });
    }
    return out;
  }

  // ——— Look ———
  const style = document.createElement('style');
  style.textContent = `
  .mp-board { position: fixed; right: 12px; min-width: 150px; max-width: min(240px, 46vw); padding: 10px 12px; border-radius: 16px; background: #111321c0; border: 1px solid #b79aff40; backdrop-filter: blur(6px); font: 700 12px Manrope, system-ui, sans-serif; color: #f8f7ff; pointer-events: none; }
  .mp-board[hidden] { display: none; }
  .mp-board h4 { margin: 0 0 6px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #d9c9ff; }
  .mp-board div { display: flex; align-items: center; gap: 6px; padding: 2px 0; white-space: nowrap; }
  .mp-board i { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .mp-board span { overflow: hidden; text-overflow: ellipsis; }
  .mp-board b { margin-left: auto; color: #b9b6c9; font-weight: 700; padding-left: 8px; }
  .mp-board .me span { color: #bca0ff; }
  .mp-board small { display: block; color: #89879e; margin-top: 4px; font-weight: 600; white-space: normal; }
  .mp-modal { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 64px 16px 16px; background: #0b0c18d0; backdrop-filter: blur(4px); user-select: text; -webkit-user-select: text; touch-action: auto; font-family: Manrope, system-ui, sans-serif; color: #f8f7ff; }
  .mp-modal[hidden] { display: none; }
  .mp-sheet { width: min(420px, 100%); max-height: calc(100vh - 80px); overflow: auto; background: #1d1e31; border: 1px solid #b79aff80; border-radius: 28px; padding: 22px; box-shadow: 0 30px 80px #0009; }
  .mp-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .mp-head h2 { margin: 0; font-size: 26px; letter-spacing: -.05em; }
  .mp-sheet button { min-width: 0; padding: 0; box-shadow: none; transform: none; filter: none; }
  .mp-head h2 { font-weight: 800; text-shadow: none; text-align: left; }
  .mp-x { font: inherit; font-size: 22px; color: #d1cde5; width: 38px; height: 38px; border: 1px solid #ffffff24; border-radius: 50%; background: none; cursor: pointer; }
  .mp-row { display: flex; align-items: center; gap: 12px; padding: 14px 0; border-top: 1px solid #ffffff14; }
  .mp-row:first-of-type { border-top: 0; }
  .mp-row label { flex: 1; font-size: 15px; font-weight: 800; }
  .mp-row label small { display: block; font-size: 12px; font-weight: 600; color: #89879e; margin-top: 3px; line-height: 1.5; }
  .mp-switch { position: relative; width: 52px; height: 30px; flex: none; border-radius: 100px; border: 0; background: #3a3b55; cursor: pointer; transition: background .15s; }
  .mp-switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 50%; background: #f8f7ff; transition: transform .15s; }
  .mp-switch[aria-checked="true"] { background: #bca0ff; }
  .mp-switch[aria-checked="true"]::after { transform: translateX(22px); }
  .mp-sheet input { width: 150px; flex: none; box-sizing: border-box; font: inherit; font-size: 15px; color: #f8f7ff; background: #15162a; border: 1px solid #ffffff24; border-radius: 12px; padding: 10px 12px; }
  .mp-sheet input:focus { outline: 2px solid #bca0ff; outline-offset: 1px; }
  .mp-sheet input:disabled { opacity: .5; }
  .mp-status { min-height: 20px; font-size: 13px; color: #b9b6c9; margin: 4px 2px 0; }
  .mp-status.ok { color: #5df2a5; } .mp-status.bad { color: #ffd27a; }`;
  document.head.appendChild(style);

  const board = document.createElement('div');
  board.className = 'mp-board'; board.hidden = true; board.style.top = (opts.boardTop ?? 70) + 'px';
  // Right after the canvas, so start and game over screens cover it.
  const cvEl = document.querySelector('canvas');
  if (cvEl) cvEl.after(board); else document.body.appendChild(board);

  const sheet = document.createElement('div');
  sheet.className = 'mp-modal'; sheet.hidden = true;
  sheet.innerHTML = `<div class="mp-sheet" role="dialog" aria-label="Настройки">
    <div class="mp-head"><h2>⚙️ Настройки</h2><button class="mp-x" type="button" aria-label="Закрыть">×</button></div>
    <div class="mp-row"><label for="mp-on">Мультиплеер<small>Видишь других игроков в комнате вживую и их счёт</small></label><button class="mp-switch" id="mp-on" type="button" role="switch" aria-checked="false"></button></div>
    <div class="mp-row"><label for="mp-room">Комната<small>Чтобы играть с друзьями, договоритесь об одном названии</small></label><input id="mp-room" maxlength="20" autocomplete="off"></div>
    <div class="mp-row"><label for="mp-name">Имя<small class="mp-name-note"></small></label><input id="mp-name" maxlength="16" autocomplete="off"></div>
    <div class="mp-status"></div>
  </div>`;
  document.body.appendChild(sheet);
  const q = (s) => sheet.querySelector(s);

  function setStatus(s) { status = s; renderSheet(); renderBoard(); }

  function renderSheet() {
    q('#mp-on').setAttribute('aria-checked', on ? 'true' : 'false');
    if (document.activeElement !== q('#mp-room')) q('#mp-room').value = room;
    const signed = signedName();
    q('#mp-name').disabled = !!signed;
    if (document.activeElement !== q('#mp-name')) q('#mp-name').value = signed || guest;
    q('.mp-name-note').textContent = signed ? 'Берётся из твоего аккаунта' : 'Так тебя увидят другие. Войди в аккаунт, чтобы играть под своим ником';
    const st = q('.mp-status'), n = list().length;
    st.className = 'mp-status' + (status === 'online' ? ' ok' : status === 'error' ? ' bad' : '');
    st.textContent = !on ? 'Мультиплеер выключен' : status === 'online' ? `Подключено. В комнате «${room}»: ${n ? `ещё ${n} ${plural(n)}` : 'пока только ты'}`
      : status === 'error' ? 'Не получилось подключиться. Проверь интернет' : 'Подключаемся…';
  }
  const plural = (n) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'игрок' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'игрока' : 'игроков'; };

  function renderBoard() {
    board.hidden = !on;
    if (!on) return;
    const all = list();
    const rows = [`<div class="me"><i style="background:#bca0ff"></i><span>${esc(name())} (ты)</span><b>${lastState ? esc(opts.describe(lastState)) : ''}</b></div>`]
      .concat(all.map((p) => `<div><i style="background:${p.color}"></i><span>${esc(p.name)}</span><b>${esc(opts.describe(p.s))}</b></div>`));
    const note = status === 'online' ? (all.length ? '' : 'Ждём других игроков…') : status === 'error' ? 'Нет связи' : 'Подключаемся…';
    board.innerHTML = `<h4>👥 Комната «${esc(room)}»</h4>${rows.join('')}${note ? `<small>${note}</small>` : ''}`;
    if (!sheet.hidden) renderSheet();
  }
  let boardTimer = 0;
  function renderBoardSoon() { if (!boardTimer) boardTimer = setTimeout(() => { boardTimer = 0; renderBoard(); }, 250); }
  // Scores change between messages too, and peers that went quiet drop off.
  setInterval(() => { if (on) renderBoard(); }, 500);

  function setEnabled(v) {
    on = !!v; store.set(key + '-mp', on ? '1' : '0');
    if (on) connect(); else disconnect();
    renderSheet(); renderBoard();
  }
  function setRoom(v) {
    const r = cleanRoom(v);
    if (r === room) return;
    room = r; store.set(key + '-mp-room', room);
    if (on) { disconnect(); on = true; connect(); }
    renderSheet();
  }
  function setGuest(v) {
    const n = cleanName(v);
    if (!n || n === guest) return;
    guest = n; store.set('freasy-guest-name', guest);
    if (channel && status === 'online') channel.track({ name: name() });
    renderBoard();
  }

  q('.mp-x').addEventListener('click', () => closeSettings());
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSettings(); });
  sheet.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSettings(); e.stopPropagation(); });
  sheet.addEventListener('keyup', (e) => e.stopPropagation());
  sheet.addEventListener('pointerdown', (e) => e.stopPropagation());
  q('#mp-on').addEventListener('click', () => setEnabled(!on));
  q('#mp-room').addEventListener('change', (e) => setRoom(e.target.value));
  q('#mp-name').addEventListener('change', (e) => setGuest(e.target.value));
  function openSettings() { sheet.hidden = false; renderSheet(); }
  function closeSettings() {
    if (document.activeElement === q('#mp-room')) setRoom(q('#mp-room').value);
    if (document.activeElement === q('#mp-name')) setGuest(q('#mp-name').value);
    sheet.hidden = true;
  }

  if (on) connect();
  renderBoard();
  // FreasyChat видит, в какой игре и какой комнате мультиплеера игрок, — чтобы друзья могли «зайти» к нему.
  window.__freasyMp = { key, enabled: () => on, room: () => room };
  return {
    send, peers: list, openSettings, closeSettings, settingsOpen: () => !sheet.hidden,
    enabled: () => on, setEnabled, room: () => room, setRoom, name, setGuest, status: () => status,
    showBoard: (v) => { board.style.visibility = v ? '' : 'hidden'; },
  };
};
