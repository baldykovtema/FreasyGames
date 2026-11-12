'use strict';
// Sign-in and leaderboards for FreasyGames games, in the site's look. The Supabase project and the
// nick@pvz-game.com accounts are shared with the other games; each game has a <key>_scores table and a
// <key>_submit function (see the game's supabase.sql).
//
// const lb = FreasyLeaderboard({
//   key: 'orbita',
//   boards: [{ id: 'score', title: 'Рекорд', column: 'best_score', order: 'desc', note: '…', format: (v) => … }],
//   bests: () => ({ new_score: best, new_time: bestTime }),   // local bests (one result or a list), sent after signing in
//   onStatus: (text) => …,                                      // a line for the game over screen
// });
// lb.open(); lb.close(); lb.isOpen(); lb.submit({ new_score: 12, new_time: 40 });
window.FreasyLeaderboard = (opts) => {
  const SB_URL = 'https://ywqxrbmgmvpbeytxjkpi.supabase.co', SB_KEY = 'sb_publishable_igyJK68YpyJYo-0KNrVZPA_rm6_gIRg';
  const EMAIL_DOMAIN = '@pvz-game.com', OLD_EMAIL_DOMAIN = '@memecat-game.com';
  const { key, boards } = opts, status = opts.onStatus || (() => {});
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

  const style = document.createElement('style');
  style.textContent = `
  .fl-modal { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 64px 16px 16px; background: #0b0c18d0; backdrop-filter: blur(4px); user-select: text; -webkit-user-select: text; touch-action: auto; font-family: Manrope, system-ui, sans-serif; color: #f8f7ff; }
  .fl-modal[hidden], .fl-modal [hidden] { display: none !important; }
  .fl-sheet:focus { outline: none; }
  .fl-sheet { width: min(440px, 100%); max-height: calc(100vh - 80px); overflow: auto; background: #1d1e31; border: 1px solid #b79aff80; border-radius: 28px; padding: 22px; box-shadow: 0 30px 80px #0009; }
  .fl-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .fl-head h2 { margin: 0; font-size: 26px; letter-spacing: -.05em; }
  .fl-x { font: inherit; font-size: 22px; color: #d1cde5; width: 38px; height: 38px; border: 1px solid #ffffff24; border-radius: 50%; background: none; cursor: pointer; }
  .fl-tabs { display: flex; gap: 6px; background: #15162a; border-radius: 14px; padding: 4px; }
  .fl-tabs button { flex: 1; font: inherit; font-size: 14px; font-weight: 800; color: #b9b6c9; background: none; border: 0; border-radius: 10px; padding: 10px; cursor: pointer; }
  .fl-tabs button.on { background: #bca0ff; color: #171225; }
  .fl-note { font-size: 13px; color: #89879e; margin: 10px 2px 6px; }
  .fl-board { list-style: none; margin: 0; padding: 0; counter-reset: r; }
  .fl-board li { counter-increment: r; display: flex; gap: 10px; align-items: center; padding: 10px; border-bottom: 1px solid #ffffff0d; font-size: 15px; font-weight: 700; }
  .fl-board li::before { content: counter(r); width: 24px; color: #89879e; font-size: 13px; }
  .fl-board li:nth-child(-n+3)::before { color: #ffd23f; }
  .fl-board li b { margin-left: auto; color: #bca0ff; font-variant-numeric: tabular-nums; }
  .fl-board li.me { background: #bca0ff1f; border-radius: 12px; }
  .fl-msg { min-height: 20px; color: #ffd27a; font-size: 13px; margin: 8px 2px; }
  .fl-account { margin-top: 14px; padding-top: 14px; border-top: 1px solid #ffffff14; }
  .fl-account p { margin: 0 0 8px; color: #b9b6c9; font-size: 13px; line-height: 1.6; }
  .fl-account input { width: 100%; box-sizing: border-box; font: inherit; font-size: 15px; color: #f8f7ff; background: #15162a; border: 1px solid #ffffff24; border-radius: 12px; padding: 12px 14px; margin: 4px 0; }
  .fl-account input:focus { outline: 2px solid #bca0ff; outline-offset: 1px; }
  .fl-buttons { display: flex; gap: 8px; }
  .fl-buttons button, .fl-me button { flex: 1; font: inherit; font-size: 14px; font-weight: 800; border-radius: 14px; padding: 12px; cursor: pointer; }
  .fl-primary { color: #171225; background: #bca0ff; border: 0; }
  .fl-ghost { color: #d1cde5; background: none; border: 1px solid #ffffff2e; }
  .fl-me { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 14px; font-weight: 700; }
  .fl-me button { flex: none; padding: 9px 14px; }`;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 'fl-modal'; root.hidden = true;
  root.innerHTML = `<div class="fl-sheet" tabindex="-1" role="dialog" aria-label="Таблица лидеров">
    <div class="fl-head"><h2>🏆 Лидеры</h2><button class="fl-x" type="button" aria-label="Закрыть">×</button></div>
    <div class="fl-tabs">${boards.map((b) => `<button type="button" data-board="${b.id}">${esc(b.title)}</button>`).join('')}</div>
    <p class="fl-note"></p><ol class="fl-board"></ol><div class="fl-msg fl-board-msg"></div>
    <div class="fl-account">
      <div class="fl-me" hidden><span></span><button class="fl-ghost" type="button">Выйти</button></div>
      <form autocomplete="on">
        <p>Войди, чтобы попасть в таблицу. Подходит аккаунт из других игр FreasyGames, почта не нужна.</p>
        <input name="name" maxlength="30" placeholder="Ник (A-Z, 0-9, _)" autocomplete="username" autocapitalize="off" spellcheck="false">
        <input name="pass" type="password" placeholder="Пароль (от 6 символов)" autocomplete="current-password">
        <div class="fl-msg fl-auth-msg"></div>
        <div class="fl-buttons"><button class="fl-primary" type="submit">Войти</button><button class="fl-ghost fl-register" type="button">Регистрация</button></div>
      </form>
    </div></div>`;
  document.body.appendChild(root);
  const q = (s) => root.querySelector(s), form = q('form');

  let session = null, board = boards[0], boardReq = 0, opener = null;
  try { session = JSON.parse(store.get(key + '-session', 'null')); } catch { session = null; }
  function setSession(x) {
    session = x && x.access_token ? { access_token: x.access_token, refresh_token: x.refresh_token, expires_at: x.expires_at || Math.floor(Date.now() / 1000) + (x.expires_in || 3600), user: x.user } : null;
    store.set(key + '-session', JSON.stringify(session));
  }
  const username = () => session && session.user && session.user.user_metadata && session.user.user_metadata.username;
  const myId = () => session && session.user && session.user.id;
  // The game may also sign in through its own account window (shared/account.js) with the same storage key.
  function sync() { try { const x = JSON.parse(store.get(key + '-session', 'null')); session = x && x.access_token ? x : null; } catch { /* keep */ } }

  function errorText(data, code) {
    const raw = (data && (data.msg || data.message || data.error_description || data.error)) || `Ошибка ${code}`;
    if (/invalid login credentials/i.test(raw)) return 'Неверный ник или пароль';
    if (/already registered|already exists/i.test(raw)) return 'Такой ник уже занят';
    if (raw.includes(key + '_') || (data && ['PGRST205', 'PGRST202', '42P01'].includes(data.code))) return 'Таблица лидеров ещё не включена на сервере';
    if (/rate limit/i.test(raw)) return 'Слишком много попыток, подожди немного';
    return raw;
  }
  async function sb(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { apikey: SB_KEY, 'Content-Type': 'application/json' };
    if (auth && session) { await refresh(); if (session) headers.Authorization = 'Bearer ' + session.access_token; }
    let res;
    try { res = await fetch(SB_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch { throw new Error('Нет связи с сервером. Проверь интернет'); }
    const text = await res.text(); let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
    if (!res.ok) throw new Error(errorText(data, res.status));
    return data;
  }
  async function refresh() {
    if (!session || session.expires_at * 1000 > Date.now() + 60000) return;
    try { setSession(await sb('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token }, auth: false })); }
    catch (e) { if (navigator.onLine && !/связи|fetch|network|load failed/i.test(e && e.message || '')) setSession(null); }
  }

  // The server keeps each player's best values, so sending a result that is not a record is harmless.
  async function submit(result) {
    sync();
    if (!session) { status('Войди в «Таблице лидеров», чтобы твои рекорды попали туда.'); return; }
    status('Отправляем результат…');
    try { await sb(`/rest/v1/rpc/${key}_submit`, { method: 'POST', body: result }); status(username() ? `Результат в таблице лидеров как ${username()}` : 'Результат в таблице лидеров'); }
    catch (e) { status(e.message); }
  }

  async function loadBoard() {
    const list = q('.fl-board'), msg = q('.fl-board-msg');
    q('.fl-note').textContent = board.note;
    root.querySelectorAll('[data-board]').forEach((b) => b.classList.toggle('on', b.dataset.board === board.id));
    list.innerHTML = ''; msg.textContent = 'Загружаем…';
    // Only the latest request fills the list: a slow answer for the other tab must not win.
    const req = ++boardReq, shown = board;
    const filter = board.order === 'desc' ? `${board.column}=gt.0` : `${board.column}=not.is.null`;
    try {
      const rows = await sb(`/rest/v1/${key}_scores?select=user_id,username,${shown.column}&${filter}&order=${shown.column}.${shown.order},updated_at.asc&limit=20`, { auth: false });
      if (req !== boardReq) return;
      msg.textContent = rows.length ? '' : 'Пока пусто. Стань первым!';
      list.innerHTML = rows.map((r) => `<li${myId() && r.user_id === myId() ? ' class="me"' : ''}>${esc(r.username)}<b>${esc(shown.format(r[shown.column]))}</b></li>`).join('');
    } catch (e) { if (req === boardReq) msg.textContent = e.message; }
  }

  function renderAccount() {
    const inside = !!username();
    q('.fl-me').hidden = !inside; form.hidden = inside;
    if (inside) q('.fl-me span').textContent = `Ты в таблице как ${username()}`;
  }

  async function auth(kind) {
    const name = form.name.value.trim(), pass = form.pass.value, msg = q('.fl-auth-msg');
    if (!/^[A-Za-z0-9_]{3,30}$/.test(name)) { msg.textContent = 'Ник: 3–30 символов, латиница, цифры или _'; return; }
    if (pass.length < 6) { msg.textContent = 'Пароль должен быть от 6 символов'; return; }
    msg.textContent = kind === 'signup' ? 'Создаём аккаунт…' : 'Входим…';
    const login = (email) => sb('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: pass }, auth: false });
    try {
      const x = kind === 'signup'
        ? await sb('/auth/v1/signup', { method: 'POST', body: { email: name.toLowerCase() + EMAIL_DOMAIN, password: pass, data: { username: name } }, auth: false })
        // Old Мемный Кот accounts were made with another address.
        : await login(name.toLowerCase() + EMAIL_DOMAIN).catch((e) => login(name.toLowerCase() + OLD_EMAIL_DOMAIN).catch(() => { throw e; }));
      if (!x || !x.access_token) { msg.textContent = 'Аккаунт создан, теперь нажми «Войти»'; return; }
      setSession(x); form.pass.value = ''; msg.textContent = '';
      renderAccount();
      for (const local of [].concat((opts.bests && opts.bests()) || [])) await submit(local);
      loadBoard();
    } catch (e) { msg.textContent = e.message; }
  }

  // Focus moves into the window, so Space/Enter no longer press the game button under it; it comes back on close.
  function open() { sync(); opener = document.activeElement; root.hidden = false; renderAccount(); loadBoard(); q('.fl-sheet').focus({ preventScroll: true }); }
  function close() { if (root.hidden) return; root.hidden = true; if (opener && opener.focus) opener.focus({ preventScroll: true }); opener = null; }

  q('.fl-x').addEventListener('click', close);
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); e.stopPropagation(); });
  root.querySelectorAll('[data-board]').forEach((b) => b.addEventListener('click', () => { board = boards.find((x) => x.id === b.dataset.board); loadBoard(); }));
  form.addEventListener('submit', (e) => { e.preventDefault(); auth('login'); });
  q('.fl-register').addEventListener('click', () => auth('signup'));
  q('.fl-me button').addEventListener('click', async () => {
    try { await sb('/auth/v1/logout', { method: 'POST' }); } catch { /* выходим локально */ }
    setSession(null); renderAccount(); loadBoard();
  });
  return { open, close, submit, isOpen: () => !root.hidden, signedIn: () => !!session };
};
