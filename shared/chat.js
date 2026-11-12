'use strict';
// FreasyChat — чат FreasyGames 2D и 3D: общий чат, личные сообщения, группы, голосовые комнаты
// и «зайти в игру» к другу. Кнопка есть на каждой странице сайта и в каждой игре (shared/chat-boot.js).
//
// Сообщения хранятся в Supabase (shared/chat.sql): общий чат читают все, личную переписку — только двое,
// группу — только её участники. Новые сообщения приходят через Supabase Realtime с теми же правилами.
// Кто онлайн и в какой игре — presence-канал «freasy-online». Голос — WebRTC (до 6 человек в комнате).
window.FreasyChat = (opts = {}) => {
  if (window.__freasyChat) return window.__freasyChat;
  const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
  const SB_URL = 'https://ywqxrbmgmvpbeytxjkpi.supabase.co', SB_KEY = 'sb_publishable_igyJK68YpyJYo-0KNrVZPA_rm6_gIRg';
  const SESSION_KEY = 'freasy-chat-session';
  // Голос между разными сетями нужен TURN-сервер. Его данные можно вписать в window.FREASY_TURN
  // (например { urls: ['turn:…:443?transport=tcp'], username: '…', credential: '…' }) до загрузки чата.
  const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }].concat(window.FREASY_TURN ? [].concat(window.FREASY_TURN) : []);
  const MAX_VOICE = 6, MAX_LEN = 300, GENERAL = 'general';
  const COLORS = ['#5df2a5', '#ffd23f', '#7cc4ff', '#ff9ec2', '#ff9f4a', '#c8ff6b', '#6bf0ff', '#ff7a6b'];
  const ingame = !!opts.inGame;
  const posKey = 'freasy-chat-pos-' + (ingame ? location.pathname : 'site');
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } } };
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const colorOf = (s) => COLORS[[...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length];
  const tabId = Math.random().toString(36).slice(2, 10);

  /* ---------- безопасность текста ---------- */
  // Мат — звёздочками, ссылки — пометкой. Проверка идёт при показе, поэтому обойти её, отправив текст в обход сайта, нельзя.
  const BAD = /(х[уy][йияеёю]\S*|п[иі]зд\S*|[её]б[аеиоуы]\S*|бля\S*|с[уy]к[аи]\S*|муд[аои]к\S*|залуп\S*|гандон\S*|п[иі]д[оа]р\S*|шлюх\S*)/gi;
  const LINK = /(https?:\/\/\S+|www\.\S+|\b[\w-]+\.(ru|com|net|org|io|gg|me|su|рф|xyz|app|site|online)\b\S*)/gi;
  const strip = (t) => [...String(t || '')].map((c) => { const n = c.charCodeAt(0); return n < 32 || (n >= 0x200b && n <= 0x200f) || (n >= 0x2028 && n <= 0x202e) ? ' ' : c; }).join('');
  const clean = (t) => strip(t).replace(/\s+/g, ' ').trim().slice(0, MAX_LEN).replace(LINK, '[ссылка]').replace(BAD, (w) => w[0] + '*'.repeat(Math.max(2, w.length - 1)));
  const cleanName = (n) => strip(n).replace(/[^\wа-яё -]/gi, '').trim().slice(0, 20);
  let hidden = new Set(store.get('freasy-chat-hidden', []));
  const saveHidden = () => store.set('freasy-chat-hidden', [...hidden]);

  /* ---------- аккаунт и сервер ---------- */
  let acc = null;
  function account() {
    if (!acc && window.FreasyAccount) acc = window.FreasyAccount({ sessionKey: SESSION_KEY, onChange: () => onAuthChange() });
    return acc;
  }
  const session = () => { const s = store.get(SESSION_KEY, null); return s && s.access_token ? s : null; };
  const me = () => { const s = session(); return s && s.user ? { id: s.user.id, name: cleanName(s.user.user_metadata && s.user.user_metadata.username) || 'Игрок' } : null; };
  async function api(path, o = {}) {
    if (account()) return acc.fetch(path, o);
    const res = await fetch(SB_URL + path, { method: o.method || 'GET', headers: { apikey: SB_KEY, 'Content-Type': 'application/json', ...(o.headers || {}) }, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && (data.message || data.msg)) || 'Ошибка ' + res.status);
    return data;
  }
  const notReady = (e) => /chat_|PGRST20|does not exist|schema cache/i.test(String(e && e.message));
  function openLogin() {
    if (!account()) { toast('Войди в аккаунт в любой игре FreasyGames'); return; }
    acc.open();
  }

  /* ---------- состояние ---------- */
  let client = null, online = null, db = null, status = 'off', serverOff = false;
  const people = new Map();                       // tab → {uid, name, path, title, mp}
  const convs = new Map();                        // room → {room, title, kind, other?, gid?, last}
  const msgs = new Map();                         // room → [rows]
  const lastRead = store.get('freasy-chat-read', {});
  let view = 'list', current = GENERAL, groupMembers = [];
  convs.set(GENERAL, { room: GENERAL, title: 'Общий чат', kind: 'general' });

  function loadLib() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = LIB; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
  }
  // Что я сейчас делаю: страница, игра и комната мультиплеера, если он включён.
  function whereAmI() {
    const mp = window.__freasyMp && window.__freasyMp.enabled() ? { key: window.__freasyMp.key, room: window.__freasyMp.room() } : null;
    const title = (document.title || '').split(' — ')[0].replace(/^[^\wа-яё«]+/i, '').trim().slice(0, 40);
    return { path: location.pathname, title: ingame ? title : '', mp };
  }
  const presence = () => { const m = me(); return { uid: m ? m.id : null, name: m ? m.name : 'Гость', ...whereAmI() }; };

  async function connect() {
    if (client) return;
    status = 'connecting'; render();
    try { await loadLib(); } catch { status = 'error'; render(); return; }
    client = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 20 } } });
    online = client.channel('freasy-online', { config: { presence: { key: tabId } } });
    online.on('presence', { event: 'sync' }, syncPeople).subscribe(async (st) => {
      if (st === 'SUBSCRIBED') { status = 'online'; await online.track(presence()); render(); }
      else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') { status = 'error'; render(); }
    });
    await subscribeDb();
    loadConversations();
    loadRoom(current);
  }
  // Новые сообщения из базы: сервер присылает только те, что мне можно читать.
  async function subscribeDb() {
    if (db) { client.removeChannel(db); db = null; }
    const s = session();
    if (s) { try { await api('/auth/v1/user'); } catch { /* обновит токен или выйдет */ } }
    const fresh = session();
    client.realtime.setAuth(fresh ? fresh.access_token : SB_KEY);
    db = client.channel('freasy-chat-db-' + tabId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, ({ new: row }) => onRow(row))
      .subscribe();
  }
  setInterval(() => { if (client && session()) subscribeDb(); }, 40 * 60 * 1000); // токен живёт час
  function syncPeople() {
    const st = online.presenceState();
    people.clear();
    for (const [id, metas] of Object.entries(st)) if (id !== tabId && metas[0]) people.set(id, metas[0]);
    render();
  }
  // Один человек с несколькими вкладками — один игрок; гости — по вкладкам.
  function onlineList() {
    const m = me(), seen = new Set(m ? [m.id] : []), list = [{ self: true, name: m ? m.name : 'Ты', ...whereAmI() }];
    for (const p of people.values()) {
      if (p.uid && seen.has(p.uid)) { const x = list.find((l) => l.uid === p.uid); if (x && !x.title && p.title) Object.assign(x, p); continue; }
      if (p.uid) seen.add(p.uid);
      list.push({ ...p, name: cleanName(p.name) || 'Гость' });
    }
    return list;
  }
  const findOnline = (uid) => onlineList().find((p) => p.uid === uid && !p.self);

  async function onAuthChange() {
    if (online) online.track(presence());
    convs.forEach((c, k) => { if (k !== GENERAL) convs.delete(k); });
    if (client) { await subscribeDb(); loadConversations(); }
    if (current !== GENERAL && !convs.has(current)) { current = GENERAL; view = 'list'; }
    render();
  }

  /* ---------- переписки ---------- */
  const dmRoom = (a, b) => 'dm:' + [a, b].sort().join(':');
  async function loadConversations() {
    const m = me(); if (!m) { render(); return; }
    try {
      const groups = await api(`/rest/v1/chat_members?select=group_id,chat_groups(name)&user_id=eq.${m.id}`);
      for (const g of groups || []) convs.set('g:' + g.group_id, { room: 'g:' + g.group_id, title: (g.chat_groups && g.chat_groups.name) || 'Группа', kind: 'group', gid: g.group_id });
      const dms = await api('/rest/v1/rpc/chat_my_dms', { method: 'POST', body: {} });
      for (const d of dms || []) convs.set(d.room, { room: d.room, title: cleanName(d.other_name) || 'Игрок', kind: 'dm', other: d.other_id, last: d.last_at });
      serverOff = false;
    } catch (e) { if (notReady(e)) serverOff = true; }
    for (const [room, c] of Object.entries(store.get('freasy-chat-started', {}))) if (!convs.has(room) && room.includes(m.id)) convs.set(room, c);
    render();
  }
  async function loadRoom(room) {
    try {
      const rows = await api(`/rest/v1/chat_messages?select=id,room,sender,sender_name,body,created_at&room=eq.${encodeURIComponent(room)}&order=id.desc&limit=60`);
      msgs.set(room, (rows || []).reverse());
      serverOff = false;
    } catch (e) { if (notReady(e)) serverOff = true; msgs.set(room, msgs.get(room) || []); }
    if (room === current && view === 'room') markRead(room);
    render();
  }
  function onRow(row) {
    if (!row || !row.room) return;
    const list = msgs.get(row.room) || [];
    if (list.some((x) => x.id === row.id)) return;
    list.push(row); msgs.set(row.room, list.slice(-120));
    const m = me();
    if (row.room.startsWith('dm:') && !convs.has(row.room) && m) {
      const other = row.sender === m.id ? null : row.sender;
      convs.set(row.room, { room: row.room, title: other ? cleanName(row.sender_name) : 'Личные', kind: 'dm', other });
    }
    if (row.room.startsWith('g:') && !convs.has(row.room)) loadConversations();
    const c = convs.get(row.room); if (c) c.last = row.created_at;
    const mine = m && row.sender === m.id;
    const looking = !panel.hidden && view === 'room' && current === row.room;
    if (looking) markRead(row.room);
    else if (!mine && row.room !== GENERAL && !hidden.has(row.sender_name)) {
      ping(); toast(`✉️ ${cleanName(row.sender_name)}: ${clean(row.body).slice(0, 60)}`, () => openRoom(row.room));
    }
    render();
  }
  const unreadOf = (room) => { const list = msgs.get(room) || [], m = me(), r = lastRead[room] || 0; return list.filter((x) => x.id > r && (!m || x.sender !== m.id) && !hidden.has(x.sender_name)).length; };
  function markRead(room) { const list = msgs.get(room) || []; if (list.length) { lastRead[room] = list[list.length - 1].id; store.set('freasy-chat-read', lastRead); } }
  const totalUnread = () => [...convs.keys()].filter((r) => r !== GENERAL).reduce((s, r) => s + unreadOf(r), 0);

  async function send() {
    const input = q('.fc-input'), m = me();
    if (!m) { openLogin(); return; }
    const text = clean(input.value);
    if (!text) return;
    input.value = '';
    try {
      const rows = await api('/rest/v1/chat_messages', { method: 'POST', headers: { Prefer: 'return=representation' }, body: { room: current, body: text, sender: m.id, sender_name: m.name } });
      if (rows && rows[0]) onRow(rows[0]);
      const c = convs.get(current);
      if (c && c.kind === 'dm') { const started = store.get('freasy-chat-started', {}); started[current] = { room: current, title: c.title, kind: 'dm', other: c.other }; store.set('freasy-chat-started', started); }
    } catch (e) { input.value = text; toast(notReady(e) ? 'Чат ещё не включён на сервере' : e.message); }
  }
  async function startDm(nick, knownId) {
    const m = me(); if (!m) { openLogin(); return; }
    let id = knownId, name = nick;
    if (!id) {
      try {
        const r = await api('/rest/v1/rpc/chat_find_user', { method: 'POST', body: { nick } });
        if (!r || !r[0]) { toast(`Игрок «${nick}» не найден`); return; }
        id = r[0].id; name = r[0].username;
      } catch (e) { toast(notReady(e) ? 'Чат ещё не включён на сервере' : e.message); return; }
    }
    if (id === m.id) { toast('Это ты 🙂'); return; }
    const room = dmRoom(m.id, id);
    if (!convs.has(room)) convs.set(room, { room, title: cleanName(name), kind: 'dm', other: id });
    openRoom(room);
  }
  async function createGroup(name, nicks) {
    if (!me()) { openLogin(); return; }
    try {
      const r = await api('/rest/v1/rpc/chat_create_group', { method: 'POST', body: { group_name: name, nicks } });
      const row = r && r[0];
      if (!row) return;
      if (row.missing && row.missing.length) toast('Не нашли: ' + row.missing.join(', '));
      await subscribeDb();
      const room = 'g:' + row.group_id;
      convs.set(room, { room, title: name, kind: 'group', gid: row.group_id });
      openRoom(room);
    } catch (e) { toast(notReady(e) ? 'Чат ещё не включён на сервере' : e.message); }
  }
  async function loadMembers(gid) {
    try { groupMembers = await api(`/rest/v1/chat_members?select=user_id,username&group_id=eq.${gid}&order=added_at.asc`) || []; } catch { groupMembers = []; }
    render();
  }
  async function addMember(gid, nick) {
    try { const n = await api('/rest/v1/rpc/chat_add_member', { method: 'POST', body: { gid, nick } }); toast(`«${n}» в группе`); loadMembers(gid); }
    catch (e) { toast(e.message); }
  }
  async function leaveGroup(gid) {
    const m = me(); if (!m) return;
    try { await api(`/rest/v1/chat_members?group_id=eq.${gid}&user_id=eq.${m.id}`, { method: 'DELETE' }); } catch (e) { toast(e.message); return; }
    convs.delete('g:' + gid); await subscribeDb(); current = GENERAL; view = 'list'; render();
  }
  function openRoom(room) {
    current = room; view = 'room';
    if (panel.hidden) togglePanel(true);
    const c = convs.get(room);
    if (c && c.kind === 'group') loadMembers(c.gid);
    loadRoom(room);
    render();
    setTimeout(() => { const l = q('.fc-list'); if (l) l.scrollTop = l.scrollHeight; }, 0);
  }

  /* ---------- зайти в игру ---------- */
  function joinGame(p) {
    if (!p || !p.path) return;
    if (p.mp && p.mp.key) {
      // тот же ключ, что у shared/multiplayer.js: мультиплеер включится сам и в той же комнате
      try { localStorage.setItem(p.mp.key + '-mp', '1'); localStorage.setItem(p.mp.key + '-mp-room', p.mp.room); } catch { /* приватный режим */ }
    }
    if (voice.on) leaveVoice();
    location.href = p.path;
  }
  const gameChip = (p) => p && p.title ? `<span class="fc-game">🎮 ${esc(p.title)}${p.mp ? ` · комната «${esc(p.mp.room)}»` : ''}</span>${p.path !== location.pathname || (p.mp && !(window.__freasyMp && window.__freasyMp.enabled() && window.__freasyMp.room() === p.mp.room)) ? `<button class="fc-b" type="button" data-join="${esc(p.uid || '')}">Зайти</button>` : '<small class="fc-here">ты тоже здесь</small>'}` : '';

  /* ---------- голос ---------- */
  const voice = { on: false, room: null, ch: null, stream: null, muted: false, pcs: new Map(), audios: new Map(), outs: new Map(), levels: new Map(), peers: new Map(), ctx: null };
  async function joinVoice() {
    if (!me()) { openLogin(); return; }
    if (voice.on) leaveVoice();
    try { voice.ctx ||= new (window.AudioContext || window.webkitAudioContext)(); await voice.ctx.resume(); } catch { /* без движка — останется аудио-элемент */ }
    try { voice.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch { toast('Нет доступа к микрофону — разреши его в браузере'); return; }
    voice.on = true; voice.room = current; voice.muted = false;
    watchLevel('me', voice.stream);
    const ch = client.channel('freasy-voice-' + current.replace(/[^\w-]/g, '-'), { config: { broadcast: { self: false }, presence: { key: tabId } } });
    voice.ch = ch;
    ch.on('broadcast', { event: 'rtc' }, ({ payload }) => onSignal(payload))
      .on('presence', { event: 'sync' }, () => {
        voice.peers.clear();
        for (const [id, metas] of Object.entries(ch.presenceState())) if (id !== tabId && metas[0]) voice.peers.set(id, metas[0]);
        if (voice.peers.size >= MAX_VOICE) toast(`В комнате уже ${MAX_VOICE} человек`);
        for (const id of [...voice.pcs.keys()]) if (!voice.peers.has(id)) hangUp(id);
        syncVoice(); render();
      })
      .subscribe(async (st) => { if (st === 'SUBSCRIBED') await ch.track({ name: me().name }); });
    render();
  }
  function leaveVoice() {
    voice.on = false;
    for (const id of [...voice.pcs.keys()]) hangUp(id);
    if (voice.stream) voice.stream.getTracks().forEach((t) => t.stop());
    voice.stream = null; voice.levels.delete('me');
    if (voice.ch && client) { try { voice.ch.untrack(); client.removeChannel(voice.ch); } catch { /* уже закрыт */ } }
    voice.ch = null; voice.room = null; voice.peers.clear();
    render();
  }
  function toggleMute() { voice.muted = !voice.muted; if (voice.stream) voice.stream.getAudioTracks().forEach((t) => { t.enabled = !voice.muted; }); render(); }
  // С каждым в голосовой комнате — своё соединение; первым звонит тот, у кого id меньше. Зависшее пересоздаём.
  function syncVoice() {
    if (!voice.on) return;
    for (const [id, p] of voice.peers) {
      const pc = voice.pcs.get(id);
      if (pc && tabId < id && pc.connectionState !== 'connected' && Date.now() - pc.__t > 9000) hangUp(id);
      if (!voice.pcs.has(id) && tabId < id && !hidden.has(p.name)) call(id);
    }
  }
  setInterval(syncVoice, 4000);
  const signal = (to, kind, data) => { if (voice.ch) voice.ch.send({ type: 'broadcast', event: 'rtc', payload: { from: tabId, to, kind, data } }); };
  function makePc(id) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    pc.__t = Date.now(); pc.__queue = [];
    voice.pcs.set(id, pc);
    voice.stream.getTracks().forEach((t) => pc.addTrack(t, voice.stream));
    pc.onicecandidate = (e) => { if (e.candidate) signal(id, 'ice', e.candidate.toJSON()); };
    pc.ontrack = (e) => {
      const stream = e.streams[0] || new MediaStream([e.track]);
      let a = voice.audios.get(id);
      if (!a) { a = document.createElement('audio'); a.autoplay = true; a.playsInline = true; a.setAttribute('playsinline', ''); a.style.display = 'none'; document.body.appendChild(a); voice.audios.set(id, a); }
      a.srcObject = stream;
      const out = voice.ctx && voice.ctx.state === 'running';
      a.muted = !!out;
      a.play().catch(() => { if (!out) toast('Нажми на страницу, чтобы услышать голос'); });
      if (out) {
        const old = voice.outs.get(id); if (old) try { old.src.disconnect(); } catch { /* уже отключён */ }
        const src = voice.ctx.createMediaStreamSource(stream), gain = voice.ctx.createGain();
        src.connect(gain).connect(voice.ctx.destination);
        voice.outs.set(id, { src, gain });
      }
      watchLevel(id, stream); render();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') toast(`С игроком ${(voice.peers.get(id) || {}).name || ''} не соединиться: его сеть не пропускает голос`);
      if (['failed', 'closed'].includes(pc.connectionState)) hangUp(id);
      render();
    };
    return pc;
  }
  async function call(id) { const pc = makePc(id); const o = await pc.createOffer(); await pc.setLocalDescription(o); signal(id, 'offer', { type: o.type, sdp: o.sdp }); }
  const flushIce = async (pc) => { for (const c of pc.__queue.splice(0)) { try { await pc.addIceCandidate(c); } catch { /* устаревший */ } } };
  async function onSignal(p) {
    if (!p || p.to !== tabId || !voice.on) return;
    const who = voice.peers.get(p.from); if (who && hidden.has(who.name)) return;
    try {
      if (p.kind === 'offer') {
        if (voice.pcs.has(p.from)) hangUp(p.from);
        const pc = makePc(p.from);
        await pc.setRemoteDescription(p.data); await flushIce(pc);
        const a = await pc.createAnswer(); await pc.setLocalDescription(a);
        signal(p.from, 'answer', { type: a.type, sdp: a.sdp });
      } else if (p.kind === 'answer') {
        const pc = voice.pcs.get(p.from); if (pc && !pc.currentRemoteDescription) { await pc.setRemoteDescription(p.data); await flushIce(pc); }
      } else if (p.kind === 'ice') {
        const pc = voice.pcs.get(p.from); if (pc) { if (pc.remoteDescription) await pc.addIceCandidate(p.data); else pc.__queue.push(p.data); }
      }
    } catch (e) { console.warn('FreasyChat voice:', e); }
  }
  function hangUp(id) {
    const pc = voice.pcs.get(id); if (pc) { try { pc.close(); } catch { /* уже закрыто */ } voice.pcs.delete(id); }
    const a = voice.audios.get(id); if (a) { a.srcObject = null; a.remove(); voice.audios.delete(id); }
    const o = voice.outs.get(id); if (o) { try { o.src.disconnect(); o.gain.disconnect(); } catch { /* уже отключён */ } voice.outs.delete(id); }
    voice.levels.delete(id);
  }
  function watchLevel(id, stream) {
    try {
      voice.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      const src = voice.ctx.createMediaStreamSource(stream), an = voice.ctx.createAnalyser();
      an.fftSize = 256; src.connect(an);
      voice.levels.set(id, { an, buf: new Uint8Array(an.frequencyBinCount), loud: false });
    } catch { /* без индикатора */ }
  }
  setInterval(() => {
    let changed = false;
    for (const [, l] of voice.levels) { l.an.getByteFrequencyData(l.buf); const loud = Math.max(...l.buf) > 120; if (loud !== l.loud) { l.loud = loud; changed = true; } }
    if (changed && !panel.hidden) renderVoice();
  }, 150);

  /* ---------- вид ---------- */
  const style = document.createElement('style');
  style.textContent = `
  .fa-modal { z-index: 100010 !important; }
  /* Кнопка не должна наследовать стили игры (например, «button { min-width: 240px }»): сбрасываем всё и задаём заново. */
  .fc-btn, .fc-btn b { all: initial; box-sizing: border-box; }
  .fc-btn { position: fixed !important; z-index: 100001 !important; width: ${ingame ? 46 : 58}px !important; height: ${ingame ? 46 : 58}px !important;
    min-width: 0 !important; max-width: none !important; min-height: 0 !important; padding: 0 !important; margin: 0 !important; transform: none !important; filter: none !important;
    border-radius: 50% !important; border: 1px solid #ffffff3a !important; background: linear-gradient(135deg, #bca0ff, #6fe3ff) !important; color: #171225 !important;
    font: ${ingame ? 21 : 26}px/1 system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif !important; text-align: center; cursor: pointer; box-shadow: 0 10px 26px #0009 !important;
    display: grid !important; place-items: center; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; opacity: ${ingame ? '.88' : '1'}; }
  .fc-btn:hover, .fc-btn:active { opacity: 1; transform: none !important; box-shadow: 0 10px 26px #0009 !important; }
  .fc-btn b { position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px; border-radius: 10px; background: #ff5f7e; color: #fff; font: 800 11px/20px Manrope, system-ui, sans-serif; text-align: center; padding: 0 5px; display: block; }
  .fc-btn b[hidden] { display: none; }
  .fc-btn.talk { box-shadow: 0 0 0 4px #5df2a5aa, 0 10px 26px #0009 !important; }
  .fc-panel { position: fixed; z-index: 100002; width: min(390px, calc(100vw - 20px)); height: min(600px, calc(100vh - 24px)); display: flex; flex-direction: column;
    background: #17182b; border: 1px solid #b79aff66; border-radius: 22px; box-shadow: 0 30px 80px #000c; font-family: Manrope, system-ui, sans-serif; color: #f8f7ff; overflow: hidden;
    user-select: text; -webkit-user-select: text; touch-action: auto; text-align: left; line-height: 1.4; }
  .fc-panel[hidden] { display: none; }
  .fc-panel button { font-family: inherit; min-width: 0; box-shadow: none; text-shadow: none; transform: none; letter-spacing: 0; }
  .fc-head { display: flex; align-items: center; gap: 8px; padding: 12px 12px 10px; border-bottom: 1px solid #ffffff12; }
  .fc-head h3 { margin: 0; font-size: 17px; font-weight: 800; letter-spacing: -.02em; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #f8f7ff; text-shadow: none; }
  .fc-head h3 span { background: linear-gradient(120deg, #bca0ff, #6fe3ff); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .fc-ib { width: 32px; height: 32px; flex: none; border-radius: 50%; border: 1px solid #ffffff24; background: none; color: #d1cde5; font-size: 16px; cursor: pointer; padding: 0; display: grid; place-items: center; }
  .fc-online { font: 700 12px Manrope, system-ui, sans-serif; color: #89879e; background: none; border: 0; padding: 4px 6px; border-radius: 8px; cursor: pointer; white-space: nowrap; }
  .fc-online:hover { background: #ffffff10; color: #d1cde5; }
  .fc-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }
  .fc-row { display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-bottom: 1px solid #ffffff0a; cursor: pointer; background: none; border-left: 0; border-right: 0; border-top: 0; color: inherit; text-align: left; width: 100%; font: inherit; }
  .fc-row:hover { background: #ffffff08; }
  .fc-av { width: 36px; height: 36px; flex: none; border-radius: 50%; display: grid; place-items: center; font-weight: 800; color: #171225; font-size: 15px; }
  .fc-row strong { display: block; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fc-row small { display: block; font-size: 12px; color: #89879e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fc-row .fc-mid { flex: 1; min-width: 0; }
  .fc-count { min-width: 20px; height: 20px; border-radius: 10px; background: #ff5f7e; color: #fff; font-size: 11px; font-weight: 800; display: grid; place-items: center; padding: 0 6px; }
  .fc-actions { display: flex; gap: 8px; padding: 12px 14px; flex-wrap: wrap; }
  .fc-panel button.fc-b { font: 800 13px Manrope, system-ui, sans-serif; border: 0; border-radius: 10px; padding: 8px 12px; cursor: pointer; background: #5df2a5; color: #0f2a1d; white-space: nowrap; }
  .fc-panel button.fc-b.alt { background: #2d2e48; color: #f8f7ff; }
  .fc-panel button.fc-b.red { background: #ff5f7e; color: #fff; }
  .fc-panel button.fc-b.vio { background: #bca0ff; color: #171225; }
  .fc-sub { padding: 9px 14px; border-bottom: 1px solid #ffffff12; background: #1d1e33; font-size: 12px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .fc-game { color: #c9f4ff; font-weight: 700; font-size: 12px; }
  .fc-here { color: #89879e; font-size: 11px; }
  .fc-chip { font-size: 12px; font-weight: 700; padding: 4px 9px; border-radius: 100px; background: #2a2b45; border: 1px solid transparent; }
  .fc-chip.loud { border-color: #5df2a5; box-shadow: 0 0 10px #5df2a566; }
  .fc-list { flex: 1; overflow-y: auto; padding: 10px 14px; display: flex; flex-direction: column; gap: 7px; }
  .fc-msg { font-size: 14px; line-height: 1.45; word-wrap: break-word; }
  .fc-msg b { cursor: pointer; margin-right: 6px; }
  .fc-msg time { color: #5c5a72; font-size: 11px; margin-left: 4px; }
  .fc-msg.hid { color: #5c5a72; font-style: italic; font-size: 12px; }
  .fc-empty { color: #89879e; font-size: 13px; text-align: center; margin: auto; line-height: 1.6; padding: 20px; }
  .fc-note { font-size: 11px; color: #6f6c86; padding: 0 14px 6px; line-height: 1.4; }
  .fc-form { display: flex; gap: 8px; padding: 10px 12px 12px; border-top: 1px solid #ffffff12; }
  .fc-input, .fc-field { flex: 1; min-width: 0; font: inherit; font-size: 15px; color: #f8f7ff; background: #11122299; border: 1px solid #ffffff24; border-radius: 12px; padding: 10px 12px; box-sizing: border-box; }
  .fc-input:focus, .fc-field:focus { outline: 2px solid #bca0ff; outline-offset: 1px; }
  .fc-send { font: 800 15px Manrope, system-ui, sans-serif; border: 0; border-radius: 12px; padding: 0 16px; background: #bca0ff; color: #171225; cursor: pointer; }
  .fc-form2 { display: flex; flex-direction: column; gap: 8px; padding: 14px; }
  .fc-form2 label { font-size: 13px; font-weight: 700; color: #b9b6c9; }
  .fc-menu { position: fixed; z-index: 100003; background: #22233a; border: 1px solid #ffffff24; border-radius: 12px; padding: 6px; box-shadow: 0 12px 30px #000a; font: 700 13px Manrope, system-ui, sans-serif; color: #f8f7ff; max-width: 280px; max-height: 70vh; overflow-y: auto; }
  .fc-menu button { display: block; width: 100%; text-align: left; font: inherit; color: #f8f7ff; background: none; border: 0; border-radius: 8px; padding: 8px 10px; cursor: pointer; }
  .fc-menu button:hover { background: #ffffff12; }
  .fc-menu .fc-mrow { display: flex; align-items: center; gap: 8px; padding: 6px 8px; }
  .fc-menu .fc-mrow span { flex: 1; min-width: 0; }
  .fc-menu .fc-mrow small { display: block; color: #89879e; font-weight: 600; }
  .fc-menu .fc-mrow button { width: auto; padding: 5px 8px; background: #2d2e48; }
  .fc-toast { position: fixed; z-index: 100004; left: 50%; bottom: 24px; transform: translateX(-50%); background: #ffd23f; color: #2a1145; font: 800 13px Manrope, system-ui, sans-serif; padding: 10px 14px; border-radius: 12px;
    opacity: 0; transition: opacity .2s; pointer-events: none; max-width: min(420px, 90vw); box-shadow: 0 10px 26px #0008; }
  .fc-toast.on { opacity: 1; pointer-events: auto; cursor: pointer; }`;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.className = 'fc-btn'; btn.type = 'button'; btn.setAttribute('aria-label', 'FreasyChat — чат с игроками');
  btn.innerHTML = '💬<b hidden>0</b>';
  const panel = document.createElement('div');
  panel.className = 'fc-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'FreasyChat');
  const toastEl = document.createElement('div'); toastEl.className = 'fc-toast';
  const mount = () => { document.body.append(btn, panel, toastEl); placeButton(); };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  const q = (s) => panel.querySelector(s);
  let toastT = 0, toastAct = null;
  function toast(t, act = null) { toastEl.textContent = t; toastAct = act; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), act ? 4500 : 2400); }
  toastEl.addEventListener('click', () => { toastEl.classList.remove('on'); if (toastAct) toastAct(); });
  function ping() { try { const c = voice.ctx || new (window.AudioContext || window.webkitAudioContext)(); const o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(.04, c.currentTime); g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + .2); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + .22); } catch { /* без звука */ } }

  // Кнопку можно перетащить: в играх она стоит у правого края посередине, чтобы не мешать управлению.
  function placeButton() {
    const p = store.get(posKey, null), size = ingame ? 46 : 58;
    const x = p ? Math.min(Math.max(6, p.x * innerWidth), innerWidth - size - 6) : innerWidth - size - (ingame ? 10 : 18);
    const y = p ? Math.min(Math.max(6, p.y * innerHeight), innerHeight - size - 6) : ingame ? innerHeight * .5 - size / 2 : innerHeight - size - 18;
    btn.style.left = x + 'px'; btn.style.top = y + 'px';
    placePanel();
  }
  function placePanel() {
    const r = btn.getBoundingClientRect(), w = Math.min(390, innerWidth - 20), h = Math.min(600, innerHeight - 24);
    let left = r.right - w, top = r.top - h - 10;
    if (top < 12) top = Math.min(r.bottom + 10, innerHeight - h - 12);
    if (top < 12) top = 12;
    if (left < 10) left = 10;
    if (left + w > innerWidth - 10) left = innerWidth - w - 10;
    panel.style.left = left + 'px'; panel.style.top = top + 'px';
  }
  addEventListener('resize', placeButton);
  let drag = null;
  btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, bx: btn.offsetLeft, by: btn.offsetTop }; try { btn.setPointerCapture(e.pointerId); } catch { /* ок */ } });
  btn.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 8) return;
    drag.moved = true;
    btn.style.left = Math.min(Math.max(6, drag.bx + dx), innerWidth - btn.offsetWidth - 6) + 'px';
    btn.style.top = Math.min(Math.max(6, drag.by + dy), innerHeight - btn.offsetHeight - 6) + 'px';
    placePanel();
  });
  btn.addEventListener('pointerup', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const moved = drag.moved; drag = null;
    if (moved) { store.set(posKey, { x: btn.offsetLeft / innerWidth, y: btn.offsetTop / innerHeight }); return; }
    togglePanel();
  });
  for (const ev of ['mousedown', 'touchstart', 'click', 'keydown', 'keyup']) btn.addEventListener(ev, (e) => e.stopPropagation());

  function togglePanel(force) {
    panel.hidden = force === undefined ? !panel.hidden : !force;
    if (!panel.hidden) {
      // в игре с захватом мыши (Отель) сначала отпускаем курсор
      if (document.pointerLockElement) document.exitPointerLock();
      connect(); placePanel();
      if (view === 'room') { markRead(current); setTimeout(() => { const l = q('.fc-list'); if (l) l.scrollTop = l.scrollHeight; }, 0); }
    }
    render();
  }

  const time = (ts) => { const d = new Date(ts), now = new Date(); return d.toDateString() === now.toDateString() ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); };
  const avatar = (name, emoji) => `<span class="fc-av" style="background:${colorOf(name)}">${emoji || esc((name || '?')[0].toUpperCase())}</span>`;
  function head(title, back) {
    return `<div class="fc-head">${back ? '<button class="fc-ib" type="button" data-a="back" aria-label="Назад">←</button>' : ''}<h3>${title}</h3>
      <button class="fc-online" type="button" data-a="who" title="Кто онлайн">${status === 'online' ? onlineList().length + ' онлайн' : status === 'error' ? 'нет связи' : 'подключаемся…'}</button>
      <button class="fc-ib" type="button" data-a="close" aria-label="Закрыть">×</button></div>`;
  }
  function renderList() {
    const m = me();
    const rows = [...convs.values()].filter((c) => c.room !== GENERAL).sort((a, b) => String(b.last || '').localeCompare(String(a.last || '')));
    const g = convs.get(GENERAL), gu = 0;
    const rowHtml = (c) => {
      const n = unreadOf(c.room), list = msgs.get(c.room) || [], lastMsg = list[list.length - 1];
      const st = c.kind === 'dm' ? findOnline(c.other) : null;
      const sub = st && st.title ? '🎮 ' + st.title : st ? '🟢 онлайн' : lastMsg ? `${cleanName(lastMsg.sender_name)}: ${clean(lastMsg.body)}` : c.kind === 'group' ? 'Группа' : 'Личные сообщения';
      return `<button class="fc-row" type="button" data-room="${esc(c.room)}">${avatar(c.title, c.kind === 'group' ? '👥' : '')}<span class="fc-mid"><strong>${esc(c.title)}</strong><small>${esc(sub)}</small></span>${n ? `<span class="fc-count">${n > 9 ? '9+' : n}</span>` : ''}</button>`;
    };
    return head('<span>FreasyChat</span>', false) + `<div class="fc-body">
      <button class="fc-row" type="button" data-room="${GENERAL}">${avatar('Общий', '🌐')}<span class="fc-mid"><strong>${esc(g.title)}</strong><small>Все игроки FreasyGames 2D и 3D${gu ? '' : ''}</small></span></button>
      ${m ? rows.map(rowHtml).join('') : ''}
      <div class="fc-actions">${m ? `<button class="fc-b vio" type="button" data-a="dm">✉️ Написать игроку</button><button class="fc-b alt" type="button" data-a="group">👥 Новая группа</button>`
        : `<button class="fc-b vio" type="button" data-a="login">Войти в аккаунт</button><small style="color:#89879e;font-size:12px;width:100%">Войди, чтобы писать, переписываться лично, создавать группы и говорить голосом.</small>`}</div>
      ${serverOff ? '<div class="fc-note" style="color:#ffd27a">Личные сообщения и группы ещё не включены на сервере.</div>' : ''}
      <div class="fc-note">Не сообщай в чате и голосом адрес, телефон, школу и пароли. Нажми на ник, чтобы написать лично или скрыть игрока.</div></div>`;
  }
  function renderRoom() {
    const c = convs.get(current) || convs.get(GENERAL), m = me(), list = msgs.get(c.room) || [];
    let sub = '';
    if (c.kind === 'dm') { const p = findOnline(c.other); sub = `<div class="fc-sub">${p ? (p.title ? gameChip(p) : '<span>🟢 онлайн</span>') : '<span style="color:#89879e">не в сети</span>'}</div>`; }
    if (c.kind === 'group') {
      const chips = groupMembers.map((gm) => { const p = gm.user_id === (m && m.id) ? null : findOnline(gm.user_id); return `<span class="fc-chip" style="color:${colorOf(gm.username)}">${esc(gm.username)}${p ? (p.title ? ' 🎮' : ' 🟢') : ''}</span>`; }).join('');
      const playing = groupMembers.map((gm) => findOnline(gm.user_id)).filter((p) => p && p.title);
      sub = `<div class="fc-sub">${chips}<button class="fc-b alt" type="button" data-a="add">＋</button><button class="fc-b alt" type="button" data-a="leave">Выйти</button></div>`
        + (playing.length ? `<div class="fc-sub">${playing.map((p) => `${esc(p.name)}: ${gameChip(p)}`).join('<br>')}</div>` : '');
    }
    const inThis = voice.on && voice.room === c.room;
    const vchips = inThis ? [`<span class="fc-chip${voice.levels.get('me')?.loud ? ' loud' : ''}">${esc(m.name)} (ты)</span>`].concat([...voice.peers.entries()].map(([id, p]) => {
      const pc = voice.pcs.get(id), stt = hidden.has(p.name) ? ' 🔕' : !pc ? ' ⏳' : pc.connectionState === 'connected' && (voice.outs.has(id) || voice.audios.has(id)) ? ' 🔊' : pc.connectionState === 'failed' ? ' ⚠️' : ' ⏳';
      return `<span class="fc-chip${voice.levels.get(id)?.loud ? ' loud' : ''}" style="color:${colorOf(p.name)}">${esc(p.name)}${stt}</span>`;
    })).join('') : '';
    const vbar = `<div class="fc-sub"><span>🎙 <b>Голос</b></span>${inThis
      ? `<button class="fc-b alt" type="button" data-a="mute">${voice.muted ? '🎙 Вкл' : '🔇 Выкл'}</button><button class="fc-b red" type="button" data-a="vleave">Выйти</button>`
      : `<button class="fc-b" type="button" data-a="vjoin">${m ? 'Войти в голосовой' : 'Войти в аккаунт'}</button>${voice.on ? '<small class="fc-here">ты в голосовом другой переписки</small>' : ''}`}${vchips}</div>`;
    const msgsHtml = list.length ? list.map((x) => hidden.has(x.sender_name) ? '<div class="fc-msg hid">Сообщение скрытого игрока</div>'
      : `<div class="fc-msg"><b style="color:${colorOf(x.sender_name)}" data-name="${esc(x.sender_name)}" data-uid="${esc(x.sender)}">${esc(cleanName(x.sender_name))}</b>${esc(clean(x.body))}<time>${time(x.created_at)}</time></div>`).join('')
      : `<div class="fc-empty">${serverOff ? 'Чат ещё не включён на сервере.' : c.kind === 'general' ? 'Здесь пока тихо. Напиши первым — тебя увидят все на FreasyGames 2D и 3D.' : 'Напиши первое сообщение 👋'}</div>`;
    return head(esc(c.title), true) + sub + vbar + `<div class="fc-list" aria-live="polite">${msgsHtml}</div>
      <form class="fc-form"><input class="fc-input" maxlength="${MAX_LEN}" placeholder="${m ? 'Сообщение…' : 'Войди в аккаунт, чтобы писать'}" autocomplete="off" enterkeyhint="send"><button class="fc-send" type="submit" aria-label="Отправить">➤</button></form>`;
  }
  function renderForm() {
    return head(view === 'dmForm' ? 'Написать игроку' : 'Новая группа', true) + `<form class="fc-form2" data-f="${view}">
      ${view === 'dmForm' ? '<label>Ник игрока<input class="fc-field" name="nick" maxlength="30" autocomplete="off" required></label><button class="fc-b vio" type="submit">Открыть переписку</button>'
        : '<label>Название группы<input class="fc-field" name="name" maxlength="30" autocomplete="off" required></label><label>Ники участников через запятую<input class="fc-field" name="nicks" maxlength="400" autocomplete="off" placeholder="Masha, Petya_2015"></label><button class="fc-b vio" type="submit">Создать группу</button>'}
      <div class="fc-note" style="padding:0">Писать можно только тем, у кого есть аккаунт FreasyGames.</div></form>`;
  }
  let lastHtml = '', pressing = false, pendingRender = false;
  function render() {
    const unread = totalUnread(), b = btn.querySelector('b');
    if (b) { b.hidden = !unread; b.textContent = unread > 9 ? '9+' : unread; }
    btn.classList.toggle('talk', voice.on);
    if (panel.hidden) return;
    if (pressing) { pendingRender = true; return; }
    const keepInput = q('.fc-input') ? q('.fc-input').value : '', hadFocus = document.activeElement && document.activeElement.classList.contains('fc-input');
    const list = q('.fc-list'), atBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    if (document.activeElement && document.activeElement.classList.contains('fc-field')) return; // не мешаем печатать в форме
    const html = view === 'room' ? renderRoom() : view === 'list' ? renderList() : renderForm();
    if (html === lastHtml) return;
    lastHtml = html; panel.innerHTML = html;
    const inp = q('.fc-input'); if (inp) { inp.value = keepInput; if (hadFocus) inp.focus(); }
    const l = q('.fc-list'); if (l && atBottom) l.scrollTop = l.scrollHeight;
  }
  const renderVoice = () => { lastHtml = ''; render(); };
  setInterval(() => { if (!panel.hidden) render(); }, 2000);

  function popup(html, x, y) {
    document.querySelector('.fc-menu')?.remove();
    const m = document.createElement('div'); m.className = 'fc-menu'; m.innerHTML = html;
    document.body.appendChild(m);
    m.style.left = Math.max(8, Math.min(x, innerWidth - m.offsetWidth - 8)) + 'px';
    m.style.top = Math.max(8, Math.min(y, innerHeight - m.offsetHeight - 8)) + 'px';
    setTimeout(() => addEventListener('pointerdown', (e) => { if (!m.contains(e.target)) m.remove(); }, { once: true }), 0);
    for (const ev of ['keydown', 'keyup', 'pointerdown', 'touchstart', 'mousedown']) m.addEventListener(ev, (e) => e.stopPropagation());
    return m;
  }
  function whoMenu(x, y) {
    const m = popup(`<div style="padding:6px 10px;color:#89879e">Сейчас онлайн</div>` + onlineList().map((p, i) => `<div class="fc-mrow"><span>${esc(p.name)}${p.self ? ' (ты)' : p.uid ? '' : ' (гость)'}${p.title ? `<small>🎮 ${esc(p.title)}</small>` : ''}</span>
      ${!p.self && p.uid ? `<button type="button" data-i="${i}" data-k="dm">✉️</button>` : ''}${!p.self && p.title ? `<button type="button" data-i="${i}" data-k="join">Зайти</button>` : ''}</div>`).join(''), x, y);
    const all = onlineList();
    m.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (!b) return; const p = all[+b.dataset.i]; m.remove(); if (b.dataset.k === 'dm') startDm(p.name, p.uid); else joinGame(p); });
  }
  function nameMenu(name, uid, x, y) {
    const m0 = me(); if (m0 && uid === m0.id) return;
    const p = uid ? findOnline(uid) : null;
    const m = popup(`${uid ? '<button type="button" data-k="dm">✉️ Написать лично</button>' : ''}${p && p.title ? `<button type="button" data-k="join">🎮 Зайти к нему: ${esc(p.title)}</button>` : ''}
      <button type="button" data-k="hide">${hidden.has(name) ? '👁 Показать' : '🙈 Скрыть'} «${esc(cleanName(name))}»</button>`, x, y);
    m.addEventListener('click', (e) => {
      const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return; m.remove();
      if (k === 'dm') startDm(name, uid); else if (k === 'join') joinGame(p);
      else { if (hidden.has(name)) hidden.delete(name); else hidden.add(name); saveHidden(); for (const [id, vp] of voice.peers) if (hidden.has(vp.name)) hangUp(id); lastHtml = ''; render(); }
    });
  }

  panel.addEventListener('pointerdown', () => { pressing = true; if (voice.ctx && voice.ctx.state !== 'running') voice.ctx.resume().catch(() => {}); });
  const release = () => setTimeout(() => { pressing = false; if (pendingRender) { pendingRender = false; render(); } }, 120);
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) panel.addEventListener(ev, release);
  panel.addEventListener('click', (e) => {
    const t = e.target;
    const a = t.closest('[data-a]')?.dataset.a;
    if (a === 'close') { togglePanel(false); return; }
    if (a === 'back') { view = 'list'; lastHtml = ''; render(); return; }
    if (a === 'who') { const r = t.closest('[data-a]').getBoundingClientRect(); whoMenu(r.left - 120, r.bottom + 6); return; }
    if (a === 'login') { openLogin(); return; }
    if (a === 'dm') { view = 'dmForm'; lastHtml = ''; render(); setTimeout(() => q('.fc-field')?.focus(), 0); return; }
    if (a === 'group') { view = 'groupForm'; lastHtml = ''; render(); setTimeout(() => q('.fc-field')?.focus(), 0); return; }
    if (a === 'vjoin') { if (!me()) openLogin(); else joinVoice(); return; }
    if (a === 'vleave') { leaveVoice(); return; }
    if (a === 'mute') { toggleMute(); return; }
    if (a === 'add') { const c = convs.get(current); const nick = prompt('Ник игрока, которого добавить в группу:'); if (nick && c) addMember(c.gid, nick.trim()); return; }
    if (a === 'leave') { const c = convs.get(current); if (c && confirm(`Выйти из группы «${c.title}»?`)) leaveGroup(c.gid); return; }
    const room = t.closest('[data-room]')?.dataset.room; if (room) { openRoom(room); return; }
    const join = t.closest('[data-join]'); if (join) { const uid = join.dataset.join; const p = onlineList().find((x) => x.uid === uid && !x.self); if (p) joinGame(p); return; }
    const nm = t.closest('[data-name]'); if (nm) nameMenu(nm.dataset.name, nm.dataset.uid, e.clientX, e.clientY);
  });
  panel.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.classList.contains('fc-form')) { send(); return; }
    if (f.dataset.f === 'dmForm') { const nick = f.nick.value.trim(); if (nick) { f.nick.blur(); startDm(nick); } return; }
    if (f.dataset.f === 'groupForm') { const name = f.name.value.trim(), nicks = f.nicks.value.split(/[,;\s]+/).map((n) => n.trim()).filter(Boolean).slice(0, 19); if (name) { f.name.blur(); createGroup(name, nicks); } }
  });
  panel.addEventListener('focusin', (e) => { if (e.target.classList.contains('fc-input') && !me()) { e.target.blur(); openLogin(); } });
  // клавиши и касания в чате не должны управлять игрой под ним
  for (const ev of ['keydown', 'keyup', 'keypress', 'pointerdown', 'mousedown', 'touchstart', 'touchmove', 'wheel']) panel.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });

  // Меняется игра или комната мультиплеера — обновляем, где я, чтобы друзья могли зайти ко мне.
  let lastWhere = '';
  setInterval(() => { const w = JSON.stringify(whereAmI()); if (w !== lastWhere) { lastWhere = w; if (online && status === 'online') online.track(presence()); render(); } }, 3000);
  addEventListener('pagehide', () => {
    if (voice.on) leaveVoice();
    if (client) { try { if (online) online.untrack(); client.removeAllChannels(); } catch { /* страница закрывается */ } }
  });
  account();
  // Подключаемся сразу: видно, кто онлайн, и приходят личные сообщения, даже когда окно закрыто.
  connect();
  render();
  window.__freasyChat = { open: () => togglePanel(true), close: () => togglePanel(false), isOpen: () => !panel.hidden, dm: startDm };
  return window.__freasyChat;
};
