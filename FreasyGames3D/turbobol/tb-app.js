'use strict';
// Турбобол — интерфейс: меню, гараж, магазин, пати, карты и редактор, управление, игровой цикл, звук и награды.
(() => {
  const TB = window.TB, Net = TB.Net, P = TB.profile;
  const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (t, ms = 2600) => { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, ms); };
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (isTouch) document.body.classList.add('is-touch');

  // ——— Звук ———
  let ac = null, noiseBuf = null;
  const audio = () => { try { if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } if (ac.state === 'suspended') ac.resume(); } catch { /* без звука */ } return ac; };
  function tone(f, d, type = 'sine', v = 0.1, slide = 1, delay = 0) {
    if (P.prefs.muted || !ac) return;
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
  }
  function noise(d, v = 0.12, f = 1200, delay = 0) {
    if (P.prefs.muted || !ac) return;
    const t = ac.currentTime + delay, s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; fl.type = 'lowpass'; fl.frequency.value = f; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(fl).connect(g).connect(ac.destination); s.start(t); s.stop(t + d);
  }
  const sfx = {
    hit: (p) => { tone(110 + Math.min(p, 40) * 4, 0.12, 'triangle', 0.18, 0.5); noise(0.08, 0.1 + Math.min(p, 40) / 300, 2500); },
    jump: () => tone(300, 0.1, 'sine', 0.06, 1.8), flip: () => noise(0.2, 0.06, 3000),
    pad: (big) => tone(big ? 600 : 900, big ? 0.25 : 0.08, 'triangle', 0.06, big ? 2 : 1.3),
    goal: () => { noise(2.2, 0.14, 900); [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, 'square', 0.05, 1, i * 0.11)); tone(180, 1.2, 'sawtooth', 0.08, 1, 0.05); },
    demo: () => { noise(0.6, 0.25, 600); tone(90, 0.5, 'sawtooth', 0.15, 0.4); },
    beep: (hi) => tone(hi ? 880 : 440, hi ? 0.4 : 0.15, 'square', 0.06),
    wall: (v) => noise(0.06, Math.min(0.12, v / 200), 700), bump: () => tone(220, 0.2, 'square', 0.08, 2.2), bonk: () => tone(160, 0.08, 'square', 0.06, 0.6),
    buy: () => [660, 880, 1320].forEach((f, i) => tone(f, 0.12, 'triangle', 0.08, 1, i * 0.07)), click: () => tone(700, 0.04, 'sine', 0.04),
  };
  addEventListener('pointerdown', audio, { once: false, passive: true });
  addEventListener('keydown', audio, { passive: true });
  const soundBtn = $('#soundBtn');
  const syncSound = () => { soundBtn.textContent = P.prefs.muted ? '🔇' : '🔊'; };
  soundBtn.addEventListener('click', () => { P.prefs.muted = !P.prefs.muted; TB.save(); syncSound(); }); syncSound();

  // ——— Монеты ———
  const coinsEl = $('#coins');
  const syncCoins = () => { coinsEl.textContent = P.coins.toLocaleString('ru-RU'); };
  syncCoins();

  // ——— Вкладки ———
  let tab = 'play';
  function showTab(t) {
    tab = t;
    $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    $$('.pane').forEach((p) => { p.hidden = p.dataset.pane !== t; });
    if (t === 'garage') renderGarage(); if (t === 'shop') renderShop(); if (t === 'party') renderParty(); if (t === 'maps') renderMaps(); if (t === 'play') renderPlay();
  }
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => { sfx.click(); showTab(b.dataset.tab); }));

  // ——— Играть ———
  function seg(el, val, on) {
    el.querySelectorAll('button').forEach((b) => { b.setAttribute('aria-pressed', String(+b.dataset.v === val)); b.onclick = () => { on(+b.dataset.v); sfx.click(); }; });
  }
  function renderPlay() {
    seg($('#segSize'), P.prefs.size, (v) => { P.prefs.size = v; TB.save(); renderPlay(); });
    seg($('#segBot'), P.prefs.bot, (v) => { P.prefs.bot = v; TB.save(); renderPlay(); });
    $('#rules').innerHTML = TB.RULES.map((r) => `<button type="button" data-r="${r.id}" aria-pressed="${r.id === P.prefs.rule}"><b>${esc(r.name)}</b><span>${esc(r.desc)}</span></button>`).join('');
    $('#rules').querySelectorAll('button').forEach((b) => { b.onclick = () => { P.prefs.rule = b.dataset.r; TB.save(); renderPlay(); sfx.click(); }; });
    const sel = $('#arenaSel');
    sel.innerHTML = '<optgroup label="Арены">' + TB.ARENAS.map((a) => `<option value="${a.id}">${esc(a.name)} · ${esc(TB.THEMES[a.theme].name)}</option>`).join('') + '</optgroup>'
      + (P.maps.length ? '<optgroup label="Мои карты">' + P.maps.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('') + '</optgroup>' : '');
    if (!TB.allMaps().some((m) => m.id === P.prefs.arena)) P.prefs.arena = TB.ARENAS[0].id;
    sel.value = P.prefs.arena; sel.onchange = () => { P.prefs.arena = sel.value; TB.save(); };
    const pt = Net.party();
    const notLeader = pt && !Net.isLeader();
    $('#playOnline').disabled = !!notLeader;
    $('#playOnline').textContent = Net.inQueue() ? '✕ Отменить поиск' : pt ? `🌐 Подбор для пати (${pt.members.length})` : '🌐 Подбор игроков';
    $('#playBots').textContent = pt && pt.members.length > 1 ? '👥 Матч пати с ботами' : '🤖 Играть с ботами';
    $('#playBots').disabled = !!notLeader;
    if (notLeader && !Net.inQueue()) $('#mmNote').textContent = 'Матч запускает лидер пати — жди, когда он начнёт.';
    const st = P.stats;
    $('#stats').textContent = `Матчей: ${st.games} · побед: ${st.wins} · голов: ${st.goals}`;
  }
  $('#playBots').addEventListener('click', () => {
    audio();
    const map = TB.mapById(P.prefs.arena), pt = Net.party();
    if (pt && pt.members.length > 1) { const info = Net.partyMatch({ size: P.prefs.size, rule: P.prefs.rule, map, bot: P.prefs.bot }); startOnline(info); return; }
    startOffline(map);
  });
  $('#playOnline').addEventListener('click', () => {
    audio();
    if (Net.inQueue()) { Net.cancelQueue(); Net.partySay('status', { text: '' }); $('#mmNote').textContent = 'Поиск отменён'; renderPlay(); return; }
    $('#mmNote').textContent = 'Подключаемся…';
    Net.queue({ size: P.prefs.size, rule: P.prefs.rule }, (text) => { $('#mmNote').textContent = text; Net.partySay('status', { text }); }, (info) => {
      $('#mmNote').textContent = 'Матч найден!'; Net.partySay('go', { info }); startOnline(info);
    }).catch(() => { $('#mmNote').textContent = 'Нет связи с сервером. Проверь интернет'; });
    renderPlay();
  });

  // ——— Гараж ———
  let preview = null, slot = 'body';
  const SLOT_NAMES = { body: 'Машина', color: 'Краска', accent: 'Отделка', wheels: 'Колёса', topper: 'На крышу', antenna: 'Антенна', trail: 'След буста' };
  function itemFace(sl, it) { return sl === 'color' || sl === 'accent' ? `<i class="sw" style="background:${it.c}"></i>` : sl === 'body' ? '<i class="em">🏎️</i>' : `<i class="em">${it.em || '•'}</i>`; }
  function renderGarage() {
    if (!preview) { try { preview = new TB.Preview($('#pv')); } catch { /* без WebGL */ } }
    if (preview) preview.set(TB.look());
    const spec = TB.byId(TB.CARS, P.car.body);
    $('#pvName').textContent = spec.name;
    const bar = (v) => `style="--v:${Math.round(v * 100)}%"`;
    $('#pvStats').innerHTML = `<div>Скорость<i ${bar((spec.speed - 20) / 7)}></i></div><div>Разгон<i ${bar((spec.accel - 24) / 11)}></i></div><div>Поворот<i ${bar((spec.turn - 2) / 1.1)}></i></div><div>Масса<i ${bar((spec.mass - 0.7) / 1)}></i></div>`;
    $$('#ctabs button').forEach((b) => { b.setAttribute('aria-selected', String(b.dataset.c === slot)); b.onclick = () => { slot = b.dataset.c; sfx.click(); renderGarage(); }; });
    const list = TB.SLOTS[slot];
    $('#items').innerHTML = list.map((it) => {
      const own = TB.owns(slot, it), on = P.car[slot] === it.id;
      return `<button class="item${on ? ' on' : ''}${own ? '' : ' locked'}" data-id="${it.id}" type="button" title="${esc(it.desc || '')}">${itemFace(slot, it)}<b>${esc(it.name)}</b>${own ? (on ? '<small style="color:#bca0ff">Выбрано</small>' : '') : `<small>${it.price} 🪙</small>`}</button>`;
    }).join('');
    $('#items').querySelectorAll('.item').forEach((b) => { b.onclick = () => {
      const it = list.find((x) => x.id === b.dataset.id);
      if (!TB.owns(slot, it)) { if (!buy(slot, it)) return; }
      P.car[slot] = it.id; TB.save(); Net.updateLook(); sfx.click(); renderGarage();
    }; });
  }
  function priceOf(sl, it) { const d = dailyOffers().find((o) => o.slot === sl && o.it.id === it.id); return d ? d.price : it.price; }
  function buy(sl, it) {
    const price = priceOf(sl, it);
    if (P.coins < price) { toast(`Не хватает монет: нужно ${price} 🪙. Монеты даются за матчи.`); return false; }
    if (!confirm(`Купить «${it.name}» (${SLOT_NAMES[sl]}) за ${price} 🪙?`)) return false;
    P.coins -= price; P.owned[sl + ':' + it.id] = 1; TB.save(); syncCoins(); sfx.buy(); toast(`Куплено: ${it.name}`);
    return true;
  }

  // ——— Магазин ———
  function dailyOffers() {
    const day = Math.floor((Date.now() + 3 * 3600e3) / 86400e3);
    let seed = day * 9301 + 49297; const rnd = () => (seed = (seed * 233280 + 49297) % 2147483647) / 2147483647;
    const pool = [];
    for (const [sl, list] of Object.entries(TB.SLOTS)) { if (sl === 'accent') continue; for (const it of list) if (it.price) pool.push({ slot: sl, it }); }
    const out = [];
    while (out.length < 4 && pool.length) { const k = Math.floor(rnd() * pool.length); const o = pool.splice(k, 1)[0]; out.push({ ...o, price: Math.round(o.it.price * 0.7 / 10) * 10 }); }
    return out;
  }
  function renderShop() {
    const offer = (sl, it, price, hot) => {
      const own = TB.owns(sl, it) || (sl === 'color' && TB.owns('accent', it));
      return `<div class="offer${hot ? ' hot' : ''}">${sl === 'color' || sl === 'accent' ? `<i class="sw" style="background:${it.c}"></i>` : `<span class="em">${sl === 'body' ? '🏎️' : it.em || '•'}</span>`}
        <b>${esc(it.name)}</b><span>${SLOT_NAMES[sl]}${it.desc ? ' · ' + esc(it.desc) : ''}</span>
        <button type="button" data-s="${sl}" data-id="${it.id}" ${own ? 'disabled' : ''}>${own ? 'Уже есть' : hot ? `<s>${it.price}</s>${price} 🪙` : `${price} 🪙`}</button></div>`;
    };
    const daily = dailyOffers();
    $('#daily').innerHTML = daily.map((o) => offer(o.slot, o.it, o.price, true)).join('');
    const left = 86400e3 - ((Date.now() + 3 * 3600e3) % 86400e3);
    $('#dailyLeft').textContent = `· обновятся через ${Math.floor(left / 3600e3)} ч ${Math.floor(left % 3600e3 / 60e3)} мин`;
    let all = '';
    for (const [sl, list] of Object.entries(TB.SLOTS)) { if (sl === 'accent') continue; for (const it of list) if (it.price) all += offer(sl, it, priceOf(sl, it), false); }
    $('#shopAll').innerHTML = all;
    $$('.offer button').forEach((b) => { b.onclick = () => {
      const sl = b.dataset.s, it = TB.SLOTS[sl].find((x) => x.id === b.dataset.id);
      if (buy(sl, it)) { if (sl === 'color') P.owned['accent:' + it.id] = 1; TB.save(); renderShop(); }
    }; });
  }

  // ——— Пати ———
  function renderParty() {
    const pt = Net.party(), box = $('#partyBox');
    if (!pt) {
      box.innerHTML = `<div class="party"><p class="lead" style="margin:0 0 12px">Создай пати и скажи друзьям код — или введи код друга.</p>
        <button class="big" id="pCreate" type="button">＋ Создать пати</button>
        <div class="row" style="margin-top:12px"><input id="pCode" maxlength="8" placeholder="КОД" autocomplete="off" spellcheck="false"><button class="big alt" id="pJoin" type="button">Войти</button></div></div>`;
      $('#pCreate').onclick = () => Net.createParty().then(() => renderParty()).catch(() => toast('Нет связи с сервером'));
      $('#pJoin').onclick = () => Net.joinParty($('#pCode').value).then(() => renderParty()).catch((e) => toast(e.message || 'Нет связи'));
      $('#pCode').onkeydown = (e) => { if (e.key === 'Enter') $('#pJoin').click(); };
      return;
    }
    const lead = Net.isLeader();
    box.innerHTML = `<div class="party"><div>Код пати</div><div class="code">${esc(pt.code)}</div>
      <ul>${pt.members.map((m, i) => `<li><i></i>${esc(m.n)}${m.id === Net.id ? ' (ты)' : ''}<em>${i === 0 ? '👑 лидер' : ''}</em></li>`).join('')}</ul>
      <p class="note">${esc(pt.status || (lead ? 'Ты лидер: выбери режим во вкладке «Играть» и начни подбор или матч пати.' : 'Ждём, когда лидер начнёт матч…'))}</p>
      <div class="row">${lead ? '<button class="big" id="pPlay" type="button">▶ К выбору матча</button>' : ''}<button class="big alt" id="pLeave" type="button">Выйти из пати</button></div></div>`;
    $('#pLeave').onclick = () => { Net.cancelQueue(); Net.leaveParty(); renderParty(); };
    if (lead) $('#pPlay').onclick = () => showTab('play');
  }
  Net.onParty = () => { if (tab === 'party') renderParty(); if (tab === 'play') renderPlay(); };
  // участник пати получает матч от лидера
  Net.onGo = (info) => { if (mode !== 'match') startOnline(info); };

  // ——— Карты ———
  function drawMapThumb(cv, map) {
    const A = TB.buildArena(map), x = cv.getContext('2d'), W = cv.width = 280, H = cv.height = 200;
    const sc = Math.min((W - 20) / (A.Wd * 2), (H - 20) / ((A.L + A.goalD) * 2)) ;
    x.fillStyle = A.theme.floor; x.fillRect(W / 2 - A.Wd * sc, H / 2 - A.L * sc, A.Wd * 2 * sc, A.L * 2 * sc);
    x.fillStyle = TB.TEAM[0]; x.fillRect(W / 2 - A.goalW / 2 * sc, H / 2 + A.L * sc, A.goalW * sc, A.goalD * sc);
    x.fillStyle = TB.TEAM[1]; x.fillRect(W / 2 - A.goalW / 2 * sc, H / 2 - (A.L + A.goalD) * sc, A.goalW * sc, A.goalD * sc);
    for (const o of map.objs) drawObj(x, o, W / 2, H / 2, sc, A.theme);
  }
  function drawObj(x, o, cx, cy, sc, th, sel) {
    x.save(); x.translate(cx + o.x * sc, cy - o.z * sc); x.rotate((o.r || 0) * Math.PI / 180);
    if (o.t === 'bumper') { x.fillStyle = '#ff4f6d'; x.beginPath(); x.arc(0, 0, o.w / 2 * sc, 0, 7); x.fill(); }
    else if (o.t === 'pad') { x.fillStyle = '#ffb000'; x.beginPath(); x.arc(0, 0, 2.2 * sc, 0, 7); x.fill(); }
    else if (o.t === 'ramp') { const g = x.createLinearGradient(0, o.d / 2 * sc, 0, -o.d / 2 * sc); g.addColorStop(0, '#ffffff22'); g.addColorStop(1, th.wall); x.fillStyle = g; x.fillRect(-o.w / 2 * sc, -o.d / 2 * sc, o.w * sc, o.d * sc); x.strokeStyle = '#fff'; x.beginPath(); x.moveTo(0, o.d / 3 * sc); x.lineTo(0, -o.d / 3 * sc); x.lineTo(-3, -o.d / 3 * sc + 5); x.moveTo(0, -o.d / 3 * sc); x.lineTo(3, -o.d / 3 * sc + 5); x.stroke(); }
    else { x.fillStyle = th.wall; x.fillRect(-o.w / 2 * sc, -o.d / 2 * sc, o.w * sc, o.d * sc); }
    if (sel) { x.strokeStyle = '#ffd23f'; x.lineWidth = 2; x.strokeRect(-o.w / 2 * sc - 3, -o.d / 2 * sc - 3, o.w * sc + 6, o.d * sc + 6); }
    x.restore();
  }
  function renderMaps() {
    const list = $('#mapList');
    if (!P.maps.length) { list.innerHTML = '<p class="lead">Пока своих карт нет. Нажми «Новая карта».</p>'; return; }
    list.innerHTML = P.maps.map((m) => `<div class="mapc" data-id="${m.id}"><canvas></canvas><b>${esc(m.name)}</b><div class="row">
      <button data-a="play" type="button">▶ Играть</button><button data-a="edit" type="button">✏️</button><button data-a="code" type="button">🔗 Код</button><button data-a="del" type="button">🗑</button></div></div>`).join('');
    list.querySelectorAll('.mapc').forEach((el) => {
      const m = P.maps.find((x) => x.id === el.dataset.id); drawMapThumb(el.querySelector('canvas'), m);
      el.querySelectorAll('button').forEach((b) => { b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'play') { P.prefs.arena = m.id; TB.save(); showTab('play'); toast(`Выбрана карта «${m.name}»`); }
        else if (a === 'edit') openEditor(m);
        else if (a === 'code') { const code = TB.encodeMap(m); (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(() => toast('Код карты скопирован — отправь его другу')).catch(() => prompt('Код карты:', code)); }
        else if (a === 'del' && confirm(`Удалить карту «${m.name}»? Её нельзя будет вернуть.`)) { P.maps = P.maps.filter((x) => x.id !== m.id); TB.save(); renderMaps(); }
      }; });
    });
  }
  $('#newMap').addEventListener('click', () => openEditor(null));
  $('#importMap').addEventListener('click', () => {
    const code = prompt('Вставь код карты от друга:'); if (!code) return;
    try { const m = TB.decodeMap(code); P.maps.push(m); TB.save(); renderMaps(); toast(`Карта «${m.name}» добавлена`); } catch { toast('Код карты не подошёл'); }
  });

  // ——— Редактор карт ———
  const ED = { map: null, tool: 'box', sel: null, drag: null, cv: $('#eCanvas') };
  ED.cv.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  $('#eTheme').innerHTML = TB.THEMES.map((t, i) => `<option value="${i}">${t.name}</option>`).join('');
  function openEditor(m) {
    ED.map = m ? JSON.parse(JSON.stringify(m)) : { id: 'm' + Date.now().toString(36), name: 'Моя карта', size: 'M', theme: 0, goalW: 17, grav: 1, objs: [] };
    ED.isNew = !m; ED.sel = null;
    $('#eName').value = ED.map.name; $('#eSize').value = ED.map.size; $('#eTheme').value = ED.map.theme; $('#eGoal').value = ED.map.goalW; $('#eGrav').value = ED.map.grav;
    $('#editor').hidden = false; edDraw();
  }
  const edView = () => {
    const A = TB.buildArena(ED.map), cv = ED.cv, r = cv.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    const sc = Math.min((r.width - 30) / (A.Wd * 2), (r.height - 30) / ((A.L + A.goalD) * 2));
    return { A, sc, cx: r.width / 2, cy: r.height / 2, dpr, r };
  };
  function edDraw() {
    if ($('#editor').hidden) return;
    const { A, sc, cx, cy, dpr, r } = edView(), x = ED.cv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, r.width, r.height);
    x.fillStyle = A.theme.floor; x.fillRect(cx - A.Wd * sc, cy - A.L * sc, A.Wd * 2 * sc, A.L * 2 * sc);
    x.strokeStyle = A.theme.line; x.globalAlpha = 0.5; x.lineWidth = 2; x.strokeRect(cx - A.Wd * sc, cy - A.L * sc, A.Wd * 2 * sc, A.L * 2 * sc);
    x.beginPath(); x.moveTo(cx - A.Wd * sc, cy); x.lineTo(cx + A.Wd * sc, cy); x.stroke(); x.beginPath(); x.arc(cx, cy, A.Wd * 0.34 * sc, 0, 7); x.stroke(); x.globalAlpha = 1;
    x.fillStyle = TB.TEAM[0]; x.fillRect(cx - A.goalW / 2 * sc, cy + A.L * sc, A.goalW * sc, A.goalD * sc);
    x.fillStyle = TB.TEAM[1]; x.fillRect(cx - A.goalW / 2 * sc, cy - (A.L + A.goalD) * sc, A.goalW * sc, A.goalD * sc);
    // стандартные площадки буста
    x.fillStyle = '#ffd23f66'; for (const p of A.pads) { x.beginPath(); x.arc(cx + p.x * sc, cy - p.z * sc, (p.big ? 2.2 : 1.2) * sc, 0, 7); x.fill(); }
    for (const o of ED.map.objs) drawObj(x, o, cx, cy, sc, A.theme, o === ED.sel);
    x.fillStyle = '#ffffffaa'; x.font = '800 12px Manrope, sans-serif'; x.fillText(`${ED.map.objs.length}/80 объектов`, 10, 18);
  }
  const edPt = (e) => { const { sc, cx, cy, r } = edView(); return { x: (e.clientX - r.left - cx) / sc, z: -(e.clientY - r.top - cy) / sc }; };
  const hitObj = (p) => { for (let i = ED.map.objs.length - 1; i >= 0; i--) { const o = ED.map.objs[i]; const ob = { ...o, c: Math.cos(o.r * Math.PI / 180), s: Math.sin(o.r * Math.PI / 180) }; const [lx, lz] = TB.toLocal(ob, p.x, p.z); if (Math.abs(lx) < Math.max(1.5, o.w / 2) && Math.abs(lz) < Math.max(1.5, o.d / 2)) return o; } return null; };
  const mirrorOf = (o) => ED.map.objs.find((q) => q !== o && q.t === o.t && Math.abs(q.x + o.x) < 0.01 && Math.abs(q.z + o.z) < 0.01);
  ED.cv.addEventListener('pointerdown', (e) => {
    e.preventDefault(); ED.cv.setPointerCapture(e.pointerId);
    const p = edPt(e), { A } = edView();
    const o = hitObj(p);
    if (ED.tool === 'erase') { if (o) { const mo = mirrorOf(o); ED.map.objs = ED.map.objs.filter((q) => q !== o && q !== mo); } edDraw(); return; }
    if (ED.tool === 'move' || o) { if (o) { ED.sel = o; ED.drag = { o, mo: mirrorOf(o), dx: o.x - p.x, dz: o.z - p.z }; $('#eRot').value = o.r; $('#eW').value = o.w; $('#eD').value = o.d; $('#eH').value = o.h; } edDraw(); return; }
    if (Math.abs(p.x) > A.Wd || Math.abs(p.z) > A.L) return;
    if (ED.map.objs.length >= 80) { toast('Не больше 80 объектов'); return; }
    const t = ED.tool, w = t === 'bumper' ? Math.min(6, +$('#eW').value) : t === 'pad' ? 2 : +$('#eW').value;
    const no = { t, x: Math.round(p.x * 2) / 2, z: Math.round(p.z * 2) / 2, w, d: t === 'bumper' ? w : t === 'pad' ? 2 : +$('#eD').value, h: t === 'pad' ? 1 : +$('#eH').value, r: +$('#eRot').value };
    // центр поля и площадку у ворот не застраиваем, чтобы матч мог начаться
    if (Math.hypot(no.x, no.z) < 4 && t !== 'pad') { toast('Центр поля оставь свободным — там мяч на старте'); return; }
    ED.map.objs.push(no); ED.sel = no;
    if ($('#eMirror').checked && (Math.abs(no.x) > 0.1 || Math.abs(no.z) > 0.1)) ED.map.objs.push({ ...no, x: -no.x, z: -no.z, r: (no.r + 180) % 360 });
    sfx.click(); edDraw();
  });
  ED.cv.addEventListener('pointermove', (e) => {
    if (!ED.drag) return;
    const p = edPt(e), { A } = edView(), d = ED.drag;
    d.o.x = Math.max(-A.Wd, Math.min(A.Wd, Math.round((p.x + d.dx) * 2) / 2)); d.o.z = Math.max(-A.L, Math.min(A.L, Math.round((p.z + d.dz) * 2) / 2));
    if (d.mo) { d.mo.x = -d.o.x; d.mo.z = -d.o.z; }
    edDraw();
  });
  ED.cv.addEventListener('pointerup', () => { ED.drag = null; });
  $$('#eTools [data-t]').forEach((b) => b.addEventListener('click', () => { ED.tool = b.dataset.t; $$('#eTools [data-t]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));
  for (const id of ['eRot', 'eW', 'eD', 'eH']) $('#' + id).addEventListener('input', () => {
    const o = ED.sel; if (!o) return;
    const k = { eRot: 'r', eW: 'w', eD: 'd', eH: 'h' }[id]; o[k] = +$('#' + id).value; if (o.t === 'bumper' && k === 'w') o.d = o.w;
    const mo = mirrorOf(o); if (mo) { mo[k] = k === 'r' ? (o.r + 180) % 360 : o[k]; if (o.t === 'bumper') mo.d = mo.w; }
    edDraw();
  });
  $('#eSize').addEventListener('change', () => { ED.map.size = $('#eSize').value; edDraw(); });
  $('#eTheme').addEventListener('change', () => { ED.map.theme = +$('#eTheme').value; edDraw(); });
  $('#eGoal').addEventListener('input', () => { ED.map.goalW = +$('#eGoal').value; edDraw(); });
  $('#eGrav').addEventListener('input', () => { ED.map.grav = +$('#eGrav').value; });
  $('#eClear').addEventListener('click', () => { if (confirm('Убрать все объекты с карты?')) { ED.map.objs = []; ED.sel = null; edDraw(); } });
  const edSave = () => {
    ED.map.name = ($('#eName').value || 'Моя карта').slice(0, 24);
    const i = P.maps.findIndex((m) => m.id === ED.map.id);
    if (i >= 0) P.maps[i] = ED.map; else P.maps.push(ED.map);
    TB.save(); return ED.map;
  };
  $('#eSave').addEventListener('click', () => { edSave(); toast('Карта сохранена'); sfx.buy(); });
  $('#eClose').addEventListener('click', () => { $('#editor').hidden = true; showTab('maps'); });
  $('#eTest').addEventListener('click', () => { const m = edSave(); $('#editor').hidden = true; backTo = 'editor'; startOffline(m, { size: 1, bot: 0 }); });
  addEventListener('resize', edDraw);

  // ——— Управление ———
  const keys = {};
  const input = { th: 0, st: 0, jump: false, boost: false, drift: false };
  let jc = 0, mouseBoost = false, ballCam = P.prefs.ballCam !== false;
  addEventListener('keydown', (e) => {
    if (mode !== 'match') return;
    if (e.target.closest && e.target.closest('input, select')) return;
    if (e.code === 'Escape') { togglePause(); return; }
    if (!keys[e.code] && e.code === 'Space') jc++;
    if (!keys[e.code] && e.code === 'KeyC') toggleCam();
    keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyQ'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseBoost = false; touchState.jump = touchState.boost = touchState.drift = false; stick.x = stick.y = 0; });
  $('#c').addEventListener('pointerdown', (e) => { if (mode === 'match' && e.pointerType === 'mouse' && (e.button === 2 || e.button === 0)) { if (e.button === 2) mouseBoost = true; else { jc++; keys.MouseJump = true; } } });
  addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') { if (e.button === 2) mouseBoost = false; if (e.button === 0) keys.MouseJump = false; } });
  function toggleCam() { ballCam = !ballCam; P.prefs.ballCam = ballCam; TB.save(); $('#camHint').textContent = ballCam ? '🎥 Камера на мяч (C)' : '🎥 Камера за машиной (C)'; }
  // сенсорное управление
  const stick = { x: 0, y: 0, id: null }, touchState = { jump: false, boost: false, drift: false };
  const stickEl = $('#stick'), knob = stickEl.querySelector('i');
  const moveStick = (e) => {
    const r = stickEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width / 2;
    let dx = (e.clientX - cx) / R, dy = (e.clientY - cy) / R; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    stick.x = dx; stick.y = dy; knob.style.transform = `translate(${dx * R * 0.6}px, ${dy * R * 0.6}px)`;
  };
  stickEl.addEventListener('pointerdown', (e) => { e.preventDefault(); stick.id = e.pointerId; stickEl.setPointerCapture(e.pointerId); moveStick(e); });
  stickEl.addEventListener('pointermove', (e) => { if (e.pointerId === stick.id) moveStick(e); });
  const endStick = (e) => { if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; knob.style.transform = ''; };
  stickEl.addEventListener('pointerup', endStick); stickEl.addEventListener('pointercancel', endStick);
  $$('.tb').forEach((b) => {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('on'); if (k === 'cam') { toggleCam(); return; } if (k === 'jump') jc++; touchState[k] = true; });
    const up = () => { b.classList.remove('on'); if (k !== 'cam') touchState[k] = false; };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
  });
  let padPrev = {};
  function readInput() {
    let th = 0, st = 0;
    if (keys.KeyW || keys.ArrowUp) th += 1; if (keys.KeyS || keys.ArrowDown) th -= 1;
    if (keys.KeyD || keys.ArrowRight) st += 1; if (keys.KeyA || keys.ArrowLeft) st -= 1;
    let jump = !!(keys.Space || keys.MouseJump), boost = !!(keys.ShiftLeft || keys.ShiftRight || mouseBoost), drift = !!(keys.KeyQ || keys.ControlLeft);
    if (Math.abs(stick.x) > 0.12 || Math.abs(stick.y) > 0.12) { st = stick.x; th = -stick.y; }
    jump = jump || touchState.jump; boost = boost || touchState.boost; drift = drift || touchState.drift;
    // геймпад
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null;
    if (gp) {
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, bt = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      if (Math.abs(ax) > 0.15) st = ax;
      const rt = gp.buttons[7] ? gp.buttons[7].value : 0, lt = gp.buttons[6] ? gp.buttons[6].value : 0;
      if (Math.abs(ay) > 0.2) th = -ay; else if (rt > 0.1 || lt > 0.1) th = rt - lt;
      if (bt(0) && !padPrev[0]) jc++; if (bt(3) && !padPrev[3]) toggleCam();
      jump = jump || bt(0); boost = boost || bt(1) || bt(5); drift = drift || bt(2) || bt(4);
      padPrev = { 0: bt(0), 3: bt(3) };
    }
    input.th = Math.max(-1, Math.min(1, th)); input.st = Math.max(-1, Math.min(1, st)); input.jump = jump; input.boost = boost; input.drift = drift;
  }

  // ——— Матч ———
  let mode = 'menu', view = null, m = null, net = null, info = null, me = Net.id, acc = 0, last = 0, paused = false, backTo = 'play', lastJcApplied = 0, sentAt = 0, lastSent = '', steps = 0, offlineMap = null, offlineOpts = null, coinsAwarded = false, lastScore = [0, 0], prevPhase = '', lastBeep = -1;
  function ensureView() {
    if (view) return true;
    try { view = new TB.View($('#c')); addEventListener('resize', () => view && view.resize()); return true; }
    catch { toast('Браузер не поддерживает 3D (WebGL)'); return false; }
  }
  function begin(match) {
    m = match; acc = 0; last = performance.now(); paused = false; coinsAwarded = false; lastScore = [0, 0]; prevPhase = ''; steps = 0; lastBeep = -1;
    view.setArena(m.A);
    view.camPos.set(0, 25, (myCar() && myCar().team ? 1 : -1) * (m.A.L + 10));
    view.camLook.set(0, 0, 0);
    mode = 'match';
    $('#menu').hidden = true; $('#hud').hidden = false; $('#over').hidden = true; $('#pause').hidden = true; $('#editor').hidden = true;
    $('#camHint').textContent = ballCam ? '🎥 Камера на мяч (C)' : '🎥 Камера за машиной (C)';
    $('#feed').innerHTML = '';
  }
  const myCar = () => m && m.cars.find((c) => c.id === me);
  function startOffline(map, o = {}) {
    if (!ensureView()) return;
    offlineMap = map; offlineOpts = o; info = null; net = null;
    const size = o.size || P.prefs.size, bot = o.bot ?? P.prefs.bot;
    const players = Net.fillBots([{ id: me, name: Net.name(), team: 0, look: TB.look() }], size, bot);
    begin(new TB.Match({ map, rule: P.prefs.rule, size, players }));
  }
  async function startOnline(inf) {
    if (!ensureView()) return;
    Net.cancelQueue();
    info = inf; offlineMap = null;
    if (!inf.players.some((p) => p.id === me)) { toast('Этот матч уже без тебя'); return; }
    const match = new TB.Match({ map: inf.map, rule: inf.rule, size: inf.size, players: inf.players });
    match.client = inf.host !== me;
    begin(match);
    $('#banner').innerHTML = 'Подключаемся…';
    try {
      net = await Net.joinMatch(inf, match, {
        me,
        onEvent: (e) => handleEvent(e, true),
      });
    } catch { toast('Нет связи с сервером'); quit(); }
  }
  function quit() {
    if (net) { net.close(); net = null; }
    mode = 'menu'; m = null;
    $('#hud').hidden = true; $('#over').hidden = true; $('#pause').hidden = true; $('#menu').hidden = false;
    if (backTo === 'editor') { backTo = 'play'; $('#editor').hidden = false; edDraw(); return; }
    showTab(tab);
  }
  function togglePause() {
    if (mode !== 'match' || m.over) return;
    paused = !paused; $('#pause').hidden = !paused;
  }
  $('#pauseBtn').addEventListener('click', togglePause);
  $('#resume').addEventListener('click', togglePause);
  $('#quit').addEventListener('click', () => { if (!net || confirm('Выйти из сетевого матча? Твою машину заменит бот.')) quit(); });
  $('#overMenu').addEventListener('click', quit);
  $('#overAgain').addEventListener('click', () => {
    if (offlineMap) { startOffline(offlineMap, offlineOpts); return; }
    quit(); showTab('play');
    if (!Net.party() || Net.isLeader()) $('#playOnline').click();
  });

  // события матча: звук, частицы, надписи
  function feed(html) { const d = document.createElement('div'); d.innerHTML = html; $('#feed').prepend(d); setTimeout(() => d.remove(), 4200); }
  const teamName = (t) => (t ? '<span style="color:#ff8a1a">оранжевые</span>' : '<span style="color:#3a8bff">синие</span>');
  function handleEvent(e, remote) {
    const mc = myCar();
    switch (e.k) {
      case 'hit': if (!remote) { sfx.hit(e.power); if (e.power > 18) view.shake = 0.15; const b = m.ball.p; view.puff(b, '#ffffff', 8, 6, 0.4); } break;
      case 'jump': if (mc && e.id === mc.id) sfx.jump(); break;
      case 'flip': if (mc && e.id === mc.id) sfx.flip(); break;
      case 'pad': if (mc && e.id === mc.id) sfx.pad(e.big); break;
      case 'wall': if (e.v > 8) sfx.wall(e.v); break;
      case 'bump': sfx.bump(); break;
      case 'bonk': sfx.bonk(); break;
      case 'demo': sfx.demo(); view.puff(e.p, '#ff8a1a', 60, 18, 0.9, 4); view.puff(e.p, '#ffd23f', 30, 12, 0.7, 3); feed(`💥 ${esc(e.by)} взорвал ${esc(e.who)}`); if (net && net.host) net.sendEvent(e); break;
      case 'save': feed(`🧤 Сейв: ${esc(e.by)}`); if (net && net.host) net.sendEvent(e); break;
      case 'goal': {
        sfx.goal(); view.shake = 0.6;
        const b = m.ball.p, col = TB.TEAM[e.team];
        view.puff(b, col, 160, 30, 1.4, 8); view.puff(b, '#ffffff', 60, 22, 1.2, 6);
        const mine = mc && mc.team === e.team;
        $('#banner').innerHTML = `<span style="color:${col}">ГОЛ!</span><small>${e.by ? esc(e.by) + (e.own ? ' (в свои ворота)' : '') : ''}${e.speed ? ` · ${e.speed} км/ч` : ''}</small>`;
        $('#banner').dataset.until = performance.now() + 2600;
        feed(`⚽ ${e.by ? esc(e.by) : 'Гол'} — ${mine ? 'наша команда' : 'соперники'}`);
        if (net && net.host) net.sendEvent(e);
        break;
      }
      case 'ot': $('#banner').innerHTML = 'Овертайм!<small>Золотой гол</small>'; $('#banner').dataset.until = performance.now() + 2500; if (net && net.host) net.sendEvent(e); break;
      case 'left': feed(`🚪 ${esc(e.who)}`); break;
      case 'over': break;
      default: break;
    }
  }
  function hud() {
    const mc = myCar();
    $('#sc0').textContent = m.score[0]; $('#sc1').textContent = m.score[1];
    const t = Math.ceil(m.time);
    $('#clock').textContent = m.overtime ? 'ОТ' : m.rule.time ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` : `до ${m.rule.goals}`;
    const boost = m.rule.infBoost ? 100 : mc ? Math.round(mc.boost) : 0;
    $('#boostNum').textContent = m.rule.infBoost ? '∞' : boost; $('#boostArc').style.strokeDashoffset = String(264 - 264 * boost / 100);
    const ban = $('#banner'), until = +ban.dataset.until || 0;
    if (m.phase === 'kickoff') {
      const n = Math.ceil(m.phaseT); ban.innerHTML = n > 0 ? String(n) : '';
      if (n !== lastBeep && n > 0 && n <= 3) { sfx.beep(false); lastBeep = n; }
    } else if (prevPhase === 'kickoff' && m.phase === 'play') { sfx.beep(true); ban.innerHTML = 'Вперёд!'; ban.dataset.until = performance.now() + 700; lastBeep = -1; }
    else if (performance.now() > until && m.phase !== 'goal') ban.innerHTML = mc && mc.demo > 0 ? `💥<small>Возрождение через ${Math.ceil(mc.demo)}</small>` : '';
    if (net && !net.host && Date.now() - net.lastSnap > 2500 && m.phase !== 'over') ban.innerHTML = Date.now() - net.lastSnap > 8000 ? 'Ведущий матча пропал<small>Выйди в меню через ⏸</small>' : 'Связь…';
    prevPhase = m.phase;
  }
  function finishScreen() {
    if (coinsAwarded) return; coinsAwarded = true;
    const mc = myCar(), team = mc ? mc.team : 0, won = m.score[team] > m.score[1 - team], draw = m.score[0] === m.score[1];
    const st = mc ? mc.stats : { goals: 0, saves: 0, score: 0, shots: 0 };
    const coins = 20 + st.goals * 15 + st.saves * 10 + (won ? 50 : 0) + Math.min(30, Math.floor(st.score / 20));
    P.coins += coins; P.stats.games++; if (won) P.stats.wins++; P.stats.goals += st.goals; TB.save(); syncCoins();
    $('#overWho').textContent = (net ? '🌐 Сетевой матч' : '🤖 Матч с ботами') + ' · ' + (TB.RULES.find((r) => r.id === m.rule.id) || {}).name;
    $('#overTitle').textContent = won ? 'Победа!' : draw ? 'Ничья' : 'Поражение';
    $('#overScore').innerHTML = `<span class="t0">${m.score[0]}</span> : <span class="t1">${m.score[1]}</span>`;
    const rows = m.cars.slice().sort((a, b) => a.team - b.team || b.stats.score - a.stats.score);
    $('#overTable').innerHTML = '<div class="h"><span>Игрок</span><span>Голы</span><span>Сейвы</span><span>Очки</span></div>' + rows.map((c) => `<div class="${c.team ? 'o' : 'b'}${c.id === me ? ' me' : ''}"><span>${esc(c.name)}</span><span>${c.stats.goals}</span><span>${c.stats.saves}</span><span>${c.stats.score}</span></div>`).join('');
    $('#overCoins').textContent = `+${coins} 🪙`;
    $('#overAgain').textContent = offlineMap ? 'Ещё матч' : 'Искать новый матч';
    $('#over').hidden = false;
    if (won) [0, 0.15, 0.3].forEach((d) => tone(660 * (1 + d), 0.3, 'triangle', 0.08, 1.5, d));
  }

  // ——— Главный цикл ———
  let pv = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000 || 0)); last = Math.max(last, now);
    if (mode === 'menu') { if (tab === 'garage' && preview) preview.frame(Math.min(0.05, (now - pv) / 1000)); pv = now; return; }
    if (!m) return;
    readInput();
    const mc = myCar();
    if (!paused || net) {
      acc += dt;
      let n = 0;
      while (acc >= TB.DT && n < 6) {
        acc -= TB.DT; n++; steps++;
        if (mc) {
          mc.inp.th = input.th; mc.inp.st = input.st; mc.inp.boost = input.boost; mc.inp.drift = input.drift;
          // нажатие прыжка не теряется между кадрами
          if (jc !== lastJcApplied) { lastJcApplied = jc; mc.prevJump = false; mc.inp.jump = true; } else mc.inp.jump = input.jump;
        }
        m.step();
        for (const c of m.cars) if (c.pendingRelease) { c.inp.jump = false; c.pendingRelease = false; }
        for (const e of m.events) handleEvent(e, false);
        m.events.length = 0;
        if (net && net.host && steps % 4 === 0) net.sendSnap();
      }
      if (n >= 6) acc = 0;
    }
    if (net && !net.host && mc) {
      const sig = [input.th, input.st, input.jump, input.boost, input.drift, jc].join();
      if (sig !== lastSent || now - sentAt > 250) { if (now - sentAt > 45) { net.sendInput(input, jc); lastSent = sig; sentAt = now; } }
    }
    if (net && !net.host && (m.score[0] !== lastScore[0] || m.score[1] !== lastScore[1])) { /* гол придёт событием от ведущего */ }
    lastScore = m.score.slice();
    view.render(m, me, dt, { ballCam });
    hud();
    if (m.phase === 'over' && $('#over').hidden) finishScreen();
  }
  requestAnimationFrame(frame);

  // ——— Старт ———
  showTab('play');
  // #preview — кадр для обложки каталога
  if (location.hash === '#preview') {
    P.prefs.size = 2; startOffline(TB.ARENAS[1], { size: 2, bot: 2 });
    setTimeout(() => { if (m) { m.phase = 'play'; m.ball.p = [4, 6, 8]; } }, 100);
  }
  // для проверок на локальном сервере
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__tb = { get m() { return m; }, get view() { return view; }, get net() { return net; }, startOffline, startOnline, input, keys, get mode() { return mode; }, tick: (ms) => { const r = window.requestAnimationFrame; window.requestAnimationFrame = () => 0; try { frame(last + ms); } finally { window.requestAnimationFrame = r; } } };
})();
