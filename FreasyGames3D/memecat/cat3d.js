'use strict';
/* =====================================================
   Мемный Кот 3D — отрисовка на three.js.
   Физика, уровни, редактор и онлайн остались в index.html без изменений.
   Камера одна и не крутится: смотрит на дорожку сбоку и чуть сзади и едет за котом.
===================================================== */
const Cat3D = (() => {
  const CAT = 0.9, LEN_MAX = 720, MAX_H = 10;
  let renderer, scene, camera, canvas;
  let themeIdx = -1, built = null, levelGroup = null;
  let ground, lane, hills = [], paws = [], stars = null, skyTex = [];
  const fishList = [], particles = [], ghostPool = [];
  let cat = null;
  const mats = {}; // материалы темы

  /* ---------- текстуры ---------- */
  function canvasTex(w, h, draw, repeat) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv);
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    t.anisotropy = 4;
    return t;
  }
  function blockTexture(th) {
    return canvasTex(64, 64, (g) => {
      g.fillStyle = th.blockDark; g.fillRect(0, 0, 64, 64);
      g.fillStyle = th.block; g.fillRect(5, 5, 54, 54);
      g.strokeStyle = th.blockDark; g.lineWidth = 4; g.strokeRect(18, 18, 28, 28);
    });
  }
  function groundTexture(th) {
    return canvasTex(64, 64, (g) => {
      g.fillStyle = th.ground; g.fillRect(0, 0, 64, 64);
      g.strokeStyle = th.line; g.globalAlpha = .55; g.lineWidth = 3;
      g.strokeRect(0, 0, 64, 64);
    }, [800, 10]);
  }
  function skyTexture(th) {
    return canvasTex(4, 256, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, th.sky[0]); grad.addColorStop(1, th.sky[1]);
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    });
  }
  let pawTex = null;
  function pawTexture() {
    if (pawTex) return pawTex;
    pawTex = canvasTex(128, 128, (g) => {
      g.fillStyle = '#fff';
      const x = 64, y = 74, r = 26;
      g.beginPath(); g.ellipse(x, y, r, r * .8, 0, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 4; i++) { const a = -2.4 + i * .55; g.beginPath(); g.arc(x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.25, r * .36, 0, Math.PI * 2); g.fill(); }
    });
    return pawTex;
  }
  let faceTex = null;
  // Лицо кота такое же, как в 2D: огромные глаза с крошечными зрачками, румянец, рот «ω» и усы.
  function catFaceTexture() {
    if (faceTex) return faceTex;
    faceTex = canvasTex(256, 256, (g) => {
      const s = 256, h = s / 2;
      g.fillStyle = '#ff9f1c'; g.fillRect(0, 0, s, s);
      g.strokeStyle = '#a85a00'; g.lineWidth = 12; g.strokeRect(6, 6, s - 12, s - 12);
      g.translate(h, h);
      g.fillStyle = '#e07b00';
      for (let i = -1; i <= 1; i++) g.fillRect(i * s * .18 - s * .04, -h, s * .08, s * .2);
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(-s * .2, -s * .05, s * .17, 0, Math.PI * 2); g.arc(s * .2, -s * .05, s * .17, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#111';
      const pr = s * .055, look = s * .05;
      g.beginPath(); g.arc(-s * .2 + look, -s * .05, pr, 0, Math.PI * 2); g.arc(s * .2 + look, -s * .05, pr, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ff6f91';
      g.beginPath(); g.arc(-s * .32, s * .2, s * .07, 0, Math.PI * 2); g.arc(s * .32, s * .2, s * .07, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#3a1c00'; g.lineWidth = s * .045; g.lineCap = 'round';
      g.beginPath(); g.arc(-s * .06, s * .16, s * .06, 0, Math.PI); g.arc(s * .06, s * .16, s * .06, 0, Math.PI); g.stroke();
      g.beginPath();
      for (const d of [-1, 1]) { g.moveTo(d * s * .25, s * .12); g.lineTo(d * s * .48, s * .06); g.moveTo(d * s * .25, s * .2); g.lineTo(d * s * .48, s * .24); }
      g.stroke();
    });
    return faceTex;
  }
  let sideTex = null;
  function catSideTexture() {
    if (sideTex) return sideTex;
    sideTex = canvasTex(128, 128, (g) => {
      g.fillStyle = '#ff9f1c'; g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#e07b00';
      for (let i = 0; i < 3; i++) g.fillRect(20 + i * 36, 0, 14, 40);
      g.strokeStyle = '#a85a00'; g.lineWidth = 6; g.strokeRect(3, 3, 122, 122);
    });
    return sideTex;
  }
  let finishTex = null;
  function finishTexture() {
    if (finishTex) return finishTex;
    finishTex = canvasTex(32, 320, (g) => {
      for (let r = 0; r < 20; r++) for (let c = 0; c < 2; c++) { g.fillStyle = (r + c) % 2 ? '#fff' : '#111'; g.fillRect(c * 16, r * 16, 16, 16); }
    });
    finishTex.magFilter = THREE.NearestFilter;
    return finishTex;
  }

  /* ---------- кот ---------- */
  function buildCat(opacity = 1) {
    const o = opacity < 1 ? {transparent: true, opacity, depthWrite: false} : {};
    const side = new THREE.MeshLambertMaterial({map: catSideTexture(), ...o});
    const plain = new THREE.MeshLambertMaterial({color: 0xff9f1c, ...o});
    const face = new THREE.MeshLambertMaterial({map: catFaceTexture(), ...o});
    const ear = new THREE.MeshLambertMaterial({color: 0xe07b00, ...o});
    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(CAT, CAT, CAT), [plain, plain, side, plain, face, plain]);
    body.castShadow = true;
    root.add(body);
    for (const x of [-.27, .27]) {
      const e = new THREE.Mesh(new THREE.ConeGeometry(.15, .3, 4), ear);
      e.position.set(x, CAT / 2 + .12, .18); e.rotation.y = Math.PI / 4; e.rotation.z = -x * .8; e.castShadow = true;
      root.add(e);
    }
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(.06, .08, .55, 8), ear);
    tail.position.set(-CAT / 2 - .12, .1, -.1); tail.rotation.z = -1.0; tail.castShadow = true;
    root.add(tail);
    root.userData.mats = [side, plain, face, ear];
    return root;
  }

  /* ---------- уровень ---------- */
  const G = {};
  function shared() {
    if (G.block) return;
    G.block = new THREE.BoxGeometry(1, 1, 1);
    G.leg = new THREE.BoxGeometry(.17, 1.0, .34);
    G.bar = new THREE.BoxGeometry(.38, .13, .34);
    G.pad = new THREE.SphereGeometry(.46, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    G.padBase = new THREE.BoxGeometry(.92, .1, .9);
    G.fishBody = new THREE.SphereGeometry(.3, 14, 10);
    G.fishTail = new THREE.ConeGeometry(.2, .3, 4);
    G.eye = new THREE.SphereGeometry(.05, 8, 6);
    G.part = new THREE.BoxGeometry(.16, .16, .16);
    mats.letter = new THREE.MeshLambertMaterial({color: 0xff3355, emissive: 0x550011});
    mats.letterEdge = new THREE.LineBasicMaterial({color: 0x2a0010});
    mats.pad = new THREE.MeshLambertMaterial({color: 0xffd23f, emissive: 0x332600});
    mats.padBase = new THREE.MeshLambertMaterial({color: 0xc99a00});
    mats.fish = new THREE.MeshLambertMaterial({color: 0x9ff3ff, emissive: 0x1a4a55});
    mats.eye = new THREE.MeshBasicMaterial({color: 0x112233});
    G.letterEdges = [new THREE.EdgesGeometry(G.leg), new THREE.EdgesGeometry(G.bar)];
  }
  function letterA(x, y) {
    const g = new THREE.Group(); g.position.set(x + .5, y, 0);
    for (const d of [-1, 1]) {
      const leg = new THREE.Mesh(G.leg, mats.letter); leg.position.set(d * .19, .48, 0); leg.rotation.z = d * .36; leg.castShadow = true;
      leg.add(new THREE.LineSegments(G.letterEdges[0], mats.letterEdge));
      g.add(leg);
    }
    const bar = new THREE.Mesh(G.bar, mats.letter); bar.position.set(0, .33, 0); bar.castShadow = true;
    bar.add(new THREE.LineSegments(G.letterEdges[1], mats.letterEdge));
    g.add(bar);
    return g;
  }
  function pad(x, y) {
    const g = new THREE.Group(); g.position.set(x + .5, y, 0);
    const dome = new THREE.Mesh(G.pad, mats.pad); dome.scale.y = .7; dome.position.y = .06; dome.castShadow = true;
    const base = new THREE.Mesh(G.padBase, mats.padBase); base.position.y = .05; base.receiveShadow = true;
    g.add(dome, base);
    return g;
  }
  function fish(x, y) {
    const g = new THREE.Group(); g.position.set(x + .5, y + .5, 0);
    const body = new THREE.Mesh(G.fishBody, mats.fish); body.scale.set(1, .6, .5);
    const tail = new THREE.Mesh(G.fishTail, mats.fish); tail.position.x = -.34; tail.rotation.z = Math.PI / 2;
    const eye = new THREE.Mesh(G.eye, mats.eye); eye.position.set(.15, .05, .14);
    g.add(body, tail, eye);
    g.userData = {key: x + ',' + y, x, y};
    return g;
  }
  function buildLevel(lv) {
    shared();
    if (levelGroup) scene.remove(levelGroup);
    levelGroup = new THREE.Group(); fishList.length = 0;
    if (lv) {
      for (const [t, x, y] of lv.objs) {
        if (t === 'B') {
          const b = new THREE.Mesh(G.block, mats.block); b.position.set(x + .5, y + .5, 0); b.castShadow = b.receiveShadow = true;
          levelGroup.add(b);
        } else if (t === 'A') levelGroup.add(letterA(x, y));
        else if (t === 'J') levelGroup.add(pad(x, y));
        else if (t === 'F') { const f = fish(x, y); fishList.push(f); levelGroup.add(f); }
      }
      const fin = new THREE.Mesh(new THREE.BoxGeometry(1, MAX_H, 1.4), new THREE.MeshLambertMaterial({map: finishTexture()}));
      fin.position.set(lv.len + .5, MAX_H / 2, 0);
      levelGroup.add(fin);
    }
    scene.add(levelGroup);
    built = lv;
  }

  /* ---------- темы и окружение ---------- */
  function applyTheme(i) {
    themeIdx = i;
    const th = THEMES[i];
    shared();
    scene.background = skyTex[i] ||= skyTexture(th);
    scene.fog = new THREE.Fog(new THREE.Color(th.sky[1]).lerp(new THREE.Color(th.sky[0]), .4), 26, 70);
    if (!mats.block) mats.block = new THREE.MeshLambertMaterial();
    mats.block.map = blockTexture(th); mats.block.needsUpdate = true;
    ground.material.map = groundTexture(th); ground.material.needsUpdate = true;
    lane.material.color.set(th.line);
    hills.forEach((h) => h.material.color.set(th.ground).lerp(new THREE.Color(th.sky[0]), .35));
    stars.visible = i === 2;
  }
  function buildWorld() {
    ground = new THREE.Mesh(new THREE.BoxGeometry(800, 4, 10), new THREE.MeshLambertMaterial());
    ground.position.set(380, -2, -2.5); ground.receiveShadow = true;
    scene.add(ground);
    lane = new THREE.Mesh(new THREE.BoxGeometry(800, .02, 1.2), new THREE.MeshBasicMaterial({transparent: true, opacity: .35}));
    lane.position.set(380, .011, 0);
    scene.add(lane);
    const hillMat = new THREE.MeshLambertMaterial({color: 0x5b2a9e});
    const hillGeo = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    for (let x = -60; x < LEN_MAX; x += 16) {
      const h = new THREE.Mesh(hillGeo, hillMat);
      const r = 6 + (Math.abs(Math.sin(x)) * 5);
      h.scale.set(r, r * .45, r * .5); h.position.set(x + Math.sin(x * 3) * 4, -.1, -16 - (x % 3) * 3);
      hills.push(h); scene.add(h);
    }
    const pawMat = new THREE.SpriteMaterial({map: pawTexture(), transparent: true, opacity: .18, depthWrite: false, fog: false});
    for (let x = -40, i = 0; x < LEN_MAX; x += 9, i++) {
      const s = new THREE.Sprite(pawMat);
      const k = 1.2 + (i % 3) * .7;
      s.scale.set(k * 1.8, k * 1.8, 1);
      s.position.set(x, 6 + (i * 173 % 11), -26 - (i % 4) * 4);
      s.material.rotation = (i % 5) * .3;
      paws.push(s); scene.add(s);
    }
    const sg = new THREE.BufferGeometry(), pts = [];
    for (let i = 0; i < 900; i++) pts.push(-60 + Math.random() * (LEN_MAX + 80), 4 + Math.random() * 30, -30 - Math.random() * 20);
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    stars = new THREE.Points(sg, new THREE.PointsMaterial({color: 0xffffff, size: .15, fog: false, transparent: true, opacity: .8}));
    scene.add(stars);
  }

  /* ---------- частицы ---------- */
  function burst(x, y, color, n) {
    if (!scene) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 7;
      const m = new THREE.Mesh(G.part, new THREE.MeshBasicMaterial({color, transparent: true}));
      m.position.set(x, y, (Math.random() - .5) * .6);
      m.userData = {vx: Math.cos(a) * v, vy: Math.sin(a) * v + 3, vz: (Math.random() - .5) * 5, life: .6 + Math.random() * .5, spin: Math.random() * 10};
      scene.add(m); particles.push(m);
    }
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const m = particles[i], u = m.userData;
      u.life -= dt;
      if (u.life <= 0) { scene.remove(m); m.material.dispose(); particles.splice(i, 1); continue; }
      u.vy -= 20 * dt;
      m.position.x += u.vx * dt; m.position.y += u.vy * dt; m.position.z += u.vz * dt;
      if (m.position.y < .08) { m.position.y = .08; u.vy *= -.3; u.vx *= .7; }
      m.rotation.x += u.spin * dt; m.rotation.y += u.spin * dt;
      m.material.opacity = Math.min(1, u.life * 2);
    }
  }

  /* ---------- камера: один ракурс ---------- */
  const OFFSET = new THREE.Vector3(-5, 4.4, 11), AHEAD = 4.4;
  const look = new THREE.Vector3();
  function placeCamera(catX, camY) {
    const narrow = innerWidth / innerHeight < 1;
    const k = narrow ? 1.75 : 1;
    look.set(catX + AHEAD * (narrow ? .6 : 1), 2.3 + camY, 0);
    camera.position.set(look.x + OFFSET.x * k, look.y + OFFSET.y * k, OFFSET.z * k);
    camera.lookAt(look);
  }

  /* ---------- кадр ---------- */
  let lastT = 0, sun;
  function render(s) {
    if (!renderer) return;
    const w = innerWidth, h = innerHeight;
    if (renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    if (camera.aspect !== w / h) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
    const dt = Math.min(.05, Math.max(0, s.time - lastT)); lastT = s.time;
    if (s.theme !== themeIdx) applyTheme(s.theme);
    if (s.lv !== built) buildLevel(s.lv);
    // кот
    cat.visible = !s.dead;
    cat.position.set(s.catX + CAT / 2, s.catY + CAT / 2, 0);
    cat.rotation.z = -s.rot;
    const squash = s.catY < .02 ? 1 + Math.sin(s.time * 18) * .015 : 1;
    cat.scale.set(1, squash, 1);
    // рыбки покачиваются, собранные пропадают
    for (const f of fishList) {
      f.visible = !(s.got && s.got.has(f.userData.key));
      f.position.y = f.userData.y + .5 + Math.sin(s.time * 4 + f.userData.x) * .08;
      f.rotation.y = Math.sin(s.time * 2 + f.userData.x) * .5;
    }
    // призраки других игроков
    const ghosts = s.ghosts || [];
    while (ghostPool.length < ghosts.length) { const g = buildCat(.45); g.traverse((o) => { o.castShadow = false; }); scene.add(g); ghostPool.push(g); }
    ghostPool.forEach((g, i) => {
      const p = ghosts[i];
      g.visible = !!p;
      if (p) { g.position.set(p.x + CAT / 2, p.y + CAT / 2, -.9); g.rotation.z = -p.rot; }
    });
    placeCamera(s.catX, s.camY || 0);
    sun.position.set(look.x - 6, look.y + 14, 10); sun.target.position.set(look.x, 0, 0);
    updateParticles(dt);
    renderer.render(scene, camera);
  }

  const v3 = new THREE.Vector3();
  function project(x, y, z = 0) {
    v3.set(x, y, z).project(camera);
    return {x: (v3.x + 1) / 2 * innerWidth, y: (1 - v3.y) / 2 * innerHeight, behind: v3.z > 1};
  }

  function init(el) {
    canvas = el;
    try {
      renderer = new THREE.WebGLRenderer({canvas, antialias: true});
    } catch (e) { console.error('WebGL:', e); renderer = null; return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, .1, 200);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x553377, .75));
    sun = new THREE.DirectionalLight(0xffffff, .75);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {left: -14, right: 14, top: 12, bottom: -6, near: 1, far: 50});
    scene.add(sun, sun.target);
    buildWorld();
    shared();
    cat = buildCat(); scene.add(cat);
    renderer.setSize(innerWidth, innerHeight, false);
  }

  return {init, render, burst, project, ready: () => !!renderer};
})();
