'use strict';
// Игра вдвоём по сети для пошаговых игр (Четыре в ряд, Реверси, Шашки…). Без таблиц: Supabase Realtime
// (broadcast + presence) общего проекта сайта.
//
// Как находятся соперники:
//  • «Быстрый поиск» — все, кто ищет игру, сидят в общем лобби игры; двое самых давних ждущих
//    автоматически получают общую комнату;
//  • «Комната с другом» — код из 4 букв: один создаёт, второй вводит тот же код.
// Первым ходит тот, кто дольше в комнате; в следующей партии — наоборот.
//
// const duel = FreasyDuel({
//   key: 'chetyre', title: 'Четыре в ряд',
//   onStart: ({ first, opponent, game }) => {},  // партия началась: first — мой ли первый ход
//   onMove: (move) => {},                         // ход соперника (то, что он отправил через duel.move)
//   onLeave: () => {},                            // соперник ушёл или пропал
// });
// duel.open() — окно поиска; duel.move(obj) — отправить свой ход; duel.active() — идёт ли сетевая партия;
// duel.rematch() — следующая партия с тем же соперником; duel.leave() — выйти; duel.status(text) — строка над полем.
window.FreasyDuel = (opts) => {
  const SB_URL = 'https://ywqxrbmgmvpbeytxjkpi.supabase.co', SB_KEY = 'sb_publishable_igyJK68YpyJYo-0KNrVZPA_rm6_gIRg';
  const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
  const key = opts.key;
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const myId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
  const joinedAt = Date.now();
  function myName() {
    try { const s = JSON.parse(localStorage.getItem('freasy-session') || 'null'); const n = s && s.user && s.user.user_metadata && s.user.user_metadata.username; if (n) return String(n).slice(0, 16); } catch { /* гость */ }
    let g = store.get('freasy-guest-name', '');
    if (!g) { g = 'Гость' + Math.floor(100 + Math.random() * 900); store.set('freasy-guest-name', g); }
    return g;
  }

  let client = null, lobby = null, room = null, roomCode = '', phase = 'idle', opp = null, game = 0, iAmFirst = false, seq = 0, lastSeen = 0, pingTimer = 0;

  function loadLib() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = LIB; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
  }
  async function getClient() {
    await loadLib();
    if (!client) client = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 10 } } });
    return client;
  }

  // ——— Быстрый поиск ———
  async function quick() {
    stopAll(); setPhase('search', 'Ищем соперника…');
    try { await getClient(); } catch { setPhase('idle', 'Нет связи с сервером. Проверь интернет'); return; }
    const ch = client.channel(`freasy-duel-${key}-lobby`, { config: { presence: { key: myId } } });
    lobby = ch;
    ch.on('presence', { event: 'sync' }, () => {
      if (lobby !== ch || phase !== 'search') return;
      const all = Object.entries(ch.presenceState()).map(([id, m]) => ({ id, t: (m[0] && m[0].t) || 0, n: m[0] && m[0].n })).sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
      const i = all.findIndex((p) => p.id === myId);
      if (i < 0) return;
      const mate = all[i % 2 ? i - 1 : i + 1];
      const others = all.length - 1;
      setPhase('search', others ? (mate ? `Нашёлся соперник: ${mate.n || 'Игрок'}` : 'Ищем соперника…') : 'Ищем соперника… Пока в поиске только ты. Позови друга или подожди');
      if (mate) {
        const pair = [myId, mate.id].sort();
        const code = 'q' + pair.join('');
        setTimeout(() => { if (lobby === ch && phase === 'search') { client.removeChannel(ch); lobby = null; joinRoom(code); } }, 600);
      }
    }).subscribe(async (st) => {
      if (st === 'SUBSCRIBED') await ch.track({ n: myName(), t: joinedAt });
      else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') setPhase('idle', 'Не получилось подключиться');
    });
  }

  // ——— Комната по коду ———
  const LETTERS = 'АБВГДЕЖЗИКЛМНПРСТУФХ';
  const newCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
  const cleanCode = (v) => String(v || '').toUpperCase().replace(/[^A-ZА-ЯЁ0-9]/g, '').slice(0, 8);

  async function joinRoom(code) {
    stopAll(); roomCode = code; game = 0; opp = null;
    setPhase('wait', code.startsWith('q') ? 'Подключаемся к сопернику…' : `Комната ${code}. Ждём второго игрока — скажи ему этот код`);
    try { await getClient(); } catch { setPhase('idle', 'Нет связи с сервером'); return; }
    const ch = client.channel(`freasy-duel-${key}-r-${code}`, { config: { broadcast: { self: false }, presence: { key: myId } } });
    room = ch;
    ch.on('presence', { event: 'sync' }, () => {
      if (room !== ch) return;
      const all = Object.entries(ch.presenceState()).map(([id, m]) => ({ id, t: (m[0] && m[0].t) || 0, n: (m[0] && m[0].n) || 'Игрок' })).sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
      const two = all.slice(0, 2);
      if (!two.some((p) => p.id === myId)) { setPhase('idle', 'В этой комнате уже играют двое. Выбери другой код'); stopAll(); return; }
      const other = two.find((p) => p.id !== myId);
      if (!other) {
        if (opp && phase === 'play') { opp = null; leftOpp(); }
        return;
      }
      if (!opp || opp.id !== other.id) {
        opp = other; lastSeen = Date.now();
        iAmFirst = two[0].id === myId;
        if (iAmFirst) startGame(1);
        else {
          // если объявление партии потерялось, гость сам попросит его ещё раз
          const ask = (k) => setTimeout(() => { if (room === ch && opp && game === 0 && k < 6) { ch.send({ type: 'broadcast', event: 'need', payload: { to: opp.id } }); ask(k + 1); } }, 1500);
          ask(0);
        }
      }
    })
      .on('broadcast', { event: 'start' }, ({ payload }) => { if (payload && payload.to === myId) { if (payload.n) { if (!opp && payload.from) opp = { id: payload.from, n: String(payload.n).slice(0, 16) }; else if (opp) opp.n = String(payload.n).slice(0, 16); } begin(payload.game, payload.first === myId); } })
      .on('broadcast', { event: 'move' }, ({ payload }) => {
        if (!payload || payload.to !== myId || payload.game !== game) return;
        lastSeen = Date.now();
        if (payload.seq <= seq) return;   // повтор
        seq = payload.seq; opts.onMove && opts.onMove(payload.m);
      })
      .on('broadcast', { event: 'again' }, ({ payload }) => { if (payload && payload.to === myId) { wantAgain.them = true; tryAgain(); } })
      .on('broadcast', { event: 'need' }, ({ payload }) => {
        if (!payload || payload.to !== myId || !iAmFirst || !opp) return;
        const first = game % 2 ? myId : opp.id;
        ch.send({ type: 'broadcast', event: 'start', payload: { to: opp.id, game: game || 1, first, n: myName(), from: myId } });
      })
      .on('broadcast', { event: 'ping' }, () => { lastSeen = Date.now(); })
      .subscribe(async (st) => {
        if (room !== ch) return;
        if (st === 'SUBSCRIBED') await ch.track({ n: myName(), t: Date.now() });
        else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') setPhase('idle', 'Связь пропала');
      });
  }

  function startGame(n) {
    // ведущий (первый в комнате) объявляет партию; в нечётных партиях первым ходит он
    const first = n % 2 ? myId : opp.id;
    const send = () => room && room.send({ type: 'broadcast', event: 'start', payload: { to: opp.id, game: n, first, n: myName(), from: myId } });
    send(); setTimeout(send, 700);   // второй раз — на случай, если соперник ещё подписывался
    begin(n, first === myId);
  }
  function begin(n, first) {
    if (game === n && phase === 'play') return;
    game = n; seq = 0; mySeq = 0; wantAgain = { me: false, them: false };
    setPhase('play', ''); close();
    clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (!room || phase !== 'play') return;
      room.send({ type: 'broadcast', event: 'ping', payload: {} });
      if (Date.now() - lastSeen > 25000) leftOpp();
    }, 4000);
    lastSeen = Date.now();
    opts.onStart && opts.onStart({ first, opponent: opp ? opp.n : 'Соперник', game: n });
  }
  let mySeq = 0;
  function move(m) {
    if (!room || !opp || phase !== 'play') return;
    const payload = { to: opp.id, game, seq: ++mySeq, m };
    room.send({ type: 'broadcast', event: 'move', payload });
    // дубль через полсекунды: потерянный ход повесил бы партию, а повтор отсеется по номеру
    setTimeout(() => { if (room && phase === 'play' && payload.game === game) room.send({ type: 'broadcast', event: 'move', payload }); }, 500);
  }
  let wantAgain = { me: false, them: false };
  function rematch() {
    if (!room || !opp) return false;
    wantAgain.me = true;
    room.send({ type: 'broadcast', event: 'again', payload: { to: opp.id } });
    status('Ждём, когда соперник тоже нажмёт «Реванш»…');
    tryAgain(); return true;
  }
  function tryAgain() { if (wantAgain.me && wantAgain.them && iAmFirst && opp) startGame(game + 1); }
  function leftOpp() {
    if (phase !== 'play') return;
    setPhase('idle', ''); clearInterval(pingTimer);
    status('Соперник вышел из игры');
    opts.onLeave && opts.onLeave();
  }
  function stopAll() {
    clearInterval(pingTimer);
    if (client && lobby) client.removeChannel(lobby);
    if (client && room) client.removeChannel(room);
    lobby = null; room = null; opp = null;
  }
  function leave() { stopAll(); setPhase('idle', ''); status(''); }

  // ——— Вид ———
  const css = document.createElement('style');
  css.textContent = `
  .dl-modal { position: fixed; inset: 0; z-index: 100005; display: grid; place-items: center; padding: 16px; background: #0b0c18d6; backdrop-filter: blur(4px); font-family: Manrope, system-ui, sans-serif; color: #f8f7ff; -webkit-user-select: text; user-select: text; touch-action: auto; }
  .dl-modal[hidden] { display: none; }
  .dl-sheet { width: min(400px, 100%); background: #1d1e31; border: 1px solid #b79aff80; border-radius: 26px; padding: 22px; box-shadow: 0 30px 80px #0009; text-align: center; }
  .dl-sheet h2 { margin: 0 0 6px; font-size: 26px; letter-spacing: -.04em; }
  .dl-sheet p { margin: 0 0 14px; color: #b9b6c9; font-size: 14px; line-height: 1.5; }
  .dl-sheet button { all: unset; box-sizing: border-box; display: block; width: 100%; margin-top: 10px; padding: 13px; border-radius: 14px; font: 800 15px Manrope, system-ui, sans-serif; text-align: center; cursor: pointer; }
  .dl-main { background: #bca0ff; color: #171225; }
  .dl-alt { border: 1px solid #ffffff2e; color: #d1cde5; }
  .dl-row { display: flex; gap: 8px; margin-top: 10px; }
  .dl-row input { flex: 1; min-width: 0; font: 800 18px Manrope, system-ui, sans-serif; letter-spacing: .2em; text-transform: uppercase; text-align: center; color: #f8f7ff; background: #15162a; border: 1px solid #ffffff24; border-radius: 14px; padding: 10px; }
  .dl-row button { width: auto; margin: 0; padding: 0 18px; }
  .dl-msg { min-height: 20px; margin-top: 12px; font-size: 14px; font-weight: 700; color: #ffd27a; }
  .dl-pill { position: fixed; z-index: 390; left: 50%; top: max(60px, calc(env(safe-area-inset-top) + 56px)); transform: translateX(-50%); max-width: calc(100vw - 24px); padding: 8px 14px; border-radius: 100px; background: #111321e0; border: 1px solid #b79aff66; font: 800 13px Manrope, system-ui, sans-serif; color: #f8f7ff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; backdrop-filter: blur(6px); }
  .dl-pill[hidden] { display: none; }`;
  document.head.appendChild(css);
  const box = document.createElement('div');
  box.className = 'dl-modal'; box.hidden = true;
  box.innerHTML = `<div class="dl-sheet" role="dialog" aria-label="Игра по сети">
    <h2>🌐 Игра по сети</h2>
    <p>Играй против живого человека: ходы передаются сразу.</p>
    <button class="dl-main" data-a="quick" type="button">⚡ Быстрый поиск соперника</button>
    <button class="dl-alt" data-a="create" type="button">🔑 Создать комнату для друга</button>
    <div class="dl-row"><input maxlength="8" placeholder="КОД" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Код комнаты"><button class="dl-alt" data-a="join" type="button">Войти</button></div>
    <div class="dl-msg" aria-live="polite"></div>
    <button class="dl-alt" data-a="close" type="button">Закрыть</button>
  </div>`;
  const pill = document.createElement('div'); pill.className = 'dl-pill'; pill.hidden = true;
  const add = () => { document.body.appendChild(box); document.body.appendChild(pill); };
  if (document.body) add(); else addEventListener('DOMContentLoaded', add);
  const msg = box.querySelector('.dl-msg'), input = box.querySelector('input');
  for (const k of ['pointerdown', 'keydown', 'keyup', 'touchstart']) box.addEventListener(k, (e) => e.stopPropagation(), { passive: true });
  box.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]'); if (!a) { if (e.target === box) close(); return; }
    const act = a.dataset.a;
    if (act === 'quick') quick();
    else if (act === 'create') { const c = newCode(); input.value = c; joinRoom(c); }
    else if (act === 'join') { const c = cleanCode(input.value); if (c.length < 3) { msg.textContent = 'Введи код комнаты от друга'; return; } joinRoom(c); }
    else if (act === 'close') { if (phase !== 'play') leave(); close(); }
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') box.querySelector('[data-a=join]').click(); });

  function setPhase(p, text) { phase = p; msg.textContent = text || ''; }
  function status(text) { pill.textContent = text || ''; pill.hidden = !text; }
  function open() { box.hidden = false; if (phase === 'idle') msg.textContent = ''; }
  function close() { box.hidden = true; }

  addEventListener('pagehide', () => stopAll());
  return { open, close, move, rematch, leave, status, active: () => phase === 'play', isOpen: () => !box.hidden, opponent: () => (opp ? opp.n : ''), code: () => roomCode };
};
