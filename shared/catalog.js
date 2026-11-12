'use strict';
// Каталог FreasyGames 2D и 3D: счётчики заходов, лайков и звёзд у каждой игры + поиск и сортировка.
// Счётчики живут в общем Supabase-проекте (таблица game_stats, см. shared/catalog.sql).
//
// FreasyCatalog({
//   grid: '.games',               // контейнер с карточками (grid или flex — порядок меняется через CSS order)
//   card: '.card',                // карточка игры; у неё data-game="id" и, по желанию, data-tags="тег, тег"
//   playLink: '.play',            // ссылка «Играть» внутри карточки — по клику считается заход
//   statsBefore: '.card-bottom',  // куда вставить строку со счётчиками (перед этим элементом; нет — в конец карточки)
//   tags: card => [...],          // свои теги карточки, если нет data-tags
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
  const css = document.createElement('style');
  css.textContent = `
  .gs-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:16px;font-family:Manrope,system-ui,sans-serif;position:relative;z-index:2}
  .gs-pill{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 11px;border-radius:100px;border:1px solid #ffffff1e;background:#ffffff0a;color:#d1cde5;font:inherit;font-size:12px;font-weight:800;white-space:nowrap}
  button.gs-pill{cursor:pointer;transition:background .15s,border-color .15s,transform .15s}
  button.gs-pill:hover{background:#ffffff16}
  button.gs-pill:active{transform:scale(.94)}
  .gs-like[aria-pressed=true]{color:#ff8fb3;border-color:#ff7eb666;background:#ff7eb61a}
  .gs-like .gs-heart{font-size:14px;line-height:1}
  .gs-stars{display:inline-flex;align-items:center;gap:1px;height:32px;padding:0 9px 0 6px;border-radius:100px;border:1px solid #ffffff1e;background:#ffffff0a;color:#d1cde5;font-size:12px;font-weight:800}
  .gs-stars button{all:unset;cursor:pointer;font-size:17px;line-height:1;padding:2px 1px;color:#ffffff30;transition:color .1s,transform .1s}
  .gs-stars button.on{color:#ffd36f}
  .gs-stars button.mine{color:#ffb84d;text-shadow:0 0 8px #ffb84d88}
  .gs-stars button:hover{transform:scale(1.2)}
  .gs-stars button:focus-visible,button.gs-pill:focus-visible{outline:2px solid #bca0ff;outline-offset:2px}
  .gs-stars .gs-avg{margin-left:6px}
  .gs-stars .gs-cnt{color:#8f8ca6;font-weight:700;margin-left:3px}
  .gs-plays{color:#b9b6c9}
  .gs-search{display:flex;flex-direction:column;gap:12px;margin:0 0 24px;font-family:Manrope,system-ui,sans-serif;position:relative;z-index:2}
  .gs-row{display:flex;gap:10px;flex-wrap:wrap}
  .gs-input{flex:1 1 260px;min-width:0;display:flex;align-items:center;gap:10px;height:48px;padding:0 16px;border-radius:14px;border:1px solid #ffffff24;background:#181a2ee6;backdrop-filter:blur(10px)}
  .gs-input:focus-within{border-color:#bca0ffaa;box-shadow:0 0 0 3px #bca0ff26}
  .gs-input input{flex:1;min-width:0;height:100%;border:0;outline:0;background:none;color:#f8f7ff;font:inherit;font-size:15px}
  .gs-input input::placeholder{color:#7d7a95}
  .gs-input .gs-clear{all:unset;cursor:pointer;color:#8f8ca6;font-size:18px;padding:4px}
  .gs-input .gs-clear[hidden]{display:none}
  .gs-sort{height:48px;padding:0 14px;border-radius:14px;border:1px solid #ffffff24;background:#181a2ee6;color:#f8f7ff;font:inherit;font-size:14px;font-weight:700;cursor:pointer}
  .gs-sort option{background:#181a2e}
  .gs-tags{display:flex;gap:7px;flex-wrap:wrap}
  .gs-tag{font:inherit;font-size:12px;font-weight:800;padding:7px 12px;border-radius:100px;border:1px solid #ffffff1e;background:#1d1e33e6;backdrop-filter:blur(8px);color:#c9c5dc;cursor:pointer}
  .gs-tag:hover{background:#2a2b44}
  .gs-tag[aria-pressed=true]{background:#bca0ff;color:#171225;border-color:transparent}
  .gs-info{color:#89879e;font-size:13px;min-height:18px}
  .gs-empty{grid-column:1/-1;padding:40px 20px;text-align:center;color:#a9a6bd;border:1px dashed #ffffff2a;border-radius:20px;font-size:15px}
  .gs-empty[hidden]{display:none}
  .gs-hidden{display:none !important}
  .gs-toast{position:fixed;left:50%;bottom:22px;z-index:400;transform:translate(-50%,20px);opacity:0;pointer-events:none;padding:11px 16px;border-radius:12px;background:#28213f;border:1px solid #b79aff80;color:#f8f7ff;font:700 13px Manrope,system-ui,sans-serif;transition:opacity .2s,transform .2s;max-width:calc(100% - 32px)}
  .gs-toast.show{opacity:1;transform:translate(-50%,0)}
  @media (max-width:450px){.gs-sort{flex:1 1 100%}}`;
  document.head.appendChild(css);

  const toast = document.createElement('div');
  toast.className = 'gs-toast'; toast.setAttribute('role', 'status');
  document.body.appendChild(toast);
  let toastTimer;
  function say(text) {
    toast.textContent = text; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  const fmt = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });
  const num = n => n < 10000 ? String(n) : fmt.format(n);
  const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  };
  const norm = s => (s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"']/g, '');

  // ---------- карточки ----------
  const items = cards.map((card, index) => {
    const id = card.dataset.game;
    const title = (card.querySelector('h3') || {}).textContent || '';
    const desc = [...card.querySelectorAll('p')].map(p => p.textContent).join(' ');
    let tags = card.dataset.tags ? card.dataset.tags.split(',') : (opts.tags ? opts.tags(card) : []);
    tags = tags.map(t => t.trim()).filter(Boolean);
    const hay = norm([title, desc, tags.join(' ')].join(' '));

    const bar = document.createElement('div');
    bar.className = 'gs-bar';
    bar.innerHTML = `
      <span class="gs-pill gs-plays" title="Сколько раз открывали игру"><span aria-hidden="true">▶</span><b>—</b></span>
      <button class="gs-pill gs-like" type="button" aria-pressed="false"><span class="gs-heart" aria-hidden="true">♡</span><b>—</b></button>
      <span class="gs-stars" role="group" aria-label="Оценка игры">${[1, 2, 3, 4, 5].map(n =>
        `<button type="button" data-n="${n}" aria-label="Поставить ${n} ${plural(n, 'звезду', 'звезды', 'звёзд')}">★</button>`).join('')}<span class="gs-avg">—</span><span class="gs-cnt"></span></span>`;
    const before = opts.statsBefore && card.querySelector(opts.statsBefore);
    if (before) before.parentNode.insertBefore(bar, before); else card.appendChild(bar);
    // Клики по счётчикам не должны открывать игру, если карточка — ссылка или под ней лежит ссылка.
    bar.addEventListener('click', e => { e.stopPropagation(); if (e.target.closest('button')) e.preventDefault(); });

    const it = { id, card, index, title, tags, hay, bar,
      plays: bar.querySelector('.gs-plays b'), like: bar.querySelector('.gs-like'),
      starBtns: [...bar.querySelectorAll('.gs-stars button')], avg: bar.querySelector('.gs-avg'), cnt: bar.querySelector('.gs-cnt') };

    it.like.addEventListener('click', () => vote(it, { liked: !(mine[id] && mine[id].liked) }));
    it.starBtns.forEach(b => {
      const n = +b.dataset.n;
      b.addEventListener('click', () => vote(it, { stars: (mine[id] && mine[id].stars) === n ? 0 : n }));
      b.addEventListener('mouseenter', () => paintStars(it, n));
      b.addEventListener('focus', () => paintStars(it, n));
    });
    bar.querySelector('.gs-stars').addEventListener('mouseleave', () => paintStars(it));
    bar.querySelector('.gs-stars').addEventListener('focusout', () => paintStars(it));

    const link = card.querySelector(opts.playLink) || (card.matches('a') ? card : null);
    if (link) {
      const count = () => play(it);
      link.addEventListener('click', count);
      link.addEventListener('auxclick', e => { if (e.button === 1) count(); });
    }
    return it;
  });
  const byId = Object.fromEntries(items.map(it => [it.id, it]));

  function rating(id) {
    const s = stats[id];
    return s && s.stars_count ? s.stars_sum / s.stars_count : 0;
  }
  function paintStars(it, preview) {
    const my = (mine[it.id] && mine[it.id].stars) || 0;
    const show = preview || my || Math.round(rating(it.id));
    it.starBtns.forEach((b, i) => {
      b.classList.toggle('on', i < show);
      b.classList.toggle('mine', !preview && my > 0 && i < my);
    });
  }
  function render(it) {
    const s = stats[it.id] || { plays: 0, likes: 0, stars_sum: 0, stars_count: 0 };
    const my = mine[it.id] || {};
    it.plays.textContent = online ? num(s.plays) : '—';
    it.plays.parentNode.title = online ? `Заходов в игру: ${s.plays}` : 'Счётчики сейчас недоступны';
    it.like.querySelector('b').textContent = online ? num(s.likes) : '—';
    it.like.setAttribute('aria-pressed', my.liked ? 'true' : 'false');
    it.like.querySelector('.gs-heart').textContent = my.liked ? '♥' : '♡';
    it.like.title = my.liked ? 'Убрать лайк' : 'Поставить лайк';
    it.like.setAttribute('aria-label', `${my.liked ? 'Убрать лайк' : 'Лайк'}: ${s.likes} ${plural(s.likes, 'лайк', 'лайка', 'лайков')}`);
    const r = rating(it.id);
    it.avg.textContent = s.stars_count ? r.toFixed(1).replace('.', ',') : (online ? 'нет оценок' : '—');
    it.cnt.textContent = s.stars_count ? `(${num(s.stars_count)})` : '';
    it.bar.querySelector('.gs-stars').title = my.stars ? `Твоя оценка: ${my.stars}. Нажми ещё раз, чтобы убрать` : 'Оцени игру';
    paintStars(it);
  }
  const renderAll = () => { items.forEach(render); apply(); };

  async function vote(it, change) {
    const prev = { ...(mine[it.id] || { liked: false, stars: 0 }) };
    const next = { ...prev, ...change };
    // Сразу показываем результат, сервер потом пришлёт точные числа.
    const s = stats[it.id] = { ...(stats[it.id] || { plays: 0, likes: 0, stars_sum: 0, stars_count: 0 }) };
    s.likes += (next.liked ? 1 : 0) - (prev.liked ? 1 : 0);
    s.stars_sum += (next.stars || 0) - (prev.stars || 0);
    s.stars_count += (next.stars ? 1 : 0) - (prev.stars ? 1 : 0);
    mine[it.id] = next; store.set('freasy-votes', mine);
    online = true; render(it);
    if (change.stars) say(`Спасибо! Твоя оценка: ${change.stars} из 5 — ${it.title}`);
    try {
      const row = await api('/rest/v1/rpc/game_vote', { gid: it.id, voter_id: voter, new_liked: !!next.liked, new_stars: next.stars || 0 });
      if (row && row.game_id) stats[it.id] = row;
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
      const fresh = {};
      rows.forEach(r => { fresh[r.game_id] = { liked: r.liked, stars: r.stars || 0 }; });
      // Игры с других страниц (2D/3D) тоже лежат на сервере, поэтому заменяем всё целиком.
      Object.keys(mine).forEach(k => delete mine[k]);
      Object.assign(mine, fresh); store.set('freasy-votes', mine);
    } catch {}
  }

  // ---------- поиск, теги, сортировка ----------
  const tagCount = {};
  items.forEach(it => it.tags.forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; }));
  const tagList = Object.keys(tagCount).sort((a, b) => tagCount[b] - tagCount[a] || a.localeCompare(b, 'ru'));

  const panel = document.createElement('div');
  panel.className = 'gs-search';
  panel.innerHTML = `
    <div class="gs-row">
      <label class="gs-input"><span aria-hidden="true">🔍</span>
        <input type="search" placeholder="Найти игру: название, жанр, тег…" aria-label="Поиск игр" autocomplete="off" enterkeyhint="search">
        <button class="gs-clear" type="button" aria-label="Очистить поиск" hidden>✕</button></label>
      <select class="gs-sort" aria-label="Сортировка">
        <option value="default">Как на сайте</option>
        <option value="plays">Популярные</option>
        <option value="likes">Больше лайков</option>
        <option value="stars">Лучшая оценка</option>
        <option value="name">По названию А–Я</option>
      </select>
    </div>
    <div class="gs-tags" role="group" aria-label="Фильтр по тегам">
      <button class="gs-tag" type="button" data-tag="" aria-pressed="true">Все</button>
      <button class="gs-tag" type="button" data-tag="♥" aria-pressed="false">♥ Мои лайки</button>
      ${tagList.map(t => `<button class="gs-tag" type="button" data-tag="${t.replace(/"/g, '&quot;')}" aria-pressed="false">${t}</button>`).join('')}
    </div>
    <div class="gs-info" aria-live="polite"></div>`;
  grid.parentNode.insertBefore(panel, grid);
  const input = panel.querySelector('input'), clear = panel.querySelector('.gs-clear');
  const sort = panel.querySelector('.gs-sort'), info = panel.querySelector('.gs-info');
  const empty = document.createElement('div');
  empty.className = 'gs-empty'; empty.hidden = true;
  empty.innerHTML = 'Ничего не нашлось 😿<br><small>Попробуй другое слово или сбрось фильтр</small>';
  grid.appendChild(empty);

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
      it.card.classList.toggle('gs-hidden', !ok);
      if (ok) shown++;
    });
    const key = sort.value;
    const value = it => {
      const s = stats[it.id] || {};
      if (key === 'plays') return s.plays || 0;
      if (key === 'likes') return s.likes || 0;
      // Сглаженная оценка: одна пятёрка не обгонит игру с сотней четвёрок.
      if (key === 'stars') return ((s.stars_sum || 0) + 3 * 2) / ((s.stars_count || 0) + 2);
      return 0;
    };
    const sorted = [...items].sort((a, b) => key === 'default' ? a.index - b.index
      : key === 'name' ? a.title.localeCompare(b.title, 'ru')
      : value(b) - value(a) || a.index - b.index);
    sorted.forEach((it, i) => { it.card.style.order = i; });
    empty.style.order = items.length;
    empty.hidden = shown > 0;
    clear.hidden = !input.value;
    const filtered = words.length || tag;
    const offlineNote = navigator.onLine === false || !online
      ? 'Нет интернета — игры работают офлайн, а лайки, звёзды и заходы обновятся, когда появится сеть.' : '';
    info.textContent = [filtered ? `Найдено: ${shown} ${plural(shown, 'игра', 'игры', 'игр')} из ${items.length}` : '', offlineNote].filter(Boolean).join(' · ');
  }

  input.addEventListener('input', apply);
  input.addEventListener('keydown', e => { if (e.key === 'Escape') { input.value = ''; apply(); } });
  clear.addEventListener('click', () => { input.value = ''; apply(); input.focus(); });
  sort.addEventListener('change', () => { store.set('freasy-catalog-sort', sort.value); apply(); });
  panel.querySelector('.gs-tags').addEventListener('click', e => {
    const b = e.target.closest('.gs-tag'); if (!b) return;
    tag = b.dataset.tag === tag ? '' : b.dataset.tag;
    panel.querySelectorAll('.gs-tag').forEach(x => x.setAttribute('aria-pressed', x.dataset.tag === tag ? 'true' : 'false'));
    apply();
  });
  // Поиск из адреса: …/?q=кот или …/#games?q=кот
  const q = new URLSearchParams(location.search).get('q');
  if (q) input.value = q;

  renderAll();
  Promise.all([loadStats(), loadMine()]).then(renderAll);
  // Вернулся на вкладку каталога после игры — подтянем свежие числа.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadStats().then(renderAll); });
  addEventListener('online', () => Promise.all([loadStats(), loadMine()]).then(renderAll));
  addEventListener('offline', apply);

  return { byId, refresh: () => loadStats().then(renderAll) };
};
