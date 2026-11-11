/* =====================================================
   SCREEN FUNCTIONS
===================================================== */

function showScreen(id) {

    const plantTooltip =
        document.getElementById("plant-tooltip");

    if (plantTooltip) {
        plantTooltip.hidden = true;
    }

    document
        .querySelectorAll(".screen")
        .forEach(screen => {

            screen.classList.remove("active");

        });


    const screen =
        document.getElementById(id);


    if (screen) {

        screen.classList.add("active");

    }

}


function showLogin() {

    document.getElementById("loginForm")
        .style.display = "block";

    document.getElementById("registerForm")
        .style.display = "none";

    document.getElementById("authMessage")
        .textContent = "";

}


function showRegister() {

    document.getElementById("loginForm")
        .style.display = "none";

    document.getElementById("registerForm")
        .style.display = "block";

    document.getElementById("authMessage")
        .textContent = "";

}


function showMenu() {

    if (!currentUser) {

        showScreen("authScreen");

        return;
    }

    showScreen("menuScreen");

}


function showMap() {

    renderMap();

    showScreen("mapScreen");

}

/* =====================================================
   MINI GAMES
===================================================== */

function miniGames() {
    const parts =
        getGameModal();

    if (!parts) {
        startMiniGame("sunrush");
        return;
    }

    parts.message.textContent =
        "Выбери мини-игру";
    parts.message.classList.add("mini-game-heading");

    parts.actions.innerHTML =
        "";

    const games = [
        {
            id: "sunrush",
            name: "Солнечный марафон",
            description: "Собирай солнца и подготовься к пяти волнам зомби."
        },
        {
            id: "rush",
            name: "Быстрый натиск",
            description: "Отрази шесть стремительных волн с увеличенным числом зомби."
        },
        {
            id: "wall",
            name: "Оборона орехами",
            description: "Защищай дорожки орехами от пяти волн зомби."
        },
        {
            id: "garden",
            name: "Солнечный сад",
            description: "Сажай подсолнухи: они производят солнце в два раза быстрее."
        },
        {
            id: "night",
            name: "Ночная смена",
            description: "Переживи пять волн, когда солнце падает реже."
        },
        {
            id: "boss",
            name: "Большая угроза",
            description: "Останови две большие волны усиленных зомби."
        }
    ];

    parts.modal.querySelector(".mini-game-close")?.remove();
    const closeButton = document.createElement("button");
    closeButton.className = "mini-game-close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Закрыть выбор мини игр");
    closeButton.title = "Закрыть";
    closeButton.textContent = "×";
    closeButton.onclick = () => { parts.modal.hidden = true; };
    parts.modal.querySelector(".game-modal-card")?.prepend(closeButton);

    games.forEach(game => {
        const card = document.createElement("div");
        card.className = "mini-game-option";
        const title = document.createElement("h3");
        title.textContent = game.name;
        const description = document.createElement("p");
        description.textContent = game.description;
        const button = document.createElement("button");
        button.className = "primary";
        button.textContent = "Играть";
        button.onclick = () => {
            parts.modal.hidden = true;
            startMiniGame(game.id);
        };
        card.append(title, description, button);
        parts.actions.appendChild(card);
    });

    parts.modal.hidden =
        false;
}

function startMiniGame(id) {
    activeMiniGame =
        id;

    gameMode =
        "mini";

    infiniteSlot =
        null;

    currentLevel =
        Math.max(1, profile?.unlocked_level || 1);

    let plantPool = getUnlockedPlantIds(currentLevel);

    if (id === "wall") {
        plantPool = filterUnlockedPlants(["peashooter", "sunflower", "wallnut", "icepea", "bokchoy"], currentLevel);
    }

    if (id === "boss") {
        plantPool = filterUnlockedPlants(["peashooter", "sunflower", "cherry", "icepea", "repeater"], currentLevel);
    }

    const miniSave = {
        version: 1,
        wave: 1,
        sun: id === "sunrush" ? 300 : id === "night" ? 100 : id === "boss" ? 250 : 175,
        plants: [],
        zombies: [],
        sunDrops: [],
        location: "mini"
    };
    openPlantSelection({
        title: getMiniGameTitle(),
        description: "Выбери растения для этой мини игры.",
        pool: plantPool,
        limit: 10,
        startText: "🎮 НАЧАТЬ МИНИ ИГРУ",
        onStart: () => startGame({...miniSave, selectedPlants}),
        onCancel: () => miniGames()
    });
}

function openSandbox() {
    const grid = document.getElementById("sandboxMaps");
    grid.innerHTML = "";
    locations.forEach((location, index) => {
        const button = document.createElement("button");
        button.className = "menu-card sandbox-map";
        button.textContent = `${location.icon} ${location.name} — начать`;
        button.onclick = () => startSandbox(index);
        grid.appendChild(button);
    });
    showScreen("sandboxScreen");
}

function startSandbox(location) {
    if (!Number.isInteger(location) || location < 0 || location >= locations.length) return;
    sandboxLocation = location;
    gameMode = "sandbox";
    activeMiniGame = null;
    selectedPlants = plants.map(p => p.id);
    startGame();
}

function renderSandboxZombies() {
    const panel = document.getElementById("sandboxZombies");
    panel.innerHTML = "";
    panel.hidden = gameMode !== "sandbox";
    if (gameMode !== "sandbox") return;
    const label = document.createElement("span");
    label.textContent = "Добавить зомби в случайный ряд:";
    panel.appendChild(label);
    zombieTypes.forEach((type,index) => {
        const button = document.createElement("button");
        button.className = "secondary";
        button.textContent = `${type.emoji} ${type.name}`;
        button.onclick = () => { if (gameRunning && !endingGame) spawnZombie(index); };
        panel.appendChild(button);
    });
}
