/* =====================================================
   SUN
===================================================== */

function updateSun() {

    document.getElementById("sunCount")
        .textContent =
        getPlayerSun();


    renderPlayersPanel();

}


function spawnSun() {
    const owners = gameMode === "online" ? matchPlayers.map(player => player.user_id) : [null];
    for (const ownerId of owners) {
        const drop = {id: crypto.randomUUID(), x: BOARD_X_START + 3 + Math.random() * (BOARD_X_WIDTH - 6), y: 10 + Math.random() * 80, remaining: 10000, ownerId};
        sunDrops.push(drop);
        renderSun(drop);
    }
}

function spawnPlantSun(plant) {
    const drop = {
        id: crypto.randomUUID(),
        x: Math.min(BOARD_X_START + BOARD_X_WIDTH - 2, Math.max(BOARD_X_START + 2, boardColCenter(plant.col) + Math.random() * 4 - 2)),
        y: Math.min(92, Math.max(8, rowCenter(plant.row) + Math.random() * 8 - 4)),
        remaining: 10000,
        ownerId: plant.ownerId
    };
    sunDrops.push(drop);
    renderSun(drop);
}

function isSunVisible(drop) {
    return gameMode !== "online" || drop.ownerId === getLocalMatchUserId();
}

function renderSun(drop) {
    if (!isSunVisible(drop)) return;
    const element = document.createElement("div");
    element.className = "sun";
    element.dataset.id = drop.id;
    element.textContent = "☀️";
    element.style.left = `${drop.x}%`;
    element.style.top = `${drop.y}%`;
    element.onclick = event => {
        event.stopPropagation();
        if (gameMode === "online" && !isMatchHost()) sendMatchAction({type: "sun", id: drop.id});
        else collectSun(drop.id, gameMode === "online" ? getLocalMatchUserId() : currentUser?.id);
    };
    document.getElementById("lawn").appendChild(element);
}

function spawnGameEffect(type, x, y, symbol = "") {
    const lawn = document.getElementById("lawn");
    if (!lawn) return;
    const effect = document.createElement("span");
    effect.className = `game-effect game-effect-${type}`;
    effect.setAttribute("aria-hidden", "true");
    effect.textContent = symbol;
    effect.style.left = `${x}%`;
    effect.style.top = `${y}%`;
    lawn.appendChild(effect);
    if (typeof effect.addEventListener === "function") {
        effect.addEventListener("animationend", () => effect.remove(), {once: true});
    }
    setTimeout(() => effect.remove(), 1000);
}

function playGameSound(kind = "plant") {
    if (!soundEnabled) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioContext ||= new AudioContextClass();
    if (audioContext.state === "suspended") void audioContext.resume();
    const now = audioContext.currentTime;
    const settings = {
        plant: [520, 760, .09, "sine"],
        sun: [880, 1180, .12, "sine"],
        shot: [300, 190, .055, "triangle"],
        ice: [1050, 620, .14, "sine"],
        fire: [180, 90, .16, "sawtooth"],
        blast: [110, 45, .3, "sawtooth"],
        zombie: [240, 110, .18, "triangle"]
    }[kind] || [440, 330, .1, "sine"];
    const [start, end, duration, type] = settings;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(start, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, end), now + duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(kind === "blast" ? .12 : .055, now + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + .02);
}

function toggleGameSound() {
    soundEnabled = !soundEnabled;
    try { window.localStorage?.setItem("pvzSoundEnabled", String(soundEnabled)); } catch {}
    const button = document.getElementById("soundToggleButton");
    if (button) {
        button.textContent = soundEnabled ? "🔊" : "🔇";
        button.setAttribute("aria-label", soundEnabled ? "Выключить звук" : "Включить звук");
        button.title = soundEnabled ? "Выключить звук" : "Включить звук";
    }
    if (soundEnabled) playGameSound("sun");
}

function saveBackgroundGame() {
    if (!gameRunning || endingGame || gameMode === "online" || gameMode === "mini" || gameMode === "sandbox") return;
    try {
        const storage = window.localStorage;
        if (!storage) return;
        storage.setItem("pvzBackgroundGame", JSON.stringify({
            mode: gameMode,
            level: currentLevel,
            slot: infiniteSlot,
            savedAt: Date.now(),
            state: captureGame()
        }));
    } catch (error) {
        console.error("Не удалось сохранить текущую игру локально:", error);
    }
}

function clearBackgroundGame() {
    try { window.localStorage?.removeItem("pvzBackgroundGame"); } catch {}
}

function resumeBackgroundGame() {
    let saved;
    try {
        const storage = window.localStorage;
        if (!storage) return;
        saved = JSON.parse(storage.getItem("pvzBackgroundGame") || "null");
    } catch {
        clearBackgroundGame();
        return;
    }
    if (!saved?.state || !["campaign", "infinite"].includes(saved.mode)) return;
    const ageMinutes = Math.floor((Date.now() - saved.savedAt) / 60000);
    if (!window.confirm(`Найдено сохранение: ${saved.mode === "infinite" ? "бесконечная игра" : `уровень ${saved.level}`} · волна ${saved.state.wave}. Продолжить?`)) {
        clearBackgroundGame();
        return;
    }
    gameMode = saved.mode;
    currentLevel = saved.level || currentLevel;
    infiniteSlot = saved.slot ?? null;
    selectedPlants = filterUnlockedPlants(saved.state.selectedPlants, profile?.unlocked_level || currentLevel);
    startGame(saved.state);
    if (ageMinutes >= 1) console.info(`Игра восстановлена из сохранения (${ageMinutes} мин. назад).`);
}

if (typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") saveBackgroundGame();
    });
}
if (typeof window.addEventListener === "function") window.addEventListener("pagehide", saveBackgroundGame);

function collectSun(id, ownerId = currentUser?.id) {
    if (!gameRunning || endingGame) return;
    const index = sunDrops.findIndex(drop => drop.id === id);
    if (index < 0) return;
    if (sunDrops[index].ownerId && sunDrops[index].ownerId !== ownerId) return;
    const drop = sunDrops[index];
    playGameSound("sun");
    spawnGameEffect("spark", drop.x, drop.y, "+25");
    sunDrops.splice(index, 1);
    document.querySelector(`.sun[data-id="${id}"]`)?.remove();
    addPlayerSun(ownerId, 25);
    updateSun();
}

/* =====================================================
   ZOMBIES
===================================================== */

function spawnZombie(typeIndex = null) {

    const lawn =
        document.getElementById(
            "lawn"
        );


    if (!lawn) {

        return;

    }


    const maxType = gameMode === "sandbox" ? zombieTypes.length :
        Math.min(

            zombieTypes.length,

            1 +
            Math.floor(
                currentWave / 3
            )

        );


    const type = zombieTypes[gameMode === "sandbox" && Number.isInteger(typeIndex) && zombieTypes[typeIndex]
        ? typeIndex : Math.floor(Math.random() * maxType)];

    const row =
        Math.floor(
            Math.random() * BOARD_ROWS
        );


    const difficultyFactor = gameMode === "online"
        ? ({easy: 1, medium: 1.25, hard: 1.5, insane: 2, impossible: 3, infinite: 4}[currentLobby?.difficulty] ?? 1)
        : 1;
    const zombie = {

        id:
            crypto.randomUUID(),

        row,

        x:
            96,

        hp:
            type.hp * difficultyFactor *
            (1 + currentWave * .12) *
            (gameMode === "campaign" ? 1 + Math.min(.75, Math.max(0, currentLevel - 1) * .015) : 1) *
            (gameMode === "mini" && activeMiniGame === "boss" ? 2.5 : 1),

        speed:
            type.speed *
            (1 + currentWave * .04) *
            (gameMode === "campaign" ? 1 + Math.min(.18, Math.max(0, currentLevel - 1) * .004) : 1) *
            (gameMode === "mini" && activeMiniGame === "boss" ? 1.2 : 1),

        emoji:
            type.emoji

    };


    zombies.push(
        zombie
    );


    renderZombie(
        zombie
    );

}


function renderZombie(zombie) {

    const lawn =
        document.getElementById(
            "lawn"
        );


    const element =
        document.createElement(
            "div"
        );


    element.className =
        "zombie";


    element.dataset.id =
        zombie.id;


    element.textContent =
        zombie.emoji;


    element.style.left =
        `${zombie.x}%`;


    element.style.top =
        `${rowCenter(zombie.row)}%`;


    lawn.appendChild(
        element
    );

}

/* =====================================================
   GAME LOOPS
===================================================== */

function startGameLoops() {
    stopGame();
    gameRunning = true;
    gameTimer = setInterval(() => {
        if (!gameRunning || endingGame) return;
        spawnElapsed += 100;
        sunElapsed += 100;
        if (waveSpawned < waveSize() && spawnElapsed >= getSpawnDelay()) {
            spawnElapsed = 0;
            spawnZombie();
            waveSpawned++;
        }
        if (sunElapsed >= getSunDelay()) {
            sunElapsed = 0;
            spawnSun();
        }
        for (const drop of [...sunDrops]) {
            drop.remaining -= 100;
            if (drop.remaining <= 0) {
                sunDrops = sunDrops.filter(item => item.id !== drop.id);
                document.querySelector(`.sun[data-id="${drop.id}"]`)?.remove();
            }
        }
        updatePlants();
        updateZombies();
        if (!gameRunning || endingGame) return;
        if (waveSpawned >= waveSize() && zombies.length === 0) {
            if (!isEndless() && currentWave >= getWaveLimit()) {
                void finishLevel();
                return;
            }
            currentWave++;
            waveSpawned = 0;
            spawnElapsed = -3000;
            if (gameMode === "infinite" && (currentWave - 1) % 10 === 0) {
                void openInfinitePlantSelection();
                return;
            }
            document.getElementById("waveNumber").textContent = currentWave;
        }
    }, 100);
}

async function openInfinitePlantSelection() {
    stopGame();
    const pausedState = captureGame();
    const roster = [...selectedPlants];
    openPlantSelection({
        title: `Бесконечная игра • выбор после ${currentWave - 1} волн`,
        description: `Сейчас начинается волна ${currentWave}. Выбери растения для следующих волн.`,
        pool: getUnlockedPlantIds(profile?.unlocked_level || currentLevel),
        selected: roster,
        limit: 10,
        startText: "▶️ ПРОДОЛЖИТЬ ИГРУ",
        onStart: async () => {
            const nextState = {...pausedState, selectedPlants: [...selectedPlants]};
            if (!await saveInfinite(infiniteSlot, nextState)) {
                selectedPlants = roster;
                startGame({...pausedState, selectedPlants: roster});
                return;
            }
            startGame(nextState);
        }
    });
}

function waveSize() {
    if (gameMode === "mini" && activeMiniGame === "rush") return 7 + currentWave * 3;
    if (gameMode === "mini" && activeMiniGame === "wall") return 3 + currentWave * 2;
    if (gameMode === "mini" && activeMiniGame === "boss") return 12 + currentWave * 5;
    return 4 + currentWave * 2 + (gameMode === "campaign" ? Math.floor(Math.max(0, currentLevel - 1) / 10) : 0);
}

function getSpawnDelay() {
    const base =
        Math.max(1800, 5000 - currentWave * 250);

    if (gameMode === "mini" && activeMiniGame === "rush") return Math.max(900, base - 1300);
    if (gameMode === "mini" && activeMiniGame === "wall") return base + 700;
    if (gameMode === "mini" && activeMiniGame === "boss") return base + 900;

    return base;
}

function getSunDelay() {
    if (gameMode === "mini" && activeMiniGame === "sunrush") return 1800;
    if (gameMode === "mini" && activeMiniGame === "garden") return 2400;
    if (gameMode === "mini" && activeMiniGame === "night") return 6500;

    return 6000;
}

function updatePlants() {
    for (const plant of [...boardPlants]) {
        const id = plant.plantId;
        const data = plants.find(p => p.id === id);
        if (!data) continue;
        const x = boardColCenter(plant.col);
        const near = boardPlants.filter(p => p.id !== plant.id && Math.abs(p.row-plant.row)<=1 && Math.abs(p.col-plant.col)<=1);
        const boost = near.some(p => ["coffee", "lily", "moonflower"].includes(p.plantId)) ? 150 : 100;
        plant.age = (plant.age ?? 0) + 100;
        plant.cooldown = Math.max(0, (plant.cooldown ?? 0) - boost);
        if (id === "imitater") {
            if (plant.age >= 1500 && near.length) {
                plant.plantId = near.find(p => p.plantId !== "imitater")?.plantId || "peashooter";
                document.querySelector(`.plant-on-board[data-id="${plant.id}"]`)?.remove();
                renderBoardPlant(plant);
                spawnGameEffect("spark", x, rowCenter(plant.row), "🎭");
            }
            continue;
        }
        if (["sunflower", "twinflower", "sunshroom", "moonflower", "marigold"].includes(id)) {
            const interval = gameMode === "mini" && activeMiniGame === "garden" ? 5000 : id === "marigold" ? 14000 : 10000;
            if (!plant.cooldown && plant.age >= interval) {
                spawnPlantSun(plant);
                if (id === "twinflower" || id === "marigold" || (id === "sunshroom" && plant.age >= 30000)) spawnPlantSun(plant);
                plant.cooldown = interval;
            }
            continue;
        }
        if (id === "primalwallnut" && plant.age % 2000 === 0) plant.health = Math.min(1200, plant.health + 8);
        const enemies = zombies.filter(z => z.hp > 0 && !z.friendly);
        const lane = enemies.filter(z => z.row === plant.row).sort((a,b) => a.x-b.x);
        if (["cherry", "doomshroom", "jalapeno"].includes(id)) {
            if (plant.age < 800) continue;
            const radius = id === "doomshroom" ? 2 : 1;
            enemies.filter(z => id === "jalapeno" ? z.row === plant.row : Math.abs(z.row-plant.row)<=radius && Math.abs(z.x-x)<=(id === "doomshroom" ? 35 : 20)).forEach(z => z.hp -= 1800);
            spawnGameEffect("blast", x, rowCenter(plant.row), id === "jalapeno" ? "🔥🔥🔥" : "💥");
            playGameSound("blast"); removePlant(plant.id); continue;
        }
        if (["potatomine", "squash", "tanglekelp"].includes(id)) {
            const range = id === "squash" ? 12 : 6;
            const target = lane.find(z => Math.abs(z.x-x)<range);
            if (!target || (id === "potatomine" && plant.age<3000)) continue;
            (id === "tanglekelp" ? [target] : lane.filter(z => Math.abs(z.x-target.x)<10)).forEach(z => z.hp -= 1800);
            spawnGameEffect("blast", target.x, rowCenter(plant.row), data.emoji);
            removePlant(plant.id); continue;
        }
        if (plant.cooldown) continue;
        if (["spikeweed", "spikerock"].includes(id)) {
            lane.filter(z => Math.abs(z.x-x)<5).forEach(z => {z.hp -= id === "spikerock" ? 40 : 20; spawnGameEffect("hit",z.x,rowCenter(z.row),"✷");});
            plant.cooldown = 900; continue;
        }
        if (id === "magnetshroom") {
            const target = enemies.find(z => z.emoji.includes("🪣") && Math.abs(z.row-plant.row)<=1 && Math.abs(z.x-x)<30 && !z.disarmed);
            if (target) {target.disarmed=true; target.hp-=150; target.emoji="🧟"; const el=document.querySelector(`.zombie[data-id="${target.id}"]`); if(el) el.textContent=target.emoji; spawnGameEffect("zap",target.x,rowCenter(target.row),"🧲"); plant.cooldown=6000;}
            continue;
        }
        if (!data.damage) continue;
        let targets = lane.filter(z => z.x >= x-3).slice(0,1);
        if (["splitpea", "bokchoy"].includes(id)) targets = [lane.filter(z => z.x>=x)[0], [...lane].reverse().find(z => z.x<x)].filter(Boolean);
        if (id === "threepeater") targets = [-1,0,1].map(offset => enemies.filter(z => z.row===plant.row+offset && z.x>=x).sort((a,b)=>a.x-b.x)[0]).filter(Boolean);
        if (id === "cattail") targets = enemies.sort((a,b)=>a.x-b.x).slice(0,1);
        if (id === "starfruit") targets = enemies.filter(z => z.row===plant.row || Math.abs((z.x-x)/8-Math.abs(z.row-plant.row))<3).sort((a,b)=>Math.abs(a.x-x)-Math.abs(b.x-x)).slice(0,5);
        if (["cactus", "bloomerang", "fumeshroom"].includes(id)) targets = lane.filter(z=>z.x>=x && (id!=="fumeshroom" || z.x-x<25)).slice(0,id==="fumeshroom"?10:3);
        if (id === "scaredyshroom" && enemies.some(z=>Math.abs(z.row-plant.row)<=1 && Math.abs(z.x-x)<12)) continue;
        if (["bokchoy", "mushroom", "seashroom"].includes(id)) targets = targets.filter(z=>Math.abs(z.x-x)<(id==="bokchoy"?15:28));
        if (!targets.length) continue;
        for (const target of targets) {
            let damage = data.damage;
            let shot = data.shot;
            if (["corn","kernelpult"].includes(id) && Math.random()<.25) {shot="🧈"; target.stun=2000; damage=40;}
            if (["peashooter","repeater","splitpea","threepeater"].includes(id) && boardPlants.some(p=>p.plantId==="torchwood" && p.row===plant.row && boardColCenter(p.col)>x && boardColCenter(p.col)<target.x)) {damage*=2; shot="🔥"; target.burn=2000;}
            if (near.some(p=>p.plantId==="plantern")) damage*=1.25;
            const hits = id === "repeater" ? 2 : 1;
            target.hp -= damage*hits;
            for(let n=0;n<hits;n++) queueAttack(plant,target,shot,n);
            if (["icepea","snowpea","wintermelon"].includes(id)) target.slow=id==="snowpea"?5000:3000;
            if (["firepea","pepperpult"].includes(id)) {target.burn=3000; target.slow=0;}
            if (id==="primalpea") {target.x=Math.min(96,target.x+3); target.stun=500;}
            if (["melonpult","wintermelon","pepperpult","electricpea"].includes(id)) {
                enemies.filter(z=>z.id!==target.id && Math.abs(z.row-target.row)<=1 && Math.abs(z.x-target.x)<12).forEach(z=>{z.hp-=damage*.5; if(id==="wintermelon") z.slow=3000; if(id==="electricpea") queueAttack(plant,z,"⚡");});
            }
            if(id==="bloomerang") {target.hp-=damage; queueAttack(plant,target,"🪃");}
        }
        playGameSound(["icepea","snowpea","wintermelon"].includes(id)?"ice":id==="firepea"?"fire":"shot");
        plant.cooldown=id==="bokchoy"?700:1200;
    }
}

function queueAttack(plant, target, shot = null, volley = 0) {
    const event = {
        id: crypto.randomUUID(),
        plantId: plant.plantId,
        shot, volley,
        fromX: boardColCenter(plant.col) + 2,
        fromY: rowCenter(plant.row),
        toX: target.x,
        toY: rowCenter(target.row)
    };
    attackEvents.push(event);
    if (attackEvents.length > 30) attackEvents = attackEvents.slice(-30);
    renderAttack(event);
}

// One speed for every projectile, measured in lawn widths per second.
const PROJECTILE_SPEED = .55;
function getProjectileFlightTime(event, width, height) {
    const distance = Math.hypot((event.toX-event.fromX)*width/100, (event.toY-event.fromY)*height/100);
    return distance / (width * PROJECTILE_SPEED) * 1000;
}

function renderAttack(event) {
    if (!event?.id || renderedAttackEvents.has(event.id)) return;
    renderedAttackEvents.add(event.id);
    const lawn = document.getElementById("lawn");
    if (!lawn) return;

    const bounds = lawn.getBoundingClientRect();
    const flightTime = getProjectileFlightTime(event, bounds.width || 1, bounds.height || 1);
    const projectile = document.createElement("div");
    projectile.style.transitionDuration = `${flightTime}ms`;
    projectile.style.setProperty?.("--flight-time", `${flightTime}ms`);
    const projectileKind = ["icepea", "snowpea", "wintermelon"].includes(event.plantId)
        ? "ice-shot"
        : event.plantId === "firepea" ? "fire-shot"
        : event.plantId === "electricpea" ? "electric-shot"
        : event.plantId === "bokchoy" ? "punch" : "pea-shot";
    projectile.className = `projectile ${projectileKind} shot-${event.plantId}`;
    const symbol = event.shot || plants.find(p => p.id === event.plantId)?.shot;
    if (symbol && symbol !== "●") { projectile.textContent = symbol; projectile.className += " symbol-shot"; }
    if (["melonpult","wintermelon","cabbagepult","kernelpult","corn","pepperpult"].includes(event.plantId)) projectile.className += " lobbed-shot";
    projectile.style.marginLeft = `${(event.volley || 0) * -16}px`;
    projectile.style.left = `${event.fromX}%`;
    projectile.style.top = `${event.fromY}%`;
    lawn.appendChild(projectile);

    const animate =
        typeof requestAnimationFrame === "function"
            ? requestAnimationFrame
            : callback => setTimeout(callback, 0);

    animate(() => {
        projectile.style.left = `${event.toX}%`;
        projectile.style.top = `${event.toY}%`;
    });

    setTimeout(() => {
        projectile.remove();
        spawnGameEffect(projectileKind === "ice-shot" ? "frost" : projectileKind === "electric-shot" ? "zap" : "hit",
            event.toX, event.toY, projectileKind === "electric-shot" ? "⚡" : projectileKind === "ice-shot" ? "❄" : "✦");
    }, flightTime);
}


function updateZombies() {
    for (const zombie of [...zombies]) {
        if (zombie.hp <= 0) {
            playGameSound("zombie");
            spawnGameEffect("poof", zombie.x, rowCenter(zombie.row), "💨");
            zombies = zombies.filter(z => z.id !== zombie.id);
            document.querySelector(`.zombie[data-id="${zombie.id}"]`)?.remove();
            continue;
        }
        if (zombie.burn > 0) {zombie.hp -= 2; zombie.burn -= 100;}
        if (zombie.stun > 0) {zombie.stun -= 100; continue;}
        if (zombie.friendly) {
            const foe = zombies.find(z=>!z.friendly && z.hp>0 && z.row===zombie.row && Math.abs(z.x-zombie.x)<5);
            if(foe) {foe.hp-=8; zombie.hp-=2;} else zombie.x+=zombie.speed*.5;
            if(zombie.x>100) zombie.hp=0;
            const el=document.querySelector(`.zombie[data-id="${zombie.id}"]`); if(el) {el.style.left=`${zombie.x}%`; el.classList.add("hypnotized");}
            continue;
        }
        const blocker = boardPlants.find(p => p.row === zombie.row && !["spikeweed","spikerock","lily","flowerpot"].includes(p.plantId) && Math.abs(zombie.x - boardColCenter(p.col)) < 4);
        if (blocker) {
            const shield = boardPlants.some(p => ["umbrellaleaf","flowerpot"].includes(p.plantId) && Math.abs(p.row-blocker.row)<=1 && Math.abs(p.col-blocker.col)<=1);
            blocker.health -= shield ? .6 : 1.2;
            if(blocker.plantId==="garlic" && !zombie.garlicCooldown) {zombie.row=(zombie.row+1)%BOARD_ROWS; zombie.garlicCooldown=3000; spawnGameEffect("poof",zombie.x,rowCenter(zombie.row),"🧄");}
            if(blocker.plantId==="hypnoshroom") {zombie.friendly=true; removePlant(blocker.id); spawnGameEffect("zap",zombie.x,rowCenter(zombie.row),"🌀");}
            if (blocker.health <= 0) removePlant(blocker.id);
        } else {
            zombie.x -= zombie.speed * .5 * ((zombie.slow ?? 0) > 0 ? .5 : 1);
        }
        zombie.garlicCooldown = Math.max(0, (zombie.garlicCooldown || 0)-100);
        zombie.slow = Math.max(0, (zombie.slow ?? 0) - 100);
        const element = document.querySelector(`.zombie[data-id="${zombie.id}"]`);
        if (element) {
            element.style.left = `${zombie.x}%`;
            element.style.top = `${rowCenter(zombie.row)}%`;
            element.classList.toggle("slowed", (zombie.slow ?? 0) > 0);
        }
        if (zombie.x < 5) {
            void loseGame();
            return;
        }
    }
}

async function loseGame() {
    if (endingGame) return;
    endingGame = true;
    stopGame();
    clearBackgroundGame();
    if (gameMode === "online") return endOnlineMatch("🧟 Зомби добрались до дома. Поражение!");
    alert("🧟 Зомби добрались до дома. Попробуй ещё раз!");
    if (gameMode === "mini") {
        activeMiniGame = null;
        showMenu();
    } else if (gameMode === "infinite") await showSaves();
    else if (gameMode === "sandbox") openSandbox();
    else showMap();
}


function stopGame() {
    gameRunning = false;

    clearInterval(
        gameTimer
    );

    clearInterval(
        spawnTimer
    );

    clearInterval(
        sunTimer
    );


    gameTimer = null;

    spawnTimer = null;

    sunTimer = null;

}


async function finishLevel() {
    if (endingGame) return;
    document.getElementById("retryProgressButton").hidden = true;
    endingGame = true;
    stopGame();
    if (gameMode === "online") return endOnlineMatch("🎉 Все 10 волн пройдены!");
    if (gameMode === "mini") {
        clearBackgroundGame();
        alert("🎯 Мини-игра пройдена!");
        activeMiniGame = null;
        showMenu();
        return;
    }

    if (gameMode !== "campaign") return;


    if (
        !profile ||
        !currentUser
    ) {

        return;

    }


    if (
        currentLevel >
        (profile.unlocked_level || 0)
    ) {

        const newLevel =
            Math.min(
                50,
                currentLevel
            );


        const {
            data,
            error
        } =
            await supabaseClient
                .from("profiles")
                .update({

                    unlocked_level:
                        newLevel

                })
                .eq(
                    "id",
                    currentUser.id
                )
                .select()
                .single();


        if (error || !data) {
            alert("❌ Не удалось сохранить прохождение. Проверь соединение и нажми «Повторить сохранение».");
            endingGame = false;
            document.getElementById("retryProgressButton").hidden = false;
            return;
        }
        if (data) {

            profile =
                data;


            document.getElementById(
                "progressLabel"
            ).textContent =
                profile.unlocked_level;

        }

    }


    alert(

        `🌱 Уровень ${currentLevel} пройден!\n\n` +

        (currentLevel < 50 ? "Следующий уровень разблокирован." : "Все уровни пройдены!")

    );


    clearBackgroundGame();
    showMap();

}


async function exitGame() {
    if (savingGame) return;
    if (!await confirm(gameMode === "infinite" ? "Сохранить игру и выйти?" : "Выйти из уровня?")) return;
    if (gameMode === "online") {
        if (isMatchHost()) await endOnlineMatch("Ведущий завершил матч.");
        else await leaveLobby();
        return;
    }
    stopGame();
    if (gameMode === "infinite") {
        savingGame = true;
        try {
            if (!await saveInfinite(infiniteSlot, captureGame())) {
                startGameLoops();
                return;
            }
            clearBackgroundGame();
            await showSaves();
        } finally {
            savingGame = false;
        }
    } else {
        clearBackgroundGame();
        if (gameMode === "sandbox") showMenu();
        else showMap();
    }
}

function captureGame() {
    return structuredClone({version: 1, wave: currentWave, sun, playerSuns, plants: boardPlants, zombies,
        sunDrops, attackEvents, selectedPlants, matchPlantSelections, activePlantId, waveSpawned, spawnElapsed, sunElapsed, location: "infinite"});
}
