'use strict';
// Турбобол — ядро: данные (машины, вещи, режимы, арены), профиль игрока, физика матча и боты.
// Физика своя и простая: машина — коробка (руль, газ, буст, прыжок, кувырок, полёт), мяч — шар.
// Одна и та же симуляция работает и в игре с ботами, и у ведущего сетевого матча, и у гостей (для плавности).
(() => {
  const TB = window.TB = {};

  // ——— Машины: у каждой свой вид и характеристики ———
  TB.CARS = [
    { id: 'strizh', name: 'Стриж', price: 0, desc: 'Лёгкий и шустрый, хорош для всех', hx: 1.0, hy: 0.5, hz: 1.95, speed: 24, accel: 32, turn: 2.7, jump: 12.5, mass: 1.0 },
    { id: 'buyvol', name: 'Буйвол', price: 0, desc: 'Широкий пикап, крепко бьёт по мячу', hx: 1.2, hy: 0.62, hz: 2.15, speed: 22.5, accel: 28, turn: 2.35, jump: 12, mass: 1.35 },
    { id: 'osa', name: 'Оса', price: 300, desc: 'Маленькая, вёрткая, быстро прыгает', hx: 0.9, hy: 0.45, hz: 1.7, speed: 24.5, accel: 34, turn: 3.0, jump: 13.2, mass: 0.85 },
    { id: 'kometa', name: 'Комета', price: 450, desc: 'Самая быстрая на прямой', hx: 1.0, hy: 0.42, hz: 2.2, speed: 26, accel: 33, turn: 2.45, jump: 12.2, mass: 0.95 },
    { id: 'bronya', name: 'Броня', price: 600, desc: 'Тяжёлый броневик: сносит всех', hx: 1.3, hy: 0.7, hz: 2.3, speed: 22, accel: 26, turn: 2.2, jump: 11.5, mass: 1.6 },
    { id: 'prizrak', name: 'Призрак', price: 800, desc: 'Машина будущего, ровная во всём', hx: 1.05, hy: 0.48, hz: 2.05, speed: 25, accel: 33, turn: 2.75, jump: 12.8, mass: 1.1 },
  ];
  TB.COLORS = [
    ['#3a8bff', 'Небо', 0], ['#ff8a1a', 'Апельсин', 0], ['#f4f4fb', 'Снег', 0], ['#2a2738', 'Графит', 0], ['#ff4f6d', 'Рубин', 0], ['#5df2a5', 'Мята', 0],
    ['#ffd23f', 'Солнце', 60], ['#9d73f7', 'Сирень', 60], ['#6fe3ff', 'Лёд', 60], ['#ff7ad9', 'Фуксия', 80], ['#2fbf71', 'Изумруд', 80], ['#8b5a2b', 'Шоколад', 80],
    ['#c0c6d6', 'Серебро', 120], ['#d4af37', 'Золото', 250], ['#111111', 'Ночь', 120], ['#ff2b2b', 'Пламя', 120],
  ].map(([c, name, price], i) => ({ id: 'c' + i, c, name, price }));
  TB.WHEELS = [
    { id: 'std', name: 'Обычные', price: 0, rim: '#c7cbe0', em: '⚙️' }, { id: 'sport', name: 'Спорт', price: 100, rim: '#ff4f6d', em: '🛞' },
    { id: 'neon', name: 'Неон', price: 180, rim: '#6fe3ff', glow: true, em: '💠' }, { id: 'gold', name: 'Золотые', price: 300, rim: '#ffd23f', em: '🪙' },
    { id: 'star', name: 'Звёзды', price: 240, rim: '#bca0ff', star: true, em: '⭐' },
  ];
  TB.TOPPERS = [
    { id: 'none', name: 'Ничего', price: 0, em: '∅' }, { id: 'cap', name: 'Кепка', price: 120, em: '🧢' }, { id: 'horns', name: 'Рога', price: 150, em: '😈' },
    { id: 'cat', name: 'Ушки', price: 160, em: '🐱' }, { id: 'prop', name: 'Пропеллер', price: 180, em: '🚁' }, { id: 'halo', name: 'Нимб', price: 200, em: '😇' },
    { id: 'crown', name: 'Корона', price: 250, em: '👑' }, { id: 'cone', name: 'Конус', price: 90, em: '🔺' },
  ];
  TB.ANTENNAS = [
    { id: 'none', name: 'Нет', price: 0, em: '∅' }, { id: 'flag', name: 'Флажок', price: 80, em: '🚩' }, { id: 'ball', name: 'Шарик', price: 60, em: '🔴' },
    { id: 'star', name: 'Звезда', price: 120, em: '⭐' }, { id: 'heart', name: 'Сердце', price: 120, em: '❤️' },
  ];
  TB.TRAILS = [
    { id: 'fire', name: 'Огонь', price: 0, cols: ['#ffd23f', '#ff8a1a', '#ff4f2b'], em: '🔥' }, { id: 'ice', name: 'Лёд', price: 150, cols: ['#ffffff', '#6fe3ff', '#3a8bff'], em: '❄️' },
    { id: 'toxic', name: 'Кислота', price: 200, cols: ['#e8ff6b', '#5df2a5', '#1f9e5a'], em: '🧪' }, { id: 'stars', name: 'Звёзды', price: 250, cols: ['#ffffff', '#ffd23f', '#bca0ff'], em: '✨' },
    { id: 'rainbow', name: 'Радуга', price: 350, cols: ['#ff4f6d', '#ffd23f', '#5df2a5', '#3a8bff', '#9d73f7'], em: '🌈' },
  ];
  TB.SLOTS = { body: TB.CARS, color: TB.COLORS, accent: TB.COLORS, wheels: TB.WHEELS, topper: TB.TOPPERS, antenna: TB.ANTENNAS, trail: TB.TRAILS };
  TB.byId = (list, id) => list.find((x) => x.id === id) || list[0];

  TB.RULES = [
    { id: 'classic', name: 'Классика', desc: '3 минуты. Больше голов — победа, при ничьей — золотой гол.', time: 180 },
    { id: 'first3', name: 'До 3 голов', desc: 'Без часов: кто первым забьёт три.', time: 0, goals: 3 },
    { id: 'heavy', name: 'Тяжёлый мяч', desc: 'Огромный и тяжёлый мяч, 3 минуты.', time: 180, ballR: 3.0, ballMass: 0.9 },
    { id: 'moon', name: 'Луна', desc: 'Низкая гравитация: прыжки до потолка, 3 минуты.', time: 180, grav: 0.45 },
    { id: 'chaos', name: 'Хаос', desc: 'Бесконечный буст и быстрый мяч, 2 минуты.', time: 120, infBoost: true, ballBounce: 1.15 },
  ];
  TB.THEMES = [
    { id: 'stadium', name: 'Стадион', floor: '#2f8f4e', floor2: '#2a8247', line: '#ffffff', wall: '#9fc7ff', sky: '#18233d', glow: '#bfe1ff' },
    { id: 'neon', name: 'Неон', floor: '#151233', floor2: '#1b1740', line: '#ff4fd8', wall: '#6fe3ff', sky: '#08061a', glow: '#ff4fd8' },
    { id: 'desert', name: 'Пустыня', floor: '#d9b26b', floor2: '#cfa760', line: '#fff3d6', wall: '#ffcf8a', sky: '#5b3a2a', glow: '#ffd27a' },
    { id: 'ice', name: 'Лёд', floor: '#dbefff', floor2: '#cfe6fb', line: '#3a8bff', wall: '#b9e3ff', sky: '#1b2a44', glow: '#9fd8ff' },
    { id: 'space', name: 'Космос', floor: '#241a44', floor2: '#2b1f52', line: '#ffd23f', wall: '#bca0ff', sky: '#05040e', glow: '#bca0ff' },
  ];
  TB.SIZES = { S: [27, 40, 16], M: [33, 50, 19], L: [40, 60, 22] };   // половина ширины, половина длины, высота

  // Встроенные арены — это те же «карты», только неизменяемые.
  TB.ARENAS = [
    { id: 'a-stadium', name: 'Стадион', size: 'M', theme: 0, goalW: 17, grav: 1, objs: [] },
    { id: 'a-neon', name: 'Неоновый город', size: 'M', theme: 1, goalW: 17, grav: 1, objs: [
      { t: 'ramp', x: -24, z: -20, w: 8, d: 10, h: 3, r: 90 }, { t: 'ramp', x: 24, z: 20, w: 8, d: 10, h: 3, r: 270 },
      { t: 'ramp', x: 24, z: -20, w: 8, d: 10, h: 3, r: 270 }, { t: 'ramp', x: -24, z: 20, w: 8, d: 10, h: 3, r: 90 }] },
    { id: 'a-desert', name: 'Каньон', size: 'L', theme: 2, goalW: 18, grav: 1, objs: [
      { t: 'box', x: 0, z: 0, w: 6, d: 2, h: 2, r: 0 }, { t: 'bumper', x: -18, z: 0, w: 3, d: 3, h: 2.5, r: 0 }, { t: 'bumper', x: 18, z: 0, w: 3, d: 3, h: 2.5, r: 0 },
      { t: 'ramp', x: 0, z: -32, w: 10, d: 8, h: 2.5, r: 180 }, { t: 'ramp', x: 0, z: 32, w: 10, d: 8, h: 2.5, r: 0 }] },
    { id: 'a-ice', name: 'Каток', size: 'S', theme: 3, goalW: 15, grav: 1, ice: true, objs: [] },
    { id: 'a-space', name: 'Орбитальная', size: 'M', theme: 4, goalW: 18, grav: 0.6, objs: [
      { t: 'bumper', x: 0, z: 0, w: 4, d: 4, h: 3, r: 0 }, { t: 'pad', x: -14, z: 0, w: 2, d: 2, h: 1, r: 0 }, { t: 'pad', x: 14, z: 0, w: 2, d: 2, h: 1, r: 0 }] },
  ];

  // ——— Профиль: монеты, купленные вещи, выбранная машина ———
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  TB.store = store;
  const DEF = { coins: 150, owned: {}, car: { body: 'strizh', color: 'c0', accent: 'c2', wheels: 'std', topper: 'none', antenna: 'none', trail: 'fire' }, stats: { games: 0, wins: 0, goals: 0 }, maps: [], prefs: { size: 2, rule: 'classic', arena: 'a-stadium', bot: 1, ballCam: true, muted: false } };
  TB.profile = Object.assign({}, DEF, store.get('turbobol-profile', {}));
  for (const k of ['car', 'stats', 'prefs']) TB.profile[k] = Object.assign({}, DEF[k], TB.profile[k] || {});
  TB.save = () => store.set('turbobol-profile', TB.profile);
  TB.owns = (slot, it) => !it.price || !!TB.profile.owned[slot + ':' + it.id];
  TB.look = () => ({ ...TB.profile.car });

  // ——— Карты ———
  TB.allMaps = () => TB.ARENAS.concat(TB.profile.maps || []);
  TB.mapById = (id) => TB.allMaps().find((m) => m.id === id) || TB.ARENAS[0];
  const ENC_T = { box: 'b', ramp: 'r', bumper: 'u', pad: 'p' };
  TB.encodeMap = (m) => btoa(unescape(encodeURIComponent(JSON.stringify({ n: m.name, s: m.size, th: m.theme, g: m.goalW, gr: m.grav, o: m.objs.map((o) => [ENC_T[o.t] || 'b', Math.round(o.x * 2) / 2, Math.round(o.z * 2) / 2, o.w, o.d, o.h, o.r]) }))));
  TB.decodeMap = (code) => {
    const d = JSON.parse(decodeURIComponent(escape(atob(String(code).trim()))));
    const T = { b: 'box', r: 'ramp', u: 'bumper', p: 'pad' };
    const num = (v, a, b, def) => (Number.isFinite(+v) ? Math.max(a, Math.min(b, +v)) : def);
    return { id: 'm' + Date.now().toString(36), name: String(d.n || 'Карта').slice(0, 24), size: ['S', 'M', 'L'].includes(d.s) ? d.s : 'M', theme: num(d.th, 0, TB.THEMES.length - 1, 0) | 0,
      goalW: num(d.g, 10, 26, 17), grav: num(d.gr, 0.3, 1.5, 1),
      objs: (d.o || []).slice(0, 80).map((o) => ({ t: T[o[0]] || 'box', x: num(o[1], -60, 60, 0), z: num(o[2], -60, 60, 0), w: num(o[3], 1, 20, 4), d: num(o[4], 1, 20, 4), h: num(o[5], 0.5, 10, 2), r: num(o[6], 0, 359, 0) })) };
  };

  // ——— Мир матча ———
  const V = { add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len: (a) => Math.hypot(a[0], a[1], a[2]) };
  TB.V = V;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  TB.clamp = clamp; TB.wrapA = wrapA;
  const DT = 1 / 60;
  TB.DT = DT;

  // Подготовленная арена: размеры, ворота, препятствия в удобном для столкновений виде, площадки буста.
  TB.buildArena = (map) => {
    const [Wd, L, Hc] = TB.SIZES[map.size] || TB.SIZES.M;
    const A = { map, Wd, L, Hc, goalW: map.goalW || 17, goalH: 7.5, goalD: 8, grav: 26 * (map.grav || 1), ice: !!map.ice, theme: TB.THEMES[map.theme | 0] || TB.THEMES[0], objs: [], pads: [] };
    for (const o of map.objs || []) {
      const a = (o.r || 0) * Math.PI / 180;
      const ob = { ...o, c: Math.cos(a), s: Math.sin(a), hw: o.w / 2, hd: o.d / 2 };
      if (o.t === 'pad') A.pads.push({ x: o.x, z: o.z, big: true, t: 0 }); else A.objs.push(ob);
    }
    // стандартные площадки буста
    const bx = Wd - 4, bz = L - 6;
    for (const [x, z] of [[-bx, 0], [bx, 0], [-bx, -bz], [bx, -bz], [-bx, bz], [bx, bz]]) A.pads.push({ x, z, big: true, t: 0 });
    for (const fx of [-0.55, 0, 0.55]) for (const fz of [-0.72, -0.36, 0.36, 0.72]) A.pads.push({ x: fx * Wd, z: fz * L, big: false, t: 0 });
    for (const fx of [-0.3, 0.3]) A.pads.push({ x: fx * Wd, z: 0, big: false, t: 0 });
    // площадки не должны оказаться внутри препятствий
    A.pads = A.pads.filter((p) => !A.objs.some((o) => o.t !== 'ramp' && Math.abs(toLocal(o, p.x, p.z)[0]) < o.hw + 1 && Math.abs(toLocal(o, p.x, p.z)[1]) < o.hd + 1));
    return A;
  };
  function toLocal(o, x, z) { const dx = x - o.x, dz = z - o.z; return [dx * o.c - dz * o.s, dx * o.s + dz * o.c]; }
  function toWorldDir(o, lx, lz) { return [lx * o.c + lz * o.s, -lx * o.s + lz * o.c]; }
  TB.toLocal = toLocal;

  // Высота пола в точке: трамплины (подъём вдоль своей длины) и крыши ящиков, если стоишь на них.
  function groundAt(A, x, z, y) {
    let g = 0;
    for (const o of A.objs) {
      if (o.t === 'bumper') continue;
      const [lx, lz] = toLocal(o, x, z);
      if (Math.abs(lx) > o.hw || Math.abs(lz) > o.hd) continue;
      if (o.t === 'ramp') g = Math.max(g, o.h * (lz + o.hd) / o.d);
      else if (y !== undefined && y >= o.h - 0.35) g = Math.max(g, o.h);
    }
    return g;
  }
  TB.groundAt = groundAt;

  // ——— Матч ———
  TB.Match = class {
    constructor(cfg) {
      // cfg: { map, rule, size, players: [{ id, name, team, look, bot, level }] }
      this.cfg = cfg;
      this.A = TB.buildArena(cfg.map);
      this.rule = TB.RULES.find((r) => r.id === cfg.rule) || TB.RULES[0];
      this.G = this.A.grav * (this.rule.grav || 1);
      this.ballR = this.rule.ballR || 1.9;
      this.ballMass = this.rule.ballMass || 0.38;
      this.score = [0, 0]; this.time = this.rule.time || 0; this.over = false; this.overtime = false;
      this.phase = 'kickoff'; this.phaseT = 3; this.t = 0; this.events = [];
      this.ball = { p: [0, this.ballR, 0], v: [0, 0, 0], last: null, last2: null };
      this.cars = cfg.players.map((p, i) => this.makeCar(p, i));
      this.kickoff();
    }
    makeCar(p, i) {
      const spec = TB.byId(TB.CARS, p.look && p.look.body);
      return { id: p.id, name: p.name, team: p.team, look: p.look, bot: !!p.bot, level: p.level ?? 1, spec, idx: i,
        p: [0, spec.hy, 0], v: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, flip: null, ground: true, airT: 0, canSecond: false, boost: 33, demo: 0,
        inp: { th: 0, st: 0, jump: false, boost: false, drift: false }, prevJump: false, hitCd: 0, stats: { goals: 0, shots: 0, saves: 0, score: 0 }, supersonic: false, ai: { t: 0 } };
    }
    kickoff() {
      const A = this.A, b = this.ball;
      b.p = [0, this.ballR + 0.01, 0]; b.v = [0, 0, 0]; b.last = null;
      const spots = [[0, -0.62], [-0.42, -0.5], [0.42, -0.5], [-0.2, -0.8], [0.2, -0.8], [0, -0.92]];
      const byTeam = [0, 0];
      for (const c of this.cars) {
        const k = byTeam[c.team]++ % spots.length, [fx, fz] = spots[k], s = c.team ? -1 : 1;
        c.p = [fx * A.Wd * s, c.spec.hy, fz * A.L * s]; c.v = [0, 0, 0];
        c.yaw = Math.atan2(-c.p[0], -c.p[2]);   // носом к мячу в центре
        c.pitch = 0; c.roll = 0; c.flip = null; c.ground = true; c.boost = 33; c.demo = 0; c.canSecond = false;
      }
      for (const p of A.pads) p.t = 0;
      this.phase = 'kickoff'; this.phaseT = 3;
    }
    // один шаг физики 1/60 с
    step() {
      const dt = DT;
      this.t += dt;
      if (this.client) {
        // у гостя сетевого матча фазы, время и счёт задаёт ведущий; здесь — только физика для плавности
        if (this.phase === 'over') return;
        for (const p of this.A.pads) if (p.t > 0) p.t -= dt;
        for (const c of this.cars) this.stepCar(c, dt);
        this.carCars();
        if (this.phase === 'play') this.stepBall(dt);
        for (const c of this.cars) if (!c.demo) this.carBall(c);
        return;
      }
      if (this.phase === 'kickoff') { this.phaseT -= dt; if (this.phaseT <= 0) this.phase = 'play'; }
      else if (this.phase === 'goal') { this.phaseT -= dt; if (this.phaseT <= 0) { if (this.endCheck()) return; this.kickoff(); } }
      else if (this.phase === 'play' && this.rule.time && !this.overtime) {
        this.time = Math.max(0, this.time - dt);
        if (this.time <= 0 && this.ball.p[1] < this.ballR + 0.3) {
          if (this.score[0] !== this.score[1]) { this.finish(); return; }
          this.overtime = true; this.events.push({ k: 'ot' });
        }
      }
      if (this.phase === 'over') return;
      for (const p of this.A.pads) if (p.t > 0) p.t -= dt;
      for (const c of this.cars) {
        if (c.bot) TB.botThink(this, c, dt);
        this.stepCar(c, dt);
      }
      this.carCars();
      if (this.phase !== 'kickoff') this.stepBall(dt); else { this.ball.v = [0, 0, 0]; }
      for (const c of this.cars) if (!c.demo) this.carBall(c);
    }
    endCheck() {
      if (this.rule.goals && Math.max(...this.score) >= this.rule.goals) { this.finish(); return true; }
      if (this.overtime) { this.finish(); return true; }
      return false;
    }
    finish() { this.phase = 'over'; this.over = true; this.events.push({ k: 'over' }); }

    stepCar(c, dt) {
      const A = this.A, s = c.spec, inp = c.inp;
      if (c.demo > 0) {
        c.demo -= dt;
        if (c.demo <= 0) { const z = (c.team ? 1 : -1) * A.L * 0.85; c.p = [(Math.random() - 0.5) * 20, s.hy + 2, z]; c.v = [0, 0, 0]; c.yaw = c.team ? Math.PI : 0; c.boost = 33; c.ground = false; }
        return;
      }
      if (this.phase === 'kickoff') { c.v = [0, 0, 0]; c.prevJump = inp.jump; return; }
      const fwdF = [Math.sin(c.yaw), 0, Math.cos(c.yaw)], right = [-Math.cos(c.yaw), 0, Math.sin(c.yaw)];
      const jumpPressed = inp.jump && !c.prevJump; c.prevJump = inp.jump;
      const boosting = inp.boost && (c.boost > 0 || this.rule.infBoost);
      if (boosting && !this.rule.infBoost) c.boost = Math.max(0, c.boost - 33 * dt);
      c.hitCd = Math.max(0, c.hitCd - dt);
      if (c.ground) {
        let vf = V.dot(c.v, fwdF), vl = V.dot(c.v, right);
        const max = boosting ? 34 : s.speed;
        if (inp.th > 0.05) { if (vf < 0) vf += 45 * inp.th * dt; else if (vf < s.speed) vf = Math.min(s.speed, vf + s.accel * inp.th * dt); }
        else if (inp.th < -0.05) { if (vf > 0) vf += 45 * inp.th * dt; else vf = Math.max(-13, vf + s.accel * 0.7 * inp.th * dt); }
        else { const d = 7 * dt; vf = Math.abs(vf) < d ? 0 : vf - Math.sign(vf) * d; }
        if (boosting) vf = Math.min(34, vf + 24 * dt);
        if (vf > max && !boosting) vf = Math.max(max, vf - 12 * dt);
        const grip = A.ice ? 2.2 : inp.drift ? 1.6 : 11;
        vl *= Math.exp(-grip * dt);
        const spd = Math.abs(vf);
        const tr = s.turn * Math.min(1, spd / 5) * (1 - 0.35 * Math.min(1, spd / 30)) * (inp.drift ? 1.55 : 1);
        c.yaw = wrapA(c.yaw - inp.st * tr * dt * (vf >= 0 ? 1 : -1));
        const f2 = [Math.sin(c.yaw), 0, Math.cos(c.yaw)], r2 = [-Math.cos(c.yaw), 0, Math.sin(c.yaw)];
        c.v = [f2[0] * vf + r2[0] * vl, 0, f2[2] * vf + r2[2] * vl];
        c.pitch *= Math.exp(-10 * dt); c.roll *= Math.exp(-10 * dt);
        if (jumpPressed) { c.v[1] = s.jump * (this.rule.grav ? 0.9 : 1); c.ground = false; c.airT = 0; c.canSecond = true; this.events.push({ k: 'jump', id: c.id }); }
        // по полу и трамплинам
        const g0 = groundAt(A, c.p[0], c.p[2], c.p[1] - s.hy);
        const nx = c.p[0] + c.v[0] * dt, nz = c.p[2] + c.v[2] * dt;
        const g1 = groundAt(A, nx, nz, c.p[1] - s.hy);
        if (c.ground) {
          if (g1 > g0 + 0.7) { c.v[0] *= -0.2; c.v[2] *= -0.2; }       // вертикальная стенка (бок трамплина, ящик)
          else {
            c.p[0] = nx; c.p[2] = nz;
            // съехал с края: вертикальная скорость с трамплина остаётся — машина взлетает
            if (g1 < g0 - 0.35) { c.ground = false; c.airT = 0; c.canSecond = true; c.v[1] = Math.max(0, c.rampVy || 0); }
            else { c.p[1] = g1 + s.hy; c.v[1] = (g1 - g0) / dt; c.rampVy = c.v[1]; }
            // на трамплине нос смотрит вверх по склону
            const slope = (groundAt(A, c.p[0] + fwdF[0] * 0.8, c.p[2] + fwdF[2] * 0.8, c.p[1]) - groundAt(A, c.p[0] - fwdF[0] * 0.8, c.p[2] - fwdF[2] * 0.8, c.p[1])) / 1.6;
            c.pitch = -Math.atan(slope);
          }
        } else { c.p[0] = nx; c.p[2] = nz; }
      } else {
        // в воздухе: руль крутит, газ наклоняет нос, буст толкает туда, куда смотрит нос
        c.airT += dt;
        if (!c.flip) {
          c.yaw = wrapA(c.yaw - inp.st * 2.6 * dt);
          c.pitch = clamp(c.pitch - inp.th * 3.2 * dt, -1.45, 1.45);
          c.roll *= Math.exp(-4 * dt);
        }
        if (jumpPressed && c.canSecond && c.airT < 1.4) {
          c.canSecond = false;
          const dirMag = Math.hypot(inp.th, inp.st);
          if (dirMag > 0.35) {
            // кувырок: рывок туда, куда наклонён стик, и сильный удар по мячу
            const dx = (fwdF[0] * inp.th + right[0] * inp.st) / dirMag, dz = (fwdF[2] * inp.th + right[2] * inp.st) / dirMag;
            c.v[0] += dx * 10.5; c.v[2] += dz * 10.5; c.v[1] = Math.max(c.v[1] * 0.3, 2.5);
            c.flip = { t: 0, ax: inp.th / dirMag, ar: inp.st / dirMag }; this.events.push({ k: 'flip', id: c.id });
          } else { c.v[1] = Math.max(c.v[1], 0) + s.jump * 0.72; this.events.push({ k: 'jump', id: c.id }); }
        }
        if (c.flip) { c.flip.t += dt; if (c.flip.t > 0.55) c.flip = null; }
        if (boosting) {
          const cp = Math.cos(c.pitch);
          const dir = [Math.sin(c.yaw) * cp, Math.sin(c.pitch), Math.cos(c.yaw) * cp];
          c.v = V.add(c.v, V.mul(dir, 30 * dt));
        }
        c.v[1] -= this.G * dt;
        const sp = V.len(c.v); if (sp > 40) c.v = V.mul(c.v, 40 / sp);
        c.p = V.add(c.p, V.mul(c.v, dt));
        const g = groundAt(A, c.p[0], c.p[2], c.p[1] - s.hy);
        if (c.p[1] - s.hy <= g && c.v[1] <= 0) { c.p[1] = g + s.hy; c.v[1] = 0; c.ground = true; c.flip = null; c.canSecond = false; this.events.push({ k: 'land', id: c.id }); }
      }
      // стены арены и ворота
      const rad = Math.max(s.hx, s.hz) * 0.85, inMouth = Math.abs(c.p[0]) < A.goalW / 2 - rad * 0.6 && c.p[1] < A.goalH;
      if (Math.abs(c.p[0]) > A.Wd - rad) { c.p[0] = Math.sign(c.p[0]) * (A.Wd - rad); c.v[0] *= -0.25; }
      const zLim = inMouth ? A.L + A.goalD - rad : A.L - rad;
      if (Math.abs(c.p[2]) > zLim) { c.p[2] = Math.sign(c.p[2]) * zLim; c.v[2] *= -0.25; }
      if (Math.abs(c.p[2]) > A.L - rad && !inMouth && Math.abs(c.p[2]) < A.L + 1) { c.p[2] = Math.sign(c.p[2]) * (A.L - rad); }
      if (Math.abs(c.p[2]) > A.L && Math.abs(c.p[0]) > A.goalW / 2 - rad * 0.6) { c.p[0] = Math.sign(c.p[0]) * (A.goalW / 2 - rad * 0.6); c.v[0] *= -0.25; }
      if (Math.abs(c.p[2]) > A.L && c.p[1] > A.goalH - s.hy) { c.p[1] = A.goalH - s.hy; c.v[1] = Math.min(0, c.v[1]); }
      if (c.p[1] > A.Hc - s.hy) { c.p[1] = A.Hc - s.hy; c.v[1] = Math.min(0, c.v[1]); }
      // препятствия
      for (const o of A.objs) this.pushOut(c, o, rad, true);
      // площадки буста
      for (const p of A.pads) {
        if (p.t > 0 || c.p[1] > 3 || this.client) continue;
        const r = p.big ? 2.6 : 1.6;
        if ((c.p[0] - p.x) ** 2 + (c.p[2] - p.z) ** 2 < r * r && c.boost < 100) { c.boost = Math.min(100, c.boost + (p.big ? 100 : 12)); p.t = p.big ? 10 : 4; this.events.push({ k: 'pad', id: c.id, big: p.big }); }
      }
      const hs = Math.hypot(c.v[0], c.v[2]);
      c.supersonic = hs > 30;
    }

    // Выталкивание шара (машины или мяча) из ящика / отбойника.
    pushOut(b, o, r, isCar) {
      if (o.t === 'ramp') return;
      const y = isCar ? b.p[1] - b.spec.hy : b.p[1] - r;
      const [lx, lz] = toLocal(o, b.p[0], b.p[2]);
      if (o.t === 'bumper') {
        const R = o.hw, d = Math.hypot(lx, lz);
        if (d < R + r && y < o.h) {
          const [nx, nz] = toWorldDir(o, lx / (d || 1), lz / (d || 1));
          b.p[0] += nx * (R + r - d); b.p[2] += nz * (R + r - d);
          const vn = b.v[0] * nx + b.v[2] * nz;
          const kick = Math.max(16, -vn * 1.2);
          b.v[0] += nx * (kick - vn); b.v[2] += nz * (kick - vn);
          this.events.push({ k: 'bump' });
        }
        return;
      }
      if (y >= o.h - 0.3) return;   // сверху — это пол, им занимается groundAt
      const cx = clamp(lx, -o.hw, o.hw), cz = clamp(lz, -o.hd, o.hd);
      let dx = lx - cx, dz = lz - cz, d = Math.hypot(dx, dz);
      if (d >= r) return;
      if (d < 1e-4) { // центр внутри — выталкиваем к ближайшему краю
        const ex = o.hw - Math.abs(lx), ez = o.hd - Math.abs(lz);
        if (ex < ez) { dx = Math.sign(lx) || 1; dz = 0; } else { dz = Math.sign(lz) || 1; dx = 0; }
        d = 0;
      } else { dx /= d; dz /= d; }
      const [nx, nz] = toWorldDir(o, dx, dz);
      b.p[0] += nx * (r - d); b.p[2] += nz * (r - d);
      const vn = b.v[0] * nx + b.v[2] * nz;
      if (vn < 0) { const e = isCar ? 1.2 : 1.7; b.v[0] -= e * vn * nx; b.v[2] -= e * vn * nz; }
    }

    stepBall(dt) {
      const A = this.A, b = this.ball, r = this.ballR, bounce = this.rule.ballBounce || 1;
      b.v[1] -= this.G * 0.82 * dt;
      b.v = V.mul(b.v, 1 - 0.025 * dt);
      const sp = V.len(b.v); if (sp > 60) b.v = V.mul(b.v, 60 / sp);
      b.p = V.add(b.p, V.mul(b.v, dt));
      // пол (с наклоном на трамплинах)
      const g = groundAt(A, b.p[0], b.p[2]);
      if (b.p[1] < g + r) {
        b.p[1] = g + r;
        let n = [0, 1, 0];
        if (g > 0) { const e = 0.4, gx = groundAt(A, b.p[0] + e, b.p[2]) - groundAt(A, b.p[0] - e, b.p[2]), gz = groundAt(A, b.p[0], b.p[2] + e) - groundAt(A, b.p[0], b.p[2] - e); n = [-gx / (2 * e), 1, -gz / (2 * e)]; const l = V.len(n); n = V.mul(n, 1 / l); }
        const vn = V.dot(b.v, n);
        if (vn < 0) { b.v = V.sub(b.v, V.mul(n, (1 + 0.6 * bounce) * vn)); if (-vn < 2.2) b.v = V.sub(b.v, V.mul(n, V.dot(b.v, n))); }
        b.v[0] *= 1 - 0.35 * dt; b.v[2] *= 1 - 0.35 * dt;
      }
      const e = 0.72 * bounce;
      if (b.p[1] > A.Hc - r) { b.p[1] = A.Hc - r; b.v[1] = -Math.abs(b.v[1]) * e; }
      if (Math.abs(b.p[0]) > A.Wd - r) { b.p[0] = Math.sign(b.p[0]) * (A.Wd - r); b.v[0] = -b.v[0] * e; this.events.push({ k: 'wall', v: Math.abs(b.v[0]) }); }
      const mouth = Math.abs(b.p[0]) < A.goalW / 2 - r * 0.3 && b.p[1] < A.goalH - r * 0.3;
      if (Math.abs(b.p[2]) > A.L - r && !mouth && Math.abs(b.p[2]) < A.L + 0.5) { b.p[2] = Math.sign(b.p[2]) * (A.L - r); b.v[2] = -b.v[2] * e; this.events.push({ k: 'wall', v: Math.abs(b.v[2]) }); }
      if (Math.abs(b.p[2]) > A.L) {
        // внутри ворот: сетка сзади, по бокам и сверху
        if (Math.abs(b.p[2]) > A.L + A.goalD - r) { b.p[2] = Math.sign(b.p[2]) * (A.L + A.goalD - r); b.v[2] *= -0.3; }
        if (Math.abs(b.p[0]) > A.goalW / 2 - r) { b.p[0] = Math.sign(b.p[0]) * (A.goalW / 2 - r); b.v[0] *= -0.3; }
        if (b.p[1] > A.goalH - r) { b.p[1] = A.goalH - r; b.v[1] = -Math.abs(b.v[1]) * 0.3; }
      }
      for (const o of A.objs) this.pushOut(b, o, r, false);
      // гол: мяч целиком за линией ворот
      if (this.phase === 'play' && !this.client && Math.abs(b.p[2]) > A.L + r) {
        const team = b.p[2] > 0 ? 0 : 1;   // синие (0) атакуют ворота +Z
        this.score[team]++;
        const sc = b.last && this.cars.find((c) => c.id === b.last);
        const scorer = sc && sc.team === team ? sc : null;
        if (scorer) { scorer.stats.goals++; scorer.stats.score += 100; }
        const as = b.last2 && b.last2 !== b.last && this.cars.find((c) => c.id === b.last2 && c.team === team);
        if (as) as.stats.score += 50;
        this.events.push({ k: 'goal', team, by: scorer ? scorer.name : sc ? sc.name : '', own: !!(sc && sc.team !== team), byId: scorer ? scorer.id : null, speed: Math.round(V.len(b.v) * 3.6) });
        this.phase = 'goal'; this.phaseT = 3;
        if (this.overtime) this.phaseT = 2.5;
      }
    }

    // Удар машины по мячу: коробка машины против шара, к отскоку добавляется «сила удара».
    carBall(c) {
      const b = this.ball, s = c.spec, r = this.ballR;
      const d = V.sub(b.p, c.p);
      if (V.len(d) > r + s.hz + 1.5) return;
      const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
      const f = [sy * cp, sp, cy * cp], rt = [-cy, 0, sy], up = [-sy * sp, cp, -cy * sp];
      const lx = V.dot(d, rt), ly = V.dot(d, up), lz = V.dot(d, f);
      const qx = clamp(lx, -s.hx, s.hx), qy = clamp(ly, -s.hy, s.hy), qz = clamp(lz, -s.hz, s.hz);
      const ex = lx - qx, ey = ly - qy, ez = lz - qz, dist = Math.hypot(ex, ey, ez);
      if (dist >= r) return;
      let n;
      if (dist > 1e-4) n = V.add(V.add(V.mul(rt, ex / dist), V.mul(up, ey / dist)), V.mul(f, ez / dist));
      else { const l = V.len(d) || 1; n = V.mul(d, 1 / l); }
      b.p = V.add(b.p, V.mul(n, r - dist + 0.01));
      const rel = V.sub(b.v, c.v), vn = V.dot(rel, n);
      if (vn < 0) {
        const mc = s.mass, mb = this.ballMass, k = (1 + 0.6) * vn * mc / (mc + mb);
        b.v = V.sub(b.v, V.mul(n, k));
        if (c.hitCd <= 0) {
          // сила удара: чем быстрее машина врезается, тем дальше летит мяч; кувырок бьёт сильнее
          const power = clamp(-vn, 0, 45) * (c.flip ? 0.55 : 0.32) + 4;
          const dir = V.add(V.mul(n, 0.75), V.mul(f, 0.25));
          b.v = V.add(b.v, V.mul(dir, power * (0.38 / mb) ** 0.35));
          c.v = V.add(c.v, V.mul(n, k * mb / mc * 0.25));
          c.hitCd = 0.12;
          if (b.last !== c.id) { b.last2 = b.last; b.last = c.id; }
          c.stats.score += 2;
          // удар в сторону чужих ворот — «удар по воротам»
          const goalZ = c.team ? -this.A.L : this.A.L;
          if (Math.sign(b.v[2]) === Math.sign(goalZ) && Math.abs(b.p[0] + b.v[0] * Math.abs((goalZ - b.p[2]) / (b.v[2] || 1e-3))) < this.A.goalW / 2 && Math.abs(b.v[2]) > 12) { c.stats.shots++; c.stats.score += 10; }
          // отбил мяч, летевший в свои ворота
          const ownZ = -goalZ;
          if (Math.sign(-vn) && Math.abs(b.p[2] - ownZ) < 14 && Math.sign(rel[2]) === Math.sign(ownZ) && Math.abs(rel[2]) > 14) { c.stats.saves++; c.stats.score += 50; this.events.push({ k: 'save', by: c.name, team: c.team }); }
          this.events.push({ k: 'hit', id: c.id, power: -vn });
        }
      }
    }

    // Машины толкаются; разогнанная до сверхзвука машина взрывает соперника.
    carCars() {
      const cs = this.cars;
      for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
        const a = cs[i], b = cs[j];
        if (a.demo > 0 || b.demo > 0) continue;
        const d = V.sub(b.p, a.p), dist = V.len(d), R = 1.5 + (a.spec.hx + b.spec.hx) * 0.5;
        if (dist >= R || dist < 1e-4) continue;
        const n = V.mul(d, 1 / dist), ma = a.spec.mass, mb = b.spec.mass;
        a.p = V.sub(a.p, V.mul(n, (R - dist) * mb / (ma + mb))); b.p = V.add(b.p, V.mul(n, (R - dist) * ma / (ma + mb)));
        const va = V.dot(a.v, n), vb = V.dot(b.v, n);
        if (va - vb <= 0) continue;
        if (a.team !== b.team && this.phase === 'play' && !this.client) {
          if (a.supersonic && va > 22) { this.demolish(b, a); continue; }
          if (b.supersonic && -vb > 22) { this.demolish(a, b); continue; }
        }
        const p = (va - vb) * 1.3 / (ma + mb);
        a.v = V.sub(a.v, V.mul(n, p * mb)); b.v = V.add(b.v, V.mul(n, p * ma));
        a.v[1] += 2; b.v[1] += 2; a.ground = false; b.ground = false; a.canSecond = true; b.canSecond = true;
        this.events.push({ k: 'bonk' });
      }
    }
    demolish(victim, by) { victim.demo = 3; victim.v = [0, 0, 0]; by.stats.score += 25; this.events.push({ k: 'demo', by: by.name, who: victim.name, p: victim.p.slice(), team: by.team }); }
  };

  // ——— Боты ———
  // Нападающий заходит за мяч со стороны своих ворот и бьёт к чужим; остальные держат позицию между мячом и своими воротами.
  TB.botThink = (m, c, dt) => {
    const A = m.A, b = m.ball, inp = c.inp, lv = c.level;
    const ai = c.ai; ai.t -= dt;
    // застрял (упёрся в стенку и стоит): сдаём назад с поворотом
    const hs = Math.hypot(c.v[0], c.v[2]);
    if (m.phase === 'play' && c.ground && Math.abs(inp.th) > 0.4 && hs < 2) ai.stuck = (ai.stuck || 0) + dt; else ai.stuck = Math.max(0, (ai.stuck || 0) - dt * 2);
    if (ai.back > 0) { ai.back -= dt; inp.th = -1; inp.st = ai.backSt; inp.boost = false; inp.jump = false; inp.drift = false; if (ai.back <= 0) ai.stuck = 0; return; }
    if (ai.stuck > 0.8) { ai.back = 0.9; ai.backSt = Math.random() < 0.5 ? -1 : 1; return; }
    const react = [0.22, 0.12, 0.05][lv] ?? 0.12;
    if (ai.t > 0) return;
    ai.t = react;
    if (c.demo > 0) return;
    const attackZ = c.team ? -A.L : A.L, ownZ = -attackZ;
    // кто ближе всех из команды к мячу — тот нападает
    const mates = m.cars.filter((x) => x.team === c.team && !x.demo);
    const distTo = (x) => Math.hypot(x.p[0] - b.p[0], x.p[2] - b.p[2]);
    const first = mates.reduce((a, x) => (distTo(x) < distTo(a) ? x : a), mates[0]);
    let tx, tz, wantBoost = false, aggressive = first === c;
    // предсказание: где будет мяч через небольшое время
    const lead = Math.min(1.2, distTo(c) / 30);
    const bx = b.p[0] + b.v[0] * lead, bz = b.p[2] + b.v[2] * lead;
    if (m.phase === 'kickoff' || (m.phase === 'play' && m.t < 0.1)) aggressive = first === c;
    if (aggressive) {
      // точка за мячом на линии «мяч — чужие ворота»
      const gx = clamp(bx, -A.goalW / 3, A.goalW / 3) * 0.3, dx = gx - bx, dz = attackZ - bz, dl = Math.hypot(dx, dz) || 1;
      const behind = (c.p[2] - bz) * Math.sign(attackZ) < -1;   // мы на своей стороне от мяча?
      const off = behind ? m.ballR + 1.2 : m.ballR + 6;
      tx = bx - dx / dl * off; tz = bz - dz / dl * off;
      if (!behind) { tx += (c.p[0] > bx ? 1 : -1) * 6; }    // объезжаем мяч сбоку
      if (behind && Math.hypot(tx - c.p[0], tz - c.p[2]) < 9) { tx = bx; tz = bz; }
      wantBoost = lv > 0 && distTo(c) > 12;
    } else {
      // защитник: между мячом и своими воротами
      const k = mates.indexOf(c) % 2 ? 0.55 : 0.75;
      tx = clamp(bx * 0.5, -A.goalW / 2, A.goalW / 2); tz = ownZ + (bz - ownZ) * (1 - k);
      if (Math.abs(b.p[2] - ownZ) < 18 && Math.sign(b.v[2]) === Math.sign(ownZ)) { tx = bx; tz = bz; wantBoost = true; }
    }
    const dx = tx - c.p[0], dz = tz - c.p[2], dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz), diff = wrapA(want - c.yaw);
    const sloppy = [0.35, 0.15, 0][lv] ?? 0.15;
    inp.st = clamp(-diff * 2.6 + (Math.random() - 0.5) * sloppy, -1, 1);
    inp.th = Math.abs(diff) > 2.4 && dist < 10 ? -1 : Math.abs(diff) < 1.5 ? 1 : 0.5;
    inp.drift = c.ground && Math.abs(diff) > 1.3 && Math.hypot(c.v[0], c.v[2]) > 12;
    inp.boost = (wantBoost || (m.phase !== 'play' && aggressive)) && Math.abs(diff) < 0.35 && c.boost > (lv ? 5 : 30);
    if (m.phase === 'kickoff') inp.boost = aggressive;
    // прыжок к высокому мячу и кувырок в мяч
    const bd = Math.hypot(b.p[0] - c.p[0], b.p[2] - c.p[2]);
    inp.jump = false;
    if (c.ground && bd < 6 + m.ballR && b.p[1] > 2.6 + m.ballR * 0.3 && b.p[1] < 9 && lv > 0) inp.jump = true;
    else if (c.ground && bd < 3.2 + m.ballR && aggressive && lv > 0 && Math.random() < 0.25) inp.jump = true;
    else if (!c.ground && c.canSecond && bd < 3.6 + m.ballR && c.airT > 0.12) { inp.jump = !c.prevJump; inp.th = 1; inp.st = clamp(-diff, -1, 1); }
    if (!c.ground) inp.th = c.flip ? inp.th : clamp(c.pitch * 1.5, -1, 1) * (inp.jump ? 0 : 1);  // в воздухе выравниваемся
  };
})();
