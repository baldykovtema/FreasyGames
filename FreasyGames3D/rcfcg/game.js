'use strict';
// RCFCG 3D — Random Color Cube Fill Game в 3D для FreasyGames 3D.
// У каждого куба 6 одинаковых граней (одна текстура на все стороны), кубы можно крутить мышкой/пальцем.
// Аккаунты — общий Supabase-проект FreasyGames «PVZ-Webgame» (ник@pvz-game.com), статистика в rcfcg3d_scores.

/* ================= Настройки ================= */
const SB_URL = 'https://ywqxrbmgmvpbeytxjkpi.supabase.co';
const SB_KEY = 'sb_publishable_igyJK68YpyJYo-0KNrVZPA_rm6_gIRg';
const EMAIL_DOMAIN = '@pvz-game.com', OLD_EMAIL_DOMAIN = '@memecat-game.com';
const SESSION_KEY = 'freasy3d-session';

const MAX_CUBES = 21;
const LINE_COUNT = 80;
const FILL_TIME = 3000;
const GAP = 10;
const FACE_SIZE = 256;
const UNLOCKS = [0, 0, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2500000, 5000000, 10000000, 25000000];
const AUTO_CLICK_INTERVALS = [1000, 900, 800, 700, 600, 500, 400, 300, 200, 100, 50, 10];
const DONUT_INTERVAL = 5 * 60 * 1000, GOLDEN_DONUT_INTERVAL = 15 * 60 * 1000;
const DONUT_BOOST_DURATION = 60 * 1000, DONUT_VISIBLE_DURATION = 15 * 1000;

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ================= Состояние ================= */
const emptyStats = () => ({ bestPercentage: 0, dominantColor: 'white', totalPlaySeconds: 0, cubesCompleted: 0, bestColors: [] });
let session = null;
let stats = emptyStats();
let cubes = [];
let addingCube = false;
let donutBoostActive = false, goldenDonutBoostActive = false;
let autoClickActive = false, autoClickTimer = null;
let playTimer = null, lastPlayTick = Date.now();
let saving = false, saveAgain = false;
let registrationMode = false;

/* ================= Утилиты ================= */
function formatTime(seconds) {
  seconds = Math.floor(seconds);
  const d = Math.floor(seconds / 86400); seconds %= 86400;
  const h = Math.floor(seconds / 3600); seconds %= 3600;
  const m = Math.floor(seconds / 60), s = seconds % 60;
  if (d > 0) return `${d}д ${h}ч`;
  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m}м ${s}с`;
  return `${s}с`;
}
function randomColor(hue) {
  if (hue === undefined) hue = Math.floor(Math.random() * 360);
  const sat = (75 + Math.random() * 25).toFixed(1), light = (50 + Math.random() * 20).toFixed(1);
  return { css: `hsl(${hue},${sat}%,${light}%)`, hue };
}
function generateColors() {
  const colors = [];
  if (donutBoostActive || goldenDonutBoostActive) {
    // Бонус пончика: часть полосок одного оттенка → шанс большого процента x2.5 (золотой — x5)
    const hue = Math.floor(Math.random() * 360);
    const count = Math.floor(LINE_COUNT * (goldenDonutBoostActive ? 0.4 : 0.2));
    for (let i = 0; i < LINE_COUNT; i++) colors.push(i < count ? randomColor(hue) : randomColor());
    // Перемешиваем, чтобы одинаковые полоски были по всей грани
    for (let i = colors.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [colors[i], colors[j]] = [colors[j], colors[i]]; }
    return colors;
  }
  for (let i = 0; i < LINE_COUNT; i++) colors.push(randomColor());
  return colors;
}
const cssOf = (c) => (typeof c === 'string' ? c : c.css);

function getDominantColor(colors) {
  const groups = [];
  colors.forEach((color) => {
    let found = null;
    for (const g of groups) {
      let diff = Math.abs(color.hue - g.hue); diff = Math.min(diff, 360 - diff);
      if (diff <= 5) { found = g; break; }
    }
    if (found) found.count++; else groups.push({ hue: color.hue, count: 1, css: color.css });
  });
  groups.sort((a, b) => b.count - a.count);
  return groups[0];
}

// Рисует одну грань куба: четыре треугольника заливаются полосками от краёв к центру.
function drawFace(ctx, size, colors, progress) {
  ctx.fillStyle = '#07080f';
  ctx.fillRect(0, 0, size, size);
  if (!colors || colors.length !== LINE_COUNT) return;
  const c = size / 2, lh = size / LINE_COUNT;
  const clip = (a, b, d) => { ctx.save(); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.clip(); };
  const reach = (pos) => c * (1 - Math.abs(pos + lh / 2 - c) / c) * progress;

  clip([0, 0], [c, c], [0, size]);
  for (let i = 0; i < LINE_COUNT; i++) { const y = i * lh; ctx.fillStyle = cssOf(colors[i]); ctx.fillRect(0, y, reach(y), lh + 1); }
  ctx.restore();

  clip([size, 0], [c, c], [size, size]);
  for (let i = 0; i < LINE_COUNT; i++) { const y = i * lh, w = reach(y); ctx.fillStyle = cssOf(colors[(i + 20) % LINE_COUNT]); ctx.fillRect(size - w, y, w, lh + 1); }
  ctx.restore();

  clip([0, 0], [size, 0], [c, c]);
  for (let i = 0; i < LINE_COUNT; i++) { const x = i * lh; ctx.fillStyle = cssOf(colors[(i + 40) % LINE_COUNT]); ctx.fillRect(x, 0, lh + 1, reach(x)); }
  ctx.restore();

  clip([0, size], [c, c], [size, size]);
  for (let i = 0; i < LINE_COUNT; i++) { const x = i * lh, h = reach(x); ctx.fillStyle = cssOf(colors[(i + 60) % LINE_COUNT]); ctx.fillRect(x, size - h, lh + 1, h); }
  ctx.restore();

  if (progress >= 1) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(c, c, size / 120, 0, Math.PI * 2); ctx.fill(); }
}

/* ================= Supabase ================= */
function loadSession() { try { const x = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); return x && x.access_token ? x : null; } catch { return null; } }
function setSession(x) {
  session = x && x.access_token ? { access_token: x.access_token, refresh_token: x.refresh_token, expires_at: x.expires_at || Math.floor(Date.now() / 1000) + (x.expires_in || 3600), user: x.user } : null;
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* приватный режим */ }
}
function errorText(data, status) {
  const raw = (data && (data.msg || data.message || data.error_description || data.error)) || `Ошибка ${status}`;
  if (/invalid login credentials/i.test(raw)) return 'Неверный ник или пароль';
  if (/already registered|already exists/i.test(raw)) return 'Такой ник уже занят';
  if (raw.includes('rcfcg3d_') || (data && ['PGRST205', 'PGRST202', '42P01'].includes(data.code))) return 'Таблица RCFCG 3D ещё не включена на сервере';
  if (/rate limit/i.test(raw)) return 'Слишком много попыток, подожди немного';
  return raw;
}
async function sb(path, { method = 'GET', body, auth = true, keepalive = false } = {}) {
  const headers = { apikey: SB_KEY, 'Content-Type': 'application/json' };
  if (auth && session) { await refreshSession(); if (session) headers.Authorization = 'Bearer ' + session.access_token; }
  let res;
  try { res = await fetch(SB_URL + path, { method, headers, keepalive, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw new Error('Нет связи с сервером. Проверь интернет'); }
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (!res.ok) throw new Error(errorText(data, res.status));
  return data;
}
async function refreshSession() {
  if (!session || session.expires_at * 1000 > Date.now() + 60000) return;
  try { setSession(await sb('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token }, auth: false })); }
  catch { setSession(null); }
}
const username = () => (session && session.user && session.user.user_metadata && session.user.user_metadata.username) || 'Игрок';
const userId = () => session && session.user && session.user.id;
const isAdmin = () => !!session && username().toLowerCase() === 'updatetest';

/* ================= Статистика ================= */
const playerStatsName = $('playerStatsName'), bestPercentageStat = $('bestPercentageStat');
const playTimeStat = $('playTimeStat'), cubesCompletedStat = $('cubesCompletedStat'), unlockInfo = $('unlockInfo');

function getMaxCubes() {
  if (isAdmin()) return MAX_CUBES;
  let unlocked = 1;
  for (let i = 2; i <= MAX_CUBES; i++) { if (stats.cubesCompleted >= UNLOCKS[i]) unlocked = i; else break; }
  return unlocked;
}
function updateUnlockInfo() {
  if (isAdmin()) { unlockInfo.textContent = 'updatetest: доступны все 21 куб'; return; }
  const max = getMaxCubes();
  if (max >= MAX_CUBES) { unlockInfo.textContent = 'Открыты все 21 куб'; return; }
  unlockInfo.textContent = `До открытия ${max + 1}-го куба: ${Math.max(0, UNLOCKS[max + 1] - stats.cubesCompleted)}`;
}
function updateStatsUI() {
  playerStatsName.textContent = username();
  bestPercentageStat.textContent = stats.bestPercentage + '%';
  bestPercentageStat.style.color = stats.dominantColor || 'white';
  playTimeStat.textContent = formatTime(stats.totalPlaySeconds);
  cubesCompletedStat.textContent = stats.cubesCompleted.toLocaleString('ru-RU');
  updateUnlockInfo();
  updateButtons();
}
async function loadPlayerStats() {
  stats = emptyStats();
  try {
    const rows = await sb(`/rest/v1/rcfcg3d_scores?select=best_percentage,dominant_color,colors,total_play_seconds,cubes_completed&user_id=eq.${userId()}`);
    const r = rows && rows[0];
    if (r) {
      stats.bestPercentage = Number(r.best_percentage) || 0;
      stats.dominantColor = r.dominant_color || 'white';
      stats.totalPlaySeconds = Number(r.total_play_seconds) || 0;
      stats.cubesCompleted = Number(r.cubes_completed) || 0;
      stats.bestColors = Array.isArray(r.colors) ? r.colors : [];
    }
    unlockInfo.title = '';
  } catch (e) {
    console.error('Stats load:', e);
    unlockInfo.title = e.message;
  }
  updateStatsUI();
}
function statsPayload() {
  return {
    new_percentage: Number(stats.bestPercentage) || 0,
    new_color: stats.dominantColor || 'white',
    new_colors: stats.bestColors.length === LINE_COUNT ? stats.bestColors : [],
    new_seconds: Math.floor(stats.totalPlaySeconds) || 0,
    new_cubes: Math.floor(stats.cubesCompleted) || 0,
  };
}
// Сервер хранит лучшие значения игрока, так что повторная отправка безопасна.
async function savePlayerStats() {
  if (!session) return;
  if (saving) { saveAgain = true; return; }
  saving = true;
  try { await sb('/rest/v1/rpc/rcfcg3d_save', { method: 'POST', body: statsPayload() }); }
  catch (e) { console.error('Stats save:', e); }
  saving = false;
  if (saveAgain) { saveAgain = false; savePlayerStats(); }
}
let lastQuickSave = 0;
function saveSoon() { // не чаще раза в 2 секунды при автокликере
  const now = Date.now();
  if (now - lastQuickSave < 2000) return;
  lastQuickSave = now; savePlayerStats();
}
function tickPlayTime() {
  const now = Date.now(), delta = Math.floor((now - lastPlayTick) / 1000);
  if (delta > 0) { stats.totalPlaySeconds += delta; lastPlayTick += delta * 1000; updateStatsUI(); }
}
function startPlayTimer() {
  if (playTimer) return;
  lastPlayTick = Date.now();
  let n = 0;
  playTimer = setInterval(() => { tickPlayTime(); if (++n % 10 === 0) savePlayerStats(); }, 1000);
}
function stopPlayTimer() { if (playTimer) { tickPlayTime(); clearInterval(playTimer); playTimer = null; } }

/* ================= 3D ================= */
const glCanvas = $('gl');
let renderer = null, scene, camera, cubeGeo, edgeGeo;
try {
  renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.setScissorTest(true);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0, 5);
  scene.add(new THREE.AmbientLight(0xffffff, 0.72));
  const sun = new THREE.DirectionalLight(0xffffff, 0.5); sun.position.set(2.5, 3.5, 4); scene.add(sun);
  cubeGeo = new THREE.BoxGeometry(1.45, 1.45, 1.45);
  edgeGeo = new THREE.EdgesGeometry(cubeGeo);
} catch (e) {
  renderer = null;
  console.error('WebGL:', e);
}

const cubesContainer = $('cubes');
const START_TILT = new THREE.Euler(0.45, -0.62, 0);

function createCube() {
  const el = document.createElement('div');
  el.className = 'cube';
  const pct = document.createElement('div');
  pct.className = 'percentage'; pct.textContent = '0%';
  el.appendChild(pct);
  cubesContainer.appendChild(el);

  const face = document.createElement('canvas');
  face.width = face.height = FACE_SIZE;
  const ctx = face.getContext('2d');
  const data = {
    element: el, percentage: pct, face, ctx, colors: generateColors(), progress: 0,
    start: null, counted: false, showPercentage: false, dirty: true,
    vel: { x: 0, y: 0 }, drag: null, mesh: null, texture: null,
  };
  if (renderer) {
    data.texture = new THREE.CanvasTexture(face);
    data.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    // Один материал на все 6 граней — грани одинаковые
    const mat = new THREE.MeshLambertMaterial({ map: data.texture });
    data.mesh = new THREE.Mesh(cubeGeo, mat);
    data.mesh.add(new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 })));
    data.mesh.quaternion.setFromEuler(START_TILT);
    data.mesh.visible = false;
    scene.add(data.mesh);
  }
  attachDrag(data);
  cubes.push(data);
  return data;
}
function destroyCube(data) {
  data.element.remove();
  if (data.mesh) { scene.remove(data.mesh); data.mesh.material.dispose(); data.mesh.children[0].material.dispose(); data.texture.dispose(); }
}

// Вращение куба: тянем мышкой/пальцем, после отпускания крутится по инерции.
const axisX = new THREE.Vector3(1, 0, 0), axisY = new THREE.Vector3(0, 1, 0), tmpQ = new THREE.Quaternion();
function rotateMesh(mesh, dx, dy) {
  if (!mesh) return;
  tmpQ.setFromAxisAngle(axisY, dx); mesh.quaternion.premultiply(tmpQ);
  tmpQ.setFromAxisAngle(axisX, dy); mesh.quaternion.premultiply(tmpQ);
}
// Поворот кубов можно выключить галочкой «Крутить кубы» — тогда они стоят в обычном положении.
let rotateEnabled = true;
try { rotateEnabled = localStorage.getItem('freasy3d-rotate-off') !== '1'; } catch { /* приватный режим */ }
function applyRotateSetting() {
  const box = document.getElementById('rotateCheckbox');
  if (box) box.checked = rotateEnabled;
  for (const c of cubes) {
    c.element.style.cursor = rotateEnabled ? '' : 'default';
    if (!rotateEnabled) { c.drag = null; c.vel.x = c.vel.y = 0; if (c.mesh) c.mesh.quaternion.setFromEuler(START_TILT); }
  }
  const hint = document.getElementById('dragHint');
  if (hint) hint.style.display = rotateEnabled ? '' : 'none';
}
function attachDrag(data) {
  const el = data.element;
  if (!rotateEnabled) el.style.cursor = 'default';
  el.addEventListener('pointerdown', (e) => {
    if (!rotateEnabled) return;
    try { el.setPointerCapture(e.pointerId); } catch { /* указатель уже отпущен */ }
    data.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    data.vel.x = data.vel.y = 0;
    hideDragHint();
  });
  el.addEventListener('pointermove', (e) => {
    const d = data.drag;
    if (!d || d.id !== e.pointerId) return;
    const size = Math.max(60, el.clientWidth);
    const k = 3.2 / size;
    const dx = (e.clientX - d.x) * k, dy = (e.clientY - d.y) * k;
    const now = performance.now(), dt = Math.max(1, now - d.t);
    rotateMesh(data.mesh, dx, dy);
    data.vel.x = dx / dt * 16; data.vel.y = dy / dt * 16;
    d.x = e.clientX; d.y = e.clientY; d.t = now;
  });
  const end = (e) => {
    if (!data.drag || data.drag.id !== e.pointerId) return;
    if (performance.now() - data.drag.t > 80) data.vel.x = data.vel.y = 0;
    data.drag = null;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('dblclick', () => { if (data.mesh) { data.mesh.quaternion.setFromEuler(START_TILT); data.vel.x = data.vel.y = 0; } });
}
let hintHidden = false;
function hideDragHint() { if (hintHidden) return; hintHidden = true; $('dragHint').style.opacity = '0'; }

function startFill(data) {
  data.counted = false;
  data.showPercentage = false;
  data.percentage.style.display = 'none';
  data.percentage.textContent = '0%';
  if (fastModeCheckbox.checked) { data.progress = 1; data.start = null; data.dirty = true; completeCube(data); return; }
  data.progress = 0; data.start = performance.now(); data.dirty = true;
}

function completeCube(data) {
  if (data.counted || data.progress < 1) return;
  data.counted = true;
  stats.cubesCompleted++;
  const dominant = getDominantColor(data.colors);
  const percentage = Math.round(dominant.count / LINE_COUNT * 100);
  data.percentage.textContent = percentage + '%';
  data.percentage.style.color = dominant.css;
  data.percentage.style.display = 'block';
  data.showPercentage = true;
  if (percentage > stats.bestPercentage) {
    stats.bestPercentage = percentage;
    stats.dominantColor = dominant.css;
    stats.bestColors = data.colors.map(cssOf);
    lastQuickSave = 0;
  }
  updateStatsUI();
  saveSoon();
}

// Каждый куб рисуется в своей клетке: один общий WebGL-холст, у каждого куба свой scissor-прямоугольник.
let glW = 0, glH = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const visible = gameScreen.style.display === 'block';
  for (const c of cubes) {
    if (c.start !== null) {
      c.progress = Math.min((now - c.start) / FILL_TIME, 1);
      c.dirty = true;
      if (c.progress >= 1) { c.start = null; completeCube(c); }
    }
    if (c.dirty && visible) { drawFace(c.ctx, FACE_SIZE, c.colors, c.progress); if (c.texture) c.texture.needsUpdate = true; c.dirty = false; }
    if (!c.drag && (c.vel.x || c.vel.y)) {
      rotateMesh(c.mesh, c.vel.x, c.vel.y);
      c.vel.x *= 0.94; c.vel.y *= 0.94;
      if (Math.abs(c.vel.x) + Math.abs(c.vel.y) < 0.0004) c.vel.x = c.vel.y = 0;
    }
  }
  if (!renderer) return;
  const w = window.innerWidth, h = window.innerHeight;
  if (w !== glW || h !== glH) { glW = w; glH = h; renderer.setSize(w, h, false); }
  renderer.setScissor(0, 0, w, h); renderer.setViewport(0, 0, w, h); renderer.clear();
  if (!visible) return;
  for (const c of cubes) c.mesh.visible = false;
  for (const c of cubes) {
    const r = c.element.getBoundingClientRect();
    if (r.width < 2 || r.bottom < 0 || r.top > h || r.right < 0 || r.left > w) continue;
    const y = h - r.bottom;
    renderer.setViewport(r.left, y, r.width, r.height);
    renderer.setScissor(r.left, y, r.width, r.height);
    camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
    c.mesh.visible = true;
    renderer.render(scene, camera);
    c.mesh.visible = false;
  }
}

function updateLayout() {
  const count = cubes.length;
  if (!count) return;
  const area = $('gameArea');
  const aw = area.clientWidth, ah = area.clientHeight;
  let bestCols = 1, bestRows = count, bestSize = 0;
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const size = Math.floor(Math.min((aw - GAP * (cols - 1)) / cols, (ah - GAP * (rows - 1)) / rows));
    if (size > bestSize) { bestSize = size; bestCols = cols; bestRows = rows; }
  }
  bestSize = Math.max(bestSize, 30);
  cubesContainer.style.gridTemplateColumns = `repeat(${bestCols},${bestSize}px)`;
  cubesContainer.style.gridTemplateRows = `repeat(${bestRows},${bestSize}px)`;
}

/* ================= Кнопки и режимы ================= */
const addButton = $('addCube'), removeButton = $('removeCube'), restartButton = $('restart');
const fastModeCheckbox = $('fastModeCheckbox'), autoClickCheckbox = $('autoClickCheckbox'), disableAllCheckbox = $('disableAllCheckbox');
const leaderboardButton = $('leaderboardButton');

const isAutoClickAllowed = () => getMaxCubes() > 10; // автокликер — когда открыто больше 10 кубов
function getAutoClickInterval() {
  const count = cubes.length;
  if (count < 10) return AUTO_CLICK_INTERVALS[0];
  return AUTO_CLICK_INTERVALS[Math.min(count - 10, AUTO_CLICK_INTERVALS.length - 1)];
}
function updateButtons() {
  const count = cubes.length, max = getMaxCubes();
  addButton.textContent = `Добавить куб ${count}/${max}`;
  addButton.disabled = addingCube || count >= max;
  removeButton.style.display = count >= 2 ? 'inline-flex' : 'none';
  removeButton.disabled = false;
  leaderboardButton.disabled = false;
  const autoAvailable = isAutoClickAllowed() && fastModeCheckbox.checked;
  autoClickCheckbox.disabled = !autoAvailable;
  if (!autoAvailable) {
    stopAutoClicker();
    $('autoClickMode').title = !isAutoClickAllowed() ? 'Нужно больше 10 открытых кубов' : 'Нужен быстрый режим';
  } else {
    $('autoClickMode').title = `Скорость: 1 клик / ${(getAutoClickInterval() / 1000).toLocaleString('ru-RU')} сек`;
  }
  if (disableAllCheckbox.checked) { addButton.disabled = true; removeButton.disabled = true; leaderboardButton.disabled = true; }
}
function restartAll() {
  cubes.forEach((c) => { c.colors = generateColors(); startFill(c); });
}
function autoClickTick() {
  if (!autoClickActive) return;
  if (!fastModeCheckbox.checked || !isAutoClickAllowed()) { stopAutoClicker(); return; }
  if ($('donut').style.display === 'block') regularDonut.collect();
  if ($('goldenDonut').style.display === 'block') goldenDonut.collect();
  restartAll();
}
function startAutoClicker() {
  if (autoClickTimer) return;
  autoClickActive = true; autoClickCheckbox.checked = true;
  autoClickTick();
  autoClickTimer = setInterval(autoClickTick, getAutoClickInterval());
}
function stopAutoClicker() {
  autoClickActive = false;
  if (autoClickTimer) { clearInterval(autoClickTimer); autoClickTimer = null; }
  autoClickCheckbox.checked = false;
}
function restartAutoClickTimer() {
  if (!autoClickActive) return;
  clearInterval(autoClickTimer);
  autoClickTimer = setInterval(autoClickTick, getAutoClickInterval());
}

addButton.addEventListener('click', () => {
  if (addingCube || cubes.length >= getMaxCubes() || cubes.length >= MAX_CUBES) { updateButtons(); return; }
  addingCube = true; updateButtons();
  const cube = createCube();
  updateLayout();
  startFill(cube);
  setTimeout(() => { addingCube = false; updateButtons(); restartAutoClickTimer(); }, 250);
});
removeButton.addEventListener('click', () => {
  if (cubes.length <= 1) return;
  destroyCube(cubes.pop());
  updateLayout(); updateButtons(); restartAutoClickTimer();
});
restartButton.addEventListener('click', restartAll);
fastModeCheckbox.addEventListener('change', () => {
  if (!fastModeCheckbox.checked) stopAutoClicker();
  cubes.forEach(startFill);
  updateButtons();
});
autoClickCheckbox.addEventListener('change', () => {
  if (autoClickCheckbox.checked) {
    if (!fastModeCheckbox.checked || !isAutoClickAllowed()) { autoClickCheckbox.checked = false; return; }
    startAutoClicker();
  } else stopAutoClicker();
});
disableAllCheckbox.addEventListener('change', updateButtons);
$('rotateCheckbox').addEventListener('change', (e) => {
  rotateEnabled = e.target.checked;
  try { localStorage.setItem('freasy3d-rotate-off', rotateEnabled ? '0' : '1'); } catch { /* приватный режим */ }
  applyRotateSetting();
});
window.addEventListener('resize', updateLayout);

/* ================= Пончики ================= */
const donutBoostInfo = $('donutBoostInfo');
const formatDonutTime = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function updateBoostInfo() {
  donutBoostInfo.style.display = donutBoostActive || goldenDonutBoostActive ? 'block' : 'none';
  donutBoostInfo.textContent = goldenDonutBoostActive ? 'Золотой 🍩 Бонус: шанс x5.0!' : '🍩 Бонус: шанс x2.5!';
}
function createDonutSpawner(id, timerId, interval, golden) {
  const element = $(id), timer = $(timerId), label = golden ? 'Золотой 🍩' : '🍩';
  let spawnTimer, hideTimer, boostTimer, countdown = null, nextTime = 0;
  const updateTimer = () => { timer.textContent = `${label} ${formatDonutTime(nextTime - Date.now())}`; };
  function schedule() { clearTimeout(spawnTimer); nextTime = Date.now() + interval; updateTimer(); spawnTimer = setTimeout(show, interval); }
  function show() {
    if (!session) return;
    clearTimeout(spawnTimer); clearTimeout(hideTimer);
    nextTime = Date.now();
    element.style.display = 'block'; updateTimer();
    hideTimer = setTimeout(() => { element.style.display = 'none'; schedule(); }, DONUT_VISIBLE_DURATION);
  }
  function collect() {
    if (!session || element.style.display !== 'block') return;
    clearTimeout(hideTimer);
    element.style.display = 'none';
    if (golden) goldenDonutBoostActive = true; else donutBoostActive = true;
    updateBoostInfo();
    clearTimeout(boostTimer);
    boostTimer = setTimeout(() => { if (golden) goldenDonutBoostActive = false; else donutBoostActive = false; updateBoostInfo(); }, DONUT_BOOST_DURATION);
    schedule();
  }
  element.addEventListener('click', collect);
  element.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); collect(); } });
  return {
    show, collect,
    start() { if (countdown) return; schedule(); countdown = setInterval(updateTimer, 1000); },
    stop() {
      clearTimeout(spawnTimer); clearTimeout(hideTimer); clearTimeout(boostTimer); clearInterval(countdown); countdown = null;
      element.style.display = 'none'; timer.textContent = `${label} --:--`;
    },
  };
}
const regularDonut = createDonutSpawner('donut', 'donutTimer', DONUT_INTERVAL, false);
const goldenDonut = createDonutSpawner('goldenDonut', 'goldenDonutTimer', GOLDEN_DONUT_INTERVAL, true);
function stopDonuts() { regularDonut.stop(); goldenDonut.stop(); donutBoostActive = goldenDonutBoostActive = false; updateBoostInfo(); }
$('spawnDonutButton').addEventListener('click', () => { if (isAdmin()) regularDonut.show(); });
$('spawnGoldenDonutButton').addEventListener('click', () => { if (isAdmin()) goldenDonut.show(); });

/* ================= Экраны и вход ================= */
const authScreen = $('authScreen'), gameScreen = $('game'), lbScreen = $('leaderboardScreen');
const authForm = $('authBox'), usernameInput = $('usernameInput'), passwordInput = $('passwordInput');
const loginButton = $('loginButton'), registerButton = $('registerButton'), backToLogin = $('backToLogin');
const registerText = $('registerText'), authMessage = $('authMessage');

function showScreen(which) {
  authScreen.style.display = which === 'auth' ? 'grid' : 'none';
  gameScreen.style.display = which === 'game' ? 'block' : 'none';
  lbScreen.style.display = which === 'lb' ? 'flex' : 'none';
}
function showGame() {
  showScreen('game');
  $('adminPanel').style.display = isAdmin() ? 'block' : 'none';
  updateStatsUI();
  startPlayTimer();
  regularDonut.start(); goldenDonut.start();
  updateLayout();
  cubes.forEach((c) => { c.dirty = true; });
}
function showAuth() {
  showScreen('auth');
  stopDonuts(); stopAutoClicker(); stopPlayTimer();
}
function enterRegistrationMode() {
  registrationMode = true;
  $('authTitle').innerHTML = 'Регистрация';
  loginButton.style.display = 'none'; registerText.style.display = 'none';
  registerButton.textContent = 'Создать аккаунт';
  registerButton.classList.replace('ghost', 'primary');
  backToLogin.style.display = 'block';
  passwordInput.value = ''; passwordInput.autocomplete = 'new-password';
  authMessage.textContent = '';
}
function exitRegistrationMode() {
  registrationMode = false;
  $('authTitle').innerHTML = 'RCFCG <span>3D</span>';
  loginButton.style.display = ''; registerText.style.display = '';
  registerButton.textContent = 'Зарегистрироваться';
  registerButton.classList.replace('primary', 'ghost');
  backToLogin.style.display = 'none';
  passwordInput.autocomplete = 'current-password';
  authMessage.textContent = '';
}
async function enterGame() {
  authMessage.textContent = '';
  passwordInput.value = '';
  await loadPlayerStats();
  restartAll();
  showGame();
}
async function doAuth(kind) {
  const name = usernameInput.value.trim(), pass = passwordInput.value;
  if (!/^[A-Za-z0-9_]{3,30}$/.test(name)) { authMessage.textContent = 'Ник: 3–30 символов, латиница, цифры или _'; return; }
  if (pass.length < 6) { authMessage.textContent = 'Пароль должен быть от 6 символов'; return; }
  authMessage.textContent = kind === 'signup' ? 'Создаём аккаунт…' : 'Входим…';
  loginButton.disabled = registerButton.disabled = true;
  const login = (email) => sb('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: pass }, auth: false });
  try {
    const x = kind === 'signup'
      ? await sb('/auth/v1/signup', { method: 'POST', body: { email: name.toLowerCase() + EMAIL_DOMAIN, password: pass, data: { username: name } }, auth: false })
      // Старые аккаунты Мемного Кота сделаны с другим адресом
      : await login(name.toLowerCase() + EMAIL_DOMAIN).catch((e) => login(name.toLowerCase() + OLD_EMAIL_DOMAIN).catch(() => { throw e; }));
    if (!x || !x.access_token) { authMessage.textContent = 'Аккаунт создан, теперь нажми «Войти»'; exitRegistrationMode(); return; }
    setSession(x);
    if (registrationMode) exitRegistrationMode();
    await enterGame();
  } catch (e) {
    authMessage.textContent = e.message;
  } finally {
    loginButton.disabled = registerButton.disabled = false;
  }
}
authForm.addEventListener('submit', (e) => { e.preventDefault(); doAuth(registrationMode ? 'signup' : 'login'); });
registerButton.addEventListener('click', () => { if (!registrationMode) enterRegistrationMode(); else doAuth('signup'); });
backToLogin.addEventListener('click', exitRegistrationMode);
usernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); passwordInput.focus(); } });

$('logoutButton').addEventListener('click', async () => {
  stopPlayTimer();
  await savePlayerStats();
  try { await sb('/auth/v1/logout', { method: 'POST' }); } catch { /* выходим локально */ }
  setSession(null);
  while (cubes.length > 1) destroyCube(cubes.pop());
  stats = emptyStats();
  fastModeCheckbox.checked = false; disableAllCheckbox.checked = false;
  usernameInput.value = ''; passwordInput.value = '';
  exitRegistrationMode();
  showAuth();
});

/* ================= Таблица лидеров ================= */
const LB_MODES = {
  percentage: { column: 'best_percentage', value: (r) => `${r.best_percentage}%` },
  time: { column: 'total_play_seconds', value: (r) => formatTime(r.total_play_seconds) },
  cubes: { column: 'cubes_completed', value: (r) => `${Number(r.cubes_completed).toLocaleString('ru-RU')} кубов` },
};
let lbRequest = 0;
const faceUrlCanvas = document.createElement('canvas');
faceUrlCanvas.width = faceUrlCanvas.height = 140;
function faceUrl(colors) {
  drawFace(faceUrlCanvas.getContext('2d'), 140, Array.isArray(colors) && colors.length === LINE_COUNT ? colors : null, 1);
  return faceUrlCanvas.toDataURL();
}
async function loadLeaderboard(mode) {
  document.querySelectorAll('.lbTab').forEach((t) => t.classList.toggle('active', t.dataset.mode === mode));
  const msg = $('leaderboardMessage'), podium = $('podium'), list = $('lbList');
  msg.textContent = 'Загрузка…'; podium.innerHTML = ''; list.innerHTML = '';
  const req = ++lbRequest, m = LB_MODES[mode];
  try {
    const rows = await sb(`/rest/v1/rcfcg3d_scores?select=user_id,username,best_percentage,dominant_color,colors,total_play_seconds,cubes_completed&${m.column}=gt.0&order=${m.column}.desc,updated_at.asc&limit=10`, { auth: false });
    if (req !== lbRequest) return;
    msg.textContent = rows.length ? '' : 'Пока нет результатов. Стань первым!';
    const places = ['first', 'second', 'third'], rankColors = ['#ffd700', '#c0c0c0', '#cd7f32'];
    podium.innerHTML = rows.slice(0, 3).map((r, i) => {
      const url = faceUrl(r.colors);
      const faces = Array.from({ length: 6 }, () => `<i style="background-image:url(${url})"></i>`).join('');
      const color = mode === 'percentage' && r.dominant_color ? r.dominant_color : '';
      return `<div class="lbSlot ${places[i]}${r.user_id === userId() ? ' me' : ''}">
        <div class="lbRank" style="color:${rankColors[i]}">${i + 1}</div>
        <div class="lbStage"><div class="lbCube" style="animation-delay:${-i * 3}s">${faces}</div></div>
        <div class="lbName">${esc(r.username)}</div>
        <div class="lbValue"${color ? ` style="color:${esc(color)}"` : ''}>${esc(m.value(r))}</div></div>`;
    }).join('');
    list.innerHTML = rows.slice(3).map((r) => `<li${r.user_id === userId() ? ' class="me"' : ''}>${esc(r.username)}<b>${esc(m.value(r))}</b></li>`).join('');
  } catch (e) { if (req === lbRequest) msg.textContent = e.message; }
}
leaderboardButton.addEventListener('click', () => {
  savePlayerStats();
  showScreen('lb');
  loadLeaderboard('percentage');
});
document.querySelectorAll('.lbTab').forEach((t) => t.addEventListener('click', () => loadLeaderboard(t.dataset.mode)));
$('leaderboardBack').addEventListener('click', () => { showScreen('game'); updateLayout(); cubes.forEach((c) => { c.dirty = true; }); });

/* ================= Старт ================= */
window.addEventListener('pagehide', () => {
  if (!session) return;
  tickPlayTime();
  fetch(SB_URL + '/rest/v1/rpc/rcfcg3d_save', {
    method: 'POST', keepalive: true, body: JSON.stringify(statsPayload()),
    headers: { apikey: SB_KEY, 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
  }).catch(() => {});
});

createCube();
updateLayout();
applyRotateSetting();
requestAnimationFrame(frame);

(async () => {
  session = loadSession();
  if (session) {
    await refreshSession();
    if (session) { await enterGame(); return; }
  }
  showAuth();
})();
