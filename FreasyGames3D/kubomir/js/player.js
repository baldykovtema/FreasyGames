'use strict';
// Кубомир: блочная фигурка игрока (другие игроки в сети и вид от третьего лица), рука от первого лица с предметом
// и броня на фигурке.
(function () {
  const KM = window.KM, G = window.G, B = KM.B;
  const AW = KM.ACOLS * KM.TS, AH = KM.AROWS * KM.TS;
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });

  // ---------- предмет в руке ----------
  // Блок — кубик с текстурами граней, остальное — «выдавленная» картинка 16×16 толщиной в один пиксель.
  const cubeMat = new THREE.MeshLambertMaterial({ map: G.atlasTex, alphaTest: 0.5, side: THREE.DoubleSide });
  const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const heldCache = {};
  let atlasPix = null;
  function tileUV(tile) { const tx = tile % KM.ACOLS, ty = (tile / KM.ACOLS) | 0; return [tx * KM.TS / AW, 1 - (ty + 1) * KM.TS / AH, (tx + 1) * KM.TS / AW, 1 - ty * KM.TS / AH]; }
  function cubeGeo(df) {
    const g = boxGeo.clone(), uv = g.attributes.uv, base = boxGeo.attributes.uv.array;
    const faceTile = [df.t[1], df.t[1], df.t[0], df.t[2], df.t[1], df.t[1]]; // +x −x +y −y +z −z
    for (let f = 0; f < 6; f++) { const [u0, v0, u1, v1] = tileUV(faceTile[f]); for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, u0 + base[i * 2] * (u1 - u0), v0 + base[i * 2 + 1] * (v1 - v0)); }
    return g;
  }
  function flatGeo(tile) {
    if (!atlasPix) atlasPix = KM.atlasCanvas.getContext('2d').getImageData(0, 0, AW, AH).data;
    const S = KM.TS, ox = (tile % KM.ACOLS) * S, oy = ((tile / KM.ACOLS) | 0) * S, th = 1 / S;
    const P = [], C = [], N = [];
    const at = (x, y) => (x < 0 || y < 0 || x >= S || y >= S) ? null : (() => { const i = ((oy + y) * AW + ox + x) * 4; return atlasPix[i + 3] > 100 ? [atlasPix[i] / 255, atlasPix[i + 1] / 255, atlasPix[i + 2] / 255] : null; })();
    const quad = (v, n, c, k) => { for (const i of [0, 1, 2, 0, 2, 3]) { P.push(...v[i]); N.push(...n); C.push(c[0] * k, c[1] * k, c[2] * k); } };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const c = at(x, y); if (!c) continue;
      const x0 = x / S - 0.5, x1 = (x + 1) / S - 0.5, y0 = 0.5 - (y + 1) / S, y1 = 0.5 - y / S, z0 = -th / 2, z1 = th / 2;
      quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], c, 1);
      quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], c, 0.8);
      if (!at(x - 1, y)) quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], c, 0.7);
      if (!at(x + 1, y)) quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], c, 0.7);
      if (!at(x, y - 1)) quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], c, 0.9);
      if (!at(x, y + 1)) quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], c, 0.6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    return g;
  }
  // Возвращает { mesh, cube } — новый меш предмета (геометрия общая) или null для пустой руки.
  KM.makeHeld = function (id) {
    if (!id) return null;
    const df = KM.def(id); if (!df) return null;
    let c = heldCache[id];
    if (!c) {
      const cube = !KM.isItem(id) && df.shape === 'cube';
      c = heldCache[id] = { cube, geo: cube ? cubeGeo(df) : flatGeo(KM.isItem(id) ? df.tile : df.t[1]) };
    }
    return { mesh: new THREE.Mesh(c.geo, c.cube ? cubeMat : flatMat), cube: c.cube };
  };

  // ---------- фигурка ----------
  const ARMC = ['#e8e4da', '#c9ccd4', '#5ee8d2'];
  KM.makeCharacter = function (opt = {}) {
    const g = new THREE.Group(), mats = [];
    const M = (c) => { const m = lam(c); mats.push(m); return m; };
    const skin = M('#f2c79b'), shirt = M(opt.color || '#4a8fe0'), pants = M('#33375a'), hair = M('#5a3a22'), shoe = M('#26262e');
    const part = (parent, w, h, d, mat, x, y, z) => { const o = new THREE.Mesh(boxGeo, mat); o.scale.set(w, h, d); o.position.set(x, y, z); parent.add(o); return o; };
    const pivot = (x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); g.add(p); return p; };
    // ноги
    const legL = pivot(-0.125, 0.75, 0), legR = pivot(0.125, 0.75, 0);
    for (const L of [legL, legR]) { part(L, 0.24, 0.63, 0.26, pants, 0, -0.315, 0); part(L, 0.25, 0.13, 0.27, shoe, 0, -0.685, 0); }
    // туловище
    part(g, 0.5, 0.66, 0.27, shirt, 0, 1.08, 0);
    // руки: рукав и кисть
    const armL = pivot(-0.37, 1.36, 0), armR = pivot(0.37, 1.36, 0);
    for (const A of [armL, armR]) { part(A, 0.23, 0.34, 0.25, shirt, 0, -0.14, 0); part(A, 0.22, 0.32, 0.24, skin, 0, -0.46, 0); }
    // голова: лицо смотрит в −Z
    const head = pivot(0, 1.41, 0);
    part(head, 0.44, 0.44, 0.44, skin, 0, 0.22, 0);
    part(head, 0.46, 0.12, 0.46, hair, 0, 0.42, 0); part(head, 0.46, 0.3, 0.1, hair, 0, 0.28, 0.19);
    const eyeW = new THREE.MeshBasicMaterial({ color: '#ffffff' }), eyeD = new THREE.MeshBasicMaterial({ color: '#23233a' });
    for (const s of [-1, 1]) { part(head, 0.11, 0.07, 0.02, eyeW, s * 0.1, 0.24, -0.222); part(head, 0.05, 0.07, 0.02, eyeD, s * 0.1 + s * 0.03, 0.24, -0.226); }
    part(head, 0.14, 0.03, 0.02, M('#b3705a'), 0, 0.11, -0.222);
    // броня (видна, когда надета)
    const armor = [[], [], [], []], armMats = [M(ARMC[0]), M(ARMC[0]), M(ARMC[0]), M(ARMC[0])];
    armor[0].push(part(head, 0.5, 0.2, 0.5, armMats[0], 0, 0.4, 0), part(head, 0.5, 0.26, 0.08, armMats[0], 0, 0.26, 0.22));
    armor[1].push(part(g, 0.54, 0.6, 0.31, armMats[1], 0, 1.11, 0)); for (const A of [armL, armR]) armor[1].push(part(A, 0.27, 0.24, 0.29, armMats[1], 0, -0.1, 0));
    for (const L of [legL, legR]) armor[2].push(part(L, 0.27, 0.36, 0.29, armMats[2], 0, -0.2, 0));
    for (const L of [legL, legR]) armor[3].push(part(L, 0.28, 0.22, 0.3, armMats[3], 0, -0.62, -0.01));
    for (const a of armor) for (const o of a) o.visible = false;
    for (const m of mats) m.userData.base = m.color.clone();
    const hand = new THREE.Group(); hand.position.set(0, -0.6, -0.1); armR.add(hand);
    return { g, head, armL, armR, legL, legR, hand, armor, armMats, mats, heldId: 0, held: null, armorKey: '', walk: 0, swing: 0 };
  };
  // tiers: четыре числа (−1 — не надето, 0..2 — шерсть, железо, кристалл)
  KM.setCharArmor = function (ch, tiers) {
    const key = tiers.join(','); if (key === ch.armorKey) return; ch.armorKey = key;
    tiers.forEach((t, i) => { for (const o of ch.armor[i]) o.visible = t >= 0; if (t >= 0) { ch.armMats[i].color.set(ARMC[t] || ARMC[0]); ch.armMats[i].userData.base = ch.armMats[i].color.clone(); } });
  };
  KM.setCharHeld = function (ch, id) {
    if (ch.heldId === id) return; ch.heldId = id;
    if (ch.held) ch.hand.remove(ch.held);
    const h = KM.makeHeld(id); ch.held = h ? h.mesh : null;
    if (h) { const s = h.cube ? 0.28 : 0.5; h.mesh.scale.set(s, s, s); if (h.cube) h.mesh.position.set(0, -0.05, -0.12); else { h.mesh.position.set(0, 0.05, -0.2); h.mesh.rotation.set(0, Math.PI / 2, Math.PI * 0.25); } ch.hand.add(h.mesh); }
  };
  KM.tintChar = function (ch, br) { const k = 0.35 + br * 0.85; for (const m of ch.mats) if (m.userData.base) m.color.copy(m.userData.base).multiplyScalar(k); };
  // speed — скорость по земле (м/с), swing — фаза удара 0..1 (0 — не бьёт)
  KM.animChar = function (ch, dt, speed, pitch, swing) {
    const amp = Math.min(1, speed / 4.3) * 0.75;
    ch.walk += dt * (3 + speed * 1.9) * (amp > 0.05 ? 1 : 0);
    if (amp <= 0.05) ch.walk *= 0.9;
    const s = Math.sin(ch.walk) * amp;
    ch.legL.rotation.x = s; ch.legR.rotation.x = -s;
    ch.armL.rotation.x = -s * 0.8; ch.armL.rotation.z = -0.06;
    const hold = ch.heldId ? 0.35 : 0;
    ch.armR.rotation.x = s * 0.8 + hold + (swing > 0 ? Math.sin(swing * Math.PI) * 1.5 : 0); ch.armR.rotation.z = 0.06;
    ch.head.rotation.x = Math.max(-1.1, Math.min(1.1, pitch));
  };

  // ---------- рука от первого лица ----------
  const handScene = new THREE.Scene();
  const handCam = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
  const hHemi = new THREE.HemisphereLight('#ffffff', '#6a6680', 0.8), hDir = new THREE.DirectionalLight('#ffffff', 0.5); hDir.position.set(-0.3, 1, 0.6);
  handScene.add(hHemi, hDir);
  const fp = new THREE.Group(); handScene.add(fp);
  const fpArm = new THREE.Group(); fp.add(fpArm);
  const skinFP = lam('#f2c79b'), sleeveFP = lam('#4a8fe0'), fpArmorMat = lam(ARMC[0]);
  const fpPart = (w, h, d, mat, x, y, z) => { const o = new THREE.Mesh(boxGeo, mat); o.scale.set(w, h, d); o.position.set(x, y, z); fpArm.add(o); return o; };
  // рука вытянута вдоль своей оси −Y → кисть в начале координат группы, рукав уходит вниз за край экрана
  fpPart(0.14, 0.26, 0.14, skinFP, 0, -0.13, 0);
  fpPart(0.155, 0.5, 0.155, sleeveFP, 0, -0.51, 0);
  const fpArmor = fpPart(0.18, 0.2, 0.18, fpArmorMat, 0, -0.62, 0); fpArmor.visible = false;
  const fpHand = new THREE.Group(); fpArm.add(fpHand);
  let fpHeldId = -1, fpHeld = null, fpCube = false;
  // поза руки на экране (подобрана по скриншотам)
  // x — доля половины ширины экрана, чтобы рука оставалась в углу и на узком экране телефона
  const FP = G.fpPose = { x: 0.62, y: -0.34, z: -0.62, rx: -0.3, ry: 0, rz: 0.45, sx: 0.7, sy: 0.3, sz: 0.2, block: 0.13, item: 0.26 };
  let swingT = 0, equipT = 0, bobPh = 0, bobAmp = 0, swingCount = 0;
  G.swingHand = function () { if (swingT <= 0) { swingT = 1; swingCount = (swingCount + 1) % 1000; } };
  G.swingState = () => ({ t: swingT, n: swingCount });
  function setFPHeld(id) {
    if (fpHeldId === id) return;
    if (fpHeldId !== -1) equipT = 1;
    fpHeldId = id; if (fpHeld) fpHand.remove(fpHeld); fpHeld = null;
    const h = KM.makeHeld(id); if (!h) return;
    fpHeld = h.mesh; fpCube = h.cube;
    if (h.cube) { h.mesh.scale.setScalar(FP.block); h.mesh.position.set(0.0, 0.07, -0.02); h.mesh.rotation.set(0.15, 0.75, 0); }
    else { h.mesh.scale.setScalar(FP.item); h.mesh.position.set(0, 0.12, -0.04); h.mesh.rotation.set(-0.25, Math.PI / 2 + 0.15, 0.3); }
    fpHand.add(h.mesh);
  }
  function brightAt(p) {
    const W = G.world, lt = W.lightAt(p.d, Math.floor(p.x), Math.floor(p.y + G.EYE), Math.floor(p.z));
    return Math.max(lt[0] / 15 * (p.d === 1 ? 0 : G.dayFactor()), lt[1] / 15, p.d === 1 ? 0.35 : 0.1);
  }
  G.armorTiers = () => { const a = G.player && G.player.armor; return [0, 1, 2, 3].map((i) => a && a[i] ? KM.I[a[i][0]].armor.tier : -1); };

  // ---------- вид от третьего лица ----------
  G.view = 0; // 0 — из глаз, 1 — сзади
  let self = null;
  G.toggleView = function () { G.view = G.view ? 0 : 1; G.toast(G.view ? '👁 Вид от третьего лица' : '👁 Вид из глаз', 1400); };
  const tmpV = new THREE.Vector3();
  G.tickAvatar = function (dt) {
    const p = G.player, cam = G.camera, W = G.world;
    if (swingT > 0) swingT = Math.max(0, swingT - dt / 0.3);
    if (equipT > 0) equipT = Math.max(0, equipT - dt / 0.25);
    const sp = Math.hypot(p.vx, p.vz), walking = (p.onGround || p.fly) && sp > 0.6 && !G.paused;
    bobAmp += ((walking ? Math.min(1, sp / 4.3) : 0) - bobAmp) * Math.min(1, dt * 8);
    if (!G.paused) bobPh += dt * (4 + sp * 1.6);
    const s = G.held(), id = s ? s[0] : 0, br = brightAt(p), tiers = G.armorTiers();
    // камера сзади: отступаем от глаз, пока не упрёмся в блок
    if (G.view === 1) {
      const dv = G.lookDir(); let dist = 0;
      for (let k = 0.2; k <= 4; k += 0.1) { tmpV.copy(cam.position).addScaledVector(dv, -k); const b = W.get(p.d, Math.floor(tmpV.x), Math.floor(tmpV.y), Math.floor(tmpV.z)); if (b < 0 || (b > 0 && B[b].solid)) break; dist = k; }
      cam.position.addScaledVector(dv, -Math.max(0, dist - 0.15));
    }
    if (G.view === 1 && G.state === 'play') {
      if (!self) { self = KM.makeCharacter({ color: '#4a8fe0' }); G.scene.add(self.g); }
      self.g.visible = true; self.g.position.set(p.x, p.y, p.z); self.g.rotation.y = p.yaw;
      KM.setCharHeld(self, id); KM.setCharArmor(self, tiers); KM.tintChar(self, br);
      KM.animChar(self, G.paused ? 0 : dt, walking ? sp : 0, p.pitch, swingT > 0 ? 1 - swingT : 0);
    } else if (self) self.g.visible = false;
    // рука
    setFPHeld(id);
    fpArmor.visible = tiers[1] >= 0; if (tiers[1] >= 0) fpArmorMat.color.set(ARMC[tiers[1]]);
    const t = FP.freeze != null ? FP.freeze : swingT > 0 ? 1 - swingT : 0, sw = Math.sin(t * Math.PI), sw2 = Math.sin(Math.sqrt(t) * Math.PI);
    const bx = Math.sin(bobPh) * 0.022 * bobAmp, by = -Math.abs(Math.cos(bobPh)) * 0.022 * bobAmp;
    // на узком экране (телефон вертикально) рука выше и чуть меньше, чтобы не прятаться за панелью предметов
    const asp = cam.aspect, narrow = Math.max(0, Math.min(1, (1.3 - asp) / 0.8)), k = 1 - narrow * 0.3, halfH = Math.tan(35 * Math.PI / 180) * -FP.z, halfW = halfH * asp;
    fp.scale.setScalar(k);
    // удар: рука уходит к центру и вперёд, предмет «клюёт» вниз
    fp.position.set(FP.x * halfW * (1 - sw2 * 0.3) + bx, FP.y + narrow * halfH * 0.32 + by + Math.sin(Math.sqrt(t) * Math.PI * 2) * 0.04 - equipT * 0.35, FP.z - sw2 * 0.08);
    fpArm.rotation.set(FP.rx + sw * FP.sx + (fpHeld && !fpCube ? 0.1 : 0), FP.ry + sw2 * FP.sy, FP.rz + sw * FP.sz);
    hHemi.intensity = 0.25 + br * 0.5; hDir.intensity = 0.1 + br * 0.3;
    handCam.aspect = cam.aspect; handCam.updateProjectionMatrix();
  };
  // второй проход: рука рисуется поверх мира, поэтому не прячется в стенах
  G.renderHand = function (R) {
    if (G.view !== 0 || G.state !== 'play' || !G.player || G.player.hp <= 0) return;
    R.autoClear = false; R.clearDepth(); R.render(handScene, handCam); R.autoClear = true;
  };
  G.hideSelf = () => { if (self) self.g.visible = false; };
})();
