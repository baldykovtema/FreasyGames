'use strict';
/* =====================================================
   Отель «Полночь» — хоррор от первого лица для FreasyGames 3D.
   Один этаж: лобби, 30 комнат с пронумерованными дверями и выход.
   Ключи и монеты лежат в ящиках, в шкафах можно прятаться от Сквозняка.
===================================================== */

const $ = (id) => document.getElementById(id);
const ROOMS = 30;                 // двери 001–030, комната 30 — холл с выходом
const H = 3.0, WALL_T = 0.2, DOOR_W = 1.3, DOOR_H = 2.3;
const EYE = 1.6, PR = 0.3, WALK = 3.0, RUN = 4.4;
const TOUCH = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 1 && !matchMedia('(pointer: fine)').matches);

/* ---------- случайности с зерном ---------- */
let seedState = 1;
function rng() { seedState |= 0; seedState = seedState + 0x6D2B79F5 | 0; let t = Math.imul(seedState ^ seedState >>> 15, 1 | seedState); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
const R = (a, b) => a + rng() * (b - a);
const RI = (a, b) => Math.floor(R(a, b + 1));
const pick = (a) => a[Math.floor(rng() * a.length)];
const chance = (p) => rng() < p;
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } } };

/* ---------- рендер ---------- */
const canvas = $('gl');
let renderer;
try { renderer = new THREE.WebGLRenderer({canvas, antialias: !TOUCH}); }
catch (e) {
  document.querySelector('#start p').textContent = 'Браузер не смог запустить 3D (WebGL). Закрой лишние вкладки с играми или обнови страницу.';
  $('playBtn').style.display = 'none';
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, TOUCH ? 1.25 : 1.5));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050404);
scene.fog = new THREE.Fog(0x050404, 5, 24);
const camera = new THREE.PerspectiveCamera(72, 1, .05, 60);
camera.rotation.order = 'YXZ';
scene.add(camera);
scene.add(new THREE.HemisphereLight(0x8a7a66, 0x120d0a, .16));
// Свет комнат: фиксированный набор ламп, которые переезжают к ближайшим комнатам.
const roomLights = [];
for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffd29a, 0, 12, 2); scene.add(l); roomLights.push(l); }
const monsterLight = new THREE.PointLight(0x8fb4ff, 0, 9, 2); scene.add(monsterLight);
const flashlight = new THREE.SpotLight(0xfff0d0, 0, 20, .5, .55, 1.4);
flashlight.position.set(.15, -.12, 0);
camera.add(flashlight); camera.add(flashlight.target);
flashlight.target.position.set(0, -.1, -3);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

/* ---------- текстуры ---------- */
function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
const WALLPAPERS = [['#5a1f1c', '#6e2925', '#c9a45c'], ['#1f3b2c', '#284a37', '#c9b37a'], ['#2c3346', '#363f56', '#b9a77a'], ['#4a3a22', '#584628', '#d9b46a']];
const wallTex = WALLPAPERS.map(([a, b, c]) => canvasTex(256, 256, (g) => {
  g.fillStyle = a; g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) { g.fillStyle = b; g.fillRect(x + 10, 0, 12, 256); }
  g.fillStyle = c; g.globalAlpha = .32;
  for (let x = 16; x < 256; x += 32) for (let y = 16; y < 256; y += 32) { g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 4, y); g.lineTo(x, y + 6); g.lineTo(x - 4, y); g.fill(); }
}));
const floorTex = canvasTex(256, 256, (g) => {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 2; c++) {
      const off = r % 2 ? 64 : 0, shade = 70 + ((r * 7 + c * 13) % 5) * 6;
      g.fillStyle = `rgb(${shade + 20},${shade - 10},${shade - 40})`;
      g.fillRect((c * 128 + off) % 256, r * 32, 128, 32);
      if (off) g.fillRect(0, r * 32, off, 32);
    }
    g.fillStyle = '#1e120a'; g.fillRect(0, r * 32, 256, 2);
    for (let c = 0; c < 2; c++) g.fillRect((c * 128 + (r % 2 ? 64 : 0)) % 256, r * 32, 2, 32);
  }
  g.globalAlpha = .12; g.strokeStyle = '#000';
  for (let i = 0; i < 40; i++) { const y = (i * 37) % 256; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(80, y + 3, 160, y - 3, 256, y + 1); g.stroke(); }
});
const rugTex = canvasTex(128, 128, (g) => {
  g.fillStyle = '#6a1a1a'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#d9b46a'; g.lineWidth = 5; g.strokeRect(10, 10, 108, 108);
  g.lineWidth = 2; g.strokeRect(20, 20, 88, 88);
  g.fillStyle = '#d9b46a';
  g.beginPath(); g.moveTo(64, 36); g.lineTo(92, 64); g.lineTo(64, 92); g.lineTo(36, 64); g.fill();
  g.fillStyle = '#3a0c0c'; g.beginPath(); g.moveTo(64, 48); g.lineTo(80, 64); g.lineTo(64, 80); g.lineTo(48, 64); g.fill();
});
const paintings = Array.from({length: 6}, (_, i) => canvasTex(128, 96, (g) => {
  const hue = [20, 200, 120, 280, 40, 340][i];
  const sky = g.createLinearGradient(0, 0, 0, 96);
  sky.addColorStop(0, `hsl(${hue},35%,25%)`); sky.addColorStop(1, `hsl(${hue + 30},40%,55%)`);
  g.fillStyle = sky; g.fillRect(0, 0, 128, 96);
  g.fillStyle = `hsl(${hue + 50},50%,75%)`; g.beginPath(); g.arc(30 + i * 12, 30, 10, 0, Math.PI * 2); g.fill();
  g.fillStyle = `hsl(${hue - 20},30%,18%)`;
  g.beginPath(); g.moveTo(0, 96); for (let x = 0; x <= 128; x += 16) g.lineTo(x, 60 + Math.sin(x * .05 + i) * 12); g.lineTo(128, 96); g.fill();
  g.strokeStyle = '#2b1a0c'; g.lineWidth = 10; g.strokeRect(0, 0, 128, 96);
  g.strokeStyle = '#c9a45c'; g.lineWidth = 3; g.strokeRect(5, 5, 118, 90);
}));
const plateCache = new Map();
function plateTex(text, locked) {
  const k = text + (locked ? 'L' : '');
  if (plateCache.has(k)) return plateCache.get(k);
  const t = canvasTex(256, 128, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 128); grad.addColorStop(0, '#f2d58f'); grad.addColorStop(1, '#a87a32');
    g.fillStyle = grad; g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#5a3a12'; g.lineWidth = 8; g.strokeRect(6, 6, 244, 116);
    g.fillStyle = '#2a1806'; g.font = '800 70px Manrope, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 128, locked ? 52 : 66);
    if (locked) { g.fillStyle = '#8a1010'; g.font = '800 26px Manrope, system-ui, sans-serif'; g.fillText('ЗАПЕРТО', 128, 102); }
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  plateCache.set(k, t);
  return t;
}
function signTex(text, bg, fg) {
  const t = canvasTex(512, 128, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
    // шрифт уменьшается, пока надпись не поместится в табличку целиком
    let size = 64;
    do { g.font = `800 ${size}px Manrope, system-ui, sans-serif`; size -= 2; } while (g.measureText(text).width > 470 && size > 20);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 68);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
const smokeTex = canvasTex(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(10,14,24,.95)'); r.addColorStop(.6, 'rgba(20,28,44,.5)'); r.addColorStop(1, 'rgba(20,28,44,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
});
const glowTex = canvasTex(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(230,245,255,1)'); r.addColorStop(.3, 'rgba(140,190,255,.8)'); r.addColorStop(1, 'rgba(90,140,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
});

/* ---------- материалы и детали ---------- */
const matCache = new Map();
function mat(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({color, ...o}));
  return matCache.get(k);
}
const WOOD = 0x5e3b22, DARK_WOOD = 0x3b2414, BRASS = 0xc9a45c;
const geoCache = new Map();
const box = (w, h, d) => { const k = `b${w},${h},${d}`; if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d)); return geoCache.get(k); };
function mesh(geo, material, x, y, z, parent) { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); parent.add(m); return m; }
function group(parent, x = 0, y = 0, z = 0, ry = 0) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g); return g; }

/* ---------- мир ---------- */
let world = null, rooms = [], colliders = [], interactables = [], doors = [], coinsTotal = 0;
function addCollider(x0, x1, z0, z1) { const c = {x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), on: true}; colliders.push(c); return c; }
function wall(x0, x1, z0, z1, y0, y1, material, collide = true) {
  const w = Math.abs(x1 - x0), d = Math.abs(z1 - z0), h = y1 - y0;
  if (w < .01 || d < .01 || h < .01) return null;
  const m = mesh(new THREE.BoxGeometry(w, h, d), material, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, world);
  if (collide && y0 < 1.8) addCollider(x0, x1, z0, z1);
  return m;
}
function wallMat(texIdx, len) {
  const t = wallTex[texIdx].clone(); t.needsUpdate = true; t.repeat.set(len / 1.6, H / 1.6);
  return new THREE.MeshLambertMaterial({map: t});
}

// Стена с дверным проёмом по оси x (дальняя стена комнаты).
function wallWithOpening(xa, xb, z, openX, material) {
  const l = openX - DOOR_W / 2, r = openX + DOOR_W / 2;
  wall(xa, l, z - WALL_T / 2, z + WALL_T / 2, 0, H, material);
  wall(r, xb, z - WALL_T / 2, z + WALL_T / 2, 0, H, material);
  wall(l, r, z - WALL_T / 2, z + WALL_T / 2, DOOR_H, H, material, false);
  // наличник
  const frame = mat(DARK_WOOD);
  for (const s of [-1, 1]) {
    mesh(box(.1, DOOR_H + .1, WALL_T + .08), frame, openX + s * (DOOR_W / 2 + .05), (DOOR_H + .1) / 2, z, world);
  }
  mesh(box(DOOR_W + .3, .12, WALL_T + .08), frame, openX, DOOR_H + .06, z, world);
}

function buildDoor(room, last) {
  const x = room.outX, z = room.z1;
  const pivot = group(world, x - DOOR_W / 2 + .02, 0, z);
  const panelMat = last ? mat(0x2f5a3a) : mat(WOOD);
  const panel = mesh(box(DOOR_W - .05, DOOR_H - .03, .07), panelMat, (DOOR_W - .05) / 2, (DOOR_H - .03) / 2, 0, pivot);
  for (const sz of [-1, 1]) for (const py of [.65, 1.6]) mesh(box(DOOR_W - .35, .7, .02), mat(last ? 0x264a30 : 0x4e3019), (DOOR_W - .05) / 2, py, sz * .045, pivot);
  for (const sz of [-1, 1]) mesh(new THREE.SphereGeometry(.045, 10, 8), mat(BRASS, {emissive: 0x221500}), DOOR_W - .17, 1.05, sz * .07, pivot);
  const number = String(room.i + 1).padStart(3, '0');
  if (!last) {
    const plateMat = new THREE.MeshBasicMaterial({map: plateTex(number, room.locked)});
    const front = mesh(new THREE.PlaneGeometry(.42, .21), plateMat, (DOOR_W - .05) / 2, 1.78, .041, pivot);
    const back = mesh(new THREE.PlaneGeometry(.42, .21), new THREE.MeshBasicMaterial({map: plateTex(number, false)}), (DOOR_W - .05) / 2, 1.78, -.041, pivot);
    back.rotation.y = Math.PI;
    front.userData.plate = true;
    if (room.locked) mesh(box(.12, .16, .1), mat(BRASS, {emissive: 0x332200}), DOOR_W - .17, .9, .06, pivot);
  } else {
    const sign = mesh(new THREE.PlaneGeometry(1.2, .3), new THREE.MeshBasicMaterial({map: signTex('ВЫХОД', '#0d3a1c', '#7dff9e')}), x, DOOR_H + .32, z + WALL_T / 2 + .01, world);
    sign.userData.glow = true;
  }
  const blocker = addCollider(x - DOOR_W / 2, x + DOOR_W / 2, z - .08, z + .08);
  const door = {room, pivot, panel, blocker, open: false, angle: 0, locked: !!room.locked, last, x, z, plate: number};
  panel.userData.act = {type: 'door', door};
  interactables.push(panel);
  doors.push(door);
  return door;
}

/* ---------- мебель ---------- */
function bed(parent) {
  const g = group(parent);
  mesh(box(1.5, .35, 2.0), mat(DARK_WOOD), 0, .18, 0, g);
  mesh(box(1.42, .22, 1.9), mat(0xe9e0cf), 0, .46, .02, g);
  mesh(box(1.44, .08, 1.3), mat(pick([0x7a2a2a, 0x2a4a6a, 0x3a5a3a, 0x6a4a2a])), 0, .6, .3, g);
  mesh(box(.55, .14, .35), mat(0xf6f0e4), -.35, .63, -.72, g);
  mesh(box(.55, .14, .35), mat(0xf6f0e4), .35, .63, -.72, g);
  mesh(box(1.6, 1.1, .1), mat(DARK_WOOD), 0, .55, -1.0, g);
  return {g, w: 1.6, d: 2.05, spot: () => new THREE.Vector3(R(-.4, .4), .67, R(-.2, .55))};
}
function dresser(parent, room) {
  const g = group(parent);
  mesh(box(1.2, .9, .5), mat(WOOD), 0, .45, 0, g);
  mesh(box(1.26, .04, .54), mat(DARK_WOOD), 0, .92, 0, g);
  const drawers = [];
  for (let i = 0; i < 3; i++) {
    const dg = group(g, 0, .18 + i * .26, 0);
    const front = mesh(box(1.08, .22, .04), mat(0x6e4628), 0, 0, .255, dg);
    mesh(new THREE.SphereGeometry(.03, 8, 6), mat(BRASS), 0, 0, .29, dg);
    mesh(box(1.0, .02, .42), mat(0x3a2414), 0, -.08, .04, dg);
    const act = {type: 'drawer', group: dg, open: false, t: 0, content: null, contentMesh: null, room};
    front.userData.act = act;
    interactables.push(front);
    drawers.push(act);
  }
  // лампа сверху
  mesh(new THREE.CylinderGeometry(.06, .08, .3, 8), mat(BRASS), -.35, 1.08, 0, g);
  const shade = mesh(new THREE.CylinderGeometry(.12, .2, .2, 10, 1, true), mat(0xf2e2b8, {emissive: room.dark ? 0x000000 : 0x6a4a1a, side: THREE.DoubleSide}), -.35, 1.3, 0, g);
  shade.userData.lamp = room;
  room.dressers.push(drawers);
  return {g, w: 1.26, d: .55, spot: () => new THREE.Vector3(R(.05, .45), .95, R(-.1, .1))};
}
function wardrobe(parent, room) {
  const g = group(parent);
  mesh(box(1.2, 2.1, .7), mat(DARK_WOOD), 0, 1.05, 0, g);
  mesh(box(1.28, .08, .76), mat(0x2a180c), 0, 2.13, 0, g);
  const doorsW = [];
  for (const s of [-1, 1]) {
    const pv = group(g, s * .59, 0, .36);
    const d = mesh(box(.57, 1.95, .04), mat(WOOD), -s * .285, 1.05, 0, pv);
    mesh(box(.4, .7, .02), mat(0x4e3019), -s * .285, 1.4, .03, pv);
    mesh(box(.4, .7, .02), mat(0x4e3019), -s * .285, .55, .03, pv);
    mesh(new THREE.SphereGeometry(.03, 8, 6), mat(BRASS), -s * .53, 1.05, .04, pv);
    pv.userData.side = s;
    doorsW.push(pv);
    d.userData.act = {type: 'wardrobe', wardrobe: null};
    interactables.push(d);
  }
  const w = {g, doors: doorsW, open: 0, target: 0, room};
  for (const pv of doorsW) pv.children[0].userData.act.wardrobe = w;
  room.wardrobes.push(w);
  return {g, w: 1.28, d: .76};
}
function chair(parent) {
  const g = group(parent);
  const c = pick([0x7a2a2a, 0x2a4a6a, 0x5a4a2a]);
  mesh(box(.55, .12, .55), mat(c), 0, .48, .05, g);
  mesh(box(.55, .6, .1), mat(c), 0, .8, -.2, g);
  for (const [x, z] of [[-.23, -.2], [.23, -.2], [-.23, .28], [.23, .28]]) mesh(box(.05, .45, .05), mat(DARK_WOOD), x, .22, z, g);
  return {g, w: .6, d: .6, spot: () => new THREE.Vector3(R(-.1, .1), .55, R(0, .15))};
}
function sideTable(parent, room) {
  const g = group(parent);
  mesh(new THREE.CylinderGeometry(.3, .3, .04, 14), mat(WOOD), 0, .68, 0, g);
  mesh(new THREE.CylinderGeometry(.04, .06, .66, 8), mat(DARK_WOOD), 0, .33, 0, g);
  if (chance(.5)) { mesh(new THREE.CylinderGeometry(.05, .07, .18, 8), mat(0xe9e0cf), 0, .79, 0, g); mesh(new THREE.CylinderGeometry(.015, .015, .06, 4), mat(0x222222), 0, .91, 0, g); }
  else { const v = mesh(new THREE.CylinderGeometry(.08, .06, .25, 10), mat(0x2a4a6a), 0, .82, 0, g); v.userData = {}; }
  return {g, w: .65, d: .65, spot: () => new THREE.Vector3(.14, .71, .12)};
}
function plant(parent) {
  const g = group(parent);
  mesh(new THREE.CylinderGeometry(.22, .17, .4, 10), mat(0x8a4a2a), 0, .2, 0, g);
  for (let i = 0; i < 6; i++) {
    const l = mesh(new THREE.SphereGeometry(.16, 6, 5), mat(0x2f5a2a), Math.cos(i) * .12, .6 + (i % 3) * .14, Math.sin(i) * .12, g);
    l.scale.set(.7, 1.6, .7);
  }
  return {g, w: .5, d: .5};
}
function placeAlongWall(room, side, items) {
  // side: -1 левая стена (фасадом к +x), +1 правая (к −x)
  const wx = room.cx + side * (room.W / 2 - WALL_T / 2);
  const ry = side < 0 ? Math.PI / 2 : -Math.PI / 2;
  let cursor = room.z0 - 1.05;
  const end = room.z1 + 1.05;
  for (const make of items) {
    if (cursor - .5 < end) break;
    const holder = group(world);
    const it = make(holder, room);
    if (cursor - it.w < end) { world.remove(holder); break; }
    const zc = cursor - it.w / 2;
    const xc = wx - side * (WALL_T / 2 + it.d / 2 + .02);
    holder.position.set(xc, 0, zc); holder.rotation.y = ry;
    addCollider(xc - it.d / 2, xc + it.d / 2, zc - it.w / 2, zc + it.w / 2);
    if (it.spot) { holder.updateMatrixWorld(true); room.spots.push(holder.localToWorld(it.spot())); }
    cursor -= it.w + R(.2, .9);
  }
  // картина над мебелью
  if (chance(.7)) {
    const p = mesh(new THREE.PlaneGeometry(.9, .68), new THREE.MeshLambertMaterial({map: pick(paintings)}), wx - side * (WALL_T / 2 + .01), 1.85, R(room.z1 + 1.2, room.z0 - 1.2), world);
    p.rotation.y = ry;
  }
}

function furnish(room) {
  const lists = [[], []];
  const pool = [bed, dresser, wardrobe, chair, sideTable, plant, dresser, chair];
  const need = [];
  if (room.hasWardrobe) need.push(wardrobe);
  if (!need.includes(dresser) && chance(.75)) need.push(dresser);
  need.forEach((f, i) => lists[i % 2].push(f));
  let beds = 0;
  for (let s = 0; s < 2; s++) {
    for (let k = 0; k < 4; k++) {
      let f = pick(pool);
      if (f === bed && (beds++ > 0 || room.D < 7)) f = chair;
      lists[s].push(f);
    }
  }
  // обязательное — в начало списков, чтобы точно поместилось
  placeAlongWall(room, -1, lists[0]);
  placeAlongWall(room, 1, lists[1]);
  // ковёр
  if (chance(.6)) {
    const rug = mesh(new THREE.PlaneGeometry(Math.min(2.6, room.W - 2.5), Math.min(3.4, room.D - 2.5)), new THREE.MeshLambertMaterial({map: rugTex}), room.cx, .012, (room.z0 + room.z1) / 2, world);
    rug.rotation.x = -Math.PI / 2;
  }
}

function fillDrawers(room) {
  const all = room.dressers.flat();
  // Ключ прячется в случайном месте: в ящике, на мебели или на полу.
  if (room.locked) {
    const where = [];
    if (all.length) where.push('drawer', 'drawer');
    if (room.spots.length) where.push('surface', 'surface');
    where.push('floor');
    const kind = pick(where);
    if (kind === 'drawer') pick(all).content = {type: 'key'};
    else placeKey(room, kind === 'surface' ? pick(room.spots) : new THREE.Vector3(room.cx + R(-.7, .7), .02, R(room.z1 + 1.6, room.z0 - 1.6)));
  }
  for (const d of all) {
    if (d.content) continue;
    if (chance(.42)) { const n = RI(1, room.i > 15 ? 9 : 6); d.content = {type: 'coins', n}; coinsTotal += n; }
    else if (room.i >= 4 && chance(.09)) d.content = {type: 'med'};
  }
  for (const d of all) {
    if (!d.content) continue;
    const cm = new THREE.Group(); d.group.add(cm); cm.position.set(0, -.06, .05);
    if (d.content.type === 'key') {
      keyModel(cm);
    } else if (d.content.type === 'med') {
      mesh(box(.22, .08, .16), mat(0xf2f2f2), 0, .04, 0, cm);
      mesh(box(.1, .01, .03), mat(0xd62828), 0, .085, 0, cm);
      mesh(box(.03, .01, .1), mat(0xd62828), 0, .085, 0, cm);
    } else {
      for (let i = 0; i < Math.min(d.content.n, 6); i++) mesh(new THREE.CylinderGeometry(.035, .035, .012, 12), mat(0xffd23f, {emissive: 0x443000}), R(-.3, .3), .005 + i * .004, R(-.12, .12), cm);
    }
    d.contentMesh = cm;
  }
}

function keyModel(parent) {
  const k = new THREE.Group(); parent.add(k);
  mesh(new THREE.TorusGeometry(.05, .015, 6, 12), mat(BRASS, {emissive: 0x443000}), -.1, .01, 0, k).rotation.x = Math.PI / 2;
  mesh(box(.18, .02, .025), mat(BRASS, {emissive: 0x443000}), .03, .01, 0, k);
  mesh(box(.02, .02, .05), mat(BRASS), .1, .01, .02, k);
  return k;
}
function placeKey(room, at) {
  const g = group(world, at.x, at.y, at.z, R(0, Math.PI * 2));
  keyModel(g);
  // искорка, чтобы ключ было видно и в полутьме
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTex, color: 0xffd27a, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending}));
  glint.scale.set(.22, .22, 1); glint.position.y = .05; g.add(glint);
  // невидимая коробка побольше, чтобы ключ легко было «поймать» взглядом
  const hit = mesh(box(.34, .14, .3), new THREE.MeshBasicMaterial({visible: false}), 0, .05, 0, g);
  const act = {type: 'key', group: g, room};
  hit.userData.act = act; interactables.push(hit);
  room.looseKey = act;
}

function buildLobby(room) {
  // стойка регистрации, диваны, люстра и вывеска
  const desk = group(world, room.cx - 2.2, 0, room.z0 - 2.6);
  mesh(box(2.4, 1.1, .7), mat(DARK_WOOD), 0, .55, 0, desk);
  mesh(box(2.5, .06, .8), mat(0x2a180c), 0, 1.12, 0, desk);
  mesh(new THREE.SphereGeometry(.06, 10, 8), mat(BRASS, {emissive: 0x332200}), .7, 1.18, 0, desk);
  addCollider(room.cx - 3.45, room.cx - .95, room.z0 - 2.95, room.z0 - 2.25);
  const sofa = group(world, room.cx + 2.8, 0, room.z0 - 4.2, -Math.PI / 2);
  mesh(box(2.2, .45, .9), mat(0x6a1a1a), 0, .25, 0, sofa);
  mesh(box(2.2, .6, .2), mat(0x6a1a1a), 0, .65, -.35, sofa);
  addCollider(room.cx + 2.3, room.cx + 3.3, room.z0 - 5.3, room.z0 - 3.1);
  const sign = mesh(new THREE.PlaneGeometry(3.2, .8), new THREE.MeshBasicMaterial({map: signTex('Отель «Полночь»', '#1a0d06', '#f6d48a')}), room.cx, 2.35, room.z0 - WALL_T / 2 - .01, world);
  sign.rotation.y = Math.PI;
  const tip = mesh(new THREE.PlaneGeometry(2.4, .6), new THREE.MeshBasicMaterial({map: signTex('Свет мигает — в шкаф!', '#1a0d06', '#9fc4ff')}), room.cx - room.W / 2 + WALL_T / 2 + .01, 2.0, room.z0 - 5.5, world);
  tip.rotation.y = Math.PI / 2;
  for (const s of [-1, 1]) { const p = group(world, room.cx + s * (room.W / 2 - .6), 0, room.z1 + .7); plant(p); addCollider(room.cx + s * (room.W / 2 - .6) - .3, room.cx + s * (room.W / 2 - .6) + .3, room.z1 + .4, room.z1 + 1.0); }
  const rug = mesh(new THREE.PlaneGeometry(3, 5), new THREE.MeshLambertMaterial({map: rugTex}), room.cx, .012, (room.z0 + room.z1) / 2, world);
  rug.rotation.x = -Math.PI / 2;
}

function build(seed) {
  if (world) scene.remove(world);
  world = new THREE.Group(); scene.add(world);
  rooms = []; colliders = []; interactables = []; doors = []; coinsTotal = 0;
  seedState = seed;
  let z0 = 0, inX = 0;
  for (let i = 0; i <= ROOMS; i++) {
    const W = i === 0 ? 9 : i === ROOMS ? 10 : R(5.6, 9);
    const D = i === 0 ? 9 : i === ROOMS ? 8 : R(6.5, 10);
    const cx = i === 0 ? 0 : inX + R(-W / 2 + 1.3, W / 2 - 1.3);
    const z1 = z0 - D;
    const outX = i === ROOMS ? cx : cx + R(-W / 2 + 1.3, W / 2 - 1.3);
    const prevLocked = rooms.length > 0 && rooms[rooms.length - 1].locked;
    rooms.push({i, cx, z0, z1, W, D, inX, outX, dark: false, wardrobes: [], dressers: [], spots: [], wallpaper: i === 0 ? 3 : RI(0, 2), visited: false,
      locked: i >= 3 && i < ROOMS && !prevLocked && chance(.3), hasWardrobe: i >= 3 && i < ROOMS && chance(.62)});
    z0 = z1; inX = outX;
  }
  // тёмные комнаты появляются дальше по этажу
  for (const r of rooms) r.dark = r.i >= 7 && r.i < ROOMS && chance(.18);
  for (const r of rooms) {
    const wm = wallMat(r.wallpaper, Math.max(r.W, r.D));
    const L = r.cx - r.W / 2, Rr = r.cx + r.W / 2;
    // пол и потолок
    const ft = floorTex.clone(); ft.needsUpdate = true; ft.repeat.set(r.W / 2.2, r.D / 2.2);
    const floor = mesh(new THREE.PlaneGeometry(r.W, r.D), new THREE.MeshLambertMaterial({map: ft}), r.cx, 0, (r.z0 + r.z1) / 2, world); floor.rotation.x = -Math.PI / 2;
    const ceil = mesh(new THREE.PlaneGeometry(r.W, r.D), mat(0xcfc3ac), r.cx, H, (r.z0 + r.z1) / 2, world); ceil.rotation.x = Math.PI / 2;
    // боковые стены с панелями
    for (const [x, s] of [[L, -1], [Rr, 1]]) {
      wall(x - WALL_T / 2, x + WALL_T / 2, r.z1, r.z0, 0, H, wm);
      mesh(box(.04, .95, r.D), mat(0x3b2414), x - s * (WALL_T / 2 + .02), .48, (r.z0 + r.z1) / 2, world);
      mesh(box(.06, .06, r.D), mat(0x2a180c), x - s * (WALL_T / 2 + .03), .97, (r.z0 + r.z1) / 2, world);
      mesh(box(.06, .1, r.D), mat(0xe6dccb), x - s * (WALL_T / 2 + .03), H - .05, (r.z0 + r.z1) / 2, world);
    }
    if (r.i === 0) wall(L, Rr, r.z0 - WALL_T / 2, r.z0 + WALL_T / 2, 0, H, wm);
    // дальняя стена общая со следующей комнатой
    const next = rooms[r.i + 1];
    const xa = next ? Math.min(L, next.cx - next.W / 2) : L, xb = next ? Math.max(Rr, next.cx + next.W / 2) : Rr;
    wallWithOpening(xa - WALL_T / 2, xb + WALL_T / 2, r.z1, r.outX, wm);
    // люстра/плафон
    const fix = mesh(new THREE.CylinderGeometry(.35, .25, .12, 14), mat(0xf6e6c0, {emissive: r.dark ? 0x000000 : 0xb08a4a}), r.cx, H - .08, (r.z0 + r.z1) / 2, world);
    fix.userData.fixture = r; r.fixture = fix;
    buildDoor(r, r.i === ROOMS);
    if (r.i === 0) buildLobby(r);
    else if (r.i < ROOMS) { furnish(r); fillDrawers(r); }
    else {
      // холл с выходом: колонны и зелёный свет
      for (const s of [-1, 1]) { mesh(new THREE.CylinderGeometry(.25, .25, H, 12), mat(0xd9cfb8), r.cx + s * 2.6, H / 2, (r.z0 + r.z1) / 2, world); addCollider(r.cx + s * 2.6 - .25, r.cx + s * 2.6 + .25, (r.z0 + r.z1) / 2 - .25, (r.z0 + r.z1) / 2 + .25); }
    }
  }
  // номер на двери должен совпадать с замком после проверки
  for (const d of doors) if (d.locked && !d.room.locked) d.locked = false;
}

/* ---------- Сквозняк ---------- */
const monster = new THREE.Group();
scene.add(monster);
const puffs = [];
for (let i = 0; i < 26; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({map: smokeTex, transparent: true, depthWrite: false, opacity: .9}));
  const a = i / 26 * Math.PI * 2, r = .3 + (i % 4) * .22;
  s.userData = {a, r, y: (i % 5 - 2) * .35, s: 1.2 + (i % 3) * .6, sp: 1.5 + (i % 4) * .7};
  monster.add(s); puffs.push(s);
}
const eyes = [];
for (const x of [-.22, .22]) {
  const e = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false}));
  e.scale.set(.5, .32, 1); e.position.set(x, .25, .6); monster.add(e); eyes.push(e);
}
monster.visible = false;

/* ---------- Тень: живёт в тёмных комнатах, боится света ---------- */
const shadeMesh = new THREE.Group();
scene.add(shadeMesh);
const shadeMat = new THREE.MeshBasicMaterial({color: 0x040206, transparent: true, opacity: .93});
mesh(new THREE.CylinderGeometry(.18, .32, 1.6, 10), shadeMat, 0, .95, 0, shadeMesh);
mesh(new THREE.SphereGeometry(.2, 12, 10), shadeMat, 0, 1.92, 0, shadeMesh);
for (const s of [-1, 1]) { const arm = mesh(new THREE.CylinderGeometry(.04, .06, 1.1, 6), shadeMat, s * .26, 1.15, .05, shadeMesh); arm.rotation.z = s * .18; }
const shadeWisps = [];
for (let i = 0; i < 8; i++) {
  const w = new THREE.Sprite(new THREE.SpriteMaterial({map: smokeTex, transparent: true, depthWrite: false, opacity: .8}));
  w.scale.set(.8, .8, 1); shadeMesh.add(w); shadeWisps.push(w);
}
for (const x of [-.07, .07]) {
  const e = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTex, color: 0xff3a3a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false}));
  e.scale.set(.14, .1, 1); e.position.set(x, 1.95, .17); shadeMesh.add(e);
}
shadeMesh.visible = false;

/* ---------- Шёпот: бледное лицо за спиной, на него нельзя смотреть ---------- */
const faceTex = canvasTex(128, 160, (g) => {
  const r = g.createRadialGradient(64, 76, 10, 64, 80, 70);
  r.addColorStop(0, 'rgba(236,232,220,.95)'); r.addColorStop(.7, 'rgba(200,196,186,.7)'); r.addColorStop(1, 'rgba(200,196,186,0)');
  g.fillStyle = r; g.beginPath(); g.ellipse(64, 80, 48, 66, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0a0606';
  for (const x of [44, 84]) { g.beginPath(); g.ellipse(x, 68, 10, 15, 0, 0, Math.PI * 2); g.fill(); }
  g.beginPath(); g.ellipse(64, 116, 9, 16, 0, 0, Math.PI * 2); g.fill();
});
faceTex.wrapS = faceTex.wrapT = THREE.ClampToEdgeWrapping;
const whisperSprite = new THREE.Sprite(new THREE.SpriteMaterial({map: faceTex, transparent: true, depthWrite: false, opacity: .9}));
whisperSprite.scale.set(.62, .78, 1);
scene.add(whisperSprite);
whisperSprite.visible = false;

/* ---------- звук ---------- */
let actx = null, noiseBuf = null;
function audio() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(f, dur, type = 'sine', vol = .05, slide = 1, delay = 0) {
  const a = audio(); if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .05);
}
function noise(dur, vol, freq, q = 1, delay = 0) {
  const a = audio(); if (!a) return;
  const t = a.currentTime + delay, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(f).connect(g).connect(a.destination); s.start(t, Math.random()); s.stop(t + dur + .05);
}
const sfx = {
  step: () => noise(.06, .05, 260, 2),
  creak: () => { tone(140, .5, 'sawtooth', .025, .6); noise(.4, .02, 700, 6); },
  drawer: () => noise(.18, .06, 900, 3),
  coin: () => { tone(1320, .08, 'square', .03); tone(1760, .14, 'square', .03, 1, .07); },
  key: () => { [660, 880, 1100].forEach((f, i) => tone(f, .16, 'triangle', .05, 1, i * .08)); },
  locked: () => { noise(.08, .08, 400, 4); noise(.08, .08, 400, 4, .1); },
  hide: () => noise(.25, .05, 500, 2),
  flash: () => tone(1800, .03, 'square', .02),
  death: () => { noise(1.2, .25, 200, .5); tone(300, 1.2, 'sawtooth', .08, .2); },
  win: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, .5, 'triangle', .06, 1, i * .14)); },
};
let wind = null;
function startWind() {
  const a = audio(); if (!a || wind) return;
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noiseBuf; s.loop = true; f.type = 'lowpass'; f.frequency.value = 300; g.gain.value = 0;
  s.connect(f).connect(g).connect(a.destination); s.start();
  wind = {s, f, g};
}
function setWind(vol, freq) { if (!wind) return; const t = actx.currentTime; wind.g.gain.setTargetAtTime(vol, t, .1); wind.f.frequency.setTargetAtTime(freq, t, .1); }
function stopWind() { if (!wind) return; try { wind.s.stop(); } catch { /* уже остановлен */ } wind = null; }
let hum = null;
function startHum() {
  const a = audio(); if (!a || hum) return;
  const o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.value = 55; g.gain.value = .012;
  o.connect(g).connect(a.destination); o.start(); hum = {o, g};
}

/* ---------- состояние ---------- */
const S = {
  playing: false, paused: false, dead: false, won: false, time: 0, coins: 0, hasKey: false,
  pos: new THREE.Vector3(), yaw: 0, pitch: 0, room: 0, maxRoom: 0, hidden: null, light: false,
  draft: null, sinceDraft: 0, stepT: 0, bob: 0, seed: 1, hp: 100, shade: null, whisper: null,
};
const keys = new Set();
let lookTarget = null;

function roomAt(z) {
  for (const r of rooms) if (z <= r.z0 + .01 && z > r.z1) return r.i;
  return z > 0 ? 0 : ROOMS;
}

function newGame() {
  S.seed = sharedSeed() || (Date.now() & 0x7fffffff) || 7;
  build(S.seed);
  Object.assign(S, {playing: true, paused: false, dead: false, won: false, time: 0, coins: 0, hasKey: false, yaw: 0, pitch: 0, room: 0, maxRoom: 0, hidden: null, light: false, draft: null, sinceDraft: 0, hp: 100, shade: null, whisper: null});
  shadeMesh.visible = false; whisperSprite.visible = false;
  S.pos.set(rooms[0].cx, 0, rooms[0].z0 - 6.5);
  monster.visible = false; monsterLight.intensity = 0; stopWind(); flashlight.intensity = 0;
  $('hideView').classList.remove('on'); $('wind').style.opacity = 0;
  rooms[0].visited = true;
  updateHud();
}

/* ---------- ввод ---------- */
function lockPointer() {
  if (TOUCH || document.pointerLockElement === canvas || !canvas.requestPointerLock) return;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* браузер не дал захватить мышь */ }
}
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (!S.playing || S.paused) return;
  if (e.code === 'KeyE') interact();
  if (e.code === 'KeyF') toggleLight();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || !S.playing || S.paused) return;
  look(e.movementX, e.movementY, .0022);
});
function look(dx, dy, k) {
  if (S.hidden) return; // в шкафу камера смотрит только в щель
  S.yaw -= dx * k; S.pitch = Math.max(-1.45, Math.min(1.45, S.pitch - dy * k));
}
canvas.addEventListener('mousedown', () => {
  if (!S.playing || S.paused || TOUCH) return;
  if (document.pointerLockElement !== canvas) { lockPointer(); return; }
  interact();
});
document.addEventListener('pointerlockchange', () => {
  if (TOUCH) return;
  if (document.pointerLockElement !== canvas && S.playing && !S.dead && !S.won) pause(true);
});

// сенсорное управление
const stick = {id: null, x: 0, y: 0, cx: 0, cy: 0};
let touchRun = false;
const lookTouch = {id: null, x: 0, y: 0};
if (TOUCH) {
  $('keysDesk').style.display = 'none'; $('keysTouch').style.display = '';
  $('lightChip').textContent = '🔦 — фонарик';
  const st = $('stick');
  st.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; const r = st.getBoundingClientRect(); stick.id = t.identifier; stick.cx = r.left + r.width / 2; stick.cy = r.top + r.height / 2; moveStick(t); e.preventDefault(); }, {passive: false});
  addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stick.id) moveStick(t);
      if (t.identifier === lookTouch.id) { look(t.clientX - lookTouch.x, t.clientY - lookTouch.y, .006); lookTouch.x = t.clientX; lookTouch.y = t.clientY; }
    }
  }, {passive: false});
  addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stick.id) { stick.id = null; stick.x = stick.y = 0; st.firstElementChild.style.transform = ''; }
      if (t.identifier === lookTouch.id) lookTouch.id = null;
    }
  });
  canvas.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) if (t.clientX > innerWidth * .35 && lookTouch.id === null) { lookTouch.id = t.identifier; lookTouch.x = t.clientX; lookTouch.y = t.clientY; }
    e.preventDefault();
  }, {passive: false});
  $('tAct').addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); interact(); }, {passive: false});
  $('tLight').addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); toggleLight(); }, {passive: false});
  $('tPause').addEventListener('click', () => pause(true));
  $('tRun').addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); touchRun = !touchRun; $('tRun').classList.toggle('on', touchRun); }, {passive: false});
}
function moveStick(t) {
  let dx = t.clientX - stick.cx, dy = t.clientY - stick.cy;
  const len = Math.hypot(dx, dy), max = 50;
  if (len > max) { dx = dx / len * max; dy = dy / len * max; }
  stick.x = dx / max; stick.y = dy / max;
  $('stick').firstElementChild.style.transform = `translate(${dx}px, ${dy}px)`;
}

/* ---------- действия ---------- */
const ray = new THREE.Raycaster(), center = new THREE.Vector2(0, 0);
function findTarget() {
  if (S.hidden) return null;
  ray.setFromCamera(center, camera); ray.far = 2.4;
  const hit = ray.intersectObjects(interactables, false)[0];
  return hit ? hit.object.userData.act : null;
}
function promptFor(a) {
  if (!a) return '';
  const k = TOUCH ? '✋' : 'E';
  if (a.type === 'drawer') return a.open ? `${k} — закрыть ящик` : `${k} — открыть ящик`;
  if (a.type === 'wardrobe') return `${k} — спрятаться в шкаф`;
  if (a.type === 'key') return `${k} — взять ключ`;
  if (a.type === 'door') {
    if (a.door.open) return '';
    if (a.door.locked) return S.hasKey ? `${k} — открыть ключом` : 'Заперто. Ключ где-то в ящиках этой комнаты';
    return `${k} — открыть дверь`;
  }
  return '';
}
function interact() {
  if (S.hidden) { leaveWardrobe(); return; }
  const a = findTarget();
  if (!a) return;
  if (a.type === 'drawer') toggleDrawer(a);
  else if (a.type === 'wardrobe') enterWardrobe(a.wardrobe);
  else if (a.type === 'key') takeKey(a);
  else if (a.type === 'door') tryDoor(a.door, true);
}
function toggleDrawer(d) {
  d.open = !d.open; sfx.drawer();
  if (d.open && d.content && !d.content.taken) {
    setTimeout(() => {
      if (!d.open || d.content.taken) return;
      d.content.taken = true;
      if (d.contentMesh) { d.group.remove(d.contentMesh); d.contentMesh = null; }
      if (d.content.type === 'key') { S.hasKey = true; sfx.key(); toast('🔑 Ключ найден!'); }
      else if (d.content.type === 'med') { S.hp = Math.min(100, S.hp + 40); sfx.key(); toast('🩹 Аптечка: +40 ❤️'); }
      else { S.coins += d.content.n; sfx.coin(); toast(`🪙 +${d.content.n}`); }
      updateHud();
    }, 260);
  }
}
function takeKey(a) {
  if (a.taken) return;
  a.taken = true;
  world.remove(a.group);
  interactables = interactables.filter((m) => m.userData.act !== a);
  S.hasKey = true; sfx.key(); toast('🔑 Ключ найден!'); updateHud();
}
function tryDoor(door, manual) {
  if (door.open) return;
  if (door.locked) {
    if (!S.hasKey) { if (manual) { sfx.locked(); toast('🔒 Заперто — найди ключ в ящиках'); } return; }
    S.hasKey = false; door.locked = false; sfx.key(); toast('🔓 Открыто');
    // табличка без надписи «заперто»
    door.pivot.traverse((o) => { if (o.userData.plate) { o.material = new THREE.MeshBasicMaterial({map: plateTex(door.plate, false)}); } });
    updateHud();
  }
  door.open = true; door.blocker.on = false; sfx.creak();
}
function enterWardrobe(w) {
  S.hidden = w; w.target = 1; sfx.hide();
  setTimeout(() => { if (S.hidden === w) w.target = 0; }, 450);
  const p = w.g.localToWorld(new THREE.Vector3(0, 0, .2));
  S.pos.set(p.x, 0, p.z);
  S.yaw = w.g.parent.rotation.y + Math.PI; S.pitch = 0;
  // изнутри дверцы не рисуем — щель между ними показывает оверлей
  setTimeout(() => { if (S.hidden === w) w.doors.forEach((pv) => { pv.visible = false; }); }, 300);
  $('hideView').classList.add('on');
}
function leaveWardrobe() {
  const w = S.hidden; S.hidden = null; w.target = 1; sfx.hide();
  w.doors.forEach((pv) => { pv.visible = true; });
  setTimeout(() => { w.target = 0; }, 500);
  const p = w.g.localToWorld(new THREE.Vector3(0, 0, 1.0));
  S.pos.set(p.x, 0, p.z);
  $('hideView').classList.remove('on');
}
function toggleLight() { S.light = !S.light; sfx.flash(); flashlight.intensity = S.light ? 1.6 : 0; $('tLight').classList.toggle('on', S.light); }

let toastTimer = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 1600); }
function updateHud() {
  const door = Math.min(ROOMS, S.room + 1);
  $('roomChip').textContent = S.room >= ROOMS ? '🚪 Выход' : `🚪 Дверь ${String(door).padStart(3, '0')}`;
  $('coinChip').textContent = `🪙 ${S.coins}`;
  $('timeChip').textContent = `⏱ ${fmt(Math.floor(S.time))}`;
  $('hpChip').textContent = `❤️ ${Math.max(0, Math.ceil(S.hp))}`;
  $('hpChip').style.color = S.hp <= 40 ? '#ff8a8a' : '';
  $('keyChip').style.display = S.hasKey ? 'block' : 'none';
  $('lightChip').style.display = rooms[S.room] && rooms[S.room].dark ? 'block' : 'none';
}

/* ---------- Сквозняк: предупреждение, пролёт, проверка ---------- */
function onEnterRoom(i) {
  const r = rooms[i];
  if (r.visited) return;
  r.visited = true;
  S.sinceDraft++;
  if (i >= 4 && i < ROOMS - 1 && !r.dark && r.wardrobes.length && !S.draft && S.sinceDraft >= 2 && rng2() < .16 + S.sinceDraft * .05) { startDraft(i); return; }
  if (r.dark && !S.shade && rng2() < .75) spawnShade(r);
  else if (!r.dark && i >= 5 && i < ROOMS && !S.whisper && !S.draft && rng2() < .14) spawnWhisper();
}

/* Тень встаёт у дальней двери тёмной комнаты и идёт к игроку, пока на неё не светят. */
function spawnShade(r) {
  S.shade = {room: r.i, lit: 0, t: 0, hint: false};
  shadeMesh.position.set(r.outX + R(-.6, .6), 0, r.z1 + 1.1);
  shadeMesh.visible = true;
  tone(70, 1.2, 'sawtooth', .03, .8);
}
function vanishShade(reason) {
  if (!S.shade) return;
  S.shade = null; shadeMesh.visible = false;
  if (reason === 'light') { noise(.5, .08, 1800, 2); toast('🌑 Тень растворилась в свете'); }
}
const camFwd = new THREE.Vector3(), toThing = new THREE.Vector3();
function lookingAt(pos, maxAngle, maxDist) {
  camera.getWorldDirection(camFwd);
  toThing.subVectors(pos, camera.position);
  const dist = toThing.length();
  if (dist > maxDist) return false;
  return camFwd.dot(toThing.normalize()) > Math.cos(maxAngle);
}
function updateShade(dt) {
  const sh = S.shade; if (!sh) return;
  sh.t += dt;
  const r = rooms[sh.room], here = roomAt(S.pos.z);
  if (here > sh.room) { vanishShade(); return; }                // игрок прошёл дальше
  if (S.hidden) { if (sh.t > 4) vanishShade(); return; }
  const head = new THREE.Vector3(shadeMesh.position.x, 1.5, shadeMesh.position.z);
  const lit = S.light && lookingAt(head, .3, 14);
  if (lit) {
    sh.lit += dt;
    shadeMesh.position.x += (Math.random() - .5) * .04;
    if (sh.lit >= 1.3) { vanishShade('light'); return; }
  } else {
    sh.lit = Math.max(0, sh.lit - dt * .4);
    if (here === sh.room) {
      const dx = S.pos.x - shadeMesh.position.x, dz = S.pos.z - shadeMesh.position.z, d = Math.hypot(dx, dz);
      const sp = 1.15 * dt;
      shadeMesh.position.x += dx / d * sp; shadeMesh.position.z += dz / d * sp;
      shadeMesh.position.x = Math.max(r.cx - r.W / 2 + .4, Math.min(r.cx + r.W / 2 - .4, shadeMesh.position.x));
      shadeMesh.position.z = Math.max(r.z1 + .3, Math.min(r.z0 - .3, shadeMesh.position.z));
      if (!sh.hint && sh.t > 1.5 && !S.light) { sh.hint = true; toast(TOUCH ? '🌑 Здесь кто-то есть… включи 🔦' : '🌑 Здесь кто-то есть… включи фонарик (F)'); }
      if (d < .75) { vanishShade(); damage(50, 'shade'); return; }
    }
  }
  const fade = 1 - sh.lit / 1.3;
  shadeMat.opacity = .93 * fade;
  shadeMesh.lookAt(S.pos.x, 0, S.pos.z);
  shadeWisps.forEach((w, i) => { const a = sh.t * 1.5 + i; w.position.set(Math.cos(a) * .3, .3 + (i % 4) * .45, Math.sin(a) * .3); w.material.opacity = .7 * fade; });
}

/* Шёпот появляется за спиной: если обернуться и смотреть на него — бьёт. */
function spawnWhisper() {
  const back = new THREE.Vector3(Math.sin(S.yaw), 0, Math.cos(S.yaw)).multiplyScalar(2.3);
  S.whisper = {t: 0, look: 0, next: 0};
  whisperSprite.position.set(S.pos.x + back.x, 1.6, S.pos.z + back.z);
  whisperSprite.visible = true; whisperSprite.material.opacity = 0;
  toast('👤 Кто-то шепчет за спиной… не оборачивайся');
}
function updateWhisper(dt) {
  const w = S.whisper; if (!w) return;
  w.t += dt;
  if (S.hidden || S.draft) { S.whisper = null; whisperSprite.visible = false; return; }
  // держится за спиной на расстоянии пары шагов
  const dx = whisperSprite.position.x - S.pos.x, dz = whisperSprite.position.z - S.pos.z, d = Math.hypot(dx, dz);
  if (d > 2.6) { whisperSprite.position.x -= dx / d * (d - 2.6); whisperSprite.position.z -= dz / d * (d - 2.6); }
  whisperSprite.material.opacity = Math.min(.9, w.t * 1.5) * (w.t > 5 ? Math.max(0, 1 - (w.t - 5) * 2) : 1);
  w.next -= dt;
  if (w.next <= 0) { w.next = .35; noise(.3, .035, 2600 + Math.random() * 800, 4); }
  if (lookingAt(whisperSprite.position, .5, 10)) {
    w.look += dt;
    if (w.look > .45) {
      S.whisper = null; whisperSprite.visible = false;
      noise(.6, .2, 1200, .7); tone(900, .5, 'sawtooth', .07, .4);
      damage(40, 'whisper');
      return;
    }
  }
  if (w.t > 5.5) { S.whisper = null; whisperSprite.visible = false; toast('Шёпот затих…'); }
}
const rng2 = Math.random;
function startDraft(i) {
  S.sinceDraft = 0;
  // путь — только по освещённым комнатам подряд: в тёмные Сквозняк не залетает
  let from = i, to = i;
  while (from > Math.max(0, i - 3) && !rooms[from - 1].dark) from--;
  while (to < Math.min(ROOMS, i + 2) && !rooms[to + 1].dark) to++;
  const path = [];
  for (let k = from; k <= to; k++) {
    const r = rooms[k];
    path.push(new THREE.Vector3(r.cx, 1.4, (r.z0 + r.z1) / 2));
    if (k < to) path.push(new THREE.Vector3(r.outX, 1.4, r.z1));
  }
  S.draft = {phase: 'warn', t: 0, path, seg: 0, segT: 0, rooms: [from, to], warn: R(2.6, 3.6) * 1 + 0};
  startWind();
}
function updateDraft(dt) {
  const d = S.draft; if (!d) return;
  d.t += dt;
  if (d.phase === 'warn') {
    setWind(.05 + d.t * .04, 200 + d.t * 120);
    $('wind').style.opacity = Math.min(.8, d.t * .25);
    if (d.t >= d.warn) { d.phase = 'pass'; d.t = 0; monster.visible = true; monster.position.copy(d.path[0]); monsterLight.intensity = 2.2; }
    return;
  }
  // пролёт по комнатам
  let move = 17 * dt;
  while (move > 0 && d.seg < d.path.length - 1) {
    const a = d.path[d.seg], b = d.path[d.seg + 1];
    const len = a.distanceTo(b), left = len * (1 - d.segT);
    if (move < left) { d.segT += move / len; move = 0; }
    else { move -= left; d.seg++; d.segT = 0; }
  }
  if (d.seg >= d.path.length - 1) { endDraft(); return; }
  monster.position.lerpVectors(d.path[d.seg], d.path[d.seg + 1], d.segT);
  monsterLight.position.copy(monster.position);
  const r = roomAt(monster.position.z);
  if (rooms[r] && r !== 0 && r !== ROOMS) rooms[r].dark = true; // лампы гаснут там, где он пролетел
  const dist = Math.hypot(monster.position.x - S.pos.x, monster.position.z - S.pos.z);
  setWind(Math.min(.45, .6 / Math.max(1, dist * .5)), 900);
  $('wind').style.opacity = Math.min(1, .3 + 3 / Math.max(1, dist));
  // Сквозняк заполняет комнату во всю ширину: ловит, только когда проходит именно по твоей комнате
  // и поравнялся с тобой (стены соседних комнат его не пропускают).
  d.room = r;
  if (!S.hidden && r === roomAt(S.pos.z) && Math.abs(monster.position.z - S.pos.z) < .8) die('draft');
}
function endDraft() {
  S.draft = null; monster.visible = false; monsterLight.intensity = 0;
  stopWind(); $('wind').style.opacity = 0;
  if (!S.dead) toast('Пронёсся мимо…');
  updateHud();
}
const DEATHS = {
  draft: ['Тебя унёс Сквозняк', '#9fc4ff', 'Когда свет мигает и дует холодный ветер — сразу ищи шкаф и прячься, пока Сквозняк не пролетит.'],
  shade: ['Тебя забрала Тень', '#c98aff', 'В тёмных комнатах держи луч фонарика на Тени — от света она растворяется.'],
  whisper: ['Ты посмотрел на Шёпот', '#e6e0d0', 'Когда за спиной шепчут — не оборачивайся и иди дальше, он исчезнет сам.'],
};
function damage(n, cause) {
  if (S.dead) return;
  S.hp -= n;
  $('hurt').style.opacity = 1; setTimeout(() => { $('hurt').style.opacity = 0; }, 350);
  noise(.3, .12, 300, 1); tone(180, .3, 'sawtooth', .05, .5);
  updateHud();
  if (S.hp <= 0) die(cause);
}
function die(cause = 'draft') {
  if (S.dead) return;
  S.dead = true; S.playing = false; sfx.death(); stopWind();
  $('flash').style.opacity = .8; setTimeout(() => { $('flash').style.opacity = 0; }, 180);
  document.exitPointerLock?.();
  const [title, color, tip] = DEATHS[cause] || DEATHS.draft;
  $('deadTitle').textContent = title; $('deadTitle').style.color = color;
  $('deadText').textContent = `Ты дошёл до двери ${String(Math.min(ROOMS, S.maxRoom + 1)).padStart(3, '0')} за ${fmt(Math.floor(S.time))}. ${tip}`;
  setTimeout(() => show('dead'), 700);
  setHud(false);
  lbStatus = 'deadStatus';
  lb.submit({new_door: S.maxRoom, new_time: null});
}
function win() {
  S.won = true; S.playing = false; sfx.win(); document.exitPointerLock?.();
  const best = store.get('hotel-best', null);
  const t = Math.round(S.time);
  const better = !best || t < best.time;
  if (better) store.set('hotel-best', {time: t, coins: Math.max(S.coins, best ? best.coins : 0)});
  else if (S.coins > best.coins) store.set('hotel-best', {...best, coins: S.coins});
  $('winText').textContent = `Время: ${fmt(t)} · Монет: ${S.coins} из ${coinsTotal}${better ? ' · новый рекорд!' : ''}`;
  show('win'); setHud(false);
  lbStatus = 'winStatus';
  lb.submit({new_door: ROOMS, new_time: t});
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/* ---------- экраны ---------- */
const SCREENS = ['start', 'pause', 'dead', 'win'];
function show(id) { SCREENS.forEach((s) => $(s).classList.toggle('on', s === id)); }
function setHud(on) {
  $('hud').classList.toggle('on', on); $('cross').style.display = on && !TOUCH ? 'block' : 'none';
  $('touch').classList.toggle('on', on && TOUCH);
  if (!on) $('prompt').textContent = '';
}
function pause(on) {
  if (S.dead || S.won) return;
  S.paused = on; show(on ? 'pause' : null); setHud(!on);
  if (on) $('pauseText').textContent = `Время в отеле: ${fmt(Math.floor(S.time))} · дверь ${String(Math.min(ROOMS, S.maxRoom + 1)).padStart(3, '0')}. ${TOUCH ? 'Нажми «Продолжить».' : 'Нажми, чтобы вернуться в отель.'}`;
  if (!on) lockPointer();
}
function begin() {
  audio(); startHum();
  newGame(); show(null); setHud(true); lockPointer();
}
$('playBtn').onclick = begin;
$('againBtn').onclick = begin;
$('winAgainBtn').onclick = begin;
$('resumeBtn').onclick = () => pause(false);
$('restartBtn').onclick = begin;
(function showBest() {
  const b = store.get('hotel-best', null);
  $('bestText').textContent = b ? `Лучший побег: ${fmt(b.time)} · монет: ${b.coins}` : '';
})();

/* ---------- физика игрока ---------- */
function collide(p) {
  for (let it = 0; it < 2; it++) {
    for (const c of colliders) {
      if (!c.on) continue;
      const nx = Math.max(c.x0, Math.min(p.x, c.x1)), nz = Math.max(c.z0, Math.min(p.z, c.z1));
      const dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
      if (d2 >= PR * PR) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2), push = PR - d; p.x += dx / d * push; p.z += dz / d * push; }
      else {
        // центр внутри коробки — выталкиваем по ближайшей стороне
        const opts = [[p.x - c.x0 + PR, -1, 0], [c.x1 - p.x + PR, 1, 0], [p.z - c.z0 + PR, 0, -1], [c.z1 - p.z + PR, 0, 1]].sort((a, b) => a[0] - b[0])[0];
        p.x += opts[1] * opts[0]; p.z += opts[2] * opts[0];
      }
    }
  }
}
const tmp = new THREE.Vector3();
function updatePlayer(dt) {
  if (S.hidden) return;
  let fx = 0, fz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) fz += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) fz -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) fx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) fx += 1;
  if (stick.id !== null) { fx += stick.x; fz -= stick.y; }
  const len = Math.hypot(fx, fz);
  if (len > 1) { fx /= len; fz /= len; }
  const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') || touchRun) ? RUN : WALK;
  const sin = Math.sin(S.yaw), cos = Math.cos(S.yaw);
  const vx = (-sin * fz + cos * fx) * speed, vz = (-cos * fz - sin * fx) * speed;
  S.pos.x += vx * dt; S.pos.z += vz * dt;
  collide(S.pos);
  const moving = len > .1;
  if (moving) {
    S.bob += dt * speed * 2.6;
    S.stepT -= dt; if (S.stepT <= 0) { sfx.step(); S.stepT = speed > WALK ? .32 : .45; }
  }
  // двери открываются, когда подходишь
  for (const d of doors) {
    if (d.open) continue;
    if (Math.abs(S.pos.z - d.z) < 1.3 && Math.abs(S.pos.x - d.x) < .9) {
      if (!d.locked || S.hasKey) tryDoor(d, false);
    }
  }
  const r = roomAt(S.pos.z);
  if (r !== S.room) {
    S.room = r; S.maxRoom = Math.max(S.maxRoom, r);
    if (S.maxRoom > store.get('hotel-far', 0)) store.set('hotel-far', S.maxRoom);
    onEnterRoom(r); updateHud();
  }
  if (S.pos.z < rooms[ROOMS].z1 - .4) win();
}

/* ---------- кадр ---------- */
let last = performance.now(), flick = 1;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (S.playing && !S.paused) {
    const sec = Math.floor(S.time);
    S.time += dt;
    if (Math.floor(S.time) !== sec) $('timeChip').textContent = `⏱ ${fmt(Math.floor(S.time))}`;
    updatePlayer(dt);
    updateDraft(dt);
    updateShade(dt);
    updateWhisper(dt);
    const t = findTarget();
    if (t !== lookTarget) { lookTarget = t; }
    $('prompt').textContent = S.hidden ? '' : promptFor(t);
    if (TOUCH) $('tAct').classList.toggle('ready', !!t || !!S.hidden);
  }
  if (!world) { renderer.render(scene, camera); return; }
  // двери и ящики
  for (const d of doors) { d.angle += ((d.open ? 1.75 : 0) - d.angle) * Math.min(1, dt * 5); d.pivot.rotation.y = d.angle; }
  for (const r of rooms) {
    for (const drawers of r.dressers) for (const a of drawers) { a.t += ((a.open ? 1 : 0) - a.t) * Math.min(1, dt * 10); a.group.position.z = a.t * .34; }
    for (const w of r.wardrobes) { w.open += (w.target - w.open) * Math.min(1, dt * 9); w.doors.forEach((pv) => { pv.rotation.y = pv.userData.side * w.open * 1.2; }); }
  }
  // свет: мигает перед Сквозняком
  const warn = S.draft && S.draft.phase === 'warn';
  flick = warn ? (Math.random() < .35 ? .08 : 1) : 1;
  const near = [S.room - 1, S.room, S.room + 1, S.room + 2];
  roomLights.forEach((l, i) => {
    const r = rooms[near[i]];
    if (!r || r.dark) { l.intensity = 0; return; }
    l.position.set(r.cx, H - .35, (r.z0 + r.z1) / 2);
    l.intensity = (r.i === ROOMS ? 1.5 : 1.15) * flick;
    l.color.setHex(r.i === ROOMS ? 0xbfffd0 : 0xffd29a);
  });
  for (const r of rooms) if (r.fixture) r.fixture.material = r.dark ? mat(0x3a352c) : flick < 1 && Math.abs(r.i - S.room) < 3 ? mat(0x6a5a40) : mat(0xf6e6c0, {emissive: 0xb08a4a});
  // монстр
  if (monster.visible) {
    const t = now / 1000;
    // клубы тянутся от стены до стены текущей комнаты — видно, что спрятаться можно только в шкафу
    const mr = rooms[S.draft ? S.draft.room ?? roomAt(monster.position.z) : 0];
    const half = mr ? mr.W / 2 - .3 : 2;
    const left = mr ? mr.cx - half - monster.position.x : -2, span = half * 2;
    puffs.forEach((p, i) => { const u = p.userData; const k = (i / puffs.length + t * .15 * u.sp) % 1; p.position.set(left + k * span, u.y * 1.4 + Math.sin(t * 3 + u.a) * .2, Math.sin(u.a + t * u.sp) * .35); const s = u.s * 1.3 * (1 + Math.sin(t * 5 + u.a) * .15); p.scale.set(s, s, 1); p.material.rotation = t * u.sp; });
    eyes.forEach((e) => { e.material.opacity = .7 + Math.random() * .3; });
  }
  mp.send(mpState());
  updateGhosts();
  // камера
  const bobY = S.hidden ? 0 : Math.sin(S.bob) * .035;
  camera.position.set(S.pos.x, EYE + bobY, S.pos.z);
  camera.rotation.set(S.pitch, S.yaw, 0);
  renderer.render(scene, camera);
}

/* ---------- аккаунты, таблицы лидеров, мультиплеер ---------- */
let lbStatus = 'deadStatus';
const lb = FreasyLeaderboard({
  key: 'hotel',
  boards: [
    {id: 'door', title: 'Дальше всех', column: 'best_door', order: 'desc', note: 'До какой двери дошёл игрок. 30 — выбрался из отеля.', format: (v) => v >= ROOMS ? 'выход 🚪' : `дверь ${String(v).padStart(3, '0')}`},
    {id: 'time', title: 'Быстрее всех', column: 'best_time', order: 'asc', note: 'Время побега из отеля.', format: (v) => fmt(v)},
  ],
  bests: () => { const b = store.get('hotel-best', null); return b ? {new_door: ROOMS, new_time: b.time} : {new_door: store.get('hotel-far', 0), new_time: null}; },
  onStatus: (text) => { const el = $(lbStatus); if (el) el.textContent = text; },
});
const mp = FreasyMultiplayer({
  key: 'hotel', sessionKey: 'hotel-session', boardTop: 110,
  describe: (s) => s.st !== 'play' ? 'в лобби' : s.won ? 'выбрался 🚪' : s.dead ? `пал у двери ${String(s.door).padStart(3, '0')}` : `дверь ${String(s.door).padStart(3, '0')} · ❤️${s.hp}`,
});
// Игроки в одной комнате мультиплеера получают одинаковый отель (новый каждый день), чтобы видеть друг друга.
function sharedSeed() {
  if (!mp.enabled()) return 0;
  const day = new Date().toISOString().slice(0, 10);
  let h = 2166136261;
  for (const c of mp.room() + '|' + day) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return (h & 0x7fffffff) || 7;
}
function mpState() {
  if (!S.playing && !S.dead && !S.won) return {st: 'menu'};
  return {st: 'play', seed: S.seed, x: +S.pos.x.toFixed(2), z: +S.pos.z.toFixed(2), yaw: +S.yaw.toFixed(2), door: Math.min(ROOMS, S.maxRoom + 1), hp: Math.max(0, Math.ceil(S.hp)), dead: S.dead ? 1 : 0, won: S.won ? 1 : 0, hid: S.hidden ? 1 : 0};
}
// Другие игроки — полупрозрачные постояльцы с ником над головой.
const ghosts = new Map();
const nameCache = new Map();
function nameTex(name, color) {
  const k = name + color;
  if (nameCache.has(k)) return nameCache.get(k);
  const t = canvasTex(256, 64, (g) => { g.font = '800 34px Manrope, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeStyle = '#000a'; g.strokeText(name, 128, 34); g.fillStyle = color; g.fillText(name, 128, 34); });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; nameCache.set(k, t); return t;
}
function ghostFor(p) {
  let g = ghosts.get(p.id);
  if (g) return g;
  const root = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({color: p.color, transparent: true, opacity: .55, emissive: new THREE.Color(p.color).multiplyScalar(.25)});
  mesh(new THREE.CylinderGeometry(.22, .26, 1.1, 10), m, 0, .75, 0, root);
  mesh(new THREE.SphereGeometry(.2, 12, 10), m, 0, 1.5, 0, root);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({map: nameTex(p.name, p.color), transparent: true, depthWrite: false}));
  label.scale.set(1.2, .3, 1); label.position.y = 2.0; root.add(label);
  scene.add(root);
  g = {root, label, name: p.name};
  ghosts.set(p.id, g);
  return g;
}
function updateGhosts() {
  const seen = new Set();
  for (const p of mp.peers()) {
    const s = p.s;
    if (s.st !== 'play' || s.seed !== S.seed || s.dead || s.won || !S.playing) continue;
    seen.add(p.id);
    const g = ghostFor(p);
    if (g.name !== p.name) { g.label.material.map = nameTex(p.name, p.color); g.name = p.name; }
    g.root.visible = !s.hid;
    g.root.position.set(s.x, 0, s.z); g.root.rotation.y = s.yaw;
  }
  for (const [id, g] of ghosts) if (!seen.has(id)) { scene.remove(g.root); ghosts.delete(id); }
}
function updateMpText() {
  $('mpText').textContent = mp.enabled() ? `👥 Мультиплеер включён · комната «${mp.room()}» — у всех в ней один и тот же отель` : '';
}
for (const id of ['lbBtn', 'pauseLbBtn', 'deadLbBtn', 'winLbBtn']) $(id).onclick = () => { document.exitPointerLock?.(); lb.open(); };
$('mpBtn').onclick = () => { audio(); mp.openSettings(); };
setInterval(updateMpText, 1000); updateMpText();
// Пока открыто окно лидеров или настроек, клавиши не должны управлять игрой.
addEventListener('keydown', (e) => { if (lb.isOpen() || mp.settingsOpen()) keys.clear(); }, true);

// фон стартового экрана: лобби отеля
build(12345);
S.pos.set(rooms[0].cx, 0, rooms[0].z0 - 6.5);
S.yaw = 0; S.pitch = .05;
requestAnimationFrame(frame);
