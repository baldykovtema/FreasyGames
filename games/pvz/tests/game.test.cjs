const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const path = require('node:path');
const projectRoot = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(projectRoot, 'css/styles.css'), 'utf8');
// Use the same files and load order as the browser, with only automatic startup disabled.
const scripts = [...html.matchAll(/<script src="(js\/[^"]+)"[^>]*><\/script>/g)].map(([, filename]) => ({
    filename,
    source: fs.readFileSync(path.join(projectRoot, filename), 'utf8')
        .replace(/\binit\(\);\s*$/, '')
}));
assert.ok(scripts.length, 'index.html must load the application scripts');

class Element {
    constructor(tag = 'div') {
        this.tagName = tag;
        this.children = [];
        this.style = {};
        this.dataset = {};
        this.attributes = {};
        this.className = '';
        this.textContent = '';
        this.value = '';
        this.classList = {
            contains: value => this.className.split(" ").includes(value),
            add: value => { this.className += ` ${value}`; },
            remove: value => { this.className = this.className.split(' ').filter(x => x !== value).join(' '); },
            toggle: value => { this.className.includes(value) ? this.classList.remove(value) : this.classList.add(value); }
        };
    }
    appendChild(child) { child.parent = this; this.children.push(child); return child; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); }
    setAttribute(name, value) { this.attributes[name] = value; }
    set innerHTML(value) { this.children = []; this._html = value; }
    get innerHTML() { return this._html || ''; }
    querySelectorAll(selector) {
        const match = element => {
            if (selector.startsWith('#')) return element.id === selector.slice(1);
            const parsed = /^\.([\w-]+)(?:\[data-id="([^"]+)"\])?$/.exec(selector);
            return parsed && element.className.split(' ').includes(parsed[1]) && (!parsed[2] || element.dataset.id === parsed[2]);
        };
        const result = [];
        const walk = element => { for (const child of element.children) { if (match(child)) result.push(child); walk(child); } };
        walk(this);
        return result;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getBoundingClientRect() { return {left: 0, top: 0, width: 1000, height: 600}; }
}

function createBackend() {
    const tables = {
        profiles: [{id: 'host', username: 'Host', unlocked_level: 30}, {id: 'guest', username: 'Guest', unlocked_level: 30}],
        infinite_saves: [],
        lobbies: [{id: 'room', host_id: 'host', status: 'waiting', difficulty: 'easy'}],
        lobby_players: [{id: 'host-row', lobby_id: 'room', user_id: 'host', username: 'Host', ready: true, player_color: 'red'},
            {id: 'guest-row', lobby_id: 'room', user_id: 'guest', username: 'Guest', ready: true, player_color: 'yellow'}]
    };
    const channels = [];
    const writes = [];
    let failure = null;
    function from(table) {
        let op = 'select', values, filters = [], singular = false;
        const query = {
            select() { return this; }, order() { return this; },
            eq(key, value) { filters.push(row => row[key] === value); return this; },
            in(key, values) { filters.push(row => values.includes(row[key])); return this; },
            gte(key, value) { filters.push(row => row[key] >= value); return this; },
            update(data) { op = 'update'; values = data; return this; },
            insert(data) { op = 'insert'; values = data; return this; },
            upsert(data) { op = 'upsert'; values = data; return this; },
            delete() { op = 'delete'; return this; },
            single() { singular = true; return this; }, maybeSingle() { singular = true; return this; },
            then(resolve, reject) {
                try {
                    if (failure && op !== 'select') return Promise.resolve({data: null, error: {message: failure}}).then(resolve, reject);
                    const rows = tables[table] || [];
                    let result = rows.filter(row => filters.every(filter => filter(row)));
                    if (op !== 'select') writes.push({table, op, values});
                    if (op === 'update') result.forEach(row => Object.assign(row, structuredClone(values)));
                    if (op === 'delete') tables[table] = rows.filter(row => !result.includes(row));
                    if (op === 'insert') { rows.push({id: `${table}-${rows.length + 1}`, ...structuredClone(values)}); result = [rows.at(-1)]; }
                    if (op === 'upsert') {
                        let row = rows.find(row => row.user_id === values.user_id && row.slot === values.slot);
                        if (row) Object.assign(row, structuredClone(values));
                        else rows.push(row = structuredClone(values));
                        result = [row];
                    }
                    return Promise.resolve({data: structuredClone(singular ? result[0] ?? null : result), error: null}).then(resolve, reject);
                } catch (error) { return Promise.reject(error).then(resolve, reject); }
            }
        };
        return query;
    }
    function channel(name) {
        const handlers = [];
        const ch = {
            name, handlers, connected: false,
            on(type, filter, callback) { handlers.push({type, filter, callback}); return this; },
            subscribe(callback) { this.connected = true; queueMicrotask(() => callback?.('SUBSCRIBED')); return this; },
            async send(message) {
                for (const other of channels) {
                    if (other === this || !other.connected || other.name !== name) continue;
                    for (const h of other.handlers) {
                        if (h.type === message.type && h.filter.event === message.event) h.callback({payload: structuredClone(message.payload)});
                    }
                }
                return 'ok';
            }
        };
        channels.push(ch);
        return ch;
    }
    return {
        tables, writes, fail: message => failure = message,
        client: {from, channel, removeChannel: async ch => { ch.connected = false; },
            rpc: async (name, args) => {
                if (name === 'get_lobby_players') {
                    return {data: structuredClone(tables.lobby_players.filter(row => row.lobby_id === args.p_lobby_id)), error: null};
                }
                if (name === 'join_lobby') {
                    const row = tables.lobby_players.find(row => row.lobby_id === args.p_lobby_id && row.username === args.p_username);
                    return {data: structuredClone(row || null), error: null};
                }
                return {data: null, error: {message: `Unknown rpc ${name}`}};
            },
            auth: {getSession: async () => ({data: {session: null}})}}
    };
}

function setup({backend = createBackend(), id = 'host'} = {}) {
    const root = new Element();
    for (const match of html.matchAll(/id="([^"]+)"/g)) {
        const element = new Element(); element.id = match[1]; root.appendChild(element);
    }
    const panel = new Element(); panel.className = 'players-panel'; root.appendChild(panel);
    const alerts = [], intervals = new Map();
    let timerId = 0;
    const context = vm.createContext({
        window: {supabase: {createClient: () => backend.client}},
        document: {documentElement: root, getElementById: id => root.querySelector('#' + id), createElement: tag => new Element(tag),
            querySelector: selector => root.querySelector(selector), querySelectorAll: selector => root.querySelectorAll(selector)},
        console: {log() {}, error() {}}, crypto: webcrypto, structuredClone,
        alert: message => alerts.push(message), confirm: () => true,
        setInterval: (callback, ms) => { intervals.set(++timerId, {callback, ms}); return timerId; },
        clearInterval: id => intervals.delete(id), setTimeout, clearTimeout, Date
    });
    for (const {filename, source} of scripts) vm.runInContext(source, context, {filename});
    const run = code => vm.runInContext(code, context);
    run(`currentUser = {id: '${id}'}; profile = {username: '${id === 'host' ? 'Host' : 'Guest'}', unlocked_level: 30}; currentLevel = 30; selectedPlants = ['peashooter', 'sunflower', 'wallnut', 'potatomine', 'cherry', 'icepea'];`);
    return {run, root, alerts, backend, context, async tick(ms, count = 1) {
        for (let i = 0; i < count; i++) {
            for (const [id, timer] of [...intervals]) if (intervals.has(id) && timer.ms === ms) await timer.callback();
        }
    }};
}

// These tests exercise the application scripts without network or user accounts.
test('empty lawn click plants selected card and charges the correct cost', () => {
    const app = setup();
    assert.match(css, /\.grid-cell\s*\{\s*pointer-events:\s*none/);
    app.run('startGame()');
    const buttons = app.root.querySelector('#myPlantList').children;
    buttons[1].onclick();
    app.run('handleLawnClick({target: document.getElementById("lawn"), currentTarget: document.getElementById("lawn"), clientX: 300, clientY: 150})');
    assert.equal(app.run('boardPlants[0].plantId'), 'sunflower');
    assert.equal(app.run('boardPlants[0].row'), 1);
    assert.equal(app.run('boardPlants[0].col'), 2);
    assert.equal(app.run('sun'), 75);
    assert.equal(app.run('activePlantId'), 'sunflower');
});

test('peashooter damages zombies, sunflower produces sun, wallnut blocks and takes damage', () => {
    const app = setup(); app.run('startGame(); sun = 1000; plantAt(0, 0); plantAt(1, 0, "sunflower"); plantAt(2, 0, "wallnut"); zombies = [{id:"z",row:0,x:50,hp:100,speed:1}]; updatePlants()');
    assert.equal(app.run('zombies[0].hp'), 80);
    app.run('for (let i=0;i<99;i++) updatePlants()');
    assert.equal(app.run('sun'), 800);
    assert.equal(app.run('sunDrops.length'), 1);
    app.run('collectSun(sunDrops[0].id)');
    assert.equal(app.run('sun'), 825);
    app.run('zombies = [{id:"block",row:2,x:boardColCenter(0),hp:100,speed:1}]; updateZombies()');
    assert.equal(app.run('zombies[0].x'), app.run('boardColCenter(0)'));
    assert.ok(app.run('boardPlants[2].health < 800'));
});

test('bombs wait for fuse, mines arm before exploding, ice slows targets', () => {
    const app = setup(); app.run('startGame(); sun = 1000; plantAt(0, 0, "cherry"); zombies = [{id:"z",row:0,x:15,hp:500,speed:1}]; updatePlants()');
    assert.equal(app.run('zombies[0].hp'), 500);
    app.run('for(let i=0;i<7;i++) updatePlants(); updateZombies()');
    assert.equal(app.run('zombies.length'), 0);
    app.run('plantAt(0,0,"potatomine"); zombies = [{id:"m",row:0,x:boardColCenter(0),hp:500,speed:1}]; updatePlants()');
    assert.equal(app.run('zombies[0].hp'), 500);
    app.run('for(let i=0;i<29;i++) updatePlants(); updateZombies()');
    assert.equal(app.run('zombies.length'), 0);
    app.run('plantAt(0,0,"icepea"); zombies = [{id:"i",row:0,x:30,hp:500,speed:1}]; updatePlants(); updateZombies()');
    assert.equal(app.run('zombies[0].x'), 29.75);
});

test('breach loses without incrementing wave, final killed wave wins exactly once', async () => {
    const app = setup(); app.run('showMap = () => {}; startGame(); zombies = [{id:"z",row:0,x:0,hp:100,speed:1}]; updateZombies()');
    assert.equal(app.run('currentWave'), 1);
    assert.equal(app.run('gameRunning'), false);
    assert.equal(app.alerts.length, 1);
    app.run('startGame(); currentWave = 5; waveSpawned = waveSize(); zombies = []');
    await app.tick(100, 2);
    assert.equal(app.run('gameRunning'), false);
    assert.equal(app.alerts.length, 2);
});

test('wave advances only after all scheduled zombies are defeated', async () => {
    const app = setup(); app.run('startGame(); waveSpawned = waveSize() - 1; zombies = []');
    await app.tick(100);
    assert.equal(app.run('currentWave'), 1);
    app.run('waveSpawned = waveSize(); zombies = [{id:"last", row:0,x:90,hp:1,speed:1}]');
    await app.tick(100);
    assert.equal(app.run('currentWave'), 1);
    app.run('zombies[0].hp = 0');
    await app.tick(100);
    assert.equal(app.run('currentWave'), 2);
    assert.equal(app.run('waveSpawned'), 0);
});

test('infinite save round-trip preserves zero sun, plants, enemies, wave and spawn progress', async () => {
    const app = setup();
    await app.run('newInfiniteGame(2); selectedPlants = ["peashooter"]; plantSelectionStart()');
    app.run('sun=1000; plantAt(1,2); sun=0; currentWave=12; waveSpawned=7; spawnElapsed=300; zombies=[{id:"saved",row:2,x:70,hp:50,speed:.35}]; showSaves = async () => {}');
    await app.run('exitGame()');
    assert.equal(app.run('gameRunning'), false);
    assert.equal(app.backend.tables.infinite_saves[0].save_data.sun, 0);
    await app.run('continueInfinite(2)');
    app.run('confirmPlantSelection()');
    assert.equal(app.run('sun'), 0);
    assert.equal(app.run('currentWave'), 12);
    assert.equal(app.run('boardPlants[0].col'), 2);
    assert.equal(app.run('zombies[0].x'), 70);
    assert.equal(app.run('waveSpawned'), 7);
    assert.equal(app.run('spawnElapsed'), 300);
    assert.equal(app.run('gameRunning'), true);
    app.run('waveSpawned = waveSize(); zombies=[]');
    await app.tick(100);
    assert.equal(app.run('currentWave'), 13);
});

test('failed save resumes game and does not show success or exit', async () => {
    const app = setup(); await app.run('newInfiniteGame(1); selectedPlants = ["peashooter"]; plantSelectionStart()');
    app.backend.fail('offline');
    app.run('let exited = false; showSaves = async () => { exited = true; }');
    await app.run('exitGame()');
    assert.equal(app.run('exited'), false);
    assert.equal(app.run('gameRunning'), true);
    assert.match(app.alerts.at(-1), /Ошибка сохранения/);
});

test('sun cannot be collected twice', () => {
    const app = setup(); app.run('startGame(); spawnSun(); const id = sunDrops[0].id; collectSun(id); collectSun(id)');
    assert.equal(app.run('sun'), 150);
});

test('two players start one shared simulation with separate sun balances and synchronize planting, sun and end', async () => {
    const backend = createBackend();
    const host = setup({backend}), guest = setup({backend, id: 'guest'});
    for (const app of [host, guest]) {
        app.context.lobbyFixture = structuredClone(backend.tables.lobbies[0]);
        app.context.playersFixture = structuredClone(backend.tables.lobby_players);
        app.run('currentLobby = lobbyFixture; showOnline = async () => {}');
        await app.run('startOnlineMatch(playersFixture)');
    }
    await guest.tick(250);
    await host.tick(250);
    assert.equal(host.run('gameRunning'), true);
    assert.equal(guest.run('gameRunning'), true);
    assert.equal(guest.run('gameTimer'), null, 'guest must not run its own enemy simulation');
    assert.equal(backend.tables.lobbies[0].status, 'playing');
    await guest.run('sendMatchAction({type:"plant",row:2,col:3,plantId:"sunflower"})');
    await host.tick(250);
    assert.equal(host.run('boardPlants[0].owner'), 'Guest');
    assert.equal(guest.run('boardPlants[0].owner'), 'Guest');
    assert.equal(guest.run('playerSuns.guest'), 75);
    assert.equal(guest.run('playerSuns.host'), 125);
    host.run('spawnSun()'); await host.tick(250);
    assert.equal(host.run('sunDrops.length'), 2);
    const hostDrop = host.run('sunDrops.find(drop => drop.ownerId === "host").id');
    const guestDrop = guest.run('sunDrops.find(drop => drop.ownerId === "guest").id');
    assert.ok(host.root.querySelector(`.sun[data-id="${hostDrop}"]`));
    assert.equal(host.root.querySelector(`.sun[data-id="${guestDrop}"]`), null);
    assert.ok(guest.root.querySelector(`.sun[data-id="${guestDrop}"]`));
    assert.equal(guest.root.querySelector(`.sun[data-id="${hostDrop}"]`), null);
    await guest.run('sendMatchAction({type:"sun",id:sunDrops.find(drop => drop.ownerId === "host").id})');
    assert.equal(host.run('playerSuns.guest'), 75);
    assert.equal(host.run('sunDrops.length'), 2);
    await guest.run('sendMatchAction({type:"sun",id:sunDrops.find(drop => drop.ownerId === "guest").id})');
    await host.tick(250);
    assert.equal(guest.run('playerSuns.guest'), 100);
    assert.equal(guest.run('playerSuns.host'), 125);
    await guest.run('sendMatchAction({type:"remove",id:boardPlants[0].id})');
    await host.tick(250);
    assert.equal(guest.run('boardPlants.length'), 0);
    await host.run('endOnlineMatch("Победа")');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(host.run('gameRunning'), false);
    assert.equal(guest.run('gameRunning'), false);
    assert.equal(host.run('currentLobby'), null);
    assert.equal(guest.run('currentLobby'), null);
    assert.equal(backend.tables.lobby_players.length, 0);
});

test('match hello uses the lobby player row when auth id is stale', async () => {
    const backend = createBackend();
    const host = setup({backend}), guest = setup({backend, id: 'guest'});

    host.context.lobbyFixture = structuredClone(backend.tables.lobbies[0]);
    host.context.playersFixture = structuredClone(backend.tables.lobby_players);
    host.run('currentLobby = lobbyFixture; showOnline = async () => {}');
    await host.run('startOnlineMatch(playersFixture)');

    guest.context.lobbyFixture = structuredClone(backend.tables.lobbies[0]);
    guest.context.playersFixture = structuredClone(backend.tables.lobby_players);
    guest.run('currentUser = {id:"stale-auth"}; profile = {username:"Guest", unlocked_level:30}; currentLobby = lobbyFixture; showOnline = async () => {}');
    await guest.run('startOnlineMatch(playersFixture)');

    await guest.tick(250);
    await host.tick(250);

    assert.equal(host.run('gameRunning'), true);
    assert.equal(guest.run('gameRunning'), true);
});

test('online chat uses the local lobby player id when auth id is stale', async () => {
    const backend = createBackend();
    const host = setup({backend}), guest = setup({backend, id: 'guest'});

    for (const app of [host, guest]) {
        app.context.lobbyFixture = structuredClone(backend.tables.lobbies[0]);
        app.context.playersFixture = structuredClone(backend.tables.lobby_players);
        app.run('currentLobby = lobbyFixture; showOnline = async () => {}');
        await app.run('startOnlineMatch(playersFixture)');
    }

    await guest.tick(250);
    await host.tick(250);
    guest.run('currentUser = {id:"stale-auth"}; profile = {username:"Guest", unlocked_level:30}; document.getElementById("chatInput").value = "hello"; sendChat()');
    await new Promise(resolve => setImmediate(resolve));

    assert.match(host.root.querySelector('#chatMessages').children.at(-1).textContent, /Guest: hello/);
});

test('lobby refresh during a playing match does not clear match players', async () => {
    const app = setup();
    app.context.lobbyFixture = structuredClone(app.backend.tables.lobbies[0]);
    app.context.playersFixture = structuredClone(app.backend.tables.lobby_players);
    app.run('currentLobby = lobbyFixture; showOnline = async () => {}');
    await app.run('startOnlineMatch(playersFixture)');
    await app.tick(250);
    app.backend.tables.lobbies[0].status = 'playing';
    app.backend.tables.lobby_players = [];
    await app.run('renderLobby()');
    assert.equal(app.run('matchPlayers.length'), 2);
});

test('guest renders attack events received from host state', async () => {
    const backend = createBackend();
    const host = setup({backend}), guest = setup({backend, id: 'guest'});

    for (const app of [host, guest]) {
        app.context.lobbyFixture = structuredClone(backend.tables.lobbies[0]);
        app.context.playersFixture = structuredClone(backend.tables.lobby_players);
        app.run('currentLobby = lobbyFixture; showOnline = async () => {}');
        await app.run('startOnlineMatch(playersFixture)');
    }

    await guest.tick(250);
    await host.tick(250);
    host.run('sun=1000; plantAt(0,0,"peashooter","Host","host"); zombies=[{id:"z",row:0,x:50,hp:100,speed:1}]; updatePlants()');
    await host.tick(250);

    assert.ok(guest.root.querySelector('#lawn').querySelector('.projectile'));
});

test('ready lobby starts only after every player is ready', async () => {
    const app = setup();
    app.context.lobbyFixture = structuredClone(app.backend.tables.lobbies[0]);
    app.run('currentLobby = lobbyFixture');
    app.backend.tables.lobby_players[1].ready = false;
    await app.run('renderLobby()');
    assert.equal(app.run('matchChannel'), null);
    app.backend.tables.lobby_players[1].ready = true;
    await app.run('renderLobby()');
    assert.ok(app.run('matchChannel'));
    assert.equal(app.run('gameRunning'), false, 'wait for all clients to connect before starting');
});

test('ready button follows the local joined lobby row, not another visible player', async () => {
    const app = setup();
    app.context.lobbyFixture = structuredClone(app.backend.tables.lobbies[0]);
    app.run('currentLobby = lobbyFixture; profile = {username:"Host", unlocked_level:30}; currentUser = {id:"guest"}; currentLobbyPlayerId = "host-row"');
    app.backend.tables.lobby_players[1].ready = false;
    await app.run('renderLobby()');
    assert.equal(app.root.querySelector('#readyButton').textContent, '🔴 НЕ ГОТОВ');
    await app.run('toggleReady()');
    assert.equal(app.backend.tables.lobby_players.find(row => row.id === 'host-row').ready, false);
    assert.equal(app.backend.tables.lobby_players.find(row => row.id === 'guest-row').ready, false);
});

test('progress failure pauses and allows an explicit retry without repeated alerts', async () => {
    const app = setup();
    app.run('showMap = () => {}; startGame(); currentLevel = 31; currentWave = 10; waveSpawned = waveSize()');
    app.backend.fail('offline');
    await app.run('finishLevel()');
    assert.equal(app.run('gameRunning'), false);
    assert.equal(app.root.querySelector('#retryProgressButton').hidden, false);
    await app.tick(100, 10);
    assert.equal(app.alerts.length, 1);
    app.backend.fail(null);
    await app.run('finishLevel()');
    assert.equal(app.run('profile.unlocked_level'), 31);
    assert.equal(app.root.querySelector('#retryProgressButton').hidden, true);
    assert.equal(app.backend.writes.filter(w => w.table === 'profiles').length, 1);
});

test('host waits for confirmed realtime subscription before starting the simulation', async () => {
    const backend = createBackend();
    backend.tables.lobby_players = backend.tables.lobby_players.slice(0, 1);
    const originalChannel = backend.client.channel;
    let completeSubscription;
    backend.client.channel = name => {
        const channel = originalChannel(name);
        channel.subscribe = callback => { completeSubscription = () => callback('SUBSCRIBED'); return channel; };
        return channel;
    };
    const app = setup({backend});
    app.context.fixture = structuredClone(backend.tables.lobbies[0]);
    app.context.roster = structuredClone(backend.tables.lobby_players);
    await app.run('currentLobby = fixture; startOnlineMatch(roster)');
    await app.tick(250, 3);
    assert.equal(app.run('gameRunning'), false);
    assert.equal(backend.tables.lobbies[0].status, 'waiting');
    completeSubscription();
    await app.tick(250);
    assert.equal(app.run('gameRunning'), true);
});

test('auth callback returns immediately and loads profile outside the session lock', async () => {
    const app = setup();
    let callback;
    app.backend.client.auth.onAuthStateChange = fn => { callback = fn; };
    app.run('currentUser = null; let loaded = false; loadUser = async () => { loaded = true; }');
    await app.run('init()');
    assert.equal(callback('SIGNED_IN', {user: {id: 'host'}}), undefined);
    assert.equal(app.run('loaded'), false);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(app.run('loaded'), true);
});

test('overlapping join clicks create only one entry operation', async () => {
    const app = setup();
    let finish;
    app.context.entry = () => new Promise(resolve => { finish = resolve; });
    const first = app.run('enterLobby(entry)');
    await app.run('enterLobby(() => { throw new Error("second request"); })');
    assert.equal(app.alerts.length, 0);
    finish();
    await first;
    assert.equal(app.run('joiningLobby'), false);
});

test('failed action delivery returns false and reports a visible connection status', async () => {
    const app = setup();
    await app.run('currentLobby = {id:"room"}; matchSubscribed = true; matchChannel = {send: async () => "timed out"}; sendMatchAction({type:"sun",id:"missing"})');
    assert.equal(await app.run('sendMatchAction({type:"sun",id:"missing"})'), false);
    assert.match(app.root.querySelector('#matchStatus').textContent, /не отправлено/);
});

test('online list hides stale lobby ghosts and shows each player once', async () => {
    const app = setup();
    const fresh = new Date().toISOString();
    const stale = new Date(Date.now() - 120000).toISOString();
    app.backend.tables.lobbies = [
        {id: 'old-room', host_id: 'guest', status: 'waiting', difficulty: 'impossible'},
        {id: 'fresh-room', host_id: 'guest', status: 'waiting', difficulty: 'medium'},
        {id: 'stale-room', host_id: 'ghost', status: 'waiting', difficulty: 'easy'}
    ];
    app.backend.tables.lobby_players = [
        {lobby_id: 'old-room', user_id: 'guest', username: 'Guest', ready: false, player_color: 'red', last_seen: fresh},
        {lobby_id: 'fresh-room', user_id: 'guest', username: 'Guest', ready: false, player_color: 'yellow', last_seen: fresh},
        {lobby_id: 'stale-room', user_id: 'ghost', username: 'Ghost', ready: false, player_color: 'blue', last_seen: stale}
    ];
    await app.run('renderOnlinePlayers()');
    const cards = app.root.querySelector('#onlinePlayersList').children;
    assert.equal(cards.length, 1);
    assert.equal(cards[0].querySelector('.online-player-name').textContent, 'Guest');
});
