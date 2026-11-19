'use strict';
// Кубомир: путь к финалу — цепочка целей с подсказками и стрелкой, финальный экран «Игра пройдена» с итогами.
(function () {
  const KM = window.KM, G = window.G;
  const $ = (id) => document.getElementById(id);
  const P = () => G.player;
  // 'd1', 'd2' — побывал в Глубинах / Небесах; остальное — ключ предмета или блока, который когда-либо был в инвентаре
  const has = (k) => !!P().prog[typeof k === 'number' || /^d\d$/.test(k) ? k : KM.byKey(k)];
  const any = (...ks) => ks.some(has);
  const won = (t) => P().wins.includes(t);
  const portal = (kind) => P().portals[kind + P().d] || null;

  // ближайшая постройка с ещё не погасшим алтарём
  let navCache = { k: '', t: 0, v: null };
  function nearest(type) {
    const p = P(), W = G.world, REG = 80, rx0 = Math.floor(p.x / REG), rz0 = Math.floor(p.z / REG);
    const key = type + p.d + ':' + rx0 + ',' + rz0 + ':' + p.altars.length;
    if (navCache.k === key && performance.now() - navCache.t < 3000) return navCache.v;
    let best = null, bd = Infinity;
    for (let a = -7; a <= 7; a++) for (let c = -7; c <= 7; c++) {
      const s = W.regionStruct(p.d, rx0 + a, rz0 + c); if (!s || s.type !== type) continue;
      if (p.altars.includes(p.d + ':' + s.x + ',' + s.z)) continue;
      const ay = s.y + (type === 'temple' ? 2 : 1);
      if (W.get(p.d, s.x, ay, s.z) === KM.ALTAR_USED) continue;
      const dd = Math.hypot(s.x + 0.5 - p.x, s.z + 0.5 - p.z); if (dd < bd) { bd = dd; best = [s.x, ay, s.z]; }
    }
    navCache = { k: key, t: performance.now(), v: best };
    return best;
  }

  const STEPS = [
    { t: 'Добудь бревно', h: 'Подойди к дереву и держи на стволе левую кнопку мыши (на телефоне — палец), пока блок не сломается.', done: () => any('log', 'pine_log', 'planks') },
    { t: 'Сделай верстак', h: 'Открой 🎒 → «Крафт»: из бревна выходят доски, из 4 досок — верстак. Поставь его правой кнопкой (на телефоне — коротким касанием).', done: () => has('table') },
    { t: 'Сделай деревянную кирку', h: 'Встань рядом с верстаком и открой «Крафт» (или нажми на сам верстак). Кирка — 3 доски и 2 палки.', done: () => any('pick0', 'pick1', 'pick2', 'pick3') },
    { t: 'Сделай каменную кирку', h: 'Копай серый камень деревянной киркой — выпадет булыжник. Каменная кирка — 3 булыжника и 2 палки.', done: () => any('pick1', 'pick2', 'pick3') },
    { t: 'Выплавь железный слиток', h: 'Железная руда — камень с бежевыми пятнами, глубже под землёй; добывай её каменной киркой. Уголь — камень с чёрными пятнами. Печь — 8 булыжников у верстака. Рядом с печью переплавь руду в слиток.', done: () => any('iron') },
    { t: 'Сделай железный меч', h: 'У верстака: железный меч — 2 слитка и палка. Не забудь броню: шлем, нагрудник, поножи и ботинки из шерсти, железа или кристаллов. Надевай её правой кнопкой или в инвентаре.', done: () => any('sword2', 'sword3') },
    { t: 'Победи Каменного голема', h: 'Найди на Поверхности храм из светлого камня — стрелка показывает дорогу. Нажми на алтарь в его центре, чтобы призвать голема. Возьми еду и надень броню.', target: () => P().d === 0 ? nearest('temple') : null, done: () => won('golem') },
    { t: 'Отправляйся в Глубины', h: 'Скрафти у верстака Портал в Глубины (Сердце камня, 4 железа, 4 угля), поставь его и нажми на него.', done: () => has('d1') },
    { t: 'Победи Огненного колосса', h: 'В Глубинах найди крепость из тёмного кирпича — стрелка показывает дорогу. Нажми на алтарь в её центре. Если ты на Поверхности — вернись через портал.', target: () => P().d === 1 ? nearest('fortress') : portal('deep'), done: () => won('colossus') },
    { t: 'Отправляйся в Небеса', h: 'Скрафти Портал в Небеса (Огненное ядро, 4 кристалла, 4 стекла). Кристальная руда — бирюзовые пятна глубоко под землёй, нужна железная кирка; кристаллы бывают и в сундуках. Стекло плавится в печи из песка.', done: () => has('d2') },
    { t: 'Победи Грозового стража', h: 'На парящих островах Небес найди круглый храм с колоннами — стрелка показывает дорогу. Между островами строй мосты из блоков. Если ты не в Небесах — вернись через портал.', target: () => P().d === 2 ? nearest('skytemple') : portal('sky'), done: () => won('storm') },
    { t: 'Скрафти Алтарь Кубомира', h: 'У верстака: Корона бури, 4 кристалла, 4 золота и 2 лунных камня. Лунный камень плавится в печи из 4 булыжников и кристалла. Золотая руда — жёлтые пятна глубоко под землёй.', done: () => has('altar_final') },
    { t: 'Победи Владыку Кубомира', h: 'Поставь Алтарь Кубомира где угодно, приготовься (броня, еда, лучший меч, лук) и нажми на алтарь. Если проиграешь — алтарь никуда не денется, попробуй ещё раз.', target: () => portal('altar'), done: () => won('lord') },
  ];
  G.QUEST = STEPS;
  // текущий шаг — следующий за последним выполненным (старые сохранения с победами над стражами сразу попадают дальше)
  G.questStep = function () { let last = -1; STEPS.forEach((s, i) => { if (s.done()) last = i; }); return last + 1; };
  G.questLine = () => { const i = G.questStep(); return i >= STEPS.length ? 'игра пройдена' : `цель ${i + 1} из ${STEPS.length}: ${STEPS[i].t.toLowerCase()}`; };

  let shown = -1, checkT = 0, cur = 0;
  G.questReset = () => { shown = -1; checkT = 0; };
  G.onProgress = () => { checkT = 0; };
  function showHint() { const i = G.questStep(); if (i < STEPS.length) G.toast('💡 ' + STEPS[i].h, 9000); else G.toast('🏆 Игра пройдена! Мир твой — строй и исследуй дальше.', 4000); }
  $('quest').addEventListener('click', (e) => { e.stopPropagation(); showHint(); });
  $('quest').addEventListener('pointerdown', (e) => e.stopPropagation());
  addEventListener('keydown', (e) => { if (e.code === 'KeyH' && G.state === 'play' && !G.paused && !(e.target.closest && e.target.closest('input, textarea, select'))) showHint(); });

  G.tickQuest = function (dt) {
    const p = P(); if (!p || !p.prog) return;
    checkT -= dt;
    if (checkT <= 0) {
      checkT = 0.5; cur = G.questStep();
      if (shown >= 0 && cur > shown && cur < STEPS.length) { G.sfx('craft'); G.toast('✅ ' + STEPS[cur - 1].t + ' — готово!', 3000); setTimeout(() => G.toast('🎯 Дальше: ' + STEPS[cur].t, 4000), 900); }
      if (shown === -1 && cur < STEPS.length && p.stats.t < 5) setTimeout(() => G.toast('🎯 Цель: ' + STEPS[cur].t + ' — нажми на цель вверху, чтобы увидеть подсказку', 6000), 2500);
      shown = cur;
    }
    const done = cur >= STEPS.length;
    $('qStep').textContent = done ? '🏆 Игра пройдена' : `🎯 Цель ${cur + 1} из ${STEPS.length}`;
    $('qText').textContent = done ? 'Свободная игра' : STEPS[cur].t;
    const tg = !done && STEPS[cur].target ? STEPS[cur].target() : null;
    if (tg) {
      const dx = tg[0] + 0.5 - p.x, dz = tg[2] + 0.5 - p.z, dy = tg[1] - p.y, dist = Math.hypot(dx, dz);
      const rel = Math.atan2(-dx, -dz) - p.yaw;
      $('qNav').hidden = false; $('qArrow').style.transform = `rotate(${-rel}rad)`;
      $('qDist').textContent = dist < 4 && Math.abs(dy) < 4 ? 'ты на месте' : Math.round(dist) + ' м' + (Math.abs(dy) > 6 ? (dy > 0 ? ', выше на ' : ', ниже на ') + Math.round(Math.abs(dy)) : '');
    } else $('qNav').hidden = true;
  };

  // ---------- финал ----------
  const fmtT = (s) => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h} ч ${m} мин` : m ? `${m} мин ${Math.floor(s % 60)} с` : `${Math.floor(s)} с`; };
  G.gameComplete = function () {
    const p = P(); if (!p) return;
    const first = !p.done;
    if (first) p.done = { at: Date.now(), t: Math.round(p.stats.t) };
    const st = p.stats, rows = [
      ['⏱ Время в игре', fmtT(p.done.t)], ['🛡 Стражи повержены', 'Каменный голем, Огненный колосс, Грозовой страж'], ['👑 Финальный босс', 'Владыка Кубомира'],
      ['🌍 Измерения', 'Поверхность, Глубины, Небеса'], ['⛏ Блоков сломано', st.br], ['🧱 Блоков поставлено', st.pl], ['⚔ Существ побеждено', st.kills], ['🔨 Вещей скрафчено', st.crafts], ['💀 Поражений', st.deaths],
    ];
    $('winStats').innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
    G.show('win'); G.sfx('win');
    if (first) setTimeout(() => G.sfx('win'), 700);
    if (G.saveWorld) G.saveWorld();
  };
  $('winGo').addEventListener('click', () => { G.show('none'); G.toast('Мир твой — строй и исследуй дальше!', 3500); if (G.wantLock) G.wantLock(); });
  $('winQuit').addEventListener('click', () => $('quitBtn').click());
})();
