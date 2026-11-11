'use strict';
// Аккаунты FreasyGames для игр с онлайн-контентом (общий Supabase-проект с PVZ, ник@pvz-game.com).
//
// const acc = FreasyAccount({ sessionKey: 'prygun-session', onChange: () => {...} });
// acc.fetch(path, {method, body, headers}) — запрос к REST/RPC с токеном игрока; бросает Error с понятным текстом.
// acc.username(), acc.userId(), acc.open() — окно входа/регистрации, acc.logout().
window.FreasyAccount = (opts) => {
  const SB_URL = 'https://ywqxrbmgmvpbeytxjkpi.supabase.co', SB_KEY = 'sb_publishable_igyJK68YpyJYo-0KNrVZPA_rm6_gIRg';
  const EMAIL_DOMAIN = '@pvz-game.com', OLD_EMAIL_DOMAIN = '@memecat-game.com';
  const key = opts.sessionKey;
  const load = () => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
  let session = load();

  function errorText(data, status) {
    const raw = (data && (data.msg || data.message || data.error_description || data.error)) || `Ошибка ${status}`;
    if (/invalid login credentials/i.test(raw)) return 'Неверный ник или пароль';
    if (/already registered|already exists/i.test(raw)) return 'Такой ник уже занят';
    if (data && (data.code === 'PGRST205' || data.code === '42P01' || data.code === 'PGRST202')) return 'Онлайн-функции ещё не включены на сервере';
    if (/rate limit/i.test(raw)) return 'Слишком много попыток, подожди немного';
    if (/payload too large|too large/i.test(raw) || status === 413) return 'Слишком большой файл';
    return raw;
  }
  // The leaderboard window (shared/leaderboard.js) may sign in too, with the same storage key.
  function sync() { const x = load(); session = x && x.access_token ? x : null; }
  async function raw(path, { method = 'GET', body, headers = {}, auth = true } = {}) {
    if (auth) sync();
    const h = { apikey: SB_KEY, 'Content-Type': 'application/json', ...headers };
    if (auth && session) { await refreshIfNeeded(); if (session) h.Authorization = 'Bearer ' + session.access_token; }
    let res;
    try { res = await fetch(SB_URL + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch { throw new Error('Нет связи с сервером. Проверь интернет'); }
    const text = await res.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
    if (!res.ok) throw new Error(errorText(data, res.status));
    return data;
  }
  function setSession(s) {
    session = s && s.access_token ? { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600), user: s.user } : null;
    try { localStorage.setItem(key, JSON.stringify(session)); } catch {}
    render(); if (opts.onChange) opts.onChange();
  }
  async function refreshIfNeeded() {
    if (!session || session.expires_at * 1000 > Date.now() + 60000) return;
    try { setSession(await raw('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token }, auth: false })); }
    catch { setSession(null); }
  }
  const username = () => (sync(), session) && session.user && session.user.user_metadata && session.user.user_metadata.username || null;
  const userId = () => (sync(), session) && session.user && session.user.id || null;

  async function auth(kind) {
    const name = q('#fa-name').value.trim(), pass = q('#fa-pass').value, msg = q('.fa-msg');
    if (!/^[A-Za-z0-9_]{3,30}$/.test(name)) { msg.textContent = 'Ник: 3–30 символов, латиница, цифры или _'; return; }
    if (pass.length < 6) { msg.textContent = 'Пароль должен быть от 6 символов'; return; }
    msg.textContent = kind === 'signup' ? 'Создаём аккаунт…' : 'Входим…';
    const login = (address) => raw('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: address, password: pass }, auth: false });
    try {
      const s = kind === 'signup'
        ? await raw('/auth/v1/signup', { method: 'POST', body: { email: name.toLowerCase() + EMAIL_DOMAIN, password: pass, data: { username: name } }, auth: false })
        : await login(name.toLowerCase() + EMAIL_DOMAIN).catch(() => login(name.toLowerCase() + OLD_EMAIL_DOMAIN));
      if (!s || !s.access_token) { msg.textContent = 'Аккаунт создан, теперь нажми «Войти»'; return; }
      q('#fa-pass').value = ''; msg.textContent = ''; setSession(s);
    } catch (e) { msg.textContent = e.message; }
  }
  async function logout() { try { await raw('/auth/v1/logout', { method: 'POST' }); } catch {} setSession(null); }

  const style = document.createElement('style');
  style.textContent = `
  .fa-modal{position:fixed;inset:0;z-index:300;display:grid;place-items:center;padding:64px 16px 16px;overflow-y:auto;background:#0b0c18d0;backdrop-filter:blur(4px);font-family:Manrope,system-ui,sans-serif;color:#f8f7ff;user-select:text}
  .fa-modal[hidden]{display:none}
  .fa-sheet{width:min(380px,100%);background:#1d1e31;border:1px solid #b79aff80;border-radius:24px;padding:22px;box-shadow:0 30px 80px #0009;display:flex;flex-direction:column;gap:10px;text-align:left}
  .fa-sheet h2{margin:0 0 4px;font-size:24px;display:flex;justify-content:space-between;align-items:center;color:#f8f7ff;text-shadow:none}
  .fa-sheet input{font:inherit;font-size:15px;color:#f8f7ff;background:#15162a;border:1px solid #ffffff24;border-radius:12px;padding:11px 12px}
  .fa-sheet button{font:inherit;font-weight:800;font-size:15px;border:0;border-radius:12px;padding:11px;cursor:pointer;background:#bca0ff;color:#171225;box-shadow:none;min-width:0}
  .fa-sheet button.alt{background:#2d2e48;color:#f8f7ff}
  .fa-sheet .fa-x{background:none;color:#d1cde5;font-size:22px;padding:0 6px}
  .fa-msg{min-height:18px;font-size:13px;color:#ffd27a}
  .fa-note{font-size:12px;color:#89879e;line-height:1.5}`;
  document.head.appendChild(style);
  const box = document.createElement('div');
  box.className = 'fa-modal'; box.hidden = true;
  box.innerHTML = `<div class="fa-sheet" role="dialog" aria-label="Аккаунт">
    <h2><span>👤 Аккаунт</span><button class="fa-x" type="button" aria-label="Закрыть">×</button></h2>
    <div class="fa-out"><div style="display:flex;flex-direction:column;gap:10px">
      <input id="fa-name" placeholder="Ник" maxlength="30" autocomplete="username">
      <input id="fa-pass" type="password" placeholder="Пароль" autocomplete="current-password">
      <button type="button" data-k="login">Войти</button><button type="button" class="alt" data-k="signup">Создать аккаунт</button>
      <div class="fa-msg"></div>
      <div class="fa-note">Один аккаунт для всех игр FreasyGames. Он нужен, чтобы публиковать свои работы.</div></div></div>
    <div class="fa-in"><div style="display:flex;flex-direction:column;gap:10px">
      <div class="fa-hello" style="font-size:16px;font-weight:800"></div>
      <button type="button" class="alt" data-k="logout">Выйти из аккаунта</button></div></div>
  </div>`;
  document.body.appendChild(box);
  const q = (s) => box.querySelector(s);
  function render() {
    const n = username();
    q('.fa-out').style.display = n ? 'none' : ''; q('.fa-in').style.display = n ? '' : 'none';
    q('.fa-hello').textContent = n ? `Привет, ${n}!` : '';
  }
  box.addEventListener('click', (e) => {
    if (e.target === box || e.target.classList.contains('fa-x')) { box.hidden = true; return; }
    const k = e.target.dataset && e.target.dataset.k;
    if (k === 'login' || k === 'signup') auth(k); else if (k === 'logout') logout();
  });
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && username() === null) auth('login'); if (e.key === 'Escape') box.hidden = true; e.stopPropagation(); });
  box.addEventListener('keyup', (e) => e.stopPropagation());
  render();
  return { fetch: raw, username, userId, logout, open: () => { render(); box.hidden = false; setTimeout(() => !username() && q('#fa-name').focus(), 0); }, close: () => { box.hidden = true; }, isOpen: () => !box.hidden };
};
