'use strict';
// Кнопка «Погода и время» над кнопкой FreasyChat на всех страницах FreasyGames 2D и 3D.
// Часы, дата, погода сейчас, по часам и на 5 дней, восход и закат. Данные — Open-Meteo (бесплатно, без ключа).
// Город выбирается поиском; «📍» спрашивает разрешение на геолокацию только по нажатию.
window.FreasyWeather = (opts = {}) => {
  if (window.__freasyWeather) return window.__freasyWeather;
  const ingame = !!opts.inGame;
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } } };
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DEFAULT = { name: 'Москва', country: 'Россия', lat: 55.7558, lon: 37.6173 };
  let place = store.get('freasy-weather-place', DEFAULT);
  let data = null, loading = false, error = '';

  // Коды погоды WMO → текст и значок.
  const CODES = {
    0: ['Ясно', '☀️', '🌙'], 1: ['Почти ясно', '🌤', '🌙'], 2: ['Переменная облачность', '⛅', '☁️'], 3: ['Пасмурно', '☁️', '☁️'],
    45: ['Туман', '🌫', '🌫'], 48: ['Изморозь и туман', '🌫', '🌫'],
    51: ['Лёгкая морось', '🌦', '🌧'], 53: ['Морось', '🌦', '🌧'], 55: ['Сильная морось', '🌧', '🌧'], 56: ['Ледяная морось', '🌧', '🌧'], 57: ['Сильная ледяная морось', '🌧', '🌧'],
    61: ['Небольшой дождь', '🌦', '🌧'], 63: ['Дождь', '🌧', '🌧'], 65: ['Ливень', '🌧', '🌧'], 66: ['Ледяной дождь', '🌧', '🌧'], 67: ['Сильный ледяной дождь', '🌧', '🌧'],
    71: ['Небольшой снег', '🌨', '🌨'], 73: ['Снег', '🌨', '🌨'], 75: ['Сильный снегопад', '❄️', '❄️'], 77: ['Снежная крупа', '🌨', '🌨'],
    80: ['Кратковременный дождь', '🌦', '🌧'], 81: ['Ливни', '🌧', '🌧'], 82: ['Сильные ливни', '⛈', '⛈'], 85: ['Снегопад', '🌨', '🌨'], 86: ['Сильный снегопад', '❄️', '❄️'],
    95: ['Гроза', '⛈', '⛈'], 96: ['Гроза с градом', '⛈', '⛈'], 99: ['Сильная гроза с градом', '⛈', '⛈'],
  };
  const info = (code, day = true) => { const c = CODES[code] || ['—', '🌡', '🌡']; return { text: c[0], icon: day ? c[1] : c[2] }; };
  const deg = (t) => (t > 0 ? '+' : '') + Math.round(t) + '°';

  async function load(force) {
    const key = `freasy-weather-${place.lat.toFixed(2)},${place.lon.toFixed(2)}`;
    const cached = store.get(key, null);
    if (!force && cached && Date.now() - cached.at < 20 * 60 * 1000) { data = cached.data; render(); return; }
    loading = true; error = ''; render();
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}`
        + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day,precipitation'
        + '&hourly=temperature_2m,weather_code,precipitation_probability,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max'
        + '&timezone=auto&forecast_days=6&wind_speed_unit=ms';
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = await res.json();
      store.set(key, { at: Date.now(), data });
    } catch { error = 'Не удалось загрузить погоду. Проверь интернет'; }
    loading = false; render();
  }
  async function search(q) {
    const list = q.length < 2 ? [] : await fetch('https://geocoding-api.open-meteo.com/v1/search?count=6&language=ru&name=' + encodeURIComponent(q)).then((r) => r.json()).then((j) => j.results || []).catch(() => []);
    const box = panel.querySelector('.fw-found');
    if (!box) return;
    box.innerHTML = list.map((c, i) => `<button type="button" data-i="${i}">${esc(c.name)}<small>${esc([c.admin1, c.country].filter(Boolean).join(', '))}</small></button>`).join('') || (q.length >= 2 ? '<small class="fw-muted">Ничего не нашли</small>' : '');
    box.onclick = (e) => { const b = e.target.closest('[data-i]'); if (!b) return; const c = list[+b.dataset.i]; setPlace({ name: c.name, country: c.country || '', lat: c.latitude, lon: c.longitude }); };
  }
  function setPlace(p) { place = p; store.set('freasy-weather-place', p); picking = false; data = null; load(true); }
  function locate() {
    if (!navigator.geolocation) { error = 'Браузер не умеет определять место'; render(); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setPlace({ name: 'Моё место', country: '', lat: +pos.coords.latitude.toFixed(3), lon: +pos.coords.longitude.toFixed(3) }),
      () => { error = 'Нет доступа к местоположению — найди город поиском'; render(); },
      { timeout: 10000, maximumAge: 30 * 60 * 1000 });
  }

  /* ---------- вид ---------- */
  const size = ingame ? 40 : 50;
  const style = document.createElement('style');
  style.textContent = `
  .fw-btn, .fw-btn span { all: initial; box-sizing: border-box; }
  .fw-btn { position: fixed !important; z-index: 100001 !important; width: ${size}px !important; height: ${size}px !important; min-width: 0 !important; padding: 0 !important; margin: 0 !important;
    border-radius: 50% !important; border: 1px solid #ffffff3a !important; background: linear-gradient(135deg, #ffd36f, #6fe3ff) !important; cursor: pointer; box-shadow: 0 10px 26px #0009 !important;
    display: grid !important; place-items: center; font: ${ingame ? 19 : 23}px/1 system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif !important; transform: none !important;
    user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; opacity: ${ingame ? '.88' : '1'}; }
  .fw-btn:hover { opacity: 1; }
  .fw-btn span { position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); background: #111321e6; color: #f8f7ff; border-radius: 8px; padding: 1px 5px;
    font: 800 10px/14px Manrope, system-ui, sans-serif; white-space: nowrap; display: block; }
  .fw-panel { position: fixed; z-index: 100002; width: min(360px, calc(100vw - 20px)); max-height: calc(100vh - 24px); overflow-y: auto; background: #17182b; border: 1px solid #ffd36f66;
    border-radius: 22px; box-shadow: 0 30px 80px #000c; font-family: Manrope, system-ui, sans-serif; color: #f8f7ff; text-align: left; line-height: 1.4; user-select: text; -webkit-user-select: text; }
  .fw-panel[hidden] { display: none; }
  .fw-panel button { font-family: inherit; min-width: 0; box-shadow: none; text-shadow: none; transform: none; letter-spacing: 0; }
  .fw-top { padding: 16px 16px 10px; display: flex; align-items: flex-start; gap: 10px; }
  .fw-clock { font-size: 40px; font-weight: 800; letter-spacing: -.04em; font-variant-numeric: tabular-nums; line-height: 1; }
  .fw-clock small { font-size: 20px; color: #89879e; }
  .fw-date { color: #b9b6c9; font-size: 13px; margin-top: 4px; }
  .fw-date::first-letter { text-transform: uppercase; }
  .fw-x { margin-left: auto; width: 32px; height: 32px; flex: none; border-radius: 50%; border: 1px solid #ffffff24; background: none; color: #d1cde5; font-size: 16px; cursor: pointer; padding: 0; }
  .fw-now { display: flex; align-items: center; gap: 12px; padding: 4px 16px 12px; }
  .fw-now .fw-ic { font-size: 46px; line-height: 1; }
  .fw-now b { font-size: 36px; letter-spacing: -.03em; }
  .fw-now small { display: block; color: #b9b6c9; font-size: 13px; }
  .fw-place { display: flex; align-items: center; gap: 6px; padding: 0 16px 10px; font-size: 13px; color: #c9f4ff; font-weight: 700; }
  .fw-place button { border: 1px solid #ffffff24; background: #ffffff0a; color: #f8f7ff; border-radius: 9px; padding: 5px 9px; font-size: 12px; font-weight: 800; cursor: pointer; }
  .fw-facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 0 16px 12px; }
  .fw-facts div { background: #ffffff0a; border-radius: 12px; padding: 8px 10px; font-size: 12px; color: #89879e; }
  .fw-facts b { display: block; color: #f8f7ff; font-size: 15px; }
  .fw-h { padding: 4px 16px 6px; font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: #ffd36f; }
  .fw-hours { display: flex; gap: 6px; overflow-x: auto; padding: 0 16px 12px; }
  .fw-hours div { flex: none; width: 52px; text-align: center; background: #ffffff0a; border-radius: 12px; padding: 7px 0; font-size: 12px; color: #89879e; }
  .fw-hours b { display: block; color: #f8f7ff; font-size: 14px; }
  .fw-hours i { display: block; font-style: normal; font-size: 18px; margin: 2px 0; }
  .fw-days { padding: 0 16px 14px; }
  .fw-days div { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid #ffffff0d; font-size: 14px; }
  .fw-days div:last-child { border-bottom: 0; }
  .fw-days span:first-child { width: 86px; text-transform: capitalize; color: #d1cde5; }
  .fw-days i { font-style: normal; font-size: 18px; width: 26px; text-align: center; }
  .fw-days small { color: #7cc4ff; font-size: 12px; width: 40px; }
  .fw-days b { margin-left: auto; font-variant-numeric: tabular-nums; }
  .fw-days em { color: #89879e; font-style: normal; margin-left: 6px; font-variant-numeric: tabular-nums; }
  .fw-pick { padding: 0 16px 14px; display: flex; flex-direction: column; gap: 8px; }
  .fw-pick input { font: inherit; font-size: 15px; color: #f8f7ff; background: #11122299; border: 1px solid #ffffff24; border-radius: 12px; padding: 10px 12px; box-sizing: border-box; width: 100%; }
  .fw-pick input:focus { outline: 2px solid #ffd36f; outline-offset: 1px; }
  .fw-found { display: flex; flex-direction: column; gap: 4px; }
  .fw-found button { text-align: left; border: 0; background: #ffffff0a; color: #f8f7ff; border-radius: 10px; padding: 8px 10px; font-size: 14px; font-weight: 700; cursor: pointer; }
  .fw-found button:hover { background: #ffffff14; }
  .fw-found small, .fw-muted { display: block; color: #89879e; font-size: 12px; font-weight: 600; }
  .fw-note { padding: 0 16px 14px; font-size: 11px; color: #6f6c86; }
  .fw-err { padding: 0 16px 10px; color: #ffd27a; font-size: 13px; }`;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'fw-btn'; btn.setAttribute('aria-label', 'Погода и время');
  btn.innerHTML = '🌤<span></span>';
  const panel = document.createElement('div');
  panel.className = 'fw-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Погода и время');
  let picking = false;

  // Кнопка стоит прямо над кнопкой чата и ездит вместе с ней, когда ту перетаскивают.
  function place2() {
    const chat = document.querySelector('.fc-btn');
    if (chat && chat.isConnected) {
      const r = chat.getBoundingClientRect();
      btn.style.left = (r.left + (r.width - size) / 2) + 'px';
      btn.style.top = Math.max(6, r.top - size - 12) + 'px';
    } else { btn.style.left = (innerWidth - size - 18) + 'px'; btn.style.top = (innerHeight - size * 2 - 40) + 'px'; }
    if (!panel.hidden) placePanel();
  }
  function placePanel() {
    const r = btn.getBoundingClientRect(), w = Math.min(360, innerWidth - 20), h = Math.min(panel.scrollHeight || 560, innerHeight - 24);
    let left = r.right - w, top = r.top - h - 10;
    if (top < 12) top = Math.min(r.bottom + 10, innerHeight - h - 12);
    if (top < 12) top = 12;
    left = Math.max(10, Math.min(left, innerWidth - w - 10));
    panel.style.left = left + 'px'; panel.style.top = top + 'px';
  }
  const mount = () => {
    document.body.append(btn, panel); place2();
    const chat = document.querySelector('.fc-btn');
    if (chat) new MutationObserver(place2).observe(chat, { attributes: true, attributeFilter: ['style'] });
  };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  addEventListener('resize', place2);
  setInterval(place2, 1500); // чат может появиться чуть позже

  function toggle(force) {
    panel.hidden = force === undefined ? !panel.hidden : !force;
    if (!panel.hidden) {
      if (document.pointerLockElement) document.exitPointerLock();
      if (window.__freasyChat && window.__freasyChat.isOpen()) window.__freasyChat.close();
      load(false);
    }
    render();
  }
  for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'keyup']) { btn.addEventListener(ev, (e) => e.stopPropagation()); panel.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }); }
  btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });

  // Время и дата — в часовом поясе выбранного города.
  const tz = () => (data && data.timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fmt = (d, o) => { try { return new Intl.DateTimeFormat('ru-RU', { timeZone: tz(), ...o }).format(d); } catch { return new Intl.DateTimeFormat('ru-RU', o).format(d); } };
  const hm = (iso) => iso ? iso.slice(11, 16) : '';
  function clock() {
    const now = new Date();
    const c = panel.querySelector('.fw-clock');
    if (c) c.innerHTML = `${fmt(now, { hour: '2-digit', minute: '2-digit' })}<small>:${fmt(now, { second: '2-digit' }).padStart(2, '0')}</small>`;
    const s = btn.querySelector('span');
    const temp = data && data.current ? deg(data.current.temperature_2m) : '';
    const label = temp || fmt(now, { hour: '2-digit', minute: '2-digit' });
    if (s.textContent !== label) s.textContent = label;
    if (data && data.current) { const ic = info(data.current.weather_code, data.current.is_day).icon; if (btn.firstChild.textContent !== ic) btn.firstChild.textContent = ic; }
  }
  setInterval(clock, 1000);

  function render() {
    const now = new Date();
    let html = `<div class="fw-top"><div><div class="fw-clock"></div><div class="fw-date">${esc(fmt(now, { weekday: 'long', day: 'numeric', month: 'long' }))}</div></div><button class="fw-x" type="button" data-a="close" aria-label="Закрыть">×</button></div>`;
    html += `<div class="fw-place">📍 ${esc(place.name)}${place.country ? ', ' + esc(place.country) : ''}<button type="button" data-a="pick">Сменить</button><button type="button" data-a="locate" title="Определить моё место">📍</button></div>`;
    if (picking) html += `<div class="fw-pick"><input class="fw-q" placeholder="Город…" maxlength="60" autocomplete="off"><div class="fw-found"></div></div>`;
    if (error) html += `<div class="fw-err">${esc(error)}</div>`;
    if (loading && !data) html += '<div class="fw-note">Загружаем погоду…</div>';
    if (data && data.current) {
      const cur = data.current, ci = info(cur.weather_code, cur.is_day), d = data.daily;
      html += `<div class="fw-now"><span class="fw-ic">${ci.icon}</span><div><b>${deg(cur.temperature_2m)}</b><small>${esc(ci.text)} · ощущается ${deg(cur.apparent_temperature)}</small></div></div>`;
      html += `<div class="fw-facts"><div>Ветер<b>${Math.round(cur.wind_speed_10m)} м/с</b></div><div>Влажность<b>${Math.round(cur.relative_humidity_2m)}%</b></div><div>Сегодня<b>${deg(d.temperature_2m_min[0])}…${deg(d.temperature_2m_max[0])}</b></div>
        <div>Восход<b>${hm(d.sunrise[0])}</b></div><div>Закат<b>${hm(d.sunset[0])}</b></div><div>Осадки<b>${d.precipitation_probability_max ? (d.precipitation_probability_max[0] ?? 0) + '%' : '—'}</b></div></div>`;
      // по часам: следующие 12 часов
      const h = data.hourly, start = Math.max(0, h.time.findIndex((t) => t >= cur.time.slice(0, 13)));
      html += '<div class="fw-h">По часам</div><div class="fw-hours">' + h.time.slice(start, start + 12).map((t, i) => {
        const k = start + i, hi = info(h.weather_code[k], h.is_day ? h.is_day[k] : 1);
        return `<div>${i ? hm(t) : 'Сейчас'}<i>${hi.icon}</i><b>${deg(h.temperature_2m[k])}</b>${h.precipitation_probability && h.precipitation_probability[k] >= 30 ? `<small style="color:#7cc4ff">${h.precipitation_probability[k]}%</small>` : ''}</div>`;
      }).join('') + '</div>';
      html += '<div class="fw-h">5 дней</div><div class="fw-days">' + d.time.slice(1, 6).map((t, i) => {
        const k = i + 1, di = info(d.weather_code[k]);
        const day = new Date(t + 'T12:00:00');
        return `<div><span>${i === 0 ? 'Завтра' : esc(new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric' }).format(day))}</span><i title="${esc(di.text)}">${di.icon}</i><small>${d.precipitation_probability_max && d.precipitation_probability_max[k] >= 30 ? d.precipitation_probability_max[k] + '%' : ''}</small><b>${deg(d.temperature_2m_max[k])}</b><em>${deg(d.temperature_2m_min[k])}</em></div>`;
      }).join('') + '</div>';
    }
    html += '<div class="fw-note">Погода: Open-Meteo. Город хранится только в этом браузере.</div>';
    const q = panel.querySelector('.fw-q'), qv = q ? q.value : '', qf = q && document.activeElement === q;
    panel.innerHTML = html;
    const nq = panel.querySelector('.fw-q');
    if (nq) { nq.value = qv; if (qf || picking) nq.focus(); if (qv) search(qv); }
    clock();
    if (!panel.hidden) placePanel();
  }
  let searchT = 0;
  panel.addEventListener('input', (e) => { if (e.target.classList.contains('fw-q')) { clearTimeout(searchT); const v = e.target.value.trim(); searchT = setTimeout(() => search(v), 300); } });
  panel.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'close') toggle(false);
    else if (a === 'pick') { picking = !picking; render(); }
    else if (a === 'locate') locate();
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) toggle(false); });
  // Погода сама обновляется раз в 20 минут, пока страница открыта.
  setInterval(() => { if (!document.hidden) load(true); }, 20 * 60 * 1000);
  load(false);
  render();
  window.__freasyWeather = { open: () => toggle(true), close: () => toggle(false), isOpen: () => !panel.hidden };
  return window.__freasyWeather;
};
