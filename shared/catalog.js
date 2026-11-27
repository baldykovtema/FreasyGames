'use strict';
// Каталог FreasyGames 2D и 3D в духе App Store: поиск с категориями, подборка новинок, полка «Популярное»,
// список игр строками (иконка, название, жанр, оценка, кнопка «Играть») и страница игры по нажатию на строку.
// Счётчики заходов, лайков и звёзд живут в общем Supabase-проекте (таблица game_stats, см. shared/catalog.sql).
//
// FreasyCatalog({
//   grid: '.games',               // контейнер с исходными карточками (их данные берутся отсюда, сами карточки прячутся)
//   card: '.card',                // карточка игры; у неё data-game="id" и, по желанию, data-tags="тег, тег"
//   playLink: '.play',            // ссылка «Играть» внутри карточки — её адрес и target повторяются в новых кнопках
//   tags: card => [...],          // свои теги карточки, если нет data-tags
//   featured: 5,                  // сколько новинок (последних карточек) показать в подборке
// });
window.FreasyCatalog = (opts) => {
  const SB_URL = 'https://ywqxrbmgmvpbeytxjkpi.supabase.co', SB_KEY = 'sb_publishable_igyJK68YpyJYo-0KNrVZPA_rm6_gIRg';
  const grid = document.querySelector(opts.grid);
  if (!grid) return;
  const cards = [...grid.querySelectorAll(opts.card)].filter(c => c.dataset.game);

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  let voter = store.get('freasy-voter', null);
  if (!voter || !/^[0-9a-f-]{36}$/i.test(voter)) {
    voter = (crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
    store.set('freasy-voter', voter);
  }
  const mine = store.get('freasy-votes', {});           // { gid: { liked, stars } }
  const stats = {};                                      // { gid: { plays, likes, stars_sum, stars_count } }
  let online = true;

  async function api(path, body) {
    const res = await fetch(SB_URL + path, {
      method: body ? 'POST' : 'GET', keepalive: !!body,
      headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error((data && data.message) || 'Ошибка ' + res.status);
    return data;
  }

  // ---------- стили ----------
  // Цвета берутся из переменных страницы (--card, --accent…), поэтому каталог перекрашивается вместе с темой.
  const css = document.createElement('style');
  css.textContent = `
  .as,.as-sheet{--as-card:var(--card,#181a2e);--as-text:var(--text,#f8f7ff);--as-soft:var(--soft,#d1cde5);--as-dim:var(--dim,#8f8ca6);--as-line:var(--line,#ffffff18);
    --as-line2:var(--line-2,#ffffff30);--as-fill:var(--hover,#ffffff14);--as-acc:var(--accent,#bca0ff);--as-on:var(--on-accent,#171225)}
  .as{font-family:Manrope,system-ui,-apple-system,sans-serif;color:var(--as-text);position:relative;z-index:2;padding-bottom:90px}
  .as-hidden,.gs-orig{display:none !important}
  /* поиск */
  .as-search{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:12px;padding:10px 0 12px;margin:0 0 4px;
    background:linear-gradient(var(--bg,#111321) 70%,transparent)}
  .as-field{flex:1;min-width:0;display:flex;align-items:center;gap:9px;height:44px;padding:0 12px;border-radius:12px;background:var(--as-fill);
    border:1px solid transparent;transition:border-color .2s,background .2s}
  .as-field:focus-within{border-color:var(--as-acc);background:var(--as-card)}
  .as-field svg{flex:none;opacity:.6}
  .as-field input{flex:1;min-width:0;height:100%;border:0;outline:0;background:none;color:var(--as-text);font:inherit;font-size:16px}
  .as-field input::placeholder{color:var(--as-dim)}
  .as-field input::-webkit-search-cancel-button{display:none}
  .as-field input::-webkit-contacts-auto-fill-button,.as-field input::-webkit-credentials-auto-fill-button{visibility:hidden;display:none!important;pointer-events:none}
  .as-field input:-webkit-autofill{animation-name:as-autofill;-webkit-box-shadow:0 0 0 40px var(--as-fill) inset;-webkit-text-fill-color:var(--as-text)}
  @keyframes as-autofill{from{opacity:1}to{opacity:1}}
  .as-clear{all:unset;cursor:pointer;display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--as-dim);color:var(--as-card);font-size:11px;font-weight:800;flex:none}
  .as-clear[hidden],.as-cancel[hidden]{display:none}
  .as-cancel{all:unset;cursor:pointer;color:var(--as-acc);font-size:15px;font-weight:700;flex:none;padding:6px 2px}
  /* категории: одна прокручиваемая строка */
  .as-chips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:2px 0 18px;margin:0 -2px;scroll-snap-type:x proximity}
  .as-chips::-webkit-scrollbar{display:none}
  .as-chip{all:unset;cursor:pointer;flex:none;scroll-snap-align:start;font-size:13px;font-weight:700;padding:8px 14px;border-radius:100px;background:var(--as-fill);color:var(--as-soft);white-space:nowrap}
  .as-chip:hover{background:var(--as-line2)}
  .as-chip[aria-pressed=true]{background:var(--as-acc);color:var(--as-on)}
  .as-chip:focus-visible,.as-get:focus-visible,.as-row:focus-visible,.as-feat-card:focus-visible{outline:2px solid var(--as-acc);outline-offset:2px}
  /* заголовки разделов */
  .as .as-sec{margin:0 0 30px;padding:0;min-height:0}
  .as .as-h{margin:0;padding:0}
  .as-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-top:1px solid var(--as-line);padding-top:16px;margin-bottom:12px}
  .as-h{margin:0;font-size:22px;font-weight:800;letter-spacing:-.03em}
  .as-sub-h{color:var(--as-dim);font-size:13px;font-weight:700}
  .as-sort{appearance:none;-webkit-appearance:none;border:0;background:none;color:var(--as-acc);font:inherit;font-size:15px;font-weight:700;cursor:pointer;padding:4px 18px 4px 4px;
    background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);
    background-position:calc(100% - 9px) 55%,calc(100% - 4px) 55%;background-size:5px 5px;background-repeat:no-repeat}
  .as-sort option{background:var(--as-card);color:var(--as-text)}
  /* подборка: большие карточки с прокруткой */
  .as-carousel{display:grid;grid-auto-flow:column;grid-auto-columns:min(88%,560px);gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;padding-bottom:4px}
  .as-carousel::-webkit-scrollbar,.as-shelf::-webkit-scrollbar{display:none}
  @media (min-width:900px){.as-carousel{grid-auto-columns:calc((100% - 28px) / 3)}}
  .as-feat-card{position:relative;display:block;scroll-snap-align:start;border-radius:18px;overflow:hidden;background:var(--as-card);aspect-ratio:16/11;cursor:pointer;
    border:1px solid var(--as-line);color:#fff;text-decoration:none;transform:translateZ(0)}
  .as-feat-card .as-media{position:absolute;inset:0}
  .as-feat-card::after{content:"";position:absolute;inset:40% 0 0;background:linear-gradient(transparent,#000000c8);pointer-events:none}
  .as-feat-text{position:absolute;left:16px;right:16px;bottom:14px;z-index:1}
  .as-feat-eye{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#ffffffc0}
  .as-feat-title{font-size:22px;font-weight:800;letter-spacing:-.03em;margin:3px 0 2px;line-height:1.15}
  .as-feat-desc{font-size:13px;color:#ffffffc8;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  /* полка: по три строки в колонке */
  .as-shelf{display:grid;grid-auto-flow:column;grid-template-rows:repeat(3,auto);grid-auto-columns:min(86%,380px);column-gap:22px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}
  .as-shelf .as-row{scroll-snap-align:start}
  /* список */
  .as-list{display:grid;grid-template-columns:1fr;column-gap:28px}
  @media (min-width:720px){.as-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media (min-width:1080px){.as-list{grid-template-columns:repeat(3,minmax(0,1fr))}}
  .as-row{display:grid;grid-template-columns:64px minmax(0,1fr) auto;align-items:center;gap:12px;padding:10px 0;cursor:pointer;position:relative;border-radius:14px}
  .as-row::after{content:"";position:absolute;left:76px;right:0;bottom:0;border-bottom:1px solid var(--as-line)}
  .as-row:hover .as-title{color:var(--as-acc)}
  .as-icon{width:64px;height:64px;border-radius:15px;overflow:hidden;position:relative;background:var(--as-card);box-shadow:0 0 0 1px var(--as-line) inset}
  .as-text{min-width:0}
  .as-title{font-size:16px;font-weight:800;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .15s}
  .as-subt{font-size:13px;color:var(--as-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
  .as-rate{font-size:12px;color:var(--as-dim);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .as-rate b{color:#ffb84d;font-weight:800;letter-spacing:-1px}
  .as-get{display:inline-grid;place-items:center;min-width:76px;height:30px;padding:0 14px;border-radius:100px;background:var(--as-fill);color:var(--as-acc);
    font:800 13px Manrope,system-ui,sans-serif;text-transform:uppercase;letter-spacing:.02em;text-decoration:none;white-space:nowrap;transition:background .15s,transform .15s}
  .as-get:hover{background:var(--as-line2)}
  .as-get:active{transform:scale(.94)}
  .as-get.big{height:36px;min-width:104px;font-size:14px;background:var(--as-acc);color:var(--as-on)}
  /* картинка игры: скриншот или 3D-сцена каталога, уменьшенная до нужного размера */
  .as-media{position:relative;overflow:hidden;width:100%;height:100%;background:var(--as-card)}
  .as-media img{display:block;width:100%;height:100%;object-fit:cover}
  .as-art-box{position:absolute;left:50%;top:50%;width:320px;height:190px;transform-origin:50% 50%}
  .as-art-box > .art{position:absolute !important;inset:0 !important;height:auto !important}
  .as-icon .pct,.as-icon .art::after{display:none !important}
  /* пусто / подсказка */
  .as-info{color:var(--as-dim);font-size:13px;min-height:18px;margin:-4px 0 8px}
  .as-empty{padding:46px 20px;text-align:center;color:var(--as-dim);font-size:15px}
  .as-empty b{display:block;color:var(--as-text);font-size:20px;margin-bottom:6px}
  .as-empty[hidden]{display:none}
  /* страница игры */
  .as-sheet{position:fixed;inset:0;z-index:300;display:flex;align-items:flex-end;justify-content:center;background:#05060dcc;opacity:0;transition:opacity .2s;font-family:Manrope,system-ui,sans-serif}
  .as-sheet.on{opacity:1}
  .as-sheet[hidden]{display:none}
  .as-panel{width:min(640px,100%);max-height:calc(100dvh - 24px);overflow-y:auto;overscroll-behavior:contain;background:var(--as-card);color:var(--as-text);border-radius:22px 22px 0 0;
    padding:20px 20px max(24px,env(safe-area-inset-bottom));transform:translateY(40px);transition:transform .25s;box-shadow:0 -20px 60px #0009;border:1px solid var(--as-line)}
  .as-sheet.on .as-panel{transform:none}
  @media (min-width:700px){.as-sheet{align-items:center}.as-panel{border-radius:22px;max-height:calc(100dvh - 60px)}}
  .as-close{all:unset;cursor:pointer;position:sticky;top:0;float:right;display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--as-fill);color:var(--as-soft);font-size:15px;font-weight:800;z-index:2}
  .as-p-top{display:grid;grid-template-columns:96px minmax(0,1fr);gap:16px;align-items:center;margin:4px 0 18px}
  .as-p-top .as-icon{width:96px;height:96px;border-radius:22px}
  .as-p-title{margin:0;font-size:24px;font-weight:800;letter-spacing:-.04em;line-height:1.15}
  .as-p-sub{color:var(--as-dim);font-size:14px;margin:3px 0 10px}
  .as-p-media{border-radius:16px;overflow:hidden;aspect-ratio:16/9;margin:0 0 16px;border:1px solid var(--as-line)}
  .as-p-desc{color:var(--as-soft);font-size:15px;line-height:1.6;margin:0 0 14px}
  .as-p-tags{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 6px}
  .as-p-tags span{font-size:12px;font-weight:700;padding:6px 11px;border-radius:100px;background:var(--as-fill);color:var(--as-soft)}
  .as-p-label{font-size:13px;font-weight:800;color:var(--as-dim);text-transform:uppercase;letter-spacing:.06em;margin:16px 0 0}
  /* лайк, звёзды и заходы (на странице игры) */
  .gs-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px}
  .gs-pill{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px;border-radius:100px;border:1px solid var(--as-line);background:var(--as-fill);color:var(--as-soft);font:inherit;font-size:13px;font-weight:800;white-space:nowrap}
  button.gs-pill{cursor:pointer;transition:background .15s,transform .15s}
  button.gs-pill:active{transform:scale(.94)}
  .gs-like[aria-pressed=true]{color:#ff8fb3;border-color:#ff7eb666;background:#ff7eb61a}
  .gs-stars{display:inline-flex;align-items:center;gap:1px;height:34px;padding:0 10px 0 6px;border-radius:100px;border:1px solid var(--as-line);background:var(--as-fill);color:var(--as-soft);font-size:13px;font-weight:800}
  .gs-stars button{all:unset;cursor:pointer;font-size:20px;line-height:1;padding:2px;color:var(--as-line2);transition:color .1s,transform .1s}
  .gs-stars button.on{color:#ffd36f}
  .gs-stars button.mine{color:#ffb84d;text-shadow:0 0 8px #ffb84d88}
  .gs-stars button:hover{transform:scale(1.2)}
  .gs-stars button:focus-visible,button.gs-pill:focus-visible{outline:2px solid var(--as-acc);outline-offset:2px}
  .gs-stars .gs-avg{margin-left:6px}
  .gs-stars .gs-cnt{color:var(--as-dim);font-weight:700;margin-left:3px}
  .gs-toast{position:fixed;left:50%;bottom:22px;z-index:400;transform:translate(-50%,20px);opacity:0;pointer-events:none;padding:11px 16px;border-radius:12px;background:var(--offer,#28213f);border:1px solid var(--accent-a,#b79aff80);color:var(--as-text,#f8f7ff);font:700 13px Manrope,system-ui,sans-serif;transition:opacity .2s,transform .2s;max-width:calc(100% - 32px)}
  .gs-toast.show{opacity:1;transform:translate(-50%,0)}
  html.as-lock{overflow:hidden}
  @media (prefers-reduced-motion:reduce){.as-sheet,.as-panel{transition:none}}`;
  document.head.appendChild(css);

  const toast = document.createElement('div');
  toast.className = 'gs-toast'; toast.setAttribute('role', 'status');
  document.body.appendChild(toast);
  let toastTimer;
  function say(text) {
    toast.textContent = text; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  const fmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
  const num = n => n < 10000 ? String(n) : fmt.format(n);
  const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  };
  const norm = s => (s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"']/g, '');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- данные игр из исходных карточек ----------
  const items = cards.map((card, index) => {
    const id = card.dataset.game;
    const title = ((card.querySelector('h3') || {}).textContent || '').trim();
    const desc = (card.querySelector('.description') || [...card.querySelectorAll('p')].pop() || {}).textContent || '';
    let tags = card.dataset.tags ? card.dataset.tags.split(',') : (opts.tags ? opts.tags(card) : []);
    tags = tags.map(t => t.trim()).filter(Boolean);
    const link = card.querySelector(opts.playLink) || (card.matches('a') ? card : null);
    const img = card.querySelector('.shot img, img');
    const art = card.querySelector('.art');
    const hay = norm([title, desc, tags.join(' ')].join(' '));
    // Подзаголовок, как в App Store: жанр без служебных тегов.
    const sub = tags.filter(t => !/таблица лидеров/i.test(t)).slice(0, 2).join(' · ') || 'Игра';
    return { id, card, index, title, desc: desc.trim(), tags, sub, hay, link, img, art, rows: [] };
  });
  const byId = Object.fromEntries(items.map(it => [it.id, it]));
  grid.classList.add('gs-orig');

  // Картинка игры нужного размера: скриншот (2D) или копия 3D-сцены каталога, уменьшенная под рамку.
  const fits = [];
  function media(it) {
    const box = document.createElement('div'); box.className = 'as-media';
    if (it.img) {
      const im = document.createElement('img'); im.src = it.img.currentSrc || it.img.src; im.alt = ''; im.loading = 'lazy'; im.decoding = 'async';
      box.appendChild(im);
    } else if (it.art) {
      const inner = document.createElement('div'); inner.className = 'as-art-box';
      const clone = it.art.cloneNode(true); clone.removeAttribute('id'); inner.appendChild(clone); box.appendChild(inner);
      fits.push(box);
    }
    return box;
  }
  // 3D-сцены нарисованы под 320 × 190: масштабируем так, чтобы рамка была закрыта целиком.
  function fitArt(box) {
    const inner = box.firstChild; if (!inner || !box.isConnected) return;
    const w = box.clientWidth, h = box.clientHeight; if (!w || !h) return;
    const k = Math.max(w / 320, h / 190);
    inner.style.transform = `translate(-50%,-50%) scale(${k})`;
  }
  const refit = () => fits.forEach(fitArt);
  addEventListener('resize', refit);

  function playLink(it, cls, text) {
    const a = document.createElement('a');
    a.className = cls; a.textContent = text;
    if (it.link) {
      a.href = it.link.getAttribute('href');
      for (const k of ['target', 'rel']) if (it.link.getAttribute(k)) a.setAttribute(k, it.link.getAttribute(k));
    }
    a.setAttribute('aria-label', 'Играть: ' + it.title);
    a.addEventListener('click', e => { e.stopPropagation(); play(it); });
    a.addEventListener('auxclick', e => { if (e.button === 1) play(it); });
    return a;
  }
  function row(it) {
    const r = document.createElement('div');
    r.className = 'as-row'; r.tabIndex = 0; r.setAttribute('role', 'button'); r.setAttribute('aria-label', 'Об игре: ' + it.title);
    const icon = document.createElement('div'); icon.className = 'as-icon'; icon.appendChild(media(it));
    const text = document.createElement('div'); text.className = 'as-text';
    text.innerHTML = `<div class="as-title">${esc(it.title)}</div><div class="as-subt">${esc(it.sub)}</div><div class="as-rate"></div>`;
    r.append(icon, text, playLink(it, 'as-get', 'Играть'));
    r.addEventListener('click', () => openSheet(it));
    r.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSheet(it); } });
    it.rows.push(r.querySelector('.as-rate'));
    return r;
  }

  // ---------- разметка каталога ----------
  const root = document.createElement('div');
  root.className = 'as';
  const tagCount = {};
  items.forEach(it => it.tags.forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; }));
  const tagList = Object.keys(tagCount).sort((a, b) => tagCount[b] - tagCount[a] || a.localeCompare(b, 'ru'));
  root.innerHTML = `
    <div class="as-search" role="search">
      <label class="as-field">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7"/><path d="M20 20l-4.5-4.5"/></svg>
        <input type="search" name="freasy-game-search" id="freasy-game-search" placeholder="Игры, жанры и теги" aria-label="Поиск игр" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" readonly data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other">
        <button class="as-clear" type="button" aria-label="Очистить поиск" hidden>✕</button>
      </label>
      <button class="as-cancel" type="button" hidden>Отмена</button>
    </div>
    <div class="as-chips" role="group" aria-label="Категории">
      <button class="as-chip" type="button" data-tag="" aria-pressed="true">Все игры</button>
      <button class="as-chip" type="button" data-tag="♥" aria-pressed="false">♥ Мои лайки</button>
      ${tagList.map(t => `<button class="as-chip" type="button" data-tag="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join('')}
    </div>
    <section class="as-sec as-feat" aria-label="Новое и интересное">
      <div class="as-head"><h3 class="as-h">Новое и интересное</h3><span class="as-sub-h">Свежие игры</span></div>
      <div class="as-carousel"></div>
    </section>
    <section class="as-sec as-pop" aria-label="Популярное">
      <div class="as-head"><h3 class="as-h">Популярное</h3><span class="as-sub-h">Больше всего заходов</span></div>
      <div class="as-shelf"></div>
    </section>
    <section class="as-sec as-all">
      <div class="as-head"><h3 class="as-h as-all-h">Все игры</h3>
        <select class="as-sort" aria-label="Сортировка">
          <option value="default">Как на сайте</option>
          <option value="plays">Популярные</option>
          <option value="likes">Больше лайков</option>
          <option value="stars">Лучшая оценка</option>
          <option value="name">По названию А–Я</option>
        </select></div>
      <div class="as-info" aria-live="polite"></div>
      <div class="as-list"></div>
      <div class="as-empty" hidden><b>Ничего не нашлось</b>Попробуй другое слово или другую категорию</div>
    </section>`;
  grid.parentNode.insertBefore(root, grid);
  const $ = s => root.querySelector(s);
  const input = $('input'), clear = $('.as-clear'), cancel = $('.as-cancel'), sort = $('.as-sort'), info = $('.as-info');
  const list = $('.as-list'), empty = $('.as-empty'), feat = $('.as-feat'), pop = $('.as-pop'), allH = $('.as-all-h');

  // подборка: последние добавленные игры
  const fresh = items.slice(-(opts.featured || 5)).reverse();
  fresh.forEach(it => {
    const c = document.createElement('div');
    c.className = 'as-feat-card'; c.tabIndex = 0; c.setAttribute('role', 'button'); c.setAttribute('aria-label', 'Об игре: ' + it.title);
    c.appendChild(media(it));
    c.insertAdjacentHTML('beforeend', `<div class="as-feat-text"><div class="as-feat-eye">Новая игра · ${esc(it.sub)}</div><div class="as-feat-title">${esc(it.title)}</div><div class="as-feat-desc">${esc(it.desc)}</div></div>`);
    c.addEventListener('click', () => openSheet(it));
    c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSheet(it); } });
    $('.as-carousel').appendChild(c);
  });
  items.forEach(it => { it.row = row(it); list.appendChild(it.row); });

  // полка «Популярное» строится заново, когда приходят свежие счётчики
  let shelfKey = '';
  function buildShelf() {
    const top = [...items].sort((a, b) => ((stats[b.id] || {}).plays || 0) - ((stats[a.id] || {}).plays || 0) || a.index - b.index).slice(0, 9);
    const key = top.map(t => t.id).join();
    if (key === shelfKey) return; shelfKey = key;
    const shelf = $('.as-shelf');
    for (const it of items) it.rows = it.rows.filter(el => !shelf.contains(el));
    for (let i = fits.length - 1; i >= 0; i--) if (shelf.contains(fits[i])) fits.splice(i, 1);
    shelf.textContent = '';
    top.forEach(it => shelf.appendChild(row(it)));
    requestAnimationFrame(refit);
  }

  // ---------- страница игры ----------
  const sheet = document.createElement('div');
  sheet.className = 'as-sheet'; sheet.hidden = true;
  sheet.innerHTML = '<div class="as-panel" role="dialog" aria-modal="true"></div>';
  document.body.appendChild(sheet);
  const panel = sheet.querySelector('.as-panel');
  let openIt = null, lastFocus = null;
  function openSheet(it) {
    openIt = it; lastFocus = document.activeElement;
    panel.setAttribute('aria-label', it.title);
    panel.innerHTML = `<button class="as-close" type="button" aria-label="Закрыть">✕</button>
      <div class="as-p-top"><div class="as-icon"></div><div><h3 class="as-p-title">${esc(it.title)}</h3><div class="as-p-sub">${esc(it.sub)}</div><div class="as-p-play"></div></div></div>
      <div class="as-p-label">Оценки и отзывы</div><div class="as-p-bar"></div>
      <div class="as-p-label" style="margin-bottom:10px">Об игре</div>
      <div class="as-p-media"></div>
      <p class="as-p-desc">${esc(it.desc)}</p>
      <div class="as-p-tags">${it.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>`;
    panel.querySelector('.as-icon').appendChild(media(it));
    panel.querySelector('.as-p-media').appendChild(media(it));
    panel.querySelector('.as-p-play').appendChild(playLink(it, 'as-get big', 'Играть'));
    panel.querySelector('.as-p-bar').appendChild(it.bar || makeBar(it));
    panel.querySelector('.as-close').addEventListener('click', closeSheet);
    render(it);
    sheet.hidden = false; document.documentElement.classList.add('as-lock');
    requestAnimationFrame(() => { sheet.classList.add('on'); refit(); panel.querySelector('.as-close').focus(); });
  }
  function closeSheet() {
    if (sheet.hidden) return;
    sheet.classList.remove('on'); document.documentElement.classList.remove('as-lock');
    for (let i = fits.length - 1; i >= 0; i--) if (panel.contains(fits[i])) fits.splice(i, 1);
    setTimeout(() => { sheet.hidden = true; panel.textContent = ''; }, 200);
    openIt = null; if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });

  // лайк, звёзды и заходы одной игры
  function makeBar(it) {
    const bar = document.createElement('div');
    bar.className = 'gs-bar';
    bar.innerHTML = `
      <span class="gs-pill gs-plays" title="Сколько раз открывали игру"><span aria-hidden="true">▶</span><b>—</b></span>
      <button class="gs-pill gs-like" type="button" aria-pressed="false"><span class="gs-heart" aria-hidden="true">♡</span><b>—</b></button>
      <span class="gs-stars" role="group" aria-label="Оценка игры">${[1, 2, 3, 4, 5].map(n =>
        `<button type="button" data-n="${n}" aria-label="Поставить ${n} ${plural(n, 'звезду', 'звезды', 'звёзд')}">★</button>`).join('')}<span class="gs-avg">—</span><span class="gs-cnt"></span></span>`;
    Object.assign(it, { bar, plays: bar.querySelector('.gs-plays b'), like: bar.querySelector('.gs-like'),
      starBtns: [...bar.querySelectorAll('.gs-stars button')], avg: bar.querySelector('.gs-avg'), cnt: bar.querySelector('.gs-cnt') });
    it.like.addEventListener('click', () => vote(it, { liked: !(mine[it.id] && mine[it.id].liked) }));
    it.starBtns.forEach(b => {
      const n = +b.dataset.n;
      b.addEventListener('click', () => vote(it, { stars: (mine[it.id] && mine[it.id].stars) === n ? 0 : n }));
      b.addEventListener('mouseenter', () => paintStars(it, n));
      b.addEventListener('focus', () => paintStars(it, n));
    });
    const st = bar.querySelector('.gs-stars');
    st.addEventListener('mouseleave', () => paintStars(it)); st.addEventListener('focusout', () => paintStars(it));
    return bar;
  }

  function rating(id) { const s = stats[id]; return s && s.stars_count ? s.stars_sum / s.stars_count : 0; }
  function paintStars(it, preview) {
    if (!it.bar) return;
    const my = (mine[it.id] && mine[it.id].stars) || 0;
    const show = preview || my || Math.round(rating(it.id));
    it.starBtns.forEach((b, i) => { b.classList.toggle('on', i < show); b.classList.toggle('mine', !preview && my > 0 && i < my); });
  }
  function render(it) {
    const s = stats[it.id] || { plays: 0, likes: 0, stars_sum: 0, stars_count: 0 };
    const my = mine[it.id] || {};
    const r = rating(it.id);
    // строка под названием: оценка и заходы
    const parts = [];
    if (s.stars_count) parts.push(`<b>${'★'.repeat(Math.round(r))}${'☆'.repeat(5 - Math.round(r))}</b> ${num(s.stars_count)}`);
    if (online && s.plays) parts.push(`${num(s.plays)} ${plural(s.plays, 'заход', 'захода', 'заходов')}`);
    if (my.liked) parts.push('♥');
    const html = parts.join(' · ') || (online ? 'Пока без оценок' : '&nbsp;');
    it.rows.forEach(el => { el.innerHTML = html; });
    if (!it.bar) return;
    it.plays.textContent = online ? num(s.plays) : '—';
    it.plays.parentNode.title = online ? `Заходов в игру: ${s.plays}` : 'Счётчики сейчас недоступны';
    it.like.querySelector('b').textContent = online ? num(s.likes) : '—';
    it.like.setAttribute('aria-pressed', my.liked ? 'true' : 'false');
    it.like.querySelector('.gs-heart').textContent = my.liked ? '♥' : '♡';
    it.like.title = my.liked ? 'Убрать лайк' : 'Поставить лайк';
    it.like.setAttribute('aria-label', `${my.liked ? 'Убрать лайк' : 'Лайк'}: ${s.likes} ${plural(s.likes, 'лайк', 'лайка', 'лайков')}`);
    it.avg.textContent = s.stars_count ? r.toFixed(1).replace('.', ',') : (online ? 'оцени первым' : '—');
    it.cnt.textContent = s.stars_count ? `(${num(s.stars_count)})` : '';
    it.bar.querySelector('.gs-stars').title = my.stars ? `Твоя оценка: ${my.stars}. Нажми ещё раз, чтобы убрать` : 'Оцени игру';
    paintStars(it);
  }
  const renderAll = () => { buildShelf(); items.forEach(render); apply(); };

  async function vote(it, change) {
    const prev = { ...(mine[it.id] || { liked: false, stars: 0 }) };
    const next = { ...prev, ...change };
    const s = stats[it.id] = { ...(stats[it.id] || { plays: 0, likes: 0, stars_sum: 0, stars_count: 0 }) };
    s.likes += (next.liked ? 1 : 0) - (prev.liked ? 1 : 0);
    s.stars_sum += (next.stars || 0) - (prev.stars || 0);
    s.stars_count += (next.stars ? 1 : 0) - (prev.stars ? 1 : 0);
    mine[it.id] = next; store.set('freasy-votes', mine);
    online = true; render(it);
    if (change.stars) say(`Спасибо! Твоя оценка: ${change.stars} из 5 — ${it.title}`);
    try {
      const rowData = await api('/rest/v1/rpc/game_vote', { gid: it.id, voter_id: voter, new_liked: !!next.liked, new_stars: next.stars || 0 });
      if (rowData && rowData.game_id) stats[it.id] = rowData;
    } catch {
      mine[it.id] = prev; store.set('freasy-votes', mine);
      await loadStats();
      say('Не получилось сохранить. Проверь интернет и попробуй ещё раз');
    }
    render(it); apply();
  }

  function play(it) {
    // Один заход в игру с браузера не чаще раза в 10 минут — чтобы счётчик не накручивался кликами.
    const seen = store.get('freasy-plays', {});
    const now = Date.now();
    if (seen[it.id] && now - seen[it.id] < 10 * 60 * 1000) return;
    seen[it.id] = now; store.set('freasy-plays', seen);
    const s = stats[it.id] = stats[it.id] || { plays: 0, likes: 0, stars_sum: 0, stars_count: 0 };
    s.plays += 1; render(it);
    api('/rest/v1/rpc/game_play', { gid: it.id }).catch(() => {});
  }

  async function loadStats() {
    try {
      const rows = await api('/rest/v1/game_stats?select=game_id,plays,likes,stars_sum,stars_count');
      rows.forEach(r => { stats[r.game_id] = r; });
      online = true;
    } catch { online = false; }
  }
  async function loadMine() {
    try {
      const rows = await api('/rest/v1/rpc/game_my_votes', { voter_id: voter });
      const freshVotes = {};
      rows.forEach(r => { freshVotes[r.game_id] = { liked: r.liked, stars: r.stars || 0 }; });
      Object.keys(mine).forEach(k => delete mine[k]);
      Object.assign(mine, freshVotes); store.set('freasy-votes', mine);
    } catch {}
  }

  // ---------- поиск, категории, сортировка ----------
  const saved = store.get('freasy-catalog-sort', 'default');
  if ([...sort.options].some(o => o.value === saved)) sort.value = saved;
  let tag = '';

  function apply() {
    const words = norm(input.value).split(/\s+/).filter(Boolean);
    let shown = 0;
    items.forEach(it => {
      const okText = words.every(w => it.hay.includes(w));
      const okTag = !tag || (tag === '♥' ? !!(mine[it.id] && mine[it.id].liked) : it.tags.includes(tag));
      const ok = okText && okTag;
      it.row.classList.toggle('as-hidden', !ok);
      if (ok) shown++;
    });
    const key = sort.value;
    const value = it => {
      const s = stats[it.id] || {};
      if (key === 'plays') return s.plays || 0;
      if (key === 'likes') return s.likes || 0;
      if (key === 'stars') return ((s.stars_sum || 0) + 3 * 2) / ((s.stars_count || 0) + 2);
      return 0;
    };
    const sorted = [...items].sort((a, b) => key === 'default' ? a.index - b.index
      : key === 'name' ? a.title.localeCompare(b.title, 'ru')
      : value(b) - value(a) || a.index - b.index);
    sorted.forEach((it, i) => { it.row.style.order = i; });
    // Пока ищешь — как в App Store, остаются только результаты.
    const filtering = words.length > 0 || !!tag;
    feat.classList.toggle('as-hidden', filtering); pop.classList.toggle('as-hidden', filtering);
    allH.textContent = words.length ? 'Результаты' : tag === '♥' ? 'Мои лайки' : tag || 'Все игры';
    empty.hidden = shown > 0;
    clear.hidden = !input.value;
    cancel.hidden = !input.value && document.activeElement !== input;
    const offlineNote = navigator.onLine === false || !online
      ? 'Нет интернета — игры работают офлайн, а лайки, звёзды и заходы обновятся, когда появится сеть.' : '';
    info.textContent = [filtering && shown ? `${shown} ${plural(shown, 'игра', 'игры', 'игр')}` : '', offlineNote].filter(Boolean).join(' · ');
    refit();
  }

  // Поиск из адреса: …/?q=кот
  const q = new URLSearchParams(location.search).get('q');
  const jumpToResults = () => { const top = root.getBoundingClientRect().top + scrollY - 8; if (scrollY > top + 40 || scrollY < top - 400) scrollTo({ top, behavior: 'smooth' }); };
  // Браузер не должен сам вписывать в поиск ник или e-mail: поле только для чтения, пока игрок его не тронет,
  // а всё, что появилось без набора с клавиатуры (автозаполнение), сразу стирается
  let typed = false;
  const unlock = () => { input.readOnly = false; };
  input.addEventListener('pointerdown', unlock); input.addEventListener('touchstart', unlock, { passive: true });
  input.addEventListener('focus', unlock);
  input.addEventListener('keydown', () => { typed = true; });
  input.addEventListener('beforeinput', e => { if (e.isTrusted && e.inputType) typed = true; });
  const dropAutofill = () => { if (!typed && input.value && input.value !== (q || '')) { input.value = ''; apply(); } };
  input.addEventListener('animationstart', e => { if (e.animationName === 'as-autofill') dropAutofill(); });
  [300, 1000, 2500].forEach(t => setTimeout(dropAutofill, t));
  input.addEventListener('input', () => { if (!typed && input.value) input.value = ''; apply(); });
  input.addEventListener('focus', () => { cancel.hidden = false; });
  input.addEventListener('blur', () => setTimeout(apply, 120));
  input.addEventListener('keydown', e => { if (e.key === 'Escape') { input.value = ''; input.blur(); apply(); } if (e.key === 'Enter') { input.blur(); jumpToResults(); } });
  clear.addEventListener('click', () => { input.value = ''; apply(); input.focus(); });
  cancel.addEventListener('click', () => { input.value = ''; setTag(''); input.blur(); apply(); });
  sort.addEventListener('change', () => { store.set('freasy-catalog-sort', sort.value); apply(); });
  function setTag(t) {
    tag = t;
    root.querySelectorAll('.as-chip').forEach(x => x.setAttribute('aria-pressed', x.dataset.tag === tag ? 'true' : 'false'));
  }
  $('.as-chips').addEventListener('click', e => {
    const b = e.target.closest('.as-chip'); if (!b) return;
    setTag(b.dataset.tag === tag ? '' : b.dataset.tag);
    apply(); if (tag) jumpToResults();
  });
  if (q) input.value = q;

  renderAll();
  requestAnimationFrame(refit);
  Promise.all([loadStats(), loadMine()]).then(renderAll);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadStats().then(renderAll); });
  addEventListener('online', () => Promise.all([loadStats(), loadMine()]).then(renderAll));
  addEventListener('offline', apply);

  return { byId, open: id => byId[id] && openSheet(byId[id]), refresh: () => loadStats().then(renderAll) };
};
