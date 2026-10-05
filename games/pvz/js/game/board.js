/* =====================================================
   GAME
===================================================== */

function startGame(saved = null) {
    if (gameMode !== "online") selectedPlants =
        filterUnlockedPlants(selectedPlants, gameMode === "campaign" ? currentLevel : profile?.unlocked_level || currentLevel);

    if (!selectedPlants.length) {
        alert("Выбери хотя бы одно растение.");
        return;
    }
    stopGame();
    endingGame = false;
    document.getElementById("retryProgressButton").hidden = true;
    document.getElementById("exitGameButton").textContent = gameMode === "infinite" ? "💾 Сохранить и выйти" : "← Выйти";
    sun = saved?.sun ?? 125;
    currentWave = saved?.wave ?? 1;
    boardPlants = structuredClone(saved?.plants ?? []);
    zombies = structuredClone(saved?.zombies ?? []);
    sunDrops = structuredClone(saved?.sunDrops ?? []);
    attackEvents = structuredClone(saved?.attackEvents ?? []);
    renderedAttackEvents = new Set();
    waveSpawned = saved?.waveSpawned ?? zombies.length;
    spawnElapsed = saved?.spawnElapsed ?? -5000;
    sunElapsed = saved?.sunElapsed ?? 0;
    activePlantId = selectedPlants.includes(saved?.activePlantId)
        ? saved.activePlantId : selectedPlants[0];
    shovelMode = false;
    document.getElementById("shovelButton").textContent = "🪣 Лопата";
    document.getElementById("shovelButton").style.background = "";
    document.getElementById("levelGameName").textContent = gameMode === "infinite"
        ? `Бесконечная игра • слот ${infiniteSlot}`
        : gameMode === "online" ? "Совместная игра • личное солнце"
            : gameMode === "mini" ? getMiniGameTitle()
                : `Уровень ${currentLevel}`;
    document.getElementById("waveLimit").textContent = isEndless() ? " / ∞" : ` / ${getWaveLimit()}`;
    document.getElementById("waveNumber").textContent = currentWave;
    document.getElementById("chatMessages").innerHTML = "";
    document.getElementById("chatBox").classList.remove("open");
    document.getElementById("chatBox").hidden = gameMode !== "online";
    document.getElementById("chatButton").hidden = gameMode !== "online";
    if (gameMode === "online") initializePlayerSuns(saved?.playerSuns);
    renderMyPlants();
    renderPlayersPanel();
    createBoard();
    boardPlants.forEach(renderBoardPlant);
    zombies.forEach(renderZombie);
    sunDrops.forEach(renderSun);
    updateSun();
    showScreen("gameScreen");
    const soundButton = document.getElementById("soundToggleButton");
    if (soundButton) {
        soundButton.textContent = soundEnabled ? "🔊" : "🔇";
        soundButton.setAttribute("aria-label", soundEnabled ? "Выключить звук" : "Включить звук");
    }
    gameRunning = true;
    clearInterval(autosaveTimer);
    if (gameMode !== "online") {
        autosaveTimer = setInterval(saveBackgroundGame, 15000);
        saveBackgroundGame();
    }
    if (gameMode !== "online" || isMatchHost()) startGameLoops();
}

function isEndless() {
    return gameMode === "infinite" || (gameMode === "online" && currentLobby?.difficulty === "infinite");
}

function getWaveLimit() {
    if (gameMode === "mini") return activeMiniGame === "rush" ? 6 : activeMiniGame === "boss" ? 2 : 5;
    return gameMode === "campaign" ? 5 : 10;
}

function getMiniGameTitle() {
    if (activeMiniGame === "sunrush") return "Мини-игра • Солнечный марафон";
    if (activeMiniGame === "rush") return "Мини-игра • Быстрый натиск";
    if (activeMiniGame === "wall") return "Мини-игра • Оборона орехами";
    if (activeMiniGame === "garden") return "Мини-игра • Солнечный сад";
    if (activeMiniGame === "night") return "Мини-игра • Ночная смена";
    if (activeMiniGame === "boss") return "Мини-игра • Большая угроза";
    return "Мини-игра";
}

function isMatchHost() {
    return currentLobby?.host_id === currentUser?.id;
}

function initializePlayerSuns(savedPlayerSuns = null) {
    playerSuns = {};
    for (const player of matchPlayers) {
        playerSuns[player.user_id] = savedPlayerSuns?.[player.user_id] ?? 125;
    }
}

function getSunOwnerId(ownerId = currentUser?.id) {
    if (gameMode !== "online") return null;
    return ownerId || currentUser?.id;
}

function getPlayerSun(ownerId = currentUser?.id) {
    const sunOwnerId = getSunOwnerId(ownerId);
    return sunOwnerId ? (playerSuns[sunOwnerId] ?? 125) : sun;
}

function setPlayerSun(ownerId, value) {
    const sunOwnerId = getSunOwnerId(ownerId);
    if (!sunOwnerId) {
        sun = value;
        return;
    }
    playerSuns[sunOwnerId] = value;
}

function addPlayerSun(ownerId, amount) {
    setPlayerSun(ownerId, getPlayerSun(ownerId) + amount);
}

function renderPlayersPanel() {
    const panel = document.querySelector(".players-panel");
    panel.innerHTML = "";
    const title = document.createElement("h3");
    title.textContent = gameMode === "online" ? "👥 Команда • личное ☀️" : "☀️ Игрок";
    panel.appendChild(title);
    const roster = gameMode === "online" ? matchPlayers : [{username: profile.username}];
    for (const player of roster) {
        const row = document.createElement("div");
        row.className = "player-row";
        const name = document.createElement("span");
        name.textContent = player.username;
        row.appendChild(name);
        const count = document.createElement("b");
        if (gameMode === "online" && player.user_id === currentUser?.id) count.id = "mySun";
        else if (gameMode !== "online") count.id = "mySun";
        count.textContent = getPlayerSun(player.user_id);
        row.appendChild(count);
        panel.appendChild(row);
    }
}

function showNoSunNotice() {
    if (!document.body) {
        alert("☀️ Недостаточно солнца!");
        return;
    }

    let notice =
        document.getElementById("noSunNotice");

    if (!notice) {
        notice =
            document.createElement("div");

        notice.id =
            "noSunNotice";

        notice.className =
            "no-sun-notice";

        notice.textContent =
            "Не хвотоает денег";

        document.body
            .appendChild(notice);
    }

    notice.style.left =
        `${lastPointerX}px`;

    notice.style.top =
        `${lastPointerY}px`;

    notice.classList.add("show");

    clearTimeout(showNoSunNotice.timer);

    showNoSunNotice.timer =
        setTimeout(
            () => notice.classList.remove("show"),
            900
        );
}


function createBoard() {

    const lawn =
        document.getElementById("lawn");


    lawn.innerHTML = "";


    for (
        let row = 0;
        row < BOARD_ROWS;
        row++
    ) {

        for (
            let col = 0;
            col < 10;
            col++
        ) {

            const cell =
                document.createElement("div");


            cell.className =
                "grid-cell";


            cell.style.left =
                `${boardColStart(col)}%`;


            cell.style.top =
                `${rowTop(row)}%`;


            lawn.appendChild(cell);

        }

    }

    const house = document.createElement("div");
    house.className = "lawn-decoration lawn-house";
    house.textContent = "🏠";
    lawn.appendChild(house);

    const mowers = document.createElement("div");
    mowers.className = "lawn-mowers";
    for (let row = 0; row < BOARD_ROWS; row++) {
        const mower = document.createElement("span");
        mower.className = "lawn-mower";
        mower.textContent = "🚜";
        mower.setAttribute("aria-label", "Газонокосилка");
        mowers.appendChild(mower);
    }
    lawn.appendChild(mowers);

    const bushes = document.createElement("div");
    bushes.className = "lawn-decoration lawn-bushes";
    for (let row = 0; row < BOARD_ROWS; row++) {
        const bush = document.createElement("span");
        bush.className = "lawn-bush";
        bush.textContent = "🌿";
        bushes.appendChild(bush);
    }
    lawn.appendChild(bushes);


    lawn.onclick =
        handleLawnClick;

    lawn.onpointermove =
        trackPointer;

    lawn.onpointerdown =
        trackPointer;

}

function trackPointer(event) {
    lastPointerX =
        event.clientX;

    lastPointerY =
        event.clientY;
}


function handleLawnClick(event) {

    trackPointer(event);

    if (
        event.target !==
        event.currentTarget
    ) {

        return;

    }


    const rect =
        event.currentTarget
            .getBoundingClientRect();


    const x =
        event.clientX -
        rect.left;


    const y =
        event.clientY -
        rect.top;


    const boardX = (x / rect.width * 100 - BOARD_X_START) / BOARD_X_WIDTH;
    const col = Math.floor(boardX * 10);


    const row =
        Math.floor(
            y /
            (rect.height / BOARD_ROWS)
        );


    if (
        boardX < 0 ||
        boardX >= 1 ||
        col < 0 ||
        col > 9 ||
        row < 0 ||
        row >= BOARD_ROWS
    ) {

        return;

    }


    if (shovelMode) {

        return;

    }


    plantAt(row, col);

}


function plantAt(row, col, plantId = activePlantId, owner = profile.username, ownerId = currentUser?.id) {
    if (!gameRunning || endingGame || !Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= BOARD_ROWS || col < 0 || col > 9) return;
    if (gameMode === "online" && !isMatchHost()) {
        sendMatchAction({type: "plant", row, col, plantId});
        return;
    }
    const exists = boardPlants.find(p => p.row === row && p.col === col);
    if (exists) return;
    const plant = plants.find(p => p.id === plantId);
    const ownerPlantList = gameMode === "online"
        ? matchPlantSelections[ownerId] || []
        : selectedPlants;
    if (!plant || !ownerPlantList.includes(plantId)) return;
    if (getPlayerSun(ownerId) < plant.cost) {
        if (owner === profile.username) showNoSunNotice();
        return;
    }
    setPlayerSun(ownerId, getPlayerSun(ownerId) - plant.cost);
    updateSun();
    const boardPlant = {
        id: crypto.randomUUID(), plantId, row, col, owner, ownerId,
        health: ["wallnut", "tallnut", "primalwallnut"].includes(plantId) ? 800 : 100,
        cooldown: 0, age: 0
    };
    boardPlants.push(boardPlant);
    renderBoardPlant(boardPlant);
    playGameSound("plant");
    spawnGameEffect("plant", boardColCenter(col), rowCenter(row));
}


function renderBoardPlant(boardPlant) {

    const lawn =
        document.getElementById("lawn");


    const plant =
        plants.find(
            p =>
                p.id ===
                boardPlant.plantId
        );


    const element =
        document.createElement("div");


    element.className =
        "plant-on-board";


    element.dataset.id =
        boardPlant.id;


    element.textContent =
        plant?.emoji || "🌱";


    element.style.left =
        `${boardColCenter(boardPlant.col)}%`;


    element.style.top =
        `${rowCenter(boardPlant.row)}%`;


    element.onpointerenter = event => showPlantOwner(boardPlant, event);
    element.onpointermove = movePlantTooltip;
    element.onpointerleave = hidePlantTooltip;


    element.onclick =
        event => {

            event.stopPropagation();


            if (shovelMode) {

                if (
                    boardPlant.owner !==
                    profile.username
                ) {

                    alert(
                        `❌ Это растение принадлежит ${boardPlant.owner}`
                    );

                    return;

                }


                if (gameMode === "online" && !isMatchHost()) {
                    sendMatchAction({type: "remove", id: boardPlant.id});
                } else if (gameRunning) {
                    removePlant(boardPlant.id);
                }


                return;

            }
        };


    lawn.appendChild(
        element
    );

}


function showPlantOwner(boardPlant, event) {
    if (event.pointerType === "touch") return;

    const plant = plants.find(p => p.id === boardPlant.plantId);
    let tooltip = document.getElementById("plant-tooltip");
    if (!tooltip) {
        tooltip = document.createElement("div");
        tooltip.id = "plant-tooltip";
        tooltip.className = "plant-tooltip";
        document.body.appendChild(tooltip);
    }

    tooltip.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = `${plant?.emoji || "🌱"} ${plant?.name || "Растение"}`;
    const owner = document.createElement("span");
    owner.textContent = `👤 Поставил: ${boardPlant.owner}`;
    const health = document.createElement("span");
    health.textContent = `❤️ Здоровье: ${Math.max(0, Math.ceil(boardPlant.health))}`;
    tooltip.append(heading, owner, health);
    tooltip.hidden = false;
    movePlantTooltip(event);
}

function movePlantTooltip(event) {
    const tooltip = document.getElementById("plant-tooltip");
    if (!tooltip || tooltip.hidden) return;

    const margin = 8;
    const x = Math.min(event.clientX + 16, window.innerWidth - tooltip.offsetWidth - margin);
    const y = Math.max(margin, event.clientY - tooltip.offsetHeight - 12);
    tooltip.style.left = `${Math.max(margin, x)}px`;
    tooltip.style.top = `${Math.min(y, window.innerHeight - tooltip.offsetHeight - margin)}px`;
}

function hidePlantTooltip() {
    const tooltip = document.getElementById("plant-tooltip");
    if (tooltip) tooltip.hidden = true;
}


function removePlant(id) {

    const index =
        boardPlants.findIndex(
            p => p.id === id
        );


    if (index === -1) {

        return;

    }


    const element =
        document.querySelector(
            `.plant-on-board[data-id="${id}"]`
        );


    if (element) {

        element.remove();

    }


    boardPlants.splice(
        index,
        1
    );

}


function toggleShovel() {

    shovelMode =
        !shovelMode;


    const button =
        document.getElementById(
            "shovelButton"
        );


    button.textContent =
        shovelMode
            ? "❌ Лопата включена"
            : "🪣 Лопата";


    button.style.background =
        shovelMode
            ? "#a94c4c"
            : "";

}


function renderMyPlants() {
    const list = document.getElementById("myPlantList");
    list.innerHTML = "";
    const plantList = gameMode === "online"
        ? matchPlantSelections[currentUser?.id] || selectedPlants
        : selectedPlants;
    plantList.forEach(id => {
        const plant = plants.find(p => p.id === id);
        if (!plant) return;
        const button = document.createElement("button");
        button.className = "my-plant";
        button.textContent = `${plant.emoji} ${plant.cost}`;
        button.title = plant.name;
        button.setAttribute("aria-pressed", String(activePlantId === id));
        button.style.outline = activePlantId === id ? "3px solid #ffdb60" : "none";
        button.onclick = () => {
            activePlantId = id;
            selectedPlants = plantList;
            if (shovelMode) toggleShovel();
            renderMyPlants();
        };
        list.appendChild(button);
    });
}
