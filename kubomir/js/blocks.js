'use strict';
// Кубомир: блоки, предметы и процедурный атлас текстур 16×16 (всё рисуется кодом, своих картинок нет).
const KM = window.KM = {};

// ---------- атлас ----------
KM.TS = 16; KM.ACOLS = 16; KM.AROWS = 7;
const T = {}; // имя плитки → номер
const TILE_NAMES = ('grass_top grass_side dirt stone cobble sand water log_side log_top leaves planks glass coal_ore iron_ore gold_ore crystal_ore ' +
  'bedrock brick table_top table_side furnace_front furnace_side chest_front chest_side torch lava snow snow_side pine_leaves flower_red flower_blue tallgrass ' +
  'hellrock ember_ore glowstone dark_brick ash cloudstone skygrass_top skygrass_side storm_ore temple altar altar_used portal_deep portal_sky lever_off lever_on ' +
  'wire_off wire_on lamp_off lamp_on door_closed door_open piston_side piston_front bomb_side bomb_top button plate piston_head wool gravel pine_log ' +
  'stick coal iron_ingot gold_ingot crystal ember feather apple meat_raw meat_cooked heart_stone fire_core storm_crown bread wheat seeds ' +
  'pick0 pick1 pick2 pick3 axe0 axe1 axe2 axe3 shovel0 shovel1 shovel2 shovel3 sword0 sword1 sword2 sword3 ' +
  'cactus_side cactus_top farmland wheat_crop ice obsidian_crk mushroom spawner_x crack0 crack1 crack2 crack3 sign_x bow arrow ladder').split(' ');
TILE_NAMES.forEach((n, i) => { T[n] = i; });
KM.T = T;

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }

KM.buildAtlas = function () {
  const S = KM.TS, cv = document.createElement('canvas');
  cv.width = S * KM.ACOLS; cv.height = S * KM.AROWS;
  const g = cv.getContext('2d');
  const img = g.createImageData(cv.width, cv.height), D = img.data;
  let ox = 0, oy = 0, R = rng(1);
  const px = (x, y, c, a = 255) => { if (x < 0 || y < 0 || x >= S || y >= S) return; const i = ((oy + y) * cv.width + ox + x) * 4; D[i] = c[0]; D[i + 1] = c[1]; D[i + 2] = c[2]; D[i + 3] = a; };
  const get = (x, y) => { const i = ((oy + y) * cv.width + ox + x) * 4; return [D[i], D[i + 1], D[i + 2], D[i + 3]]; };
  const vary = (c, v) => { const k = 1 + (R() - 0.5) * v; return c.map((q) => Math.max(0, Math.min(255, Math.round(q * k)))); };
  const fill = (col, v = 0.18) => { const c = hex(col); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, vary(c, v)); };
  const clear = () => { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, [0, 0, 0], 0); };
  const dots = (col, n, v = 0.15, size = 1) => { const c = hex(col); for (let i = 0; i < n; i++) { const x = (R() * S) | 0, y = (R() * S) | 0; for (let a = 0; a < size; a++) for (let b = 0; b < size; b++) px(x + a, y + b, vary(c, v)); } };
  const blobs = (col, n, v = 0.12) => { const c = hex(col); for (let i = 0; i < n; i++) { const x = 1 + (R() * (S - 4)) | 0, y = 1 + (R() * (S - 4)) | 0; const w = 2 + (R() * 2 | 0), h = 2 + (R() * 2 | 0); for (let a = 0; a < w; a++) for (let b = 0; b < h; b++) if (!((a === 0 || a === w - 1) && (b === 0 || b === h - 1)) || R() < 0.4) px(x + a, y + b, vary(c, v)); } };
  const rect = (x, y, w, h, col, v = 0.08, a = 255) => { const c = hex(col); for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) px(x + i, y + j, vary(c, v), a); };
  const frame = (col) => { rect(0, 0, S, 1, col, 0.05); rect(0, S - 1, S, 1, col, 0.05); rect(0, 0, 1, S, col, 0.05); rect(S - 1, 0, 1, S, col, 0.05); };
  const bricks = (base, mortar, bh = 4, bw = 8) => { fill(mortar, 0.08); for (let r = 0; r < S / bh; r++) { const off = r % 2 ? bw / 2 : 0; for (let c = -1; c < S / bw + 1; c++) rect(c * bw + off + 1, r * bh + 1, bw - 1, bh - 1, base, 0.16); } };
  const line = (x0, y0, x1, y1, col, v = 0.1) => { const c = hex(col), n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) + 1; for (let i = 0; i < n; i++) { const t = n === 1 ? 0 : i / (n - 1); px(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), vary(c, v)); } };
  const tool = (kind, tier) => {
    clear(); const head = ['#b08a52', '#8d8d93', '#e6e6ee', '#62e8d0'][tier], handle = '#7a5530';
    line(3, 13, 10, 6, handle, 0.05); line(4, 13, 11, 6, handle, 0.05);
    if (kind === 'pick') { line(5, 3, 12, 3, head); line(4, 4, 13, 4, head); px(4, 5, hex(head)); px(13, 5, hex(head)); px(3, 6, hex(head)); px(14, 6, hex(head)); line(9, 4, 11, 7, head); }
    if (kind === 'axe') { rect(9, 2, 4, 6, head, 0.1); rect(8, 3, 1, 4, head, 0.1); rect(13, 3, 1, 3, head, 0.1); }
    if (kind === 'shovel') { rect(10, 2, 4, 5, head, 0.1); px(11, 7, hex(head)); px(12, 7, hex(head)); }
    if (kind === 'sword') { clear(); line(3, 13, 6, 10, handle, 0.05); line(2, 10, 6, 14, '#5a3b20', 0.05); for (let i = 0; i < 9; i++) { px(6 + i, 9 - i, hex(head)); px(7 + i, 9 - i, hex(head)); } }
  };
  const ore = (spot) => { fill('#7d7d82', 0.12); blobs('#6c6c72', 4); for (let i = 0; i < 5; i++) { const x = 1 + (R() * 12) | 0, y = 1 + (R() * 12) | 0; rect(x, y, 2, 2, spot, 0.15); px(x + 2, y + 1, hex(spot)); } };
  const item = (fn) => { clear(); fn(); };
  const P = {
    grass_top: () => { fill('#5aa83c', 0.2); dots('#79c652', 26); dots('#3f8a2a', 18); },
    grass_side: () => { fill('#8a5c3a', 0.18); dots('#6e4529', 16); for (let x = 0; x < S; x++) { const h = 3 + (R() * 3 | 0); for (let y = 0; y < h; y++) px(x, y, vary(hex('#5aa83c'), 0.2)); } },
    dirt: () => { fill('#8a5c3a', 0.18); dots('#6e4529', 22); dots('#a3714a', 10); },
    stone: () => { fill('#808087', 0.1); blobs('#6e6e75', 6); dots('#93939a', 14); },
    cobble: () => { fill('#5f5f66', 0.05); for (let i = 0; i < 9; i++) { const x = (i % 3) * 5 + (R() * 2 | 0), y = ((i / 3) | 0) * 5 + (R() * 2 | 0); rect(x, y, 4 + (R() * 2 | 0), 4, R() < 0.5 ? '#8d8d94' : '#7a7a81', 0.12); } },
    sand: () => { fill('#e2d29a', 0.08); dots('#cbb97e', 26); dots('#f2e4b4', 12); },
    water: () => { fill('#2f6fd0', 0.08); for (let y = 2; y < S; y += 4) for (let x = 0; x < S; x++) if ((x + y) % 7 < 3) px(x, y, hex('#5d95ea')); },
    log_side: () => { fill('#7a5230', 0.08); for (let x = 0; x < S; x += 3) rect(x, 0, 1, S, '#5c3c20', 0.12); dots('#94683f', 10); },
    log_top: () => { fill('#c09460', 0.06); for (let r = 7; r > 0; r -= 2) for (let a = 0; a < 40; a++) { const t = a / 40 * Math.PI * 2; px(Math.round(7.5 + Math.cos(t) * r), Math.round(7.5 + Math.sin(t) * r), hex('#9c7244')); } frame('#6e4a29'); },
    leaves: () => { clear(); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (R() < 0.82) px(x, y, vary(hex(R() < 0.3 ? '#3d8a2c' : '#4c9f37'), 0.25)); },
    pine_leaves: () => { clear(); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (R() < 0.8) px(x, y, vary(hex('#2e6b3c'), 0.25)); },
    planks: () => { fill('#b5854e', 0.06); for (let y = 0; y < S; y += 4) { rect(0, y + 3, S, 1, '#7d5631', 0.05); const k = (y / 4) % 2 ? 4 : 11; rect(k, y, 1, 3, '#8d6239', 0.05); } dots('#c69660', 10); },
    glass: () => { clear(); frame('#d8f0ff'); line(3, 3, 6, 6, '#ffffff'); line(9, 11, 11, 13, '#ffffff'); for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) if (!get(x, y)[3]) px(x, y, [200, 230, 255], 40); },
    coal_ore: () => ore('#222226'), iron_ore: () => ore('#d6a27c'), gold_ore: () => ore('#ffd447'), crystal_ore: () => ore('#58f0d6'),
    bedrock: () => { fill('#3b3b40', 0.3); blobs('#222226', 8); dots('#5d5d63', 10); },
    brick: () => bricks('#a5523b', '#cfc4b6'),
    table_top: () => { P.planks(); frame('#6e4a29'); rect(3, 3, 10, 10, '#a77744', 0.05); line(3, 8, 12, 8, '#6e4a29'); line(8, 3, 8, 12, '#6e4a29'); },
    table_side: () => { P.planks(); rect(0, 0, S, 3, '#6e4a29', 0.1); rect(2, 6, 4, 6, '#8d8d93', 0.1); rect(9, 5, 2, 8, '#7a5530', 0.1); rect(8, 5, 4, 2, '#8d8d93', 0.1); },
    furnace_side: () => { fill('#6f6f76', 0.1); blobs('#5d5d63', 5); frame('#4d4d53'); },
    furnace_front: () => { P.furnace_side(); rect(4, 8, 8, 6, '#1b1b1f', 0.05); rect(5, 11, 6, 2, '#ff8a2a', 0.2); rect(4, 3, 8, 2, '#4d4d53', 0.05); },
    chest_side: () => { fill('#a8743c', 0.08); frame('#5c3c20'); rect(0, 5, S, 1, '#5c3c20', 0.05); },
    chest_front: () => { P.chest_side(); rect(7, 4, 2, 4, '#d8d8de', 0.05); },
    torch: () => { clear(); rect(7, 6, 2, 10, '#7a5530', 0.08); rect(6, 3, 4, 4, '#ffcf4a', 0.15); rect(7, 2, 2, 2, '#fff2a0', 0.1); },
    lava: () => { fill('#e2541c', 0.15); blobs('#ffb02e', 6, 0.2); dots('#ff7a1a', 18); },
    snow: () => { fill('#f2f6fb', 0.04); dots('#dce6f0', 14); },
    snow_side: () => { P.dirt(); for (let x = 0; x < S; x++) { const h = 3 + (R() * 3 | 0); for (let y = 0; y < h; y++) px(x, y, vary(hex('#f2f6fb'), 0.05)); } },
    flower_red: () => { clear(); line(8, 8, 8, 15, '#3f8a2a'); line(7, 12, 5, 10, '#3f8a2a'); rect(6, 3, 5, 5, '#e8344a', 0.1); rect(8, 5, 1, 1, '#ffd447', 0); },
    flower_blue: () => { clear(); line(8, 8, 8, 15, '#3f8a2a'); line(9, 12, 11, 10, '#3f8a2a'); rect(6, 3, 5, 5, '#5b8cff', 0.1); rect(8, 5, 1, 1, '#ffffff', 0); },
    tallgrass: () => { clear(); for (let i = 0; i < 9; i++) { const x = 1 + (R() * 14) | 0, h = 5 + (R() * 9) | 0; line(x, 15, x + (R() < 0.5 ? -1 : 1), 15 - h, R() < 0.5 ? '#5aa83c' : '#4c9f37', 0.2); } },
    hellrock: () => { fill('#7a2f2a', 0.18); blobs('#5e211d', 6); dots('#9c4038', 14); },
    ember_ore: () => { P.hellrock(); for (let i = 0; i < 5; i++) { const x = 1 + (R() * 12) | 0, y = 1 + (R() * 12) | 0; rect(x, y, 2, 2, '#ffb02e', 0.2); } },
    glowstone: () => { fill('#f7c95a', 0.12); blobs('#fff0a8', 6); dots('#c98f2a', 16); },
    dark_brick: () => bricks('#3a1f24', '#1e1013'),
    ash: () => { fill('#5a5052', 0.15); dots('#3e3638', 22); dots('#7a6e70', 10); },
    cloudstone: () => { fill('#dfe7f5', 0.06); blobs('#c8d4ea', 6); dots('#ffffff', 12); },
    skygrass_top: () => { fill('#7fe0c8', 0.15); dots('#a6f2de', 20); dots('#5cc4ab', 14); },
    skygrass_side: () => { P.cloudstone(); for (let x = 0; x < S; x++) { const h = 3 + (R() * 3 | 0); for (let y = 0; y < h; y++) px(x, y, vary(hex('#7fe0c8'), 0.15)); } },
    storm_ore: () => { P.cloudstone(); for (let i = 0; i < 5; i++) { const x = 1 + (R() * 12) | 0, y = 1 + (R() * 12) | 0; rect(x, y, 2, 2, '#8a6cff', 0.15); } },
    temple: () => { bricks('#9b9686', '#6d6a5e', 8, 8); dots('#7f7b6c', 8); },
    altar: () => { fill('#4b4560', 0.1); frame('#ffd447'); rect(5, 5, 6, 6, '#c34bff', 0.2); rect(7, 7, 2, 2, '#ffffff', 0.05); },
    altar_used: () => { fill('#4b4560', 0.1); frame('#7a6c3a'); rect(5, 5, 6, 6, '#3a3348', 0.2); },
    portal_deep: () => { fill('#2a0c12', 0.2); for (let r = 2; r < 8; r += 2) for (let a = 0; a < 30; a++) { const t = a / 30 * 6.28; px(Math.round(7.5 + Math.cos(t) * r), Math.round(7.5 + Math.sin(t) * r), hex(r % 4 ? '#ff6a2a' : '#ffb02e')); } },
    portal_sky: () => { fill('#0c1a3a', 0.2); for (let r = 2; r < 8; r += 2) for (let a = 0; a < 30; a++) { const t = a / 30 * 6.28; px(Math.round(7.5 + Math.cos(t) * r), Math.round(7.5 + Math.sin(t) * r), hex(r % 4 ? '#7fe0ff' : '#c9a8ff')); } },
    lever_off: () => { clear(); rect(4, 11, 8, 4, '#77777e', 0.1); line(8, 11, 4, 4, '#7a5530'); rect(3, 3, 2, 2, '#5a5a62', 0); },
    lever_on: () => { clear(); rect(4, 11, 8, 4, '#77777e', 0.1); line(8, 11, 12, 4, '#7a5530'); rect(11, 3, 2, 2, '#ff4a3a', 0); },
    wire_off: () => { clear(); rect(0, 7, S, 2, '#6b2d1f', 0.1); rect(7, 0, 2, S, '#6b2d1f', 0.1); },
    wire_on: () => { clear(); rect(0, 7, S, 2, '#ff5a2a', 0.1); rect(7, 0, 2, S, '#ff5a2a', 0.1); rect(6, 6, 4, 4, '#ffd447', 0.1); },
    lamp_off: () => { fill('#5a4a32', 0.1); frame('#3a2e1e'); rect(3, 3, 10, 10, '#7a6a48', 0.1); },
    lamp_on: () => { fill('#ffd77a', 0.1); frame('#c98f2a'); rect(3, 3, 10, 10, '#fff4c8', 0.08); },
    door_closed: () => { fill('#9c6b3a', 0.06); frame('#5c3c20'); rect(2, 2, 12, 5, '#b5854e', 0.05); rect(2, 9, 12, 5, '#b5854e', 0.05); rect(11, 7, 2, 2, '#d8d8de', 0); },
    door_open: () => { clear(); frame('#5c3c20'); rect(1, 0, 2, S, '#5c3c20', 0.05); },
    piston_side: () => { fill('#6f6f76', 0.1); rect(0, 0, S, 4, '#b5854e', 0.06); frame('#4d4d53'); },
    piston_front: () => { P.planks(); rect(5, 5, 6, 6, '#8d8d93', 0.08); },
    piston_head: () => { P.planks(); frame('#5c3c20'); },
    bomb_side: () => { fill('#a43a2a', 0.1); rect(0, 5, S, 6, '#e8e2c8', 0.04); for (let x = 2; x < S; x += 4) rect(x, 6, 2, 4, '#222', 0); },
    bomb_top: () => { fill('#a43a2a', 0.1); rect(6, 6, 4, 4, '#222226', 0.05); },
    button: () => { fill('#808087', 0.1); rect(5, 6, 6, 4, '#a5a5ad', 0.05); frame('#6e6e75'); },
    plate: () => { fill('#808087', 0.1); rect(2, 2, 12, 12, '#9a9aa2', 0.05); },
    wool: () => { fill('#ecebe4', 0.08); dots('#d6d4c8', 30); },
    gravel: () => { fill('#7b746f', 0.1); dots('#5c5652', 30, 0.15, 2); dots('#9a948e', 14); },
    pine_log: () => { fill('#4e3420', 0.08); for (let x = 1; x < S; x += 3) rect(x, 0, 1, S, '#3a2516', 0.12); },
    cactus_side: () => { fill('#3e8a3a', 0.1); for (let x = 2; x < S; x += 4) rect(x, 0, 1, S, '#2e6b2a', 0.1); dots('#e8e2c8', 6); },
    cactus_top: () => { fill('#4c9f45', 0.1); frame('#2e6b2a'); },
    farmland: () => { fill('#5c3c22', 0.12); for (let y = 1; y < S; y += 3) rect(0, y, S, 1, '#4a2f1a', 0.05); },
    wheat_crop: () => { clear(); for (let i = 0; i < 6; i++) { const x = 1 + i * 2.6 | 0; line(x, 15, x, 4, '#c9a64a', 0.15); rect(x - 1, 3, 2, 3, '#e6c35a', 0.1); } },
    ice: () => { fill('#a8d4ff', 0.06); line(2, 3, 7, 8, '#ffffff'); line(9, 10, 13, 14, '#e6f4ff'); },
    obsidian_crk: () => { fill('#1f1530', 0.2); dots('#3c2a5c', 18); },
    mushroom: () => { clear(); rect(7, 9, 2, 6, '#e8e2c8', 0.05); rect(4, 5, 8, 4, '#c8402e', 0.1); px(6, 6, [255, 255, 255]); px(9, 7, [255, 255, 255]); },
    spawner_x: () => { clear(); frame('#333'); },
    crack0: () => { clear(); line(7, 7, 10, 4, '#000000'); }, crack1: () => { clear(); line(3, 9, 12, 5, '#000000'); line(7, 7, 9, 13, '#000000'); },
    crack2: () => { clear(); line(1, 9, 14, 3, '#000000'); line(7, 7, 9, 15, '#000000'); line(4, 2, 8, 7, '#000000'); line(10, 9, 15, 12, '#000000'); },
    crack3: () => { clear(); for (let i = 0; i < 7; i++) line(R() * 16 | 0, R() * 16 | 0, R() * 16 | 0, R() * 16 | 0, '#000000'); },
    sign_x: () => clear(),
    ladder: () => { clear(); rect(2, 0, 2, S, '#7a5530', 0.06); rect(12, 0, 2, S, '#7a5530', 0.06); for (let y = 2; y < S; y += 4) rect(2, y, 12, 2, '#9c6b3a', 0.06); },
    // предметы
    stick: () => item(() => { line(4, 13, 11, 3, '#7a5530', 0.05); line(5, 13, 12, 3, '#9c6b3a', 0.05); }),
    coal: () => item(() => { rect(4, 5, 8, 7, '#222226', 0.2); rect(5, 4, 5, 9, '#2c2c31', 0.2); }),
    iron_ingot: () => item(() => { rect(2, 7, 12, 5, '#d8d8de', 0.08); rect(3, 6, 10, 1, '#f2f2f6', 0.03); }),
    gold_ingot: () => item(() => { rect(2, 7, 12, 5, '#ffd447', 0.08); rect(3, 6, 10, 1, '#fff2a0', 0.03); }),
    crystal: () => item(() => { for (let y = 0; y < 10; y++) { const w = y < 4 ? y + 1 : 10 - y; rect(8 - w, 3 + y, w * 2, 1, y < 4 ? '#a8fff0' : '#58f0d6', 0.1); } }),
    ember: () => item(() => { rect(5, 5, 6, 6, '#ff7a1a', 0.2); rect(6, 4, 4, 8, '#ffb02e', 0.2); rect(7, 6, 2, 2, '#fff2a0', 0); }),
    feather: () => item(() => { line(3, 13, 12, 2, '#d8d0ff'); for (let i = 0; i < 7; i++) line(4 + i, 10 - i, 7 + i, 12 - i, '#9a86ff', 0.1); }),
    apple: () => item(() => { rect(4, 6, 8, 7, '#d8283a', 0.1); rect(5, 5, 6, 9, '#e8344a', 0.1); rect(8, 2, 1, 4, '#5c3c20', 0); rect(9, 3, 3, 2, '#4c9f37', 0); }),
    meat_raw: () => item(() => { rect(3, 5, 10, 7, '#e86a6a', 0.1); rect(4, 6, 3, 3, '#f2c8c8', 0.05); }),
    meat_cooked: () => item(() => { rect(3, 5, 10, 7, '#8a4a2a', 0.1); rect(4, 6, 3, 3, '#c98a5a', 0.05); }),
    bread: () => item(() => { rect(2, 7, 12, 5, '#c98a3a', 0.1); rect(3, 6, 10, 1, '#e0a65a', 0.05); }),
    wheat: () => item(() => { for (let i = 0; i < 3; i++) { line(5 + i * 2, 14, 7 + i * 2, 3, '#c9a64a'); rect(6 + i * 2, 2, 2, 4, '#e6c35a', 0.1); } }),
    seeds: () => item(() => { for (let i = 0; i < 6; i++) rect(3 + (R() * 9 | 0), 4 + (R() * 9 | 0), 2, 2, '#7a9a3a', 0.1); }),
    heart_stone: () => item(() => { rect(3, 4, 4, 4, '#9b9686', 0.1); rect(9, 4, 4, 4, '#9b9686', 0.1); rect(3, 7, 10, 3, '#9b9686', 0.1); rect(5, 10, 6, 2, '#9b9686', 0.1); rect(7, 12, 2, 1, '#9b9686', 0); rect(6, 6, 4, 3, '#ffd447', 0.1); }),
    fire_core: () => item(() => { for (let r = 6; r > 0; r--) rect(8 - r, 8 - r, r * 2, r * 2, ['#7a1a0a', '#c8341a', '#ff6a2a', '#ffb02e', '#ffe08a', '#fff8d8'][6 - r], 0.08); }),
    storm_crown: () => item(() => { rect(2, 8, 12, 5, '#ffd447', 0.08); for (const x of [2, 7, 12]) rect(x, 4, 2, 4, '#ffd447', 0.08); rect(7, 9, 2, 2, '#8a6cff', 0); }),
    bow: () => item(() => { for (let i = 0; i < 10; i++) px(3 + i, 12 - i + Math.round(Math.sin(i / 9 * Math.PI) * -2), hex('#7a5530')); line(3, 12, 13, 2, '#e8e2c8', 0); }),
    arrow: () => item(() => { line(3, 13, 12, 4, '#9c6b3a'); rect(11, 3, 3, 3, '#8d8d93', 0.05); rect(2, 12, 3, 2, '#ecebe4', 0.05); }),
  };
  for (const k of [0, 1, 2, 3]) { P['pick' + k] = () => tool('pick', k); P['axe' + k] = () => tool('axe', k); P['shovel' + k] = () => tool('shovel', k); P['sword' + k] = () => tool('sword', k); }
  TILE_NAMES.forEach((n, i) => { ox = (i % KM.ACOLS) * S; oy = ((i / KM.ACOLS) | 0) * S; R = rng(1234 + i * 977); (P[n] || clear)(); });
  g.putImageData(img, 0, 0);
  KM.atlasCanvas = cv;
  return cv;
};

// ---------- блоки ----------
// t: [верх, бок, низ]; shape: cube | cross | flat | liquid | thin; alpha: 0 непрозрачный, 1 вырез, 2 полупрозрачный
const B = KM.B = [];
let BI = 0;
function blk(name, n, tiles, o = {}) {
  const id = BI++;
  const t = Array.isArray(tiles) ? tiles.map((x) => T[x]) : [T[tiles], T[tiles], T[tiles]];
  if (t.length === 2) t.push(t[0]);
  B[id] = Object.assign({ id, key: name, n, t, shape: 'cube', solid: true, alpha: 0, hard: 1, tool: null, tier: -1, drop: id, light: 0, stack: 64 }, o);
  KM[name.toUpperCase()] = id;
  return id;
}
blk('air', 'Воздух', 'sign_x', { solid: false, alpha: 3, hard: 0, drop: 0 });
blk('grass', 'Трава', ['grass_top', 'grass_side', 'dirt'], { hard: 0.6, tool: 'shovel', drop: 'dirt' });
blk('dirt', 'Земля', 'dirt', { hard: 0.5, tool: 'shovel' });
blk('stone', 'Камень', 'stone', { hard: 2.2, tool: 'pick', tier: 0, drop: 'cobble' });
blk('cobble', 'Булыжник', 'cobble', { hard: 2.4, tool: 'pick', tier: 0 });
blk('sand', 'Песок', 'sand', { hard: 0.5, tool: 'shovel' });
blk('water', 'Вода', 'water', { shape: 'liquid', solid: false, alpha: 2, hard: -1, drop: 0 });
blk('log', 'Бревно', ['log_top', 'log_side'], { hard: 1.6, tool: 'axe' });
blk('leaves', 'Листва', 'leaves', { alpha: 1, hard: 0.25, drop: 0 });
blk('planks', 'Доски', 'planks', { hard: 1.4, tool: 'axe' });
blk('glass', 'Стекло', 'glass', { alpha: 1, hard: 0.4, drop: 0 });
blk('coal_ore', 'Угольная руда', 'coal_ore', { hard: 2.8, tool: 'pick', tier: 0, drop: 'coal' });
blk('iron_ore', 'Железная руда', 'iron_ore', { hard: 3.2, tool: 'pick', tier: 1 });
blk('gold_ore', 'Золотая руда', 'gold_ore', { hard: 3.2, tool: 'pick', tier: 2 });
blk('crystal_ore', 'Кристальная руда', 'crystal_ore', { hard: 4, tool: 'pick', tier: 2, drop: 'crystal' });
blk('bedrock', 'Основа мира', 'bedrock', { hard: -1, drop: 0 });
blk('brick', 'Кирпич', 'brick', { hard: 2.5, tool: 'pick', tier: 0 });
blk('table', 'Верстак', ['table_top', 'table_side', 'planks'], { hard: 1.6, tool: 'axe', use: 'craft' });
blk('furnace', 'Печь', ['furnace_side', 'furnace_front', 'furnace_side'], { hard: 2.6, tool: 'pick', tier: 0, use: 'craft', facing: true });
blk('chest', 'Сундук', ['chest_side', 'chest_front', 'chest_side'], { hard: 1.6, tool: 'axe', use: 'chest', facing: true });
blk('torch', 'Факел', 'torch', { shape: 'cross', solid: false, alpha: 1, hard: 0.05, light: 13 });
blk('lava', 'Лава', 'lava', { shape: 'liquid', solid: false, alpha: 0, hard: -1, drop: 0, light: 15 });
blk('snow', 'Снег', ['snow', 'snow_side', 'dirt'], { hard: 0.6, tool: 'shovel', drop: 'dirt' });
blk('pine_leaves', 'Хвоя', 'pine_leaves', { alpha: 1, hard: 0.25, drop: 0 });
blk('flower_red', 'Красный цветок', 'flower_red', { shape: 'cross', solid: false, alpha: 1, hard: 0.02 });
blk('flower_blue', 'Синий цветок', 'flower_blue', { shape: 'cross', solid: false, alpha: 1, hard: 0.02 });
blk('tallgrass', 'Высокая трава', 'tallgrass', { shape: 'cross', solid: false, alpha: 1, hard: 0.02, drop: 'seeds?' });
blk('hellrock', 'Жаростень', 'hellrock', { hard: 1.6, tool: 'pick', tier: 0 });
blk('ember_ore', 'Угольковая руда', 'ember_ore', { hard: 3, tool: 'pick', tier: 1, drop: 'ember', light: 6 });
blk('glowstone', 'Светняк', 'glowstone', { hard: 0.8, light: 15 });
blk('dark_brick', 'Тёмный кирпич', 'dark_brick', { hard: 3, tool: 'pick', tier: 0 });
blk('ash', 'Пепел', 'ash', { hard: 0.5, tool: 'shovel' });
blk('cloudstone', 'Облачный камень', 'cloudstone', { hard: 1.5, tool: 'pick', tier: 0 });
blk('skygrass', 'Небесная трава', ['skygrass_top', 'skygrass_side', 'cloudstone'], { hard: 0.7, tool: 'shovel', drop: 'cloudstone' });
blk('storm_ore', 'Грозовая руда', 'storm_ore', { hard: 3.5, tool: 'pick', tier: 2, drop: 'feather', light: 4 });
blk('temple', 'Храмовый камень', 'temple', { hard: 4, tool: 'pick', tier: 1 });
blk('altar', 'Алтарь призыва', 'altar', { hard: -1, drop: 0, use: 'altar', light: 8 });
blk('altar_used', 'Погасший алтарь', 'altar_used', { hard: -1, drop: 0 });
blk('portal_deep', 'Портал в Глубины', 'portal_deep', { hard: 3, tool: 'pick', use: 'portal', light: 12 });
blk('portal_sky', 'Портал в Небеса', 'portal_sky', { hard: 3, tool: 'pick', use: 'portal', light: 12 });
blk('lever', 'Рычаг', 'lever_off', { shape: 'cross', solid: false, alpha: 1, hard: 0.3, use: 'lever', mech: 'source' });
blk('lever_on', 'Рычаг (вкл)', 'lever_on', { shape: 'cross', solid: false, alpha: 1, hard: 0.3, use: 'lever', mech: 'source', drop: 'lever', hidden: true });
blk('wire', 'Искровод', 'wire_off', { shape: 'flat', solid: false, alpha: 1, hard: 0.05, mech: 'wire' });
blk('wire_on', 'Искровод (ток)', 'wire_on', { shape: 'flat', solid: false, alpha: 1, hard: 0.05, mech: 'wire', drop: 'wire', hidden: true, light: 3 });
blk('lamp', 'Лампа', 'lamp_off', { hard: 0.6, mech: 'lamp' });
blk('lamp_on', 'Лампа (горит)', 'lamp_on', { hard: 0.6, mech: 'lamp', drop: 'lamp', hidden: true, light: 15 });
blk('door', 'Дверь', 'door_closed', { hard: 1.2, tool: 'axe', use: 'door', mech: 'door', alpha: 1 });
blk('door_open', 'Дверь (открыта)', 'door_open', { solid: false, alpha: 1, hard: 1.2, tool: 'axe', use: 'door', mech: 'door', drop: 'door', hidden: true });
blk('piston', 'Толкатель', ['piston_side', 'piston_front', 'piston_side'], { hard: 1.5, tool: 'pick', mech: 'piston', facing: 6 });
blk('piston_head', 'Шток толкателя', 'piston_head', { hard: 1.5, drop: 0, hidden: true });
blk('bomb', 'Пороховая бочка', ['bomb_top', 'bomb_side'], { hard: 0.3, use: 'bomb', mech: 'bomb' });
blk('button', 'Кнопка', 'button', { shape: 'flat', solid: false, alpha: 1, hard: 0.3, use: 'button', mech: 'source' });
blk('plate', 'Нажимная плита', 'plate', { shape: 'flat', solid: false, alpha: 1, hard: 0.4, mech: 'source' });
blk('wool', 'Шерсть', 'wool', { hard: 0.5 });
blk('gravel', 'Гравий', 'gravel', { hard: 0.6, tool: 'shovel' });
blk('pine_log', 'Еловое бревно', ['log_top', 'pine_log'], { hard: 1.6, tool: 'axe', drop: 'log' });
blk('cactus', 'Кактус', ['cactus_top', 'cactus_side'], { hard: 0.4, alpha: 1, hurt: 1 });
blk('farmland', 'Грядка', ['farmland', 'dirt', 'dirt'], { hard: 0.5, tool: 'shovel', drop: 'dirt' });
blk('wheat_crop', 'Пшеница', 'wheat_crop', { shape: 'cross', solid: false, alpha: 1, hard: 0.02, drop: 'wheat' });
blk('ice', 'Лёд', 'ice', { hard: 0.5, alpha: 2, drop: 0 });
blk('mushroom', 'Гриб', 'mushroom', { shape: 'cross', solid: false, alpha: 1, hard: 0.02, light: 3 });
blk('ladder', 'Лестница', 'ladder', { shape: 'thin', solid: false, alpha: 1, hard: 0.4, tool: 'axe', climb: true, facing: true });
blk('obsidian', 'Лунный камень', 'obsidian_crk', { hard: 8, tool: 'pick', tier: 2 });
KM.NBLOCKS = BI;

// ---------- предметы (id от 100) ----------
const I = KM.I = {};
function itm(name, n, tile, o = {}) { const id = 100 + Object.keys(I).length; I[id] = Object.assign({ id, key: name, n, tile: T[tile], stack: 64 }, o); KM[name.toUpperCase()] = id; return id; }
itm('stick', 'Палка', 'stick');
itm('coal', 'Уголь', 'coal', { fuel: 8 });
itm('iron', 'Железный слиток', 'iron_ingot');
itm('gold', 'Золотой слиток', 'gold_ingot');
itm('crystal', 'Кристалл', 'crystal');
itm('ember', 'Уголёк', 'ember', { fuel: 30 });
itm('feather', 'Перо бури', 'feather');
itm('apple', 'Яблоко', 'apple', { food: 4 });
itm('meat_raw', 'Сырое мясо', 'meat_raw', { food: 2 });
itm('meat', 'Жареное мясо', 'meat_cooked', { food: 8 });
itm('bread', 'Хлеб', 'bread', { food: 6 });
itm('wheat', 'Колос', 'wheat');
itm('seeds', 'Семена', 'seeds', { place: 'wheat_crop', on: 'farmland' });
itm('heart_stone', 'Сердце камня', 'heart_stone', { stack: 16 });
itm('fire_core', 'Огненное ядро', 'fire_core', { stack: 16 });
itm('storm_crown', 'Корона бури', 'storm_crown', { stack: 1 });
itm('arrow', 'Стрела', 'arrow');
itm('bow', 'Лук', 'bow', { stack: 1, bow: true });
const TIERN = ['Деревянн', 'Каменн', 'Железн', 'Кристальн'];
for (let k = 0; k < 4; k++) {
  const sp = [2, 4, 6, 9][k], dur = [60, 130, 250, 1500][k];
  itm('pick' + k, TIERN[k] + 'ая кирка', 'pick' + k, { stack: 1, tool: { type: 'pick', tier: k, speed: sp, dur } });
  itm('axe' + k, TIERN[k] + 'ый топор', 'axe' + k, { stack: 1, tool: { type: 'axe', tier: k, speed: sp, dur, dmg: 3 + k } });
  itm('shovel' + k, TIERN[k] + 'ая лопата', 'shovel' + k, { stack: 1, tool: { type: 'shovel', tier: k, speed: sp, dur } });
  itm('sword' + k, TIERN[k] + 'ый меч', 'sword' + k, { stack: 1, tool: { type: 'sword', tier: k, speed: 1, dur, dmg: 4 + k * 2 } });
}
// хоу: используем лопату на земле, чтобы сделать грядку (см. game.js)

KM.isItem = (id) => id >= 100;
KM.def = (id) => (id >= 100 ? I[id] : B[id]);
KM.name = (id) => (KM.def(id) ? KM.def(id).n : '?');
KM.stackOf = (id) => (KM.def(id) ? KM.def(id).stack : 64);
KM.byKey = (k) => { if (KM[k.toUpperCase()] !== undefined) return KM[k.toUpperCase()]; return 0; };

// ---------- рецепты ----------
// st: '' — в руках, 'table' — у верстака, 'furnace' — у печи (нужно топливо: уголь или уголёк)
const R_ = KM.RECIPES = [];
function rec(out, n, ing, st = '') { R_.push({ out: KM.byKey(out), n, ing: Object.entries(ing).map(([k, v]) => [KM.byKey(k), v]), st }); }
rec('planks', 4, { log: 1 });
rec('stick', 4, { planks: 2 });
rec('table', 1, { planks: 4 });
rec('torch', 4, { stick: 1, coal: 1 });
rec('torch', 6, { stick: 1, ember: 1 });
rec('pick0', 1, { planks: 3, stick: 2 }, 'table');
rec('axe0', 1, { planks: 3, stick: 2 }, 'table');
rec('shovel0', 1, { planks: 1, stick: 2 }, 'table');
rec('sword0', 1, { planks: 2, stick: 1 }, 'table');
rec('pick1', 1, { cobble: 3, stick: 2 }, 'table');
rec('axe1', 1, { cobble: 3, stick: 2 }, 'table');
rec('shovel1', 1, { cobble: 1, stick: 2 }, 'table');
rec('sword1', 1, { cobble: 2, stick: 1 }, 'table');
rec('pick2', 1, { iron: 3, stick: 2 }, 'table');
rec('axe2', 1, { iron: 3, stick: 2 }, 'table');
rec('shovel2', 1, { iron: 1, stick: 2 }, 'table');
rec('sword2', 1, { iron: 2, stick: 1 }, 'table');
rec('pick3', 1, { crystal: 3, stick: 2 }, 'table');
rec('axe3', 1, { crystal: 3, stick: 2 }, 'table');
rec('shovel3', 1, { crystal: 1, stick: 2 }, 'table');
rec('sword3', 1, { crystal: 2, stick: 1 }, 'table');
rec('bow', 1, { stick: 3, wool: 1 }, 'table');
rec('arrow', 4, { stick: 1, cobble: 1, feather: 1 }, 'table');
rec('arrow', 2, { stick: 1, cobble: 1 }, 'table');
rec('furnace', 1, { cobble: 8 }, 'table');
rec('chest', 1, { planks: 8 }, 'table');
rec('door', 1, { planks: 6 }, 'table');
rec('ladder', 4, { stick: 7 }, 'table');
rec('bread', 1, { wheat: 3 }, 'table');
rec('brick', 4, { cobble: 2, sand: 2 }, 'table');
rec('wire', 8, { ember: 1, iron: 1 }, 'table');
rec('wire', 4, { coal: 2, iron: 1 }, 'table');
rec('lever', 1, { stick: 1, cobble: 1 }, 'table');
rec('button', 1, { stone: 1 }, 'table');
rec('plate', 1, { stone: 2 }, 'table');
rec('lamp', 1, { glass: 4, torch: 1, iron: 1 }, 'table');
rec('piston', 1, { planks: 3, cobble: 4, iron: 1 }, 'table');
rec('bomb', 1, { sand: 4, coal: 4 }, 'table');
rec('glass', 1, { sand: 1 }, 'furnace');
rec('stone', 1, { cobble: 1 }, 'furnace');
rec('iron', 1, { iron_ore: 1 }, 'furnace');
rec('gold', 1, { gold_ore: 1 }, 'furnace');
rec('meat', 1, { meat_raw: 1 }, 'furnace');
rec('obsidian', 1, { cobble: 4, crystal: 1 }, 'furnace');
rec('portal_deep', 1, { heart_stone: 1, iron: 4, coal: 4 }, 'table');
rec('portal_sky', 1, { fire_core: 1, crystal: 4, glass: 4 }, 'table');
rec('glowstone', 1, { ember: 2, glass: 1 }, 'table');
rec('wool', 1, { wheat: 4 }, 'table');
