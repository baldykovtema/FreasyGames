'use strict';
// Неоград: кубические модели людей, машин, самолёта и вертолёта.
(function () {
  const N = window.N;
  const BOX = new THREE.BoxGeometry(1, 1, 1);
  const mats = new Map();
  const mat = (c, e) => { const k = c + (e || ''); if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color: c, emissive: e || '#000000' })); return mats.get(k); };
  N.mat = mat;
  // кубик w×h×d с низом/центром в (x,y,z)
  const cube = (parent, w, h, d, c, x = 0, y = 0, z = 0, e) => { const m = new THREE.Mesh(BOX, mat(c, e)); m.scale.set(w, h, d); m.position.set(x, y, z); parent.add(m); return m; };
  N.cube = cube;

  // ---------- человек ----------
  const SKINS = ['#f2c79b', '#d9a066', '#8d5a3a', '#f5d5b8', '#a8774f'];
  const SHIRTS = ['#e8443a', '#3a7be8', '#f2c230', '#3ab06a', '#ffffff', '#8a4ae8', '#ff8a2a', '#2a2d3a', '#e86ab0'];
  const PANTS = ['#2a3a5a', '#3a3a3a', '#6a5a4a', '#1f2a40', '#8a8a90'];
  N.randomLook = (r = Math.random) => ({ skin: SKINS[(r() * SKINS.length) | 0], shirt: SHIRTS[(r() * SHIRTS.length) | 0], pants: PANTS[(r() * PANTS.length) | 0], hair: ['#2a1d10', '#5a3a1a', '#d8b060', '#111', '#8a3a1a'][(r() * 5) | 0] });
  N.makeHuman = function (look, opts = {}) {
    const g = new THREE.Group();
    const limb = (x, y, c, w = 0.24, h = 0.8) => { const pv = new THREE.Group(); pv.position.set(x, y, 0); cube(pv, w, h, w, c, 0, -h / 2, 0); g.add(pv); return pv; };
    const legL = limb(-0.15, 0.85, look.pants, 0.26, 0.85), legR = limb(0.15, 0.85, look.pants, 0.26, 0.85);
    cube(g, 0.58, 0.7, 0.32, look.shirt, 0, 1.2, 0);
    const armL = limb(-0.4, 1.52, look.shirt, 0.2, 0.7), armR = limb(0.4, 1.52, look.shirt, 0.2, 0.7);
    cube(armL, 0.2, 0.16, 0.2, look.skin, 0, -0.76, 0); cube(armR, 0.2, 0.16, 0.2, look.skin, 0, -0.76, 0);
    const head = new THREE.Group(); head.position.set(0, 1.62, 0); g.add(head);
    cube(head, 0.4, 0.4, 0.4, look.skin, 0, 0.2, 0);
    cube(head, 0.42, 0.12, 0.42, look.hair, 0, 0.42, 0);
    cube(head, 0.08, 0.06, 0.02, '#111111', -0.09, 0.24, 0.205); cube(head, 0.08, 0.06, 0.02, '#111111', 0.09, 0.24, 0.205);
    if (opts.cop) { cube(head, 0.46, 0.12, 0.46, '#1a2a5a', 0, 0.45, 0); cube(head, 0.46, 0.04, 0.2, '#111', 0, 0.39, 0.28); cube(g, 0.12, 0.12, 0.02, '#ffd447', 0.15, 1.38, 0.17); }
    if (opts.gang) cube(head, 0.44, 0.1, 0.44, '#c8341a', 0, 0.46, 0);
    const gun = new THREE.Group(); gun.position.set(0, -0.8, 0.12); armR.add(gun);
    cube(gun, 0.08, 0.14, 0.34, '#222226', 0, 0, 0.1); gun.visible = false;
    g.userData = { legL, legR, armL, armR, head, gun };
    return g;
  };
  // анимация ходьбы: фаза t, скорость 0..1, aim — рука с оружием вперёд
  N.animHuman = function (g, t, speed, aim, aimPitch = 0) {
    const u = g.userData, a = Math.sin(t) * 0.7 * Math.min(1, speed);
    u.legL.rotation.x = a; u.legR.rotation.x = -a;
    u.armL.rotation.x = -a * 0.8;
    if (aim) { u.armR.rotation.x = -Math.PI / 2 - aimPitch; u.armR.rotation.z = 0; } else u.armR.rotation.x = a * 0.8;
  };

  // ---------- машины ----------
  N.CARS = {
    sedan: { n: 'Седан', len: 4.4, w: 1.9, h: 1.0, cab: 0.65, max: 38, acc: 13, grip: 5, hp: 100 },
    sport: { n: 'Спорткар', len: 4.3, w: 1.95, h: 0.8, cab: 0.5, max: 56, acc: 24, grip: 6, hp: 90 },
    truck: { n: 'Фургон', len: 6, w: 2.3, h: 1.6, cab: 1.0, max: 28, acc: 8, grip: 4, hp: 180 },
    taxi: { n: 'Такси', len: 4.4, w: 1.9, h: 1.0, cab: 0.65, max: 40, acc: 14, grip: 5, hp: 100, color: '#f2c230' },
    police: { n: 'Полиция', len: 4.6, w: 1.95, h: 1.0, cab: 0.65, max: 48, acc: 18, grip: 6, hp: 140, color: '#f2f2f2' },
    buggy: { n: 'Багги', len: 3.4, w: 1.9, h: 0.7, cab: 0.3, max: 42, acc: 20, grip: 7, hp: 70, color: '#ff8a2a' },
  };
  N.CARCOLORS = ['#c8341a', '#2a5ab0', '#e8e6e0', '#2a2d3a', '#3a8a4a', '#8a4ae8', '#d8a020', '#5a6a7a', '#e86ab0'];
  N.makeCar = function (type, color) {
    const D = N.CARS[type], g = new THREE.Group(), body = color || D.color || '#c8341a';
    const L = D.len, W = D.w;
    cube(g, W, D.h, L, body, 0, 0.45 + D.h / 2, 0);
    if (type === 'truck') { cube(g, W * 0.96, D.cab + 0.6, L * 0.62, '#e8e6e0', 0, 0.45 + D.h + (D.cab + 0.6) / 2, -L * 0.15); cube(g, W * 0.92, D.cab, L * 0.26, '#9fd0ff', 0, 0.45 + D.h + D.cab / 2, L * 0.33); }
    else if (type === 'buggy') { cube(g, 0.12, 0.9, 0.12, '#222', -W * 0.4, 0.45 + D.h + 0.45, 0); cube(g, 0.12, 0.9, 0.12, '#222', W * 0.4, 0.45 + D.h + 0.45, 0); cube(g, W * 0.9, 0.1, 1.2, '#222', 0, 0.45 + D.h + 0.9, 0); }
    else { cube(g, W * 0.86, D.cab, L * 0.5, body, 0, 0.45 + D.h + D.cab / 2, -L * 0.04); cube(g, W * 0.88, D.cab * 0.8, L * 0.46, '#2a3a50', 0, 0.45 + D.h + D.cab * 0.45, -L * 0.04); }
    // фары и стоп-сигналы
    cube(g, 0.4, 0.2, 0.05, '#fff6c8', -W * 0.32, 0.45 + D.h * 0.6, L / 2, '#665c30'); cube(g, 0.4, 0.2, 0.05, '#fff6c8', W * 0.32, 0.45 + D.h * 0.6, L / 2, '#665c30');
    cube(g, 0.4, 0.18, 0.05, '#c8141a', -W * 0.32, 0.45 + D.h * 0.6, -L / 2); cube(g, 0.4, 0.18, 0.05, '#c8141a', W * 0.32, 0.45 + D.h * 0.6, -L / 2);
    if (type === 'police') { cube(g, W + 0.04, 0.16, L * 0.72, '#1a3a9a', 0, 0.45 + D.h * 0.55, 0); cube(g, W * 0.88, D.cab * 0.82, L * 0.47, '#1a1d26', 0, 0.45 + D.h + D.cab * 0.44, -L * 0.04); g.userData.siren = [cube(g, 0.5, 0.18, 0.3, '#ff2020', -0.3, 0.45 + D.h + D.cab + 0.09, -0.2, '#600'), cube(g, 0.5, 0.18, 0.3, '#2050ff', 0.3, 0.45 + D.h + D.cab + 0.09, -0.2, '#006')]; }
    if (type === 'taxi') cube(g, 0.7, 0.25, 0.3, '#ffffff', 0, 0.45 + D.h + D.cab + 0.12, -0.2, '#555');
    const wheels = [];
    for (const [x, z] of [[-W / 2, L * 0.32], [W / 2, L * 0.32], [-W / 2, -L * 0.32], [W / 2, -L * 0.32]]) { const wg = new THREE.Group(); wg.position.set(x, 0.42, z); cube(wg, 0.34, 0.84, 0.84, '#18181c'); cube(wg, 0.36, 0.4, 0.4, '#a0a0a8'); g.add(wg); wheels.push(wg); }
    g.userData.wheels = wheels;
    return g;
  };

  // ---------- самолёт и вертолёт ----------
  N.makePlane = function (color = '#e8e6e0', stripe = '#2a5ab0') {
    const g = new THREE.Group();
    cube(g, 1.8, 1.8, 11, color, 0, 2.1, 0);
    cube(g, 1.4, 0.9, 1.6, '#2a3a50', 0, 2.9, 3.2);
    cube(g, 1.0, 1.0, 1.2, stripe, 0, 2.0, 6.0);
    cube(g, 13, 0.25, 2.4, color, 0, 2.1, 0.6); cube(g, 13.2, 0.12, 0.5, stripe, 0, 2.25, -0.4);
    cube(g, 4.5, 0.2, 1.4, color, 0, 2.4, -4.8); cube(g, 0.2, 2.2, 1.6, stripe, 0, 3.6, -4.9);
    const prop = new THREE.Group(); prop.position.set(0, 2.0, 6.65); cube(prop, 0.3, 3.2, 0.12, '#222'); g.add(prop);
    cube(g, 0.2, 1.4, 0.2, '#333', -1.8, 0.9, 1.2); cube(g, 0.2, 1.4, 0.2, '#333', 1.8, 0.9, 1.2); cube(g, 0.2, 1.2, 0.2, '#333', 0, 1.0, -4);
    cube(g, 0.4, 0.5, 0.6, '#111', -1.8, 0.25, 1.2); cube(g, 0.4, 0.5, 0.6, '#111', 1.8, 0.25, 1.2); cube(g, 0.3, 0.4, 0.4, '#111', 0, 0.3, -4);
    g.userData.prop = prop;
    return g;
  };
  N.makeHeli = function (color = '#c8341a') {
    const g = new THREE.Group();
    cube(g, 2.4, 2.2, 4.2, color, 0, 2.0, 0.3);
    cube(g, 2.2, 1.4, 1.6, '#2a3a50', 0, 2.3, 2.0);
    cube(g, 0.6, 0.6, 5.5, color, 0, 2.6, -4.2);
    cube(g, 0.15, 1.6, 0.9, color, 0, 3.2, -6.7);
    cube(g, 0.2, 0.2, 4.4, '#333', -1.1, 0.4, 0.3); cube(g, 0.2, 0.2, 4.4, '#333', 1.1, 0.4, 0.3);
    cube(g, 0.15, 0.7, 0.15, '#333', -1.1, 0.8, 1.3); cube(g, 0.15, 0.7, 0.15, '#333', 1.1, 0.8, 1.3); cube(g, 0.15, 0.7, 0.15, '#333', -1.1, 0.8, -0.7); cube(g, 0.15, 0.7, 0.15, '#333', 1.1, 0.8, -0.7);
    cube(g, 0.3, 0.5, 0.3, '#333', 0, 3.35, 0.3);
    const rotor = new THREE.Group(); rotor.position.set(0, 3.65, 0.3); cube(rotor, 11, 0.08, 0.4, '#222'); cube(rotor, 0.4, 0.08, 11, '#222'); g.add(rotor);
    const tail = new THREE.Group(); tail.position.set(0.12, 3.2, -6.7); cube(tail, 0.06, 2.0, 0.3, '#222'); g.add(tail);
    g.userData.rotor = rotor; g.userData.tail = tail;
    return g;
  };
})();
