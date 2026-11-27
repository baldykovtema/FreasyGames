'use strict';
// Живая комната для игр на очки: игроки в одной комнате видят счёт друг друга вживую — кто сейчас
// играет, кто уже разбился и с каким результатом. Работает поверх shared/multiplayer.js (Supabase Realtime),
// таблицы не нужны. Включается кнопкой 👥 в игре; комнату можно назвать, чтобы играть с друзьями.
//
// <script src="../shared/multiplayer.js?v=2"></script>
// <script src="../shared/room.js?v=1"></script>
// FreasyRoom({ key: 'zmey', read: () => ({ st: state, score }) });   // внутри кода игры, где видны state и score
window.FreasyRoom = (opts) => {
  if (!window.FreasyMultiplayer) return null;
  const unit = opts.unit || '★';
  const ended = /^(over|dying|dead|ending|lost|failed|win|won|landed|cleared|stuck)$/;
  const fmt = (n) => (typeof n === 'number' ? Math.round(n).toLocaleString('ru-RU') : '');
  const mp = window.FreasyMultiplayer({
    key: opts.key,
    sessionKey: 'freasy-session',
    describe: (s) => (s.st === 'play' || s.st === 'between' ? `${unit} ${fmt(s.score)}` : ended.test(s.st || '') ? `🏁 ${fmt(s.score)}` : 'в меню'),
  });
  // кнопка 👥: в ряду кнопок игры, а если ряда нет — рядом с кнопкой чата
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = '👥'; b.setAttribute('aria-label', 'Мультиплеер: комната с друзьями');
  b.title = 'Мультиплеер';
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  b.addEventListener('click', (e) => { e.stopPropagation(); mp.openSettings(); });
  const put = () => {
    const row = document.querySelector('.hud-right');
    if (row) { b.className = 'sound'; row.prepend(b); }
    else {
      b.style.cssText = 'position:fixed;z-index:100000;top:62px;right:64px;width:42px;height:42px;border-radius:50%;border:1px solid #ffffff33;background:#111321cc;color:#fff;font:18px/1 system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(6px);display:grid;place-items:center;padding:0';
      document.body.appendChild(b);
    }
  };
  if (document.body) put(); else addEventListener('DOMContentLoaded', put);
  let lastKey = '';
  setInterval(() => {
    let s; try { s = opts.read(); window.__roomOk = true; } catch (e) { window.__roomErr = String(e); return; }
    if (!s) return;
    const k = s.st + ':' + s.score;
    // пока ничего не меняется, сообщения всё равно уходят изредка (multiplayer.js сам ограничивает частоту)
    if (k !== lastKey || Math.random() < 0.2) { lastKey = k; mp.send({ st: String(s.st || ''), score: Number(s.score) || 0 }); }
  }, 250);
  return mp;
};
