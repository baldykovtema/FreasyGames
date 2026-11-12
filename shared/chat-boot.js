'use strict';
// Подключает FreasyChat на любой странице FreasyGames 2D и 3D: в каталоге и в каждой игре.
// <script src="../shared/chat-boot.js"></script> — путь к shared/ берётся из адреса этого скрипта.
(() => {
  if (window.__freasyChatBoot) return;
  window.__freasyChatBoot = true;
  const me = document.currentScript;
  const base = me ? me.src.replace(/chat-boot\.js.*$/, '') : '../shared/';
  const inGame = me ? me.dataset.catalog === undefined : true;
  const load = (src) => new Promise((ok) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ok; document.head.appendChild(s); });
  const start = async () => {
    if (!window.FreasyAccount) await load(base + 'account.js?v=4');
    if (!window.FreasyChat) await load(base + 'chat.js?v=4');
    if (window.FreasyChat) window.FreasyChat({ inGame });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
