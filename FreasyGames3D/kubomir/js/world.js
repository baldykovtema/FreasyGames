'use strict';
// Кубомир: мир из чанков 16×16×96, генерация трёх измерений, постройки, свет и сборка сеток.
(function () {
  const KM = window.KM, B = KM.B;
  const CS = KM.CS = 16, HY = KM.HY = 96, CV = CS * CS * HY;
  const SEA = KM.SEA = 34;
  const idx = (x, y, z) => (y * CS + z) * CS + x;
  KM.idx = idx;

  // ---------- шум ----------
  function makeNoise(seed) {
    const p = new Uint8Array(512); const r = (() => { let s = seed >>> 0 || 7; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
    const q = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [q[i], q[j]] = [q[j], q[i]]; }
    for (let i = 0; i < 512; i++) p[i] = q[i & 255];
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10), lerp = (a, b, t) => a + (b - a) * t;
    const g2 = (h, x, y) => { switch (h & 7) { case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y; case 4: return x; case 5: return -x; case 6: return y; default: return -y; } };
    const g3 = (h, x, y, z) => { const u = (h & 15) < 8 ? x : y, v = (h & 15) < 4 ? y : ((h & 15) === 12 || (h & 15) === 14) ? x : z; return ((h & 1) ? -u : u) + ((h & 2) ? -v : v); };
    function n2(x, y) {
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255; x -= Math.floor(x); y -= Math.floor(y);
      const u = fade(x), v = fade(y), a = p[X] + Y, b = p[X + 1] + Y;
      return lerp(lerp(g2(p[a], x, y), g2(p[b], x - 1, y), u), lerp(g2(p[a + 1], x, y - 1), g2(p[b + 1], x - 1, y - 1), u), v) * 0.7;
    }
    function n3(x, y, z) {
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255; x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
      const u = fade(x), v = fade(y), w = fade(z), A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, Bq = p[X + 1] + Y, BA = p[Bq] + Z, BB = p[Bq + 1] + Z;
      return lerp(lerp(lerp(g3(p[AA], x, y, z), g3(p[BA], x - 1, y, z), u), lerp(g3(p[AB], x, y - 1, z), g3(p[BB], x - 1, y - 1, z), u), v),
        lerp(lerp(g3(p[AA + 1], x, y, z - 1), g3(p[BA + 1], x - 1, y, z - 1), u), lerp(g3(p[AB + 1], x, y - 1, z - 1), g3(p[BB + 1], x - 1, y - 1, z - 1), u), v), w);
    }
    const f2 = (x, y, o = 4) => { let s = 0, a = 1, f = 1, t = 0; for (let i = 0; i < o; i++) { s += n2(x * f, y * f) * a; t += a; a *= 0.5; f *= 2; } return s / t; };
    return { n2, n3, f2 };
  }
  const hash = (a, b, c = 0, s = 0) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647 + s * 1274126177) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const crng = (a, b, s) => { let x = Math.floor(hash(a, b, 17, s) * 4294967296) >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
  KM.hash = hash;

  // ---------- мир ----------
  KM.World = function (seed) {
    const W = { seed, dims: [new Map(), new Map(), new Map()], edits: [new Map(), new Map(), new Map()], chests: {}, used: {} };
    const N = [makeNoise(seed), makeNoise(seed + 101), makeNoise(seed + 202), makeNoise(seed + 303), makeNoise(seed + 404)];
    const ck = (cx, cz) => cx + ',' + cz;
    W.ck = ck;

    // ----- поверхность -----
    function biome(x, z) {
      const t = N[1].f2(x / 420, z / 420, 3), m = N[2].f2(x / 330, z / 330, 3);
      if (t < -0.22) return 'snow';
      if (t > 0.22 && m < 0.05) return 'desert';
      if (m > 0.08) return 'forest';
      return 'plains';
    }
    function height(x, z) {
      const base = N[0].f2(x / 150, z / 150, 5) * 16;
      const mnt = Math.max(0, N[3].f2(x / 260, z / 260, 4) - 0.08) * 90;
      const b = biome(x, z), flat = b === 'desert' ? 0.6 : 1;
      return Math.max(4, Math.min(HY - 12, Math.round(SEA + 2 + base * flat + mnt)));
    }
    W.height = height; W.biome = biome;

    // ----- небеса -----
    function skyDensity(x, y, z) {
      const n = N[3].n3(x / 46, y / 22, z / 46) + N[4].n3(x / 18, y / 12, z / 18) * 0.35;
      const fall = Math.abs(y - 46) / 24;
      let d = n - fall * fall * 0.9 + 0.08;
      const r = Math.hypot(x - 8, z - 8); if (r < 14 && y > 36 && y < 46) d = Math.max(d, 0.6 - r / 20 - (46 - y) * 0.02 + (y > 44 ? -1 : 0)); // остров появления
      return d;
    }
    // ----- глубины -----
    function deepDensity(x, y, z) {
      const n = N[3].n3(x / 38, y / 22, z / 38) * 0.9 + N[4].n3(x / 14, y / 10, z / 14) * 0.25;
      const edge = y < 8 ? (8 - y) * 0.25 : y > HY - 14 ? (y - (HY - 14)) * 0.18 : 0;
      return n + edge - 0.02;
    }

    // ----- постройки -----
    // Каждая область 80×80 содержит не больше одной постройки; её тип и место зависят только от зерна мира.
    const REG = 80;
    function regionStruct(d, rx, rz) {
      const h = hash(rx, rz, d, seed + 9);
      const x = rx * REG + 12 + Math.floor(hash(rx, rz, 1, seed) * (REG - 24)), z = rz * REG + 12 + Math.floor(hash(rx, rz, 2, seed) * (REG - 24));
      if (d === 0) {
        if (rx === 0 && rz === 0) return null;
        const bm = biome(x, z), gh = height(x, z);
        if (gh <= SEA + 1) return h < 0.3 ? { type: 'dungeon', x, z, y: 14 + Math.floor(hash(rx, rz, 3, seed) * 14) } : null;
        if (h < 0.3) return { type: bm === 'desert' ? 'pyramid' : 'house', x, z, y: gh };
        if (h < 0.48) return { type: 'temple', x, z, y: gh };
        if (h < 0.8) return { type: 'dungeon', x, z, y: 10 + Math.floor(hash(rx, rz, 3, seed) * 16) };
        return null;
      }
      if (d === 1) return h < 0.55 ? { type: 'fortress', x, z, y: 34 } : null;
      if (d === 2) { if (rx === 0 && rz === 0) return { type: 'skyhut', x: 6, z: 2, y: 45 }; return h < 0.5 ? { type: 'skytemple', x, z, y: 48 + Math.floor(hash(rx, rz, 4, seed) * 10) } : null; }
      return null;
    }
    W.regionStruct = regionStruct;

    function buildStruct(s, put) {
      const { x, y, z } = s;
      const box = (x0, y0, z0, x1, y1, z1, id, hollow = false, m = 0) => {
        for (let a = x0; a <= x1; a++) for (let b = y0; b <= y1; b++) for (let c = z0; c <= z1; c++) {
          const edge = a === x0 || a === x1 || b === y0 || b === y1 || c === z0 || c === z1;
          put(a, b, c, hollow && !edge ? 0 : id, m);
        }
      };
      if (s.type === 'house') {
        box(x - 4, y - 3, z - 4, x + 4, y, z + 4, KM.COBBLE);
        box(x - 4, y + 1, z - 4, x + 4, y + 4, z + 4, KM.PLANKS, true);
        for (const [a, c] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) box(x + a, y + 1, z + c, x + a, y + 4, z + c, KM.LOG);
        for (let i = 0; i <= 3; i++) box(x - 5 + i, y + 5 + i, z - 5 + i, x + 5 - i, y + 5 + i, z + 5 - i, i === 3 ? KM.LOG : KM.BRICK);
        box(x, y + 1, z - 4, x, y + 2, z - 4, 0); put(x, y + 1, z - 4, KM.DOOR); put(x, y + 2, z - 4, KM.DOOR);
        put(x - 4, y + 2, z, KM.GLASS); put(x + 4, y + 2, z, KM.GLASS); put(x, y + 2, z + 4, KM.GLASS);
        put(x + 3, y + 1, z + 3, KM.CHEST, 1); put(x - 3, y + 1, z + 3, KM.TABLE); put(x + 3, y + 1, z - 3, KM.FURNACE);
        put(x - 3, y + 3, z - 3, KM.TORCH); put(x + 3, y + 3, z + 1, KM.TORCH);
      } else if (s.type === 'pyramid') {
        for (let i = 0; i < 8; i++) box(x - 8 + i, y + i, z - 8 + i, x + 8 - i, y + i, z + 8 - i, KM.SAND);
        box(x - 4, y + 1, z - 4, x + 4, y + 3, z + 4, 0);
        box(x, y + 1, z - 8, x, y + 2, z - 4, 0);
        put(x, y + 1, z, KM.CHEST, 2); put(x + 2, y + 1, z + 2, KM.CHEST, 1); put(x - 3, y + 3, z - 3, KM.TORCH);
        put(x - 2, y + 1, z - 2, KM.BOMB);
      } else if (s.type === 'temple') {
        box(x - 6, y - 2, z - 6, x + 6, y, z + 6, KM.TEMPLE);
        for (const [a, c] of [[-6, -6], [6, -6], [-6, 6], [6, 6], [-6, 0], [6, 0], [0, 6]]) box(x + a, y + 1, z + c, x + a, y + 6, z + c, KM.TEMPLE);
        box(x - 6, y + 7, z - 6, x + 6, y + 7, z + 6, KM.TEMPLE);
        box(x - 4, y + 7, z - 4, x + 4, y + 7, z + 4, 0);
        box(x - 1, y + 1, z - 1, x + 1, y + 1, z + 1, KM.TEMPLE); put(x, y + 2, z, KM.ALTAR, 1);
        put(x - 5, y + 1, z + 5, KM.CHEST, 2); put(x + 5, y + 1, z + 5, KM.CHEST, 2);
        put(x - 5, y + 2, z - 5, KM.TORCH); put(x + 5, y + 2, z - 5, KM.TORCH);
      } else if (s.type === 'dungeon') {
        box(x - 4, y - 1, z - 4, x + 4, y + 4, z + 4, KM.COBBLE, true);
        for (let a = -3; a <= 3; a++) for (let c = -3; c <= 3; c++) if (hash(x + a, z + c, 5) < 0.3) put(x + a, y - 1, z + c, KM.GRAVEL);
        put(x + 3, y, z + 3, KM.CHEST, 3); put(x - 3, y, z - 3, KM.CHEST, 3); put(x, y + 3, z, KM.TORCH);
        put(x - 3, y, z + 3, KM.LAMP);
        box(x, y, z - 4, x, y + 1, z - 4, 0);
      } else if (s.type === 'fortress') {
        box(x - 10, y - 1, z - 10, x + 10, y - 1, z + 10, KM.DARK_BRICK);
        box(x - 7, y, z - 7, x + 7, y + 7, z + 7, KM.DARK_BRICK, true);
        for (let a = -7; a <= 7; a += 7) for (let c = -7; c <= 7; c += 7) box(x + a - 1, y - 12, z + c - 1, x + a + 1, y + 10, z + c + 1, KM.DARK_BRICK);
        box(x - 1, y, z - 7, x + 1, y + 3, z - 7, 0); box(x - 1, y, z + 7, x + 1, y + 3, z + 7, 0);
        box(x - 1, y, z - 1, x + 1, y, z + 1, KM.DARK_BRICK); put(x, y + 1, z, KM.ALTAR, 2);
        put(x + 6, y, z + 6, KM.CHEST, 4); put(x - 6, y, z + 6, KM.CHEST, 4); put(x - 6, y, z - 6, KM.CHEST, 4);
        for (const [a, c] of [[-6, 0], [6, 0], [0, 6]]) put(x + a, y + 4, z + c, KM.GLOWSTONE);
      } else if (s.type === 'skytemple') {
        for (let a = -7; a <= 7; a++) for (let c = -7; c <= 7; c++) { const r = Math.hypot(a, c); if (r <= 7.5) { put(x + a, y - 1, z + c, r < 6 ? KM.SKYGRASS : KM.CLOUDSTONE); for (let k = 2; k < 6 - r * 0.6; k++) put(x + a, y - k, z + c, KM.CLOUDSTONE); } }
        for (let i = 0; i < 8; i++) { const t = i / 8 * Math.PI * 2; box(x + Math.round(Math.cos(t) * 6), y, z + Math.round(Math.sin(t) * 6), x + Math.round(Math.cos(t) * 6), y + 5, z + Math.round(Math.sin(t) * 6), KM.TEMPLE); }
        put(x, y, z, KM.TEMPLE); put(x, y + 1, z, KM.ALTAR, 3);
        put(x + 3, y, z + 3, KM.CHEST, 5); put(x - 3, y, z - 3, KM.CHEST, 5);
      } else if (s.type === 'skyhut') {
        box(x - 2, y, z - 2, x + 2, y + 3, z + 2, KM.PLANKS, true); box(x - 3, y + 4, z - 3, x + 3, y + 4, z + 3, KM.CLOUDSTONE);
        box(x, y + 1, z - 2, x, y + 2, z - 2, 0); put(x + 1, y + 1, z + 1, KM.CHEST, 5); put(x - 1, y + 3, z + 1, KM.TORCH);
      }
    }

    function tree(cxw, czw, r, put, gy, kind) {
      if (kind === 'cactus') { const h = 2 + Math.floor(r() * 3); for (let i = 1; i <= h; i++) put(cxw, gy + i, czw, KM.CACTUS); return; }
      if (kind === 'pine') {
        const h = 6 + Math.floor(r() * 4);
        for (let i = 1; i <= h; i++) put(cxw, gy + i, czw, KM.PINE_LOG);
        for (let l = 2; l <= h + 1; l++) { const rad = Math.max(0, Math.round((h + 1 - l) / 2.2)); for (let a = -rad; a <= rad; a++) for (let c = -rad; c <= rad; c++) if (Math.abs(a) + Math.abs(c) <= rad + 0.5 && (a || c || l > h)) put(cxw + a, gy + l, czw + c, KM.PINE_LEAVES, 0, true); }
        return;
      }
      const h = 4 + Math.floor(r() * 3), leaf = kind === 'sky' ? KM.WOOL : KM.LEAVES;
      for (let i = 1; i <= h; i++) put(cxw, gy + i, czw, KM.LOG);
      for (let a = -2; a <= 2; a++) for (let b = h - 2; b <= h + 1; b++) for (let c = -2; c <= 2; c++) {
        const rad = b > h - 1 ? 1 : 2; if (Math.abs(a) > rad || Math.abs(c) > rad) continue;
        if (Math.abs(a) === rad && Math.abs(c) === rad && r() < 0.6) continue;
        if (!a && !c && b <= h) continue;
        put(cxw + a, gy + b, czw + c, leaf, 0, true);
      }
    }

    // ----- генерация чанка -----
    W.generate = function (d, cx, cz) {
      const blocks = new Uint8Array(CV), meta = new Uint8Array(CV);
      const X0 = cx * CS, Z0 = cz * CS;
      const set = (x, y, z, id) => { if (y >= 0 && y < HY) blocks[idx(x, y, z)] = id; };
      const r = crng(cx, cz, seed + d * 31);
      if (d === 0) {
        // пещеры: шум считается на сетке 4×4×4 и интерполируется
        const G = 4, gx = CS / G + 1, gy = HY / G + 1, cave = new Float32Array(gx * gx * gy);
        for (let a = 0; a < gx; a++) for (let b = 0; b < gy; b++) for (let c = 0; c < gx; c++) {
          const wx = X0 + a * G, wy = b * G, wz = Z0 + c * G;
          const n1 = N[3].n3(wx / 28, wy / 18, wz / 28), n2 = N[4].n3(wx / 28 + 50, wy / 18, wz / 28);
          cave[(b * gx + c) * gx + a] = Math.max(Math.abs(n1), Math.abs(n2));
        }
        const caveAt = (x, y, z) => {
          const fx = x / G, fy = y / G, fz = z / G, a = fx | 0, b = fy | 0, c = fz | 0, u = fx - a, v = fy - b, w = fz - c;
          const at = (i, j, k) => cave[((b + j) * gx + c + k) * gx + a + i];
          const l = (p, q, t) => p + (q - p) * t;
          return l(l(l(at(0, 0, 0), at(1, 0, 0), u), l(at(0, 0, 1), at(1, 0, 1), u), w), l(l(at(0, 1, 0), at(1, 1, 0), u), l(at(0, 1, 1), at(1, 1, 1), u), w), v);
        };
        for (let x = 0; x < CS; x++) for (let z = 0; z < CS; z++) {
          const wx = X0 + x, wz = Z0 + z, h = height(wx, wz), bm = biome(wx, wz);
          const beach = h <= SEA + 1;
          for (let y = 0; y <= Math.max(h, SEA); y++) {
            let id;
            if (y === 0 || (y < 3 && hash(wx, y, wz, seed) < 0.5)) id = KM.BEDROCK;
            else if (y > h) id = KM.WATER;
            else if (y === h) id = beach ? KM.SAND : bm === 'desert' ? KM.SAND : bm === 'snow' ? KM.SNOW : KM.GRASS;
            else if (y > h - 4) id = (beach || bm === 'desert') ? KM.SAND : KM.DIRT;
            else id = KM.STONE;
            if (id !== KM.BEDROCK && id !== KM.WATER && y < h - 0 && y > 2) {
              const cv2 = caveAt(x, y, z), th = 0.075 + (y < 20 ? 0.025 : 0);
              if (cv2 < th && !(y >= h - 1 && h <= SEA + 1)) id = y < 9 ? KM.LAVA : 0;
            }
            if (id === KM.WATER && h < SEA - 6 && y === SEA && bm === 'snow') id = KM.ICE;
            blocks[idx(x, y, z)] = id;
          }
          if (h > SEA && blocks[idx(x, h, z)] === KM.GRASS) {
            const q = hash(wx, wz, 77, seed);
            if (q < 0.06) set(x, h + 1, z, KM.TALLGRASS);
            else if (q < 0.075 && bm !== 'forest') set(x, h + 1, z, q < 0.068 ? KM.FLOWER_RED : KM.FLOWER_BLUE);
          }
        }
        // руды
        const veins = [[KM.COAL_ORE, 22, 80, 9, 6], [KM.IRON_ORE, 14, 60, 6, 5], [KM.GOLD_ORE, 5, 32, 5, 4], [KM.CRYSTAL_ORE, 4, 18, 4, 3]];
        for (const [ore, n, maxY, size] of veins) for (let i = 0; i < n * 0.5; i++) {
          let x = r() * CS | 0, y = 2 + (r() * (maxY - 2) | 0), z = r() * CS | 0;
          for (let k = 0; k < size; k++) { if (x >= 0 && x < CS && z >= 0 && z < CS && y > 0 && blocks[idx(x, y, z)] === KM.STONE) blocks[idx(x, y, z)] = ore; x += (r() * 3 | 0) - 1; y += (r() * 3 | 0) - 1; z += (r() * 3 | 0) - 1; }
        }
      } else if (d === 1) {
        const G = 4, gx = CS / G + 1, gy = HY / G + 1, den = new Float32Array(gx * gx * gy);
        for (let a = 0; a < gx; a++) for (let b = 0; b < gy; b++) for (let c = 0; c < gx; c++) den[(b * gx + c) * gx + a] = deepDensity(X0 + a * G, b * G, Z0 + c * G);
        const at = (x, y, z) => { const fx = x / G, fy = y / G, fz = z / G, a = fx | 0, b = fy | 0, c = fz | 0, u = fx - a, v = fy - b, w = fz - c; const q = (i, j, k) => den[((b + j) * gx + c + k) * gx + a + i]; const l = (p, s, t) => p + (s - p) * t; return l(l(l(q(0, 0, 0), q(1, 0, 0), u), l(q(0, 0, 1), q(1, 0, 1), u), w), l(l(q(0, 1, 0), q(1, 1, 0), u), l(q(0, 1, 1), q(1, 1, 1), u), w), v); };
        for (let x = 0; x < CS; x++) for (let z = 0; z < CS; z++) for (let y = 0; y < HY; y++) {
          let id;
          if (y === 0 || y === HY - 1) id = KM.BEDROCK;
          else if (at(x, y, z) > 0) id = KM.HELLROCK;
          else id = y < 22 ? KM.LAVA : 0;
          blocks[idx(x, y, z)] = id;
        }
        for (let x = 0; x < CS; x++) for (let z = 0; z < CS; z++) for (let y = 23; y < HY - 2; y++) {
          const i = idx(x, y, z), wx = X0 + x, wz = Z0 + z;
          if (blocks[i] === KM.HELLROCK && blocks[idx(x, y + 1, z)] === 0) { const q = hash(wx, y, wz, seed); if (q < 0.12) blocks[i] = KM.ASH; else if (q < 0.15) blocks[idx(x, y + 1, z)] = KM.MUSHROOM; }
          if (blocks[i] === KM.HELLROCK && blocks[idx(x, y - 1, z)] === 0 && hash(wx, y, wz, seed + 3) < 0.03) { for (let k = 0; k < 3; k++) if (blocks[idx(x, y - k, z)] !== KM.BEDROCK) blocks[idx(x, y - k, z)] = KM.GLOWSTONE; }
        }
        for (let i = 0; i < 14; i++) { let x = r() * CS | 0, y = 4 + (r() * 80 | 0), z = r() * CS | 0; for (let k = 0; k < 5; k++) { if (x >= 0 && x < CS && z >= 0 && z < CS && y > 0 && y < HY - 1 && blocks[idx(x, y, z)] === KM.HELLROCK) blocks[idx(x, y, z)] = KM.EMBER_ORE; x += (r() * 3 | 0) - 1; y += (r() * 3 | 0) - 1; z += (r() * 3 | 0) - 1; } }
      } else {
        for (let x = 0; x < CS; x++) for (let z = 0; z < CS; z++) {
          const wx = X0 + x, wz = Z0 + z;
          for (let y = 20; y < 80; y++) if (skyDensity(wx, y, wz) > 0.32) blocks[idx(x, y, z)] = KM.CLOUDSTONE;
          for (let y = 79; y > 20; y--) if (blocks[idx(x, y, z)] === KM.CLOUDSTONE && !blocks[idx(x, y + 1, z)]) { blocks[idx(x, y, z)] = KM.SKYGRASS; if (hash(wx, wz, y, seed) < 0.05) blocks[idx(x, y + 1, z)] = hash(wx, wz, 3) < 0.5 ? KM.FLOWER_BLUE : KM.TALLGRASS; }
        }
        for (let i = 0; i < 6; i++) { const x = r() * CS | 0, y = 22 + (r() * 56 | 0), z = r() * CS | 0; if (blocks[idx(x, y, z)] === KM.CLOUDSTONE) blocks[idx(x, y, z)] = KM.STORM_ORE; }
      }

      // деревья — с соседних чанков тоже, чтобы кроны не обрезались на границе
      const putLocal = (wx, wy, wz, id, m = 0, soft = false) => {
        const x = wx - X0, z = wz - Z0;
        if (x < 0 || z < 0 || x >= CS || z >= CS || wy < 0 || wy >= HY) return;
        const i = idx(x, wy, z);
        if (soft && blocks[i] && B[blocks[i]].solid) return;
        blocks[i] = id; meta[i] = m;
      };
      for (let ax = cx - 1; ax <= cx + 1; ax++) for (let az = cz - 1; az <= cz + 1; az++) {
        const tr = crng(ax, az, seed + 555 + d);
        if (d === 0) {
          const mx = ax * CS + 8, mz = az * CS + 8, bm = biome(mx, mz);
          const n = bm === 'forest' ? 5 : bm === 'snow' ? 2 : bm === 'desert' ? 1 : 1;
          for (let i = 0; i < n; i++) {
            const tx = ax * CS + 2 + (tr() * 12 | 0), tz = az * CS + 2 + (tr() * 12 | 0), go = tr() < (bm === 'plains' ? 0.35 : 0.9);
            if (!go) continue;
            const h = height(tx, tz); if (h <= SEA) continue;
            const b2 = biome(tx, tz);
            tree(tx, tz, tr, putLocal, h, b2 === 'snow' ? 'pine' : b2 === 'desert' ? 'cactus' : 'oak');
          }
        } else if (d === 2) {
          for (let i = 0; i < 2; i++) {
            const tx = ax * CS + 2 + (tr() * 12 | 0), tz = az * CS + 2 + (tr() * 12 | 0);
            let top = -1; for (let y = 78; y > 22; y--) if (skyDensity(tx, y, tz) > 0.32) { top = y; break; }
            if (top > 0 && tr() < 0.5) tree(tx, tz, tr, putLocal, top, 'sky');
          }
        }
      }
      // постройки
      const rx0 = Math.floor((X0 - 24) / REG), rx1 = Math.floor((X0 + CS + 24) / REG), rz0 = Math.floor((Z0 - 24) / REG), rz1 = Math.floor((Z0 + CS + 24) / REG);
      for (let rx = rx0; rx <= rx1; rx++) for (let rz = rz0; rz <= rz1; rz++) { const s = regionStruct(d, rx, rz); if (s) buildStruct(s, putLocal); }
      // правки игрока
      const ed = W.edits[d].get(ck(cx, cz));
      if (ed) for (const [i, v] of ed) { blocks[i] = v >> 8; meta[i] = v & 255; }
      return { cx, cz, d, blocks, meta, mesh: null, dirty: true, light: null };
    };

    // ----- доступ -----
    W.chunk = (d, cx, cz) => W.dims[d].get(ck(cx, cz));
    W.get = (d, x, y, z) => {
      if (y < 0) return d === 2 ? 0 : KM.BEDROCK; if (y >= HY) return 0;
      const c = W.dims[d].get(ck(Math.floor(x / CS), Math.floor(z / CS)));
      if (!c) return -1;
      return c.blocks[idx(((x % CS) + CS) % CS, y, ((z % CS) + CS) % CS)];
    };
    W.getMeta = (d, x, y, z) => {
      if (y < 0 || y >= HY) return 0;
      const c = W.dims[d].get(ck(Math.floor(x / CS), Math.floor(z / CS)));
      return c ? c.meta[idx(((x % CS) + CS) % CS, y, ((z % CS) + CS) % CS)] : 0;
    };
    // set записывает правку (её сохраним и разошлём другим игрокам), помечает чанк и соседей на пересборку
    W.onEdit = null;
    W.set = (d, x, y, z, id, m = 0, remote = false) => {
      if (y < 0 || y >= HY) return false;
      const cx = Math.floor(x / CS), cz = Math.floor(z / CS), lx = ((x % CS) + CS) % CS, lz = ((z % CS) + CS) % CS, i = idx(lx, y, lz);
      const key = ck(cx, cz);
      let ed = W.edits[d].get(key); if (!ed) { ed = new Map(); W.edits[d].set(key, ed); }
      ed.set(i, (id << 8) | (m & 255));
      const c = W.dims[d].get(key);
      if (c) { c.blocks[i] = id; c.meta[i] = m; c.dirty = true; }
      const mark = (ax, az) => { const n = W.dims[d].get(ck(ax, az)); if (n) n.dirty = true; };
      if (lx === 0) mark(cx - 1, cz); if (lx === CS - 1) mark(cx + 1, cz); if (lz === 0) mark(cx, cz - 1); if (lz === CS - 1) mark(cx, cz + 1);
      if (W.onEdit && !remote) W.onEdit(d, x, y, z, id, m);
      return true;
    };
    W.solidAt = (d, x, y, z) => { const b = W.get(d, Math.floor(x), Math.floor(y), Math.floor(z)); return b < 0 ? true : B[b].solid; };

    // ----- свет -----
    // Небесный свет (0–15) и свет от блоков (0–15) считаются внутри чанка волной от источников.
    W.computeLight = function (c) {
      const sky = new Uint8Array(CV), bl = new Uint8Array(CV), q = [];
      const bk = c.blocks;
      const pass = (b) => { const df = B[b]; return !df.solid || df.alpha === 1 || df.alpha === 2; };
      let qh = 0;
      if (c.d !== 1) {
        for (let x = 0; x < CS; x++) for (let z = 0; z < CS; z++) {
          let l = 15;
          for (let y = HY - 1; y >= 0; y--) {
            const b = bk[idx(x, y, z)];
            if (b && !pass(b)) break;
            if (b === KM.LEAVES || b === KM.PINE_LEAVES || b === KM.WATER || b === KM.WOOL) l = Math.max(0, l - 2);
            sky[idx(x, y, z)] = l; if (l > 0) q.push(idx(x, y, z));
          }
        }
        while (qh < q.length) {
          const i = q[qh++], l = sky[i]; if (l <= 1) continue;
          const x = i % CS, z = ((i / CS) | 0) % CS, y = (i / (CS * CS)) | 0;
          const nb = [x > 0 ? i - 1 : -1, x < CS - 1 ? i + 1 : -1, z > 0 ? i - CS : -1, z < CS - 1 ? i + CS : -1, y > 0 ? i - CS * CS : -1, y < HY - 1 ? i + CS * CS : -1];
          for (const n of nb) if (n >= 0 && sky[n] < l - 1 && (!bk[n] || pass(bk[n]))) { sky[n] = l - 1; q.push(n); }
        }
      }
      qh = 0; q.length = 0;
      for (let i = 0; i < CV; i++) { const L = B[bk[i]].light; if (L) { bl[i] = L; q.push(i); } }
      while (qh < q.length) {
        const i = q[qh++], l = bl[i]; if (l <= 1) continue;
        const x = i % CS, z = ((i / CS) | 0) % CS, y = (i / (CS * CS)) | 0;
        const nb = [x > 0 ? i - 1 : -1, x < CS - 1 ? i + 1 : -1, z > 0 ? i - CS : -1, z < CS - 1 ? i + CS : -1, y > 0 ? i - CS * CS : -1, y < HY - 1 ? i + CS * CS : -1];
        for (const n of nb) if (n >= 0 && bl[n] < l - 1 && (!bk[n] || pass(bk[n]))) { bl[n] = l - 1; q.push(n); }
      }
      c.sky = sky; c.bl = bl;
    };
    W.lightAt = (d, x, y, z) => {
      if (y >= HY) return [15, 0]; if (y < 0) return [0, 0];
      const c = W.dims[d].get(ck(Math.floor(x / CS), Math.floor(z / CS)));
      if (!c || !c.sky) return [d === 1 ? 0 : 15, 0];
      const i = idx(((x % CS) + CS) % CS, y, ((z % CS) + CS) % CS); return [c.sky[i], c.bl[i]];
    };
    return W;
  };

  // ---------- сборка сетки чанка ----------
  // Цвет вершины несёт (небесный свет, свет блоков, затенение грани); шейдер смешивает их с временем суток.
  const FACES = [
    { n: [1, 0, 0], v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], s: 0.8, t: 1 },
    { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], s: 0.8, t: 1 },
    { n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], s: 1, t: 0 },
    { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], s: 0.55, t: 2 },
    { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], s: 0.68, t: 1 },
    { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], s: 0.68, t: 1 },
  ];
  KM.FACES = FACES;
  KM.buildMesh = function (W, c) {
    const out = [{ p: [], u: [], c: [], i: [] }, { p: [], u: [], c: [], i: [] }, { p: [], u: [], c: [], i: [] }];
    const X0 = c.cx * CS, Z0 = c.cz * CS, d = c.d, bk = c.blocks;
    const AW = KM.ACOLS * KM.TS, AH = KM.AROWS * KM.TS, e = 0.02;
    const uvOf = (tile) => { const tx = tile % KM.ACOLS, ty = (tile / KM.ACOLS) | 0; return [(tx * KM.TS + e) / AW, 1 - ((ty + 1) * KM.TS - e) / AH, ((tx + 1) * KM.TS - e) / AW, 1 - (ty * KM.TS + e) / AH]; };
    const get = (x, y, z) => {
      if (y < 0) return d === 2 ? 0 : KM.BEDROCK; if (y >= HY) return 0;
      if (x >= 0 && x < CS && z >= 0 && z < CS) return bk[idx(x, y, z)];
      return W.get(d, X0 + x, y, Z0 + z);
    };
    const light = (x, y, z) => {
      if (y >= HY) return [15, 0]; if (y < 0) return [0, 0];
      if (x >= 0 && x < CS && z >= 0 && z < CS) { const i = idx(x, y, z); return [c.sky[i], c.bl[i]]; }
      return W.lightAt(d, X0 + x, y, Z0 + z);
    };
    function quad(o, verts, tile, L, shade, flipU = false) {
      const [u0, v0, u1, v1] = uvOf(tile), base = o.p.length / 3;
      for (const v of verts) o.p.push(v[0], v[1], v[2]);
      if (flipU) o.u.push(u1, v0, u0, v0, u0, v1, u1, v1); else o.u.push(u0, v0, u1, v0, u1, v1, u0, v1);
      for (let k = 0; k < 4; k++) o.c.push(L[0] / 15, L[1] / 15, shade);
      o.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    for (let y = 0; y < HY; y++) for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const id = bk[idx(x, y, z)]; if (!id) continue;
      const df = B[id], wx = X0 + x, wz = Z0 + z;
      if (df.shape === 'cross') {
        const L = light(x, y, z), o = out[1], t = df.t[1], a = 0.15, b = 0.85, h = id === KM.TORCH ? 0.9 : 1;
        quad(o, [[wx + a, y, wz + a], [wx + b, y, wz + b], [wx + b, y + h, wz + b], [wx + a, y + h, wz + a]], t, L, 0.9);
        quad(o, [[wx + b, y, wz + a], [wx + a, y, wz + b], [wx + a, y + h, wz + b], [wx + b, y + h, wz + a]], t, L, 0.9);
        continue;
      }
      if (df.shape === 'flat') {
        const L = light(x, y, z), hh = id === KM.BUTTON ? 0.1 : 0.04;
        quad(out[1], [[wx, y + hh, wz + 1], [wx + 1, y + hh, wz + 1], [wx + 1, y + hh, wz], [wx, y + hh, wz]], df.t[0], L, 1);
        continue;
      }
      if (df.shape === 'thin') {
        const L = light(x, y, z), f = c.meta[idx(x, y, z)] & 3, k = 0.06;
        const P4 = [[[wx, y, wz + k], [wx + 1, y, wz + k], [wx + 1, y + 1, wz + k], [wx, y + 1, wz + k]], [[wx + 1, y, wz + 1 - k], [wx, y, wz + 1 - k], [wx, y + 1, wz + 1 - k], [wx + 1, y + 1, wz + 1 - k]],
          [[wx + k, y, wz + 1], [wx + k, y, wz], [wx + k, y + 1, wz], [wx + k, y + 1, wz + 1]], [[wx + 1 - k, y, wz], [wx + 1 - k, y, wz + 1], [wx + 1 - k, y + 1, wz + 1], [wx + 1 - k, y + 1, wz]]];
        quad(out[1], P4[f], df.t[1], L, 0.85);
        continue;
      }
      const liquid = df.shape === 'liquid', layer = df.alpha === 0 ? 0 : df.alpha === 1 ? 1 : 2;
      const topH = liquid && get(x, y + 1, z) !== id ? 0.88 : 1;
      for (let f = 0; f < 6; f++) {
        const F = FACES[f], n = get(x + F.n[0], y + F.n[1], z + F.n[2]);
        if (n < 0) continue;
        if (n) {
          const nd = B[n];
          if (n === id && df.alpha !== 0) continue;
          if (nd.shape === 'cube' && nd.alpha === 0) continue;
          if (liquid && nd.shape === 'liquid') continue;
        }
        let tile = df.t[F.t];
        if (df.mech === 'piston' || id === KM.PISTON_HEAD) { const fc = c.meta[idx(x, y, z)] & 7; tile = fc === f ? KM.T.piston_front : (id === KM.PISTON_HEAD ? KM.T.piston_head : KM.T.piston_side); }
        const L = light(x + F.n[0], y + F.n[1], z + F.n[2]);
        const verts = F.v.map((v) => [wx + v[0], y + (v[1] === 1 ? topH : 0), wz + v[2]]);
        quad(out[layer], verts, tile, L, F.s);
      }
    }
    return out;
  };
})();
