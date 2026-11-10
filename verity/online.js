'use strict';
// Аккаунты и таблицы лидеров Verity Clicker на FreasyGames. Supabase-проект и аккаунты общие с PVZ.
// Подключается после game.js и читает его состояние s: s.total — клики, s.finishTime — секунды до финала.
window.verityOnline = (() => {
  const SB_URL = 'https://ywqxrbmgmvpbeytxjkpi.supabase.co', SB_KEY = 'sb_publishable_igyJK68YpyJYo-0KNrVZPA_rm6_gIRg';
  const EMAIL_DOMAIN = '@pvz-game.com', MAX_CLICKS = 1e12;
  const BOARDS = {
    clicks: { query: 'select=user_id,username,clicks&order=clicks.desc,updated_at.asc', value: (r) => fmt(r.clicks), note: 'Больше всего кликов за всё время.' },
    time: { query: 'select=user_id,username,best_time&best_time=not.is.null&order=best_time.asc,updated_at.asc', value: (r) => clock(r.best_time), note: 'Быстрее всех дошли до четвёртой фазы.' },
  };
  const clock = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let session = null, board = 'clicks', lastSent = '', refreshing = null;
  try { session = JSON.parse(localStorage.getItem('verity-session') || 'null'); } catch { session = null; }
  function setSession(x) {
    session = x && x.access_token ? { access_token: x.access_token, refresh_token: x.refresh_token, expires_at: x.expires_at || Math.floor(Date.now() / 1000) + (x.expires_in || 3600), user: x.user } : null;
    try { localStorage.setItem('verity-session', JSON.stringify(session)); } catch { /* вход останется до перезагрузки */ }
  }
  const username = () => session && session.user && session.user.user_metadata && session.user.user_metadata.username;

  function errorText(data, status) {
    const raw = (data && (data.msg || data.message || data.error_description || data.error)) || `Ошибка ${status}`;
    if (/invalid login credentials/i.test(raw)) return 'Неверный ник или пароль';
    if (/already registered|already exists/i.test(raw)) return 'Такой ник уже занят';
    if (/verity_/.test(raw) || (data && ['PGRST205', 'PGRST202', '42P01'].includes(data.code))) return 'Таблица рекордов ещё не включена на сервере';
    if (/rate limit/i.test(raw)) return 'Слишком много попыток, подожди немного';
    return raw;
  }
  async function sb(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { apikey: SB_KEY, 'Content-Type': 'application/json' };
    if (auth && session) { await refresh(); if (session) headers.Authorization = 'Bearer ' + session.access_token; }
    let res;
    try { res = await fetch(SB_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch { throw Object.assign(new Error('Нет связи с сервером. Проверь интернет'), { offline: true }); }
    const text = await res.text(); let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
    if (!res.ok) throw new Error(errorText(data, res.status));
    return data;
  }
  // Одно обновление токена на все параллельные запросы; без сети вход не сбрасываем.
  function refresh() {
    if (!session || session.expires_at * 1000 > Date.now() + 60000) return;
    refreshing ??= sb('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token }, auth: false })
      .then(setSession, (e) => { if (!e.offline) setSession(null); })
      .finally(() => { refreshing = null; });
    return refreshing;
  }

  // Результат уходит, только если изменился; сервер хранит лучший клик и лучшее время каждого игрока.
  async function submit() {
    if (!session) return;
    const clicks = Math.min(MAX_CLICKS, Math.floor(s.total)), time = Number.isFinite(s.finishTime) ? s.finishTime : null;
    const key = clicks + '|' + time;
    if (key === lastSent || clicks <= 0) return;
    try { await sb('/rest/v1/rpc/verity_submit', { method: 'POST', body: { new_clicks: clicks, new_time: time } }); lastSent = key; }
    catch { /* попробуем в следующий раз */ }
  }

  async function loadBoard() {
    const list = $('board'), msg = $('boardMsg');
    $('boardNote').textContent = BOARDS[board].note;
    document.querySelectorAll('[data-board]').forEach((b) => b.classList.toggle('on', b.dataset.board === board));
    list.innerHTML = ''; msg.textContent = 'Загружаем…';
    try {
      const rows = await sb(`/rest/v1/verity_scores?${BOARDS[board].query}&limit=20`, { auth: false });
      msg.textContent = rows.length ? '' : 'Пока пусто. Стань первым!';
      list.innerHTML = rows.map((r) => `<li${session && r.user_id === session.user.id ? ' class="me"' : ''}>${esc(r.username)}<b>${BOARDS[board].value(r)}</b></li>`).join('');
    } catch (e) { msg.textContent = e.message; }
  }

  function renderAccount() {
    const inside = !!username();
    $('meBox').hidden = !inside; $('authForm').hidden = inside;
    if (inside) $('meText').textContent = `Ты в таблице как ${username()}`;
  }

  async function auth(kind) {
    const name = $('authName').value.trim(), pass = $('authPass').value, msg = $('authMsg');
    if (!/^[A-Za-z0-9_]{3,30}$/.test(name)) { msg.textContent = 'Ник: 3–30 символов, латиница, цифры или _'; return; }
    if (pass.length < 6) { msg.textContent = 'Пароль должен быть от 6 символов'; return; }
    msg.textContent = kind === 'signup' ? 'Создаём аккаунт…' : 'Входим…';
    const email = name.toLowerCase() + EMAIL_DOMAIN;
    try {
      const x = kind === 'signup'
        ? await sb('/auth/v1/signup', { method: 'POST', body: { email, password: pass, data: { username: name } }, auth: false })
        : await sb('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: pass }, auth: false });
      if (!x || !x.access_token) { msg.textContent = 'Аккаунт создан, теперь нажми «Войти»'; return; }
      setSession(x); $('authPass').value = ''; msg.textContent = '';
      lastSent = ''; await submit(); renderAccount(); loadBoard();
    } catch (e) { msg.textContent = e.message; }
  }

  function open() { $('leaders').hidden = false; renderAccount(); loadBoard(); }
  function close() { $('leaders').hidden = true; }

  $('leadersBtn').onclick = open;
  $('leadersClose').onclick = close;
  $('leaders').addEventListener('click', (e) => { if (e.target.id === 'leaders') close(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.querySelectorAll('[data-board]').forEach((b) => { b.onclick = () => { board = b.dataset.board; loadBoard(); }; });
  $('authForm').addEventListener('submit', (e) => { e.preventDefault(); auth('login'); });
  $('registerBtn').onclick = () => auth('signup');
  $('logoutBtn').onclick = async () => {
    try { await sb('/auth/v1/logout', { method: 'POST' }); } catch { /* выходим локально */ }
    setSession(null); renderAccount(); loadBoard();
  };
  setInterval(submit, 30000);
  addEventListener('pagehide', submit);
  submit();
  return { submit, open };
})();
