'use strict';
// Клипы FreasyGames: кнопка «🎬 Клип» в каждой игре записывает до 30 секунд игры.
// Подключается в <head> игры сразу после session.js: <script src="../shared/clips.js"></script>
// (в <head> — чтобы успеть перехватить звук игры: всё, что игра подключает к динамикам, идёт и в запись).
// Запись хранится на этом устройстве (IndexedDB «freasy-clips») и появляется в «Клипы → Мои записи»,
// где её можно подписать и опубликовать.
(() => {
  if (window.FreasyClips) return;
  const MAX = 30, DB = 'freasy-clips';
  const me = document.currentScript;
  const base = me ? me.src.replace(/clips\.js.*$/, '') : '../shared/';
  const CLIPS_URL = new URL('../clips/#mine', base).href;

  // ---------- база записей (общая для всех игр и страницы «Клипы») ----------
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('recs', { keyPath: 'id' });
    r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error);
  }));
  const tx = async (mode, fn) => { const d = await db(); return new Promise((ok, fail) => { const t = d.transaction('recs', mode); const r = fn(t.objectStore('recs')); t.oncomplete = () => ok(r && r.result); t.onerror = () => fail(t.error); }); };
  const store = {
    put: (rec) => tx('readwrite', (s) => s.put(rec)),
    all: async () => (await tx('readonly', (s) => s.getAll())).sort((a, b) => b.created - a.created),
    get: (id) => tx('readonly', (s) => s.get(id)),
    del: (id) => tx('readwrite', (s) => s.delete(id)),
  };

  // ---------- звук игры ----------
  // Всё, что игра подключает к динамикам, параллельно подключаем к «магнитофону» этого AudioContext.
  const taps = new Map();
  const connect0 = window.AudioNode && AudioNode.prototype.connect;
  const tapOf = (ctx) => {
    if (!taps.has(ctx)) {
      try {
        const t = ctx.createMediaStreamDestination();
        // тихий постоянный сигнал: без него дорожка «молчит» и запись в Chrome может не начаться
        const k = ctx.createConstantSource(), g = ctx.createGain(); g.gain.value = 0;
        connect0.call(k, g); connect0.call(g, t); k.start();
        taps.set(ctx, t);
      } catch { taps.set(ctx, null); }
    }
    return taps.get(ctx);
  };
  if (window.AudioNode && AudioNode.prototype.connect) {
    const orig = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (dest, ...rest) {
      const res = orig.call(this, dest, ...rest);
      try { if (dest instanceof AudioDestinationNode) { const t = tapOf(dest.context); if (t) orig.call(this, t); } } catch {}
      return res;
    };
  }

  window.FreasyClips = { store, MAX };
  // На страницах каталога (и самой странице «Клипы») кнопка не нужна — там только база записей.
  if (me && me.dataset.catalog !== undefined) return;

  // ---------- что записывать ----------
  function bigCanvas() {
    let best = null, area = 0;
    for (const c of document.querySelectorAll('canvas')) {
      const r = c.getBoundingClientRect();
      const a = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
      if (a > area && c.width > 50 && c.height > 50 && getComputedStyle(c).visibility !== 'hidden') { best = c; area = a; }
    }
    return area > innerWidth * innerHeight * 0.15 ? best : null;
  }
  function pickMime(audio) {
    const list = audio
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1,mp4a', 'video/mp4']
      : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4;codecs=avc1', 'video/mp4'];
    return list.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
  }
  const gameId = () => {
    const parts = location.pathname.split('/').filter(Boolean);
    const at = parts.indexOf('FreasyGames3D');
    const folder = at >= 0 ? parts[at + 1] : parts[parts.length - (/\.html?$/.test(parts[parts.length - 1] || '') ? 2 : 1)];
    return ((at >= 0 ? '3d-' : '') + (folder || 'game')).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  };
  // адрес игры относительно корня сайта (папка над shared/), например «prygun/» или «FreasyGames3D/kubomir/»
  const gameUrl = () => { const root = new URL('../', base).pathname; const p = location.pathname.replace(/index\.html?$/, ''); return p.startsWith(root) ? p.slice(root.length) : ''; };
  const gameTitle = () => (document.title || 'Игра').split(/\s+[—–|-]\s+/)[0].trim().slice(0, 60);

  // ---------- кнопка ----------
  const css = document.createElement('style');
  css.textContent = `
  .fgc-btn { position: fixed; z-index: 100005; display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 13px; border-radius: 100px;
    font: 800 13px Manrope, system-ui, -apple-system, sans-serif; color: #fff; background: #111321d9; border: 1px solid #ffffff38; cursor: pointer;
    backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); box-shadow: 0 4px 16px #0006; touch-action: none; user-select: none; -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent; white-space: nowrap; }
  .fgc-btn:hover { background: #1d1e31ee; }
  .fgc-btn.rec { background: #e5304ee6; border-color: #ff8fa0; }
  .fgc-btn .dot { width: 10px; height: 10px; border-radius: 50%; background: #ff4d6d; box-shadow: 0 0 8px #ff4d6d; }
  .fgc-btn.rec .dot { background: #fff; box-shadow: none; animation: fgc-blink 1s steps(2) infinite; }
  .fgc-btn .bar { width: 46px; height: 5px; border-radius: 3px; background: #ffffff40; overflow: hidden; display: none; }
  .fgc-btn.rec .bar { display: block; }
  .fgc-btn .bar i { display: block; height: 100%; width: 0; background: #fff; }
  @keyframes fgc-blink { 50% { opacity: .25; } }
  .fgc-toast { position: fixed; z-index: 100006; left: 50%; bottom: 22px; transform: translateX(-50%); max-width: min(440px, calc(100vw - 24px));
    display: flex; align-items: center; gap: 10px; padding: 11px 12px 11px 15px; border-radius: 14px; background: #1d1e31; border: 1px solid #b79aff80;
    color: #f8f7ff; font: 700 13px/1.4 Manrope, system-ui, sans-serif; box-shadow: 0 14px 40px #000a; }
  .fgc-toast a { flex: none; color: #171225; background: #bca0ff; padding: 8px 11px; border-radius: 10px; text-decoration: none; font-weight: 800; }
  .fgc-toast button { flex: none; background: none; border: 0; color: #aaa8bb; font-size: 18px; cursor: pointer; padding: 0 4px; }`;
  document.head.appendChild(css);

  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'fgc-btn';
  btn.innerHTML = '<span class="dot"></span><span class="lbl">Клип</span><span class="bar"><i></i></span>';
  btn.title = 'Записать клип — до 30 секунд игры';
  btn.setAttribute('aria-label', 'Записать клип');
  const lbl = btn.querySelector('.lbl'), barI = btn.querySelector('.bar i');

  // Кнопку можно перетащить, если она закрывает что-то в игре; место запоминается для каждой игры.
  const POS_KEY = 'freasy-clip-pos:' + gameId();
  function place(x, y) {
    const w = btn.offsetWidth || 90, h = btn.offsetHeight || 40;
    x = Math.max(6, Math.min(innerWidth - w - 6, x)); y = Math.max(6, Math.min(innerHeight - h - 6, y));
    btn.style.left = x + 'px'; btn.style.top = y + 'px'; btn.style.right = 'auto';
    return [x, y];
  }
  function placeSaved() {
    let p = null; try { p = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); } catch {}
    if (p) return place(p[0] * innerWidth, p[1] * innerHeight);
    // By default the button stands at the right edge just above the weather and chat buttons, so it never covers them.
    const w = btn.offsetWidth || 90, h = btn.offsetHeight || 40, above = document.querySelector('.fw-btn') || document.querySelector('.fc-btn');
    const r = above && above.isConnected ? above.getBoundingClientRect() : null;
    place(innerWidth - w - 10, r && r.height ? r.top - h - 12 : Math.round(innerHeight * 0.38));
  }
  let drag = null;
  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    const r = btn.getBoundingClientRect();
    drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, moved: false };
    try { btn.setPointerCapture(e.pointerId); } catch {}
  });
  btn.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 8) return;
    drag.moved = true; place(e.clientX - drag.dx, e.clientY - drag.dy);
  });
  btn.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved; drag = null;
    if (moved) { const r = btn.getBoundingClientRect(); try { localStorage.setItem(POS_KEY, JSON.stringify([r.left / innerWidth, r.top / innerHeight])); } catch {} return; }
    rec ? stop() : start();
  });
  btn.addEventListener('pointercancel', () => { drag = null; });
  // клавиши и касания по кнопке не должны доходить до игры
  for (const k of ['touchstart', 'mousedown', 'click', 'keydown', 'keyup']) btn.addEventListener(k, (e) => {
    e.stopPropagation();
    if (k === 'click') e.preventDefault();
    if (k === 'keydown' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); if (!e.repeat) (rec ? stop() : start()); }
  });
  addEventListener('resize', placeSaved);

  // ---------- запись ----------
  let rec = null;
  async function start() {
    if (!window.MediaRecorder) return toast('Этот браузер не умеет записывать видео. Попробуй Chrome, Edge или Firefox.');
    let stream = null, displayMedia = null, canvas = bigCanvas();
    if (canvas && canvas.captureStream) {
      try { stream = canvas.captureStream(30); } catch { stream = null; }
    }
    if (!stream) {
      // игра без большого холста (кнопки и картинки) — записываем вкладку
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return toast('В этой игре запись работает только на компьютере.');
      try {
        displayMedia = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30, displaySurface: 'browser' }, audio: true, preferCurrentTab: true, selfBrowserSurface: 'include' });
        stream = displayMedia;
      } catch { return toast('Запись отменена'); }
    }
    const tracks = [...stream.getVideoTracks()];
    let audio = stream.getAudioTracks()[0];
    if (!audio) for (const [ctx, t] of taps) { if (t && ctx.state === 'running' && t.stream.getAudioTracks()[0]) { audio = t.stream.getAudioTracks()[0]; break; } }
    if (audio) tracks.push(audio);
    const mixed = new MediaStream(tracks);
    let mime = pickMime(!!audio);
    let mr;
    try { mr = new MediaRecorder(mixed, { mimeType: mime || undefined, videoBitsPerSecond: 1500000, audioBitsPerSecond: 64000 }); }
    catch { try { mr = new MediaRecorder(new MediaStream(stream.getVideoTracks()), { mimeType: pickMime(false) || undefined, videoBitsPerSecond: 1500000 }); } catch { return toast('Не получилось начать запись в этом браузере.'); } }
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const t0 = performance.now();
    const r = rec = { mr, chunks, t0, canvas, displayMedia, timer: 0, thumb: null, keep: 0 };
    // игра может стоять на месте (меню, головоломка) — всё равно берём кадр 4 раза в секунду, чтобы видео не было пустым
    const vt = !displayMedia && stream.getVideoTracks()[0];
    if (vt && vt.requestFrame) r.keep = setInterval(() => { try { vt.requestFrame(); } catch {} }, 250);
    mr.onstop = () => finish(r);
    mr.start(1000);
    // если за 2,5 с запись не дала ни кусочка (бывает со звуком), продолжаем без звука
    if (audio) setTimeout(() => {
      if (rec !== r || chunks.length) return;
      try {
        r.mr.onstop = null; r.mr.stop();
        const m2 = new MediaRecorder(new MediaStream(stream.getVideoTracks()), { mimeType: pickMime(false) || undefined, videoBitsPerSecond: 1500000 });
        m2.ondataavailable = mr.ondataavailable; m2.onstop = () => finish(r); r.mr = m2; chunks.length = 0; m2.start(1000);
      } catch {}
    }, 2500);
    if (displayMedia) displayMedia.getVideoTracks()[0].addEventListener('ended', () => stop());
    btn.classList.add('rec');
    const tick = () => {
      if (!rec) return;
      const s = (performance.now() - t0) / 1000;
      lbl.textContent = `0:${String(Math.min(MAX, Math.floor(s))).padStart(2, '0')} ■`;
      barI.style.width = Math.min(100, (s / MAX) * 100) + '%';
      if (!rec.thumb && s > 1.2) rec.thumb = snapshot(canvas);
      if (s >= MAX) stop(); else rec.timer = setTimeout(tick, 200);
    };
    tick();
    btn.setAttribute('aria-label', 'Остановить запись');
  }
  function stop() {
    if (!rec) return;
    clearTimeout(rec.timer);
    if (!rec.thumb) rec.thumb = snapshot(rec.canvas);
    rec.dur = Math.min(MAX, (performance.now() - rec.t0) / 1000);
    try { rec.mr.requestData(); } catch {}
    try { rec.mr.stop(); } catch { finish(rec); }
  }
  async function finish(r) {
    if (!r || r.saved) return; r.saved = true;
    clearInterval(r.keep);
    if (r.displayMedia) r.displayMedia.getTracks().forEach((t) => t.stop());
    rec = null;
    btn.classList.remove('rec'); lbl.textContent = 'Клип'; barI.style.width = '0'; btn.setAttribute('aria-label', 'Записать клип');
    const dur = r.dur || Math.min(MAX, (performance.now() - r.t0) / 1000);
    if (dur < 1 || !r.chunks.length) return toast('Клип слишком короткий — запиши хотя бы секунду');
    const type = (r.mr.mimeType || r.chunks[0].type || 'video/webm').split(';')[0];
    const blob = new Blob(r.chunks, { type });
    const thumb = r.thumb || (await thumbFromBlob(blob));
    const s = window.FreasySession && window.FreasySession.get();
    const item = { id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), created: Date.now(), blob, type, dur: Math.round(dur * 10) / 10,
      game: gameId(), gameTitle: gameTitle(), gameUrl: gameUrl(), thumb, user: s && s.user && s.user.id || null };
    try { await store.put(item); toast(`Клип ${Math.round(dur)} с сохранён в «Мои записи»`, true); }
    catch { toast('Не хватило места на устройстве, чтобы сохранить клип'); }
  }
  function snapshot(canvas) {
    try {
      if (!canvas) return null;
      const k = Math.min(1, 360 / Math.max(canvas.width, canvas.height));
      const c = document.createElement('canvas'); c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k);
      c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.75);
      return url.length > 2000 ? url : null; // пустой кадр WebGL — сделаем картинку из видео
    } catch { return null; }
  }
  function thumbFromBlob(blob) {
    return new Promise((ok) => {
      const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.src = URL.createObjectURL(blob);
      const done = (x) => { URL.revokeObjectURL(v.src); ok(x); };
      v.onloadeddata = () => { try { v.currentTime = 0.5; } catch { done(null); } };
      v.onseeked = () => { const k = Math.min(1, 360 / Math.max(v.videoWidth, v.videoHeight)); const c = document.createElement('canvas'); c.width = v.videoWidth * k; c.height = v.videoHeight * k; c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); done(c.toDataURL('image/jpeg', 0.75)); };
      v.onerror = () => done(null); setTimeout(() => done(null), 4000);
    });
  }

  let toastEl = null, toastTimer = 0;
  function toast(text, link) {
    if (!toastEl) {
      toastEl = document.createElement('div'); toastEl.className = 'fgc-toast'; toastEl.setAttribute('role', 'status');
      for (const k of ['pointerdown', 'touchstart', 'mousedown', 'keydown']) toastEl.addEventListener(k, (e) => e.stopPropagation());
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML = '';
    const span = document.createElement('span'); span.textContent = text; toastEl.appendChild(span);
    if (link) { const a = document.createElement('a'); a.href = CLIPS_URL; a.target = '_blank'; a.rel = 'noopener'; a.textContent = '🎬 Открыть'; toastEl.appendChild(a); }
    const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Закрыть'); x.onclick = () => { toastEl.hidden = true; }; toastEl.appendChild(x);
    toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 6000);
  }

  // The chat and weather buttons appear a moment later: stand clear of them once they are there.
  const add = () => { document.body.appendChild(btn); placeSaved(); setTimeout(placeSaved, 1500); setTimeout(placeSaved, 5000); };
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
})();
