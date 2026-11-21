'use strict';
// Special effects and extra sounds for every FreasyGames game (2D and 3D).
//
// <script src="../shared/fx.js" data-mute="zmey-muted"></script>     (3D games: ../../shared/fx.js)
//   data-mute — the game's localStorage key for "sound off" ('1' = muted); FX sounds stay silent then.
//
// Coordinates: every effect takes SCREEN (client) coordinates. To convert:
//   FX.bind(canvas, w, h)      — the game draws on `canvas` in a w×h logical space (omit w,h = CSS pixels)
//   FX.g(x, y)                 → [sx, sy] screen point of a game point
//   FX.bind3(camera, dom)      — three.js camera and renderer.domElement
//   FX.g3(vec3)                → [sx, sy] screen point of a 3D point
//   FX.mid()                   → centre of the bound element (or the window)
//
// Effects:  FX.burst(x, y, {color, n, speed, size, gravity, shape:'dot'|'star'|'square'|'spark'})
//           FX.sparkle(x, y, color)  FX.ring(x, y, color)  FX.text(x, y, '+10', color)
//           FX.confetti(n)  FX.flash(color, alpha)  FX.shake(power)  FX.explode(x, y, color)
// Sounds:   FX.sfx('click'|'coin'|'pop'|'hit'|'boom'|'whoosh'|'zap'|'power'|'win'|'lose'|'levelup'|
//                  'splash'|'jump'|'tick'|'record'|'combo'|'swoosh'|'thud'|'bling', arg)
// Combos:   FX.good(x, y, color)  — sparkle + coin;  FX.bad()  — shake + red flash + hit
//           FX.win()  — confetti + fanfare;           FX.over() — shake + flash + sad tune
(() => {
  const me = document.currentScript;
  const muteKey = me && me.dataset.mute;
  const reduce = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
  const muted = () => {
    if (typeof FX.muted === 'function' ? FX.muted() : FX.muted) return true;
    if (!muteKey) return false;
    try { const v = localStorage.getItem(muteKey); return v === '1' || v === 'true'; } catch { return false; }
  };

  // ---------- audio ----------
  let ac = null, master = null, noiseBuf = null;
  function ctx() {
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain(); master.gain.value = 0.55;
        const comp = ac.createDynamicsCompressor();
        master.connect(comp).connect(ac.destination);
        noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch { ac = null; }
    }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  }
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, () => ctx(), { passive: true, capture: true });

  function osc(f, dur, type = 'sine', vol = 0.2, slide = 1, delay = 0) {
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(dur, vol = 0.2, filter = 'lowpass', f0 = 1200, f1 = f0, delay = 0, q = 0.8) {
    const t = ac.currentTime + delay, s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; s.loop = true;
    fl.type = filter; fl.Q.value = q; fl.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
  }
  const notes = (list, step, type, vol, dur) => list.forEach((f, i) => osc(f, dur, type, vol, 1, i * step));
  let lastSfx = {};
  const SFX = {
    click: () => osc(1800, 0.03, 'square', 0.04, 0.5),
    tick: () => osc(2400, 0.02, 'sine', 0.05),
    coin: () => { osc(988, 0.07, 'square', 0.07); osc(1319, 0.18, 'square', 0.07, 1, 0.06); },
    bling: () => { osc(1568, 0.25, 'triangle', 0.09); osc(2093, 0.3, 'sine', 0.05, 1, 0.04); },
    pop: () => { osc(420, 0.08, 'sine', 0.18, 2.6); noise(0.03, 0.06, 'highpass', 3000); },
    combo: (n = 1) => { const f = 520 * Math.pow(2, Math.min(n, 12) / 12); osc(f, 0.1, 'square', 0.06); osc(f * 1.5, 0.16, 'triangle', 0.08, 1, 0.05); },
    hit: () => { noise(0.12, 0.25, 'lowpass', 1800, 300); osc(140, 0.12, 'sine', 0.25, 0.5); },
    thud: () => { osc(90, 0.18, 'sine', 0.3, 0.5); noise(0.06, 0.12, 'lowpass', 600); },
    boom: () => { noise(0.7, 0.45, 'lowpass', 2200, 80); osc(70, 0.6, 'sine', 0.4, 0.4); osc(45, 0.8, 'triangle', 0.2, 0.6, 0.02); },
    whoosh: () => noise(0.3, 0.14, 'bandpass', 400, 2600, 0, 1.4),
    swoosh: () => noise(0.22, 0.12, 'bandpass', 2400, 500, 0, 1.6),
    zap: () => { osc(1400, 0.18, 'sawtooth', 0.07, 0.15); noise(0.08, 0.06, 'highpass', 4000); },
    jump: () => osc(300, 0.15, 'square', 0.06, 2.2),
    splash: () => { noise(0.45, 0.22, 'highpass', 900, 300); noise(0.2, 0.1, 'bandpass', 2500, 800, 0.05, 2); },
    power: () => notes([392, 523, 659, 784, 1047], 0.05, 'square', 0.05, 0.12),
    levelup: () => { notes([523, 659, 784, 1047], 0.07, 'triangle', 0.12, 0.16); osc(1568, 0.4, 'sine', 0.06, 1, 0.28); },
    win: () => { notes([523, 659, 784], 0.1, 'triangle', 0.13, 0.2); [1047, 1319, 1568].forEach((f) => osc(f, 0.7, 'triangle', 0.07, 1, 0.32)); noise(0.5, 0.04, 'highpass', 6000, 6000, 0.32); },
    record: () => { notes([523, 659, 784, 1047, 1319], 0.08, 'square', 0.06, 0.18); [784, 1047, 1319, 1568].forEach((f) => osc(f, 0.9, 'triangle', 0.06, 1, 0.42)); },
    lose: () => { notes([494, 440, 392], 0.16, 'triangle', 0.12, 0.22); osc(330, 0.7, 'triangle', 0.12, 0.7, 0.48); },
  };
  function sfx(name, arg) {
    if (muted() || !SFX[name] || !ctx()) return;
    const now = performance.now();
    if (now - (lastSfx[name] || 0) < 35) return; // the same sound many times in one frame is just noise
    lastSfx[name] = now;
    try { SFX[name](arg); } catch { /* audio is optional */ }
  }

  // ---------- overlay ----------
  let cv = null, c2 = null, dpr = 1, raf = 0, last = 0;
  const parts = [], texts = [], rings = [];
  function overlay() {
    if (cv) return true;
    if (!document.body) return false;
    cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:99990';
    document.body.appendChild(cv);
    c2 = cv.getContext('2d');
    size(); addEventListener('resize', size);
    return true;
  }
  function size() {
    if (!cv) return;
    dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
  }
  function run() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, cv.width, cv.height);
    c2.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (flashA > 0) { c2.globalAlpha = flashA; c2.fillStyle = flashC; c2.fillRect(0, 0, innerWidth, innerHeight); flashA = Math.max(0, flashA - dt * 2.6); }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.t += dt; const k = r.t / r.life;
      if (k >= 1) { rings.splice(i, 1); continue; }
      c2.globalAlpha = 1 - k; c2.strokeStyle = r.color; c2.lineWidth = 4 * (1 - k) + 1;
      c2.beginPath(); c2.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k)), 0, Math.PI * 2); c2.stroke();
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.t += dt;
      if (p.t >= p.life) { parts.splice(i, 1); continue; }
      p.vx *= 1 - p.drag * dt; p.vy = p.vy * (1 - p.drag * dt) + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      const k = 1 - p.t / p.life;
      c2.globalAlpha = Math.min(1, k * 1.6); c2.fillStyle = p.color; c2.strokeStyle = p.color;
      const s = p.size * (p.shape === 'confetti' ? 1 : 0.4 + 0.6 * k);
      if (p.shape === 'spark') {
        c2.lineWidth = Math.max(1, s * 0.45); c2.lineCap = 'round';
        c2.beginPath(); c2.moveTo(p.x, p.y); c2.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); c2.stroke();
      } else if (p.shape === 'square' || p.shape === 'confetti') {
        c2.save(); c2.translate(p.x, p.y); c2.rotate(p.rot);
        c2.fillRect(-s / 2, -s * (p.shape === 'confetti' ? 0.3 : 0.5) * Math.abs(Math.cos(p.rot * 1.7)) - 0.5, s, s * (p.shape === 'confetti' ? 0.6 : 1));
        c2.restore();
      } else if (p.shape === 'star') {
        c2.save(); c2.translate(p.x, p.y); c2.rotate(p.rot); c2.beginPath();
        for (let j = 0; j < 10; j++) { const a = j * Math.PI / 5, rr = j % 2 ? s * 0.42 : s; c2.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        c2.closePath(); c2.fill(); c2.restore();
      } else { c2.beginPath(); c2.arc(p.x, p.y, s, 0, Math.PI * 2); c2.fill(); }
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i]; t.t += dt;
      if (t.t >= t.life) { texts.splice(i, 1); continue; }
      const k = t.t / t.life, pop = k < 0.15 ? 0.6 + k / 0.15 * 0.5 : 1.1 - Math.min(0.1, (k - 0.15));
      c2.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
      c2.font = `900 ${Math.round(t.size * pop)}px Manrope, system-ui, -apple-system, sans-serif`;
      c2.textAlign = 'center'; c2.textBaseline = 'middle';
      c2.lineWidth = 4; c2.strokeStyle = '#000a'; c2.lineJoin = 'round';
      const y = t.y - 46 * (1 - (1 - k) * (1 - k));
      c2.strokeText(t.str, t.x, y); c2.fillStyle = t.color; c2.fillText(t.str, t.x, y);
    }
    c2.globalAlpha = 1;
    if (parts.length || texts.length || rings.length || flashA > 0) raf = requestAnimationFrame(frame);
    else { raf = 0; c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, cv.width, cv.height); }
  }

  const PALETTE = ['#ffd84a', '#ff6b8b', '#6be4ff', '#8dff7a', '#c98bff', '#ff9a3d'];
  const pick = (c) => Array.isArray(c) ? c[(Math.random() * c.length) | 0] : c;
  function burst(x, y, o = {}) {
    if (!overlay() || !isFinite(x) || !isFinite(y)) return;
    let n = o.n ?? 18; if (reduce) n = Math.ceil(n / 3);
    if (parts.length > 600) n = Math.min(n, 4);
    const sp = o.speed ?? 260, color = o.color || PALETTE;
    for (let i = 0; i < n; i++) {
      const a = o.angle != null ? o.angle + (Math.random() - 0.5) * (o.spread ?? 1.2) : Math.random() * Math.PI * 2;
      const v = sp * (0.35 + Math.random() * 0.75);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.up ?? 0), g: o.gravity ?? 520, drag: o.drag ?? 1.6,
        size: (o.size ?? 4) * (0.6 + Math.random() * 0.8), color: pick(color), shape: o.shape || 'dot',
        life: (o.life ?? 0.7) * (0.6 + Math.random() * 0.6), t: 0, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12 });
    }
    run();
  }
  function ring(x, y, color = '#fff', r1 = 70, life = 0.45) {
    if (!overlay() || !isFinite(x)) return;
    rings.push({ x, y, color, r0: 6, r1, life, t: 0 }); run();
  }
  function text(x, y, str, color = '#ffe46b', size = 26) {
    if (!overlay() || !isFinite(x)) return;
    if (texts.length > 12) texts.shift();
    texts.push({ x, y, str: String(str), color, size, life: 0.95, t: 0 }); run();
  }
  function sparkle(x, y, color) {
    burst(x, y, { n: 12, speed: 200, size: 5, shape: 'star', gravity: 200, color: color || ['#fff7b0', '#ffd84a', '#ffffff'], life: 0.6 });
    ring(x, y, color || '#fff3a0', 46, 0.35);
  }
  function explode(x, y, color) {
    burst(x, y, { n: 30, speed: 420, size: 5, color: color || ['#ffdd55', '#ff8a3d', '#ff4d3d', '#fff'], life: 0.8, gravity: 300 });
    burst(x, y, { n: 14, speed: 520, size: 4, shape: 'spark', color: '#fff2c0', life: 0.45, gravity: 100 });
    burst(x, y, { n: 10, speed: 90, size: 14, color: '#55556088', life: 1.1, gravity: -60, drag: 2.4 });
    ring(x, y, '#ffd27a', 110, 0.5);
  }
  function confetti(n = 90) {
    if (!overlay()) return;
    if (reduce) n = Math.ceil(n / 4);
    for (let i = 0; i < n; i++) {
      const left = i % 2 === 0, x = left ? -10 : innerWidth + 10, y = innerHeight * (0.55 + Math.random() * 0.35);
      const ang = left ? -Math.PI / 3 + (Math.random() - 0.5) * 0.6 : -Math.PI * 2 / 3 + (Math.random() - 0.5) * 0.6;
      const v = 600 + Math.random() * 520;
      parts.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, g: 520, drag: 1.9, size: 7 + Math.random() * 6,
        color: pick(PALETTE), shape: 'confetti', life: 2.2 + Math.random() * 1.2, t: 0, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 16 });
    }
    run();
  }
  let flashA = 0, flashC = '#fff';
  function flash(color = '#fff', alpha = 0.35) {
    if (reduce || !overlay()) return;
    flashC = color; flashA = Math.max(flashA, alpha); run();
  }

  // ---------- shake ----------
  let bound = null, bw = 0, bh = 0, cam = null, camDom = null, shakeT = 0, shakeP = 0, shakeRaf = 0;
  function shakeEl() { return bound || camDom || document.querySelector('canvas:not([aria-hidden])') || document.body; }
  function shake(power = 8, ms = 320) {
    if (reduce) return;
    try { if (navigator.vibrate && power >= 8) navigator.vibrate(Math.min(60, power * 4)); } catch { /* optional */ }
    shakeP = Math.max(shakeP, power); shakeT = performance.now() + ms;
    const el = shakeEl();
    if (shakeRaf) return;
    const base = el.style.translate;
    const step = () => {
      const left = shakeT - performance.now();
      if (left <= 0) { el.style.translate = base; shakeRaf = 0; shakeP = 0; return; }
      const k = shakeP * Math.min(1, left / 200);
      el.style.translate = `${((Math.random() - 0.5) * 2 * k).toFixed(1)}px ${((Math.random() - 0.5) * 2 * k).toFixed(1)}px`;
      shakeRaf = requestAnimationFrame(step);
    };
    shakeRaf = requestAnimationFrame(step);
  }

  // ---------- coordinates ----------
  function g(x, y) {
    const el = bound || document.querySelector('canvas:not([aria-hidden])');
    if (!el) return [x, y];
    const r = el.getBoundingClientRect();
    const w = typeof bw === 'function' ? bw()[0] : bw || r.width, h = typeof bw === 'function' ? bw()[1] : bh || r.height;
    return [r.left + x * r.width / w, r.top + y * r.height / h];
  }
  function g3(v) {
    if (!cam || !v) return mid();
    const p = v.clone().project(cam);
    const r = (camDom || document.body).getBoundingClientRect();
    if (p.z > 1) return mid();
    return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height];
  }
  function mid() {
    const el = bound || camDom;
    if (!el) return [innerWidth / 2, innerHeight / 2];
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }
  let lastPointer = null;
  addEventListener('pointerdown', (e) => { lastPointer = [e.clientX, e.clientY]; }, { passive: true, capture: true });

  // ---------- UI clicks ----------
  addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('button, .play, [role="button"], .fg-back');
    if (b && !b.disabled) sfx('click');
  }, { capture: true, passive: true });

  const FX = window.FX = {
    muted: false,
    sfx, burst, ring, text, sparkle, explode, confetti, flash, shake,
    bind(el, w, h) { bound = el; bw = w || 0; bh = h || 0; return FX; },
    bind3(camera, dom) { cam = camera; camDom = dom || camDom; return FX; },
    g, g3, mid,
    pointer: () => lastPointer || mid(),
    good(x, y, color) { if (x == null) [x, y] = mid(); sparkle(x, y, color); sfx('bling'); },
    bad(x, y) { shake(9); flash('#ff3b3b', 0.28); sfx('hit'); if (x != null) burst(x, y, { n: 16, color: ['#ff5d5d', '#ffb3b3', '#fff'], speed: 300 }); },
    win() { confetti(); flash('#fff6c0', 0.3); sfx('win'); },
    record() { confetti(140); sfx('record'); const [x, y] = mid(); text(x, y - 40, 'РЕКОРД!', '#ffe46b', 40); },
    over(x, y) { shake(12, 450); flash('#ff2a2a', 0.35); sfx('lose'); if (x != null) explode(x, y); },
    // One-word presets for a game event; the place is (x, y) or the last tap.
    on(type, arg, x, y) {
      if (x == null) [x, y] = FX.pointer();
      const n = Number(arg) || 1;
      switch (type) {
        case 'tap': burst(x, y, { n: 8, speed: 160, size: 3, gravity: 200, life: 0.4 }); sfx('pop'); break;
        case 'soft': burst(x, y, { n: 6, speed: 120, size: 3, gravity: 150, life: 0.35, color: ['#ffffff', '#cfe8ff'] }); break;
        case 'good': sparkle(x, y); sfx('bling'); break;
        case 'coin': sparkle(x, y, '#ffd84a'); sfx('coin'); break;
        case 'combo': burst(x, y, { n: 12 + Math.min(n, 10) * 3, shape: 'star', speed: 260 + n * 20, size: 5, gravity: 250, color: ['#fff7b0', '#ffd84a', '#ffffff', '#8dff7a'] });
          ring(x, y, '#fff3a0', 60 + Math.min(n, 10) * 8); sfx('combo', n); if (n >= 3) text(x, y - 30, '×' + n, '#ffe46b'); break;
        case 'big': burst(x, y, { n: 40, shape: 'star', speed: 420, size: 6, gravity: 300 }); ring(x, y, '#fff', 120, 0.55);
          flash('#fff6c0', 0.22); shake(4, 200); sfx('power'); break;
        case 'hit': burst(x, y, { n: 10, speed: 220, size: 3, shape: 'spark', color: ['#fff', '#ffe9a8'], gravity: 100, life: 0.35 }); sfx('thud'); shake(2, 120); break;
        case 'boom': explode(x, y); shake(10, 400); sfx('boom'); break;
        case 'bad': FX.bad(x, y); break;
        case 'nope': shake(4, 160); sfx('click'); break;
        case 'whoosh': sfx('whoosh'); break;
        case 'splash': burst(x, y, { n: 22, speed: 260, size: 4, gravity: 700, up: 220, color: ['#bfe9ff', '#6cc8ff', '#ffffff'], life: 0.8 }); sfx('splash'); break;
        case 'level': FX.win(); text(innerWidth / 2, innerHeight * 0.4, arg && isNaN(arg) ? arg : 'Уровень пройден!', '#8dff7a', 34); sfx('levelup'); break;
        case 'win': FX.win(); break;
        case 'over': FX.over(); break;
        case 'record': FX.record(); break;
      }
    },
  };
})();
