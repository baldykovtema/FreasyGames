'use strict';
// Вход и регистрация на сайте FreasyGames (каталоги 2D и 3D). Один аккаунт — на все игры.
// Нужны shared/session.js (в <head>) и shared/account.js.
// Кнопка «👤 Войти» встаёт в шапку; без входа клик по игре открывает окно входа, а после входа — саму игру.
// Игра без входа присылает сюда с ?login=1&next=<адрес игры>.
(() => {
  if (!window.FreasyAccount || !window.FreasySession) return;
  const me = document.currentScript;
  // страница «Настройки» (пароль, аватарка, тема) — рядом с папкой shared/
  const SETTINGS = new URL('../settings/', me && me.src || new URL('shared/', location.href)).pathname;
  const params = new URLSearchParams(location.search);
  let next = params.get('next') || '';
  // возвращаемся только на свои страницы
  if (!/^\/[\w\-./%а-яё]*$/i.test(next) || next.startsWith('//')) next = '';

  const acc = window.FreasyAccount({
    sessionKey: 'freasy-session',
    settingsUrl: SETTINGS,
    note: 'Один аккаунт для всех игр FreasyGames 2D и 3D. Зарегистрируйся один раз — и сразу играй в любую игру под своим ником, попадай в таблицы лидеров и общайся в чате.',
    onChange: () => {
      render();
      if (window.FreasySession.get() && next) { const go = next; next = ''; location.href = go; }
    },
  });

  const style = document.createElement('style');
  style.textContent = `
  .fs-acc { display: inline-flex; align-items: center; gap: 7px; font: 800 13px Manrope, system-ui, sans-serif; color: var(--fg-on-accent,#171225); background: linear-gradient(120deg, var(--fg-accent,#bca0ff), var(--fg-accent-2,#6fe3ff));
    border: 0; border-radius: 100px; padding: 10px 15px; cursor: pointer; white-space: nowrap; max-width: 200px; overflow: hidden; text-overflow: ellipsis; }
  .fs-acc.in { background: var(--fg-hover,#ffffff14); color: var(--fg-text,#f8f7ff); border: 1px solid var(--fg-line-2,#ffffff2a); }
  .fs-acc img { width: 22px; height: 22px; margin: -4px 0 -4px -6px; border-radius: 50%; object-fit: cover; flex: none; }
  .fs-gear { display: inline-grid; place-items: center; width: 38px; height: 38px; border-radius: 50%; font-size: 17px; text-decoration: none;
    color: var(--fg-text,#f8f7ff); background: var(--fg-hover,#ffffff14); border: 1px solid var(--fg-line-2,#ffffff2a); flex: none; }
  .fs-gear:hover { background: var(--fg-line-2,#ffffff2a); }
  .fs-acc.float { position: fixed; top: 14px; right: 14px; z-index: 1000; }
  .fs-gear.float { position: fixed; top: 14px; right: 14px; z-index: 1000; }
  .fs-acc.float ~ .fs-gear.float, .fs-gear.float + .fs-acc.float { right: 62px; }
  .fs-banner { position: fixed; left: 50%; top: 16px; transform: translateX(-50%); z-index: 100011; background: #ffd23f; color: #2a1145; font: 800 14px Manrope, system-ui, sans-serif;
    padding: 10px 16px; border-radius: 12px; box-shadow: 0 10px 30px #0008; max-width: min(520px, 92vw); text-align: center; }
  .fs-banner[hidden] { display: none; }`;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'fs-acc';
  const gear = document.createElement('a');
  gear.className = 'fs-gear'; gear.href = SETTINGS; gear.textContent = '⚙️';
  gear.title = 'Настройки: тема, аватарка, пароль'; gear.setAttribute('aria-label', 'Настройки');
  const nav = document.querySelector('.top-nav, header nav, .nav');
  if (nav) { nav.prepend(btn); btn.after(gear); }
  else { btn.classList.add('float'); gear.classList.add('float'); document.body.append(gear, btn); }
  const banner = document.createElement('div'); banner.className = 'fs-banner'; banner.hidden = true;
  banner.textContent = 'Чтобы играть, войди или зарегистрируйся — это один аккаунт на все игры FreasyGames';
  document.body.appendChild(banner);

  function render() {
    const name = window.FreasySession.username();
    const s = window.FreasySession.get();
    const avatar = s && s.user.user_metadata && s.user.user_metadata.avatar;
    btn.textContent = name ? (avatar ? ' ' + name : '👤 ' + name) : '👤 Войти';
    if (name && typeof avatar === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(avatar)) {
      const img = new Image(); img.src = avatar; img.alt = ''; btn.prepend(img);
    } else if (name && avatar) btn.textContent = '👤 ' + name;
    btn.classList.toggle('in', !!name);
    btn.setAttribute('aria-label', name ? 'Аккаунт ' + name : 'Войти или зарегистрироваться');
    banner.hidden = !!name || !askLogin;
  }
  let askLogin = params.get('login') === '1';
  function openLogin(target) {
    if (target) next = target;
    askLogin = true; render();
    acc.open();
  }
  btn.addEventListener('click', () => openLogin());

  // Без входа клик по игре открывает вход, а после входа — эту игру.
  document.addEventListener('click', (e) => {
    if (window.FreasySession.get()) return;
    const a = e.target.closest && e.target.closest('a[href]');
    // карточки игр открываются в новой вкладке — без входа всё равно сначала показываем вход здесь
    if (!a || e.metaKey || e.ctrlKey) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.hash && url.pathname === location.pathname) return;
    const here = new URL('./', location.href).pathname;
    // игра — это папка внутри этого каталога (не сам каталог и не другой сайт)
    if (!url.pathname.startsWith(here) || url.pathname === here || /\.(apk|dmg|zip|exe)$/i.test(url.pathname)) return;
    if (url.pathname.replace(here, '').split('/').filter(Boolean).length !== 1) return;
    if (/^FreasyGames3D\/?$/i.test(url.pathname.replace(here, ''))) return; // ссылка на 3D-каталог — не игра
    if (url.pathname === SETTINGS) return; // настройки — тоже не игра
    e.preventDefault();
    openLogin(url.pathname + url.search + url.hash);
  }, true);

  render();
  if (askLogin && !window.FreasySession.get()) setTimeout(() => acc.open(), 50);
  else if (askLogin && next) location.href = next; // уже вошёл — сразу в игру
})();
