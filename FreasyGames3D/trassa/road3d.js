'use strict';
/* =====================================================
   Трасса 3D — отрисовка на three.js для FreasyGames 3D.
   Логика (машины, полосы, топливо, монеты) осталась от 2D-версии в index.html,
   этот модуль каждый кадр рисует её состояние в 3D. 1 единица мира = 40 px поля.
===================================================== */
const Road3D = (() => {
  const K = 1 / 40, ROAD_W = 360 * K, HALF = ROAD_W / 2, LEN = 150, DASH = 8; // DASH — период разметки в единицах
  let renderer, scene, camera, roadTex, playerCar, headL, sideObjs = [];
  const carPool = new Map(), itemPool = new Map(), ghostPool = new Map(), partPool = [];
  const matCache = new Map();
  const mat = (color, o = {}) => { const k = color + JSON.stringify(o); if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color, ...o })); return matCache.get(k); };
  const geo = {};
  function canvasTex(w, h, draw) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.anisotropy = 8; return t; }

  /* ---------- машины ---------- */
  function buildCar(color, kind, me, ghost) {
    const g = new THREE.Group();
    const o = ghost ? { transparent: true, opacity: .45, depthWrite: false } : {};
    const paint = new THREE.MeshLambertMaterial({ color, ...o });
    const glass = new THREE.MeshLambertMaterial({ color: 0x1b2238, ...o });
    if (kind === 'truck') {
      const L = 150 * K, W = 58 * K;
      const cargo = new THREE.Mesh(new THREE.BoxGeometry(W, 1.5, L * .68), new THREE.MeshLambertMaterial({ color: 0xd9d6e6, ...o }));
      cargo.position.set(0, 1.05, L * .14); g.add(cargo);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(W + .02, .25, L * .68), paint); stripe.position.set(0, 1.2, L * .14); g.add(stripe);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(W, 1.1, L * .28), paint); cab.position.set(0, .85, -L * .34); g.add(cab);
      const win = new THREE.Mesh(new THREE.BoxGeometry(W * .9, .35, .05), glass); win.position.set(0, 1.15, -L * .48); g.add(win);
      addWheels(g, W, L * .8, .36, o);
      addRear(g, W, L * .48, o);
    } else {
      const L = 92 * K, W = 52 * K;
      const body = new THREE.Mesh(new THREE.BoxGeometry(W, .5, L), paint); body.position.y = .45; g.add(body);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(W * .86, .42, L * .5), glass); cabin.position.set(0, .9, me ? .1 : -.05); g.add(cabin);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(W * .8, .06, L * .42), paint); roof.position.set(0, 1.12, me ? .1 : -.05); g.add(roof);
      addWheels(g, W, L * .62, .3, o);
      if (me) {
        for (const x of [-W * .32, W * .32]) { const h = new THREE.Mesh(geo.light, new THREE.MeshBasicMaterial({ color: 0xfff6c4, ...o })); h.position.set(x, .5, -L / 2 - .01); g.add(h); }
        addRear(g, W, L / 2, o);
      } else addRear(g, W, L / 2, o);
    }
    if (!ghost) g.traverse((m) => { if (m.isMesh) m.castShadow = false; });
    g.userData.kind = kind;
    return g;
  }
  function addWheels(g, W, span, r, o) {
    const wm = new THREE.MeshLambertMaterial({ color: 0x111111, ...o });
    for (const x of [-W / 2, W / 2]) for (const z of [-span / 2, span / 2]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, .22, 12), wm); w.rotation.z = Math.PI / 2; w.position.set(x, r, z); g.add(w);
    }
  }
  function addRear(g, W, z, o) {
    for (const x of [-W * .34, W * .34]) { const l = new THREE.Mesh(geo.light, new THREE.MeshBasicMaterial({ color: 0xff3b3b, ...o })); l.position.set(x, .55, z + .01); l.rotation.y = Math.PI; g.add(l); }
  }
  function blinkers(g) {
    const bm = new THREE.MeshBasicMaterial({ color: 0xffb020 });
    const set = [];
    for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(.12, .12, .12), bm); b.position.set(s * .7, .6, 0); g.add(b); set.push(b); }
    g.userData.blink = set;
  }

  /* ---------- подписи ---------- */
  const nameCache = new Map();
  function nameSprite(name, color) {
    const k = name + color;
    if (!nameCache.has(k)) nameCache.set(k, canvasTex(256, 64, (c) => { c.font = '800 34px Manrope, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 6; c.strokeStyle = '#000a'; c.strokeText(name, 128, 34); c.fillStyle = color; c.fillText(name, 128, 34); }));
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameCache.get(k), transparent: true, depthWrite: false }));
    s.scale.set(2.4, .6, 1);
    return s;
  }

  /* ---------- сцена ---------- */
  function init(canvas) {
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); } catch (e) { console.error('WebGL:', e); return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0e1e);
    scene.fog = new THREE.Fog(0x0b0e1e, 30, 80);
    camera = new THREE.PerspectiveCamera(58, 1, .1, 200);
    scene.add(new THREE.HemisphereLight(0x8aa0ff, 0x10180f, .55));
    const moon = new THREE.DirectionalLight(0xb8c4ff, .55); moon.position.set(-6, 12, 4); scene.add(moon);
    geo.light = new THREE.PlaneGeometry(.28, .12);
    // дорога: асфальт с разметкой, текстура едет навстречу
    roadTex = canvasTex(256, 228, (c, w, h) => {
      c.fillStyle = '#2b2d3a'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 600; i++) { c.fillStyle = Math.random() < .5 ? '#ffffff08' : '#00000014'; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      c.fillStyle = '#e8e6f0'; c.fillRect(0, 0, 4, h); c.fillRect(w - 4, 0, 4, h);
      c.fillStyle = '#ffffffb0';
      for (let l = 1; l < 4; l++) for (let k = 0; k < 4; k++) c.fillRect(l * w / 4 - 2, k * h / 4, 4, h / 8);
    });
    roadTex.wrapS = THREE.ClampToEdgeWrapping; roadTex.wrapT = THREE.RepeatWrapping; roadTex.repeat.set(1, LEN / DASH);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, LEN), new THREE.MeshLambertMaterial({ map: roadTex }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0, 12 - LEN / 2); scene.add(road);
    const shoulder = mat(0x3a3c48);
    for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(.5, .12, LEN), shoulder); b.position.set(s * (HALF + .25), .06, 12 - LEN / 2); scene.add(b); }
    const grassTex = canvasTex(128, 128, (c) => { c.fillStyle = '#16301f'; c.fillRect(0, 0, 128, 128); for (let i = 0; i < 300; i++) { c.fillStyle = Math.random() < .5 ? '#1b3a26' : '#122818'; c.fillRect(Math.random() * 128, Math.random() * 128, 3, 3); } });
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping; grassTex.repeat.set(20, 40);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(120, LEN), new THREE.MeshLambertMaterial({ map: grassTex }));
    grass.rotation.x = -Math.PI / 2; grass.position.set(0, -.01, 12 - LEN / 2); scene.add(grass);
    grass.userData.tex = grassTex;
    scene.userData.grass = grass;
    // деревья и фонари вдоль дороги — едут навстречу по кругу
    const glow = canvasTex(64, 64, (c) => { const r = c.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,240,190,1)'); r.addColorStop(.3, 'rgba(255,220,140,.5)'); r.addColorStop(1, 'rgba(255,220,140,0)'); c.fillStyle = r; c.fillRect(0, 0, 64, 64); });
    for (let i = 0; i < 26; i++) {
      for (const s of [-1, 1]) {
        const g = new THREE.Group();
        if (i % 2 === 0) {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(.06, .08, 4, 6), mat(0x6a6d80)); pole.position.y = 2; g.add(pole);
          const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, .08, .08), mat(0x6a6d80)); arm.position.set(-s * .55, 3.95, 0); g.add(arm);
          const head = new THREE.Mesh(new THREE.BoxGeometry(.4, .12, .25), new THREE.MeshBasicMaterial({ color: 0xffe9a8 })); head.position.set(-s * 1.1, 3.88, 0); g.add(head);
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .8 }));
          sp.scale.set(3, 3, 1); sp.position.set(-s * 1.1, 3.8, 0); g.add(sp);
          // пятно света на дороге
          const pool = new THREE.Mesh(new THREE.CircleGeometry(1.8, 20), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: .07, depthWrite: false }));
          pool.rotation.x = -Math.PI / 2; pool.position.set(-s * 1.6, .02, 0); g.add(pool);
          g.position.x = s * (HALF + .8);
        } else {
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.12, .16, 1, 6), mat(0x4a3424)); trunk.position.y = .5; g.add(trunk);
          for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(1 - k * .25, 1.3, 7), mat(k % 2 ? 0x1f4a2c : 0x1a3f26)); c.position.y = 1.3 + k * .6; g.add(c); }
          g.position.x = s * (HALF + 2.4 + (i * 37 % 5) * .6);
          g.scale.setScalar(.9 + (i % 3) * .25);
        }
        g.userData.base = i * 6;
        scene.add(g); sideObjs.push(g);
      }
    }
    // фары игрока
    headL = new THREE.SpotLight(0xfff6c4, 1.4, 26, .5, .6, 1);
    scene.add(headL); scene.add(headL.target);
    return true;
  }

  function sync(pool, list, make, place) {
    const seen = new Set();
    for (const o of list) {
      let m = pool.get(o);
      if (!m) { m = make(o); scene.add(m); pool.set(o, m); }
      seen.add(o); place(m, o);
    }
    for (const [o, m] of pool) if (!seen.has(o)) { scene.remove(m); pool.delete(o); }
  }

  let lastW = 0, lastH = 0;
  function render(s) {
    if (!renderer) return;
    const w = innerWidth, h = innerHeight;
    if (w !== lastW || h !== lastH) { lastW = w; lastH = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    const t = s.time, du = s.dist * 10 * K; // пройденный путь в единицах мира
    const X = (px) => (px - s.FW / 2) * K, Z = (py) => (py - s.player.y) * K;
    roadTex.offset.y = (du / DASH) % 1;
    scene.userData.grass.userData.tex.offset.y = (du / 3) % 1;
    for (const o of sideObjs) o.position.z = 10 - ((o.userData.base - du) % 156 + 156) % 156;
    // игрок
    if (!playerCar) { playerCar = buildCar(0xbca0ff, 'car', true, false); scene.add(playerCar); }
    const show = s.state === 'play' || s.state === 'start' || s.state === 'shot';
    playerCar.visible = show;
    const px = X(s.player.x);
    playerCar.position.set(px, 0, 0); playerCar.rotation.y = -s.player.tilt * 1.6; playerCar.rotation.z = -s.player.tilt * .3;
    headL.position.set(px, 1, -1); headL.target.position.set(px, 0, -14); headL.intensity = show ? 1.4 : 0;
    // встречный поток (едет в ту же сторону, медленнее)
    sync(carPool, s.traffic, (c) => { const g = buildCar(new THREE.Color(c.col).getHex(), c.kind, false, false); blinkers(g); return g; }, (m, c) => {
      m.position.set(X(c.x), 0, Z(c.y));
      const turning = c.toLane !== null && c.toLane !== undefined;
      m.rotation.y = turning && c.blink <= 0 ? -Math.sign(s.laneX(c.toLane) - c.x) * .12 : 0;
      const on = turning && (c.blink <= 0 || Math.floor(c.blink * 6) % 2 === 0);
      const side = turning ? Math.sign(s.laneX(c.toLane) - c.x) : 0;
      m.userData.blink.forEach((b, i) => { b.visible = on && (i === 0 ? side < 0 : side > 0); b.position.z = c.kind === 'truck' ? -1.6 : -1; b.position.x = (i === 0 ? -1 : 1) * (c.w * K / 2 + .02); });
    });
    // монеты и канистры
    sync(itemPool, s.items, (it) => {
      if (it.kind === 'coin') {
        const g = new THREE.Group();
        const c = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .08, 18), new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x6a4a00 }));
        c.rotation.x = Math.PI / 2; g.add(c); g.userData.spin = c; return g;
      }
      const g = new THREE.Group();
      const can = new THREE.Mesh(new THREE.BoxGeometry(.6, .8, .35), new THREE.MeshLambertMaterial({ color: 0xff5f57, emissive: 0x401010 })); can.position.y = .4; g.add(can);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, .15, 8), mat(0x222222)); cap.position.set(.15, .88, 0); g.add(cap);
      const band = new THREE.Mesh(new THREE.BoxGeometry(.62, .12, .37), new THREE.MeshBasicMaterial({ color: 0xffffff })); band.position.y = .45; g.add(band);
      return g;
    }, (m, it) => {
      m.position.set(X(it.x), it.kind === 'coin' ? .55 + Math.sin(t * 4 + it.y) * .08 : 0, Z(it.y));
      if (m.userData.spin) m.rotation.y = t * 3 + it.y * .02; else m.rotation.y = Math.sin(t * 2) * .3;
    });
    // другие игроки
    sync(ghostPool, s.ghosts, (p) => { const g = buildCar(new THREE.Color(p.color).getHex(), 'car', true, true); const n = nameSprite(p.name, p.color); n.position.y = 2; g.add(n); return g; }, (m, p) => { m.position.set(X(p.x), 0, Z(p.y)); });
    // искры
    while (partPool.length < s.parts.length) { const m = new THREE.Mesh(new THREE.BoxGeometry(.12, .12, .12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })); scene.add(m); partPool.push(m); }
    partPool.forEach((m, i) => {
      const p = s.parts[i]; m.visible = !!p;
      if (!p) return;
      m.position.set(X(p.x), .4 + (1 - p.life) * 1.2, Z(p.y)); m.material.color.set(p.col); m.material.opacity = Math.max(0, p.life);
      m.rotation.set(t * 5 + i, t * 3, 0);
    });
    // камера: сзади и сверху, чуть следует за машиной
    const shake = s.shake > 0 ? (Math.random() - .5) * s.shake * .6 : 0;
    const narrow = w / h < .8;
    camera.position.set(px * .55 + shake, narrow ? 5.6 : 4.4, narrow ? 9.5 : 7.6);
    camera.lookAt(px * .7, .6, narrow ? -12 : -11);
    renderer.render(scene, camera);
  }

  const v3 = new THREE.Vector3();
  function project(px, py, s) {
    v3.set((px - s.FW / 2) * K, 1.4, (py - s.player.y) * K).project(camera);
    return { x: (v3.x + 1) / 2 * innerWidth, y: (1 - v3.y) / 2 * innerHeight };
  }
  return { init, render, project, debug: () => ({ playerCar, scene, camera }) };
})();
