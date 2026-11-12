'use strict';
// Один вход на весь FreasyGames 2D и 3D.
// Подключается ПЕРВЫМ скриптом в <head> каждой страницы: <script src="../shared/session.js"></script>
// (на страницах каталогов — с атрибутом data-catalog).
//
// Игры и общие модули хранят вход под своими ключами («trassa-session», «catjump-session», «hotel-session»,
// вход ПВЗ «sb-…-auth-token» и т. д.). Этот скрипт незаметно для них направляет все такие ключи в один общий
// «freasy-session»: вошёл на сайте — вошёл везде, обновили токен в одной игре — его видят все остальные.
// Игры без входа не открываются: отправляем на страницу входа каталога и после входа возвращаем обратно.
(() => {
  const MASTER = 'freasy-session';
  const PVZ = 'sb-ywqxrbmgmvpbeytxjkpi-auth-token';
  const me = document.currentScript;
  const catalog = !!(me && me.dataset.catalog !== undefined);
  const proto = Storage.prototype, get = proto.getItem, set = proto.setItem, del = proto.removeItem;
  const shared = (k) => typeof k === 'string' && k !== MASTER && (k.endsWith('-session') || k === PVZ);
  let ls = null;
  try { ls = window.localStorage; } catch { /* хранилище недоступно */ }
  if (!ls) return;

  const parse = (v) => { try { return JSON.parse(v); } catch { return null; } };
  const valid = (s) => !!(s && s.refresh_token && s.user && s.user.id);

  // Перенос — один раз: самый свежий вход из любой игры становится общим, а старые ключи удаляются,
  // иначе после выхода старый вход «воскрес» бы при следующем открытии игры.
  if (get.call(ls, MASTER + '-migrated') !== '1') {
    let best = null;
    const look = (store) => {
      if (!store) return;
      for (let i = store.length - 1; i >= 0; i--) {
        const k = store.key(i);
        if (!shared(k)) continue;
        const s = parse(get.call(store, k));
        if (valid(s) && (!best || (s.expires_at || 0) > (best.expires_at || 0))) best = s;
        del.call(store, k);
      }
    };
    look(ls);
    try { look(window.sessionStorage); } catch { /* нет sessionStorage */ }
    if (best && !valid(parse(get.call(ls, MASTER)))) set.call(ls, MASTER, JSON.stringify(best));
    set.call(ls, MASTER + '-migrated', '1');
  }

  // Все ключи входа (в localStorage и sessionStorage) читают и пишут общий вход.
  proto.getItem = function (k) { return shared(k) ? get.call(ls, MASTER) : get.call(this, k); };
  // выход (null) в любой игре — выход везде
  proto.setItem = function (k, v) { return shared(k) ? set.call(ls, MASTER, String(v)) : set.call(this, k, v); };
  proto.removeItem = function (k) { return shared(k) ? del.call(ls, MASTER) : del.call(this, k); };

  window.FreasySession = {
    get: () => { const s = parse(get.call(ls, MASTER)); return valid(s) ? s : null; },
    username: () => { const s = window.FreasySession.get(); return s && s.user.user_metadata && s.user.user_metadata.username || null; },
    loginUrl: (next = location.pathname + location.search + location.hash) => new URL('../', location.href).pathname + '?login=1&next=' + encodeURIComponent(next),
  };

  // Игры — только с аккаунтом.
  if (!catalog && !window.FreasySession.get()) {
    document.documentElement.style.visibility = 'hidden';
    location.replace(window.FreasySession.loginUrl());
  }
})();
