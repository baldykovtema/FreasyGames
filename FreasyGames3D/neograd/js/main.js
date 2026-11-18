'use strict';
// Неоград: сохранение, меню, начало игры и онлайн-комнаты.
(function () {
  const N = window.N, G = window.G, P = G.player;
  const $ = (id) => document.getElementById(id);
  const KEY = 'neograd-save';
  const START = { x: N.roadX(2) + N.ROAD / 2 + 4, z: N.roadX(2) + N.ROAD / 2 + 8 };

  G.save = function () {
    if (G.state !== 'play') return;
    const data = { v: 1, money: Math.floor(G.money), weapons: Object.fromEntries(Object.entries(G.weapons).filter(([k]) => k !== 'fist')), cur: G.cur, done: [...G.done], pkgs: [...G.foundPkgs], homes: [...G.homes], garage: G.garage, wardrobe: [...G.wardrobe], look: G.look, x: +(G.inside ? G.inside.door.x : P.x).toFixed(1), z: +(G.inside ? G.inside.door.z : P.z).toFixed(1), hp: Math.ceil(P.hp), armor: Math.ceil(P.armor) };
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
  };
  function load() { try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); return d && d.v === 1 ? d : null; } catch { return null; } }
  addEventListener('pagehide', () => G.save());
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') { G.save(); if (!G.paused && !G.noAutoPause) G.openPause(); } });

  let worldReady = false;
  function start(fresh, room) {
    G.unlockAudio();
    const d = fresh ? null : load();
    G.money = d ? d.money : 500; G.weapons = Object.assign({ fist: Infinity }, d ? d.weapons : { pistol: 36 }); G.cur = d && d.cur in G.weapons ? d.cur : 'pistol';
    G.done = new Set(d ? d.done : []); G.foundPkgs = new Set(d ? d.pkgs : []);
    G.homes = new Set(d && d.homes ? d.homes : []); G.garage = d && d.garage ? d.garage : []; G.wardrobe = new Set(d && d.wardrobe ? d.wardrobe : []);
    G.look = Object.assign({ skin: '#f2c79b', shirt: '#2a2d3a', pants: '#1f2a40', hair: '#2a1d10', hat: null, glasses: false }, d && d.look ? d.look : {});
    G.applyLook(); G.leaveInside();
    P.x = d ? d.x : START.x; P.z = d ? d.z : START.z; P.y = 0; P.hp = d ? Math.max(30, d.hp) : 100; P.armor = d ? d.armor : 0; P.mode = 'foot'; P.veh = null; P.model.visible = true; P.model.rotation.x = 0;
    G.col.push(P, 0.5, 0);
    G.wanted = 0; G.dead = false;
    if (!worldReady) { G.buildVenues(); G.placeFixed(); G.placeWorldPickups(); worldReady = true; }
    for (const p of G.pickups.filter((q) => q.kind === 'pkg')) { G.scene.remove(p.model); p.taken = true; }
    G.pickups = G.pickups.filter((q) => !q.taken); G.placePkgs();
    G.refreshSpots();
    G.state = 'play'; $('hud').hidden = false; document.body.classList.add('playing'); G.applyTouch(); G.showScreen(null); G.uiDirty = true;
    G.cam.yaw = Math.PI * 0.75;
    if (room) G.netConnect(room); else if (G.online) G.netDisconnect();
    if (!d) setTimeout(() => G.big('Добро пожаловать в Неоград', 'Жёлтый столб рядом — первое задание'), 400);
    G.lock();
  }
  $('playBtn').addEventListener('click', () => start(false));
  $('newBtn').addEventListener('click', () => { if (!load() || confirm('Начать заново? Деньги и задания сбросятся.')) start(true); });
  $('onlineBtn').addEventListener('click', () => { $('onlineNote').textContent = 'Твоё имя в сети: ' + G.myName() + (localStorage.getItem('freasy-session') ? '' : ' (войди в аккаунт FreasyGames, чтобы играть под своим ником)'); G.showScreen('online'); });
  $('roomGo').addEventListener('click', () => start(false, G.cleanRoom($('roomName').value)));
  $('quitBtn').addEventListener('click', () => {
    G.save(); if (G.online) G.netDisconnect(); if (P.veh) G.exitVehicle(true); G.leaveInside();
    G.cancelMission(); G.state = 'menu'; $('hud').hidden = true; document.body.classList.remove('playing', 'touch'); G.engine(false, 0); G.showScreen('menu'); refreshMenu();
  });
  function refreshMenu() { const d = load(); $('playBtn').textContent = d ? `Продолжить ↗ (${'$' + d.money.toLocaleString('ru-RU')}, заданий ${d.done.length} из ${G.MISSIONS.length})` : 'Играть ↗'; $('newBtn').hidden = !d; }
  refreshMenu();
  // за меню видно город с высоты
  G.camera.position.set(300, 120, 500); G.camera.lookAt(450, 0, 380);
  if (new URLSearchParams(location.search).get('test') === '1') window.__ng = { G, N, start };
  G.showScreen('menu');
  requestAnimationFrame(G.frame);
})();
