'use strict';
// Кубомир: существа (мирные и враждебные), три стража, снаряды и порталы между измерениями.
(function () {
  const KM = window.KM, G = window.G, B = KM.B, scene = G.scene;
  G.mobs = []; let shots = [];

  const lam = (c, e) => new THREE.MeshLambertMaterial({ color: c, emissive: e || '#000000' });
  // Все модели кубические: «шар» радиуса r превращается в кубик со стороной ~1.8r.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const sph = (r, m, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(boxGeo, m); o.position.set(x, y, z); o.scale.set(r * 1.8 * sx, r * 1.8 * sy, r * 1.8 * sz); return o; };
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
  const eyes = (g, y, z, sep, col = '#ffffff', r = 0.07) => { const m = new THREE.MeshBasicMaterial({ color: col }); for (const s of [-1, 1]) g.add(sph(r, m, s * sep, y, z)); };

  // Все существа собраны из кубиков.
  const TYPES = {
    fluffy: { n: 'Пушистик', hp: 8, w: 0.45, h: 1.0, speed: 1.6, passive: true, drops: [['wool', 1, 2], ['meat_raw', 1, 2]],
      make() { const g = new THREE.Group(), wool = lam('#f2efe6'); g.add(sph(0.5, wool, 0, 0.62, 0, 1.1, 0.85, 1.25)); for (let i = 0; i < 6; i++) g.add(sph(0.22, wool, Math.cos(i) * 0.38, 0.85 + (i % 2) * 0.1, Math.sin(i) * 0.45)); const face = lam('#3a3330'); g.add(sph(0.22, face, 0, 0.78, 0.6)); eyes(g, 0.84, 0.78, 0.09); for (const [a, b] of [[-0.25, 0.3], [0.25, 0.3], [-0.25, -0.3], [0.25, -0.3]]) g.add(box(0.1, 0.32, 0.1, face, a, 0.16, b)); return g; } },
    hrun: { n: 'Хрюн', hp: 8, w: 0.45, h: 0.9, speed: 1.8, passive: true, drops: [['meat_raw', 1, 3]],
      make() { const g = new THREE.Group(), m = lam('#f2a3b3'); g.add(sph(0.48, m, 0, 0.55, 0, 1, 0.85, 1.3)); g.add(sph(0.32, m, 0, 0.72, 0.55)); g.add(sph(0.12, lam('#e07a90'), 0, 0.68, 0.84, 1.2, 0.8, 0.6)); eyes(g, 0.82, 0.8, 0.13, '#222', 0.05); for (const [a, b] of [[-0.25, 0.3], [0.25, 0.3], [-0.25, -0.3], [0.25, -0.3]]) g.add(box(0.12, 0.3, 0.12, m, a, 0.14, b)); return g; } },
    tennik: { n: 'Тенник', hp: 20, w: 0.35, h: 1.9, speed: 3.2, dmg: 3, drops: [['coal', 0, 2], ['arrow', 0, 2]], burns: true,
      make() { const g = new THREE.Group(), m = lam('#2a2440', '#120e22'); g.add(sph(0.4, m, 0, 0.95, 0, 0.9, 1.6, 0.7)); g.add(sph(0.3, m, 0, 1.65, 0)); eyes(g, 1.68, 0.25, 0.11, '#c8f7ff', 0.06); for (const s of [-1, 1]) g.add(sph(0.12, m, s * 0.42, 1.0, 0.15, 1, 3, 1)); return g; } },
    slime: { n: 'Слизень', hp: 12, w: 0.45, h: 0.9, speed: 2.4, dmg: 2, hop: true, drops: [['seeds', 1, 3]],
      make() { const g = new THREE.Group(); const m = new THREE.MeshLambertMaterial({ color: '#6fdc5a', transparent: true, opacity: 0.75 }); g.add(sph(0.5, m, 0, 0.45, 0, 1, 0.85, 1)); eyes(g, 0.55, 0.42, 0.15, '#103a0a', 0.07); return g; } },
    ogneshar: { n: 'Огнешар', hp: 14, w: 0.45, h: 0.9, speed: 2.6, dmg: 3, fly: true, shoot: 'fire', drops: [['ember', 1, 2]],
      make() { const g = new THREE.Group(); g.add(sph(0.45, lam('#ff7a1a', '#c8341a'), 0, 0.45, 0)); g.add(sph(0.3, lam('#ffd447', '#ffb02e'), 0, 0.5, 0.18)); eyes(g, 0.55, 0.42, 0.13, '#3a0a00', 0.06); return g; } },
    magma: { n: 'Лавовый слизень', hp: 16, w: 0.45, h: 0.9, speed: 2.2, dmg: 4, hop: true, drops: [['ember', 0, 2]],
      make() { const g = new THREE.Group(); g.add(sph(0.5, lam('#7a1a0a', '#a8341a'), 0, 0.45, 0, 1, 0.8, 1)); for (let i = 0; i < 4; i++) g.add(sph(0.12, lam('#ffb02e', '#ff6a00'), Math.cos(i * 1.6) * 0.42, 0.4 + (i % 2) * 0.2, Math.sin(i * 1.6) * 0.42)); eyes(g, 0.55, 0.43, 0.15, '#ffe08a', 0.07); return g; } },
    vihr: { n: 'Вихрик', hp: 16, w: 0.4, h: 0.9, speed: 3.4, dmg: 3, fly: true, shoot: 'orb', drops: [['feather', 0, 2]],
      make() { const g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color: '#d8e8ff', transparent: true, opacity: 0.8, emissive: '#4a5a8a' }); for (let i = 0; i < 3; i++) g.add(sph(0.4 - i * 0.1, m, 0, 0.25 + i * 0.3, 0, 1.3, 0.4, 1.3)); eyes(g, 0.62, 0.28, 0.1, '#5a3cff', 0.06); return g; } },
    golem: { n: 'Каменный голем', hp: 240, w: 0.9, h: 3.0, speed: 2.3, dmg: 7, boss: 1, drops: [['heart_stone', 1, 1], ['iron', 4, 8], ['crystal', 2, 3]],
      make() { const g = new THREE.Group(), m = lam('#8a877a'), mm = lam('#5f5c52'); g.add(sph(0.9, m, 0, 1.55, 0, 1.2, 1.05, 0.9)); g.add(sph(0.55, mm, 0, 2.55, 0.1)); eyes(g, 2.6, 0.55, 0.2, '#ffd447', 0.1); for (const s of [-1, 1]) { g.add(sph(0.38, mm, s * 1.15, 1.5, 0.1, 1, 2.1, 1)); g.add(sph(0.36, m, s * 0.45, 0.4, 0, 1, 1.3, 1)); } g.add(sph(0.25, lam('#c34bff', '#7a1aa8'), 0, 1.7, 0.75)); return g; } },
    colossus: { n: 'Огненный колосс', hp: 340, w: 1.0, h: 3.2, speed: 2.0, dmg: 6, fly: true, boss: 2, shoot: 'fire3', drops: [['fire_core', 1, 1], ['ember', 6, 10], ['gold', 3, 5]],
      make() { const g = new THREE.Group(), m = lam('#3a1410', '#5a1a0a'), f = lam('#ff7a1a', '#ff4a00'); g.add(sph(1.0, m, 0, 1.6, 0, 1, 1.2, 0.9)); g.add(sph(0.6, f, 0, 1.6, 0.5)); g.add(sph(0.5, m, 0, 2.8, 0)); eyes(g, 2.85, 0.45, 0.2, '#ffe08a', 0.1); for (let i = 0; i < 6; i++) { const t = i / 6 * Math.PI * 2; g.add(sph(0.18, f, Math.cos(t) * 1.4, 2.0 + Math.sin(t * 2) * 0.3, Math.sin(t) * 1.4)); } return g; } },
    storm: { n: 'Грозовой страж', hp: 400, w: 0.9, h: 2.4, speed: 4.2, dmg: 6, fly: true, boss: 3, shoot: 'orb3', drops: [['storm_crown', 1, 1], ['feather', 5, 8], ['crystal', 3, 5]],
      make() { const g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color: '#7a6cff', emissive: '#2a1a8a' }), w = new THREE.MeshLambertMaterial({ color: '#e0e8ff', transparent: true, opacity: 0.7, emissive: '#5a6aaa' }); g.add(sph(0.8, m, 0, 1.3, 0, 1, 1.2, 0.8)); g.add(sph(0.45, m, 0, 2.2, 0)); eyes(g, 2.25, 0.4, 0.17, '#ffffff', 0.09); for (const s of [-1, 1]) g.add(sph(0.9, w, s * 1.3, 1.6, -0.2, 1.4, 0.25, 0.8)); for (let i = 0; i < 3; i++) g.add(box(0.12, 0.5, 0.12, lam('#ffd447', '#ffb000'), (i - 1) * 0.25, 2.75, 0)); return g; } },
    lord: { n: 'Владыка Кубомира', hp: 640, w: 1.0, h: 3.4, speed: 3.4, dmg: 8, fly: true, boss: 4, shoot: 'lord', drops: [['crystal', 6, 10], ['gold', 6, 10], ['iron', 8, 12]],
      make() { const g = new THREE.Group(), m = lam('#2a1840', '#1a0a30'), v = lam('#c34bff', '#7a1aa8'), gold = lam('#ffd447', '#b08a00'); g.add(sph(0.95, m, 0, 1.55, 0, 1.1, 1.15, 0.85)); g.add(sph(0.5, v, 0, 1.6, 0.62, 1, 1, 0.4)); g.add(sph(0.55, m, 0, 2.8, 0)); eyes(g, 2.85, 0.5, 0.2, '#ff3df2', 0.1); g.add(box(1.1, 0.25, 1.1, gold, 0, 3.4, 0)); for (const x of [-0.42, 0, 0.42]) g.add(box(0.18, 0.4, 0.18, gold, x, 3.7, 0)); for (const s of [-1, 1]) { g.add(sph(0.35, m, s * 1.25, 1.7, 0, 1, 2.2, 1)); g.add(sph(0.3, v, s * 1.3, 0.9, 0)); } const orbit = new THREE.Group(); orbit.name = 'orbit'; for (let i = 0; i < 4; i++) { const t = i / 4 * Math.PI * 2; orbit.add(sph(0.2, v, Math.cos(t) * 1.8, 1.8, Math.sin(t) * 1.8)); } g.add(orbit); return g; } },
  };
  G.MOBTYPES = TYPES;

  function spawn(type, x, y, z) {
    const T = TYPES[type], obj = T.make();
    obj.traverse((o) => { if (o.material) o.material = o.material.clone(); });
    scene.add(obj);
    const m = { type, T, x, y, z, vx: 0, vy: 0, vz: 0, d: G.player.d, hp: T.hp, obj, yaw: Math.random() * 6.28, think: 0, cool: 1 + Math.random() * 2, hurt: 0, onGround: false, wander: 0, t: 0 };
    G.mobs.push(m);
    if (T.boss) { G.boss = m; G.sfx('boss'); G.toast('⚠ ' + T.n + ' пробудился!'); }
    return m;
  }
  G.spawnMob = spawn;
  function remove(m) { scene.remove(m.obj); m.obj.traverse((o) => { if (o.geometry && o.geometry !== boxGeo) o.geometry.dispose(); }); m.dead = true; if (G.boss === m) G.boss = null; }
  G.clearMobs = () => { for (const m of G.mobs) remove(m); G.mobs = []; for (const s of shots) scene.remove(s.obj); shots = []; G.boss = null; };

  G.mobsBlocking = (x, y, z) => G.mobs.some((m) => Math.abs(m.x - (x + 0.5)) < m.T.w + 0.5 && Math.abs(m.z - (z + 0.5)) < m.T.w + 0.5 && y + 1 > m.y && y < m.y + m.T.h);
  // существо под прицелом: пересечение луча взгляда с его «капсулой»
  G.pickMob = function (maxT) {
    const p = G.player, o = new THREE.Vector3(p.x, p.y + G.EYE, p.z), dv = G.lookDir(); let best = null, bt = Math.min(maxT, 4.2);
    for (const m of G.mobs) {
      const c = new THREE.Vector3(m.x, m.y + m.T.h / 2, m.z), r = Math.max(m.T.w + 0.15, m.T.h * 0.42), oc = c.clone().sub(o), t = oc.dot(dv);
      if (t < 0 || t > bt + r) continue;
      const dist = oc.clone().sub(dv.clone().multiplyScalar(t)).length();
      if (dist < r && t - r * 0.5 < bt) { bt = t; best = m; }
    }
    return best;
  };
  G.hurtMob = function (m, dmg, from) {
    if (m.dead || dmg <= 0) return;
    m.hp -= dmg; m.hurt = 0.3; G.sfx('hit');
    if (from && !m.T.boss) { const dx = m.x - from.x, dz = m.z - from.z, l = Math.hypot(dx, dz) || 1; m.vx = dx / l * 6; m.vz = dz / l * 6; m.vy = 5; }
    m.angry = true;
    if (m.hp <= 0) {
      if (G.player.stats) G.player.stats.kills++;
      G.particles(m.x, m.y + m.T.h / 2, m.z, 0, 24, [1, 1, 1]);
      for (const [k, a, b] of m.T.drops) { const n = a + Math.floor(Math.random() * (b - a + 1)); if (n) G.give(KM.byKey(k), n, true); }
      if (m.T.boss) {
        G.sfx('win'); const p = G.player; if (!p.wins.includes(m.type)) p.wins.push(m.type);
        const nm = KM.name(KM.byKey(m.T.drops[0][0]));
        G.toast('🏆 ' + m.T.n + ' повержен!' + (m.type === 'lord' ? '' : ' Получено: ' + nm), 5000);
        if (G.onProgress) G.onProgress();
        if (m.type === 'lord') { G.particles(m.x, m.y + 2, m.z, 0, 60, [0.9, 0.5, 1]); setTimeout(() => G.gameComplete && G.gameComplete(), 1800); }
        else if (m.type === 'storm') setTimeout(() => G.toast('👑 Все три стража повержены! Скрафти у верстака Алтарь Кубомира', 6000), 1500);
        else if (m.type === 'golem') setTimeout(() => G.toast('Скрафти у верстака Портал в Глубины', 5000), 1500);
        else if (m.type === 'colossus') setTimeout(() => G.toast('Скрафти у верстака Портал в Небеса', 5000), 1500);
      }
      remove(m);
    }
  };

  // ---------- снаряды ----------
  const SHOTS = {
    fire: { col: '#ff7a1a', r: 0.25, dmg: 4, grav: 0 }, rock: { col: '#7a776a', r: 0.35, dmg: 6, grav: 10 }, orb: { col: '#b9a8ff', r: 0.28, dmg: 5, grav: 0, home: true },
    arrow: { col: '#e8e2c8', r: 0.08, dmg: 6, grav: 9, player: true },
  };
  function fire(kind, x, y, z, tx, ty, tz, speed) {
    const S = SHOTS[kind], dx = tx - x, dy = ty - y, dz = tz - z, l = Math.hypot(dx, dy, dz) || 1;
    const obj = kind === 'arrow' ? new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.7), new THREE.MeshBasicMaterial({ color: S.col })) : new THREE.Mesh(new THREE.BoxGeometry(S.r * 1.6, S.r * 1.6, S.r * 1.6), new THREE.MeshBasicMaterial({ color: S.col }));
    obj.position.set(x, y, z); scene.add(obj);
    shots.push({ kind, S, x, y, z, vx: dx / l * speed, vy: dy / l * speed + (S.grav ? l * S.grav / speed / 2 : 0), vz: dz / l * speed, t: 6, obj });
  }
  G.shootArrow = () => { const p = G.player, dv = G.lookDir(); fire('arrow', p.x + dv.x * 0.5, p.y + G.EYE + dv.y * 0.5, p.z + dv.z * 0.5, p.x + dv.x * 30, p.y + G.EYE + dv.y * 30, p.z + dv.z * 30, 30); G.sfx('shoot'); };
  function tickShots(dt) {
    const p = G.player, W = G.world;
    for (const s of shots) {
      s.t -= dt;
      if (s.S.home) { const dx = p.x - s.x, dy = p.y + 1 - s.y, dz = p.z - s.z, l = Math.hypot(dx, dy, dz) || 1; s.vx += dx / l * 6 * dt; s.vy += dy / l * 6 * dt; s.vz += dz / l * 6 * dt; }
      s.vy -= (s.S.grav || 0) * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.obj.position.set(s.x, s.y, s.z);
      if (s.kind === 'arrow') s.obj.lookAt(s.x + s.vx, s.y + s.vy, s.z + s.vz);
      const b = W.get(p.d, Math.floor(s.x), Math.floor(s.y), Math.floor(s.z));
      if (b > 0 && B[b].solid) { s.t = 0; if (s.kind === 'fire') G.particles(s.x, s.y, s.z, 0, 8, [1, 0.5, 0.1]); continue; }
      if (s.S.player) { for (const m of G.mobs) if (Math.abs(m.x - s.x) < m.T.w + 0.2 && Math.abs(m.z - s.z) < m.T.w + 0.2 && s.y > m.y && s.y < m.y + m.T.h) { G.hurtMob(m, s.S.dmg, { x: s.x - s.vx, z: s.z - s.vz }); s.t = 0; break; } }
      else if (Math.abs(p.x - s.x) < 0.5 && Math.abs(p.z - s.z) < 0.5 && s.y > p.y && s.y < p.y + 1.9) { G.damage(s.S.dmg, 'Сражён снарядом', { x: s.x - s.vx, z: s.z - s.vz }); s.t = 0; }
    }
    for (const s of shots) if (s.t <= 0) scene.remove(s.obj);
    shots = shots.filter((s) => s.t > 0);
  }

  // ---------- призыв стража ----------
  G.summonBoss = function (x, y, z, kind) {
    if (G.boss) { G.toast('Страж уже здесь!'); return; }
    if (G.mode === 'creative') G.toast('В творчестве стражи не причиняют вреда');
    const type = kind === 4 ? 'lord' : kind === 2 ? 'colossus' : kind === 3 ? 'storm' : 'golem', p = G.player;
    // алтарь стража гаснет; Алтарь Кубомира остаётся — Владыку можно призвать снова, если не вышло с первого раза
    if (kind !== 4) { G.world.set(p.d, x, y, z, KM.ALTAR_USED); p.altars.push(p.d + ':' + x + ',' + z); }
    G.particles(x + 0.5, y + 1, z + 0.5, 0, 40, [0.8, 0.3, 1]);
    if (kind === 4) { let sy = y + 1.2; for (let k = 0; k < 12 && G.collides(p.d, x + 0.5, sy, z + 0.5, 1.0, 3.4); k++) sy += 1; const m = spawn(type, x + 0.5, sy, z + 0.5); m.ph = 0; G.toast('Владыка Кубомира: «Ты дошёл до конца. Посмотрим, чего ты стоишь!»', 5000); }
    else spawn(type, x + 0.5, y + 1.5, z + 3.5);
  };

  // ---------- появление существ ----------
  let spawnT = 0;
  function trySpawn() {
    const p = G.player, W = G.world, d = p.d;
    const hostile = G.mobs.filter((m) => !m.T.passive && !m.T.boss).length, passive = G.mobs.filter((m) => m.T.passive).length;
    const a = Math.random() * 6.283, r = 18 + Math.random() * 22, x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
    if (d === 0) {
      let y = -1; for (let yy = KM.HY - 2; yy > 1; yy--) { const b = W.get(d, x, yy, z); if (b < 0) return; if (b > 0 && B[b].solid) { y = yy + 1; break; } }
      if (y < 0 || W.get(d, x, y, z) !== 0 || W.get(d, x, y + 1, z) !== 0) return;
      const [sky, bl] = W.lightAt(d, x, y, z), lit = Math.max(sky / 15 * G.dayFactor(), bl / 15);
      const ground = W.get(d, x, y - 1, z);
      if (lit < 0.3 && !G.peaceful && hostile < 8) spawn(Math.random() < 0.65 ? 'tennik' : 'slime', x + 0.5, y, z + 0.5);
      else if (lit > 0.6 && ground === KM.GRASS && passive < 6 && Math.random() < 0.3) { const t = Math.random() < 0.5 ? 'fluffy' : 'hrun'; spawn(t, x + 0.5, y, z + 0.5); if (Math.random() < 0.6) spawn(t, x + 1.5, y, z + 0.5); }
    } else if (d === 1) {
      if (G.peaceful || hostile >= 7) return;
      const y = Math.floor(p.y + (Math.random() - 0.3) * 14); if (W.get(d, x, y, z) !== 0 || W.get(d, x, y + 1, z) !== 0) return;
      const below = W.get(d, x, y - 1, z);
      if (below > 0 && B[below].solid && Math.random() < 0.5) spawn('magma', x + 0.5, y, z + 0.5); else spawn('ogneshar', x + 0.5, y, z + 0.5);
    } else {
      if (G.peaceful || hostile >= 4 || Math.random() < 0.6) return;
      const y = Math.floor(p.y + Math.random() * 8); if (W.get(d, x, y, z) === 0 && W.get(d, x, y + 1, z) === 0) spawn('vihr', x + 0.5, y, z + 0.5);
    }
  }

  // ---------- поведение ----------
  G.tickMobs = function (dt) {
    const p = G.player, W = G.world;
    spawnT -= dt; if (spawnT <= 0) { spawnT = 1.2; trySpawn(); }
    for (const m of G.mobs) {
      if (m.dead) continue;
      const T = m.T; m.t += dt;
      const dx = p.x - m.x, dz = p.z - m.z, dy = p.y - m.y, dist = Math.hypot(dx, dz);
      if (dist > 72 && !T.boss) { remove(m); continue; }
      // солнце сжигает тенников
      if (T.burns && p.d === 0 && G.dayFactor() > 0.7 && W.lightAt(0, Math.floor(m.x), Math.floor(m.y + 1), Math.floor(m.z))[0] >= 14) { m.burnT = (m.burnT || 0) + dt; if (m.burnT > 1) { m.burnT = 0; G.hurtMob(m, 4); G.particles(m.x, m.y + 1, m.z, 0, 6, [1, 0.5, 0.1]); } }
      const chase = !T.passive && G.mode !== 'creative' && p.hp > 0 && dist < (T.boss ? 60 : 22);
      let wantX = 0, wantZ = 0, sp = T.speed;
      if (chase) { wantX = dx / (dist || 1); wantZ = dz / (dist || 1); if (T.boss === 3) { const a = m.t * 0.6; wantX = (p.x + Math.cos(a) * 9 - m.x) / 4; wantZ = (p.z + Math.sin(a) * 9 - m.z) / 4; const l = Math.hypot(wantX, wantZ); if (l > 1) { wantX /= l; wantZ /= l; } } }
      else if (T.passive && m.hurt > 0) { wantX = -dx / (dist || 1); wantZ = -dz / (dist || 1); sp *= 1.8; }
      else { m.wander -= dt; if (m.wander <= 0) { m.wander = 2 + Math.random() * 4; m.wyaw = Math.random() < 0.4 ? null : Math.random() * 6.28; } if (m.wyaw != null) { wantX = Math.sin(m.wyaw) * 0.5; wantZ = Math.cos(m.wyaw) * 0.5; } }
      if (T.shoot && chase && dist < 7 && !T.boss) { wantX *= -0.3; wantZ *= -0.3; }
      if (T.hop && !m.onGround) { } else if (T.hop) { wantX *= 0; wantZ *= 0; }
      m.vx += (wantX * sp - m.vx) * Math.min(1, 6 * dt); m.vz += (wantZ * sp - m.vz) * Math.min(1, 6 * dt);
      if (T.fly) {
        const ty = chase ? p.y + (T.boss === 4 ? 2.2 : T.boss ? 4.5 : 2.2) + Math.sin(m.t * 2) * 0.6 : m.y + Math.sin(m.t) * 0.3;
        m.vy += ((ty - m.y) * 1.6 - m.vy) * Math.min(1, 3 * dt);
      } else {
        m.vy -= 26 * dt;
        if (T.hop && m.onGround) { m.hopT = (m.hopT || 0) - dt; if (m.hopT <= 0 && (chase || Math.random() < 0.02)) { m.hopT = 0.8 + Math.random() * 0.6; m.vy = 8; const hx = chase ? dx / (dist || 1) : Math.random() - 0.5, hz = chase ? dz / (dist || 1) : Math.random() - 0.5; m.vx = hx * sp * 1.6; m.vz = hz * sp * 1.6; } }
      }
      const hit = G.moveBody(m, dt, T.w, T.h);
      if ((hit.x || hit.z) && m.onGround && !T.fly) m.vy = 8.2;
      if (G.inLiquid(m, KM.WATER)) m.vy = Math.max(m.vy, 1.5);
      if (m.y < -20) { remove(m); continue; }
      if (Math.hypot(m.vx, m.vz) > 0.2) m.yaw = Math.atan2(m.vx, m.vz);
      if (chase) m.yaw = Math.atan2(dx, dz);
      // атаки
      m.cool -= dt;
      const reach = T.w + 0.9;
      if (chase && T.dmg && dist < reach && Math.abs(dy + (T.fly ? 1 : 0)) < T.h + 0.5 && m.cool <= 0) { m.cool = 1.1; G.damage(T.dmg, T.n + ' одолел тебя', m); }
      if (chase && T.shoot && m.cool <= 0 && dist < 26) {
        const ey = m.y + T.h * 0.6;
        if (T.shoot === 'fire') { m.cool = 2.6; fire('fire', m.x, ey, m.z, p.x, p.y + 1.2, p.z, 11); }
        else if (T.shoot === 'orb') { m.cool = 3; fire('orb', m.x, ey, m.z, p.x, p.y + 1.2, p.z, 7); }
        else if (T.shoot === 'fire3') { m.cool = 2.2; for (let i = -1; i <= 1; i++) { const a = Math.atan2(dx, dz) + i * 0.28; fire('fire', m.x, ey, m.z, m.x + Math.sin(a) * dist, p.y + 1.2, m.z + Math.cos(a) * dist, 13); } if (m.t % 14 < dt * 2 && G.mobs.length < 12) for (let k = 0; k < 2; k++) spawn('ogneshar', m.x + (Math.random() - 0.5) * 4, m.y + 1, m.z + (Math.random() - 0.5) * 4); }
        else if (T.shoot === 'lord') {
          // Владыка: по кругу — веер огня, самонаводящиеся сферы, град камней; при половине здоровья злее и зовёт слуг
          const rage = m.hp < T.hp / 2; if (rage && !m.rage) { m.rage = true; G.toast('⚠ Владыка в ярости!', 3000); G.sfx('boss'); }
          m.cool = rage ? 1.15 : 1.7; const ph = (m.ph = (m.ph || 0) + 1) % 3;
          if (ph === 0) for (let i = -2; i <= 2; i++) { const a = Math.atan2(dx, dz) + i * 0.22; fire('fire', m.x, ey, m.z, m.x + Math.sin(a) * dist, p.y + 1.2, m.z + Math.cos(a) * dist, 13); }
          else if (ph === 1) { fire('orb', m.x - 1, ey, m.z, p.x, p.y + 1.2, p.z, 8); fire('orb', m.x + 1, ey, m.z, p.x, p.y + 1.2, p.z, 8); }
          else for (let i = 0; i < (rage ? 4 : 2); i++) fire('rock', m.x, m.y + T.h, m.z, p.x + (Math.random() - 0.5) * 3, p.y + 1, p.z + (Math.random() - 0.5) * 3, 15);
          m.minion = (m.minion || 10) - m.cool;
          if (m.minion <= 0 && G.mobs.length < 10) { m.minion = rage ? 9 : 14; const mt = p.d === 1 ? 'magma' : p.d === 2 ? 'vihr' : 'tennik'; for (let k = 0; k < 2; k++) spawn(mt, m.x + (Math.random() - 0.5) * 5, m.y, m.z + (Math.random() - 0.5) * 5); }
        }
        else if (T.shoot === 'orb3') { m.cool = 1.7; fire('orb', m.x, ey, m.z, p.x, p.y + 1.2, p.z, 9); if (Math.random() < 0.3) { m.vx = dx / (dist || 1) * 18; m.vz = dz / (dist || 1) * 18; m.vy = (p.y + 1 - m.y) * 2; } }
        G.sfx('shoot');
      }
      if (T.boss === 1 && chase) {
        m.slam = (m.slam || 4) - dt;
        if (m.slam <= 0) { m.slam = 4.5; if (dist < 6 && Math.abs(dy) < 2.5) { G.damage(5, 'Голем сокрушил тебя', m); p.vy = 9; } G.shake = 0.6; G.sfx('boom'); G.particles(m.x, m.y, m.z, KM.STONE, 30); }
        m.rock = (m.rock || 3) - dt; if (m.rock <= 0 && dist > 5) { m.rock = 3; fire('rock', m.x, m.y + 2.4, m.z, p.x, p.y + 1, p.z, 16); }
      }
      // вид
      m.obj.position.set(m.x, m.y + (T.hop && !m.onGround ? 0.1 : 0), m.z); m.obj.rotation.y = m.yaw;
      if (T.hop) { const s = m.onGround ? 1 : 1.15; m.obj.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s)); }
      if (T.fly) m.obj.rotation.z = Math.sin(m.t * 3) * 0.1;
      if (T.boss === 4) { const o = m.obj.getObjectByName('orbit'); if (o) o.rotation.y = m.t * 1.6; }
      if (m.hurt > 0) m.hurt -= dt;
      const lt = W.lightAt(p.d, Math.floor(m.x), Math.floor(m.y + 1), Math.floor(m.z)), br = Math.max(lt[0] / 15 * (p.d === 1 ? 0 : G.dayFactor()), lt[1] / 15, p.d === 1 ? 0.35 : 0.12);
      m.obj.traverse((o) => { if (o.material && o.material.color && o.material.type === 'MeshLambertMaterial') { if (!o.userData.base) o.userData.base = o.material.color.clone(); o.material.color.copy(o.userData.base).multiplyScalar(m.hurt > 0 ? 1.8 : 0.35 + br * 0.85); if (m.hurt > 0) o.material.color.r = 1; } });
    }
    G.mobs = G.mobs.filter((m) => !m.dead);
    tickShots(dt);
  };

  // ---------- порталы ----------
  const DIMN = ['Поверхность', 'Глубины', 'Небеса'];
  G.DIMN = DIMN;
  G.usePortal = function (id) {
    const p = G.player, from = p.d;
    let to = id === KM.PORTAL_DEEP ? (from === 1 ? 0 : 1) : (from === 2 ? 0 : 2);
    G.travel(to, Math.floor(p.x), Math.floor(p.z), id);
  };
  G.travel = function (to, x, z, portalId) {
    const p = G.player, W = G.world;
    G.clearMobs(); G.clearMeshes(); G.clearParticles();
    for (let dd = 0; dd < 3; dd++) if (dd !== to) W.dims[dd].clear();
    p.d = to; G.ensureArea(to, x, z, 1);
    let y = -1;
    if (to === 0) y = G.findSurface(0, x, z);
    else if (to === 1) {
      for (let yy = 30; yy < KM.HY - 6; yy++) { const b = W.get(1, x, yy - 1, z); if (b > 0 && B[b].solid && W.get(1, x, yy, z) === 0 && W.get(1, x, yy + 1, z) === 0) { y = yy; break; } }
      if (y < 0) { y = 40; for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) { W.set(1, x + a, 39, z + c, KM.HELLROCK); for (let k = 0; k < 3; k++) W.set(1, x + a, 40 + k, z + c, 0); } }
    } else {
      y = G.findSurface(2, x, z);
      if (y < 0 || y < 20) { y = 50; for (let a = -2; a <= 2; a++) for (let c = -2; c <= 2; c++) W.set(2, x + a, 49, z + c, KM.CLOUDSTONE); }
    }
    p.x = x + 0.5; p.y = y; p.z = z + 0.5; p.vx = p.vy = p.vz = 0; p.fallFrom = y;
    if (to && !p.prog['d' + to]) { p.prog['d' + to] = 1; if (G.onProgress) G.onProgress(); }
    // обратный портал рядом
    if (portalId) {
      const px = x + 2, pz = z; let py = y;
      if (W.get(to, px, py - 1, pz) <= 0 || !B[Math.max(0, W.get(to, px, py - 1, pz))].solid) W.set(to, px, py - 1, pz, to === 1 ? KM.HELLROCK : to === 2 ? KM.CLOUDSTONE : KM.COBBLE);
      if (W.get(to, px, py, pz) !== portalId) W.set(to, px, py, pz, portalId);
      p.portals[(portalId === KM.PORTAL_DEEP ? 'deep' : 'sky') + to] = [px, py, pz];
      W.set(to, px, py + 1, pz, 0);
    }
    G.sfx('portal'); G.toast('🌀 ' + DIMN[to]);
    if (G.onTravel) G.onTravel();
  };
})();
