'use strict';
// "← FreasyGames" that is always on screen and always on top, for games without a HUD link of their own.
// <script src="../shared/back.js" data-pos="left|center" data-href="../"></script>
(() => {
  const me = document.currentScript;
  const href = (me && me.dataset.href) || '../';
  const pos = (me && me.dataset.pos) || 'left';
  const style = document.createElement('style');
  style.textContent = `
  .fg-back { position: fixed; z-index: 100000; top: max(10px, env(safe-area-inset-top)); ${pos === 'center' ? 'left: 50%; transform: translateX(-50%);' : 'left: max(10px, env(safe-area-inset-left));'}
    display: inline-flex; align-items: center; height: 36px; padding: 0 14px; border-radius: 100px; text-decoration: none; white-space: nowrap;
    font: 700 13px Manrope, system-ui, -apple-system, sans-serif; color: #e9e6f5; background: #111321cc; border: 1px solid #ffffff33;
    backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); box-shadow: 0 4px 16px #0005; -webkit-tap-highlight-color: transparent; }
  .fg-back:hover { background: #1d1e31ee; color: #fff; }`;
  document.head.appendChild(style);
  const a = document.createElement('a');
  a.className = 'fg-back'; a.href = href; a.textContent = '← FreasyGames';
  a.setAttribute('aria-label', 'Вернуться на FreasyGames');
  // keys and taps on the link must not reach the game under it
  for (const k of ['pointerdown', 'touchstart', 'mousedown']) a.addEventListener(k, (e) => e.stopPropagation(), { passive: true });
  const add = () => document.body.appendChild(a);
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
})();
