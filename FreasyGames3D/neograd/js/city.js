'use strict';
// Неоград: город из кварталов, дороги, пляж, аэропорт, текстуры, столкновения и картинка для миникарты.
(function () {
  const N = window.N = {};
  const GN = N.GN = 12, CELL = N.CELL = 74, ROAD = N.ROAD = 14, HALF = ROAD / 2;
  N.roadX = (i) => i * CELL;           // ось дороги номер i (и по X, и по Z)
  N.MIN = -HALF; N.MAX = GN * CELL + HALF;
  N.BOUNDS = { x0: -420, x1: 1000, z0: -420, z1: 1000 };
  N.AIR = { x0: 260, x1: 900, z0: -300, z1: -40, rz: -150 };   // аэропорт и ось взлётной полосы
  N.BEACH = -70;                                                 // за этой линией по X — море

  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  N.rng = rng;

  // ---------- текстуры ----------
  function tex(w, h, draw, rep = true) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } t.anisotropy = 4; return t;
  }
  function noiseFill(g, w, h, base, v, n = 2000) { g.fillStyle = base; g.fillRect(0, 0, w, h); for (let i = 0; i < n; i++) { const a = Math.random() * v; g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${a})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }
  N.makeTextures = function () {
    const T = {};
    T.asphalt = tex(128, 128, (g, w, h) => noiseFill(g, w, h, '#3b3d44', 0.12, 1500));
    // дорога вдоль: края и пунктир посередине
    T.road = tex(64, 128, (g, w, h) => { noiseFill(g, w, h, '#3b3d44', 0.12, 700); g.fillStyle = '#e8e2c8'; g.fillRect(2, 0, 2, h); g.fillRect(w - 4, 0, 2, h); g.fillStyle = '#f2c230'; g.fillRect(w / 2 - 1.5, 0, 3, h * 0.55); });
    T.walk = tex(64, 64, (g, w, h) => { noiseFill(g, w, h, '#a9a6a0', 0.1, 400); g.strokeStyle = '#8d8a84'; g.lineWidth = 2; g.strokeRect(0, 0, w, h); });
    T.grass = tex(64, 64, (g, w, h) => noiseFill(g, w, h, '#4f9a3e', 0.18, 900));
    T.sand = tex(64, 64, (g, w, h) => noiseFill(g, w, h, '#e3d39b', 0.1, 700));
    T.runway = tex(64, 256, (g, w, h) => { noiseFill(g, w, h, '#2e3036', 0.1, 900); g.fillStyle = '#f2f2f2'; g.fillRect(w / 2 - 2, 0, 4, h * 0.5); g.fillRect(4, 0, 3, h); g.fillRect(w - 7, 0, 3, h); });
    T.water = tex(64, 64, (g, w, h) => { noiseFill(g, w, h, '#1f6fa8', 0.08, 300); g.strokeStyle = 'rgba(255,255,255,0.15)'; for (let i = 0; i < 6; i++) { g.beginPath(); const y = Math.random() * h; g.moveTo(0, y); g.bezierCurveTo(w / 3, y - 4, w * 2 / 3, y + 4, w, y); g.stroke(); } });
    // фасады: окна рядами, несколько расцветок
    const FAC = [['#d8cfc0', '#4a6a8a'], ['#9fb3c8', '#203850'], ['#c97a5a', '#3a4a5a'], ['#e8e2d8', '#6a8aa8'], ['#5a6a7a', '#9fd0ff'], ['#d9b26a', '#3d4f62'], ['#7a8f6a', '#2a3a4a'], ['#e0a0b0', '#40506a']];
    T.facades = FAC.map(([wall, win], k) => tex(64, 64, (g, w, h) => {
      noiseFill(g, w, h, wall, 0.06, 200);
      const glass = k === 4;
      for (let y = 6; y < h; y += 16) for (let x = 5; x < w; x += 16) { g.fillStyle = Math.random() < 0.15 ? '#f6e7a0' : win; g.fillRect(x, y, glass ? 14 : 8, glass ? 12 : 9); }
      g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, h - 2, w, 2);
    }));
    T.roof = tex(64, 64, (g, w, h) => { noiseFill(g, w, h, '#6a6a70', 0.1, 400); g.fillStyle = '#55555b'; g.fillRect(10, 10, 14, 10); g.fillRect(36, 30, 18, 14); });
    T.house = tex(64, 64, (g, w, h) => { noiseFill(g, w, h, '#f0e6d2', 0.05, 200); g.fillStyle = '#5a7aa0'; g.fillRect(10, 22, 14, 14); g.fillRect(40, 22, 14, 14); g.fillStyle = '#8a5a3a'; g.fillRect(26, 34, 12, 30); });
    return T;
  };

  // ---------- сборка геометрии из коробок ----------
  // Простая «сварка» многих коробок в один BufferGeometry, чтобы весь город рисовался за несколько вызовов.
  N.Builder = function () {
    const p = [], n = [], u = [], c = [], idx = [];
    const B = {
      // коробка: центр по x,z, низ на y0; масштаб текстуры us (метров на повтор)
      box(x, y0, z, w, h, d, us = 0, color = null, top = true) {
        const x0 = x - w / 2, x1 = x + w / 2, y1 = y0 + h, z0 = z - d / 2, z1 = z + d / 2;
        const faces = [
          [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], d, h],
          [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], d, h],
          [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], w, h],
          [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], w, h],
        ];
        if (top) faces.push([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], w, d]);
        for (const [a, b, cc, dd, nn, fw, fh] of faces) {
          const s = p.length / 3; p.push(...a, ...b, ...cc, ...dd); for (let k = 0; k < 4; k++) n.push(...nn);
          const ru = us ? fw / us : 1, rv = us ? fh / us : 1; u.push(0, 0, ru, 0, ru, rv, 0, rv);
          const col = color || [1, 1, 1]; for (let k = 0; k < 4; k++) c.push(...col);
          idx.push(s, s + 1, s + 2, s, s + 2, s + 3);
        }
      },
      // горизонтальный прямоугольник (дорога, тротуар); along — вдоль Z или X для поворота текстуры
      quad(x0, z0, x1, z1, y, us = 8, vs = 8, alongX = false) {
        const s = p.length / 3; p.push(x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0); for (let k = 0; k < 4; k++) { n.push(0, 1, 0); c.push(1, 1, 1); }
        const W = (x1 - x0) / us, H = (z1 - z0) / vs;
        if (alongX) u.push(0, 0, 0, W, H, W, H, 0); else u.push(0, 0, W, 0, W, H, 0, H);
        idx.push(s, s + 1, s + 2, s, s + 2, s + 3);
      },
      geo() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
        g.setIndex(p.length / 3 > 65000 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
        g.computeBoundingSphere(); return g;
      },
      empty: () => !idx.length,
    };
    return B;
  };

  // ---------- план города ----------
  N.plan = function () {
    const r = rng(20261117), buildings = [], props = [], parks = new Set();
    const downtown = (bx, bz) => Math.hypot(bx - 7, bz - 6.5);
    for (const k of ['3,7', '4,7', '9,2']) parks.add(k);
    for (let bx = 0; bx < GN; bx++) for (let bz = 0; bz < GN; bz++) {
      const x0 = bx * CELL + HALF, z0 = bz * CELL + HALF, S = CELL - ROAD;   // квартал 60×60
      if (parks.has(bx + ',' + bz)) { props.push({ type: 'park', x0, z0, x1: x0 + S, z1: z0 + S }); continue; }
      const dt = downtown(bx, bz), suburb = bx <= 1 || bz >= 10 || dt > 6.5;
      const lots = suburb ? 4 : r() < 0.4 ? 1 : r() < 0.6 ? 2 : 4;
      const cells = lots === 1 ? [[0, 0, 1, 1]] : lots === 2 ? (r() < 0.5 ? [[0, 0, 0.5, 1], [0.5, 0, 1, 1]] : [[0, 0, 1, 0.5], [0, 0.5, 1, 1]]) : [[0, 0, 0.5, 0.5], [0.5, 0, 1, 0.5], [0, 0.5, 0.5, 1], [0.5, 0.5, 1, 1]];
      for (const [a, b, c2, d] of cells) {
        const m = 4, lx0 = x0 + a * S + m, lx1 = x0 + c2 * S - m, lz0 = z0 + b * S + m, lz1 = z0 + d * S - m;
        if (r() < 0.08 && !suburb) continue; // пустырь
        let h;
        if (suburb) h = 6 + r() * 8; else h = Math.max(12, (90 - dt * 12) * (0.5 + r() * 0.9) + (dt < 2 && r() < 0.4 ? 70 : 0));
        const w = lx1 - lx0, dd = lz1 - lz0, shrink = suburb ? 0.75 + r() * 0.15 : 0.85 + r() * 0.15;
        buildings.push({ x: (lx0 + lx1) / 2, z: (lz0 + lz1) / 2, w: w * shrink, d: dd * shrink, h, fac: suburb ? -1 : Math.floor(r() * 8), suburb });
      }
    }
    // пальмы на пляже и вдоль набережной
    for (let z = -200; z < N.MAX + 150; z += 14 + r() * 10) props.push({ type: 'palm', x: N.BEACH + 12 + r() * 30, z });
    // фонари на перекрёстках
    for (let i = 0; i <= GN; i++) for (let j = 0; j <= GN; j++) if ((i + j) % 2 === 0) props.push({ type: 'lamp', x: N.roadX(i) + HALF + 1, z: N.roadX(j) + HALF + 1 });
    return { buildings, props };
  };

  // ---------- столкновения ----------
  // Прямоугольники зданий в сетке 40×40 м для быстрого поиска.
  N.Collide = function (boxes) {
    const C = 40, grid = new Map();
    const key = (i, j) => i * 10000 + j;
    for (const b of boxes) {
      for (let i = Math.floor(b.x0 / C); i <= Math.floor(b.x1 / C); i++) for (let j = Math.floor(b.z0 / C); j <= Math.floor(b.z1 / C); j++) { const k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(b); }
    }
    return {
      boxes,
      near(x, z) { return grid.get(key(Math.floor(x / C), Math.floor(z / C))) || []; },
      // выталкивает круг (x,z,r) из зданий ниже высоты y; возвращает нормаль удара или null
      push(o, r, y = 0) {
        let hit = null;
        for (let i = Math.floor((o.x - r) / C); i <= Math.floor((o.x + r) / C); i++) for (let j = Math.floor((o.z - r) / C); j <= Math.floor((o.z + r) / C); j++) {
          const list = grid.get(key(i, j)); if (!list) continue;
          for (const b of list) {
            if (y > b.h - 0.2) continue;
            const cx = Math.max(b.x0, Math.min(o.x, b.x1)), cz = Math.max(b.z0, Math.min(o.z, b.z1));
            const dx = o.x - cx, dz = o.z - cz, dd = dx * dx + dz * dz;
            if (dd < r * r) {
              if (dd > 1e-6) { const l = Math.sqrt(dd); o.x = cx + dx / l * r; o.z = cz + dz / l * r; hit = { nx: dx / l, nz: dz / l }; }
              else { // центр внутри: выталкиваем к ближней стороне
                const opts = [[o.x - b.x0, -1, 0], [b.x1 - o.x, 1, 0], [o.z - b.z0, 0, -1], [b.z1 - o.z, 0, 1]].sort((a, q) => a[0] - q[0])[0];
                if (opts[1]) o.x = opts[1] < 0 ? b.x0 - r : b.x1 + r; else o.z = opts[2] < 0 ? b.z0 - r : b.z1 + r; hit = { nx: opts[1], nz: opts[2] };
              }
            }
          }
        }
        return hit;
      },
      // высота крыши под точкой (0, если улица)
      roofAt(x, z) { for (const b of this.near(x, z)) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return b.h; return 0; },
      // луч по зданиям: расстояние до первого попадания
      ray(o, d, maxD) {
        let best = maxD;
        const steps = Math.ceil(maxD / 20);
        const seen = new Set();
        for (let s = 0; s <= steps; s++) {
          const px = o.x + d.x * s * 20, pz = o.z + d.z * s * 20;
          for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) for (const b of grid.get(key(Math.floor(px / C) + a, Math.floor(pz / C) + c)) || []) {
            if (seen.has(b)) continue; seen.add(b);
            // пересечение луча с коробкой
            let t0 = 0, t1 = best;
            for (const [oo, dd, lo, hi] of [[o.x, d.x, b.x0, b.x1], [o.y, d.y, 0, b.h], [o.z, d.z, b.z0, b.z1]]) {
              if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) { t0 = 1; t1 = 0; break; } continue; }
              let ta = (lo - oo) / dd, tb = (hi - oo) / dd; if (ta > tb) [ta, tb] = [tb, ta];
              t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) break;
            }
            if (t0 <= t1 && t0 < best) best = t0;
          }
          if (best < s * 20) break;
        }
        return best;
      },
    };
  };

  // ---------- граф дорог для машин и пешеходов ----------
  N.node = (i, j) => ({ x: N.roadX(i), z: N.roadX(j) });
  N.nearestNode = (x, z) => [Math.max(0, Math.min(GN, Math.round(x / CELL))), Math.max(0, Math.min(GN, Math.round(z / CELL)))];
  N.onRoad = (x, z) => {
    if (x < N.MIN || z < N.MIN || x > N.MAX || z > N.MAX) return false;
    const fx = ((x + HALF) % CELL + CELL) % CELL, fz = ((z + HALF) % CELL + CELL) % CELL;
    return fx < ROAD || fz < ROAD;
  };

  // ---------- построение сцены ----------
  N.buildCity = function (scene, T, plan) {
    const lam = (map, extra = {}) => new THREE.MeshLambertMaterial(Object.assign({ map }, extra));
    const add = (B, mat) => { if (B.empty()) return null; const m = new THREE.Mesh(B.geo(), mat); scene.add(m); return m; };
    // море и земля вокруг
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), lam(T.water, { color: '#ffffff' })); T.water.repeat.set(300, 300); sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.6, 0); scene.add(sea);
    const ground = N.Builder(), sandB = N.Builder(), roadB = N.Builder(), roadXB = N.Builder(), asphB = N.Builder(), walkB = N.Builder(), grassB = N.Builder(), runB = N.Builder();
    sandB.quad(N.BEACH - 40, -420, N.MIN, 1000, -0.05, 10, 10);
    grassB.quad(N.MIN, -420, 1000, N.MIN, -0.04, 10, 10); grassB.quad(N.MAX, N.MIN, 1000, 1000, -0.04, 10, 10); grassB.quad(N.MIN, N.MAX, N.MAX, 1000, -0.04, 10, 10);
    // дороги: отрезки между перекрёстками и квадраты перекрёстков
    for (let i = 0; i <= GN; i++) for (let j = 0; j <= GN; j++) {
      const x = N.roadX(i), z = N.roadX(j);
      asphB.quad(x - HALF, z - HALF, x + HALF, z + HALF, 0.01, 14, 14);
      if (j < GN) roadB.quad(x - HALF, z + HALF, x + HALF, z + CELL - HALF, 0.01, ROAD, 12);
      if (i < GN) roadXB.quad(x + HALF, z - HALF, x + CELL - HALF, z + HALF, 0.01, 12, ROAD, true);
    }
    // дорога к аэропорту и сам аэропорт
    const A = N.AIR;
    asphB.quad(A.x0, A.z0, A.x1, A.z1, 0.005, 14, 14);
    runB.quad(A.x0 + 20, A.rz - 22, A.x1 - 20, A.rz + 22, 0.02, 160, 44, true);
    roadB.quad(N.roadX(6) - HALF, A.z1, N.roadX(6) + HALF, -HALF, 0.01, ROAD, 12);
    // кварталы: тротуары, парки
    const parkSet = new Set(plan.props.filter((p) => p.type === 'park').map((p) => p.x0 + ',' + p.z0));
    for (let bx = 0; bx < GN; bx++) for (let bz = 0; bz < GN; bz++) {
      const x0 = bx * CELL + HALF, z0 = bz * CELL + HALF, S = CELL - ROAD;
      if (parkSet.has(x0 + ',' + z0)) { walkB.box(x0 + S / 2, 0, z0 + S / 2, S, 0.18, S, 6); grassB.quad(x0 + 3, z0 + 3, x0 + S - 3, z0 + S - 3, 0.19, 8, 8); }
      else walkB.box(x0 + S / 2, 0, z0 + S / 2, S, 0.18, S, 6);
    }
    add(sandB, lam(T.sand)); add(grassB, lam(T.grass)); add(asphB, lam(T.asphalt)); add(walkB, lam(T.walk));
    add(roadB, lam(T.road)); add(roadXB, lam(T.road)); add(runB, lam(T.runway));
    // здания: по материалу фасада
    const facB = T.facades.map(() => N.Builder()), roofB = N.Builder(), houseB = N.Builder(), boxes = [];
    for (const b of plan.buildings) {
      const B = b.fac < 0 ? houseB : facB[b.fac];
      B.box(b.x, 0, b.z, b.w, b.h, b.d, b.fac < 0 ? 0 : 8, null, false);
      roofB.box(b.x, b.h - 0.01, b.z, b.w, 0.4, b.d, 8);
      if (b.fac < 0) roofB.box(b.x, b.h + 0.39, b.z, b.w * 0.7, 1.8, b.d * 0.7, 8);
      boxes.push({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2, h: b.h + 0.4 });
    }
    facB.forEach((B, i) => add(B, lam(T.facades[i])));
    add(houseB, lam(T.house)); add(roofB, lam(T.roof));
    // аэропорт: терминал и ангар
    const air = N.Builder();
    const term = { x: 420, z: -70, w: 120, d: 26, h: 16 }, hang = { x: 760, z: -75, w: 60, d: 40, h: 22 }, tower = { x: 560, z: -70, w: 10, d: 10, h: 38 };
    for (const b of [term, hang, tower]) { air.box(b.x, 0, b.z, b.w, b.h, b.d, 8); boxes.push({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2, h: b.h }); }
    add(air, lam(T.facades[4]));
    // пальмы, деревья в парках, фонари
    const trunk = N.Builder(), leaf = N.Builder(), pole = N.Builder();
    const r = rng(7);
    for (const p of plan.props) {
      if (p.type === 'palm') { trunk.box(p.x, 0, p.z, 0.6, 9, 0.6, 0, [0.55, 0.4, 0.25]); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; leaf.box(p.x + Math.cos(a) * 2, 8.6, p.z + Math.sin(a) * 2, k % 2 ? 1.4 : 4.4, 0.4, k % 2 ? 4.4 : 1.4, 0, [0.25, 0.6, 0.25]); } leaf.box(p.x, 9, p.z, 1.6, 0.8, 1.6, 0, [0.3, 0.65, 0.3]); boxes.push({ x0: p.x - 0.4, x1: p.x + 0.4, z0: p.z - 0.4, z1: p.z + 0.4, h: 9 }); }
      if (p.type === 'park') for (let k = 0; k < 9; k++) { const x = p.x0 + 8 + r() * (p.x1 - p.x0 - 16), z = p.z0 + 8 + r() * (p.z1 - p.z0 - 16); trunk.box(x, 0, z, 0.8, 4, 0.8, 0, [0.5, 0.35, 0.2]); leaf.box(x, 3.5, z, 4.5, 4, 4.5, 0, [0.3, 0.55 + r() * 0.15, 0.25]); boxes.push({ x0: x - 0.5, x1: x + 0.5, z0: z - 0.5, z1: z + 0.5, h: 7 }); }
      if (p.type === 'lamp') { pole.box(p.x, 0, p.z, 0.25, 7, 0.25, 0, [0.35, 0.36, 0.4]); pole.box(p.x - 0.8, 7, p.z - 0.8, 1.8, 0.25, 1.8, 0, [0.9, 0.9, 0.7]); }
    }
    add(trunk, new THREE.MeshLambertMaterial({ vertexColors: true })); add(leaf, new THREE.MeshLambertMaterial({ vertexColors: true })); add(pole, new THREE.MeshLambertMaterial({ vertexColors: true }));
    return N.Collide(boxes);
  };

  // ---------- картинка для миникарты ----------
  N.mapImage = function (plan) {
    const Bd = N.BOUNDS, S = 0.5, W = (Bd.x1 - Bd.x0) * S, H = (Bd.z1 - Bd.z0) * S;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const X = (x) => (x - Bd.x0) * S, Z = (z) => (z - Bd.z0) * S;
    g.fillStyle = '#2a6aa0'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#4c7a3e'; g.fillRect(X(N.BEACH), 0, W, H);
    g.fillStyle = '#d9c88e'; g.fillRect(X(N.BEACH - 40), 0, X(N.MIN) - X(N.BEACH - 40), H);
    g.fillStyle = '#5a5d66'; g.fillRect(X(N.AIR.x0), Z(N.AIR.z0), (N.AIR.x1 - N.AIR.x0) * S, (N.AIR.z1 - N.AIR.z0) * S);
    g.fillStyle = '#26282e'; g.fillRect(X(N.AIR.x0 + 20), Z(N.AIR.rz - 22), (N.AIR.x1 - N.AIR.x0 - 40) * S, 44 * S);
    g.fillStyle = '#9a978f'; g.fillRect(X(N.MIN), Z(N.MIN), (N.MAX - N.MIN) * S, (N.MAX - N.MIN) * S);
    for (const p of plan.props) if (p.type === 'park') { g.fillStyle = '#5aa04a'; g.fillRect(X(p.x0), Z(p.z0), (p.x1 - p.x0) * S, (p.z1 - p.z0) * S); }
    g.fillStyle = '#6f6c66'; for (const b of plan.buildings) g.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), b.w * S, b.d * S);
    g.fillStyle = '#e8e6e0';
    for (let i = 0; i <= GN; i++) { g.fillRect(X(N.roadX(i) - HALF), Z(N.MIN), ROAD * S, (N.MAX - N.MIN) * S); g.fillRect(X(N.MIN), Z(N.roadX(i) - HALF), (N.MAX - N.MIN) * S, ROAD * S); }
    g.fillRect(X(N.roadX(6) - HALF), Z(N.AIR.z1), ROAD * S, (N.AIR.z1 < 0 ? -N.AIR.z1 : 0) * S);
    return { canvas: c, S, X, Z };
  };
})();
