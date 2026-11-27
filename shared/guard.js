'use strict';
// Защита игр от «браузерных штук», которые сбивают игру посреди забега:
//  • выделение текста, лупа и меню «Скопировать / Поиск» при долгом нажатии;
//  • контекстное меню по правой кнопке и долгому тапу;
//  • зум двойным тапом, щипком и Ctrl+колесом;
//  • «потянуть, чтобы обновить» и прокрутка страницы пробелом и стрелками;
//  • кнопка, оставшаяся в фокусе: пробел или Enter во время игры больше не нажимают «Заново» второй раз;
//  • перетаскивание картинок и холста мышкой.
// Поля ввода (ник, чат, поиск) работают как обычно. Подключается в <head> каждой игры:
// <script src="../shared/guard.js"></script>
(() => {
  if (window.__freasyGuard) return;
  window.__freasyGuard = true;
  const typing = (el) => !!(el && el.closest && el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .fg-allow'));

  const css = document.createElement('style');
  css.textContent = `
  html, body { overscroll-behavior: none; -webkit-text-size-adjust: 100%; }
  html { touch-action: manipulation; }
  body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
  canvas { touch-action: none; -webkit-user-select: none; user-select: none; outline: none; }
  img, svg, canvas, a { -webkit-user-drag: none; user-drag: none; }
  input, textarea, select, [contenteditable], .fg-allow { -webkit-user-select: text; user-select: text; -webkit-touch-callout: default; }
  button:focus:not(:focus-visible) { outline: none; }`;
  (document.head || document.documentElement).appendChild(css);

  const opt = { capture: true, passive: false };
  // меню, выделение и перетаскивание
  addEventListener('contextmenu', (e) => { if (!typing(e.target)) e.preventDefault(); }, opt);
  addEventListener('selectstart', (e) => { if (!typing(e.target)) e.preventDefault(); }, opt);
  addEventListener('dragstart', (e) => { if (!typing(e.target)) e.preventDefault(); }, opt);

  // зум: щипок в Safari, Ctrl+колесо и Ctrl +/- на компьютере (двойной тап гасит touch-action: manipulation)
  for (const k of ['gesturestart', 'gesturechange', 'gestureend']) addEventListener(k, (e) => e.preventDefault(), opt);
  addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, opt);
  addEventListener('touchmove', (e) => { if (e.touches.length > 1 && !typing(e.target)) e.preventDefault(); }, opt);

  // клавиши: страница не прокручивается, Backspace не уводит назад, кнопка в фокусе не нажимается повторно
  const SCROLL = new Set([' ', 'Spacebar', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);
  addEventListener('keydown', (e) => {
    if (typing(e.target)) return;
    if ((e.ctrlKey || e.metaKey) && ['+', '=', '-', '_', '0'].includes(e.key)) { e.preventDefault(); return; }
    const scrollBox = e.target.closest && e.target.closest('.fg-scroll');
    if (SCROLL.has(e.key) && !scrollBox) e.preventDefault();
    if (e.key === 'Backspace') e.preventDefault();
    const b = document.activeElement;
    if ((e.key === ' ' || e.key === 'Spacebar') && b && b !== document.body && b.matches && b.matches('button, a, [role=button], summary')) {
      // пробел — игровая клавиша: снимаем фокус с кнопки, чтобы он не «кликнул» её ещё раз
      b.blur();
    }
  }, true);
  // после клика мышью или пальцем кнопка отпускает фокус, иначе Enter и пробел нажимают её снова
  addEventListener('pointerup', (e) => {
    const b = e.target.closest && e.target.closest('button, [role=button]');
    if (b && e.pointerType) setTimeout(() => { if (document.activeElement === b) b.blur(); }, 0);
  }, true);
})();
