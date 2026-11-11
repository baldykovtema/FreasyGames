'use strict';
/* =====================================================
   3D-ПОЛЕ (FreasyGames 3D)
   Логика игры осталась прежней (board.js, simulation.js, match.js): она хранит
   boardPlants, zombies, sunDrops в общих переменных. Этот файл каждый кадр
   рисует их в three.js, а клики по 3D-полю передаёт тем же функциям игры.
   Обычное DOM-поле остаётся невидимым — по нему игра считает время полёта снарядов.
===================================================== */

const View3D = (() => {
    const ROWS = BOARD_ROWS, COLS = 10;
    const toX = (pct) => (pct - BOARD_X_START) / (BOARD_X_WIDTH / COLS) - COLS / 2;
    const toZ = (pct) => pct / 100 * ROWS - ROWS / 2;
    const colX = (col) => col + .5 - COLS / 2;
    const rowZ = (row) => row + .5 - ROWS / 2;

    let renderer, scene, camera, controls, canvas, clock;
    let field = null, location = -1;
    let hemi, sunLight;
    const plantViews = new Map(), zombieViews = new Map(), sunViews = new Map();
    const dying = [], projectiles = [], effects = [], animated = [];
    let hover = null, ghost = null, ghostKey = "";
    const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
    let groundPlane;

    /* ---------- материалы и геометрия ---------- */
    const matCache = new Map(), geoCache = new Map();
    function mat(color, o = {}) {
        const key = color + "|" + JSON.stringify(o);
        if (!matCache.has(key)) matCache.set(key, newMat(color, o));
        return matCache.get(key);
    }
    function newMat(color, o = {}) {
        return new THREE.MeshStandardMaterial({
            color, roughness: o.r ?? .78, metalness: o.m ?? 0, flatShading: o.flat ?? true,
            emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1,
            transparent: !!o.t, opacity: o.o ?? 1, side: o.ds ? THREE.DoubleSide : THREE.FrontSide
        });
    }
    function geo(key, make) { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); }
    const G = {
        sph: (r, w = 14, h = 10) => geo(`s${r},${w},${h}`, () => new THREE.SphereGeometry(r, w, h)),
        half: (r) => geo(`h${r}`, () => new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
        cyl: (a, b, h, s = 12) => geo(`c${a},${b},${h},${s}`, () => new THREE.CylinderGeometry(a, b, h, s)),
        cone: (r, h, s = 8) => geo(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s)),
        box: (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)),
        tor: (r, t, a = Math.PI * 2, s = 16) => geo(`t${r},${t},${a},${s}`, () => new THREE.TorusGeometry(r, t, 8, s, a)),
        ico: (r, d = 0) => geo(`i${r},${d}`, () => new THREE.IcosahedronGeometry(r, d)),
        dod: (r) => geo(`d${r}`, () => new THREE.DodecahedronGeometry(r, 0)),
    };
    function part(geometry, material, x = 0, y = 0, z = 0, parent = null) {
        const m = new THREE.Mesh(geometry, material);
        m.position.set(x, y, z);
        m.castShadow = true; m.receiveShadow = true;
        if (parent) parent.add(m);
        return m;
    }
    function group(parent, x = 0, y = 0, z = 0) {
        const g = new THREE.Group(); g.position.set(x, y, z);
        if (parent) parent.add(g);
        return g;
    }

    /* ---------- текстовые спрайты (эффекты «+25», «💥») ---------- */
    const spriteCache = new Map();
    function textTexture(text) {
        if (spriteCache.has(text)) return spriteCache.get(text);
        const cv = document.createElement("canvas"); cv.width = 256; cv.height = 128;
        const g = cv.getContext("2d");
        g.font = "bold 76px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
        g.textAlign = "center"; g.textBaseline = "middle";
        g.lineWidth = 10; g.strokeStyle = "#1b2a12"; g.strokeText(text, 128, 66);
        g.fillStyle = "#fff6c2"; g.fillText(text, 128, 66);
        const tex = new THREE.CanvasTexture(cv);
        spriteCache.set(text, tex);
        return tex;
    }
    function textSprite(text, size = .55) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({map: textTexture(text), transparent: true, depthWrite: false, depthTest: false}));
        s.scale.set(size * 2, size, 1);
        s.renderOrder = 10;
        return s;
    }
    let glowTex = null;
    function glowTexture() {
        if (glowTex) return glowTex;
        const cv = document.createElement("canvas"); cv.width = cv.height = 128;
        const g = cv.getContext("2d"), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, "rgba(255,240,170,1)"); grad.addColorStop(.35, "rgba(255,205,60,.55)"); grad.addColorStop(1, "rgba(255,190,40,0)");
        g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
        glowTex = new THREE.CanvasTexture(cv);
        return glowTex;
    }

    /* ---------- общие детали растений ---------- */
    const GREEN = 0x3f9a2f, DARK_GREEN = 0x2f7a24;
    function eyes(parent, x, y, spread, r = .045) {
        for (const z of [-spread, spread]) {
            part(G.sph(r, 8, 6), mat(0xffffff, {flat: false}), x, y, z, parent);
            part(G.sph(r * .55, 8, 6), mat(0x111111, {flat: false}), x + r * .6, y, z * 1.05, parent);
        }
    }
    function baseLeaves(g, color = GREEN, n = 3, size = .2) {
        for (let i = 0; i < n; i++) {
            const a = i / n * Math.PI * 2 + .4;
            const leaf = part(G.sph(size, 8, 5), mat(color), Math.cos(a) * size * .9, .04, Math.sin(a) * size * .9, g);
            leaf.scale.set(1, .22, .55); leaf.rotation.y = -a;
        }
    }
    function stem(g, h, color = GREEN, r = .045) { return part(G.cyl(r, r * 1.3, h, 8), mat(color), 0, h / 2, 0, g); }
    function flame(parent, x, y, z, s = 1) {
        const f = group(parent, x, y, z);
        part(G.cone(.11 * s, .3 * s, 7), mat(0xff6a00, {e: 0xff5500, ei: .9}), 0, .15 * s, 0, f);
        part(G.cone(.06 * s, .2 * s, 7), mat(0xffd23f, {e: 0xffcc00, ei: 1}), 0, .12 * s, 0, f);
        f.userData.flicker = true;
        return f;
    }

    /* ---------- растения ---------- */
    function shooter(o) {
        const g = new THREE.Group(), leaf = o.leaf ?? GREEN;
        baseLeaves(g, leaf);
        stem(g, .44, leaf);
        const heads = [], n = o.heads || 1;
        for (let i = 0; i < n; i++) {
            const r = n === 3 ? .16 : .2;
            const h = group(g, 0, .52 + (n === 3 && i === 1 ? .13 : 0), n === 3 ? (i - 1) * .27 : 0);
            part(G.sph(r), mat(o.head), 0, 0, 0, h);
            const snout = part(G.cyl(.08, .068, .2, 10), mat(o.head), r + .06, 0, 0, h); snout.rotation.z = Math.PI / 2;
            const hole = part(G.cyl(.055, .055, .02, 10), mat(0x14220c), r + .165, 0, 0, h); hole.rotation.z = Math.PI / 2;
            if (o.back) {
                const s2 = part(G.cyl(.08, .068, .2, 10), mat(o.head), -r - .06, 0, 0, h); s2.rotation.z = Math.PI / 2;
            }
            eyes(h, r * .5, r * .38, r * .5, r * .22);
            if (o.mask) part(G.box(.06, .07, r * 1.9), mat(0x222222), r * .72, r * .38, 0, h);
            heads.push(h);
        }
        const top = heads[n === 3 ? 1 : 0];
        if (o.tuft) { const t = part(G.cone(.07, .32, 6), mat(DARK_GREEN), -.2, .12, 0, top); t.rotation.z = 1.1; }
        if (o.crystals) for (const [x, z, rz] of [[-.05, 0, .2], [.06, .08, -.3], [.02, -.09, -.1]]) {
            const c = part(G.cone(.05, .2, 5), mat(0xd6f3ff, {e: 0x6fcfff, ei: .35, m: .2, r: .3}), x, .2, z, top); c.rotation.set(z * 2, 0, rz);
        }
        if (o.flame) flame(top, -.02, .14, 0, 1);
        if (o.antenna) { part(G.cyl(.012, .012, .18, 5), mat(0x444444), 0, .27, 0, top); part(G.sph(.04, 8, 6), mat(0xfff27a, {e: 0xffe100, ei: 1}), 0, .37, 0, top); }
        if (o.horns) for (const z of [-.1, .1]) { const c = part(G.cone(.04, .16, 5), mat(0xe8dcc0), -.04, .2, z, top); c.rotation.x = z * 3; }
        g.userData.heads = heads;
        g.userData.type = "shooter";
        return g;
    }
    function flowerHead(parent, o, x, y, z, scale = 1) {
        const h = group(parent, x, y, z); h.scale.setScalar(scale);
        const petals = o.petals ?? 12;
        for (let i = 0; i < petals; i++) {
            const a = i / petals * Math.PI * 2;
            const p = part(G.sph(.1, 8, 5), mat(o.petal, o.glow ? {e: o.petal, ei: .35} : {}), Math.cos(a) * .2, Math.sin(a) * .2, 0, h);
            p.scale.set(1.25, .6, .3); p.rotation.z = a;
        }
        const c = part(G.cyl(.15, .15, .07, 16), mat(o.center), 0, 0, .02, h); c.rotation.x = Math.PI / 2;
        for (const xx of [-.055, .055]) {
            part(G.sph(.03, 8, 6), mat(0x111111, {flat: false}), xx, .04, .06, h);
        }
        const smile = part(G.tor(.05, .012, Math.PI, 10), mat(0x3a1d08), 0, -.02, .06, h); smile.rotation.z = Math.PI;
        h.rotation.y = -.35;
        return h;
    }
    function flower(o) {
        const g = new THREE.Group();
        baseLeaves(g);
        if (o.twin) {
            const s1 = part(G.cyl(.04, .05, .5, 8), mat(GREEN), -.08, .25, 0, g); s1.rotation.z = .25;
            const s2 = part(G.cyl(.04, .05, .5, 8), mat(GREEN), .08, .25, 0, g); s2.rotation.z = -.25;
            g.userData.heads = [flowerHead(g, o, -.17, .55, 0, .75), flowerHead(g, o, .17, .55, 0, .75)];
        } else {
            stem(g, o.small ? .36 : .5);
            g.userData.heads = [flowerHead(g, o, 0, o.small ? .42 : .58, 0, o.small ? .8 : 1)];
        }
        g.userData.type = "flower";
        return g;
    }
    function nut(o) {
        const g = new THREE.Group();
        const body = part(G.sph(.3, 14, 10), mat(o.color), 0, o.h, 0, g);
        body.scale.set(1.05, o.h / .3, .9);
        for (let i = 0; i < 5; i++) { // крапинки
            const a = i * 1.3;
            part(G.sph(.03, 6, 4), mat(0x6e4520), Math.cos(a) * .2, o.h + Math.sin(i * 2.1) * o.h * .5, Math.sin(a) * .26, g);
        }
        eyes(g, .27, o.h + o.h * .25, .1, .055);
        if (o.plates) for (const [y, z] of [[o.h * .6, .22], [o.h * 1.3, -.2], [o.h * .9, -.25]]) {
            const p = part(G.dod(.1), mat(0x6f6a64), .12, y, z, g); p.scale.set(1, .6, 1);
        }
        g.userData.body = body;
        g.userData.type = "nut";
        return g;
    }
    function shroom(o) {
        const g = new THREE.Group(), s = o.size ?? 1;
        const st = part(G.cyl(.09 * s, .12 * s, (o.tall ? .42 : .22) * s, 10), mat(0xf1e6d0), 0, (o.tall ? .21 : .11) * s, 0, g);
        const capY = (o.tall ? .42 : .2) * s;
        const cap = part(G.half(.24 * s), mat(o.cap, o.doom ? {e: 0x5a1a7a, ei: .25} : {}), 0, capY, 0, g);
        cap.scale.y = .8;
        const spots = o.hypno ? 0 : 5;
        for (let i = 0; i < spots; i++) {
            const a = i / spots * Math.PI * 2;
            part(G.sph(.035 * s, 6, 4), mat(o.doom ? 0x9b59d0 : 0xfff6e6), Math.cos(a) * .15 * s, capY + .1 * s, Math.sin(a) * .15 * s, g);
        }
        if (o.hypno) for (let i = 0; i < 3; i++) {
            const t = part(G.tor((.08 + i * .055) * s, .016 * s, Math.PI * 2, 18), mat(i % 2 ? 0x9b2cff : 0xffe14a), 0, capY + (.17 - i * .05) * s, 0, g);
            t.rotation.x = Math.PI / 2;
        }
        eyes(g, .1 * s, .14 * s, .045 * s, .03 * s);
        if (o.magnet) {
            const m = part(G.tor(.11, .035, Math.PI, 12), mat(0xd62828, {m: .4, r: .4}), 0, capY + .28, 0, g);
            for (const x of [-.11, .11]) part(G.box(.07, .06, .07), mat(0xdddddd, {m: .6, r: .3}), x, capY + .26, 0, g);
            m.rotation.z = 0;
        }
        if (o.fume) { const sn = part(G.cyl(.08, .11, .22, 10), mat(o.cap), .2 * s, .14 * s, 0, g); sn.rotation.z = Math.PI / 2; }
        g.userData.cap = cap;
        g.userData.grow = !!o.grow;
        g.userData.type = "shroom";
        return g;
    }
    function pult(o) {
        const g = new THREE.Group();
        const base = part(G.cyl(.2, .26, .22, 10), mat(o.base ?? 0x58a83b), 0, .11, 0, g);
        part(G.sph(.17, 10, 8), mat(o.base ?? 0x58a83b), 0, .28, 0, g).scale.y = .7;
        eyes(g, .15, .3, .08, .04);
        const arm = group(g, -.05, .34, 0);
        const beam = part(G.box(.48, .04, .05), mat(DARK_GREEN), -.2, 0, 0, arm);
        const cup = part(G.half(.1), mat(DARK_GREEN, {ds: true}), -.44, .02, 0, arm); cup.rotation.x = Math.PI;
        const ammo = part(G.sph(o.ammoSize, 12, 8), mat(o.ammo, o.glow ? {e: o.ammo, ei: .3} : {}), -.44, .02 + o.ammoSize * .7, 0, arm);
        if (o.stripes) for (let i = 0; i < 3; i++) {
            const t = part(G.tor(o.ammoSize * .98, .008, Math.PI * 2, 16), mat(0x1e6b23), 0, 0, 0, ammo); t.rotation.y = i * Math.PI / 3;
        }
        arm.rotation.z = -.35;
        g.userData.arm = arm; g.userData.ammo = ammo; g.userData.beam = beam; base.userData = {};
        g.userData.type = "pult";
        return g;
    }
    const builders = {
        peashooter: () => shooter({head: 0x6cc644}),
        icepea: () => shooter({head: 0x8fdcff, crystals: true}),
        snowpea: () => shooter({head: 0xe6f6ff, crystals: true, leaf: 0x6fb7d8}),
        repeater: () => shooter({head: 0x4fae38, tuft: true}),
        firepea: () => shooter({head: 0xff7a2a, flame: true, leaf: 0x7a8f2a}),
        splitpea: () => shooter({head: 0x8ad04f, back: true}),
        threepeater: () => shooter({head: 0x5dbb3d, heads: 3}),
        electricpea: () => shooter({head: 0xffe14a, antenna: true}),
        primalpea: () => shooter({head: 0x8c9a3a, horns: true, leaf: 0x5f7a2a}),
        imitater: () => shooter({head: 0xd9d9d9, leaf: 0xa9a9a9, mask: true}),
        sunflower: () => flower({petal: 0xffd23f, center: 0x8a5a1f}),
        twinflower: () => flower({petal: 0xffc93c, center: 0x7a4a17, twin: true}),
        marigold: () => flower({petal: 0xff9f1c, center: 0xd9661a, small: true, petals: 16}),
        moonflower: () => flower({petal: 0xbfd6ff, center: 0x5f6fe0, glow: true}),
        wallnut: () => nut({color: 0xb07a3c, h: .36}),
        tallnut: () => nut({color: 0x9c672f, h: .62}),
        primalwallnut: () => nut({color: 0x8c7b6b, h: .4, plates: true}),
        mushroom: () => shroom({cap: 0x9b59d0}),
        magnetshroom: () => shroom({cap: 0x7a3fa0, magnet: true}),
        fumeshroom: () => shroom({cap: 0x8e44ad, fume: true, size: 1.15}),
        sunshroom: () => shroom({cap: 0xf5c542, size: .9, grow: true}),
        hypnoshroom: () => shroom({cap: 0xff6ad5, hypno: true}),
        doomshroom: () => shroom({cap: 0x2d1b3d, size: 1.3, doom: true}),
        scaredyshroom: () => shroom({cap: 0xb57edc, tall: true}),
        seashroom: () => shroom({cap: 0x2ec4b6, size: .8}),
        melonpult: () => pult({ammo: 0x4caf50, ammoSize: .15, stripes: true}),
        wintermelon: () => pult({ammo: 0xa6ecff, ammoSize: .15, glow: true}),
        cabbagepult: () => pult({ammo: 0x9be15d, ammoSize: .13}),
        kernelpult: () => pult({ammo: 0xffe066, ammoSize: .09, base: 0xd9c15a}),
        pepperpult: () => pult({ammo: 0xe63946, ammoSize: .11, base: 0x4f9a2f}),
        cherry() {
            const g = new THREE.Group();
            for (const z of [-.14, .14]) {
                const c = part(G.sph(.17, 14, 10), mat(0xd7263d, {r: .4}), 0, .2, z, g);
                part(G.sph(.04, 6, 4), mat(0xffffff, {flat: false}), .1, .29, z * 1.1, g);
                const s = part(G.cyl(.015, .015, .32, 5), mat(DARK_GREEN), 0, .5, z * .5, g); s.rotation.x = z > 0 ? -.45 : .45;
                eyes(c, .13, .04, .06, .03);
            }
            part(G.sph(.08, 8, 5), mat(GREEN), 0, .66, 0, g).scale.set(1.6, .3, .8);
            g.userData.type = "bomb"; return g;
        },
        jalapeno() {
            const g = new THREE.Group();
            const b = part(G.sph(.14, 12, 10), mat(0xd62828, {r: .35}), 0, .34, 0, g); b.scale.set(1, 2.2, 1); b.rotation.z = .18;
            part(G.cyl(.05, .07, .1, 8), mat(DARK_GREEN), -.04, .66, 0, g);
            eyes(g, .11, .45, .06, .035);
            g.userData.type = "bomb"; return g;
        },
        squash() {
            const g = new THREE.Group();
            for (let i = 0; i < 6; i++) {
                const a = i / 6 * Math.PI * 2;
                const r = part(G.sph(.2, 12, 8), mat(0xf08a24), Math.cos(a) * .1, .26, Math.sin(a) * .1, g); r.scale.set(.75, 1, .75);
            }
            part(G.cyl(.03, .04, .14, 6), mat(0x5b8a2a), 0, .52, 0, g);
            eyes(g, .22, .32, .08, .045);
            g.userData.type = "squash"; return g;
        },
        potatomine() {
            const g = new THREE.Group();
            const body = part(G.half(.22), mat(0xb98b52), 0, -.02, 0, g); body.scale.y = .9;
            const light = part(G.sph(.05, 8, 6), mat(0xff3b3b, {e: 0xff0000, ei: 1}), 0, .2, 0, g);
            part(G.cyl(.01, .01, .12, 4), mat(0x555555), 0, .16, 0, g);
            eyes(g, .16, .1, .07, .035);
            g.userData.body = body; g.userData.light = light; g.userData.type = "mine"; return g;
        },
        corn() {
            const g = new THREE.Group(); baseLeaves(g);
            const cob = part(G.cyl(.12, .15, .5, 10), mat(0xffd84d), 0, .4, 0, g);
            for (let i = 0; i < 3; i++) {
                const h = part(G.sph(.12, 8, 5), mat(GREEN), Math.cos(i * 2.1) * .1, .3, Math.sin(i * 2.1) * .1, g);
                h.scale.set(.5, 1.8, .5); h.rotation.set(Math.sin(i * 2.1) * .3, 0, -Math.cos(i * 2.1) * .3);
            }
            eyes(g, .13, .5, .06, .035);
            g.userData.body = cob; g.userData.type = "shooter"; g.userData.heads = [cob]; return g;
        },
        cactus() {
            const g = new THREE.Group();
            part(G.cyl(.13, .15, .7, 10), mat(0x3c9a4a), 0, .35, 0, g);
            part(G.sph(.13, 10, 6), mat(0x3c9a4a), 0, .7, 0, g);
            for (const [z, y] of [[-.2, .38], [.2, .48]]) {
                const a = part(G.cyl(.06, .06, .22, 8), mat(0x3c9a4a), 0, y + .08, z, g);
                part(G.cyl(.06, .06, .12, 8), mat(0x3c9a4a), 0, y - .03, z * .65, g).rotation.x = Math.PI / 2;
                a.userData = {};
            }
            for (let i = 0; i < 12; i++) {
                const a = i * 2.4, y = .12 + (i % 6) * .1;
                const sp = part(G.cone(.012, .07, 4), mat(0xf6f1d0), Math.cos(a) * .15, y, Math.sin(a) * .15, g); sp.rotation.z = -Math.cos(a) * 1.4; sp.rotation.x = Math.sin(a) * 1.4;
            }
            part(G.sph(.06, 8, 6), mat(0xff6fa8), 0, .84, 0, g);
            eyes(g, .13, .55, .06, .035);
            g.userData.type = "shooter"; g.userData.heads = []; return g;
        },
        spikeweed: () => spikes(0x4d7a2a, .1, 9),
        spikerock: () => spikes(0x5d5d66, .14, 11),
        garlic() {
            const g = new THREE.Group();
            const b = part(G.sph(.22, 12, 10), mat(0xf4efe4, {r: .6}), 0, .22, 0, g); b.scale.set(1, .95, 1);
            part(G.cone(.08, .22, 8), mat(0xf4efe4), 0, .5, 0, g);
            for (let i = 0; i < 6; i++) { const t = part(G.tor(.22, .006, Math.PI, 12), mat(0xd9cfbf), 0, .22, 0, g); t.rotation.y = i * Math.PI / 6; t.rotation.x = Math.PI / 2; t.rotation.order = "YXZ"; }
            eyes(g, .2, .27, .07, .035);
            g.userData.type = "nut"; return g;
        },
        lily() {
            const g = new THREE.Group();
            const pad = part(new THREE.CylinderGeometry(.38, .38, .03, 20, 1, false, .3, Math.PI * 1.8), mat(0x4caf50), 0, .02, 0, g);
            pad.receiveShadow = true;
            for (let i = 0; i < 6; i++) { const p = part(G.sph(.06, 6, 4), mat(0xff9ec7), Math.cos(i) * .06, .09, Math.sin(i) * .06, g); p.scale.set(1, 1.6, .6); p.rotation.y = i; }
            part(G.sph(.04, 6, 4), mat(0xffe14a), 0, .1, 0, g);
            g.userData.type = "pad"; return g;
        },
        cattail() {
            const g = builders.lily();
            const body = part(G.sph(.17, 12, 10), mat(0xe8a3d6), 0, .25, 0, g);
            for (const z of [-.08, .08]) part(G.cone(.05, .1, 4), mat(0xe8a3d6), 0, .42, z, g);
            const tail = part(G.tor(.16, .025, Math.PI * 1.2, 12), mat(0x7a4e2d), -.18, .4, 0, g); tail.rotation.z = .4;
            part(G.sph(.05, 8, 6), mat(0x5a3a20), -.3, .56, 0, g).scale.y = 1.8;
            eyes(g, .14, .3, .07, .035);
            g.userData.type = "shooter"; g.userData.heads = [body]; return g;
        },
        starfruit() {
            const g = new THREE.Group(); baseLeaves(g); stem(g, .3);
            const shape = new THREE.Shape();
            for (let i = 0; i < 10; i++) {
                const a = i / 10 * Math.PI * 2 + Math.PI / 2, r = i % 2 ? .12 : .27;
                i ? shape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            const star = part(geo("star", () => new THREE.ExtrudeGeometry(shape, {depth: .1, bevelEnabled: true, bevelSize: .03, bevelThickness: .03, bevelSegments: 1})), mat(0xffd23f, {e: 0xffb300, ei: .2}), 0, .55, -.05, g);
            for (const x of [-.05, .05]) part(G.sph(.025, 6, 4), mat(0x111111), x, .58, .1, g);
            g.userData.spin = star; g.userData.type = "shooter"; g.userData.heads = []; return g;
        },
        torchwood() {
            const g = new THREE.Group();
            part(G.cyl(.25, .3, .48, 10), mat(0x7a4a24), 0, .24, 0, g);
            const top = part(G.cyl(.24, .24, .02, 16), mat(0xc79a62), 0, .49, 0, g); top.castShadow = false;
            for (let i = 0; i < 3; i++) { const r = part(G.tor(.08 + i * .05, .006, Math.PI * 2, 16), mat(0x8a5a2c), 0, .5, 0, g); r.rotation.x = Math.PI / 2; }
            flame(g, 0, .5, 0, 1.6);
            eyes(g, .27, .32, .1, .045);
            g.userData.type = "torch"; return g;
        },
        bokchoy() {
            const g = new THREE.Group();
            for (let i = 0; i < 7; i++) {
                const a = i / 7 * Math.PI * 2;
                const l = part(G.sph(.14, 8, 6), mat(i % 2 ? 0x9be15d : 0x7cc64a), Math.cos(a) * .08, .32, Math.sin(a) * .08, g);
                l.scale.set(.6, 2.2, .5); l.rotation.set(Math.sin(a) * .35, 0, -Math.cos(a) * .35);
            }
            part(G.cyl(.12, .14, .2, 10), mat(0xf0f6e0), 0, .1, 0, g);
            const fists = [];
            for (const z of [-.2, .2]) fists.push(part(G.sph(.07, 8, 6), mat(0x7cc64a), .18, .3, z, g));
            eyes(g, .12, .38, .05, .035);
            g.userData.fists = fists; g.userData.type = "shooter"; g.userData.heads = []; return g;
        },
        bloomerang() {
            const g = new THREE.Group(); baseLeaves(g); stem(g, .4);
            part(G.sph(.12, 10, 8), mat(0x6cc644), 0, .45, 0, g);
            eyes(g, .1, .48, .05, .03);
            const b = group(g, 0, .7, 0);
            const arm = part(G.tor(.14, .035, Math.PI * .9, 10), mat(0xd9a441), 0, 0, 0, b); arm.rotation.x = Math.PI / 2;
            g.userData.spin = b; g.userData.type = "shooter"; g.userData.heads = []; return g;
        },
        plantern() {
            const g = new THREE.Group(); baseLeaves(g); stem(g, .3);
            part(G.cyl(.09, .09, .05, 8), mat(0x5a3a20), 0, .3, 0, g);
            const lamp = part(G.cyl(.15, .13, .3, 8), mat(0xffcf5a, {e: 0xffb300, ei: .9, r: .4}), 0, .47, 0, g);
            part(G.cone(.17, .12, 8), mat(0x5a3a20), 0, .68, 0, g);
            g.userData.lamp = lamp; g.userData.light = true; g.userData.type = "lamp"; return g;
        },
        umbrellaleaf() {
            const g = new THREE.Group(); baseLeaves(g); stem(g, .5, 0x2f7a24, .03);
            const u = part(G.cone(.42, .2, 10), mat(0x5fbf3a, {ds: true}), 0, .58, 0, g);
            part(G.sph(.1, 8, 6), mat(0x6cc644), 0, .2, 0, g);
            eyes(g, .08, .22, .04, .028);
            g.userData.cap = u; g.userData.type = "shroom"; return g;
        },
        flowerpot() {
            const g = new THREE.Group();
            part(G.cyl(.27, .2, .3, 12), mat(0xc0663a), 0, .15, 0, g);
            part(G.cyl(.29, .29, .06, 12), mat(0xd47a4a), 0, .3, 0, g);
            part(G.cyl(.25, .25, .02, 12), mat(0x5a3a20), 0, .31, 0, g);
            g.userData.type = "pad"; return g;
        },
        coffee() {
            const g = new THREE.Group(); baseLeaves(g, GREEN, 2, .14);
            const b = part(G.sph(.13, 10, 8), mat(0x6b3e1f, {r: .5}), 0, .18, 0, g); b.scale.set(.8, 1.15, .7);
            part(G.box(.02, .2, .02), mat(0x3a1f0e), .1, .18, 0, g);
            eyes(g, .09, .2, .05, .028);
            g.userData.type = "nut"; return g;
        },
        tanglekelp() {
            const g = new THREE.Group(), strands = [];
            for (let i = 0; i < 6; i++) {
                const s = group(g, Math.cos(i) * .14, -.05, Math.sin(i) * .14);
                part(G.cyl(.025, .04, .45, 5), mat(i % 2 ? 0x2e8b57 : 0x3cb371), 0, .22, 0, s);
                s.rotation.z = Math.cos(i * 1.7) * .3;
                strands.push(s);
            }
            eyes(g, .12, .22, .06, .035);
            g.userData.strands = strands; g.userData.type = "kelp"; return g;
        },
    };
    function spikes(color, h, n) {
        const g = new THREE.Group();
        part(G.cyl(.38, .4, .04, 12), mat(0x4a3a20), 0, .02, 0, g);
        for (let i = 0; i < n; i++) {
            const a = i / n * Math.PI * 2, r = i % 2 ? .24 : .12;
            part(G.cone(.045, h, 5), mat(color, {m: .2}), Math.cos(a) * r, .04 + h / 2, Math.sin(a) * r, g);
        }
        part(G.cone(.05, h * 1.2, 5), mat(color), 0, .04 + h * .6, 0, g);
        g.userData.type = "spikes"; return g;
    }
    function buildPlant(id) {
        const make = builders[id] || builders.peashooter;
        const g = make();
        g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
        return g;
    }

    /* ---------- зомби ---------- */
    function zombieKind(emoji) {
        if (emoji.includes("🏃")) return "fast";
        if (emoji.includes("🪣")) return "bucket";
        if (emoji.includes("💪")) return "strong";
        return "normal";
    }
    function buildZombie(emoji) {
        const kind = zombieKind(emoji);
        const mats = [];
        const m = (c, o) => { const x = newMat(c, o); mats.push(x); return x; };
        const shirt = {normal: 0x6b4f3a, fast: 0xd64545, bucket: 0x4f6a8c, strong: 0x5b3a8a}[kind];
        const skin = m(0x93b07a), pants = m(kind === "fast" ? 0x2d2d2d : 0x3b4a6b), shirtM = m(shirt);
        const root = new THREE.Group();
        const rig = group(root); rig.rotation.y = Math.PI; // смотрит к дому (−x)
        const legs = [], arms = [];
        for (const z of [-.09, .09]) {
            const hip = group(rig, 0, .42, z);
            part(G.box(.12, .42, .12), pants, 0, -.21, 0, hip);
            part(G.box(.18, .07, .13), m(0x2a1d12), .03, -.42, 0, hip);
            legs.push(hip);
        }
        const torso = group(rig, 0, .42, 0);
        part(G.box(.24, .4, .34), shirtM, 0, .2, 0, torso);
        if (kind !== "fast") part(G.box(.02, .24, .06), m(0xb22222), .125, .22, 0, torso);
        else part(G.box(.02, .06, .34), m(0xffffff), .125, .32, 0, torso);
        for (const z of [-.21, .21]) {
            const sh = group(torso, 0, .36, z);
            part(G.box(.1, .34, .1), shirtM, 0, -.17, 0, sh);
            part(G.sph(.06, 8, 6), skin, 0, -.36, 0, sh);
            sh.rotation.z = 1.35; // руки вперёд
            arms.push(sh);
        }
        const head = group(torso, .02, .55, 0);
        const skull = part(G.sph(.17, 12, 10), skin, 0, 0, 0, head); skull.scale.set(1, 1.08, .95);
        part(G.sph(.055, 8, 6), m(0xf3f3e3, {flat: false}), .13, .04, -.06, head);
        part(G.sph(.04, 8, 6), m(0xf3f3e3, {flat: false}), .14, .05, .07, head);
        part(G.sph(.025, 6, 4), m(0x7a1010), .18, .04, -.06, head);
        part(G.sph(.02, 6, 4), m(0x7a1010), .175, .05, .07, head);
        part(G.box(.03, .04, .12), m(0x3a1a1a), .16, -.08, 0, head);
        for (let i = 0; i < 3; i++) part(G.cone(.03, .09, 4), m(0x3a2a1a), -.04 + i * .04, .17, -.04 + i * .04, head).rotation.z = .3 - i * .2;
        let bucket = null;
        if (kind === "bucket") {
            bucket = part(G.cyl(.15, .19, .24, 12), m(0x9aa4ad, {m: .7, r: .35}), -.01, .17, 0, head);
            bucket.rotation.z = .12;
            part(G.tor(.19, .012, Math.PI * 2, 16), m(0x6e7881, {m: .7}), 0, -.11, 0, bucket).rotation.x = Math.PI / 2;
        }
        if (kind === "fast") part(G.box(.34, .04, .36), m(0xffffff), 0, .08, 0, head).scale.set(.98, 1, .98);
        const scale = kind === "strong" ? 1.28 : kind === "fast" ? .92 : 1;
        root.scale.setScalar(scale);
        if (kind === "fast") torso.rotation.z = -.18;
        root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        return {root, rig, legs, arms, head, torso, bucket, mats, kind, emoji};
    }
    function tintZombie(v, color, amount) {
        if (v.tint === color) return;
        v.tint = color;
        for (const m of v.mats) { m.emissive.setHex(color); m.emissiveIntensity = amount; }
    }

    /* ---------- солнце ---------- */
    function buildSun() {
        const g = new THREE.Group();
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
        glow.scale.set(1.3, 1.3, 1); g.add(glow);
        const core = part(G.ico(.2, 1), mat(0xffd23f, {e: 0xffb000, ei: .85, r: .4}), 0, 0, 0, g);
        const rays = group(g);
        for (let i = 0; i < 10; i++) {
            const a = i / 10 * Math.PI * 2;
            const r = part(G.cone(.06, .16, 4), mat(0xffe27a, {e: 0xffc400, ei: .8}), Math.cos(a) * .29, Math.sin(a) * .29, 0, rays);
            r.rotation.z = a - Math.PI / 2;
        }
        const hit = new THREE.Mesh(G.sph(.5, 8, 6), new THREE.MeshBasicMaterial({visible: false}));
        g.add(hit);
        core.castShadow = false;
        return {root: g, rays, hit};
    }

    /* ---------- поле и декорации ---------- */
    function isWaterRow(row, loc = location) { return [2, 3].includes(loc) && [2, 3].includes(row); }
    function tree(parent, x, z, s = 1, night = false) {
        const t = group(parent, x, 0, z); t.scale.setScalar(s);
        part(G.cyl(.12, .18, 1, 7), mat(0x6b4423), 0, .5, 0, t);
        const c = night ? [0x1f4a2e, 0x24563a, 0x2b6342] : [0x3f8f3a, 0x4fa244, 0x5cb34e];
        part(G.ico(.75, 0), mat(c[0]), 0, 1.35, 0, t);
        part(G.ico(.55, 0), mat(c[1]), .25, 1.85, .1, t);
        part(G.ico(.4, 0), mat(c[2]), -.2, 2.2, -.05, t);
        return t;
    }
    function pine(parent, x, z, s = 1, night = false) {
        const t = group(parent, x, 0, z); t.scale.setScalar(s);
        part(G.cyl(.1, .14, .6, 6), mat(0x5a3a20), 0, .3, 0, t);
        for (let i = 0; i < 3; i++) part(G.cone(.7 - i * .18, .9, 7), mat(night ? 0x1d4a34 : 0x2f7d45), 0, .9 + i * .5, 0, t);
        return t;
    }
    function bush(parent, x, z, s = 1, night = false) {
        const b = group(parent, x, 0, z); b.scale.setScalar(s);
        const c = night ? 0x1f4a2e : 0x3f8f3a;
        part(G.ico(.38, 1), mat(c), 0, .3, 0, b);
        part(G.ico(.28, 1), mat(night ? 0x24563a : 0x4fa244), .25, .25, .12, b);
        part(G.ico(.25, 1), mat(night ? 0x1a3f28 : 0x37803a), -.22, .22, -.1, b);
        return b;
    }
    function flowerDecor(parent, x, z, color) {
        const f = group(parent, x, 0, z);
        part(G.cyl(.015, .015, .22, 4), mat(GREEN), 0, .11, 0, f);
        part(G.sph(.06, 6, 4), mat(color), 0, .24, 0, f);
        return f;
    }
    function mower(parent, z) {
        const m = group(parent, -5.62, 0, z);
        part(G.box(.5, .2, .44), mat(0xd62828, {r: .45, m: .2}), 0, .2, 0, m);
        part(G.box(.26, .16, .3), mat(0x333333, {m: .4}), -.04, .36, 0, m);
        part(G.cyl(.05, .05, .1, 8), mat(0x999999, {m: .6}), -.04, .48, 0, m);
        for (const [x, zz] of [[.17, -.22], [.17, .22], [-.17, -.22], [-.17, .22]]) {
            const w = part(G.cyl(.09, .09, .06, 12), mat(0x1a1a1a), x, .09, zz, m); w.rotation.x = Math.PI / 2;
            part(G.cyl(.04, .04, .07, 8), mat(0xdddddd, {m: .5}), x, .09, zz, m).rotation.x = Math.PI / 2;
        }
        const handle = part(G.cyl(.018, .018, .7, 5), mat(0x777777, {m: .5}), -.42, .45, 0, m); handle.rotation.z = .9;
        part(G.cyl(.02, .02, .4, 5), mat(0x222222), -.7, .68, 0, m).rotation.x = Math.PI / 2;
        m.userData.mower = true;
        animated.push((t) => { m.position.y = Math.abs(Math.sin(t * 9 + z * 3)) * .006; });
        return m;
    }
    function house(parent, night) {
        const h = group(parent, -9.4, 0, 0);
        part(G.box(4.6, 2.8, 7.4), mat(0xf1e3c6), 0, 1.4, 0, h);
        part(G.box(4.8, .24, 7.6), mat(0xdcc8a0), 0, .12, 0, h);
        const tri = new THREE.Shape();
        tri.moveTo(-2.75, 0); tri.lineTo(2.75, 0); tri.lineTo(0, 1.9); tri.lineTo(-2.75, 0);
        part(geo("roof", () => new THREE.ExtrudeGeometry(tri, {depth: 8, bevelEnabled: false})), mat(0xa63d2f), 0, 2.8, -4, h);
        part(G.box(.5, 1.2, .5), mat(0x8c4a3a), .6, 4.4, -2, h);
        // дверь и окна смотрят на газон (+x)
        part(G.box(.08, 1.3, .8), mat(0x6b3f22), 2.32, .75, .4, h);
        part(G.sph(.04, 6, 4), mat(0xffd23f, {m: .7}), 2.38, .75, .7, h);
        const winMat = night ? mat(0xffe39a, {e: 0xffc95a, ei: .9}) : mat(0x9ad7ff, {r: .2, m: .3});
        for (const z of [-2.4, -1.2, 2.2]) {
            part(G.box(.06, .7, .7), winMat, 2.32, 1.65, z, h);
            part(G.box(.08, .08, .82), mat(0xffffff), 2.34, 1.65, z, h);
            part(G.box(.08, .82, .08), mat(0xffffff), 2.34, 1.65, z, h);
        }
        part(G.box(.6, .1, 1.4), mat(0xb9a07a), 2.6, .05, .4, h);
        return h;
    }
    function fence(parent, z, from, to, color = 0xf5f0e6) {
        const f = group(parent, 0, 0, z);
        for (let x = from; x <= to; x += .42) {
            part(G.box(.12, .62, .05), mat(color), x, .31, 0, f);
            part(G.cone(.085, .1, 4), mat(color), x, .67, 0, f).rotation.y = Math.PI / 4;
        }
        for (const y of [.2, .46]) part(G.box(to - from + .2, .06, .04), mat(color), (from + to) / 2, y, -.04, f);
        return f;
    }
    function grave(parent, x, z, s = 1) {
        const g = group(parent, x, 0, z); g.scale.setScalar(s);
        part(G.box(.5, .6, .14), mat(0x7c8290), 0, .3, 0, g);
        part(G.cyl(.25, .25, .14, 12, 1), mat(0x7c8290), 0, .6, 0, g).rotation.x = Math.PI / 2;
        part(G.box(.06, .26, .02), mat(0x5a606d), 0, .4, .08, g);
        part(G.box(.18, .06, .02), mat(0x5a606d), 0, .45, .08, g);
        part(G.box(.6, .06, .3), mat(0x3a4a2a), 0, .03, .1, g);
        g.rotation.z = (Math.random() - .5) * .15;
        return g;
    }
    function cloud(parent, x, y, z, s) {
        const c = group(parent, x, y, z); c.scale.setScalar(s);
        const w = mat(0xffffff, {r: 1});
        for (const [a, b, r] of [[0, 0, .8], [.8, -.1, .6], [-.8, -.15, .55], [.35, .35, .55]]) { const p = part(G.ico(r, 1), w, a, b, 0, c); p.castShadow = false; }
        const speed = .08 + Math.random() * .1;
        animated.push((t, dt) => { c.position.x += speed * dt; if (c.position.x > 22) c.position.x = -22; });
        return c;
    }

    function buildField(loc) {
        if (field) { scene.remove(field); }
        animated.length = 0;
        field = new THREE.Group();
        scene.add(field);
        location = loc;
        const night = loc === 1 || loc === 3;
        const roof = loc === 4;
        const pool = loc === 2 || loc === 3;

        // освещение и небо
        scene.background = new THREE.Color(night ? 0x0e1633 : roof ? 0x9fd3ff : 0xa9dcff);
        scene.fog = new THREE.Fog(scene.background.getHex(), 22, 48);
        hemi.color.setHex(night ? 0x6f7fc0 : 0xe6f4ff);
        hemi.groundColor.setHex(night ? 0x0f1a14 : 0x4c6b2a);
        hemi.intensity = night ? .72 : .78;
        sunLight.color.setHex(night ? 0xa9bcff : 0xfff0d2);
        sunLight.intensity = night ? .75 : 1.05;
        sunLight.position.set(night ? -6 : 6, 14, 8);

        // клетки поля
        const tileTop = 0;
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const x = colX(col), z = rowZ(row), odd = (row + col) % 2;
                if (isWaterRow(row, loc)) continue;
                let color;
                if (roof) color = odd ? 0xb85a3a : 0xc8683f;
                else if (night) color = odd ? 0x2c5a3a : 0x336644;
                else color = odd ? 0x56a845 : 0x62b54f;
                const t = part(G.box(.98, .2, .98), mat(color), x, tileTop - .1, z, field);
                t.castShadow = false;
                if (roof) { const r = part(G.box(.98, .06, .1), mat(0x9c4a30), x, .02, z + .44, field); r.castShadow = false; }
            }
        }
        if (pool) {
            const water = part(G.box(COLS + .4, .04, 2), mat(night ? 0x1d4e7a : 0x2fb0e0, {t: true, o: .82, r: .15, m: .1}), 0, -.12, rowZ(2.5) - .5 + .5, field);
            water.position.z = (rowZ(2) + rowZ(3)) / 2;
            water.castShadow = false; water.receiveShadow = true;
            const floor = part(G.box(COLS + .4, .1, 2), mat(night ? 0x2a5d80 : 0x7fd6f2), 0, -.75, water.position.z, field); floor.castShadow = false;
            for (const z of [rowZ(2) - .55, rowZ(3) + .55]) {
                const edge = part(G.box(COLS + .6, .12, .12), mat(0xefe4c8), 0, -.02, z, field); edge.castShadow = false;
            }
            for (const x of [-5.25, 5.25]) part(G.box(.12, .12, 2.2), mat(0xefe4c8), x, -.02, water.position.z, field).castShadow = false;
            for (const z of [rowZ(2) - .5, rowZ(3) + .5]) part(G.box(COLS + .4, .7, .06), mat(0xdcefff), 0, -.42, z, field).castShadow = false;
            // волны на воде
            const ripples = [];
            for (let i = 0; i < 8; i++) {
                const r = part(G.tor(.25 + Math.random() * .2, .012, Math.PI * 2, 18), mat(0xffffff, {t: true, o: .35}), -4.5 + i * 1.3, -.09, water.position.z + (Math.random() - .5) * 1.4, field);
                r.rotation.x = Math.PI / 2; r.castShadow = false; ripples.push(r);
            }
            animated.push((t) => ripples.forEach((r, i) => { const k = (t * .4 + i * .17) % 1; r.scale.setScalar(.5 + k * 1.4); r.material.opacity = .35 * (1 - k); }));
            // лестница и спасательные круги
            for (const z of [-.15, .15]) part(G.cyl(.025, .025, .8, 6), mat(0xcfd6dc, {m: .8, r: .3}), -5.15, .1, water.position.z + z, field);
            for (const [x, z] of [[-3, -3.6], [3.5, 3.4]]) {
                const ring = part(G.tor(.28, .1, Math.PI * 2, 16), mat(0xff4d4d), x, .1, z, field); ring.rotation.x = Math.PI / 2;
                for (let i = 0; i < 4; i++) { const s = part(G.tor(.28, .102, Math.PI / 4, 4), mat(0xffffff), x, .1, z, field); s.rotation.x = Math.PI / 2; s.rotation.z = i * Math.PI / 2; }
            }
        }

        // земля вокруг поля
        if (!roof) {
            const ground = part(new THREE.PlaneGeometry(80, 60), mat(night ? 0x1d3a26 : 0x4f9a3f), 0, -.2, 0, field);
            ground.rotation.x = -Math.PI / 2; ground.castShadow = false;
            // дорожка у дома
            part(G.box(1.3, .06, ROWS + .4), mat(0xc9c1ad), -5.75, -.17, 0, field).castShadow = false;
            for (let i = 0; i < 6; i++) part(G.box(1.2, .07, .06), mat(0xa9a18d), -5.75, -.15, -2.5 + i, field).castShadow = false;
            // тротуар и дорога справа
            part(G.box(1.4, .08, 30), mat(0xb5b5ad), 6.8, -.16, 0, field).castShadow = false;
            part(G.box(5, .04, 30), mat(0x3a3d42), 10, -.18, 0, field).castShadow = false;
            for (let z = -14; z < 14; z += 2) part(G.box(.12, .05, 1), mat(0xffd23f), 10, -.15, z, field).castShadow = false;
            house(field, night);
            // живая изгородь, откуда выходят зомби
            for (let i = 0; i <= ROWS * 2; i++) bush(field, 5.7 + (i % 2) * .15, -2.6 + i * .52, .85, night);
            // забор и деревья сзади
            fence(field, -3.05, -5.2, 5.4);
            for (let i = 0; i < 9; i++) (i % 3 ? tree : pine)(field, -7 + i * 2 + Math.sin(i) * .6, -5 - (i % 2) * 1.6, .9 + (i % 3) * .2, night);
            // клумба спереди
            const colors = [0xff6fa8, 0xffd23f, 0xffffff, 0xb57edc, 0xff8c42];
            for (let i = 0; i < 26; i++) flowerDecor(field, -5 + i * .4, 3.05 + Math.sin(i * 1.7) * .1, colors[i % colors.length]);
            for (const x of [-7, 4.6]) bush(field, x, 3.6, 1.1, night);
            if (night) {
                for (const [x, z, s] of [[-3.8, -4], [-1, -4.3], [1.6, -3.9], [4.2, -4.2], [7.5, -2.8], [7.6, 2]].map((a) => [...a, .9])) grave(field, x, z, s);
            }
            if (pool) {
                // пляжный зонт
                const u = group(field, 7.4, 0, -4.2);
                part(G.cyl(.04, .04, 2, 6), mat(0xffffff), 0, 1, 0, u);
                for (let i = 0; i < 8; i++) { const c = part(new THREE.ConeGeometry(1.1, .45, 8, 1, true, i * Math.PI / 4, Math.PI / 4), mat(i % 2 ? 0xff4d4d : 0xffffff, {ds: true}), 0, 2.05, 0, u); c.castShadow = true; }
            }
        } else {
            // крыша: черепица вокруг поля и вид на город
            const slab = part(G.box(16, .3, 8), mat(0xa9502f), -.5, -.36, 0, field); slab.castShadow = false;
            for (let z = -3.8; z <= 3.8; z += .5) { const r = part(G.box(16, .05, .08), mat(0x8e4127), -.5, -.19, z, field); r.castShadow = false; }
            part(G.box(16, .3, .4), mat(0x7a3a24), -.5, -.05, -4, field);
            for (const [x, z] of [[-6.8, -2.8], [6.6, 2.6]]) {
                const ch = group(field, x, 0, z);
                part(G.box(.8, 1.4, .8), mat(0x8c4a3a), 0, .5, 0, ch);
                part(G.box(.95, .14, .95), mat(0x6f3a2d), 0, 1.25, 0, ch);
            }
            // антенна и кот на трубе
            part(G.cyl(.03, .03, 1.8, 5), mat(0x888888, {m: .7}), -7.6, .9, 2.6, field);
            part(G.box(1.2, .03, .03), mat(0x888888, {m: .7}), -7.6, 1.6, 2.6, field);
            const city = part(new THREE.PlaneGeometry(90, 70), mat(0x5a8f4a), 0, -7, 0, field); city.rotation.x = -Math.PI / 2; city.castShadow = false;
            for (let i = 0; i < 22; i++) {
                const a = i / 22 * Math.PI * 2, r = 14 + (i % 3) * 3;
                const hh = 3 + (i * 7 % 5);
                const b = group(field, Math.cos(a) * r, -7, Math.sin(a) * r - 4);
                part(G.box(2.2, hh, 2.2), mat([0xe8d8c0, 0xd4c4aa, 0xc0d0dc][i % 3]), 0, hh / 2, 0, b);
                const rf = part(new THREE.ConeGeometry(1.8, 1.1, 4), mat(0x9c3d2f), 0, hh + .55, 0, b); rf.rotation.y = Math.PI / 4;
            }
            // газонокосилки стоят на краю крыши
            part(G.box(1.2, .06, ROWS + .4), mat(0x8e4127), -5.75, -.17, 0, field).castShadow = false;
        }

        // небо: облака или луна со звёздами
        if (night) {
            const moon = part(G.sph(1.4, 20, 14), mat(0xf6f3d8, {e: 0xe8e4b8, ei: .8, flat: false}), 9, 12, -22, field); moon.castShadow = false;
            const sg = new THREE.BufferGeometry(), pts = [];
            for (let i = 0; i < 500; i++) { const a = Math.random() * Math.PI * 2, e = .15 + Math.random() * 1.2, r = 40; pts.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
            sg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
            field.add(new THREE.Points(sg, new THREE.PointsMaterial({color: 0xffffff, size: .18, fog: false})));
            // светлячки
            const flies = [];
            for (let i = 0; i < 16; i++) {
                const f = part(G.sph(.04, 6, 4), mat(0xd8ff7a, {e: 0xc8ff4a, ei: 1}), 0, 0, 0, field); f.castShadow = false;
                f.userData.seed = Math.random() * 100; flies.push(f);
            }
            animated.push((t) => flies.forEach((f) => { const s = f.userData.seed; f.position.set(Math.sin(t * .3 + s) * 7, .8 + Math.sin(t * 1.3 + s) * .4, Math.cos(t * .25 + s * 2) * 3.4); f.material.emissiveIntensity = .5 + Math.sin(t * 5 + s) * .5; }));
        } else {
            for (let i = 0; i < 7; i++) cloud(field, -20 + i * 6.5, 9 + (i % 3) * 1.5, -16 - (i % 2) * 6, 1.2 + (i % 3) * .4);
        }

        // газонокосилки — по одной на ряд
        for (let row = 0; row < ROWS; row++) {
            const mw = mower(field, rowZ(row));
            if (isWaterRow(row, loc)) { mw.position.y = 0; mw.position.x = -5.75; }
        }

        // невидимая плоскость для кликов по клеткам
        groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(COLS, ROWS), new THREE.MeshBasicMaterial({visible: false}));
        groundPlane.rotation.x = -Math.PI / 2;
        groundPlane.position.y = .001;
        field.add(groundPlane);

        // подсветка клетки под курсором
        hover = part(new THREE.PlaneGeometry(.96, .96), new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: .28, depthWrite: false}), 0, .015, 0, field);
        hover.rotation.x = -Math.PI / 2; hover.visible = false; hover.castShadow = false;
        ghost = null; ghostKey = "";
    }

    /* ---------- синхронизация с игрой ---------- */
    const MAX_HP = {wallnut: 800, tallnut: 1600, primalwallnut: 1200, spikerock: 600};
    function plantY(p) { return isWaterRow(p.row) && !["lily", "tanglekelp", "cattail"].includes(p.plantId) ? .03 : 0; }
    function syncPlants(t) {
        const seen = new Set();
        for (const p of boardPlants) {
            seen.add(p.id);
            let v = plantViews.get(p.id);
            if (!v || v.plantId !== p.plantId) {
                if (v) field.remove(v.root);
                const root = buildPlant(p.plantId);
                root.position.set(colX(p.col), plantY(p), rowZ(p.row));
                root.scale.setScalar(.01);
                field.add(root);
                if (isWaterRow(p.row) && !["lily", "tanglekelp", "cattail"].includes(p.plantId)) {
                    const pad = part(G.cyl(.34, .34, .03, 16), mat(0x4caf50), 0, -.03, 0, root); pad.castShadow = false;
                }
                root.traverse((o) => { o.userData.plantId = p.id; });
                v = {root, plantId: p.plantId, born: t, fired: -9, prevCd: p.cooldown ?? 0, phase: Math.random() * 6};
                plantViews.set(p.id, v);
            }
            animatePlant(v, p, t);
        }
        for (const [id, v] of plantViews) if (!seen.has(id)) { plantViews.delete(id); dying.push({root: v.root, t0: t, kind: "plant"}); }
    }
    function animatePlant(v, p, t) {
        const g = v.root, u = g.userData;
        const cd = p.cooldown ?? 0;
        if (cd > v.prevCd + 50) v.fired = t;
        v.prevCd = cd;
        const grow = Math.min(1, (t - v.born) / .35);
        const pop = grow < 1 ? 1 + Math.sin(grow * Math.PI) * .25 : 1;
        const recoil = Math.max(0, 1 - (t - v.fired) / .28);
        const breathe = 1 + Math.sin(t * 2.4 + v.phase) * .03;
        let s = grow * pop;
        if (u.grow) s *= .7 + .3 * Math.min(1, (p.age ?? 0) / 30000);
        g.scale.set(s, s * breathe, s);
        if (u.heads) u.heads.forEach((h, i) => {
            h.rotation.z = Math.sin(t * 1.8 + v.phase + i) * .06;
            if (u.type === "shooter") { h.position.x = -recoil * .09; h.scale.setScalar(1 + recoil * .12); }
            if (u.type === "flower") { h.rotation.y = -.35 + Math.sin(t * .9 + v.phase + i) * .2; const k = Math.max(0, 1 - (t - v.fired) / .6); h.scale.setScalar((i < 1 || u.heads.length > 1 ? (u.heads.length > 1 ? .75 : 1) : 1) * (1 + k * .2)); }
        });
        if (u.fists) u.fists.forEach((f, i) => { f.position.x = .18 + recoil * .18 * (i ? 1 : -1); });
        if (u.arm) { u.arm.rotation.z = -.35 + (recoil > 0 ? Math.sin((1 - recoil) * Math.PI) * 1.6 : 0); u.ammo.visible = recoil < .4; }
        if (u.spin) u.spin.rotation.y = t * (u.type === "shooter" ? 1.4 : 1) + v.phase;
        if (u.type === "mine") {
            const armed = (p.age ?? 0) >= 3000;
            u.body.position.y = armed ? 0 : -.12 + Math.min(1, (p.age ?? 0) / 3000) * .1;
            u.light.material = armed && Math.sin(t * 8) > 0 ? mat(0xff3b3b, {e: 0xff0000, ei: 1}) : mat(0x772222);
            u.light.visible = armed;
        }
        if (u.type === "bomb" || p.plantId === "doomshroom") {
            const k = Math.min(1, (p.age ?? 0) / 800);
            g.scale.multiplyScalar(1 + k * .25);
            g.position.x = colX(p.col) + Math.sin(t * 60) * .02 * k;
        }
        if (u.strands) u.strands.forEach((s, i) => { s.rotation.z = Math.sin(t * 1.6 + i) * .25; });
        if (u.type === "nut" && MAX_HP[p.plantId]) {
            const ratio = Math.max(0, p.health / MAX_HP[p.plantId]);
            g.rotation.z = ratio < .4 ? Math.sin(t * 20) * .03 : 0;
        }
        g.traverse((o) => { if (o.userData.flicker) { o.scale.set(1 + Math.sin(t * 17 + o.id) * .12, 1 + Math.sin(t * 13 + o.id) * .2, 1); } });
    }

    function zombieY(z) { return isWaterRow(z.row) ? -.38 : 0; }
    function syncZombies(t, dt) {
        const seen = new Set();
        for (const z of zombies) {
            seen.add(z.id);
            let v = zombieViews.get(z.id);
            if (!v || v.emoji !== z.emoji) {
                const old = v;
                v = buildZombie(z.emoji);
                v.root.position.set(old ? old.root.position.x : toX(z.x), zombieY(z), rowZ(z.row));
                if (old) field.remove(old.root);
                v.lastX = z.x; v.movedAt = t; v.phase = Math.random() * 6; v.spawn = old ? -9 : t;
                v.root.traverse((o) => { o.userData.zombieId = z.id; });
                field.add(v.root);
                if (isWaterRow(z.row)) addFloatRing(v);
                zombieViews.set(z.id, v);
            }
            const tx = toX(z.x), tz = rowZ(z.row);
            if (Math.abs(z.x - v.lastX) > .001) { v.movedAt = t; v.lastX = z.x; }
            const moving = t - v.movedAt < .25 && !(z.stun > 0);
            const k = Math.min(1, dt * 10);
            v.root.position.x += (tx - v.root.position.x) * k;
            v.root.position.z += (tz - v.root.position.z) * k;
            const appear = Math.min(1, (t - v.spawn) / .5);
            v.root.position.y += (zombieY(z) - (1 - appear) * .8 - v.root.position.y) * k;
            v.rig.rotation.y = z.friendly ? 0 : Math.PI;
            const speed = z.slow > 0 ? .5 : 1;
            v.phase += dt * (moving ? 7 * speed * (v.kind === "fast" ? 1.6 : 1) : 0);
            const swing = moving ? Math.sin(v.phase) * .55 : 0;
            v.legs[0].rotation.z = swing; v.legs[1].rotation.z = -swing;
            const eating = !moving && !(z.stun > 0) && !z.friendly;
            v.arms.forEach((a, i) => {
                a.rotation.z = 1.35 + (eating ? Math.sin(t * 12 + i * Math.PI) * .35 : Math.sin(v.phase + i * Math.PI) * .12);
            });
            v.head.rotation.x = eating ? Math.sin(t * 12) * .12 : Math.sin(t * 2 + v.phase) * .08;
            v.torso.rotation.x = Math.sin(v.phase * .5) * .05;
            v.root.position.y += moving ? Math.abs(Math.sin(v.phase)) * .03 : 0;
            if (v.bucket) v.bucket.visible = z.emoji.includes("🪣");
            if (v.ring) v.ring.visible = isWaterRow(z.row);
            if (z.friendly) tintZombie(v, 0x8a2be2, .45);
            else if (z.stun > 0) tintZombie(v, 0xffd23f, .35);
            else if (z.burn > 0) tintZombie(v, 0xff5a00, .4);
            else if (z.slow > 0) tintZombie(v, 0x3a8dff, .45);
            else tintZombie(v, 0x000000, 0);
        }
        for (const [id, v] of zombieViews) if (!seen.has(id)) { zombieViews.delete(id); dying.push({root: v.root, t0: t, kind: "zombie", v}); }
    }
    function addFloatRing(v) {
        const r = part(G.tor(.26, .07, Math.PI * 2, 14), mat(0xffd23f), 0, .5, 0, v.root);
        r.rotation.x = Math.PI / 2; v.ring = r;
    }

    function syncSuns(t, dt) {
        const seen = new Set();
        for (const d of sunDrops) {
            if (typeof isSunVisible === "function" && !isSunVisible(d)) continue;
            seen.add(d.id);
            let v = sunViews.get(d.id);
            if (!v) {
                v = buildSun();
                v.root.position.set(toX(d.x), 4.5, toZ(d.y));
                v.born = t; v.id = d.id;
                v.hit.userData.sunId = d.id;
                field.add(v.root);
                sunViews.set(d.id, v);
            }
            const targetY = .95 + Math.sin(t * 2 + v.born) * .08;
            v.root.position.y += (targetY - v.root.position.y) * Math.min(1, dt * 3);
            v.root.position.x += (toX(d.x) - v.root.position.x) * Math.min(1, dt * 6);
            v.root.position.z += (toZ(d.y) - v.root.position.z) * Math.min(1, dt * 6);
            v.rays.rotation.z = t * 1.2;
            v.root.quaternion.copy(camera.quaternion);
            const fade = d.remaining < 2000 ? .4 + .6 * Math.abs(Math.sin(t * 8)) : 1;
            v.root.scale.setScalar(fade < 1 ? .85 + fade * .15 : 1);
        }
        for (const [id, v] of sunViews) if (!seen.has(id)) { sunViews.delete(id); dying.push({root: v.root, t0: t, kind: "sun"}); }
    }

    function updateDying(t) {
        for (let i = dying.length - 1; i >= 0; i--) {
            const d = dying[i], k = (t - d.t0) / (d.kind === "zombie" ? .7 : .35);
            if (k >= 1) { field.remove(d.root); dying.splice(i, 1); continue; }
            if (d.kind === "zombie") { d.v.rig.rotation.z = k * 1.5 * (d.v.rig.rotation.y ? -1 : 1); d.root.position.y -= .01; tintZombie(d.v, 0x222222, k * .5); }
            else if (d.kind === "sun") { d.root.position.y += .12; d.root.scale.setScalar(1 - k); }
            else d.root.scale.setScalar(Math.max(.01, 1 - k));
        }
    }

    /* ---------- снаряды и эффекты ---------- */
    const SHOT_STYLE = {
        icepea: [0x9fe6ff, .09], snowpea: [0xe6f8ff, .1], wintermelon: [0xa6ecff, .16], firepea: [0xff7a1a, .1, true],
        electricpea: [0xfff27a, .08, true], melonpult: [0x4caf50, .16], cabbagepult: [0x9be15d, .13], kernelpult: [0xffe066, .09],
        corn: [0xffe066, .08], pepperpult: [0xe63946, .11, true], cactus: [0xf6f1d0, .05], starfruit: [0xffd23f, .09, true],
        mushroom: [0xb57edc, .07], scaredyshroom: [0xb57edc, .07], seashroom: [0x7fe0ff, .08], fumeshroom: [0xc89bff, .14],
        cattail: [0xf6f1d0, .06], bloomerang: [0xd9a441, .12], bokchoy: [0x7cc64a, .09], primalpea: [0x8c6a3a, .11],
    };
    const LOBBED = ["melonpult", "wintermelon", "cabbagepult", "kernelpult", "corn", "pepperpult"];
    function projectile(event, flightMs) {
        if (!field) return;
        let [color, size, glow] = SHOT_STYLE[event.plantId] || [0x7ed957, .085];
        if (event.shot === "🔥") { color = 0xff7a1a; glow = true; }
        if (event.shot === "🧈") { color = 0xffe9a0; size = .1; }
        const m = part(event.plantId === "cactus" || event.plantId === "cattail" ? G.cone(size, size * 5, 5) : event.plantId === "starfruit" ? G.ico(size, 0) : G.sph(size, 10, 8),
            mat(color, glow ? {e: color, ei: .9} : {r: .4}), 0, 0, 0, field);
        if (event.plantId === "cactus" || event.plantId === "cattail") m.rotation.z = -Math.PI / 2;
        if (event.plantId === "bloomerang") m.scale.set(1.6, .4, 1);
        const from = new THREE.Vector3(toX(event.fromX) + .15, .56, toZ(event.fromY));
        const to = new THREE.Vector3(toX(event.toX), .7, toZ(event.toY));
        const lob = LOBBED.includes(event.plantId);
        if (lob) from.y = .75;
        m.position.copy(from);
        projectiles.push({m, from, to, t0: performance.now() + (event.volley || 0) * 110, dur: Math.max(120, flightMs), lob});
    }
    function updateProjectiles(now) {
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i], k = (now - p.t0) / p.dur;
            p.m.visible = k >= 0;
            if (k >= 1) { field.remove(p.m); projectiles.splice(i, 1); continue; }
            if (k < 0) continue;
            p.m.position.lerpVectors(p.from, p.to, k);
            if (p.lob) p.m.position.y += Math.sin(k * Math.PI) * 1.4;
            p.m.rotation.y += .3;
        }
    }
    const EFFECT_COLORS = {hit: 0xfff2a8, frost: 0xb8ecff, zap: 0xfff27a, blast: 0xff7a1a, poof: 0xcfd2c8, plant: 0x9be15d, spark: 0xffe14a};
    function effect(type, x, y, symbol) {
        if (!field) return;
        const pos = new THREE.Vector3(toX(x), .6, toZ(y));
        const now = performance.now();
        if (type === "blast") {
            const ball = part(G.ico(.5, 1), new THREE.MeshBasicMaterial({color: 0xffa23a, transparent: true, opacity: .9}), pos.x, .4, pos.z, field);
            const core = part(G.ico(.3, 1), new THREE.MeshBasicMaterial({color: 0xfff2a8, transparent: true, opacity: 1}), pos.x, .4, pos.z, field);
            effects.push({m: ball, t0: now, dur: 600, grow: 3.2, fade: true}, {m: core, t0: now, dur: 400, grow: 2.2, fade: true});
            for (let i = 0; i < 8; i++) {
                const c = part(G.dod(.08), mat(0x3a2a1a), pos.x, .2, pos.z, field);
                const a = i / 8 * Math.PI * 2;
                effects.push({m: c, t0: now, dur: 700, vel: new THREE.Vector3(Math.cos(a) * 3, 4 + Math.random() * 2, Math.sin(a) * 3), gravity: true});
            }
            if (symbol) { const s = textSprite(symbol, .7); s.position.set(pos.x, 1.4, pos.z); field.add(s); effects.push({m: s, t0: now, dur: 800, rise: 1, fade: true}); }
            shake = .35;
            return;
        }
        if (type === "poof") {
            for (let i = 0; i < 6; i++) {
                const p = part(G.ico(.14, 0), new THREE.MeshBasicMaterial({color: 0xd9dcd2, transparent: true, opacity: .8}), pos.x, .5, pos.z, field);
                const a = i / 6 * Math.PI * 2;
                effects.push({m: p, t0: now, dur: 600, vel: new THREE.Vector3(Math.cos(a) * .8, .9, Math.sin(a) * .8), grow: 2, fade: true});
            }
            if (symbol && symbol !== "💨") { const s = textSprite(symbol, .5); s.position.set(pos.x, 1.2, pos.z); field.add(s); effects.push({m: s, t0: now, dur: 700, rise: .6, fade: true}); }
            return;
        }
        if (type === "plant") {
            const ring = part(G.tor(.3, .03, Math.PI * 2, 20), new THREE.MeshBasicMaterial({color: 0xd8ffb0, transparent: true, opacity: .9}), pos.x, .05, pos.z, field);
            ring.rotation.x = Math.PI / 2;
            effects.push({m: ring, t0: now, dur: 450, grow: 2.2, fade: true});
            for (let i = 0; i < 6; i++) {
                const d = part(G.dod(.05), mat(0x6b4423), pos.x, .1, pos.z, field);
                const a = Math.random() * Math.PI * 2;
                effects.push({m: d, t0: now, dur: 500, vel: new THREE.Vector3(Math.cos(a) * 1.2, 2.2, Math.sin(a) * 1.2), gravity: true});
            }
            return;
        }
        if (type === "spark" && symbol) {
            const s = textSprite(symbol, .5); s.position.set(pos.x, 1.2, pos.z); field.add(s);
            effects.push({m: s, t0: now, dur: 800, rise: 1.2, fade: true});
            return;
        }
        const c = EFFECT_COLORS[type] || 0xffffff;
        const b = part(G.ico(.12, 0), new THREE.MeshBasicMaterial({color: c, transparent: true, opacity: .95}), pos.x, .7, pos.z, field);
        effects.push({m: b, t0: now, dur: 260, grow: 2.4, fade: true});
    }
    let shake = 0;
    function updateEffects(now, dt) {
        for (let i = effects.length - 1; i >= 0; i--) {
            const e = effects[i], k = (now - e.t0) / e.dur;
            if (k >= 1) { field.remove(e.m); effects.splice(i, 1); continue; }
            if (e.grow) e.m.scale.setScalar(1 + (e.grow - 1) * k);
            if (e.vel) { e.m.position.addScaledVector(e.vel, dt); if (e.gravity) e.vel.y -= 12 * dt; if (e.m.position.y < 0) { e.m.position.y = 0; e.vel.multiplyScalar(.4); } }
            if (e.rise) e.m.position.y += e.rise * dt;
            if (e.fade && e.m.material) e.m.material.opacity = (e.m.material.userData.o0 ??= e.m.material.opacity) * (1 - k);
        }
    }

    /* ---------- ввод: клики, наведение, вращение ---------- */
    let down = null;
    function setPointer(e) {
        const r = canvas.getBoundingClientRect();
        pointer.x = (e.clientX - r.left) / r.width * 2 - 1;
        pointer.y = -(e.clientY - r.top) / r.height * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
    }
    function pickSun() {
        const hits = raycaster.intersectObjects([...sunViews.values()].map((v) => v.hit), false);
        return hits.length ? hits[0].object.userData.sunId : null;
    }
    function pickPlant() {
        const hits = raycaster.intersectObjects([...plantViews.values()].map((v) => v.root), true);
        return hits.length ? hits[0].object.userData.plantId : null;
    }
    function pickCell() {
        if (!groundPlane) return null;
        const hit = raycaster.intersectObject(groundPlane, false)[0];
        if (!hit) return null;
        const col = Math.floor(hit.point.x + COLS / 2), row = Math.floor(hit.point.z + ROWS / 2);
        if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
        return {row, col};
    }
    function onDown(e) {
        down = {x: e.clientX, y: e.clientY, t: performance.now(), button: e.button};
        if (typeof trackPointer === "function") trackPointer(e);
    }
    function onUp(e) {
        if (!down) return;
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
        const quick = performance.now() - down.t < 600;
        const button = down.button;
        down = null;
        if (moved > 7 || !quick || button !== 0) return;
        if (typeof trackPointer === "function") trackPointer(e);
        setPointer(e);
        const sunId = pickSun();
        if (sunId) { document.querySelector(`.sun[data-id="${sunId}"]`)?.click(); return; }
        const plantId = pickPlant();
        if (plantId) { document.querySelector(`.plant-on-board[data-id="${plantId}"]`)?.click(); return; }
        const cell = pickCell();
        if (cell && !shovelMode) plantAt(cell.row, cell.col);
    }
    let lastHoverPlant = null;
    function onMove(e) {
        if (typeof trackPointer === "function") trackPointer(e);
        if (down) { hidePlantTooltip?.(); return; }
        setPointer(e);
        const sunId = pickSun();
        const plantId = sunId ? null : pickPlant();
        canvas.style.cursor = sunId || plantId ? "pointer" : "";
        const fake = {pointerType: e.pointerType, clientX: e.clientX, clientY: e.clientY};
        if (plantId) {
            const bp = boardPlants.find((p) => p.id === plantId);
            if (bp && lastHoverPlant !== plantId) showPlantOwner(bp, fake);
            else movePlantTooltip(fake);
            lastHoverPlant = plantId;
        } else if (lastHoverPlant) { hidePlantTooltip(); lastHoverPlant = null; }
        hoverCell = sunId ? null : pickCell();
    }
    let hoverCell = null;
    function updateHover(t) {
        if (!hover) return;
        if (!hoverCell || !gameRunning) { hover.visible = false; if (ghost) ghost.visible = false; return; }
        const {row, col} = hoverCell;
        const occupied = boardPlants.find((p) => p.row === row && p.col === col);
        hover.visible = true;
        hover.position.set(colX(col), .015 + (isWaterRow(row) ? -.08 : 0), rowZ(row));
        const data = plants.find((p) => p.id === activePlantId);
        const enough = gameMode === "sandbox" || (data && getPlayerSun() >= data.cost);
        hover.material.color.setHex(shovelMode ? (occupied ? 0xff6a3a : 0xffffff) : occupied ? 0xff4d4d : enough ? 0x9bff6a : 0xffd23f);
        hover.material.opacity = .25 + Math.sin(t * 6) * .06;
        const key = shovelMode || occupied ? "" : activePlantId || "";
        if (key !== ghostKey) {
            if (ghost) field.remove(ghost);
            ghost = null; ghostKey = key;
            if (key) {
                ghost = buildPlant(key);
                ghost.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = .45; o.castShadow = false; } });
                field.add(ghost);
            }
        }
        if (ghost) { ghost.visible = true; ghost.position.set(colX(col), isWaterRow(row) ? .03 : 0, rowZ(row)); }
    }

    /* ---------- камера ---------- */
    const DEFAULT_POS = new THREE.Vector3(-.6, 8.6, 8.4), DEFAULT_TARGET = new THREE.Vector3(.2, 0, .3);
    function resetView() {
        camera.position.copy(DEFAULT_POS);
        controls.target.copy(DEFAULT_TARGET);
        controls.update();
    }

    // Поворот поля можно выключить: камера встаёт в обычное положение и больше не крутится.
    let rotateLocked = false;
    try { rotateLocked = localStorage.getItem("freasy3d-rotate-off") === "1"; } catch {}
    function applyRotateLock() {
        controls.enableRotate = !rotateLocked;
        controls.enablePan = !rotateLocked;
        controls.enableZoom = !rotateLocked;
        if (rotateLocked) resetView();
        const b = document.getElementById("rotateToggleButton");
        if (b) {
            b.textContent = rotateLocked ? "🔒" : "🔄";
            b.title = rotateLocked ? "Поворот поля выключен — нажми, чтобы включить" : "Выключить поворот поля";
            b.setAttribute("aria-pressed", String(rotateLocked));
        }
        const r = document.getElementById("resetViewButton");
        if (r) r.hidden = rotateLocked;
        const hint = document.getElementById("view3dHint");
        if (hint) hint.hidden = rotateLocked;
    }
    function toggleRotate() {
        rotateLocked = !rotateLocked;
        try { localStorage.setItem("freasy3d-rotate-off", rotateLocked ? "1" : "0"); } catch {}
        applyRotateLock();
    }

    /* ---------- главный цикл ---------- */
    let lastW = 0, lastH = 0;
    function loop() {
        requestAnimationFrame(loop);
        if (!canvas.isConnected || canvas.offsetParent === null) return;
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (!w || !h) return;
        if (w !== lastW || h !== lastH) { lastW = w; lastH = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
        const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime, now = performance.now();
        if (!field) buildField(typeof getBattleLocation === "function" ? getBattleLocation() : 0);
        syncPlants(t); syncZombies(t, dt); syncSuns(t, dt);
        updateDying(t); updateProjectiles(now); updateEffects(now, dt); updateHover(t);
        for (const a of animated) a(t, dt);
        controls.update();
        if (shake > 0) {
            shake = Math.max(0, shake - dt);
            camera.position.x += (Math.random() - .5) * shake * .25; camera.position.y += (Math.random() - .5) * shake * .25;
        }
        renderer.render(scene, camera);
    }

    function init() {
        const area = document.querySelector("#gameScreen .game-area");
        canvas = document.createElement("canvas");
        canvas.id = "view3d";
        area.appendChild(canvas);
        renderer = new THREE.WebGLRenderer({canvas, antialias: true});
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(40, 2, .1, 160);
        hemi = new THREE.HemisphereLight(0xe6f4ff, 0x4c6b2a, .78);
        scene.add(hemi);
        sunLight = new THREE.DirectionalLight(0xfff0d2, 1.05);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.set(2048, 2048);
        Object.assign(sunLight.shadow.camera, {left: -11, right: 11, top: 8, bottom: -8, near: 1, far: 40});
        sunLight.shadow.bias = -.0008;
        scene.add(sunLight);
        controls = new THREE.OrbitControls(camera, canvas);
        controls.enableDamping = true; controls.dampingFactor = .09;
        controls.minDistance = 5; controls.maxDistance = 24;
        controls.minPolarAngle = .12; controls.maxPolarAngle = 1.38;
        controls.screenSpacePanning = true;
        controls.mouseButtons = {LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN};
        controls.touches = {ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN};
        controls.addEventListener("change", () => {
            controls.target.x = Math.max(-8, Math.min(8, controls.target.x));
            controls.target.z = Math.max(-5, Math.min(5, controls.target.z));
            controls.target.y = Math.max(-1, Math.min(3, controls.target.y));
        });
        resetView();
        applyRotateLock();
        canvas.addEventListener("pointerdown", onDown);
        canvas.addEventListener("pointerup", onUp);
        canvas.addEventListener("pointermove", onMove);
        canvas.addEventListener("pointerleave", () => { hoverCell = null; hidePlantTooltip?.(); lastHoverPlant = null; });
        canvas.addEventListener("contextmenu", (e) => e.preventDefault());
        clock = new THREE.Clock();
        loop();
    }

    function onBoardCreated() {
        const loc = typeof getBattleLocation === "function" ? getBattleLocation() : 0;
        for (const v of plantViews.values()) field?.remove(v.root);
        for (const v of zombieViews.values()) field?.remove(v.root);
        for (const v of sunViews.values()) field?.remove(v.root);
        plantViews.clear(); zombieViews.clear(); sunViews.clear();
        dying.length = 0; projectiles.length = 0; effects.length = 0;
        buildField(loc);
        if (loc !== onBoardCreated.lastLoc) resetView();
        onBoardCreated.lastLoc = loc;
    }

    return {init, onBoardCreated, projectile, effect, resetView, toggleRotate};
})();

/* ---------- подключение к игре ---------- */
(() => {
    const originalCreateBoard = createBoard;
    createBoard = function () {
        originalCreateBoard.apply(this, arguments);
        View3D.onBoardCreated();
    };

    const originalRenderAttack = renderAttack;
    renderAttack = function (event) {
        const fresh = event?.id && !renderedAttackEvents.has(event.id);
        originalRenderAttack.apply(this, arguments);
        if (!fresh) return;
        const lawn = document.getElementById("lawn"), r = lawn?.getBoundingClientRect();
        View3D.projectile(event, getProjectileFlightTime(event, r?.width || 1, r?.height || 1));
    };

    const originalEffect = spawnGameEffect;
    spawnGameEffect = function (type, x, y, symbol = "") {
        originalEffect.apply(this, arguments);
        View3D.effect(type, x, y, symbol);
    };

    View3D.init();
})();
