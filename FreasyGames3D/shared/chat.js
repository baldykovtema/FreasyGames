'use strict';
// FreasyChat — общий чат и голосовая комната для сайтов FreasyGames (2D и 3D).
// Работает на Supabase Realtime общего проекта (broadcast + presence), таблицы не нужны: сообщения живут,
// пока кто-то есть в чате (новичку присылают последние сообщения те, кто уже онлайн).
// Голос — WebRTC между участниками (до 6 человек), сигналы идут через тот же канал.
// Писать и говорить можно только после входа в аккаунт FreasyGames; читать могут все.
//
// <script src="../shared/account.js"></script> <script src="../shared/chat.js"></script>
// FreasyChat({ room: 'общий', site: 'FreasyGames' });
window.FreasyChat = (opts = {}) => {
  const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
  const SB_URL = 'https://ywqxrbmgmvpbeytxjkpi.supabase.co', SB_KEY = 'sb_publishable_igyJK68YpyJYo-0KNrVZPA_rm6_gIRg';
  const SESSION_KEY = 'freasy-chat-session';
  // Сессии игр с тем же аккаунтом: если игрок уже вошёл где-то, второй раз входить не нужно.
  const KNOWN_SESSIONS = [SESSION_KEY, 'hotel-session', 'freasy3d-session', 'catjump-session', 'trassa-session', 'prygun-session', 'patrul-session', 'orbita-session'];
  const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  const MAX_VOICE = 6, MAX_LEN = 200, KEEP = 60;
  const COLORS = ['#5df2a5', '#ffd23f', '#7cc4ff', '#ff9ec2', '#ff9f4a', '#c8ff6b', '#6bf0ff', '#ff7a6b'];
  const room = String(opts.room || 'общий').toLowerCase().replace(/[^a-zа-яё0-9_-]/gi, '').slice(0, 20) || 'общий';
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } } };
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const myId = Math.random().toString(36).slice(2, 10);
  const colorOf = (s) => COLORS[[...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length];

  /* ---------- безопасность сообщений ---------- */
  // Мат заменяется звёздочками, ссылки — пометкой: так в чате не раздают ссылки на чужие сайты.
  const BAD = /(х[уy][йияеёю]\S*|п[иі]зд\S*|[её]б[аеиоуы]\S*|бля\S*|с[уy]к[аи]\S*|муд[аои]к\S*|залуп\S*|гандон\S*|п[иі]д[оа]р\S*|шлюх\S*)/gi;
  const LINK = /(https?:\/\/\S+|www\.\S+|\b[\w-]+\.(ru|com|net|org|io|gg|me|su|рф|xyz|app|site|online)\b\S*)/gi;
  function clean(text) {
    return String(text || '').replace(/[\u0000-\u001f\u200b-\u200f\u2028-\u202e]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN)
      .replace(LINK, '[ссылка]').replace(BAD, (w) => w[0] + '*'.repeat(Math.max(2, w.length - 1)));
  }
  const cleanName = (n) => String(n || '').replace(/[^\wа-яё -]/gi, '').trim().slice(0, 20);
  let hidden = new Set(store.get('freasy-chat-hidden', []));
  const sent = [];
  function rateOk() {
    const now = Date.now();
    while (sent.length && now - sent[0] > 15000) sent.shift();
    if (sent.length && now - sent[sent.length - 1] < 1500) return 'Не так быстро 🙂';
    if (sent.length >= 5) return 'Слишком много сообщений — подожди немного';
    return '';
  }

  /* ---------- аккаунт ---------- */
  function session() {
    for (const k of KNOWN_SESSIONS) {
      const s = store.get(k, null);
      if (s && s.access_token && s.user && s.user.user_metadata && s.user.user_metadata.username && (!s.expires_at || s.expires_at * 1000 > Date.now() - 7 * 864e5)) return s;
    }
    return null;
  }
  const username = () => { const s = session(); return s ? cleanName(s.user.user_metadata.username) : null; };
  let account = null;
  function openLogin() {
    if (!window.FreasyAccount) { toast('Войди в аккаунт в любой игре FreasyGames'); return; }
    if (!account) account = window.FreasyAccount({ sessionKey: SESSION_KEY, onChange: () => { render(); if (channel) channel.track(meta()); } });
    account.open();
  }

  /* ---------- соединение ---------- */
  let client = null, channel = null, status = 'off', messages = store.get('freasy-chat-log-' + room, []).slice(-KEEP), unread = 0;
  const people = new Map();      // id → {name, voice, color}
  function loadLib() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = LIB; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
  }
  const meta = () => ({ name: username() || 'Гость', voice: voice.on, signed: !!username() });
  async function connect() {
    if (channel) return;
    status = 'connecting'; render();
    try { await loadLib(); } catch { status = 'error'; render(); return; }
    if (!client) client = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 20 } } });
    const ch = client.channel('freasy-chat-' + room, { config: { broadcast: { self: false }, presence: { key: myId } } });
    channel = ch;
    ch.on('broadcast', { event: 'msg' }, ({ payload }) => receive(payload))
      .on('broadcast', { event: 'hist?' }, ({ payload }) => giveHistory(payload))
      .on('broadcast', { event: 'hist' }, ({ payload }) => takeHistory(payload))
      .on('broadcast', { event: 'rtc' }, ({ payload }) => onSignal(payload))
      .on('presence', { event: 'sync' }, () => syncPeople())
      .subscribe(async (st) => {
        if (ch !== channel) return;
        if (st === 'SUBSCRIBED') { status = 'online'; await ch.track(meta()); ch.send({ type: 'broadcast', event: 'hist?', payload: { from: myId } }); render(); }
        else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') { status = 'error'; render(); }
      });
  }
  function syncPeople() {
    const state = channel.presenceState(), seen = new Set();
    for (const [id, metas] of Object.entries(state)) {
      if (id === myId) continue;
      const m = metas[0] || {};
      seen.add(id);
      people.set(id, { name: cleanName(m.name) || 'Гость', voice: !!m.voice, signed: !!m.signed, color: colorOf(id) });
    }
    for (const id of [...people.keys()]) if (!seen.has(id)) { people.delete(id); hangUp(id); }
    if (voice.on) syncVoice();
    render();
  }

  /* ---------- текст ---------- */
  function addMessage(m, mine) {
    if (!m || typeof m.t !== 'string' || messages.some((x) => x.id === m.id)) return;
    const msg = { id: String(m.id).slice(0, 20), n: cleanName(m.n) || 'Гость', t: clean(m.t), ts: Math.min(Date.now(), +m.ts || Date.now()), from: String(m.from || '').slice(0, 12) };
    if (!msg.t) return;
    messages.push(msg);
    messages.sort((a, b) => a.ts - b.ts);
    messages = messages.slice(-KEEP);
    store.set('freasy-chat-log-' + room, messages);
    if (!mine && panel.hidden && !hidden.has(msg.n)) unread++;
    render();
  }
  function receive(p) { if (p && p.from !== myId) addMessage(p, false); }
  function giveHistory(p) {
    // Историю отправляет только один, у кого id «меньше» всех — чтобы новичку не прислали её десять раз.
    if (!p || !channel || p.from === myId) return;
    const others = [...people.keys(), myId].filter((id) => id !== p.from).sort();
    if (others[0] !== myId || !messages.length) return;
    channel.send({ type: 'broadcast', event: 'hist', payload: { to: p.from, list: messages.slice(-30) } });
  }
  function takeHistory(p) { if (p && p.to === myId && Array.isArray(p.list)) p.list.slice(-30).forEach((m) => addMessage(m, true)); }
  function send() {
    const input = q('.fc-input');
    const name = username();
    if (!name) { openLogin(); return; }
    const text = clean(input.value);
    if (!text) return;
    const wait = rateOk();
    if (wait) { toast(wait); return; }
    sent.push(Date.now());
    const m = { id: myId + Date.now().toString(36), n: name, t: text, ts: Date.now(), from: myId };
    input.value = '';
    addMessage(m, true);
    if (channel && status === 'online') channel.send({ type: 'broadcast', event: 'msg', payload: m });
  }

  /* ---------- голос ---------- */
  const voice = { on: false, stream: null, muted: false, pcs: new Map(), audios: new Map(), levels: new Map(), ctx: null };
  async function joinVoice() {
    if (!username()) { openLogin(); return; }
    const inVoice = [...people.values()].filter((p) => p.voice).length;
    if (inVoice >= MAX_VOICE) { toast(`В голосовой комнате уже ${MAX_VOICE} человек`); return; }
    try {
      voice.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch { toast('Нет доступа к микрофону — разреши его в браузере'); return; }
    voice.on = true; voice.muted = false;
    watchLevel('me', voice.stream);
    if (channel) await channel.track(meta());
    syncVoice(); render();
  }
  function leaveVoice() {
    voice.on = false;
    for (const id of [...voice.pcs.keys()]) hangUp(id);
    if (voice.stream) voice.stream.getTracks().forEach((t) => t.stop());
    voice.stream = null; voice.levels.delete('me');
    if (channel) channel.track(meta());
    render();
  }
  function toggleMute() {
    voice.muted = !voice.muted;
    if (voice.stream) voice.stream.getAudioTracks().forEach((t) => { t.enabled = !voice.muted; });
    render();
  }
  // С каждым участником голосовой комнаты — своё соединение; первым звонит тот, у кого id меньше.
  function syncVoice() {
    for (const [id, p] of people) {
      const pc = voice.pcs.get(id);
      // зависшее соединение пересоздаём
      if (pc && myId < id && pc.connectionState !== 'connected' && Date.now() - pc.__t > 8000) hangUp(id);
      if (p.voice && !voice.pcs.has(id) && myId < id && !hidden.has(p.name)) call(id);
      if (!p.voice && voice.pcs.has(id)) hangUp(id);
    }
  }
  function signal(to, kind, data) { if (channel) channel.send({ type: 'broadcast', event: 'rtc', payload: { from: myId, to, kind, data } }); }
  function makePc(id) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    pc.__t = Date.now(); pc.__queue = [];
    voice.pcs.set(id, pc);
    voice.stream.getTracks().forEach((t) => pc.addTrack(t, voice.stream));
    pc.onicecandidate = (e) => { if (e.candidate) signal(id, 'ice', e.candidate.toJSON()); };
    pc.ontrack = (e) => {
      let a = voice.audios.get(id);
      if (!a) { a = new Audio(); a.autoplay = true; a.playsInline = true; voice.audios.set(id, a); }
      a.srcObject = e.streams[0];
      a.muted = hidden.has(people.get(id)?.name);
      a.play().catch(() => {});
      watchLevel(id, e.streams[0]);
    };
    pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) hangUp(id); render(); };
    return pc;
  }
  async function call(id) {
    const pc = makePc(id);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    signal(id, 'offer', { type: offer.type, sdp: offer.sdp });
  }
  async function onSignal(p) {
    if (!p || p.to !== myId || !voice.on || typeof p.from !== 'string') return;
    // Отметка «в голосовой» может дойти позже самого звонка — поэтому звонок принимаем и без неё.
    const who = people.get(p.from);
    if (who && hidden.has(who.name)) return;
    try {
      if (p.kind === 'offer') {
        if (voice.pcs.has(p.from)) hangUp(p.from);
        const pc = makePc(p.from);
        await pc.setRemoteDescription(p.data);
        await flushIce(pc);
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        signal(p.from, 'answer', { type: ans.type, sdp: ans.sdp });
      } else if (p.kind === 'answer') {
        const pc = voice.pcs.get(p.from); if (pc && !pc.currentRemoteDescription) { await pc.setRemoteDescription(p.data); await flushIce(pc); }
      } else if (p.kind === 'ice') {
        // кандидаты, пришедшие раньше описания соединения, ждут в очереди
        const pc = voice.pcs.get(p.from);
        if (pc) { if (pc.remoteDescription) await pc.addIceCandidate(p.data); else pc.__queue.push(p.data); }
      }
    } catch (e) { console.warn('FreasyChat voice:', e); }
  }
  async function flushIce(pc) { for (const c of pc.__queue.splice(0)) { try { await pc.addIceCandidate(c); } catch { /* устаревший кандидат */ } } }
  function hangUp(id) {
    const pc = voice.pcs.get(id); if (pc) { try { pc.close(); } catch { /* уже закрыто */ } voice.pcs.delete(id); }
    const a = voice.audios.get(id); if (a) { a.srcObject = null; voice.audios.delete(id); }
    voice.levels.delete(id);
  }
  // Кто сейчас говорит: подсвечиваем его в списке.
  function watchLevel(id, stream) {
    try {
      voice.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      const src = voice.ctx.createMediaStreamSource(stream), an = voice.ctx.createAnalyser();
      an.fftSize = 256; src.connect(an);
      voice.levels.set(id, { an, buf: new Uint8Array(an.frequencyBinCount), loud: false });
    } catch { /* без индикатора */ }
  }
  setInterval(() => { if (voice.on) syncVoice(); }, 4000);
  setInterval(() => {
    let changed = false;
    for (const [, l] of voice.levels) {
      l.an.getByteFrequencyData(l.buf);
      const loud = l.buf.reduce((s, v) => s + v, 0) / l.buf.length > 18;
      if (loud !== l.loud) { l.loud = loud; changed = true; }
    }
    if (changed && !panel.hidden) renderVoice();
  }, 150);

  function toggleHide(name) {
    if (hidden.has(name)) hidden.delete(name); else hidden.add(name);
    store.set('freasy-chat-hidden', [...hidden]);
    for (const [id, p] of people) { const a = voice.audios.get(id); if (a) a.muted = hidden.has(p.name); if (hidden.has(p.name)) hangUp(id); }
    if (voice.on) syncVoice();
    render();
  }

  /* ---------- вид ---------- */
  const style = document.createElement('style');
  style.textContent = `
  .fc-btn { position: fixed; right: max(16px, env(safe-area-inset-right)); bottom: max(16px, env(safe-area-inset-bottom)); z-index: 900; width: 58px; height: 58px; border-radius: 50%; border: 1px solid #ffffff2a;
    background: linear-gradient(135deg, #bca0ff, #6fe3ff); color: #171225; font-size: 26px; cursor: pointer; box-shadow: 0 12px 30px #0008; display: grid; place-items: center; padding: 0; }
  .fc-btn b { position: absolute; top: -4px; right: -4px; min-width: 22px; height: 22px; border-radius: 11px; background: #ff5f7e; color: #fff; font: 800 12px Manrope, system-ui, sans-serif; display: grid; place-items: center; padding: 0 5px; }
  .fc-btn b[hidden] { display: none; }
  .fc-btn.talk { box-shadow: 0 0 0 4px #5df2a5aa, 0 12px 30px #0008; }
  .fc-panel { position: fixed; right: max(16px, env(safe-area-inset-right)); bottom: 86px; z-index: 901; width: min(380px, calc(100vw - 24px)); height: min(560px, calc(100vh - 110px)); display: flex; flex-direction: column;
    background: #17182b; border: 1px solid #b79aff66; border-radius: 22px; box-shadow: 0 30px 80px #000a; font-family: Manrope, system-ui, sans-serif; color: #f8f7ff; overflow: hidden; user-select: text; -webkit-user-select: text; }
  .fc-panel[hidden] { display: none; }
  .fc-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px 10px; border-bottom: 1px solid #ffffff12; }
  .fc-head h3 { margin: 0; font-size: 18px; font-weight: 800; letter-spacing: -.03em; }
  .fc-head h3 span { background: linear-gradient(120deg, #bca0ff, #6fe3ff); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .fc-online { font-size: 12px; color: #89879e; font-weight: 700; }
  .fc-x { margin-left: auto; width: 32px; height: 32px; border-radius: 50%; border: 1px solid #ffffff24; background: none; color: #d1cde5; font-size: 18px; cursor: pointer; padding: 0; }
  .fc-voice { padding: 10px 14px; border-bottom: 1px solid #ffffff12; background: #1d1e33; }
  .fc-vrow { display: flex; align-items: center; gap: 8px; }
  .fc-vrow strong { font-size: 13px; }
  .fc-vrow small { color: #89879e; font-size: 12px; font-weight: 600; }
  .fc-vb { margin-left: auto; display: flex; gap: 6px; }
  .fc-panel button.fc-b { font: 800 13px Manrope, system-ui, sans-serif; border: 0; border-radius: 10px; padding: 8px 12px; cursor: pointer; background: #5df2a5; color: #0f2a1d; }
  .fc-panel button.fc-b.alt { background: #2d2e48; color: #f8f7ff; }
  .fc-panel button.fc-b.red { background: #ff5f7e; color: #fff; }
  .fc-people { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .fc-people span { font-size: 12px; font-weight: 700; padding: 4px 9px; border-radius: 100px; background: #2a2b45; border: 1px solid transparent; }
  .fc-people span.loud { border-color: #5df2a5; box-shadow: 0 0 10px #5df2a566; }
  .fc-list { flex: 1; overflow-y: auto; padding: 10px 14px; display: flex; flex-direction: column; gap: 8px; }
  .fc-msg { font-size: 14px; line-height: 1.45; word-wrap: break-word; }
  .fc-msg b { cursor: pointer; margin-right: 6px; }
  .fc-msg time { color: #5c5a72; font-size: 11px; margin-left: 4px; }
  .fc-msg.hid { color: #5c5a72; font-style: italic; font-size: 12px; }
  .fc-empty { color: #89879e; font-size: 13px; text-align: center; margin: auto; line-height: 1.6; }
  .fc-note { font-size: 11px; color: #6f6c86; padding: 0 14px 6px; line-height: 1.4; }
  .fc-form { display: flex; gap: 8px; padding: 10px 12px 12px; border-top: 1px solid #ffffff12; }
  .fc-input { flex: 1; min-width: 0; font: inherit; font-size: 15px; color: #f8f7ff; background: #11122299; border: 1px solid #ffffff24; border-radius: 12px; padding: 10px 12px; }
  .fc-input:focus { outline: 2px solid #bca0ff; outline-offset: 1px; }
  .fc-send { font: 800 15px Manrope, system-ui, sans-serif; border: 0; border-radius: 12px; padding: 0 16px; background: #bca0ff; color: #171225; cursor: pointer; }
  .fc-menu { position: fixed; z-index: 902; background: #22233a; border: 1px solid #ffffff24; border-radius: 12px; padding: 6px; box-shadow: 0 12px 30px #000a; font: 700 13px Manrope, system-ui, sans-serif; }
  .fc-menu button { display: block; width: 100%; text-align: left; font: inherit; color: #f8f7ff; background: none; border: 0; border-radius: 8px; padding: 8px 10px; cursor: pointer; }
  .fc-menu button:hover { background: #ffffff12; }
  .fc-toast { position: fixed; right: 20px; bottom: 90px; z-index: 903; background: #ffd23f; color: #2a1145; font: 800 13px Manrope, system-ui, sans-serif; padding: 9px 14px; border-radius: 10px; opacity: 0; transition: opacity .2s; pointer-events: none; }
  .fc-toast.on { opacity: 1; }`;
  document.head.appendChild(style);
  const btn = document.createElement('button');
  btn.className = 'fc-btn'; btn.type = 'button'; btn.setAttribute('aria-label', 'FreasyChat — чат с игроками');
  btn.innerHTML = '💬<b hidden>0</b>';
  const panel = document.createElement('div');
  panel.className = 'fc-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'FreasyChat');
  panel.innerHTML = `
    <div class="fc-head"><h3><span>FreasyChat</span></h3><span class="fc-online"></span><button class="fc-x" type="button" aria-label="Закрыть">×</button></div>
    <div class="fc-voice"><div class="fc-vrow"><span>🎙</span><div><strong>Голосовая комната</strong><br><small class="fc-vinfo"></small></div><div class="fc-vb"></div></div><div class="fc-people"></div></div>
    <div class="fc-list" aria-live="polite"></div>
    <div class="fc-note">Не сообщай в чате и голосом адрес, телефон, школу и пароли. Нажми на ник, чтобы скрыть игрока.</div>
    <form class="fc-form"><input class="fc-input" maxlength="${MAX_LEN}" placeholder="Сообщение…" autocomplete="off" enterkeyhint="send"><button class="fc-send" type="submit">➤</button></form>`;
  const toastEl = document.createElement('div'); toastEl.className = 'fc-toast';
  const add = () => { document.body.append(btn, panel, toastEl); };
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
  const q = (s) => panel.querySelector(s);
  let toastT = 0;
  function toast(t) { toastEl.textContent = t; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 2200); }

  const time = (ts) => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  function renderList() {
    const list = q('.fc-list'), atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    list.innerHTML = messages.length ? messages.map((m) => hidden.has(m.n)
      ? `<div class="fc-msg hid">Сообщение скрытого игрока</div>`
      : `<div class="fc-msg"><b style="color:${colorOf(m.n)}" data-name="${esc(m.n)}">${esc(m.n)}</b>${esc(m.t)}<time>${time(m.ts)}</time></div>`).join('')
      : `<div class="fc-empty">Здесь пока тихо.<br>Напиши первым — тебя увидят все, кто сейчас на ${esc(opts.site || 'FreasyGames')}.</div>`;
    if (atBottom) list.scrollTop = list.scrollHeight;
  }
  function renderVoice() {
    const inVoice = [...people.entries()].filter(([, p]) => p.voice);
    const loud = (id) => voice.levels.get(id)?.loud ? ' loud' : '';
    q('.fc-vinfo').textContent = voice.on ? (voice.muted ? 'Ты в комнате · микрофон выключен' : 'Ты в комнате · тебя слышно') : inVoice.length ? `Сейчас говорят: ${inVoice.length}` : 'Никого нет — зайди первым';
    q('.fc-vb').innerHTML = voice.on
      ? `<button class="fc-b alt" type="button" data-v="mute">${voice.muted ? '🎙 Вкл' : '🔇 Выкл'}</button><button class="fc-b red" type="button" data-v="leave">Выйти</button>`
      : `<button class="fc-b" type="button" data-v="join">${username() ? 'Войти' : 'Войти в аккаунт'}</button>`;
    const chips = (voice.on ? [`<span class="${loud('me')}">${esc(username() || 'Ты')} (ты)</span>`] : [])
      .concat(inVoice.map(([id, p]) => `<span class="${loud(id)}" style="color:${p.color}">${esc(p.name)}${hidden.has(p.name) ? ' 🔕' : ''}</span>`));
    q('.fc-people').innerHTML = chips.join('');
    btn.classList.toggle('talk', voice.on);
  }
  function render() {
    if (!q('.fc-list')) return;
    const n = people.size + 1;
    q('.fc-online').textContent = status === 'online' ? `${n} онлайн` : status === 'error' ? 'нет связи' : status === 'connecting' ? 'подключаемся…' : '';
    q('.fc-input').placeholder = username() ? 'Сообщение…' : 'Войди в аккаунт, чтобы писать';
    renderList(); renderVoice();
    const b = btn.querySelector('b'); b.hidden = !unread; b.textContent = unread > 9 ? '9+' : unread;
  }

  function nameMenu(name, x, y) {
    document.querySelector('.fc-menu')?.remove();
    if (name === username()) return;
    const m = document.createElement('div'); m.className = 'fc-menu';
    m.style.left = Math.min(x, innerWidth - 220) + 'px'; m.style.top = Math.min(y, innerHeight - 60) + 'px';
    m.innerHTML = `<button type="button">${hidden.has(name) ? '👁 Показать' : '🙈 Скрыть'} «${esc(name)}» (сообщения и голос)</button>`;
    m.firstElementChild.onclick = () => { toggleHide(name); m.remove(); };
    document.body.appendChild(m);
    setTimeout(() => addEventListener('pointerdown', (e) => { if (!m.contains(e.target)) m.remove(); }, { once: true }), 0);
  }

  btn.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) { unread = 0; connect(); render(); const l = q('.fc-list'); l.scrollTop = l.scrollHeight; }
    else render();
  });
  panel.addEventListener('click', (e) => {
    if (e.target.closest('.fc-x')) { panel.hidden = true; render(); return; }
    const v = e.target.closest('[data-v]');
    if (v) { if (v.dataset.v === 'join') joinVoice(); else if (v.dataset.v === 'leave') leaveVoice(); else toggleMute(); return; }
    const nm = e.target.closest('[data-name]');
    if (nm) nameMenu(nm.dataset.name, e.clientX, e.clientY);
  });
  panel.addEventListener('submit', (e) => { e.preventDefault(); send(); });
  q('.fc-input').addEventListener('focus', () => { if (!username()) openLogin(); });
  // клавиши в чате не должны управлять страницей или игрой под ним
  for (const ev of ['keydown', 'keyup', 'pointerdown', 'touchstart']) panel.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
  addEventListener('pagehide', () => { if (voice.on) leaveVoice(); });
  // Подключаемся сразу, чтобы видеть, сколько человек онлайн, и не пропустить сообщения.
  connect();
  render();
  return { open: () => { if (panel.hidden) btn.click(); }, close: () => { panel.hidden = true; }, isOpen: () => !panel.hidden };
};
