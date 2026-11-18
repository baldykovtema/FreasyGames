'use strict';
// Неоград: сцена, игрок, оружие, машины и трафик, самолёт и вертолёт, пешеходы, полиция и розыск.
(function () {
  const N = window.N;
  const G = window.G = { state: 'menu', paused: true, money: 500, wanted: 0, t: 0, settings: { sens: 8, sound: true, touch: false, quality: 1 } };
  try { Object.assign(G.settings, JSON.parse(localStorage.getItem('neograd-settings') || '{}')); } catch {}
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (localStorage.getItem('neograd-settings') === null) G.settings.touch = isTouch;
  G.saveSettings = () => { try { localStorage.setItem('neograd-settings', JSON.stringify(G.settings)); } catch {} };
  G.isTouch = isTouch;

  // ---------- сцена ----------
  const canvas = document.getElementById('gl');
  const R = G.renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
  R.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.25 : 1.75));
  const scene = G.scene = new THREE.Scene();
  scene.background = new THREE.Color('#9fd3ff'); scene.fog = new THREE.Fog('#bfe2ff', 180, 520);
  const camera = G.camera = new THREE.PerspectiveCamera(65, 1, 0.2, 2500);
  scene.add(new THREE.HemisphereLight('#ffffff', '#6a6a5a', 0.75));
  const sun = new THREE.DirectionalLight('#fff4e0', 0.75); sun.position.set(-0.5, 1, 0.35); scene.add(sun);
  G.resize = () => { R.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  addEventListener('resize', G.resize); G.resize();

  const T = N.makeTextures(), plan = N.plan();
  G.plan = plan;
  const col = G.col = N.buildCity(scene, T, plan);
  G.ccol = () => (G.inside && G.icol) || col;   // внутри здания — свои стены
  G.map = N.mapImage(plan);

  // ---------- звук ----------
  let ac = null;
  G.unlockAudio = () => { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch {} } if (ac && ac.state === 'suspended') ac.resume(); };
  function noise(dur, vol, freq) { if (!G.settings.sound || !ac) return; const n = Math.floor(ac.sampleRate * dur), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2); const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = b; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol; s.connect(f).connect(g).connect(ac.destination); s.start(); }
  function tone(f, dur, type = 'sine', vol = 0.06, slide = 1, delay = 0) { if (!G.settings.sound || !ac) return; const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02); }
  G.sfx = (k) => {
    if (k === 'pistol') noise(0.15, 0.3, 2500); else if (k === 'smg') noise(0.08, 0.22, 3000); else if (k === 'shotgun') noise(0.3, 0.45, 1500); else if (k === 'rifle') noise(0.2, 0.35, 2000);
    else if (k === 'punch') noise(0.06, 0.2, 600); else if (k === 'hit') tone(180, 0.08, 'square', 0.05, 0.6); else if (k === 'crash') noise(0.35, 0.35, 700);
    else if (k === 'boom') { noise(1.0, 0.5, 400); tone(60, 0.8, 'sawtooth', 0.1, 0.4); } else if (k === 'cash') { tone(880, 0.08, 'triangle', 0.06); tone(1320, 0.12, 'triangle', 0.06, 1, 0.07); }
    else if (k === 'door') noise(0.1, 0.15, 900); else if (k === 'click') tone(700, 0.04, 'square', 0.03); else if (k === 'mission') [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.07, 1, i * 0.1));
    else if (k === 'fail') tone(300, 0.6, 'sawtooth', 0.06, 0.4); else if (k === 'check') tone(990, 0.12, 'triangle', 0.07, 1.3); else if (k === 'hurt') tone(160, 0.15, 'square', 0.05, 0.7);
  };
  // мотор: один осциллятор, частота от скорости
  let eng = null;
  G.engine = (on, speed01, kind) => {
    if (!ac || !G.settings.sound) { if (eng) { eng.g.gain.value = 0; } return; }
    if (!eng) { const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter(); o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 500; g.gain.value = 0; o.connect(f).connect(g).connect(ac.destination); o.start(); eng = { o, g }; }
    eng.g.gain.value = on ? 0.035 : 0; eng.o.frequency.value = (kind === 'heli' ? 30 : kind === 'plane' ? 60 : 45) + speed01 * (kind === 'car' ? 110 : 60);
  };

  // ---------- ввод (заполняют ui.js) ----------
  G.inp = { mx: 0, my: 0, lookDX: 0, lookDY: 0, fire: false, aim: false, jump: false, sprint: false, brake: false, up: false, down: false, use: false, pitch: 0 };

  // ---------- игрок ----------
  G.look = { skin: '#f2c79b', shirt: '#2a2d3a', pants: '#1f2a40', hair: '#2a1d10' };
  const P = G.player = { x: 120, y: 0, z: 120, vy: 0, yaw: 0, hp: 100, armor: 0, mode: 'foot', veh: null, anim: 0, onGround: true, speed: 0 };
  P.model = N.makeHuman(G.look); scene.add(P.model);
  G.cam = { yaw: Math.PI, pitch: -0.15, dist: 5 };

  // ---------- оружие ----------
  G.WEAP = {
    fist: { n: 'Кулаки', dmg: 12, rate: 0.45, range: 2.2, melee: true },
    pistol: { n: 'Пистолет', dmg: 28, rate: 0.3, range: 140, spread: 0.008, snd: 'pistol', price: 300, ammoPrice: 60, pack: 24 },
    smg: { n: 'Пистолет-пулемёт', dmg: 14, rate: 0.085, range: 110, spread: 0.03, snd: 'smg', auto: true, price: 1200, ammoPrice: 120, pack: 90 },
    shotgun: { n: 'Дробовик', dmg: 13, pellets: 8, rate: 0.85, range: 45, spread: 0.08, snd: 'shotgun', price: 1800, ammoPrice: 100, pack: 16 },
    rifle: { n: 'Автомат', dmg: 34, rate: 0.12, range: 200, spread: 0.012, snd: 'rifle', auto: true, price: 3500, ammoPrice: 180, pack: 60 },
  };
  G.weapons = { fist: Infinity, pistol: 36 };
  G.cur = 'pistol';
  G.nextWeapon = (dir = 1) => { const list = Object.keys(G.WEAP).filter((k) => k in G.weapons && (G.weapons[k] > 0)); const i = list.indexOf(G.cur); G.cur = list[(i + dir + list.length) % list.length]; G.uiDirty = true; G.sfx('click'); };
  let fireCD = 0;

  // эффекты: трассеры, вспышки, дым, взрывы
  const fx = [];
  const lineMat = new THREE.LineBasicMaterial({ color: '#fff3a0', transparent: true });
  G.tracer = (a, b) => { const geo = new THREE.BufferGeometry().setFromPoints([a, b]); const l = new THREE.Line(geo, lineMat.clone()); scene.add(l); fx.push({ o: l, t: 0.07, kind: 'line' }); };
  const puffGeo = new THREE.BoxGeometry(1, 1, 1);
  G.puff = (x, y, z, c, s = 1, t = 0.6, vy = 1.5) => { const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 })); m.position.set(x, y, z); m.scale.setScalar(s * 0.4); scene.add(m); fx.push({ o: m, t, t0: t, vy, s, kind: 'puff' }); };
  G.explosion = (x, y, z, r = 8, dmg = 80) => {
    G.sfx('boom'); G.shake = 0.8;
    for (let i = 0; i < 18; i++) G.puff(x + (Math.random() - 0.5) * 4, y + Math.random() * 3, z + (Math.random() - 0.5) * 4, i % 3 ? '#ff8a2a' : '#ffd447', 3 + Math.random() * 3, 0.9, 3);
    for (let i = 0; i < 10; i++) G.puff(x + (Math.random() - 0.5) * 5, y + 2 + Math.random() * 3, z + (Math.random() - 0.5) * 5, '#333', 4, 1.6, 4);
    const d = Math.hypot(P.x - x, P.z - z); if (d < r) G.hurtPlayer(dmg * (1 - d / r), 'взрыв', { x, z });
    for (const h of G.humans()) { const dd = Math.hypot(h.x - x, h.z - z); if (dd < r) G.hurtHuman(h, dmg * (1 - dd / r), true); }
    for (const v of G.vehicles) { const dd = Math.hypot(v.x - x, v.z - z); if (dd < r && dd > 0.1) G.hurtVehicle(v, dmg * 0.6 * (1 - dd / r)); }
  };
  function tickFx(dt) {
    for (const f of fx) {
      f.t -= dt;
      if (f.kind === 'puff') { f.o.position.y += f.vy * dt; const k = f.t / f.t0; f.o.material.opacity = Math.max(0, k * 0.85); f.o.scale.setScalar(f.s * (0.4 + (1 - k) * 0.8)); }
      if (f.t <= 0) { scene.remove(f.o); f.o.geometry !== puffGeo && f.o.geometry.dispose(); f.o.material.dispose(); }
    }
    for (let i = fx.length - 1; i >= 0; i--) if (fx[i].t <= 0) fx.splice(i, 1);
  }

  // ---------- люди (пешеходы, полиция, банды) ----------
  G.peds = []; G.cops = []; G.gang = [];
  G.humans = () => G.peds.concat(G.cops, G.gang);
  function spawnHuman(list, x, z, opts = {}) {
    const look = opts.look || N.randomLook();
    if (opts.cop) { look.shirt = '#2a4a9a'; look.pants = '#1a2a5a'; }
    if (opts.gang) { look.shirt = '#c8341a'; look.pants = '#222'; }
    const m = N.makeHuman(look, opts); m.position.set(x, 0, z); scene.add(m);
    const h = Object.assign({ x, z, y: 0, yaw: Math.random() * 6.28, hp: opts.hp || 40, state: 'walk', model: m, anim: Math.random() * 6, target: null, cool: 1 + Math.random(), list, speed: 1.4 }, opts);
    if (opts.cop || opts.gang) m.userData.gun.visible = true;
    list.push(h); return h;
  }
  G.spawnHuman = spawnHuman;
  function removeHuman(h) { scene.remove(h.model); h.removed = true; }
  // точки тротуаров: углы кварталов
  function sidewalkCorner(bx, bz, k) { const x0 = bx * N.CELL + N.ROAD / 2 + 1.5, z0 = bz * N.CELL + N.ROAD / 2 + 1.5, S = N.CELL - N.ROAD - 3; return [[x0, z0], [x0 + S, z0], [x0 + S, z0 + S], [x0, z0 + S]][k & 3]; }
  G.hurtHuman = function (h, dmg, byPlayer) {
    if (h.state === 'dead' || h.removed) return;
    h.hp -= dmg; G.sfx('hit');
    G.puff(h.x, 1.3, h.z, '#b01818', 0.6, 0.4, 0.5);
    if (h.hp <= 0) {
      h.state = 'dead'; h.deadT = 20; h.model.rotation.x = -Math.PI / 2; h.model.position.y = 0.2; h.model.userData.gun.visible = false;
      if (byPlayer) { if (h.cop) G.crime(1.5); else if (!h.gang) G.crime(1); if (Math.random() < 0.6 || h.gang) G.spawnPickup('cash', h.x, h.z, 10 + Math.floor(Math.random() * (h.gang ? 120 : 50))); }
      if (G.onKill) G.onKill(h);
    } else if (!h.cop && !h.gang) { h.state = 'flee'; h.fleeT = 8; }
    else { h.alert = true; }
  };
  function tickHumans(dt) {
    // пешеходы рядом с игроком
    const want = G.settings.quality ? 34 : 20;
    if (G.peds.filter((h) => h.state !== 'dead').length < want && Math.random() < 0.3) {
      const bx = Math.floor(Math.random() * N.GN), bz = Math.floor(Math.random() * N.GN), [x, z] = sidewalkCorner(bx, bz, Math.random() * 4 | 0), d = Math.hypot(x - P.x, z - P.z);
      if (d > 50 && d < 150 && col.roofAt(x, z) === 0) { const h = spawnHuman(G.peds, x, z); h.bx = bx; h.bz = bz; h.k = Math.random() * 4 | 0; }
    }
    for (const list of [G.peds, G.cops, G.gang]) {
      for (const h of list) {
        if (h.removed) continue;
        const dp = Math.hypot(h.x - P.x, h.z - P.z);
        if (h.state === 'dead') { h.deadT -= dt; if (h.deadT <= 0 || dp > 200) removeHuman(h); continue; }
        if (dp > 230 && !h.mission) { removeHuman(h); continue; }
        let tx = h.x, tz = h.z, sp = 0;
        if (h.cop || h.gang) {
          const hostile = h.cop ? G.wanted >= 1 : (h.alert || dp < 25);
          if (hostile && P.hp > 0) {
            const range = h.cop ? 18 : 16;
            if (dp > range) { tx = P.x; tz = P.z; sp = 4.2; }
            h.yaw = Math.atan2(P.x - h.x, P.z - h.z);
            h.cool -= dt;
            if (h.cool <= 0 && dp < 45 && P.mode !== 'plane') {
              h.cool = (h.cop ? 1.3 : 1.0) + Math.random() * 0.6;
              const from = new THREE.Vector3(h.x, 1.4, h.z), to = new THREE.Vector3(P.x, P.y + 1.2, P.z);
              const blocked = col.ray({ x: from.x, y: from.y, z: from.z }, to.clone().sub(from).normalize(), dp) < dp - 1;
              if (!blocked) {
                const moving = P.mode === 'foot' ? Math.min(1, P.speed / 6) : 0.6;
                const hit = Math.random() < (0.42 - moving * 0.22 - dp / 150);
                G.tracer(from, hit ? to : to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3)));
                G.sfx('pistol');
                if (hit) { if (P.mode === 'foot') G.hurtPlayer(h.cop ? 7 : 6, h.cop ? 'полиция' : 'банда', h); else if (P.veh) G.hurtVehicle(P.veh, 5); }
              }
            }
          } else if (h.cop && h.fromCar && !G.wanted) { tx = h.fromCar.x; tz = h.fromCar.z; sp = 3; if (Math.hypot(h.x - tx, h.z - tz) < 3) removeHuman(h); }
        } else if (h.state === 'flee') {
          h.fleeT -= dt; const a = Math.atan2(h.x - P.x, h.z - P.z); tx = h.x + Math.sin(a) * 5; tz = h.z + Math.cos(a) * 5; sp = 5.2; if (h.fleeT <= 0) h.state = 'walk';
        } else if (h.state === 'walk' && h.bx !== undefined) {
          const [cx, cz] = sidewalkCorner(h.bx, h.bz, h.k);
          if (Math.hypot(cx - h.x, cz - h.z) < 1) { h.k = (h.k + (Math.random() < 0.8 ? 1 : 3)) & 3; }
          tx = cx; tz = cz; sp = h.speed;
        }
        if (sp) {
          const a = Math.atan2(tx - h.x, tz - h.z), d = Math.hypot(tx - h.x, tz - h.z);
          if (d > 0.3) { h.x += Math.sin(a) * sp * dt; h.z += Math.cos(a) * sp * dt; if (!(h.cop || h.gang) || G.wanted < 1 && !h.alert) h.yaw = a; else if (dp > 18) h.yaw = a; }
          col.push(h, 0.35, 0);
          h.anim += dt * sp * 2.2;
        }
        // машины сбивают людей
        for (const v of G.vehicles) if (v.kind === 'car' && Math.abs(v.speed) > 6 && Math.hypot(v.x - h.x, v.z - h.z) < v.D.len * 0.5) { G.hurtHuman(h, 100, v.driver === 'player'); if (h.state === 'dead') { h.x += Math.sin(v.yaw) * 2; h.z += Math.cos(v.yaw) * 2; } }
        // пешеход уходит с дороги перед машиной игрока
        h.model.position.set(h.x, h.state === 'dead' ? 0.2 : 0, h.z); h.model.rotation.y = h.yaw;
        if (h.state !== 'dead') N.animHuman(h.model, h.anim, sp / 4, (h.cop || h.gang) && (G.wanted >= 1 || h.alert), 0);
      }
    }
    G.peds = G.peds.filter((h) => !h.removed); G.cops = G.cops.filter((h) => !h.removed); G.gang = G.gang.filter((h) => !h.removed);
  }

  // ---------- транспорт ----------
  G.vehicles = [];
  function spawnCar(type, x, z, yaw, color, opts = {}) {
    const D = N.CARS[type], model = N.makeCar(type, color || N.CARCOLORS[(Math.random() * N.CARCOLORS.length) | 0]);
    scene.add(model);
    const v = Object.assign({ kind: 'car', type, D, model, x, y: 0, z, yaw, speed: 0, steer: 0, hp: D.hp, driver: null, smoke: 0 }, opts);
    G.vehicles.push(v); return v;
  }
  G.spawnCar = spawnCar;
  G.spawnAir = function (kind, x, z, yaw, color) {
    const model = kind === 'plane' ? N.makePlane(color) : N.makeHeli(color);
    scene.add(model);
    const v = { kind, model, x, y: 0, z, yaw, pitch: 0, roll: 0, speed: 0, vy: 0, hp: kind === 'plane' ? 150 : 140, driver: null, throttle: 0, D: { len: kind === 'plane' ? 11 : 9, w: kind === 'plane' ? 12 : 3, n: kind === 'plane' ? 'Самолёт' : 'Вертолёт' }, home: { x, z, yaw } };
    G.vehicles.push(v); return v;
  };
  function removeVehicle(v) { scene.remove(v.model); v.removed = true; }
  G.hurtVehicle = function (v, dmg, byPlayer) {
    if (v.hp <= 0 || v.removed) return;
    v.hp -= dmg;
    if (byPlayer && v.type === 'police') G.crime(0.4);
    if (v.driver === 'ai' && byPlayer) v.panic = 10;
    if (v.hp <= 0) {
      v.hp = 0; G.explosion(v.x, 1, v.z, 9, 90);
      v.model.traverse((o) => { if (o.material && o.material.color) { o.material = N.mat('#1c1c1e'); } });
      if (v.driver === 'player') { G.exitVehicle(true); }
      v.driver = null; v.wreck = 25; v.speed = 0;
    }
  };

  // трафик: машины едут по полосам между перекрёстками и выбирают поворот
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function laneNext(i, j, pi, pj) {
    const opts = DIRS.map(([a, b]) => [i + a, j + b]).filter(([a, b]) => a >= 0 && b >= 0 && a <= N.GN && b <= N.GN && !(a === pi && b === pj));
    return opts[(Math.random() * opts.length) | 0] || [pi, pj];
  }
  function lanePos(v) {
    const A = N.node(v.from[0], v.from[1]), Bn = N.node(v.to[0], v.to[1]), dx = Bn.x - A.x, dz = Bn.z - A.z, L = Math.hypot(dx, dz) || 1, nx = dz / L, nz = -dx / L;
    return { x: A.x + dx * v.t + nx * -3.5, z: A.z + dz * v.t + nz * -3.5, yaw: Math.atan2(dx, dz), L };
  }
  function spawnTraffic() {
    const i = Math.floor(Math.random() * (N.GN + 1)), j = Math.floor(Math.random() * (N.GN + 1)), [ti, tj] = laneNext(i, j, -1, -1);
    const A = N.node(i, j); const d = Math.hypot(A.x - P.x, A.z - P.z); if (d < 90 || d > 200) return;
    const r = Math.random(), type = r < 0.12 ? 'taxi' : r < 0.22 ? 'truck' : r < 0.32 ? 'sport' : r < 0.36 ? 'buggy' : 'sedan';
    const v = spawnCar(type, A.x, A.z, 0, null, { driver: 'ai', from: [i, j], to: [ti, tj], t: Math.random() * 0.6 });
    const lp = lanePos(v); v.x = lp.x; v.z = lp.z; v.yaw = lp.yaw;
  }
  function tickTraffic(v, dt) {
    if (v.chase) return tickPolice(v, dt);
    const lp = lanePos(v);
    let target = v.panic > 0 ? 24 : 13;
    // впереди машина или игрок — тормозим
    const fx2 = Math.sin(lp.yaw), fz2 = Math.cos(lp.yaw);
    for (const o of G.vehicles) { if (o === v || o.removed || o.kind !== 'car') continue; const dx = o.x - v.x, dz = o.z - v.z, ahead = dx * fx2 + dz * fz2, side = Math.abs(dx * fz2 - dz * fx2); if (ahead > 0 && ahead < 11 && side < 2.6) target = Math.min(target, Math.max(0, (ahead - 6) * 2)); }
    if (P.mode === 'foot') { const dx = P.x - v.x, dz = P.z - v.z, ahead = dx * fx2 + dz * fz2, side = Math.abs(dx * fz2 - dz * fx2); if (ahead > 0 && ahead < 9 && side < 2) target = 0; }
    if (v.panic > 0) v.panic -= dt;
    v.speed += Math.sign(target - v.speed) * Math.min(Math.abs(target - v.speed), 10 * dt);
    v.t += v.speed * dt / lp.L;
    if (v.t >= 1) { const nx = laneNext(v.to[0], v.to[1], v.from[0], v.from[1]); v.from = v.to; v.to = nx; v.t = 0; }
    const np = lanePos(v);
    v.x += (np.x - v.x) * Math.min(1, dt * 8); v.z += (np.z - v.z) * Math.min(1, dt * 8);
    let dy = np.yaw - v.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; v.yaw += dy * Math.min(1, dt * 6);
  }

  // полиция: едет прямо к игроку, огибая дома выталкиванием
  function tickPolice(v, dt) {
    const dx = P.x - v.x, dz = P.z - v.z, d = Math.hypot(dx, dz);
    if (!G.wanted) { v.chase = false; v.driver = 'ai'; const [i, j] = N.nearestNode(v.x, v.z); v.from = [i, j]; v.to = laneNext(i, j, -1, -1); v.t = 0; return; }
    const want = Math.atan2(dx, dz); let dy = want - v.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    v.yaw += Math.max(-1.8 * dt, Math.min(1.8 * dt, dy));
    const target = P.mode === 'foot' && d < 16 ? 0 : Math.min(v.D.max * 0.75, 10 + d * 0.5);
    v.speed += Math.sign(target - v.speed) * Math.min(Math.abs(target - v.speed), 16 * dt);
    v.x += Math.sin(v.yaw) * v.speed * dt; v.z += Math.cos(v.yaw) * v.speed * dt;
    const hit = col.push(v, v.D.w * 0.6, 0); if (hit) { v.yaw += 1.2 * dt * Math.sign(dy || 1); v.speed *= 0.9; }
    // выходят и идут пешком
    if (P.mode === 'foot' && d < 18 && Math.abs(v.speed) < 2 && !v.unloaded) { v.unloaded = true; for (let k = 0; k < 2; k++) spawnHuman(G.cops, v.x + (k ? 1.5 : -1.5), v.z, { cop: true, hp: 60, fromCar: v }); }
    if (P.mode !== 'foot' && d < 25 && G.wanted >= 3) { v.cool = (v.cool || 1.5) - dt; if (v.cool <= 0) { v.cool = 1.4; if (Math.random() < 0.35 && P.veh) G.hurtVehicle(P.veh, 6); G.tracer(new THREE.Vector3(v.x, 1.4, v.z), new THREE.Vector3(P.x, 1.2, P.z)); G.sfx('pistol'); } }
  }

  // столкновения машин между собой
  function carCollisions() {
    const cars = G.vehicles.filter((v) => v.kind === 'car' && !v.removed);
    for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) {
      const A = cars[a], Bv = cars[b], dx = Bv.x - A.x, dz = Bv.z - A.z, d = Math.hypot(dx, dz), min = (A.D.len + Bv.D.len) * 0.32 + 0.6;
      if (d < min && d > 0.01) {
        const push = (min - d) / 2, nx = dx / d, nz = dz / d;
        A.x -= nx * push; A.z -= nz * push; Bv.x += nx * push; Bv.z += nz * push;
        const rel = Math.abs(A.speed - Bv.speed);
        if (rel > 8) { const dmg = rel * 0.7; const byP = A.driver === 'player' || Bv.driver === 'player'; G.hurtVehicle(A, dmg, byP); G.hurtVehicle(Bv, dmg, byP); G.sfx('crash'); if (A.driver === 'player' || Bv.driver === 'player') G.shake = 0.4; }
        const avg = (A.speed + Bv.speed) / 2; A.speed = A.speed * 0.3 + avg * 0.3; Bv.speed = Bv.speed * 0.3 + avg * 0.3;
        if (A.driver === 'ai') A.panic = 6; if (Bv.driver === 'ai') Bv.panic = 6;
      }
    }
  }

  // ---------- управление транспортом игроком ----------
  function driveCar(v, dt) {
    const I = G.inp, D = v.D;
    const f = -I.my, s = I.mx;
    if (f > 0) v.speed += D.acc * f * dt * (v.speed < 0 ? 2.5 : 1);
    else if (f < 0) v.speed += (v.speed > 1 ? -28 : -9) * -f * dt;
    v.speed -= v.speed * (I.brake ? 1.6 : 0.25) * dt;
    v.speed = Math.max(-12, Math.min(D.max, v.speed));
    if (Math.abs(v.speed) < 0.2 && !f) v.speed = 0;
    const steer = s * (0.9 - Math.min(0.5, Math.abs(v.speed) / D.max * 0.5)) * (I.brake ? 1.5 : 1);
    v.steer += (steer - v.steer) * Math.min(1, dt * 8);
    v.yaw -= v.steer * v.speed / (D.len * 0.9) * dt;
    v.x += Math.sin(v.yaw) * v.speed * dt; v.z += Math.cos(v.yaw) * v.speed * dt;
    // два круга — нос и корма — выталкиваются из домов
    const bump = (k) => { const o = { x: v.x + Math.sin(v.yaw) * D.len * k, z: v.z + Math.cos(v.yaw) * D.len * k }; const h = col.push(o, D.w * 0.55, 0); if (h) { v.x += o.x - (v.x + Math.sin(v.yaw) * D.len * k); v.z += o.z - (v.z + Math.cos(v.yaw) * D.len * k); } return h; };
    const h1 = bump(0.3), h2 = bump(-0.3);
    if ((h1 || h2) && Math.abs(v.speed) > 3) { if (Math.abs(v.speed) > 14) { G.hurtVehicle(v, Math.abs(v.speed) * 0.6); G.sfx('crash'); G.shake = 0.5; } v.speed *= -0.3; }
    if (v.x < N.BEACH - 30) { v.x = N.BEACH - 30; v.speed *= 0.5; }
    G.engine(true, Math.abs(v.speed) / D.max, 'car');
  }
  // Самолёт: вперёд/вверх — нос вверх (на земле это ещё и газ), назад — нос вниз, вбок — крен и поворот.
  // ▲/▼ (Shift и C на клавиатуре) — газ. Медленнее ~95 км/ч самолёт сваливается и теряет высоту.
  function flyPlane(v, dt) {
    const I = G.inp, pull = -I.my;
    const roof = col.roofAt(v.x, v.z);
    const ground = roof > 0 && v.y >= roof - 0.6 ? roof : 0, onGround = v.y <= ground + 0.05;
    let thr = I.up ? 0.7 : I.down ? -0.7 : 0;
    if (onGround && pull > 0.2) thr = Math.max(thr, 0.8);
    v.throttle = Math.max(0, Math.min(1, v.throttle + thr * dt));
    v.speed += (v.throttle * 78 - v.speed) * 0.38 * dt;
    const fly = v.speed > 26;
    if (!onGround) {
      v.roll += (I.mx * 1.0 - v.roll) * Math.min(1, dt * 2.5);
      v.pitch += (pull * 0.6 - v.pitch) * Math.min(1, dt * 2);
      v.yaw -= v.roll * dt * 0.9;
      if (!fly) v.pitch += (-0.35 - v.pitch) * Math.min(1, dt * 0.8);   // сваливание
    } else {
      v.roll *= 0.8;
      v.yaw -= I.mx * dt * 0.7 * Math.min(1, v.speed / 8);
      // разбег: при скорости взлёта нос поднимается сам, если держишь «вверх»
      v.pitch = fly && pull > 0.2 ? Math.min(0.35, v.pitch + dt * 0.6) : Math.max(0, v.pitch - dt);
    }
    const sink = fly ? 0 : -6;
    const cp = Math.cos(v.pitch);
    v.x += Math.sin(v.yaw) * cp * v.speed * dt; v.z += Math.cos(v.yaw) * cp * v.speed * dt;
    v.y += (Math.sin(v.pitch) * v.speed + (onGround ? 0 : sink)) * dt;
    // влетел в стену дома
    const roof2 = col.roofAt(v.x, v.z);
    if (roof2 > 0 && v.y < roof2 - 0.6) { G.hurtVehicle(v, 999); return; }
    const g2 = roof2 > 0 ? roof2 : 0;
    if (v.y < g2) {
      const hard = (v.speed > 18 && (v.pitch < -0.3 || Math.abs(v.roll) > 0.7)) || (v.speed > 45 && v.pitch < -0.15);
      v.y = g2; v.pitch = Math.max(0, v.pitch);
      if (hard) { G.hurtVehicle(v, 999); return; }
    }
    if (v.x < N.BOUNDS.x0 - 300 || v.x > N.BOUNDS.x1 + 300 || v.z < N.BOUNDS.z0 - 300 || v.z > N.BOUNDS.z1 + 300) { v.yaw += Math.PI * dt * 0.5; }
    if (v.y > 400) v.y = 400;
    v.model.userData.prop.rotation.z += v.throttle * 40 * dt;
    G.engine(true, v.throttle, 'plane');
  }
  function flyHeli(v, dt) {
    const I = G.inp;
    const up = (I.jump || I.up ? 1 : 0) - (I.down || I.brake ? 1 : 0);
    v.throttle += ((up !== 0 || v.y > 0.2 ? 1 : 0.3) - v.throttle) * dt;
    v.vy += (up * 9 - v.vy) * Math.min(1, dt * 2);
    const fwd = -I.my, side = I.mx;
    v.pitch += (fwd * 0.28 - v.pitch) * Math.min(1, dt * 3); v.roll += (side * 0.25 - v.roll) * Math.min(1, dt * 3);
    v.yaw -= side * dt * 1.4;
    if (v.y > 0.3 || up > 0) { v.speed += (fwd * 34 - v.speed) * Math.min(1, dt * 1.2); }
    else v.speed *= 0.9;
    v.x += Math.sin(v.yaw) * v.speed * dt; v.z += Math.cos(v.yaw) * v.speed * dt; v.y += v.vy * dt;
    const ground = Math.max(0, col.roofAt(v.x, v.z));
    if (v.y < ground) { if (v.vy < -14) G.hurtVehicle(v, 60); v.y = ground; v.vy = Math.max(0, v.vy); }
    if (v.y > 260) v.y = 260;
    const o = { x: v.x, z: v.z }; if (col.push(o, 2.6, v.y + 0.5)) { v.x = o.x; v.z = o.z; if (Math.abs(v.speed) > 18) G.hurtVehicle(v, 25); v.speed *= -0.3; }
    v.model.userData.rotor.rotation.y += (8 + v.throttle * 30) * dt; v.model.userData.tail.rotation.x += 40 * v.throttle * dt;
    G.engine(true, v.throttle, 'heli');
  }

  // ---------- посадка и высадка ----------
  G.nearVehicle = () => { let best = null, bd = 1e9; for (const v of G.vehicles) { if (v.removed || v.hp <= 0) continue; const d = Math.hypot(v.x - P.x, v.z - P.z) - (v.kind === 'plane' ? 6 : v.kind === 'heli' ? 3 : v.D.len / 2); if (d < 3 && d < bd && Math.abs(v.y - P.y) < 3) { bd = d; best = v; } } return best; };
  G.enterVehicle = function (v) {
    if (!v) return;
    if (v.driver === 'ai' || v.chase) {
      // угон: водитель выходит и убегает
      const h = spawnHuman(v.type === 'police' ? G.cops : G.peds, v.x + Math.cos(v.yaw) * 2, v.z - Math.sin(v.yaw) * 2, v.type === 'police' ? { cop: true, hp: 60 } : {});
      if (!h.cop) { h.state = 'flee'; h.fleeT = 6; }
      if (v.type === 'police') G.crime(1); else if (G.humans().some((o) => o.state !== 'dead' && Math.hypot(o.x - v.x, o.z - v.z) < 25)) G.crime(0.5);
      v.chase = false;
    }
    v.driver = 'player'; P.mode = v.kind; P.veh = v; P.model.visible = false; G.sfx('door'); G.uiDirty = true;
    G.cam.yaw = v.yaw + Math.PI;
    if (v.kind === 'plane') G.toast(G.settings.touch ? 'Джойстик вверх — разгон и взлёт, ▲▼ — газ' : 'W — разгон и нос вверх, S — нос вниз, A/D — поворот, Shift/C — газ', 5000);
    if (v.kind === 'heli') G.toast(G.settings.touch ? '▲▼ — высота, джойстик — полёт' : 'Пробел — вверх, C — вниз, WASD — полёт', 4000);
    if (G.onEnter) G.onEnter(v);
  };
  G.exitVehicle = function (forced) {
    const v = P.veh; if (!v) return;
    if (!forced && (v.kind === 'plane') && v.y > 2 && v.speed > 10) { G.toast('Сначала приземлись'); return; }
    const side = v.kind === 'car' ? v.D.w / 2 + 1 : v.kind === 'plane' ? 3 : 2.2;
    P.x = v.x - Math.cos(v.yaw) * side; P.z = v.z + Math.sin(v.yaw) * side; P.y = Math.max(v.y, col.roofAt(P.x, P.z)); P.vy = 0;
    col.push(P, 0.4, P.y);
    v.driver = null; v.speed = forced ? v.speed : v.speed * 0.3; P.mode = 'foot'; P.veh = null; P.model.visible = true; G.engine(false, 0);
    G.sfx('door'); G.uiDirty = true;
    if (G.onExit) G.onExit(v);
  };

  // ---------- стрельба ----------
  const ray = new THREE.Raycaster();
  function aimRay() {
    ray.setFromCamera({ x: 0, y: 0 }, camera);
    return { o: ray.ray.origin.clone(), d: ray.ray.direction.clone() };
  }
  function rayBox(o, d, cx, cy0, cz, hw, hh, hd, yaw = 0) {
    // луч в локальные координаты коробки, повёрнутой на yaw
    const s = Math.sin(-yaw), c = Math.cos(-yaw), ox = o.x - cx, oz = o.z - cz;
    const lo = { x: ox * c + oz * s, y: o.y - cy0, z: -ox * s + oz * c }, ld = { x: d.x * c + d.z * s, y: d.y, z: -d.x * s + d.z * c };
    let t0 = 0, t1 = 1e9;
    for (const [oo, dd, a, b] of [[lo.x, ld.x, -hw, hw], [lo.y, ld.y, 0, hh], [lo.z, ld.z, -hd, hd]]) {
      if (Math.abs(dd) < 1e-9) { if (oo < a || oo > b) return null; continue; }
      let ta = (a - oo) / dd, tb = (b - oo) / dd; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return null;
    }
    return t0;
  }
  G.shoot = function () {
    const W = G.WEAP[G.cur];
    if (fireCD > 0 || P.mode !== 'foot' || P.hp <= 0) return;
    fireCD = W.rate;
    if (W.melee) {
      G.sfx('punch'); P.punch = 0.25;
      for (const h of G.humans()) if (h.state !== 'dead' && Math.hypot(h.x - P.x, h.z - P.z) < W.range) { G.hurtHuman(h, W.dmg, true); if (!h.gang && !h.cop && Math.random() < 0.3) G.crime(0.3); break; }
      if (G.netHitNear) G.netHitNear(W.dmg, W.range);
      return;
    }
    if (G.weapons[G.cur] <= 0) { G.sfx('click'); G.nextWeapon(); return; }
    G.weapons[G.cur]--; G.uiDirty = true;
    G.sfx(W.snd);
    // стрельба вблизи людей поднимает розыск
    if (!G.wanted && G.humans().some((h) => h.state !== 'dead' && !h.gang && Math.hypot(h.x - P.x, h.z - P.z) < 30)) { G.crime(1); for (const h of G.peds) if (Math.hypot(h.x - P.x, h.z - P.z) < 40 && h.state === 'walk') { h.state = 'flee'; h.fleeT = 8; } }
    const { o, d } = aimRay();
    const gunPos = new THREE.Vector3(P.x + Math.sin(P.yaw) * 0.6 + Math.cos(P.yaw) * 0.35, P.y + 1.35, P.z + Math.cos(P.yaw) * 0.6 - Math.sin(P.yaw) * 0.35);
    // начало луча — у игрока, чтобы не цепляться за стены позади
    const t0 = o.distanceTo(new THREE.Vector3(P.x, P.y + 1.4, P.z)); o.addScaledVector(d, t0);
    // мягкое автонаведение: если человек почти под прицелом — целимся ему в грудь
    { const lim = G.settings.touch ? 0.12 : 0.05; let bestA = lim, aimTo = null;
      for (const h of G.humans()) { if (h.state === 'dead') continue; const c = new THREE.Vector3(h.x, 1.3, h.z), v = c.clone().sub(o), L = v.length(); if (L > W.range || L < 0.5) continue; const a = Math.acos(Math.max(-1, Math.min(1, v.dot(d) / L))); if (a < bestA) { bestA = a; aimTo = c; } }
      if (aimTo) d.copy(aimTo.sub(o).normalize()); }
    for (let k = 0; k < (W.pellets || 1); k++) {
      const dd = d.clone().add(new THREE.Vector3((Math.random() - 0.5) * W.spread * 2, (Math.random() - 0.5) * W.spread * 2, (Math.random() - 0.5) * W.spread * 2)).normalize();
      let best = Math.min(W.range, G.ccol().ray(o, dd, W.range)), hitObj = null;
      const gy = -o.y / (dd.y || -1e-9); if (dd.y < 0 && gy < best) best = gy;
      for (const h of G.humans()) { if (h.state === 'dead') continue; const t = rayBox(o, dd, h.x, 0, h.z, 0.35, 1.9, 0.35); if (t !== null && t < best) { best = t; hitObj = { h }; } }
      for (const v of G.vehicles) { if (v.removed || v === P.veh) continue; const t = rayBox(o, dd, v.x, v.y, v.z, (v.D.w || 2) / 2, v.kind === 'car' ? 1.9 : 3.5, v.D.len / 2, v.yaw); if (t !== null && t < best) { best = t; hitObj = { v }; } }
      if (G.netRayTest) { const r2 = G.netRayTest(o, dd, best, rayBox); if (r2) { best = r2.t; hitObj = { remote: r2.id }; } }
      const end = o.clone().addScaledVector(dd, best);
      G.tracer(gunPos, end);
      if (hitObj && hitObj.h) G.hurtHuman(hitObj.h, W.dmg, true);
      else if (hitObj && hitObj.v) { G.hurtVehicle(hitObj.v, W.dmg * 0.5, true); G.puff(end.x, end.y, end.z, '#ffd447', 0.3, 0.2, 0); }
      else if (hitObj && hitObj.remote) G.netHit(hitObj.remote, W.dmg);
      else if (best < W.range) G.puff(end.x, end.y, end.z, '#bbb', 0.25, 0.3, 0.5);
      if (G.netShot) G.netShot(gunPos, end);
    }
    G.camKick = 0.02 + (W.pellets ? 0.04 : 0);
  };

  // ---------- игрок: урон, смерть ----------
  G.hurtPlayer = function (dmg, why, from) {
    if (P.hp <= 0 || G.god) return;
    if (P.armor > 0) { const a = Math.min(P.armor, dmg * 0.7); P.armor -= a; dmg -= a; }
    P.hp -= dmg; G.sfx('hurt'); G.flash = 0.35; G.uiDirty = true;
    if (P.hp <= 0) { P.hp = 0; G.die(why); }
  };
  G.crime = function (n) {
    const before = Math.floor(G.wanted);
    G.wanted = Math.min(5, G.wanted + n); G.seenT = 0; G.uiDirty = true;
    if (Math.floor(G.wanted) > before) G.toast('★'.repeat(Math.floor(G.wanted)) + ' Тебя ищет полиция');
  };
  function tickWanted(dt) {
    if (G.wanted <= 0) { G.wanted = 0; return; }
    const stars = Math.ceil(G.wanted);
    const seen = G.cops.some((h) => h.state !== 'dead' && Math.hypot(h.x - P.x, h.z - P.z) < 60) || G.vehicles.some((v) => v.chase && Math.hypot(v.x - P.x, v.z - P.z) < 70);
    if (seen) G.seenT = 0; else G.seenT = (G.seenT || 0) + dt;
    G.hidden = !seen;
    if (G.seenT > 8 + stars * 3) { G.wanted = Math.max(0, Math.ceil(G.wanted) - 1); G.seenT = 0; G.uiDirty = true; if (!G.wanted) G.toast('Полиция потеряла след'); }
    // машины полиции подтягиваются (в помещение не заезжают)
    if (G.inside) return;
    const chasing = G.vehicles.filter((v) => v.chase && !v.removed).length;
    if (chasing < Math.min(5, stars) && Math.random() < dt * 0.6) {
      const a = Math.random() * 6.28, x = P.x + Math.cos(a) * 110, z = P.z + Math.sin(a) * 110;
      const [i, j] = N.nearestNode(x, z), nd = N.node(i, j);
      if (Math.hypot(nd.x - P.x, nd.z - P.z) > 60) { const v = spawnCar('police', nd.x, nd.z, Math.atan2(P.x - nd.x, P.z - nd.z), null, { driver: 'ai', chase: true }); v.siren = true; }
    }
  }
  G.die = function (why) { P.hp = 0; G.dead = true; if (P.veh) G.exitVehicle(true); P.model.rotation.x = -Math.PI / 2; P.model.position.y = 0.2; if (G.onDeath) G.onDeath(why); };
  G.respawn = function () {
    const lost = Math.floor(G.money * 0.1); G.money -= lost;
    G.dead = false; P.hp = 100; P.armor = 0; G.wanted = 0; P.model.rotation.x = 0;
    for (const v of G.vehicles) if (v.chase) removeVehicle(v);
    for (const h of G.cops) removeHuman(h);
    if (G.leaveInside) G.leaveInside();
    const H = G.HOSPITAL; P.x = H.x; P.z = H.z; P.y = 0; P.vy = 0; P.mode = 'foot'; P.veh = null; P.model.visible = true;
    G.uiDirty = true; G.toast('Больница: лечение стоило $' + lost);
  };
  G.HOSPITAL = { x: N.roadX(5) + 12, z: N.roadX(4) + 12 };

  // ---------- подбираемые вещи ----------
  G.pickups = [];
  G.spawnPickup = function (kind, x, z, val = 0, opts = {}) {
    const g = new THREE.Group(), c = { cash: '#3ab06a', health: '#ff4f6d', armor: '#3a7be8', weapon: '#ffd447', pkg: '#ff8a2a' }[kind];
    N.cube(g, 0.7, 0.7, 0.7, c, 0, 0, 0, c); g.position.set(x, 0.8, z); scene.add(g);
    const p = Object.assign({ kind, x, z, val, model: g, t: 0 }, opts); G.pickups.push(p); return p;
  };
  function tickPickups(dt) {
    for (const p of G.pickups) {
      p.t += dt; p.model.rotation.y += dt * 2; p.model.position.y = 0.8 + Math.sin(p.t * 3) * 0.15;
      if (P.mode === 'foot' && Math.hypot(p.x - P.x, p.z - P.z) < 1.4 && Math.abs(P.y - 0) < 3) {
        if (p.kind === 'cash') { G.money += p.val; G.toast('+$' + p.val); }
        else if (p.kind === 'health') { if (P.hp >= 100) continue; P.hp = Math.min(100, P.hp + 50); G.toast('+50 здоровья'); }
        else if (p.kind === 'armor') { P.armor = 100; G.toast('Бронежилет'); }
        else if (p.kind === 'weapon') { G.weapons[p.w] = (G.weapons[p.w] || 0) + p.val; G.cur = p.w; G.toast(G.WEAP[p.w].n + ' +' + p.val); }
        else if (p.kind === 'pkg') { G.foundPkg(p); }
        G.sfx('cash'); p.taken = true; scene.remove(p.model); G.uiDirty = true;
        if (p.respawn) setTimeout(() => { if (G.state === 'play') G.spawnPickup(p.kind, p.x, p.z, p.val, { w: p.w, respawn: p.respawn }); }, p.respawn * 1000);
      }
    }
    G.pickups = G.pickups.filter((p) => !p.taken);
  }

  // ---------- игрок пешком ----------
  function walk(dt) {
    const C = G.ccol();
    const I = G.inp, c = G.cam;
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);   // вперёд от камеры
    let mx = fx * -I.my + -fz * I.mx * -1, mz = fz * -I.my + fx * I.mx * -1;
    // вправо = (fz, -fx)?  проверка: камера смотрит вдоль (fx,fz); правый вектор (−fz, fx)
    mx = fx * -I.my + -fz * I.mx; mz = fz * -I.my + fx * I.mx;
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    const sp = I.sprint ? 7.5 : 4.6;
    P.x += mx * sp * dt; P.z += mz * sp * dt; P.speed = ml * sp;
    if (I.aim || I.fire) P.yaw = c.yaw + Math.PI; else if (ml > 0.1) { let want = Math.atan2(mx, mz), d = want - P.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; P.yaw += d * Math.min(1, dt * 12); }
    P.vy -= 24 * dt; P.y += P.vy * dt;
    const floor = Math.max(0, C.roofAt(P.x, P.z) <= P.y + 0.3 ? C.roofAt(P.x, P.z) : 0);
    if (P.y <= floor) { if (P.vy < -18) G.hurtPlayer((-P.vy - 18) * 4, 'падение'); P.y = floor; P.vy = 0; P.onGround = true; } else P.onGround = false;
    if (I.jump && P.onGround) { P.vy = 7.5; P.onGround = false; }
    C.push(P, 0.4, P.y + 0.2);
    if (!G.inside && P.x < N.BEACH - 30) { P.x = N.BEACH - 30; }
    P.anim += dt * P.speed * 2;
  }

  // ---------- камера ----------
  G.shake = 0; G.camKick = 0; G.flash = 0;
  function updateCamera(dt) {
    const c = G.cam, I = G.inp;
    c.yaw -= I.lookDX; c.pitch = Math.max(-1.2, Math.min(0.9, c.pitch - I.lookDY - G.camKick)); I.lookDX = 0; I.lookDY = 0; G.camKick *= 0.5;
    let tx = P.x, ty = P.y + 1.6, tz = P.z, dist = G.inside ? 3.2 : I.aim ? 2.6 : 4.4, side = G.inside ? 0.4 : 0.75;
    if (P.mode === 'car') { const v = P.veh; tx = v.x; tz = v.z; ty = 2.2; dist = 7.5 + v.D.len * 0.3; side = 0; if (!G.lookingAround) { let d = v.yaw + Math.PI - c.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; if (Math.abs(v.speed) > 3) c.yaw += d * Math.min(1, dt * 2.5); } }
    if (P.mode === 'plane' || P.mode === 'heli') { const v = P.veh; tx = v.x; tz = v.z; ty = v.y + 3; dist = P.mode === 'plane' ? 22 : 16; side = 0; if (!G.lookingAround) { let d = v.yaw + Math.PI - c.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; c.yaw += d * Math.min(1, dt * 2.2); } }
    const cp = Math.cos(c.pitch);
    let cx = tx + Math.sin(c.yaw) * cp * dist + Math.cos(c.yaw) * side, cy = ty - Math.sin(c.pitch) * dist, cz = tz + Math.cos(c.yaw) * cp * dist - Math.sin(c.yaw) * side;
    // не уходить за стены
    const o = { x: tx, y: ty, z: tz }, dv = new THREE.Vector3(cx - tx, cy - ty, cz - tz), L = dv.length(); dv.normalize();
    const hitD = G.ccol().ray(o, dv, L); if (hitD < L) { cx = tx + dv.x * (hitD - 0.4); cy = ty + dv.y * (hitD - 0.4); cz = tz + dv.z * (hitD - 0.4); }
    cy = Math.max(cy, 0.5); if (G.inside) cy = Math.min(cy, 4.3);
    camera.position.set(cx, cy, cz);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(c.pitch, c.yaw, 0);
    if (G.shake > 0) { camera.position.x += (Math.random() - 0.5) * G.shake; camera.position.y += (Math.random() - 0.5) * G.shake; G.shake = Math.max(0, G.shake - dt); }
  }

  // ---------- главный цикл ----------
  let last = performance.now(), sirenT = 0;
  G.frame = function (now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (G.state === 'play' && !G.paused) {
      G.t += dt;
      if (fireCD > 0) fireCD -= dt;
      if (!G.dead) {
        if (P.mode === 'foot') { walk(dt); if (G.inp.fire && (G.WEAP[G.cur].auto || !G.fireHeld)) { G.shoot(); } G.fireHeld = G.inp.fire; }
        else if (P.mode === 'car') driveCar(P.veh, dt);
        else if (P.mode === 'plane') flyPlane(P.veh, dt);
        else if (P.mode === 'heli') flyHeli(P.veh, dt);
        if (P.veh) { P.x = P.veh.x; P.z = P.veh.z; P.y = P.veh.y; }
      }
      // трафик
      if (G.vehicles.filter((v) => v.driver === 'ai' && !v.chase).length < (G.settings.quality ? 26 : 16) && Math.random() < 0.4) spawnTraffic();
      for (const v of G.vehicles) {
        if (v.removed) continue;
        const d = Math.hypot(v.x - P.x, v.z - P.z);
        if (v.wreck !== undefined) { v.wreck -= dt; if (v.wreck <= 0 && d > 40) removeVehicle(v); if (Math.random() < dt * 6) G.puff(v.x, 1.5, v.z, '#333', 1.5, 1.2, 2); continue; }
        if (v.driver === 'ai') { if (d > 260) { removeVehicle(v); continue; } tickTraffic(v, dt); }
        else if (v.driver === null && v.kind === 'car') { v.speed *= Math.pow(0.2, dt); v.x += Math.sin(v.yaw) * v.speed * dt; v.z += Math.cos(v.yaw) * v.speed * dt; if (!v.keep && d > 300) { removeVehicle(v); continue; } }
        else if (v.driver === null && (v.kind === 'plane' || v.kind === 'heli')) { if (v.y > col.roofAt(v.x, v.z) + 0.05) { v.y -= 12 * dt; if (v.y <= col.roofAt(v.x, v.z)) { v.y = col.roofAt(v.x, v.z); if (v.kind === 'plane' && v.speed > 15) G.hurtVehicle(v, 999); } } v.speed *= Math.pow(0.3, dt); v.x += Math.sin(v.yaw) * v.speed * dt; v.z += Math.cos(v.yaw) * v.speed * dt; }
        if (v.hp > 0 && v.hp < 35 && Math.random() < dt * 5) G.puff(v.x + Math.sin(v.yaw) * (v.D.len || 4) * 0.35, 1.4, v.z + Math.cos(v.yaw) * (v.D.len || 4) * 0.35, '#555', 1, 1, 2);
        // вид
        v.model.position.set(v.x, v.y, v.z);
        if (v.kind === 'car') { v.model.rotation.set(0, v.yaw, 0); const w = v.model.userData.wheels; for (let k = 0; k < 4; k++) { w[k].children.forEach((c) => { c.rotation.x += v.speed * dt / 0.42; }); if (k < 2) w[k].rotation.y = -v.steer * 0.5; } }
        else { v.model.rotation.order = 'YXZ'; if (v.kind === 'plane') v.model.rotation.set(-v.pitch, v.yaw, v.roll); else v.model.rotation.set(v.pitch, v.yaw, v.roll); }
        if (v.model.userData.siren && (v.chase || v.siren)) { sirenT += dt; const on = Math.floor(G.t * 6) % 2; v.model.userData.siren[0].visible = !!on; v.model.userData.siren[1].visible = !on; }
      }
      carCollisions();
      G.vehicles = G.vehicles.filter((v) => !v.removed);
      tickHumans(dt); tickWanted(dt); tickPickups(dt); tickFx(dt);
      if (P.mode === 'foot' || G.dead) G.engine(false, 0);
      // модель игрока
      if (P.mode === 'foot') {
        P.model.position.set(P.x, G.dead ? P.y + 0.2 : P.y, P.z); P.model.rotation.y = P.yaw;
        if (!G.dead) N.animHuman(P.model, P.anim, P.speed / 4.6, (G.inp.aim || G.inp.fire) && !G.WEAP[G.cur].melee, G.cam.pitch);
        P.model.userData.gun.visible = !G.WEAP[G.cur].melee;
        if (P.punch > 0) { P.punch -= dt; P.model.userData.armR.rotation.x = -Math.PI / 2; }
      }
      updateCamera(dt);
      if (G.tickMissions) G.tickMissions(dt);
      if (G.tickVenues) G.tickVenues(dt);
      if (G.tickNet) G.tickNet(dt);
      if (G.tickHud) G.tickHud(dt);
      if (G.flash > 0) G.flash -= dt;
      G.saveT = (G.saveT || 0) + dt; if (G.saveT > 10) { G.saveT = 0; if (G.save) G.save(); }
    }
    R.render(scene, camera);
    requestAnimationFrame(G.frame);
  };

  // транспорт, который всегда стоит на месте: самолёты в аэропорту, вертолёты на крышах, машины у дома
  G.placeFixed = function () {
    G.spawnAir('plane', 520, N.AIR.rz, Math.PI / 2, '#e8e6e0');
    G.spawnAir('plane', 470, N.AIR.rz - 40, Math.PI / 2, '#ffd447');
    G.spawnAir('heli', 760, -40, 0, '#c8341a');
    // вертолёт на крыше самого высокого здания
    const top = G.plan.buildings.slice().sort((a, b) => b.h - a.h)[0];
    G.spawnAir('heli', top.x, top.z, 0, '#2a5ab0').y = top.h + 0.4;
    G.roofHeli = { x: top.x, z: top.z, h: top.h };
    for (const v of G.vehicles) v.keep = true;
    const s = G.spawnCar('sport', N.roadX(2) + 10, N.roadX(2) + 22, 0, '#ff2a6a'); s.keep = true;
    const b = G.spawnCar('buggy', N.BEACH + 20, 300, Math.PI / 2); b.keep = true;
  };
})();
