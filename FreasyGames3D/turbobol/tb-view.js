'use strict';
// Турбобол — графика на three.js r128: арена, машины со всеми вещами из гаража, мяч, буст, частицы, камера.
(() => {
  const TB = window.TB;
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.15, ...o });
  const TEAM = ['#3a8bff', '#ff8a1a'];
  TB.TEAM = TEAM;

  // ——— Машина ———
  // Корпус собран из простых фигур; у каждой из шести моделей свой силуэт. Нос машины смотрит в +Z.
  TB.buildCar = (look, team) => {
    const spec = TB.byId(TB.CARS, look.body), paint = TB.byId(TB.COLORS, look.color).c, acc = TB.byId(TB.COLORS, look.accent).c;
    const wh = TB.byId(TB.WHEELS, look.wheels);
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const mP = M(paint, { metalness: 0.35, roughness: 0.32 }), mA = M(acc, { metalness: 0.3, roughness: 0.35 });
    const mG = M('#1a1d2e', { metalness: 0.6, roughness: 0.15, transparent: true, opacity: 0.85 }), mD = M('#20222f', { roughness: 0.7 });
    const { hx, hy, hz } = spec;
    const box = (w, h, d, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; body.add(m); return m; };
    const base = -hy + 0.32;   // низ корпуса над колёсами
    switch (spec.id) {
      case 'buyvol':   // пикап: высокая кабина спереди, кузов сзади
        box(hx * 2, 0.55, hz * 2, mP, 0, base + 0.28, 0);
        box(hx * 1.9, 0.6, hz * 0.85, mG, 0, base + 0.85, hz * 0.18);
        box(hx * 1.95, 0.08, hz * 0.9, mA, 0, base + 1.18, hz * 0.18);
        box(hx * 2, 0.3, hz * 0.7, mA, 0, base + 0.7, -hz * 0.62);
        box(hx * 2.05, 0.18, 0.3, mD, 0, base + 0.25, hz + 0.05);
        break;
      case 'osa':      // маленький жук-хэтчбек
        box(hx * 2, 0.5, hz * 2, mP, 0, base + 0.25, 0);
        { const cab = new THREE.Mesh(new THREE.SphereGeometry(hx * 0.95, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), mG); cab.scale.set(1, 0.75, 1.4); cab.position.set(0, base + 0.5, -hz * 0.05); body.add(cab); }
        box(hx * 2.1, 0.12, 0.25, mA, 0, base + 0.15, hz);
        box(hx * 2.1, 0.12, 0.25, mA, 0, base + 0.15, -hz);
        break;
      case 'kometa':   // длинный клин с большим антикрылом
        box(hx * 2, 0.4, hz * 2, mP, 0, base + 0.2, 0);
        box(hx * 1.4, 0.35, hz * 0.8, mG, 0, base + 0.55, -hz * 0.1, -0.12);
        box(hx * 2, 0.22, hz * 0.6, mP, 0, base + 0.1, hz * 0.85, 0.25);
        box(0.12, 0.45, 0.25, mD, -hx * 0.7, base + 0.6, -hz * 0.9); box(0.12, 0.45, 0.25, mD, hx * 0.7, base + 0.6, -hz * 0.9);
        box(hx * 2.2, 0.08, 0.5, mA, 0, base + 0.86, -hz * 0.92);
        break;
      case 'bronya':   // броневик: рубленые грани, решётка, бампер
        box(hx * 2, 0.75, hz * 2, mP, 0, base + 0.38, 0);
        box(hx * 1.8, 0.55, hz * 1.1, mP, 0, base + 1.0, -hz * 0.15);
        box(hx * 1.5, 0.22, 0.08, mG, 0, base + 1.05, hz * 0.42);
        box(hx * 2.15, 0.3, 0.35, mA, 0, base + 0.2, hz + 0.1);
        for (const sx of [-1, 1]) box(0.12, 0.7, hz * 1.6, mA, sx * (hx + 0.02), base + 0.4, 0);
        break;
      case 'prizrak':  // гладкая капля с подсветкой
        { const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), mP); shell.scale.set(hx, 0.55, hz); shell.position.set(0, base + 0.3, 0); shell.castShadow = true; body.add(shell); }
        { const cab = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mG); cab.scale.set(hx * 0.7, 0.55, hz * 0.55); cab.position.set(0, base + 0.55, -hz * 0.05); body.add(cab); }
        { const strip = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 40), new THREE.MeshBasicMaterial({ color: acc })); strip.scale.set(hx * 1.01, hz * 1.01, 1); strip.rotation.x = Math.PI / 2; strip.position.y = base + 0.3; body.add(strip); }
        break;
      default:         // Стриж: спортивное купе
        box(hx * 2, 0.45, hz * 2, mP, 0, base + 0.22, 0);
        box(hx * 1.6, 0.42, hz * 0.95, mG, 0, base + 0.64, -hz * 0.1);
        box(hx * 1.62, 0.07, hz * 0.6, mP, 0, base + 0.88, -hz * 0.15);
        box(0.25, 0.47, hz * 2.02, mA, 0, base + 0.23, 0);
        box(hx * 2.1, 0.08, 0.45, mA, 0, base + 0.75, -hz * 0.95);
        box(0.1, 0.3, 0.2, mD, -hx * 0.6, base + 0.55, -hz * 0.95); box(0.1, 0.3, 0.2, mD, hx * 0.6, base + 0.55, -hz * 0.95);
    }
    // фары и стопы
    for (const sx of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.05), new THREE.MeshBasicMaterial({ color: '#fff7d6' })); hl.position.set(sx * hx * 0.62, base + 0.3, hz + 0.03); body.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.05), new THREE.MeshBasicMaterial({ color: '#ff2b4a' })); tl.position.set(sx * hx * 0.62, base + 0.3, -hz - 0.03); body.add(tl);
    }
    // подсветка днища цветом команды
    if (team !== undefined) {
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2.4, hz * 2.3), new THREE.MeshBasicMaterial({ color: TEAM[team], transparent: true, opacity: 0.45, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = -hy + 0.04; g.add(glow); g.userData.glow = glow;
    }
    // колёса
    const wr = Math.min(0.48, hy * 0.85 + 0.08), wGeo = new THREE.CylinderGeometry(wr, wr, 0.34, 18); wGeo.rotateZ(Math.PI / 2);
    const tire = M('#15161d', { roughness: 0.9 }), rimM = wh.glow ? new THREE.MeshBasicMaterial({ color: wh.rim }) : M(wh.rim, { metalness: 0.8, roughness: 0.25 });
    const wheels = [];
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const w = new THREE.Group(); w.position.set(sx * (hx - 0.05), -hy + wr, sz * (hz - 0.55));
      w.add(new THREE.Mesh(wGeo, tire));
      const rimGeo = wh.star ? new THREE.CylinderGeometry(wr * 0.62, wr * 0.62, 0.36, 5) : new THREE.CylinderGeometry(wr * 0.55, wr * 0.55, 0.36, 12);
      rimGeo.rotateZ(Math.PI / 2); w.add(new THREE.Mesh(rimGeo, rimM));
      g.add(w); wheels.push(w);
    }
    g.userData.wheels = wheels; g.userData.body = body;
    // на крышу
    const roofY = { buyvol: base + 1.24, bronya: base + 1.3, osa: base + 1.02, kometa: base + 0.78, prizrak: base + 0.86 }[spec.id] ?? base + 0.95;
    const topZ = spec.id === 'buyvol' ? hz * 0.18 : -hz * 0.12;
    const top = new THREE.Group(); top.position.set(0, roofY, topZ); body.add(top);
    const gold = M('#ffd23f', { metalness: 0.9, roughness: 0.2 });
    switch (look.topper) {
      case 'crown': { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 0.3, 10, 1, true), gold); c.position.y = 0.15; top.add(c); for (let i = 0; i < 5; i++) { const p = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 6), gold); const a = i / 5 * Math.PI * 2; p.position.set(Math.cos(a) * 0.4, 0.38, Math.sin(a) * 0.4); top.add(p); } break; }
      case 'horns': for (const sx of [-1, 1]) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 10), M('#ff3b3b')); h.position.set(sx * 0.4, 0.28, 0); h.rotation.z = -sx * 0.45; top.add(h); } break;
      case 'cat': for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 4), M(paint)); e.position.set(sx * 0.38, 0.2, 0); e.rotation.y = Math.PI / 4; top.add(e); } break;
      case 'halo': { const h = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.05, 8, 30), new THREE.MeshBasicMaterial({ color: '#fff3a0' })); h.rotation.x = Math.PI / 2; h.position.y = 0.5; top.add(h); top.userData.spin = h; break; }
      case 'cap': { const c = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M(acc)); top.add(c); const v = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.35), M(acc)); v.position.set(0, 0.02, 0.38); top.add(v); break; }
      case 'prop': { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), M('#ccc')); s.position.y = 0.15; top.add(s); const bl = new THREE.Group(); bl.position.y = 0.3; for (const r of [0, Math.PI / 2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.12), M('#ff4f6d')); b.rotation.y = r; bl.add(b); } top.add(bl); top.userData.spin = bl; break; }
      case 'cone': { const c = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 16), M('#ff7a1a')); c.position.y = 0.3; top.add(c); const st = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.24, 0.1, 16), M('#ffffff')); st.position.y = 0.28; top.add(st); break; }
      default: break;
    }
    // антенна
    if (look.antenna && look.antenna !== 'none') {
      const ant = new THREE.Group(); ant.position.set(hx * 0.6, roofY - 0.2, -hz * 0.75); body.add(ant);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 5), M('#222')); rod.position.y = 0.6; ant.add(rod);
      let tip;
      if (look.antenna === 'flag') { tip = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), new THREE.MeshBasicMaterial({ color: team !== undefined ? TEAM[team] : acc, side: THREE.DoubleSide })); tip.position.set(0, 1.05, -0.25); tip.rotation.y = Math.PI / 2; }
      else if (look.antenna === 'ball') { tip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), M('#ff3b3b')); tip.position.y = 1.25; }
      else if (look.antenna === 'star' || look.antenna === 'heart') {
        const sh = new THREE.Shape();
        if (look.antenna === 'star') for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.09 : 0.22; i ? sh.lineTo(Math.cos(a) * r, -Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, -Math.sin(a) * r); }
        else { sh.moveTo(0, -0.18); sh.bezierCurveTo(-0.3, 0.02, -0.12, 0.22, 0, 0.08); sh.bezierCurveTo(0.12, 0.22, 0.3, 0.02, 0, -0.18); }
        tip = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false }), M(look.antenna === 'star' ? '#ffd23f' : '#ff4f7a', { emissive: look.antenna === 'star' ? '#7a5a00' : '#5a0010' }));
        tip.position.y = 1.3;
      }
      if (tip) ant.add(tip);
      top.userData.ant = ant;
    }
    g.userData.top = top; g.userData.spec = spec; g.userData.trail = TB.byId(TB.TRAILS, look.trail);
    return g;
  };

  // Табличка с ником над машиной.
  TB.nameTag = (text, color) => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d'); x.font = '800 30px Manrope, system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 6; x.strokeStyle = '#000a'; x.strokeText(text, 128, 32); x.fillStyle = color; x.fillText(text, 128, 32);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    sp.scale.set(4, 1, 1); sp.renderOrder = 10; return sp;
  };

  // ——— Сцена матча ———
  TB.View = class {
    constructor(canvas) {
      this.cv = canvas;
      this.r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
      this.r.shadowMap.enabled = true; this.r.shadowMap.type = THREE.PCFSoftShadowMap;
      this.scene = new THREE.Scene();
      this.cam = new THREE.PerspectiveCamera(72, 1, 0.3, 900);
      this.camPos = new THREE.Vector3(0, 20, -60); this.camLook = new THREE.Vector3();
      this.cars = new Map(); this.arenaGroup = null; this.parts = [];
      this.resize();
    }
    resize() {
      const w = innerWidth, h = innerHeight; this.r.setSize(w, h, false);
      this.cam.aspect = w / h; this.cam.fov = w / h < 1 ? 88 : 72; this.cam.updateProjectionMatrix();
    }
    // строит арену по карте
    setArena(A) {
      const S = this.scene, th = A.theme;
      if (this.arenaGroup) S.remove(this.arenaGroup);
      while (S.children.length) S.remove(S.children[0]);
      this.cars.clear();
      const G = this.arenaGroup = new THREE.Group(); S.add(G);
      S.background = new THREE.Color(th.sky); S.fog = new THREE.Fog(th.sky, 120, 320);
      S.add(new THREE.HemisphereLight('#ffffff', th.sky, 0.65));
      const sun = new THREE.DirectionalLight('#ffffff', 0.85); sun.position.set(30, 70, 20); sun.castShadow = true;
      Object.assign(sun.shadow.camera, { left: -A.Wd - 5, right: A.Wd + 5, top: A.L + 12, bottom: -A.L - 12, near: 10, far: 200 });
      sun.shadow.mapSize.set(2048, 2048); S.add(sun); S.add(sun.target);
      // газон / пол с разметкой
      const tc = document.createElement('canvas'); tc.width = 512; tc.height = Math.round(512 * A.L / A.Wd);
      const x = tc.getContext('2d'), W = tc.width, H = tc.height;
      for (let i = 0; i < 12; i++) { x.fillStyle = i % 2 ? th.floor : th.floor2; x.fillRect(0, i * H / 12, W, H / 12 + 1); }
      x.strokeStyle = th.line; x.globalAlpha = 0.85; x.lineWidth = 5;
      x.strokeRect(10, 10, W - 20, H - 20); x.beginPath(); x.moveTo(10, H / 2); x.lineTo(W - 10, H / 2); x.stroke();
      x.beginPath(); x.arc(W / 2, H / 2, W * 0.17, 0, 7); x.stroke();
      const gw = A.goalW / (2 * A.Wd) * W; x.strokeRect(W / 2 - gw, 10, gw * 2, H * 0.12); x.strokeRect(W / 2 - gw, H - 10 - H * 0.12, gw * 2, H * 0.12);
      x.globalAlpha = 0.25; x.fillStyle = TEAM[0]; x.fillRect(10, 10, W - 20, H * 0.04); x.fillStyle = TEAM[1]; x.fillRect(10, H - 10 - H * 0.04, W - 20, H * 0.04);
      const tex = new THREE.CanvasTexture(tc); tex.anisotropy = 4;
      // текстура: верх картинки — сторона синих (−Z)
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(A.Wd * 2, A.L * 2), new THREE.MeshStandardMaterial({ map: tex, roughness: A.ice ? 0.15 : 0.85, metalness: A.ice ? 0.2 : 0 }));
      floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; G.add(floor);
      const under = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: th.sky, roughness: 1 }));
      under.rotation.x = -Math.PI / 2; under.position.y = -0.05; G.add(under);
      // прозрачные стены со светящимися рёбрами
      const wallM = new THREE.MeshBasicMaterial({ color: th.wall, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false });
      const edgeM = new THREE.LineBasicMaterial({ color: th.glow, transparent: true, opacity: 0.8 });
      const wall = (w, h, px, py, pz, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallM); m.position.set(px, py, pz); m.rotation.y = ry; G.add(m); };
      wall(A.L * 2, A.Hc, -A.Wd, A.Hc / 2, 0, Math.PI / 2); wall(A.L * 2, A.Hc, A.Wd, A.Hc / 2, 0, Math.PI / 2);
      for (const sz of [-1, 1]) {
        const side = (A.Wd - A.goalW / 2);
        wall(side, A.Hc, -(A.goalW / 2 + side / 2), A.Hc / 2, sz * A.L, 0); wall(side, A.Hc, A.goalW / 2 + side / 2, A.Hc / 2, sz * A.L, 0);
        wall(A.goalW, A.Hc - A.goalH, 0, A.goalH + (A.Hc - A.goalH) / 2, sz * A.L, 0);
      }
      const pts = [];
      const seg = (a, b) => pts.push(new THREE.Vector3(...a), new THREE.Vector3(...b));
      for (const y of [0.05, A.Hc]) { seg([-A.Wd, y, -A.L], [A.Wd, y, -A.L]); seg([-A.Wd, y, A.L], [A.Wd, y, A.L]); seg([-A.Wd, y, -A.L], [-A.Wd, y, A.L]); seg([A.Wd, y, -A.L], [A.Wd, y, A.L]); }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) seg([sx * A.Wd, 0, sz * A.L], [sx * A.Wd, A.Hc, sz * A.L]);
      const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), edgeM); G.add(lines);
      // ворота: штанги, перекладина и сетка
      for (const sz of [-1, 1]) {
        const team = sz < 0 ? 0 : 1, col = TEAM[team];
        const post = M('#ffffff', { emissive: col, emissiveIntensity: 0.6 });
        for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, A.goalH, 10), post); p.position.set(sx * A.goalW / 2, A.goalH / 2, sz * A.L); G.add(p); }
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, A.goalW, 10), post); bar.rotation.z = Math.PI / 2; bar.position.set(0, A.goalH, sz * A.L); G.add(bar);
        const net = new THREE.Mesh(new THREE.BoxGeometry(A.goalW, A.goalH, A.goalD, 8, 4, 4), new THREE.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: 0.35 }));
        net.position.set(0, A.goalH / 2, sz * (A.L + A.goalD / 2)); G.add(net);
        const back = new THREE.Mesh(new THREE.PlaneGeometry(A.goalW, A.goalH), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
        back.position.set(0, A.goalH / 2, sz * (A.L + A.goalD)); G.add(back);
        const gfloor = new THREE.Mesh(new THREE.PlaneGeometry(A.goalW, A.goalD), new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 }));
        gfloor.rotation.x = -Math.PI / 2; gfloor.position.set(0, 0.02, sz * (A.L + A.goalD / 2)); G.add(gfloor);
      }
      // трибуны и прожекторы вокруг
      const standM = M(th.sky, { roughness: 0.9 }), crowdCols = ['#ff4f6d', '#ffd23f', '#3a8bff', '#ff8a1a', '#f4f4fb', '#5df2a5'];
      const crowdGeo = new THREE.BoxGeometry(0.8, 1, 0.8);
      const crowd = new THREE.InstancedMesh(crowdGeo, new THREE.MeshLambertMaterial(), 900); let ci = 0; const dummy = new THREE.Object3D(); const cc = new THREE.Color();
      for (const [sx, sz, len, rot] of [[-1, 0, A.L * 2, 0], [1, 0, A.L * 2, 0], [0, -1, A.Wd * 2, 1], [0, 1, A.Wd * 2, 1]]) {
        for (let tier = 0; tier < 4; tier++) {
          const d = 6 + tier * 3, hgt = 2 + tier * 2.2;
          const st = new THREE.Mesh(new THREE.BoxGeometry(rot ? len + 20 : 3, hgt, rot ? 3 : len + 20), standM);
          st.position.set(sx * (A.Wd + d), hgt / 2, sz * (A.L + A.goalD + d)); G.add(st);
          for (let k = 0; k < len / 2.2 && ci < 900; k++) {
            if (Math.random() < 0.3) continue;
            const t = -len / 2 + k * 2.2 + 1;
            dummy.position.set(rot ? t : sx * (A.Wd + d), hgt + 0.5, rot ? sz * (A.L + A.goalD + d) : t); dummy.updateMatrix();
            crowd.setMatrixAt(ci, dummy.matrix); crowd.setColorAt(ci, cc.set(crowdCols[(Math.random() * crowdCols.length) | 0])); ci++;
          }
        }
      }
      crowd.count = ci; G.add(crowd); this.crowd = crowd;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 40, 8), M('#30344a')); pole.position.set(sx * (A.Wd + 20), 20, sz * (A.L + 20)); G.add(pole);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 1), new THREE.MeshBasicMaterial({ color: '#fffbe6' })); lamp.position.set(sx * (A.Wd + 20), 40, sz * (A.L + 20)); lamp.lookAt(0, 0, 0); G.add(lamp);
      }
      // препятствия карты
      for (const o of A.objs) {
        let m;
        if (o.t === 'box') { m = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), M(th.wall, { roughness: 0.4, emissive: th.glow, emissiveIntensity: 0.12 })); m.position.y = o.h / 2; }
        else if (o.t === 'bumper') { m = new THREE.Mesh(new THREE.CylinderGeometry(o.hw, o.hw * 1.1, o.h, 24), M('#ff4f6d', { emissive: '#ff2b4a', emissiveIntensity: 0.35 })); m.position.y = o.h / 2; this.bumpers = (this.bumpers || []).concat(m); }
        else if (o.t === 'ramp') {
          const sh = new THREE.Shape(); sh.moveTo(-o.hd, 0); sh.lineTo(o.hd, 0); sh.lineTo(o.hd, o.h); sh.closePath();
          const geo = new THREE.ExtrudeGeometry(sh, { depth: o.w, bevelEnabled: false }); geo.translate(0, 0, -o.hw); geo.rotateY(-Math.PI / 2);
          m = new THREE.Mesh(geo, M(th.wall, { roughness: 0.5, emissive: th.glow, emissiveIntensity: 0.1 }));
        }
        if (!m) continue;
        m.position.x = o.x; m.position.z = o.z; m.rotation.y = (o.r || 0) * Math.PI / 180; m.castShadow = true; m.receiveShadow = true; G.add(m);
      }
      // площадки буста
      this.padMeshes = A.pads.map((p) => {
        const grp = new THREE.Group(); grp.position.set(p.x, 0.05, p.z);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(p.big ? 2.2 : 1.2, p.big ? 2.4 : 1.3, 0.12, 20), M('#2a2738'));
        const orb = p.big ? new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffb000' })) : new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.06, 16), new THREE.MeshBasicMaterial({ color: '#ffd23f' }));
        orb.position.y = p.big ? 1.4 : 0.1; grp.add(base); grp.add(orb); G.add(grp); grp.userData.orb = orb; return grp;
      });
      // мяч
      const bc = document.createElement('canvas'); bc.width = 256; bc.height = 128; const bx = bc.getContext('2d');
      bx.fillStyle = '#e9ecf5'; bx.fillRect(0, 0, 256, 128);
      bx.fillStyle = '#2a2d44'; for (let i = 0; i < 10; i++) { const cx = (i % 5) * 52 + (i < 5 ? 10 : 36), cy = i < 5 ? 38 : 92; bx.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; bx.lineTo(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14); } bx.fill(); }
      bx.strokeStyle = '#6fe3ff'; bx.lineWidth = 4; bx.beginPath(); bx.moveTo(0, 64); bx.lineTo(256, 64); bx.stroke();
      this.ball = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(bc), roughness: 0.35, metalness: 0.1, emissive: '#223', emissiveIntensity: 0.3 }));
      this.ball.castShadow = true; S.add(this.ball);
      this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3, depthWrite: false }));
      this.ballShadow.rotation.x = -Math.PI / 2; S.add(this.ballShadow);
      // частицы
      const MAX = 1400; this.pMax = MAX;
      this.pGeo = new THREE.BufferGeometry(); this.pPos = new Float32Array(MAX * 3); this.pCol = new Float32Array(MAX * 3);
      this.pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3)); this.pGeo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
      const pts2 = new THREE.Points(this.pGeo, new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      pts2.frustumCulled = false; S.add(pts2);
      this.parts = [];
      this.A = A;
    }
    carMesh(c) {
      let m = this.cars.get(c.id);
      if (!m) {
        m = TB.buildCar(c.look || {}, c.team);
        const tag = TB.nameTag(c.name, TEAM[c.team]); tag.position.y = 2.6; m.add(tag); m.userData.tag = tag;
        this.scene.add(m); this.cars.set(c.id, m);
      }
      return m;
    }
    removeMissing(ids) { for (const [id, m] of this.cars) if (!ids.has(id)) { this.scene.remove(m); this.cars.delete(id); } }
    puff(p, col, n, spd, life = 0.6, up = 0) {
      const c = new THREE.Color(col);
      for (let i = 0; i < n; i++) {
        if (this.parts.length >= this.pMax) this.parts.shift();
        this.parts.push({ x: p[0], y: p[1], z: p[2], vx: (Math.random() - 0.5) * spd, vy: (Math.random() - 0.3) * spd + up, vz: (Math.random() - 0.5) * spd, r: c.r, g: c.g, b: c.b, life, max: life });
      }
    }
    // отрисовка кадра: m — матч, me — id своей машины
    render(m, me, dt, opts) {
      const A = this.A, time = performance.now() / 1000;
      const ids = new Set();
      for (const c of m.cars) {
        ids.add(c.id);
        const g = this.carMesh(c);
        g.visible = !(c.demo > 0);
        if (!g.visible) continue;
        g.position.set(c.p[0], c.p[1], c.p[2]);
        let roll = c.roll, pitch = c.pitch;
        if (c.flip) { const k = Math.min(1, c.flip.t / 0.5) * Math.PI * 2; pitch += -c.flip.ax * k; roll += c.flip.ar * k; }
        g.rotation.set(0, 0, 0); g.rotation.order = 'YXZ'; g.rotation.y = c.yaw; g.rotation.x = -pitch; g.rotation.z = roll;
        const sp = Math.hypot(c.v[0], c.v[2]), dir = (c.v[0] * Math.sin(c.yaw) + c.v[2] * Math.cos(c.yaw)) >= 0 ? 1 : -1;
        for (const w of g.userData.wheels) w.rotation.x += sp * dir * dt / 0.45;
        if (g.userData.top.userData.spin) g.userData.top.userData.spin.rotation.y += dt * (look(c).topper === 'prop' ? 18 : 1.5);
        if (g.userData.glow) g.userData.glow.visible = c.ground;
        g.userData.tag.visible = c.id !== me;
        // буст: шлейф частиц из выхлопа
        if (c.inp.boost && (c.boost > 0 || m.rule.infBoost) && m.phase !== 'kickoff') {
          const tr = g.userData.trail, back = [c.p[0] - Math.sin(c.yaw) * c.spec.hz, c.p[1] - 0.1, c.p[2] - Math.cos(c.yaw) * c.spec.hz];
          for (let k = 0; k < 3; k++) this.puff(back, tr.cols[(Math.random() * tr.cols.length) | 0], 1, 2.5, 0.45);
        }
        if (c.supersonic) this.puff([c.p[0], c.p[1], c.p[2]], '#ffffff', 1, 0.5, 0.25);
      }
      this.removeMissing(ids);
      // мяч
      const b = m.ball, R = m.ballR;
      this.ball.scale.setScalar(R); this.ball.position.set(b.p[0], b.p[1], b.p[2]);
      this.ball.rotation.x += b.v[2] * dt / R; this.ball.rotation.z -= b.v[0] * dt / R;
      this.ballShadow.position.set(b.p[0], TB.groundAt(A, b.p[0], b.p[2]) + 0.06, b.p[2]); this.ballShadow.scale.setScalar(R * Math.max(0.3, 1 - b.p[1] / 30));
      // площадки
      A.pads.forEach((p, i) => { const pm = this.padMeshes[i]; if (!pm) return; pm.userData.orb.visible = p.t <= 0; if (p.big) pm.userData.orb.position.y = 1.4 + Math.sin(time * 3 + i) * 0.2; });
      // частицы
      let n = 0;
      for (const q of this.parts) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.vy -= 4 * dt; }
      this.parts = this.parts.filter((q) => q.life > 0);
      for (const q of this.parts) { const k = q.life / q.max; this.pPos[n * 3] = q.x; this.pPos[n * 3 + 1] = q.y; this.pPos[n * 3 + 2] = q.z; this.pCol[n * 3] = q.r * k; this.pCol[n * 3 + 1] = q.g * k; this.pCol[n * 3 + 2] = q.b * k; n++; }
      this.pGeo.setDrawRange(0, n); this.pGeo.attributes.position.needsUpdate = true; this.pGeo.attributes.color.needsUpdate = true;
      // камера: за машиной или на мяч
      const mc = m.cars.find((c) => c.id === me);
      const cam = this.cam, k = Math.min(1, Math.max(0, 1 - Math.exp(-Math.max(0, dt) * 9)));
      if (mc && !(mc.demo > 0)) {
        const cp = new THREE.Vector3(mc.p[0], mc.p[1], mc.p[2]);
        let dx, dz;
        if (opts.ballCam) { dx = b.p[0] - mc.p[0]; dz = b.p[2] - mc.p[2]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
        else { const vs = Math.hypot(mc.v[0], mc.v[2]); if (mc.ground || vs < 4) { dx = Math.sin(mc.yaw); dz = Math.cos(mc.yaw); } else { dx = mc.v[0] / vs; dz = mc.v[2] / vs; } }
        const dist = innerWidth < innerHeight ? 14 : 12, hgt = innerWidth < innerHeight ? 5.5 : 4.6;
        const want = new THREE.Vector3(cp.x - dx * dist, Math.max(1.5, cp.y + hgt), cp.z - dz * dist);
        want.x = TB.clamp(want.x, -A.Wd + 1, A.Wd - 1); want.z = TB.clamp(want.z, -A.L - A.goalD + 1, A.L + A.goalD - 1); want.y = Math.min(want.y, A.Hc - 0.5);
        this.camPos.lerp(want, k);
        // камера на мяч: смотрим чуть выше машины в сторону мяча, высоко летящий мяч не задирает камеру в потолок
        const look = opts.ballCam ? cp.clone().add(new THREE.Vector3(dx * 8, Math.min(6, Math.max(0, b.p[1] - cp.y) * 0.35) + 1.2, dz * 8)) : cp.clone().add(new THREE.Vector3(dx * 6, 1.5, dz * 6));
        this.camLook.lerp(look, Math.min(1, k * 1.4));
      } else {
        // зритель/взорвался: обзор сверху на мяч
        const want = new THREE.Vector3(b.p[0] * 0.5, 30, b.p[2] - 40 * (mc && mc.team ? -1 : 1));
        this.camPos.lerp(want, k * 0.5); this.camLook.lerp(new THREE.Vector3(b.p[0], b.p[1], b.p[2]), k);
      }
      if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt); this.camPos.x += (Math.random() - 0.5) * this.shake * 2; this.camPos.y += (Math.random() - 0.5) * this.shake * 2; }
      // защита: если камера когда-нибудь «улетит», возвращаем её на поле
      const bad = (v) => !Number.isFinite(v.x + v.y + v.z) || Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z) > 2000;
      if (bad(this.camPos) || bad(this.camLook)) { this.camPos.set(0, 20, -A.L); this.camLook.set(0, 0, 0); }
      cam.position.copy(this.camPos); cam.lookAt(this.camLook);
      if (this.bumpers) for (const bm of this.bumpers) bm.material.emissiveIntensity = 0.35 + Math.sin(time * 4) * 0.15;
      this.r.render(this.scene, cam);
    }
  };
  const look = (c) => c.look || {};

  // ——— Витрина гаража ———
  TB.Preview = class {
    constructor(canvas) {
      this.cv = canvas;
      this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.scene = new THREE.Scene();
      this.cam = new THREE.PerspectiveCamera(38, 1, 0.1, 100); this.cam.position.set(6.5, 3.4, 6.5); this.cam.lookAt(0, 0.4, 0);
      this.scene.add(new THREE.HemisphereLight('#ffffff', '#3a2f6a', 0.9));
      const d = new THREE.DirectionalLight('#ffffff', 0.9); d.position.set(4, 8, 5); this.scene.add(d);
      const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 40), new THREE.MeshStandardMaterial({ color: '#2a2450', roughness: 0.6 })); floor.rotation.x = -Math.PI / 2; this.scene.add(floor);
      const ring = new THREE.Mesh(new THREE.RingGeometry(3.6, 3.75, 48), new THREE.MeshBasicMaterial({ color: '#bca0ff' })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; this.scene.add(ring);
      this.car = null; this.spin = 0.6; this.drag = null;
      canvas.addEventListener('pointerdown', (e) => { this.drag = e.clientX; });
      addEventListener('pointerup', () => { this.drag = null; });
      addEventListener('pointermove', (e) => { if (this.drag !== null) { this.spin += (e.clientX - this.drag) * 0.01; this.drag = e.clientX; } });
    }
    set(look) {
      if (this.car) this.scene.remove(this.car);
      this.car = TB.buildCar(look); this.car.position.y = this.car.userData.spec.hy; this.scene.add(this.car);
      // След буста на витрине
      if (this.trail) this.scene.remove(this.trail);
      const tr = TB.byId(TB.TRAILS, look.trail), grp = new THREE.Group();
      for (let i = 0; i < 14; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.18 - i * 0.008, 8, 6), new THREE.MeshBasicMaterial({ color: tr.cols[i % tr.cols.length], transparent: true, opacity: 1 - i / 14 })); s.position.set(0, 0.25, -this.car.userData.spec.hz - 0.3 - i * 0.22); grp.add(s); }
      this.car.add(grp); this.trail = null;
    }
    frame(dt) {
      const w = this.cv.clientWidth, h = this.cv.clientHeight;
      if (!w || !h) return;
      if (this.cv.width !== Math.round(w * this.r.getPixelRatio())) { this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
      if (this.drag === null) this.spin += dt * 0.5;
      if (this.car) { this.car.rotation.y = this.spin; const sp = this.car.userData.top.userData.spin; if (sp) sp.rotation.y += dt * 6; }
      this.r.render(this.scene, this.cam);
    }
  };
})();
