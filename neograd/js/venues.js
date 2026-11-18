'use strict';
// Неоград: здания с дверями и комнатами внутри — оружейные, больница, автосалон, одежда, кафе,
// агентство недвижимости и свои квартиры. Здесь же покраска машины, такси по карте и доход с жилья.
(function () {
  const N = window.N, G = window.G, P = G.player, scene = G.scene;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => '$' + Math.floor(n).toLocaleString('ru-RU');
  const at = (i, j) => ({ x: N.roadX(i) + N.CELL / 2, z: N.roadX(j) + N.CELL / 2 });   // центр квартала

  // ---------- что где ----------
  G.HOMES = [
    { id: 'h1', n: 'Квартира у моря', price: 6000, income: 25, near: at(0, 6) },
    { id: 'h2', n: 'Дом в пригороде', price: 15000, income: 60, near: at(1, 11) },
    { id: 'h3', n: 'Пентхаус в центре', price: 45000, income: 160, near: at(7, 6) },
  ];
  const VDEF = [
    { id: 'gun1', type: 'guns', n: 'Оружейная «Калибр»', icon: '🔫', color: '#ff4f6d', near: at(6, 2) },
    { id: 'gun2', type: 'guns', n: 'Оружейная «Мишень»', icon: '🔫', color: '#ff4f6d', near: at(2, 9) },
    { id: 'hosp', type: 'hospital', n: 'Больница', icon: '🏥', color: '#5ac8ff', near: at(5, 4) },
    { id: 'cars', type: 'cars', n: 'Автосалон «Мотор»', icon: '🚗', color: '#ffb02e', near: at(9, 8) },
    { id: 'cloth', type: 'clothes', n: 'Одежда «Стиль»', icon: '👕', color: '#c77dff', near: at(5, 7) },
    { id: 'cafe1', type: 'cafe', n: 'Кафе «Бриз»', icon: '☕', color: '#7dff8a', near: at(0, 3) },
    { id: 'cafe2', type: 'cafe', n: 'Бургерная «Неон»', icon: '🍔', color: '#7dff8a', near: at(8, 5) },
    { id: 'realty', type: 'realty', n: 'Агентство недвижимости', icon: '🏢', color: '#ffd447', near: at(6, 8) },
  ].concat(G.HOMES.map((h) => ({ id: h.id, type: 'home', home: h, n: h.n, icon: '🏠', color: '#9fffd8', near: h.near })));
  G.PAINT = { x: N.roadX(10) + 3.5, z: N.roadX(3) + 30, n: 'Покраска «Хамелеон»', icon: '🎨' };

  // ---------- двери на фасадах ----------
  const used = new Set();
  function pickBuilding(near) {
    let best = null, bd = 1e9;
    for (const b of G.plan.buildings) { if (used.has(b)) continue; const d = Math.hypot(b.x - near.x, b.z - near.z); if (d < bd) { bd = d; best = b; } }
    used.add(best); return best;
  }
  // дверь на стороне, ближайшей к дороге
  function doorOf(b) {
    const bx = Math.floor(b.x / N.CELL), bz = Math.floor(b.z / N.CELL);
    const sides = [
      { d: (b.z - b.d / 2) - N.roadX(bz), x: b.x, z: b.z - b.d / 2, nx: 0, nz: -1 },
      { d: N.roadX(bz + 1) - (b.z + b.d / 2), x: b.x, z: b.z + b.d / 2, nx: 0, nz: 1 },
      { d: (b.x - b.w / 2) - N.roadX(bx), x: b.x - b.w / 2, z: b.z, nx: -1, nz: 0 },
      { d: N.roadX(bx + 1) - (b.x + b.w / 2), x: b.x + b.w / 2, z: b.z, nx: 1, nz: 0 },
    ].sort((a, c) => a.d - c.d);
    return sides[0];
  }
  function signTex(text, color) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d');
    g.fillStyle = '#14162a'; g.fillRect(0, 0, 512, 96); g.strokeStyle = color; g.lineWidth = 8; g.strokeRect(4, 4, 504, 88);
    g.fillStyle = color; g.font = '800 40px Manrope, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let t = text; while (g.measureText(t).width > 480 && t.length > 4) t = t.slice(0, -2); g.fillText(t, 256, 50);
    const tx = new THREE.CanvasTexture(c); tx.anisotropy = 4; return tx;
  }
  G.venues = [];
  G.buildVenues = function () {
    for (const v of VDEF) {
      const b = pickBuilding(v.near), dr = doorOf(b), yaw = Math.atan2(dr.nx, dr.nz);
      const g = new THREE.Group(); g.position.set(dr.x + dr.nx * 0.05, 0, dr.z + dr.nz * 0.05); g.rotation.y = yaw;
      N.cube(g, 2.4, 3.2, 0.3, '#3a2a20', 0, 1.6, 0.1); N.cube(g, 1.9, 2.8, 0.32, '#1a1d26', 0, 1.4, 0.12);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.1), new THREE.MeshBasicMaterial({ map: signTex(v.n, v.color) })); sign.position.set(0, 4.1, 0.3); g.add(sign);
      const mat = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.05, 1.6), new THREE.MeshBasicMaterial({ color: v.color, transparent: true, opacity: 0.55 })); mat.position.set(0, 0.22, 1.2); g.add(mat);
      scene.add(g);
      G.venues.push(Object.assign({}, v, { b, door: { x: dr.x + dr.nx * 1.8, z: dr.z + dr.nz * 1.8, yaw }, mat }));
    }
    // покраска: светящаяся площадка на дороге
    const pm = new THREE.Mesh(new THREE.BoxGeometry(6, 0.08, 9), new THREE.MeshBasicMaterial({ color: '#c77dff', transparent: true, opacity: 0.45 }));
    pm.position.set(G.PAINT.x, 0.05, G.PAINT.z); scene.add(pm); G.PAINT.mesh = pm;
  };
  G.venueSpots = () => G.venues.map((v) => ({ x: v.door.x, z: v.door.z, icon: v.icon, n: v.n, color: v.color, venue: v })).concat([{ x: G.PAINT.x, z: G.PAINT.z, icon: '🎨', n: G.PAINT.n, color: '#c77dff' }]);

  // ---------- комнаты ----------
  const IX = 4000, IZ = 4000;
  let room = null;
  const ROOMS = {
    guns: { w: 16, d: 12, floor: '#4a3a30', wall: '#6a5a4a', clerk: { shirt: '#3a3a3a' } },
    hospital: { w: 18, d: 14, floor: '#dfe8ee', wall: '#f2f6fa', clerk: { shirt: '#ffffff' } },
    cars: { w: 32, d: 24, floor: '#c8ccd4', wall: '#e8e6e0', clerk: { shirt: '#2a5ab0' } },
    clothes: { w: 18, d: 14, floor: '#e8d8c8', wall: '#f6ecf2', clerk: { shirt: '#c77dff' } },
    cafe: { w: 18, d: 14, floor: '#8a5a3a', wall: '#f2e6d2', clerk: { shirt: '#3ab06a' } },
    realty: { w: 16, d: 12, floor: '#5a5a66', wall: '#d8dce6', clerk: { shirt: '#2a2d3a' } },
    home: { w: 16, d: 14, floor: '#a07850', wall: '#f0e8dc' },
  };
  function buildRoom(v) {
    if (room) { scene.remove(room.g); }
    const R = ROOMS[v.type], g = new THREE.Group(), boxes = [], W = R.w, D = R.d, H = 5;
    const wall = (x, z, w, d, h = H, c = R.wall) => { N.cube(g, w, h, d, c, x, h / 2, z); boxes.push({ x0: IX + x - w / 2, x1: IX + x + w / 2, z0: IZ + z - d / 2, z1: IZ + z + d / 2, h }); };
    N.cube(g, W, 0.2, D, R.floor, 0, -0.1, 0); N.cube(g, W, 0.2, D, '#f8f8f8', 0, H + 0.1, 0);
    wall(0, -D / 2, W, 0.4); wall(-W / 2, 0, 0.4, D); wall(W / 2, 0, 0.4, D);
    wall(-W / 4 - 0.8, D / 2, W / 2 - 1.6, 0.4); wall(W / 4 + 0.8, D / 2, W / 2 - 1.6, 0.4);
    N.cube(g, 3.2, 1.8, 0.4, R.wall, 0, H - 0.9, D / 2); N.cube(g, 2.6, 3.2, 0.1, '#1a1d26', 0, 1.6, D / 2 + 0.25);
    // лампы
    for (const x of [-W / 4, W / 4]) N.cube(g, 1.6, 0.12, 1.6, '#fff6c8', x, H - 0.05, 0, '#ffeeaa');
    const spots = [];
    const counter = (c = '#5a4030') => { wall(0, -D / 2 + 2.4, 7, 1, 1.1, c); spots.push({ x: 0, z: -D / 2 + 3.6, act: 'counter' }); if (R.clerk) { const h = N.makeHuman(Object.assign(N.randomLook(), R.clerk)); h.position.set(0, 0, -D / 2 + 1.3); g.add(h); } };
    if (v.type === 'guns') { counter(); for (let k = -2; k <= 2; k++) { N.cube(g, 1.6, 2.4, 0.3, '#3a2a20', k * 2.6, 2.4, -D / 2 + 0.4); N.cube(g, 1.1, 0.18, 0.12, '#222', k * 2.6, 2.8, -D / 2 + 0.6); N.cube(g, 0.8, 0.14, 0.12, '#333', k * 2.6, 2.1, -D / 2 + 0.6); } }
    if (v.type === 'hospital') { counter('#e8eef2'); for (const x of [-6, 6]) { wall(x, 2, 2.2, 4, 0.7, '#ffffff'); N.cube(g, 2.2, 0.3, 1, '#7cc4ff', x, 0.8, 0.5); } N.cube(g, 1.2, 1.2, 0.1, '#ff3b3b', 0, 3.6, -D / 2 + 0.25); }
    if (v.type === 'cars') { counter('#2a2d3a'); const types = ['sedan', 'sport', 'buggy', 'truck']; types.forEach((t, k) => { const m = N.makeCar(t, N.CARCOLORS[k * 2]); m.position.set(-11 + k * 7.3, 0, 3); m.rotation.y = 0.5; g.add(m); boxes.push({ x0: IX - 13 + k * 7.3, x1: IX - 9 + k * 7.3, z0: IZ + 0.5, z1: IZ + 5.5, h: 2 }); }); }
    if (v.type === 'clothes') { counter('#e8d8f0'); for (let k = 0; k < 4; k++) { wall(-6 + k * 4, 2, 2.6, 0.3, 2.2, '#b0b0b8'); for (let q = 0; q < 4; q++) N.cube(g, 0.5, 0.9, 0.2, N.CARCOLORS[(k * 4 + q) % 9], -6.9 + k * 4 + q * 0.6, 1.5, 2.25); } }
    if (v.type === 'cafe') { counter('#5a3a20'); for (const [x, z] of [[-5, 1], [5, 1], [-5, 4.5], [5, 4.5]]) { wall(x, z, 1.6, 1.6, 0.9, '#d8b080'); N.cube(g, 0.5, 0.5, 0.5, '#8a5a3a', x - 1.2, 0.25, z); N.cube(g, 0.5, 0.5, 0.5, '#8a5a3a', x + 1.2, 0.25, z); } }
    if (v.type === 'realty') { counter('#2a2d3a'); for (let k = 0; k < 3; k++) { N.cube(g, 2.4, 1.6, 0.1, ['#3a8aff', '#3ab06a', '#ffd447'][k], -4 + k * 4, 3, -D / 2 + 0.25); } }
    if (v.type === 'home') {
      wall(-5, -4, 3, 4, 0.7, '#ffffff'); N.cube(g, 3, 0.3, 1.2, '#ff7a9a', -5, 0.85, -5.3); spots.push({ x: -5, z: -1.3, act: 'bed' });
      wall(5, -D / 2 + 0.6, 3, 1, 3.4, '#8a5a3a'); spots.push({ x: 5, z: -D / 2 + 2.2, act: 'wardrobe' });
      wall(0, 2, 4, 1.4, 0.8, '#5a6a9a'); N.cube(g, 3, 0.4, 0.3, '#222', 0, 2.4, -D / 2 + 0.3);
      wall(5, 3, 2, 2, 0.8, '#c8a070');
    }
    spots.push({ x: 0, z: D / 2 - 1.4, act: 'exit' });
    for (const s of spots) { if (s.act === 'exit') continue; const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 1.6), new THREE.MeshBasicMaterial({ color: v.color || '#9fffd8', transparent: true, opacity: 0.6 })); m.position.set(s.x, 0.03, s.z); g.add(m); }
    g.position.set(IX, 0, IZ); scene.add(g);
    G.icol = N.Collide(boxes);
    room = { g, v, spots: spots.map((s) => Object.assign(s, { x: IX + s.x, z: IZ + s.z })), D };
  }

  // ---------- вход и выход ----------
  let cool = 0;
  function enter(v) {
    if (G.wanted > 0) { G.toast('Дверь не открывается — тебя ищет полиция'); return; }
    if (v.type === 'home' && !G.homes.has(v.home.id)) { G.toast(`«${v.home.n}» продаётся — купи в агентстве недвижимости за ${fmt(v.home.price)}`, 3500); return; }
    buildRoom(v); G.inside = v;
    P.x = IX; P.z = IZ + room.D / 2 - 3.4; P.y = 0; P.vy = 0; P.yaw = Math.PI; G.cam.yaw = 0; G.cam.pitch = -0.15;
    G.sfx('door'); cool = 1; G.toast(v.n);
  }
  function leave() {
    const v = G.inside; G.inside = null; if (room) { scene.remove(room.g); room = null; }
    v.on = true;
    P.x = v.door.x + Math.sin(v.door.yaw) * 1.2; P.z = v.door.z + Math.cos(v.door.yaw) * 1.2; P.y = 0; P.vy = 0; P.yaw = v.door.yaw; G.cam.yaw = v.door.yaw + Math.PI; G.sfx('door'); cool = 1.2;
  }
  G.leaveInside = () => { if (G.inside) leave(); };
  G.tickVenues = function (dt) {
    if (cool > 0) cool -= dt;
    // доход с жилья
    const inc = G.HOMES.filter((h) => G.homes.has(h.id)).reduce((s, h) => s + h.income, 0);
    if (inc) { G.incomeAcc = (G.incomeAcc || 0) + inc / 60 * dt; G.incomeT = (G.incomeT || 0) + dt; if (G.incomeT >= 60) { const n = Math.floor(G.incomeAcc); G.money += n; G.incomeAcc -= n; G.incomeT = 0; G.toast('Доход с жилья: +' + fmt(n)); G.uiDirty = true; } }
    for (const v of G.venues) v.mat.material.opacity = 0.4 + Math.sin(G.t * 4) * 0.15;
    if (G.PAINT.mesh) G.PAINT.mesh.material.opacity = 0.35 + Math.sin(G.t * 3) * 0.12;
    if (G.dead || cool > 0) return;
    if (G.inside) {
      for (const s of room.spots) {
        const d = Math.hypot(s.x - P.x, s.z - P.z);
        if (d < 1.1 && !s.on) { s.on = true; if (s.act === 'exit') return leave(); if (s.act === 'counter') openVenue(G.inside); if (s.act === 'bed') openBed(); if (s.act === 'wardrobe') openWardrobe(); }
        else if (d > 1.8) s.on = false;
      }
      return;
    }
    if (P.mode === 'foot') for (const v of G.venues) { const d = Math.hypot(v.door.x - P.x, v.door.z - P.z); if (d < 1.2 && !v.on) { v.on = true; enter(v); return; } else if (d > 2.5) v.on = false; }
    // покраска: заезжаешь — машина меняет цвет, розыск снимается
    if (P.mode === 'car') { const d = Math.hypot(G.PAINT.x - P.x, G.PAINT.z - P.z); if (d < 4 && !G.PAINT.on) { G.PAINT.on = true; paint(); } else if (d > 8) G.PAINT.on = false; }
  };
  function paint() {
    const cost = 300 + Math.ceil(G.wanted) * 200;
    if (G.money < cost) { G.toast('Покраска стоит ' + fmt(cost)); return; }
    G.money -= cost; const v = P.veh, col = N.CARCOLORS[(Math.random() * N.CARCOLORS.length) | 0];
    v.model.children[0].material = N.mat(col);
    const lost = G.wanted > 0; G.wanted = 0;
    for (const c of G.vehicles) if (c.chase) c.chase = false;
    G.sfx('cash'); G.toast(`Машина перекрашена за ${fmt(cost)}${lost ? ' — полиция тебя потеряла' : ''}`, 3500); G.uiDirty = true;
  }

  // ---------- окна заведений ----------
  function panel(title, html) { $('venueTitle').textContent = title; $('venueMoney').textContent = fmt(G.money); $('venueList').innerHTML = html; G.showScreen('venue'); }
  const item = (name, sub, act, price, disabled, label) => `<div class="item"><div><b>${name}</b><small>${sub || ''}</small></div><button type="button" data-act="${act}" ${disabled || G.money < price ? 'disabled' : ''}>${label || (price ? fmt(price) : 'Взять')}</button></div>`;
  let current = null;
  function openVenue(v) {
    current = v;
    if (v.type === 'guns') { G.openShop(); return; }
    if (v.type === 'hospital') return panel(v.n, item('Лечение', P.hp >= 100 ? 'ты здоров' : 'здоровье до 100', 'heal', 100, P.hp >= 100) + item('Бронежилет', 'поглощает часть урона', 'armor', 500, P.armor >= 100));
    if (v.type === 'cafe') return panel(v.n, [['Кофе', 15, 15], ['Пончик', 25, 25], ['Бургер', 45, 50], ['Большой обед', 90, 100]].map(([n, p, hp]) => item(n, '+' + hp + ' здоровья', 'food:' + hp + ':' + p, p, P.hp >= 100)).join(''));
    if (v.type === 'cars') return panel(v.n, Object.entries(CAR_PRICES).map(([t, p]) => item(N.CARS[t].n, `до ${Math.round(N.CARS[t].max * 3.6)} км/ч · ${G.garage.filter((c) => c.type === t).length ? 'уже есть в гараже' : 'встанет у входа'}`, 'car:' + t, p)).join('') + '<p>Свои машины можно вызвать в любой момент из паузы за $50.</p>');
    if (v.type === 'clothes') return openClothes();
    if (v.type === 'realty') return panel(v.n, G.HOMES.map((h) => item(h.n, G.homes.has(h.id) ? 'твоё · доход ' + fmt(h.income) + ' в минуту' : `доход ${fmt(h.income)} в минуту игры, кровать лечит, гардероб`, 'home:' + h.id, h.price, G.homes.has(h.id), G.homes.has(h.id) ? 'Куплено' : null)).join(''));
  }
  const CAR_PRICES = { sedan: 2500, buggy: 3500, truck: 4500, sport: 9000 };
  G.CAR_PRICES = CAR_PRICES;
  const SHIRTS = [['#e8443a', 'Красная'], ['#3a7be8', 'Синяя'], ['#f2c230', 'Жёлтая'], ['#3ab06a', 'Зелёная'], ['#ffffff', 'Белая'], ['#8a4ae8', 'Фиолетовая'], ['#ff8a2a', 'Оранжевая'], ['#2a2d3a', 'Чёрная'], ['#e86ab0', 'Розовая']];
  const PANTS = [['#2a3a5a', 'Джинсы'], ['#3a3a3a', 'Чёрные брюки'], ['#6a5a4a', 'Хаки'], ['#8a8a90', 'Серые'], ['#f2f2f2', 'Белые']];
  const HATS = [[null, 'Без кепки'], ['#e8443a', 'Красная кепка'], ['#2a2d3a', 'Чёрная кепка'], ['#3ab06a', 'Зелёная кепка'], ['#ffd447', 'Жёлтая кепка']];
  function openClothes() {
    const row = (list, part, price) => list.map(([c, n]) => item(`<span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${c || 'transparent'};border:1px solid #fff4;vertical-align:-2px"></span> ${n}`, G.look[part] === c ? 'надето' : G.wardrobe.has(part + c) ? 'уже куплено' : '', `wear:${part}:${c}`, G.wardrobe.has(part + c) || !c ? 0 : price, G.look[part] === c, G.look[part] === c ? 'Надето' : G.wardrobe.has(part + c) || !c ? 'Надеть' : null)).join('');
    panel('Одежда «Стиль»', '<h3>Футболки — $150</h3>' + row(SHIRTS, 'shirt', 150) + '<h3>Брюки — $120</h3>' + row(PANTS, 'pants', 120) + '<h3>Кепки — $80</h3>' + row(HATS, 'hat', 80) + item('Тёмные очки', G.look.glasses ? 'надеты' : '', 'glasses', G.wardrobe.has('glasses') ? 0 : 200, false, G.look.glasses ? 'Снять' : G.wardrobe.has('glasses') ? 'Надеть' : null));
  }
  function openBed() { panel('Кровать', item('Поспать', 'здоровье до 100 и сохранение игры', 'sleep', 0, false, 'Лечь спать')); }
  function openWardrobe() { current = { type: 'clothes' }; openClothes(); $('venueTitle').textContent = 'Гардероб'; }
  G.applyLook = function () {
    const old = P.model, vis = old.visible; scene.remove(old);
    P.model = N.makeHuman(G.look); P.model.visible = vis; scene.add(P.model);
  };
  $('venueList').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]'); if (!b || b.disabled) return;
    const [act, a1, a2] = b.dataset.act.split(':');
    const pay = (n) => { if (G.money < n) return false; G.money -= n; G.sfx('cash'); G.uiDirty = true; return true; };
    if (act === 'heal' && pay(100)) P.hp = 100;
    if (act === 'armor' && pay(500)) P.armor = 100;
    if (act === 'food' && pay(+a2)) { P.hp = Math.min(100, P.hp + +a1); G.toast('Вкусно! +' + a1 + ' здоровья'); }
    if (act === 'car' && pay(CAR_PRICES[a1])) {
      const color = N.CARCOLORS[(Math.random() * N.CARCOLORS.length) | 0]; G.garage.push({ type: a1, color });
      G.toast(N.CARS[a1].n + ' ждёт у входа', 3000); spawnOwned({ type: a1, color }, current.door.x + Math.sin(current.door.yaw) * 4, current.door.z + Math.cos(current.door.yaw) * 4);
    }
    if (act === 'home') { const h = G.HOMES.find((q) => q.id === a1); if (h && pay(h.price)) { G.homes.add(h.id); G.toast(`«${h.n}» теперь твоя! Иди к двери с 🏠`, 4000); G.refreshMap && G.refreshMap(); } }
    if (act === 'wear') { const part = a1, c = a2 === 'null' ? null : a2, key = part + c, price = { shirt: 150, pants: 120, hat: 80 }[part]; if (c && !G.wardrobe.has(key)) { if (!pay(price)) return; G.wardrobe.add(key); } G.look[part] = c; G.applyLook(); G.sfx('click'); return openClothes(); }
    if (act === 'glasses') { if (!G.wardrobe.has('glasses')) { if (!pay(200)) return; G.wardrobe.add('glasses'); } G.look.glasses = !G.look.glasses; G.applyLook(); return openClothes(); }
    if (act === 'sleep') { P.hp = 100; if (G.save) G.save(); G.toast('Ты выспался. Игра сохранена'); G.closeScreen(); return; }
    if (G.save) G.save();
    openVenue(current);
  });

  // ---------- свои машины ----------
  function spawnOwned(c, x, z) { const v = G.spawnCar(c.type, x, z, Math.random() * 6.28, c.color); v.keep = true; v.owned = true; G.col.push(v, 2.5, 0); return v; }
  G.callCar = function (i) {
    const c = G.garage[i]; if (!c) return;
    if (G.inside) { G.toast('Выйди на улицу'); return; }
    if (G.money < 50) { G.toast('Вызов стоит $50'); return; }
    G.money -= 50; for (const v of G.vehicles) if (v.owned && v.driver !== 'player') { v.removed = true; scene.remove(v.model); }
    const [i2, j2] = N.nearestNode(P.x, P.z), nd = N.node(i2, j2);
    spawnOwned(c, nd.x + 3.5, nd.z + 9); G.toast(N.CARS[c.type].n + ' ждёт на ближайшем перекрёстке'); G.target = { x: nd.x + 3.5, z: nd.z + 9 }; setTimeout(() => { if (!G.activeMission()) G.target = null; }, 15000);
  };

  // ---------- такси по карте ----------
  G.taxiTo = function (x, z, name) {
    if (G.wanted > 0) { G.toast('С розыском такси не возьмёт'); return false; }
    if (P.mode !== 'foot' || G.inside) { G.toast('Выйди из машины и из здания'); return false; }
    const cost = Math.round(40 + Math.hypot(x - P.x, z - P.z) * 0.25);
    if (G.money < cost) { G.toast('Такси стоит ' + fmt(cost)); return false; }
    G.money -= cost; P.x = x; P.z = z; P.y = 0; G.col.push(P, 0.6, 0); G.sfx('cash'); G.toast(`Такси до «${name}» — ${fmt(cost)}`); G.uiDirty = true; return true;
  };
  G.taxiCost = (x, z) => Math.round(40 + Math.hypot(x - P.x, z - P.z) * 0.25);
})();
