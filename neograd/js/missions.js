'use strict';
// Неоград: задания, магазины, больница и тайники.
(function () {
  const N = window.N, G = window.G, P = G.player, scene = G.scene;
  const sw = (i, j, dx = 1, dz = 1) => ({ x: N.roadX(i) + dx * (N.ROAD / 2 + 2), z: N.roadX(j) + dz * (N.ROAD / 2 + 2) });  // точка на тротуаре у перекрёстка
  const rd = (i, j) => ({ x: N.roadX(i) + 3.5, z: N.roadX(j) });                                              // точка на дороге

  // ---------- маркеры ----------
  const beamGeo = new THREE.BoxGeometry(1, 1, 1);
  function beam(x, z, color, h = 30, w = 3, y = 0) {
    const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, depthWrite: false }));
    m.scale.set(w, h, w); m.position.set(x, y + h / 2, z); scene.add(m); return m;
  }
  const ringGeo = new THREE.BoxGeometry(1, 1, 1);
  function ring(x, y, z, yaw) {
    const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: '#ffd447', transparent: true, opacity: 0.8 });
    for (const [w, h, ox, oy] of [[16, 1, 0, 8], [16, 1, 0, -8], [1, 16, 8, 0], [1, 16, -8, 0]]) { const b = new THREE.Mesh(ringGeo, m); b.scale.set(w, h, 1); b.position.set(ox, oy, 0); g.add(b); }
    g.position.set(x, y, z); g.rotation.y = yaw; scene.add(g); return g;
  }
  let active = null, target = null, targetMesh = null, timer = 0, stepData = null;
  G.target = null;
  function setTarget(x, z, color = '#ffd447', y = 0, w = 6) {
    if (targetMesh) scene.remove(targetMesh);
    target = { x, z, y }; G.target = target; targetMesh = beam(x, z, color, 60, w, y);
  }
  function clearTarget() { if (targetMesh) scene.remove(targetMesh); targetMesh = null; target = null; G.target = null; }

  // ---------- задания ----------
  const GARAGE = sw(1, 9, 1, -1), DOCK = { x: N.BEACH + 25, z: N.roadX(10) }, PARK = { x: N.roadX(3) + 37, z: N.roadX(7) + 37 }, WARE = { x: N.roadX(11) + 37, z: N.roadX(11) + 37 };
  const RUNWAY_END = { x: N.AIR.x0 + 60, z: N.AIR.rz };
  G.MISSIONS = [
    { id: 'm1', n: 'Новый в городе', giver: sw(2, 2), reward: 500,
      brief: 'Привет! Я Тимур, держу гараж на западе города. Возьми любую машину — просто подойди к ней и нажми «Сесть» — и приезжай ко мне.',
      steps: [{ t: 'goto', ...GARAGE, r: 6, car: true, text: 'Сядь в машину и доберись до гаража Тимура' }] },
    { id: 'm2', n: 'Доставка спорткара', giver: GARAGE, reward: 900,
      brief: 'Клиент ждёт свой спорткар на набережной. У тебя 80 секунд, и постарайся его не разбить.',
      steps: [{ t: 'enter', spawn: { type: 'sport', ...rd(1, 8), yaw: 0, color: '#2a9aff' }, text: 'Сядь в синий спорткар' }, { t: 'goto', ...DOCK, r: 7, car: true, mustBeMissionCar: true, time: 80, text: 'Доставь спорткар на набережную' }] },
    { id: 'm3', n: 'Гонка по кварталам', giver: sw(5, 5), reward: 1500,
      brief: 'Уличная гонка: восемь контрольных точек за 110 секунд. Подойдёт любая машина.',
      steps: [{ t: 'race', car: true, time: 110, pts: [rd(5, 2), rd(9, 2), rd(9, 5), rd(11, 8), rd(7, 10), rd(3, 10), rd(2, 6), rd(5, 5)], text: 'Проедь все точки' }] },
    { id: 'm4', n: 'Разборка в парке', giver: sw(4, 6, -1, -1), reward: 2000, gift: { w: 'smg', ammo: 120 },
      brief: 'Банда «Красных курток» заняла парк и пугает людей. Прогони их. Держи пистолет-пулемёт.',
      steps: [{ t: 'kill', at: PARK, n: 5, text: 'Разберись с бандой в парке' }] },
    { id: 'm5', n: 'Таксист', giver: sw(7, 4), reward: 1200,
      brief: 'Подработай в такси: три пассажира, отвези каждого куда скажет.',
      steps: [{ t: 'enter', spawn: { type: 'taxi', ...rd(7, 3), yaw: 0 }, text: 'Сядь в такси' }, { t: 'taxi', n: 3, text: 'Забери пассажира' }] },
    { id: 'm6', n: 'Лётная школа', giver: { x: 380, z: -95 }, reward: 2500,
      brief: 'Самолёт на полосе. W/S — газ, стрелки или джойстик — нос и крен. Разгонись, пролети сквозь шесть колец и сядь обратно на полосу.',
      steps: [{ t: 'enterKind', kind: 'plane', text: 'Сядь в самолёт на полосе' }, { t: 'rings', pts: [[620, 30, N.AIR.rz], [880, 60, 60], [700, 90, 400], [300, 70, 500], [100, 50, 200], [300, 30, N.AIR.rz]], text: 'Пролети через кольца' }, { t: 'land', ...RUNWAY_END, r: 120, kind: 'plane', text: 'Приземлись на взлётную полосу' }] },
    { id: 'm7', n: 'Горячая погоня', giver: sw(9, 7), reward: 2200,
      brief: 'Мне нужно отвлечь полицию. Подними розыск до двух звёзд — и оторвись от них.',
      steps: [{ t: 'wanted', stars: 2, text: 'Получи две звезды розыска' }, { t: 'lose', text: 'Оторвись от полиции' }] },
    { id: 'm8', n: 'Большое дело', giver: sw(10, 10), reward: 6000, gift: { w: 'rifle', ammo: 90 },
      brief: 'Последнее дело: склад банды на окраине. Разберись с охраной, потом лети на вертолёте с аэропорта на крышу самой высокой башни.',
      steps: [{ t: 'kill', at: WARE, n: 7, text: 'Захвати склад' }, { t: 'enterKind', kind: 'heli', text: 'Доберись до вертолёта в аэропорту' }, { t: 'land', roof: true, kind: 'heli', r: 14, text: 'Сядь на крышу самой высокой башни' }] },
  ];
  G.done = new Set();

  // ---------- точки заданий, магазины, больница ----------
  const spots = [];
  G.SHOPS = [{ ...sw(6, 3, -1, 1), kind: 'shop' }, { ...sw(2, 9, 1, 1), kind: 'shop' }, { ...G.HOSPITAL, kind: 'hospital' }];
  G.refreshSpots = function () {
    for (const s of spots) scene.remove(s.m); spots.length = 0;
    if (!active) {
      const next = G.MISSIONS.find((m) => !G.done.has(m.id));
      for (const m of G.MISSIONS) if (!G.done.has(m.id) && (m === next || G.done.size >= 3)) spots.push({ m: beam(m.giver.x, m.giver.z, '#ffd447', 14, 2.2), x: m.giver.x, z: m.giver.z, mission: m });
    }
    for (const s of G.SHOPS) spots.push({ m: beam(s.x, s.z, s.kind === 'shop' ? '#ff4f6d' : '#5ac8ff', 6, 2), x: s.x, z: s.z, kind: s.kind });
  };
  G.spots = () => spots;

  // ---------- тайники ----------
  G.PKGS = [];
  { const r = N.rng(99); for (let k = 0; k < 12; k++) { const bx = (r() * N.GN) | 0, bz = (r() * N.GN) | 0; const c = sw(bx, bz, 1, 1); G.PKGS.push({ id: k, x: c.x + 2, z: c.z + 2 }); } G.PKGS.push({ id: 12, x: N.BEACH + 5, z: -80 }, { id: 13, x: 880, z: -260 }); }
  G.foundPkgs = new Set();
  G.placePkgs = () => { for (const p of G.PKGS) if (!G.foundPkgs.has(p.id)) G.spawnPickup('pkg', p.x, p.z, 250, { pkg: p.id }); };
  G.foundPkg = function (p) {
    G.foundPkgs.add(p.pkg); G.money += 250;
    G.toast(`Тайник ${G.foundPkgs.size} из ${G.PKGS.length}: +$250`);
    if (G.foundPkgs.size === G.PKGS.length) { G.money += 5000; G.weapons.rifle = (G.weapons.rifle || 0) + 120; G.toast('Все тайники найдены! +$5000 и автомат', 5000); G.sfx('mission'); }
  };
  // оружие и бронежилеты лежат по городу
  G.placeWorldPickups = () => {
    G.spawnPickup('health', N.roadX(4) + 37, N.roadX(7) + 37, 0, { respawn: 60 });
    G.spawnPickup('armor', N.roadX(8) + 10, N.roadX(1) + 10, 0, { respawn: 90 });
    G.spawnPickup('weapon', N.BEACH + 15, 150, 30, { w: 'shotgun', respawn: 120 });
    G.spawnPickup('weapon', N.roadX(11) + 10, N.roadX(5) + 10, 60, { w: 'smg', respawn: 120 });
    G.spawnPickup('health', 600, -60, 0, { respawn: 60 });
  };

  // ---------- выполнение ----------
  let missionCar = null, spawned = [], rings = [];
  G.activeMission = () => active;
  G.startMission = function (m) {
    active = m; G.stepI = -1; spawned = []; missionCar = null;
    if (m.gift) { G.weapons[m.gift.w] = (G.weapons[m.gift.w] || 0) + m.gift.ammo; G.cur = m.gift.w; G.uiDirty = true; }
    G.refreshSpots(); G.sfx('mission'); nextStep();
  };
  function nextStep() {
    G.stepI++; clearTarget(); timer = 0; stepData = {};
    for (const r of rings) scene.remove(r); rings = [];
    const s = active.steps[G.stepI];
    if (!s) return finish(true);
    G.missionText = s.text; timer = s.time || 0;
    if (s.t === 'goto') setTarget(s.x, s.z);
    if (s.t === 'enter') { const v = G.spawnCar(s.spawn.type, s.spawn.x, s.spawn.z, s.spawn.yaw, s.spawn.color); v.keep = true; v.mission = true; missionCar = v; setTarget(v.x, v.z, '#5aff8a', 0, 3); }
    if (s.t === 'enterKind') { const v = G.vehicles.find((q) => q.kind === s.kind && q.hp > 0 && !q.removed && (s.kind !== 'heli' || q.y < 1)) || G.spawnAir(s.kind, s.kind === 'plane' ? 520 : 760, s.kind === 'plane' ? N.AIR.rz : -40, Math.PI / 2); v.keep = true; missionCar = v; setTarget(v.x, v.z, '#5aff8a', 0, 4); }
    if (s.t === 'race') { stepData.k = 0; setTarget(s.pts[0].x, s.pts[0].z); }
    if (s.t === 'kill') { for (let k = 0; k < s.n; k++) { const h = G.spawnHuman(G.gang, s.at.x + (Math.random() - 0.5) * 30, s.at.z + (Math.random() - 0.5) * 30, { gang: true, hp: 70, mission: true }); spawned.push(h); } setTarget(s.at.x, s.at.z, '#ff4f6d', 0, 4); }
    if (s.t === 'rings') { stepData.k = 0; for (let k = 0; k < s.pts.length; k++) { const [x, y, z] = s.pts[k], nx = s.pts[(k + 1) % s.pts.length]; rings.push(ring(x, y, z, Math.atan2(nx[0] - x, nx[2] - z))); } setTarget(s.pts[0][0], s.pts[0][2], '#ffd447', 0, 2); }
    if (s.t === 'land') { if (s.roof) setTarget(G.roofHeli.x, G.roofHeli.z, '#5aff8a', G.roofHeli.h, 10); else setTarget(s.x, s.z, '#5aff8a', 0, 12); }
    if (s.t === 'taxi') { stepData.trip = 0; taxiPickup(); }
    if (G.onStep) G.onStep(s);
  }
  function taxiPickup() {
    const i = 1 + ((Math.random() * (N.GN - 2)) | 0), j = 1 + ((Math.random() * (N.GN - 2)) | 0), c = sw(i, j);
    const h = G.spawnHuman(G.peds, c.x, c.z, { mission: true }); stepData.pax = h; stepData.phase = 'pick'; setTarget(c.x, c.z, '#5aff8a', 0, 4);
    G.missionText = `Забери пассажира (${stepData.trip + 1} из 3)`;
  }
  function finish(ok, why) {
    clearTarget(); for (const r of rings) scene.remove(r); rings = [];
    for (const h of spawned) if (!h.removed && h.state !== 'dead') { G.scene.remove(h.model); h.removed = true; }
    const m = active; active = null; G.missionText = '';
    if (ok) { G.done.add(m.id); G.money += m.reward; G.sfx('mission'); G.big('Задание выполнено', `«${m.n}» · +$${m.reward}`); if (G.done.size === G.MISSIONS.length) setTimeout(() => G.big('Неоград твой!', 'Все задания пройдены'), 3500); if (G.save) G.save(); }
    else { G.sfx('fail'); G.big('Задание провалено', why || ''); }
    G.refreshSpots();
  }
  G.cancelMission = (why) => { if (active) finish(false, why); };

  G.tickMissions = function (dt) {
    // точки: магазин, больница, начало задания (только пешком)
    if (P.mode === 'foot' && !G.dead) for (const s of spots) {
      const d = Math.hypot(s.x - P.x, s.z - P.z);
      if (d < 2) { if (!s.inside) { s.inside = true; if (s.mission) G.openBrief(s.mission); else if (s.kind === 'shop') G.openShop(); else if (s.kind === 'hospital') G.openHospital(); } }
      else if (d > 3) s.inside = false;
    }
    if (targetMesh) targetMesh.material.opacity = 0.25 + Math.sin(G.t * 4) * 0.08;
    for (const r of rings) r.rotation.z += dt * 0.5;
    if (!active) return;
    const s = active.steps[G.stepI]; if (!s) return;
    if (G.dead) return finish(false, 'Ты попал в больницу');
    if (timer > 0) { timer -= dt; G.missionTimer = timer; if (timer <= 0) return finish(false, 'Время вышло'); } else G.missionTimer = 0;
    if (missionCar && (missionCar.hp <= 0 || missionCar.removed) && (s.mustBeMissionCar || s.t === 'enter' || s.t === 'enterKind' || s.t === 'rings' || s.t === 'land')) return finish(false, 'Транспорт уничтожен');
    const inCar = P.mode === 'car', d2 = (x, z) => Math.hypot(x - P.x, z - P.z);
    if (s.t === 'goto') {
      G.missionText = s.text + (s.car && !inCar ? ' (нужна машина)' : '');
      if (d2(s.x, s.z) < s.r && (!s.car || inCar) && (!s.mustBeMissionCar || P.veh === missionCar)) { if (P.veh && P.veh.kind === 'car') P.veh.speed *= 0.3; nextStep(); }
    } else if (s.t === 'enter' || s.t === 'enterKind') {
      if (missionCar && !missionCar.removed) target && (target.x = missionCar.x, target.z = missionCar.z, targetMesh.position.x = missionCar.x, targetMesh.position.z = missionCar.z);
      if (P.veh === missionCar) nextStep();
    } else if (s.t === 'race') {
      const p = s.pts[stepData.k];
      G.missionText = `${s.text}: ${stepData.k} из ${s.pts.length}` + (!inCar ? ' (нужна машина)' : '');
      if (inCar && d2(p.x, p.z) < 10) { G.sfx('check'); stepData.k++; if (stepData.k >= s.pts.length) return nextStep(); const q = s.pts[stepData.k]; setTarget(q.x, q.z); }
    } else if (s.t === 'kill') {
      const left = spawned.filter((h) => !h.removed && h.state !== 'dead').length;
      G.missionText = `${s.text}: осталось ${left}`;
      if (left) { const h = spawned.find((q) => !q.removed && q.state !== 'dead'); if (h) { target.x = h.x; target.z = h.z; targetMesh.position.x = h.x; targetMesh.position.z = h.z; } }
      if (!left) { spawned = []; nextStep(); }
    } else if (s.t === 'rings') {
      const [x, y, z] = s.pts[stepData.k];
      G.missionText = `${s.text}: ${stepData.k} из ${s.pts.length}`;
      if (P.mode !== 'plane') { G.missionText = 'Вернись в самолёт'; return; }
      if (Math.hypot(x - P.x, y - P.y, z - P.z) < 11) {
        G.sfx('check'); scene.remove(rings[stepData.k]); stepData.k++;
        if (stepData.k >= s.pts.length) return nextStep();
        const q = s.pts[stepData.k]; setTarget(q[0], q[2], '#ffd447', 0, 2);
      }
    } else if (s.t === 'land') {
      const v = P.veh;
      const tx = s.roof ? G.roofHeli.x : s.x, tz = s.roof ? G.roofHeli.z : s.z;
      if (v && v.kind === s.kind && d2(tx, tz) < s.r && v.speed < 6 && Math.abs(v.y - (s.roof ? G.roofHeli.h + 0.4 : 0)) < (s.roof ? 1.5 : 0.6)) nextStep();
    } else if (s.t === 'taxi') {
      const h = stepData.pax;
      if (P.mode !== 'car' || P.veh.type !== 'taxi') G.missionText = 'Вернись в такси';
      else if (stepData.phase === 'pick') {
        G.missionText = `Забери пассажира (${stepData.trip + 1} из 3)`;
        if (!h || h.removed || h.state === 'dead') return finish(false, 'Пассажир пострадал');
        if (d2(h.x, h.z) < 7 && Math.abs(P.veh.speed) < 3) {
          h.model.visible = false; h.state = 'ride'; h.removed = true; scene.remove(h.model);
          stepData.phase = 'drop'; const i = 1 + ((Math.random() * (N.GN - 2)) | 0), j = 1 + ((Math.random() * (N.GN - 2)) | 0), c = sw(i, j); stepData.drop = c; setTarget(c.x, c.z, '#ffd447', 0, 5); timer = 60; G.sfx('door');
        }
      } else {
        G.missionText = `Отвези пассажира (${stepData.trip + 1} из 3)`;
        if (d2(stepData.drop.x, stepData.drop.z) < 8 && Math.abs(P.veh.speed) < 3) {
          G.money += 150; G.toast('+$150 за поездку'); G.sfx('cash'); stepData.trip++; timer = 0;
          if (stepData.trip >= s.n) return nextStep(); taxiPickup();
        }
      }
    } else if (s.t === 'wanted') {
      G.missionText = s.text + ` (${Math.ceil(G.wanted)} из ${s.stars})`; if (G.wanted >= s.stars) nextStep();
    } else if (s.t === 'lose') { G.missionText = s.text; if (G.wanted <= 0) nextStep(); }
  };
})();
