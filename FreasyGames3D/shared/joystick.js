'use strict';
// On-screen joystick for phones. It appears where the thumb touches the game and follows it;
// only touch and pen use it, the mouse keeps working as before.
//
// const joy = FreasyJoystick({ target: canvas, axes: 'x' | 'xy', enabled: (e) => playing, onStart, onChange: (x, y) => {} });
// A touch on a button, link or field never starts the stick.
// joy.x, joy.y — from -1 to 1 (0 in the dead zone), joy.active — a finger is on the stick.
window.FreasyJoystick = (opts) => {
  const target = opts.target, both = opts.axes !== 'x', R = opts.radius || 56, DEAD = 0.14;
  const style = document.createElement('style');
  style.textContent = `
  .fj-base { position: fixed; z-index: 40; width: ${R * 2}px; height: ${R * 2}px; margin: -${R}px 0 0 -${R}px; border-radius: 50%; pointer-events: none;
    background: radial-gradient(circle, #ffffff10 0 55%, #ffffff1c 56% 100%); border: 2px solid #ffffff40; box-shadow: 0 0 24px #0006; opacity: 0; transition: opacity .15s; }
  .fj-base.on { opacity: 1; }
  .fj-base.x::before { content: ''; position: absolute; left: 12px; right: 12px; top: 50%; height: 2px; margin-top: -1px; background: #ffffff2a; border-radius: 2px; }
  .fj-knob { position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; margin: -26px 0 0 -26px; border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #e6dcff, #bca0ff 60%, #8f6cf0); box-shadow: 0 6px 18px #0008; }
  .fj-tip { position: fixed; z-index: 39; left: 50%; bottom: max(18px, env(safe-area-inset-bottom)); transform: translateX(-50%); pointer-events: none;
    font: 700 13px Manrope, system-ui, sans-serif; color: #d1cde5; background: #11132199; border: 1px solid #ffffff24; border-radius: 100px; padding: 8px 14px; white-space: nowrap; transition: opacity .4s; }
  .fj-tip.gone { opacity: 0; }`;
  document.head.appendChild(style);
  const base = document.createElement('div'), knob = document.createElement('div');
  base.className = 'fj-base' + (both ? '' : ' x'); knob.className = 'fj-knob';
  base.appendChild(knob); document.body.appendChild(base);

  // A hint on touch screens until the stick is used once.
  let tip = null;
  if (matchMedia('(pointer: coarse)').matches && opts.hint !== false) {
    tip = document.createElement('div'); tip.className = 'fj-tip';
    tip.textContent = both ? '🕹 Коснись и веди пальцем — это джойстик' : '🕹 Коснись и веди пальцем влево-вправо';
    document.body.appendChild(tip);
  }

  const joy = { x: 0, y: 0, active: false };
  let id = null, cx = 0, cy = 0;
  const shape = (v) => (Math.abs(v) < DEAD ? 0 : Math.sign(v) * Math.min(1, (Math.abs(v) - DEAD) / (1 - DEAD)));
  function set(x, y) {
    joy.x = x; joy.y = y;
    if (opts.onChange) opts.onChange(x, y);
  }
  function move(e) {
    let dx = e.clientX - cx, dy = both ? e.clientY - cy : 0;
    const d = Math.hypot(dx, dy);
    // Pulled far away, the stick follows the thumb so it never gets stuck at the edge.
    if (d > R * 1.6) { const k = (d - R * 1.6) / d; cx += dx * k; cy += dy * k; base.style.left = cx + 'px'; base.style.top = cy + 'px'; dx = e.clientX - cx; dy = both ? e.clientY - cy : 0; }
    const len = Math.hypot(dx, dy), lim = Math.min(len, R), kx = len ? dx / len * lim : 0, ky = len ? dy / len * lim : 0;
    knob.style.transform = `translate(${kx}px, ${ky}px)`;
    set(shape(kx / R), both ? shape(ky / R) : 0);
  }
  function end(e) {
    if (e.pointerId !== id) return;
    id = null; joy.active = false; base.classList.remove('on'); knob.style.transform = ''; set(0, 0);
  }
  target.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || id !== null) return;
    if (e.target.closest && e.target.closest('button, a, input, select, textarea, label')) return;
    if (opts.enabled && !opts.enabled(e)) return;
    e.preventDefault();
    id = e.pointerId; cx = e.clientX; cy = e.clientY; joy.active = true;
    try { target.setPointerCapture(id); } catch {}
    base.style.left = cx + 'px'; base.style.top = cy + 'px'; base.classList.add('on');
    if (tip) { tip.classList.add('gone'); const t = tip; tip = null; setTimeout(() => t.remove(), 500); }
    if (opts.onStart) opts.onStart();
    move(e);
  });
  target.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
  for (const k of ['pointerup', 'pointercancel', 'lostpointercapture']) target.addEventListener(k, end);
  addEventListener('blur', () => { if (id !== null) end({ pointerId: id }); });
  joy.reset = () => { if (id !== null) end({ pointerId: id }); };
  return joy;
};
