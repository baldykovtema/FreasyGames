'use strict';
// Тема оформления FreasyGames (каталоги 2D и 3D, настройки, приложение).
// Подключается в <head> сразу после session.js: <script src="shared/theme.js"></script>
// Тема хранится на этом устройстве в localStorage «freasy-theme»; выбирается на странице «Настройки» (settings/).
//
// Тема = 6 основных цветов + (необязательно) картинка на фоне. Остальные оттенки (рамки, подсветка, подписи)
// вычисляются из основных, поэтому любая тема, в том числе светлая, остаётся читаемой.
// Страницы используют переменные --bg, --card, --accent… а общие скрипты (account.js и др.) — --fg-bg, --fg-card…
// чтобы переменные игр с такими же именами не мешали.
(() => {
  const KEY = 'freasy-theme';
  const PRESETS = {
    night:  { name: 'Фиолетовая ночь', bg: '#111321', card: '#1d1e31', accent: '#bca0ff', accent2: '#6fe3ff', text: '#f8f7ff', muted: '#aaa8bb' },
    ocean:  { name: 'Океан',           bg: '#07182a', card: '#0f2740', accent: '#4fd1ff', accent2: '#5df2a5', text: '#eef8ff', muted: '#9bb6cc' },
    sunset: { name: 'Закат',           bg: '#1f0f1a', card: '#30182a', accent: '#ff8a5c', accent2: '#ffd23f', text: '#fff4ee', muted: '#c9a9b4' },
    forest: { name: 'Лес',             bg: '#0e1a12', card: '#17291d', accent: '#7ed957', accent2: '#ffd36f', text: '#f1fbef', muted: '#a3bba6' },
    candy:  { name: 'Конфета',         bg: '#2a1036', card: '#3a1a4a', accent: '#ff7eb6', accent2: '#7ef9ff', text: '#fff0fa', muted: '#d3a9c8' },
    neon:   { name: 'Неон',            bg: '#050507', card: '#111118', accent: '#39ff88', accent2: '#ff2bd6', text: '#f5fff8', muted: '#8f9a93' },
    light:  { name: 'Светлая',         bg: '#f1f0fa', card: '#ffffff', accent: '#6b4dff', accent2: '#0a9ec2', text: '#1b1830', muted: '#5f5b78' },
    sand:   { name: 'Песок',           bg: '#f5ecdd', card: '#fffaf2', accent: '#d9622b', accent2: '#2b8a7e', text: '#2a1d12', muted: '#76624f' },
  };
  const COLOR_KEYS = ['bg', 'card', 'accent', 'accent2', 'text', 'muted'];

  // ---------- цвета ----------
  const hex = (c) => {
    c = String(c || '').trim().toLowerCase();
    if (/^#[0-9a-f]{3}$/.test(c)) c = '#' + c.slice(1).split('').map((x) => x + x).join('');
    return /^#[0-9a-f]{6}$/.test(c) ? c : null;
  };
  const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const toHex = (a, alpha) => '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
    + (alpha === undefined ? '' : Math.round(alpha * 255).toString(16).padStart(2, '0'));
  const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
  const alpha = (c, a) => toHex(rgb(c), a);
  const lum = (c) => { const [r, g, b] = rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

  function derive(c) {
    const light = lum(c.bg) > 0.4;
    const ink = light ? '#000000' : '#ffffff';
    return {
      bg: c.bg, 'bg-2': mix(c.bg, c.card, 0.5), glow: mix(c.bg, c.accent, light ? 0.18 : 0.3),
      card: c.card, 'card-a': alpha(c.card, 0.9), shot: mix(c.card, c.bg, 0.55), offer: mix(c.card, c.accent, 0.14),
      accent: c.accent, 'accent-hi': mix(c.accent, light ? '#000000' : '#ffffff', 0.3), 'accent-deep': mix(c.accent, '#000000', 0.35),
      'accent-a': alpha(c.accent, 0.5), 'accent-line': alpha(c.accent, 0.33), 'accent-soft': alpha(c.accent, 0.1), 'accent-shadow': alpha(c.accent, 0.25),
      'accent-2': c.accent2, 'accent2-hi': mix(c.accent2, light ? '#000000' : '#ffffff', 0.55), 'accent2-line': alpha(c.accent2, 0.4), 'accent2-soft': alpha(c.accent2, 0.1),
      'on-accent': lum(c.accent) > 0.36 ? '#15121f' : '#ffffff',
      text: c.text, soft: mix(c.text, c.muted, 0.45), muted: c.muted, dim: mix(c.muted, c.bg, 0.25),
      line: alpha(ink, light ? 0.1 : 0.09), 'line-2': alpha(ink, light ? 0.18 : 0.19), hover: alpha(ink, light ? 0.05 : 0.08),
      'label-bg': alpha(c.bg, 0.85), 'veil-1': alpha(c.bg, 0.53), 'veil-2': alpha(c.bg, 0.93),
      scheme: light ? 'light' : 'dark',
    };
  }

  // ---------- хранение ----------
  function clean(t) {
    if (!t || typeof t !== 'object') return null;
    const base = PRESETS[t.preset] || PRESETS.night;
    const colors = {};
    for (const k of COLOR_KEYS) colors[k] = hex(t.colors && t.colors[k]) || base[k];
    const img = typeof t.wallpaper === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(t.wallpaper) ? t.wallpaper : null;
    const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
    return {
      v: 1, preset: PRESETS[t.preset] ? t.preset : 'custom', base: PRESETS[t.base] ? t.base : PRESETS[t.preset] ? t.preset : 'night', name: String(t.name || '').slice(0, 40), colors,
      wallpaper: img, dim: num(t.dim, 0, 0.95, 0.45), cards: num(t.cards, 0.3, 1, 0.85), blur: num(t.blur, 0, 20, 8),
    };
  }
  function load() { try { return clean(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return null; } }

  // ---------- применение ----------
  const root = document.documentElement;
  let styleEl = null;
  const WALL_CSS = `
  html.fg-wall { background: var(--bg) !important; }
  html.fg-wall body { background: transparent !important; }
  html.fg-wall body::before { content: ""; position: fixed; inset: 0; z-index: -1; pointer-events: none;
    background: linear-gradient(var(--fg-wall-dim), var(--fg-wall-dim)), var(--fg-wall) center / cover no-repeat; }
  html.fg-wall #scene, html.fg-wall .veil { display: none !important; }
  html.fg-wall .card, html.fg-wall .slot, html.fg-wall .panel { background: var(--fg-wall-card) !important;
    backdrop-filter: blur(var(--fg-wall-blur)); -webkit-backdrop-filter: blur(var(--fg-wall-blur)); }
  html.fg-wall .shot::after { background: linear-gradient(transparent, var(--fg-wall-card)) !important; }`;

  function apply(t) {
    t = t === undefined ? load() : clean(t);
    const s = root.style;
    // сначала снимаем прошлую тему
    for (let i = s.length - 1; i >= 0; i--) { const p = s[i]; if (p.startsWith('--')) s.removeProperty(p); }
    root.classList.remove('fg-wall', 'fg-themed');
    s.removeProperty('color-scheme');
    if (!t) { setMeta(null); return null; }
    const d = derive(t.colors);
    for (const [k, v] of Object.entries(d)) { if (k === 'scheme') continue; s.setProperty('--' + k, v); s.setProperty('--fg-' + k, v); }
    s.setProperty('color-scheme', d.scheme);
    root.classList.add('fg-themed');
    if (t.wallpaper) {
      s.setProperty('--fg-wall', `url("${t.wallpaper}")`);
      s.setProperty('--fg-wall-dim', alpha(t.colors.bg, t.dim));
      s.setProperty('--fg-wall-card', alpha(t.colors.card, t.cards));
      s.setProperty('--fg-wall-blur', t.blur + 'px');
      root.classList.add('fg-wall');
    }
    if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'fg-theme-css'; styleEl.textContent = WALL_CSS; (document.head || root).appendChild(styleEl); }
    setMeta(t.colors.bg);
    return t;
  }
  function setMeta(color) {
    const m = document.querySelector('meta[name="theme-color"]');
    if (!m) return;
    if (!m.dataset.fgDefault) m.dataset.fgDefault = m.content;
    m.content = color || m.dataset.fgDefault;
  }

  function save(t) {
    const c = clean(t);
    try { localStorage.setItem(KEY, JSON.stringify(c)); }
    catch { throw new Error('Не хватает места на устройстве для такой большой картинки. Попробуй другую или поменьше.'); }
    apply(c);
    return c;
  }
  function reset() { try { localStorage.removeItem(KEY); } catch {} apply(null); }

  apply();
  // тема поменялась в другой вкладке (например, в настройках) — обновляемся сразу
  addEventListener('storage', (e) => { if (e.key === KEY) apply(); });

  window.FreasyTheme = { PRESETS, COLOR_KEYS, get: load, save, reset, apply, clean, derive, hex, mix, lum };
})();
