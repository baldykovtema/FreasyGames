'use strict';
// Кубомир: отрисовка, чанки вокруг игрока, физика, взаимодействие с блоками, механизмы, сутки и звук.
(function () {
  const KM = window.KM, B = KM.B, CS = KM.CS, HY = KM.HY;
  const G = window.G = {
    world: null, meta: null, player: null, state: 'menu', time: 0.3, paused: true, mode: 'survival', peaceful: false,
    settings: { dist: 4, sens: 8, fov: 72, sound: true, touch: false },
    hot: 0, inv: [], toastQ: [], edited: false,
  };
  try { Object.assign(G.settings, JSON.parse(localStorage.getItem('kubomir-settings') || '{}')); } catch {}
  G.saveSettings = () => { try { localStorage.setItem('kubomir-settings', JSON.stringify(G.settings)); } catch {} };
  const isTouchDevice = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (localStorage.getItem('kubomir-settings') === null) G.settings.touch = isTouchDevice;
  if (isTouchDevice && localStorage.getItem('kubomir-settings') === null) G.settings.dist = 3;

  // ---------- three.js ----------
  const canvas = document.getElementById('gl');
  const R = G.renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouchDevice, powerPreference: 'high-performance' });
  R.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouchDevice ? 1.25 : 1.75));
  const scene = G.scene = new THREE.Scene();
  const camera = G.camera = new THREE.PerspectiveCamera(G.settings.fov, 1, 0.08, 600);
  scene.add(camera);
  const hemi = new THREE.HemisphereLight('#ffffff', '#55506a', 0.9); scene.add(hemi);
  const sunL = new THREE.DirectionalLight('#ffffff', 0.6); sunL.position.set(0.4, 1, 0.3); scene.add(sunL);
  G.hemi = hemi; G.sunL = sunL;

  const atlas = KM.buildAtlas();
  const tex = new THREE.CanvasTexture(atlas); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  G.atlasTex = tex;
  const uni = { map: { value: tex }, uDay: { value: 1 }, uMin: { value: 0.06 }, fogColor: { value: new THREE.Color('#9ccfff') }, fogNear: { value: 40 }, fogFar: { value: 80 } };
  const VS = `attribute vec3 color; varying vec2 vUv; varying vec3 vL; varying float vD;
    void main(){ vUv=uv; vL=color; vec4 mv=modelViewMatrix*vec4(position,1.0); vD=-mv.z; gl_Position=projectionMatrix*mv; }`;
  const FS = `uniform sampler2D map; uniform float uDay; uniform float uMin; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; uniform float uAlpha; uniform float uCut;
    varying vec2 vUv; varying vec3 vL; varying float vD;
    void main(){ vec4 t=texture2D(map,vUv); if(t.a<uCut) discard;
      float s=vL.x*uDay; float b=vL.y; float l=max(s,b);
      float k=uMin+(1.0-uMin)*pow(l,1.5);
      vec3 warm=vec3(1.0,0.86,0.62);
      vec3 c=t.rgb*k*vL.z*mix(vec3(1.0),warm,clamp(b-s,0.0,1.0)*0.6);
      float f=smoothstep(fogNear,fogFar,vD);
      gl_FragColor=vec4(mix(c,fogColor,f), t.a*uAlpha); }`;
  const mk = (cut, alpha, side, transparent) => new THREE.ShaderMaterial({ uniforms: Object.assign({}, uni, { uAlpha: { value: alpha }, uCut: { value: cut } }), vertexShader: VS, fragmentShader: FS, side, transparent, depthWrite: !transparent });
  const MATS = G.mats = [mk(0.5, 1, THREE.FrontSide, false), mk(0.5, 1, THREE.DoubleSide, false), mk(0.02, 0.78, THREE.DoubleSide, true)];

  // небо: солнце и луна
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: '#fff3b0', fog: false }));
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ color: '#dfe6ff', fog: false }));
  scene.add(sun, moon);
  // звёзды
  const stG = new THREE.BufferGeometry(), stP = new Float32Array(1500);
  for (let i = 0; i < 500; i++) { const a = Math.random() * 6.283, b = Math.acos(Math.random() * 2 - 1), r = 400; stP[i * 3] = Math.sin(b) * Math.cos(a) * r; stP[i * 3 + 1] = Math.abs(Math.cos(b)) * r; stP[i * 3 + 2] = Math.sin(b) * Math.sin(a) * r; }
  stG.setAttribute('position', new THREE.BufferAttribute(stP, 3));
  const stars = new THREE.Points(stG, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, fog: false, transparent: true }));
  scene.add(stars);

  // рамка выбранного блока и трещины
  const sel = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)), new THREE.LineBasicMaterial({ color: '#000000', transparent: true, opacity: 0.6 }));
  sel.visible = false; scene.add(sel);
  const crackGeo = new THREE.BoxGeometry(1.01, 1.01, 1.01);
  const crackMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false });
  const crack = new THREE.Mesh(crackGeo, crackMat); crack.visible = false; scene.add(crack);
  const baseUV = crackGeo.attributes.uv.array.slice();
  function setCrack(stage) {
    const t = KM.T['crack' + stage], AW = KM.ACOLS * KM.TS, AH = KM.AROWS * KM.TS, tx = t % KM.ACOLS, ty = (t / KM.ACOLS) | 0;
    const u0 = tx * KM.TS / AW, u1 = (tx + 1) * KM.TS / AW, v0 = 1 - (ty + 1) * KM.TS / AH, v1 = 1 - ty * KM.TS / AH, a = crackGeo.attributes.uv;
    for (let i = 0; i < a.count; i++) a.setXY(i, u0 + baseUV[i * 2] * (u1 - u0), v0 + baseUV[i * 2 + 1] * (v1 - v0));
    a.needsUpdate = true;
  }

  // ---------- звук ----------
  let ac = null;
  G.unlockAudio = () => { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch {} } if (ac && ac.state === 'suspended') ac.resume(); };
  function tone(f, dur, type = 'sine', vol = 0.08, slide = 1, delay = 0) {
    if (!G.settings.sound || !ac) return; const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.1, hp = 800) {
    if (!G.settings.sound || !ac) return; const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = buf; f.type = 'lowpass'; f.frequency.value = hp; g.gain.value = vol;
    s.connect(f).connect(g).connect(ac.destination); s.start();
  }
  G.sfx = (k) => {
    if (k === 'dig') noise(0.08, 0.08, 1200); else if (k === 'break') noise(0.18, 0.14, 900); else if (k === 'place') { noise(0.06, 0.1, 600); tone(180, 0.06, 'triangle', 0.05); }
    else if (k === 'hurt') tone(220, 0.18, 'square', 0.06, 0.6); else if (k === 'hit') { noise(0.06, 0.12, 2000); tone(140, 0.08, 'triangle', 0.06, 0.7); }
    else if (k === 'eat') { for (let i = 0; i < 3; i++) setTimeout(() => noise(0.05, 0.08, 500), i * 120); } else if (k === 'click') tone(900, 0.04, 'square', 0.04);
    else if (k === 'boom') { noise(0.8, 0.35, 300); tone(70, 0.6, 'sawtooth', 0.12, 0.4); } else if (k === 'portal') { tone(200, 0.9, 'sine', 0.08, 4); tone(300, 0.9, 'triangle', 0.05, 3); }
    else if (k === 'craft') { tone(520, 0.08, 'triangle', 0.06); tone(780, 0.1, 'triangle', 0.06, 1, 0.07); } else if (k === 'pop') tone(700, 0.07, 'sine', 0.06, 1.5);
    else if (k === 'boss') { tone(80, 1.2, 'sawtooth', 0.1, 0.5); tone(120, 1.2, 'square', 0.05, 0.6); } else if (k === 'win') [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.3, 'triangle', 0.08, 1, i * 0.12));
    else if (k === 'shoot') { noise(0.1, 0.08, 3000); tone(600, 0.1, 'sine', 0.04, 0.5); } else if (k === 'splash') noise(0.25, 0.1, 700);
  };

  // ---------- чанки ----------
  const meshes = new Map(); // ключ "d:cx,cz" → { group, chunk }
  G.clearMeshes = () => { for (const m of meshes.values()) disposeMesh(m); meshes.clear(); };
  function disposeMesh(m) { for (const o of m.objs) { scene.remove(o); o.geometry.dispose(); } }
  function makeGeo(o) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(o.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(o.c, 3));
    g.setIndex(o.p.length / 3 > 65000 ? new THREE.Uint32BufferAttribute(o.i, 1) : new THREE.Uint16BufferAttribute(o.i, 1));
    g.computeBoundingSphere();
    return g;
  }
  function remesh(c) {
    const W = G.world, key = c.d + ':' + c.cx + ',' + c.cz;
    W.computeLight(c);
    const data = KM.buildMesh(W, c), old = meshes.get(key);
    if (old) disposeMesh(old);
    const objs = [];
    data.forEach((o, i) => { if (!o.i.length) return; const m = new THREE.Mesh(makeGeo(o), MATS[i]); m.renderOrder = i; scene.add(m); objs.push(m); });
    meshes.set(key, { objs, c });
    c.dirty = false;
  }
  // Загружает чанки вокруг игрока по спирали, ближние — первыми; держит время кадра в рамках бюджета.
  G.updateChunks = function (budgetMs) {
    const W = G.world, p = G.player, d = p.d, dims = W.dims[d];
    const pcx = Math.floor(p.x / CS), pcz = Math.floor(p.z / CS), RD = G.settings.dist;
    const t0 = performance.now();
    const list = [];
    for (let dx = -RD - 1; dx <= RD + 1; dx++) for (let dz = -RD - 1; dz <= RD + 1; dz++) { const r = Math.hypot(dx, dz); if (r <= RD + 1.5) list.push([r, pcx + dx, pcz + dz]); }
    list.sort((a, b) => a[0] - b[0]);
    for (const [r, cx, cz] of list) {
      if (performance.now() - t0 > budgetMs) break;
      const k = W.ck(cx, cz);
      if (!dims.has(k)) { dims.set(k, W.generate(d, cx, cz)); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = dims.get(W.ck(cx + a, cz + b)); if (n) n.dirty = true; } continue; }
      const c = dims.get(k);
      if (r <= RD + 0.5 && c.dirty) {
        let ready = true; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!dims.has(W.ck(cx + a, cz + b))) { ready = false; break; }
        if (ready) remesh(c);
      }
    }
    // выгрузка дальних
    if (Math.random() < 0.05) {
      for (const [k, c] of dims) if (Math.abs(c.cx - pcx) > RD + 4 || Math.abs(c.cz - pcz) > RD + 4) { dims.delete(k); const mk2 = d + ':' + k; const m = meshes.get(mk2); if (m) { disposeMesh(m); meshes.delete(mk2); } }
    }
  };
  G.ensureArea = function (d, x, z, r = 1) {
    const W = G.world, cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { const k = W.ck(cx + a, cz + b); if (!W.dims[d].has(k)) W.dims[d].set(k, W.generate(d, cx + a, cz + b)); }
  };

  // ---------- игрок ----------
  G.newPlayer = (x, y, z) => ({ x, y, z, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, hp: 20, food: 20, d: 0, onGround: false, fly: false, fallFrom: y, sx: x, sy: y, sz: z, sd: 0, fuel: 0, hurtT: 0, air: 10, sat: 0, wins: [], armor: [null, null, null, null], prog: {}, stats: G.newStats(), portals: {}, altars: [] });
  G.newStats = () => ({ t: 0, br: 0, pl: 0, kills: 0, deaths: 0, crafts: 0 });
  const PW = 0.3, PH = 1.8, EYE = 1.62;
  G.EYE = EYE;
  function collides(d, x, y, z, w, h) {
    const W = G.world;
    for (let bx = Math.floor(x - w); bx <= Math.floor(x + w); bx++) for (let by = Math.floor(y); by <= Math.floor(y + h - 0.001); by++) for (let bz = Math.floor(z - w); bz <= Math.floor(z + w); bz++) {
      const b = W.get(d, bx, by, bz); if (b < 0) return true; if (b && B[b].solid) return true;
    }
    return false;
  }
  G.collides = collides;
  // Двигает тело по осям по очереди, упираясь в блоки; возвращает, на чём стоит.
  G.moveBody = function (e, dt, w, h) {
    const d = e.d;
    let hit = { x: false, y: false, z: false };
    const step = (axis, v) => {
      const n = Math.ceil(Math.abs(v * dt) / 0.4) || 1, s = v * dt / n;
      for (let i = 0; i < n; i++) { e[axis] += s; if (collides(d, e.x, e.y, e.z, w, h)) { e[axis] -= s; hit[axis] = true; return; } }
    };
    step('y', e.vy); if (hit.y) { if (e.vy < 0) e.onGround = true; e.vy = 0; } else e.onGround = false;
    step('x', e.vx); step('z', e.vz);
    return hit;
  };
  function blockAtFeet(d, x, y, z) { return G.world.get(d, Math.floor(x), Math.floor(y), Math.floor(z)); }
  G.inLiquid = (e, id) => { const a = blockAtFeet(e.d, e.x, e.y + 0.3, e.z), b = blockAtFeet(e.d, e.x, e.y + 1.2, e.z); return a === id || b === id; };

  G.input = { f: 0, s: 0, jump: false, down: false, sprint: false, breakHeld: false, lookDX: 0, lookDY: 0 };
  let breaking = null, attackCD = 0, useCD = 0, lastJumpTap = 0;

  function updatePlayer(dt) {
    const p = G.player, inp = G.input, W = G.world, creative = G.mode === 'creative';
    p.yaw -= inp.lookDX; p.pitch = Math.max(-1.55, Math.min(1.55, p.pitch - inp.lookDY)); inp.lookDX = 0; inp.lookDY = 0;
    const inWater = G.inLiquid(p, KM.WATER), inLava = G.inLiquid(p, KM.LAVA);
    const ladder = B[Math.max(0, blockAtFeet(p.d, p.x, p.y + 0.5, p.z))].climb;
    let speed = p.fly ? 10 : inp.sprint ? 5.8 : 4.3;
    if (inp.down && !p.fly) speed = 1.6; if (inWater || inLava) speed *= 0.55; if (p.food <= 0 && !creative) speed = Math.min(speed, 3.5);
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    let mx = -sy * inp.f + cy * inp.s, mz = -cy * inp.f - sy * inp.s; const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    const acc = p.onGround || p.fly || inWater ? 14 : 4;
    p.vx += (mx * speed - p.vx) * Math.min(1, acc * dt); p.vz += (mz * speed - p.vz) * Math.min(1, acc * dt);
    if (p.fly) { p.vy += (((inp.jump ? 1 : 0) - (inp.down ? 1 : 0)) * 8 - p.vy) * Math.min(1, 10 * dt); }
    else if (inWater || inLava) { p.vy -= 9 * dt; if (inp.jump) p.vy = Math.min(p.vy + 22 * dt, 3.4); p.vy = Math.max(p.vy, -3.5); }
    else if (ladder) { p.vy = inp.jump || (inp.f > 0 && collides(p.d, p.x + mx * 0.3, p.y, p.z + mz * 0.3, PW, PH)) ? 3.2 : inp.down ? -1.5 : Math.max(p.vy - 20 * dt, -2); }
    else { p.vy -= 28 * dt; if (p.vy < -48) p.vy = -48; if (inp.jump && p.onGround) { p.vy = 8.6; } }
    const wasGround = p.onGround, startY = p.y;
    const hit = G.moveBody(p, dt, PW, PH);
    // автоподъём на ступеньку в полблока не нужен — блоки целые, прыжок по удержанию
    if ((hit.x || hit.z) && p.onGround && inp.jump === false && G.settings.touch && ml > 0.3) { p.vy = 8.6; }
    if (!p.onGround && !p.fly && !inWater && !ladder) { if (p.vy > 0 || wasGround) p.fallFrom = Math.max(p.fallFrom, p.y); p.fallFrom = Math.max(p.fallFrom, p.y); }
    if (p.onGround || inWater || ladder || p.fly) {
      const fall = p.fallFrom - p.y; if (fall > 3.6 && !creative && !inWater) G.damage(Math.floor(fall - 3), 'Разбился при падении');
      p.fallFrom = p.y;
    }
    if (inLava && !creative) { p.lavaT = (p.lavaT || 0) + dt; if (p.lavaT > 0.5) { p.lavaT = 0; G.damage(3, 'Сгорел в лаве'); } }
    const under = blockAtFeet(p.d, p.x, p.y - 0.05, p.z), touch = [blockAtFeet(p.d, p.x + 0.35, p.y + 0.5, p.z), blockAtFeet(p.d, p.x - 0.35, p.y + 0.5, p.z), blockAtFeet(p.d, p.x, p.y + 0.5, p.z + 0.35), blockAtFeet(p.d, p.x, p.y + 0.5, p.z - 0.35)];
    if (!creative && (under === KM.CACTUS || touch.includes(KM.CACTUS))) { p.cactT = (p.cactT || 0) + dt; if (p.cactT > 0.7) { p.cactT = 0; G.damage(1, 'Укололся о кактус'); } }
    if (p.y < -12) { if (p.d === 2) { G.damage(6, 'Упал с небесного острова'); G.respawnInDim(); } else { p.y = 2; G.damage(20, 'Выпал из мира'); } }
    // голод и здоровье
    if (!creative) {
      const moving = Math.hypot(p.vx, p.vz) > 0.5;
      p.sat += dt * (inp.sprint && moving ? 3 : moving ? 1.3 : 0.8);
      if (p.sat > 45) { p.sat = 0; p.food = Math.max(0, p.food - 1); }
      p.regen = (p.regen || 0) + dt;
      if (p.regen > 3) { p.regen = 0; if (p.food >= 16 && p.hp < 20) { p.hp++; p.sat += 8; } else if (p.food <= 0) G.damage(1, 'Умер от голода'); }
      // под водой кончается воздух
      const headIn = blockAtFeet(p.d, p.x, p.y + EYE, p.z) === KM.WATER;
      if (headIn) { p.air -= dt; if (p.air < 0) { p.air = 1; G.damage(2, 'Утонул'); } } else p.air = Math.min(10, p.air + dt * 4);
    }
    document.getElementById('under').style.display = blockAtFeet(p.d, p.x, p.y + EYE, p.z) === KM.WATER ? 'block' : 'none';
    if (p.hurtT > 0) p.hurtT -= dt;
    // нажимные плиты
    if (Math.floor(p.y - 0.05) !== p._plateY || Math.floor(p.x) !== p._plateX || Math.floor(p.z) !== p._plateZ) {
      p._plateX = Math.floor(p.x); p._plateY = Math.floor(p.y); p._plateZ = Math.floor(p.z);
      G.mechPlates();
    }
    if (useCD > 0) useCD -= dt; if (attackCD > 0) attackCD -= dt;
  }
  G.damage = function (n, why, from) {
    const p = G.player; if (G.mode === 'creative' || p.hp <= 0 || n <= 0) return;
    if (p.hurtT > 0 && !from) return;
    // броня срезает урон (кроме голода, удушья и падения в пустоту) и понемногу изнашивается
    const pts = G.armorPoints();
    if (pts > 0 && !/голод|Утонул|Выпал/.test(why || '')) {
      const x = n * (1 - Math.min(0.8, pts * 0.04)); n = Math.floor(x) + (Math.random() < x % 1 ? 1 : 0);
      for (let i = 0; i < 4; i++) { const a = p.armor[i]; if (!a) continue; a[2] = (a[2] || 0) + 1; if (a[2] >= KM.I[a[0]].armor.dur) { p.armor[i] = null; G.toast(KM.name(a[0]) + ' сломался'); G.sfx('break'); } }
      G.uiDirty = true;
      if (n <= 0) { p.hurtT = 0.45; G.sfx('hit'); return; }
    }
    p.hp = Math.max(0, p.hp - n); p.hurtT = 0.45; G.sfx('hurt');
    const h = document.getElementById('hurt'); h.style.opacity = 0.7; setTimeout(() => { h.style.opacity = 0; }, 160);
    if (from) { const dx = p.x - from.x, dz = p.z - from.z, l = Math.hypot(dx, dz) || 1; p.vx += dx / l * 7; p.vz += dz / l * 7; p.vy = Math.max(p.vy, 5); }
    if (p.hp <= 0) G.die(why || 'Не повезло');
  };

  // ---------- луч взгляда ----------
  G.lookDir = () => { const p = G.player, cp = Math.cos(p.pitch); return new THREE.Vector3(-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp); };
  G.raycast = function (maxD = 5.5) {
    const p = G.player, W = G.world, o = { x: p.x, y: p.y + EYE, z: p.z }, dv = G.lookDir();
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const sx = Math.sign(dv.x), sy = Math.sign(dv.y), sz = Math.sign(dv.z);
    const tdx = Math.abs(1 / dv.x), tdy = Math.abs(1 / dv.y), tdz = Math.abs(1 / dv.z);
    let tx = (sx > 0 ? x + 1 - o.x : o.x - x) * tdx, ty = (sy > 0 ? y + 1 - o.y : o.y - y) * tdy, tz = (sz > 0 ? z + 1 - o.z : o.z - z) * tdz;
    let n = [0, 0, 0], t = 0;
    for (let i = 0; i < 64 && t <= maxD; i++) {
      const b = W.get(p.d, x, y, z);
      if (b > 0 && B[b].shape !== 'liquid') return { x, y, z, n, id: b, t };
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; n = [-sx, 0, 0]; }
      else if (ty < tz) { y += sy; t = ty; ty += tdy; n = [0, -sy, 0]; }
      else { z += sz; t = tz; tz += tdz; n = [0, 0, -sz]; }
    }
    return null;
  };

  // ---------- инвентарь ----------
  // 36 ячеек: 0–8 — панель быстрого доступа, 9–35 — рюкзак. Ячейка: null или [id, count, износ].
  G.invNew = () => { const a = new Array(36).fill(null); return a; };
  G.held = () => G.inv[G.hot];
  G.armorPoints = () => { const a = G.player && G.player.armor; let s = 0; if (a) for (const x of a) if (x) s += KM.I[x[0]].armor.pts; return s; };
  G.give = function (id, n = 1, quiet = false) {
    if (!id) return 0;
    if (G.player && G.player.prog && !G.player.prog[id]) { G.player.prog[id] = 1; if (G.onProgress) G.onProgress(); }
    const st = KM.stackOf(id); let left = n;
    for (let i = 0; i < 36 && left; i++) { const s = G.inv[i]; if (s && s[0] === id && s[1] < st && !(KM.isItem(id) && KM.I[id].tool)) { const k = Math.min(st - s[1], left); s[1] += k; left -= k; } }
    for (let i = 0; i < 36 && left; i++) if (!G.inv[i]) { const k = Math.min(st, left); G.inv[i] = [id, k, 0]; left -= k; }
    if (left && !quiet) G.toast('Инвентарь полон');
    G.uiDirty = true;
    return n - left;
  };
  G.count = (id) => G.inv.reduce((s, x) => s + (x && x[0] === id ? x[1] : 0), 0);
  G.take = function (id, n) {
    for (let i = 35; i >= 0 && n > 0; i--) { const s = G.inv[i]; if (s && s[0] === id) { const k = Math.min(n, s[1]); s[1] -= k; n -= k; if (!s[1]) G.inv[i] = null; } }
    G.uiDirty = true;
  };
  function useHeld(n = 1) { if (G.mode === 'creative') return; const s = G.held(); if (!s) return; s[1] -= n; if (s[1] <= 0) G.inv[G.hot] = null; G.uiDirty = true; }
  function wearTool() {
    if (G.mode === 'creative') return; const s = G.held(); if (!s || !KM.isItem(s[0])) return; const t = KM.I[s[0]].tool; if (!t) return;
    s[2] = (s[2] || 0) + 1; if (s[2] >= t.dur) { G.inv[G.hot] = null; G.toast(KM.name(s[0]) + ' сломался'); G.sfx('break'); } G.uiDirty = true;
  }
  G.toolOf = () => { const s = G.held(); return s && KM.isItem(s[0]) ? KM.I[s[0]].tool || null : null; };

  // ---------- ломать и ставить ----------
  function breakTime(id) {
    const df = B[id]; if (df.hard < 0) return Infinity; if (G.mode === 'creative') return 0.12;
    const t = G.toolOf();
    let k = 1;
    if (df.tool && t && t.type === df.tool) k = 1 / t.speed;
    else if (df.tool === 'pick') k = 4;
    else if (df.tool) k = 1.4;
    return Math.max(0.05, df.hard * k * 0.75);
  }
  function canHarvest(id) {
    const df = B[id]; if (df.tier < 0) return true; const t = G.toolOf(); return !!(t && t.type === 'pick' && t.tier >= df.tier);
  }
  function dropOf(id) {
    const df = B[id]; let dr = df.drop;
    if (typeof dr === 'string') { if (dr.endsWith('?')) return Math.random() < 0.15 ? KM.byKey(dr.slice(0, -1)) : 0; return KM.byKey(dr); }
    if (id === KM.LEAVES && Math.random() < 0.06) return KM.APPLE;
    return dr;
  }
  G.breakBlock = function (x, y, z, byPlayer = true) {
    const W = G.world, d = G.player.d, id = W.get(d, x, y, z); if (id <= 0) return;
    const df = B[id];
    if (id === KM.CHEST) { const k = d + ':' + x + ',' + y + ',' + z, items = W.chests[k]; if (items && G.mode !== 'creative') for (const s of items) if (s) G.give(s[0], s[1], true); delete W.chests[k]; }
    if (id === KM.DOOR || id === KM.DOOR_OPEN) { for (const dy of [-1, 1]) { const o = W.get(d, x, y + dy, z); if (o === KM.DOOR || o === KM.DOOR_OPEN) W.set(d, x, y + dy, z, 0); } }
    if (id === KM.PISTON && (W.getMeta(d, x, y, z) & 8)) { const F = KM.FACES[W.getMeta(d, x, y, z) & 7].n; if (W.get(d, x + F[0], y + F[1], z + F[2]) === KM.PISTON_HEAD) W.set(d, x + F[0], y + F[1], z + F[2], 0); }
    W.set(d, x, y, z, 0);
    // растения и факелы без опоры падают
    const up = W.get(d, x, y + 1, z); if (up > 0 && (B[up].shape === 'cross' || B[up].shape === 'flat') && up !== KM.TORCH) { W.set(d, x, y + 1, z, 0); if (byPlayer && G.mode !== 'creative') { const dd = dropOf(up); if (dd) G.give(dd, 1); } }
    if (byPlayer && G.mode !== 'creative' && canHarvest(id)) { const dd = dropOf(id); if (dd) G.give(dd, 1); }
    if (df.mech) G.mechUpdate(x, y, z);
    if (byPlayer) G.player.stats.br++;
    G.particles(x + 0.5, y + 0.5, z + 0.5, id);
    G.sfx('break');
  };
  const MOVABLE = (id) => id > 0 && B[id].hard >= 0 && ![KM.CHEST, KM.ALTAR, KM.ALTAR_USED, KM.PISTON_HEAD, KM.BEDROCK, KM.PORTAL_DEEP, KM.PORTAL_SKY].includes(id);
  function facingFromLook(full) {
    const dv = G.lookDir();
    if (full && Math.abs(dv.y) > 0.75) return dv.y > 0 ? 2 : 3;
    if (Math.abs(dv.x) > Math.abs(dv.z)) return dv.x > 0 ? 0 : 1;
    return dv.z > 0 ? 4 : 5;
  }
  function place(hit) {
    const W = G.world, d = G.player.d, s = G.held(); if (!s) return false;
    let id = s[0];
    if (KM.isItem(id)) {
      const it = KM.I[id];
      if (it.place) { if (W.get(d, hit.x, hit.y, hit.z) !== KM.byKey(it.on) || hit.n[1] !== 1) return false; id = KM.byKey(it.place); }
      else return false;
    }
    const x = hit.x + hit.n[0], y = hit.y + hit.n[1], z = hit.z + hit.n[2];
    const cur = W.get(d, x, y, z); if (cur < 0 || (cur && B[cur].shape !== 'liquid' && B[cur].shape !== 'cross')) return false;
    if (cur === KM.TORCH || cur === KM.LEVER || cur === KM.LEVER_ON) return false;
    const df = B[id];
    if ((df.shape === 'flat' || df.shape === 'cross') && id !== KM.TORCH && id !== KM.LEVER) { const below = W.get(d, x, y - 1, z); if (!below || !B[below].solid) return false; }
    if (df.solid) {
      const p = G.player;
      if (Math.abs(x + 0.5 - p.x) < 0.5 + PW && Math.abs(z + 0.5 - p.z) < 0.5 + PW && y + 1 > p.y && y < p.y + PH) return false;
      if (G.mobsBlocking && G.mobsBlocking(x, y, z)) return false;
    }
    let m = 0;
    if (df.mech === 'piston') m = facingFromLook(true);
    if (id === KM.LADDER) { if (!hit.n[1]) m = hit.n[2] === 1 ? 0 : hit.n[2] === -1 ? 1 : hit.n[0] === 1 ? 2 : 3; else return false; }
    if (id === KM.DOOR) { if (W.get(d, x, y + 1, z) !== 0) return false; W.set(d, x, y + 1, z, KM.DOOR); }
    W.set(d, x, y, z, id, m);
    if (df.mech) G.mechUpdate(x, y, z);
    if (id === KM.PORTAL_DEEP || id === KM.PORTAL_SKY) G.player.portals[(id === KM.PORTAL_DEEP ? 'deep' : 'sky') + d] = [x, y, z];
    if (id === KM.ALTAR_FINAL) G.player.portals['altar' + d] = [x, y, z];
    useHeld(1);
    G.player.stats.pl++; G.swingHand();
    G.sfx('place');
    return true;
  }

  // ---------- механизмы ----------
  // Источники (рычаг, кнопка, плита) питают соседние блоки и искроводы; искровод передаёт ток дальше.
  const buttons = new Map(); // "x,y,z" → время отпускания
  G.mechUpdate = function (x0, y0, z0) {
    const W = G.world, d = G.player.d, Rr = 14;
    const parts = [], sources = [];
    for (let x = x0 - Rr; x <= x0 + Rr; x++) for (let z = z0 - Rr; z <= z0 + Rr; z++) for (let y = Math.max(1, y0 - 8); y <= Math.min(HY - 1, y0 + 8); y++) {
      const b = W.get(d, x, y, z); if (b <= 0) continue; const mc = B[b].mech; if (!mc) continue;
      parts.push([x, y, z, b]);
      if (b === KM.LEVER_ON || (b === KM.BUTTON && buttons.has(x + ',' + y + ',' + z)) || (b === KM.PLATE && G.plateDown(x, y, z))) sources.push([x, y, z]);
    }
    const powered = new Set(), wires = new Set(), q = [];
    const key = (x, y, z) => x + ',' + y + ',' + z;
    const isWire = (b) => b === KM.WIRE || b === KM.WIRE_ON;
    for (const s of sources) q.push(s);
    const seen = new Set(q.map((s) => key(...s)));
    while (q.length) {
      const [x, y, z] = q.shift();
      for (const [a, b, c] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1], [1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1]]) {
        const nx = x + a, ny = y + b, nz = z + c, k = key(nx, ny, nz); if (seen.has(k)) continue;
        const nb = W.get(d, nx, ny, nz); if (nb <= 0) continue;
        if (isWire(nb)) { seen.add(k); wires.add(k); q.push([nx, ny, nz]); }
        else if (b === 0 || a === 0 && c === 0) { if (B[nb].mech && B[nb].mech !== 'source') powered.add(k); }
      }
    }
    for (const [x, y, z, b] of parts) {
      const k = key(x, y, z), on = powered.has(k), m = W.getMeta(d, x, y, z);
      if (isWire(b)) { const want = wires.has(k) ? KM.WIRE_ON : KM.WIRE; if (want !== b) W.set(d, x, y, z, want); }
      else if (b === KM.LAMP || b === KM.LAMP_ON) { const want = on ? KM.LAMP_ON : KM.LAMP; if (want !== b) W.set(d, x, y, z, want); }
      else if (b === KM.DOOR || b === KM.DOOR_OPEN) {
        const was = !!(m & 16);
        if (on !== was) { const want = on ? KM.DOOR_OPEN : KM.DOOR; for (const dy of [0, 1, -1]) { const o = W.get(d, x, y + dy, z); if (o === KM.DOOR || o === KM.DOOR_OPEN) W.set(d, x, y + dy, z, want, on ? 16 : 0); } }
      }
      else if (b === KM.PISTON) {
        const ext = !!(m & 8), F = KM.FACES[m & 7].n, hx = x + F[0], hy = y + F[1], hz = z + F[2];
        if (on && !ext) {
          const front = W.get(d, hx, hy, hz);
          if (front === 0 || (front > 0 && !B[front].solid)) { W.set(d, hx, hy, hz, KM.PISTON_HEAD, m & 7); W.set(d, x, y, z, KM.PISTON, (m & 7) | 8); G.sfx('place'); }
          else if (MOVABLE(front)) { const bx = hx + F[0], by = hy + F[1], bz = hz + F[2], beyond = W.get(d, bx, by, bz); if (beyond === 0 || (beyond > 0 && B[beyond].shape === 'liquid')) { W.set(d, bx, by, bz, front, W.getMeta(d, hx, hy, hz)); W.set(d, hx, hy, hz, KM.PISTON_HEAD, m & 7); W.set(d, x, y, z, KM.PISTON, (m & 7) | 8); G.sfx('place'); } }
        } else if (!on && ext) { if (W.get(d, hx, hy, hz) === KM.PISTON_HEAD) W.set(d, hx, hy, hz, 0); W.set(d, x, y, z, KM.PISTON, m & 7); }
      }
      else if (b === KM.BOMB && on) G.ignite(x, y, z);
    }
  };
  G.pressButton = (x, y, z) => { buttons.set(x + ',' + y + ',' + z, performance.now() + 1200); G.mechUpdate(x, y, z); G.sfx('click'); };
  G.plateDown = (x, y, z) => {
    const p = G.player; if (Math.floor(p.x) === x && Math.floor(p.z) === z && Math.floor(p.y + 0.05) === y && p.onGround) return true;
    return G.mobs ? G.mobs.some((m) => Math.floor(m.x) === x && Math.floor(m.z) === z && Math.abs(m.y - y) < 0.6) : false;
  };
  let platesOn = new Set();
  G.mechPlates = function () {
    const W = G.world, d = G.player.d, p = G.player, now = new Set();
    for (let x = Math.floor(p.x) - 6; x <= Math.floor(p.x) + 6; x++) for (let z = Math.floor(p.z) - 6; z <= Math.floor(p.z) + 6; z++) for (let y = Math.floor(p.y) - 3; y <= Math.floor(p.y) + 3; y++)
      if (W.get(d, x, y, z) === KM.PLATE && G.plateDown(x, y, z)) now.add(x + ',' + y + ',' + z);
    const changed = [...now].some((k) => !platesOn.has(k)) || [...platesOn].some((k) => !now.has(k));
    const all = new Set([...now, ...platesOn]); platesOn = now;
    if (changed) for (const k of all) { const [x, y, z] = k.split(',').map(Number); G.mechUpdate(x, y, z); G.sfx('click'); }
  };
  function tickButtons() {
    const t = performance.now();
    for (const [k, until] of buttons) if (t > until) { buttons.delete(k); const [x, y, z] = k.split(',').map(Number); G.mechUpdate(x, y, z); }
  }
  G.toggleDoor = (x, y, z) => {
    const W = G.world, d = G.player.d, b = W.get(d, x, y, z), want = b === KM.DOOR ? KM.DOOR_OPEN : KM.DOOR, m = want === KM.DOOR_OPEN ? 16 : 0;
    for (const dy of [0, 1, -1]) { const o = W.get(d, x, y + dy, z); if (o === KM.DOOR || o === KM.DOOR_OPEN) W.set(d, x, y + dy, z, want, m); }
    G.sfx('click');
  };

  // ---------- взрывы ----------
  G.fuses = [];
  G.ignite = (x, y, z) => { if (G.fuses.some((f) => f.x === x && f.y === y && f.z === z)) return; G.fuses.push({ x, y, z, t: 2.2 }); G.sfx('click'); };
  G.explode = function (cx, cy, cz, r = 3.2, dmg = 14) {
    const W = G.world, d = G.player.d; G.sfx('boom');
    const R2 = Math.ceil(r);
    for (let x = -R2; x <= R2; x++) for (let y = -R2; y <= R2; y++) for (let z = -R2; z <= R2; z++) {
      if (x * x + y * y + z * z > r * r * (0.75 + Math.random() * 0.4)) continue;
      const bx = Math.floor(cx) + x, by = Math.floor(cy) + y, bz = Math.floor(cz) + z, b = W.get(d, bx, by, bz);
      if (b <= 0 || B[b].hard < 0 || b === KM.TEMPLE || b === KM.OBSIDIAN || B[b].shape === 'liquid') continue;
      if (b === KM.BOMB) { G.ignite(bx, by, bz); continue; }
      W.set(d, bx, by, bz, 0);
      if (Math.random() < 0.25 && G.mode !== 'creative') { const dd = dropOf(b); if (dd) G.give(dd, 1, true); }
    }
    const p = G.player, dist = Math.hypot(p.x - cx, p.y + 1 - cy, p.z - cz);
    if (dist < r * 2.2) G.damage(Math.round(dmg * (1 - dist / (r * 2.2))), 'Подорвался', { x: cx, z: cz });
    if (G.mobs) for (const m of G.mobs) { const dm = Math.hypot(m.x - cx, m.y - cy, m.z - cz); if (dm < r * 2.2) G.hurtMob(m, Math.round(dmg * 1.5 * (1 - dm / (r * 2.2))), { x: cx, z: cz }); }
    G.particles(cx, cy, cz, KM.BOMB, 40); G.shake = 0.5;
  };
  function tickFuses(dt) {
    for (const f of G.fuses) { f.t -= dt; if (f.t <= 0) { const W = G.world; if (W.get(G.player.d, f.x, f.y, f.z) === KM.BOMB) W.set(G.player.d, f.x, f.y, f.z, 0); G.explode(f.x + 0.5, f.y + 0.5, f.z + 0.5); } }
    G.fuses = G.fuses.filter((f) => f.t > 0);
  }

  // ---------- частицы ----------
  const partGeo = new THREE.BufferGeometry(), PMAX = 600, pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3);
  partGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); partGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const partPts = new THREE.Points(partGeo, new THREE.PointsMaterial({ size: 0.12, vertexColors: true })); partPts.frustumCulled = false; scene.add(partPts);
  let parts = [];
  G.clearParticles = () => { parts = []; };
  const tileColor = (() => { const cache = {}; const g = atlas.getContext('2d'); return (tile) => { if (cache[tile]) return cache[tile]; const x = (tile % KM.ACOLS) * KM.TS, y = ((tile / KM.ACOLS) | 0) * KM.TS, d = g.getImageData(x, y, KM.TS, KM.TS).data; let r = 0, gg = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 100) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; } return (cache[tile] = n ? [r / n / 255, gg / n / 255, b / n / 255] : [1, 1, 1]); }; })();
  G.particles = (x, y, z, id, n = 12, col) => {
    const c = col || tileColor(B[id] ? B[id].t[1] : 0);
    for (let i = 0; i < n && parts.length < PMAX; i++) parts.push({ x: x + (Math.random() - 0.5) * 0.6, y: y + (Math.random() - 0.5) * 0.6, z: z + (Math.random() - 0.5) * 0.6, vx: (Math.random() - 0.5) * 4, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 4, t: 0.5 + Math.random() * 0.5, c });
  };
  function tickParts(dt) {
    let n = 0;
    for (const q of parts) { q.vy -= 14 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.t -= dt; if (q.t > 0 && n < PMAX) { pPos[n * 3] = q.x; pPos[n * 3 + 1] = q.y; pPos[n * 3 + 2] = q.z; pCol[n * 3] = q.c[0]; pCol[n * 3 + 1] = q.c[1]; pCol[n * 3 + 2] = q.c[2]; n++; } }
    parts = parts.filter((q) => q.t > 0);
    partGeo.setDrawRange(0, n); partGeo.attributes.position.needsUpdate = true; partGeo.attributes.color.needsUpdate = true;
  }

  // ---------- действия игрока ----------
  G.primary = function (dt, pressed) {
    // удар по существу важнее, чем ломание блока
    const hit = G.raycast(5);
    const mob = G.pickMob ? G.pickMob(hit ? hit.t : 4) : null;
    if (mob) { breaking = null; crack.visible = false; if (pressed || attackCD <= 0) { if (attackCD <= 0) { G.swingHand(); const t = G.toolOf(); G.hurtMob(mob, t && t.dmg ? t.dmg : 1, G.player); attackCD = 0.45; if (t) wearTool(); } } return; }
    if (!hit) { breaking = null; crack.visible = false; if (pressed) G.swingHand(); return; }
    G.swingHand();
    if (!breaking || breaking.x !== hit.x || breaking.y !== hit.y || breaking.z !== hit.z) breaking = { x: hit.x, y: hit.y, z: hit.z, p: 0, t: breakTime(hit.id), snd: 0 };
    if (breaking.t === Infinity) return;
    breaking.p += dt; breaking.snd -= dt; if (breaking.snd <= 0) { breaking.snd = 0.22; G.sfx('dig'); }
    const k = breaking.p / breaking.t;
    crack.visible = k > 0.05 && G.mode !== 'creative'; crack.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5); setCrack(Math.min(3, Math.floor(k * 4)));
    if (k >= 1) { G.breakBlock(hit.x, hit.y, hit.z); wearTool(); breaking = null; crack.visible = false; if (G.mode === 'creative') attackCD = 0.2; }
  };
  G.stopPrimary = () => { breaking = null; crack.visible = false; };
  G.secondary = function () {
    if (useCD > 0) return; useCD = 0.22;
    const hit = G.raycast(5.5), W = G.world, d = G.player.d, s = G.held();
    if (hit) {
      const id = hit.id, df = B[id], P = G.player;
      if (df.use && !(G.input.down && s && !KM.isItem(s[0]))) {
        G.swingHand();
        if (df.use === 'craft') { G.openInv('craft'); return; }
        if (df.use === 'chest') { G.openChest(hit.x, hit.y, hit.z); return; }
        if (df.use === 'lever') { W.set(d, hit.x, hit.y, hit.z, id === KM.LEVER ? KM.LEVER_ON : KM.LEVER); G.mechUpdate(hit.x, hit.y, hit.z); G.sfx('click'); return; }
        if (df.use === 'button') { G.pressButton(hit.x, hit.y, hit.z); return; }
        if (df.use === 'door') { G.toggleDoor(hit.x, hit.y, hit.z); return; }
        if (df.use === 'bomb') { G.ignite(hit.x, hit.y, hit.z); return; }
        if (df.use === 'altar') { G.summonBoss(hit.x, hit.y, hit.z, id === KM.ALTAR_FINAL ? 4 : W.getMeta(d, hit.x, hit.y, hit.z)); return; }
        if (df.use === 'portal') { G.usePortal(id); return; }
      }
      if (s && KM.isItem(s[0])) {
        const it = KM.I[s[0]];
        if (it.tool && it.tool.type === 'shovel' && (id === KM.GRASS || id === KM.DIRT) && hit.n[1] === 1 && !W.get(d, hit.x, hit.y + 1, hit.z)) { W.set(d, hit.x, hit.y, hit.z, KM.FARMLAND); wearTool(); G.sfx('dig'); return; }
        if (it.place) { if (place(hit)) return; }
      } else if (s && place(hit)) return;
    }
    if (s && KM.isItem(s[0])) {
      const it = KM.I[s[0]];
      if (it.armor) { const P = G.player, old = P.armor[it.armor.slot]; P.armor[it.armor.slot] = s; G.inv[G.hot] = old; G.uiDirty = true; G.sfx('craft'); G.swingHand(); G.toast('🛡 Надето: ' + KM.name(s[0]), 1600); return; }
      if (it.food) { if (G.player.food < 20 || G.mode === 'creative') { G.player.food = Math.min(20, G.player.food + it.food); useHeld(1); G.sfx('eat'); } return; }
      if (it.bow) { if (G.mode === 'creative' || G.count(KM.ARROW) > 0) { if (G.mode !== 'creative') G.take(KM.ARROW, 1); G.shootArrow(); } else G.toast('Нужны стрелы'); return; }
    }
  };

  // ---------- сутки ----------
  const DAY_LEN = 720; // секунд на сутки
  const SKY = { day: new THREE.Color('#8ec5ff'), night: new THREE.Color('#0b1030'), dusk: new THREE.Color('#ff9a6b'), deep: new THREE.Color('#3a0f12'), sky2: new THREE.Color('#bfe8ff') };
  G.dayFactor = () => { const a = Math.sin(G.time * Math.PI * 2); return Math.max(0.12, Math.min(1, 0.55 + a * 0.9)); };
  function updateSky(dt) {
    G.time = (G.time + dt / DAY_LEN) % 1;
    const p = G.player, d = p.d, RD = G.settings.dist * CS;
    let df = G.dayFactor(), col = new THREE.Color();
    if (d === 0) {
      col.copy(SKY.night).lerp(SKY.day, (df - 0.12) / 0.88);
      const dusk = Math.max(0, 1 - Math.abs(Math.sin(G.time * Math.PI * 2)) * 4); col.lerp(SKY.dusk, dusk * 0.35);
      if (p.y < KM.SEA - 12) col.lerp(new THREE.Color('#0d0f1a'), Math.min(1, (KM.SEA - 12 - p.y) / 20));
      uni.uMin.value = 0.07;
    } else if (d === 1) { col.copy(SKY.deep); df = 0; uni.uMin.value = 0.22; }
    else { col.copy(SKY.sky2).lerp(SKY.night, (1 - df) * 0.7); uni.uMin.value = 0.12; }
    scene.background = col; uni.fogColor.value.copy(col);
    uni.uDay.value = df; uni.fogNear.value = d === 1 ? RD * 0.3 : RD * 0.6; uni.fogFar.value = d === 1 ? RD * 0.9 : RD * 0.98;
    const ang = G.time * Math.PI * 2, cam = camera.position;
    sun.visible = moon.visible = stars.visible = d !== 1;
    sun.position.set(cam.x + Math.cos(ang) * 300, cam.y + Math.sin(ang) * 300, cam.z + 60); sun.lookAt(cam);
    moon.position.set(cam.x - Math.cos(ang) * 300, cam.y - Math.sin(ang) * 300, cam.z + 60); moon.lookAt(cam);
    stars.position.copy(cam); stars.material.opacity = d === 1 ? 0 : Math.max(0, 1 - df * 1.6);
    hemi.intensity = d === 1 ? 0.6 : 0.25 + df * 0.7; sunL.intensity = d === 1 ? 0.2 : df * 0.6;
  }

  // ---------- главный цикл ----------
  G.shake = 0;
  let lastT = performance.now(), saveT = 0, fpsT = 0, frames = 0, fps = 60;
  G.frame = function (now) {
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    frames++; fpsT += dt; if (fpsT > 1) { fps = frames / fpsT; frames = 0; fpsT = 0; }
    if (G.state === 'play' && G.world) {
      if (!G.paused) {
        updatePlayer(dt);
        if (G.input.breakHeld) G.primary(dt, false); else if (breaking) G.stopPrimary();
        tickButtons(); tickFuses(dt);
        if (G.tickMobs) G.tickMobs(dt);
        G.time += 0;
      }
      updateSky(G.paused ? 0 : dt);
      G.updateChunks(G.paused ? 4 : (fps < 40 ? 4 : 9));
      const p = G.player;
      camera.position.set(p.x, p.y + EYE + (G.input.down && !p.fly ? -0.2 : 0), p.z);
      if (G.shake > 0) { camera.position.x += (Math.random() - 0.5) * G.shake * 0.3; camera.position.y += (Math.random() - 0.5) * G.shake * 0.3; G.shake -= dt; }
      camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
      if (!G.paused) p.stats.t += dt;
      if (G.tickAvatar) G.tickAvatar(dt);
      const hit = !G.paused ? G.raycast(5.5) : null;
      sel.visible = !!hit; if (hit) sel.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      tickParts(dt);
      if (G.tickNet) G.tickNet(dt);
      if (G.tickHud) G.tickHud(dt, fps);
      saveT += dt; if (saveT > 15 && !G.paused) { saveT = 0; if (G.saveWorld) G.saveWorld(); }
    }
    R.render(scene, camera);
    if (G.renderHand) G.renderHand(R);
    requestAnimationFrame(G.frame);
  };
  G.resize = () => { const w = innerWidth, h = innerHeight; R.setSize(w, h, false); camera.aspect = w / h; camera.fov = G.settings.fov; camera.updateProjectionMatrix(); };
  addEventListener('resize', G.resize); G.resize();

  // ---------- старт мира ----------
  G.findSurface = function (d, x, z) {
    const W = G.world; G.ensureArea(d, x, z, 1);
    for (let y = HY - 2; y > 1; y--) { const b = W.get(d, x, y, z); if (b > 0 && B[b].solid && W.get(d, x, y + 1, z) === 0 && W.get(d, x, y + 2, z) === 0) return y + 1; }
    return -1;
  };
  G.spawnPoint = function () {
    const W = G.world;
    for (let r = 0; r < 400; r += 8) for (let a = 0; a < 8; a++) {
      const x = Math.round(8 + Math.cos(a / 8 * 6.283) * r), z = Math.round(8 + Math.sin(a / 8 * 6.283) * r);
      if (W.height(x, z) > KM.SEA + 1) { const y = G.findSurface(0, x, z); if (y > 0) return { x: x + 0.5, y, z: z + 0.5 }; }
    }
    return { x: 8.5, y: G.findSurface(0, 8, 8), z: 8.5 };
  };
  G.respawnInDim = function () {
    const p = G.player;
    if (p.d === 2) { const y = G.findSurface(2, 8, 8); p.x = 8.5; p.z = 8.5; p.y = y > 0 ? y : 50; }
    p.vx = p.vy = p.vz = 0; p.fallFrom = p.y;
  };
})();
