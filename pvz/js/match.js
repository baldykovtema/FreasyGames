/* Shared match: the host runs the simulation; guests send actions. */
async function startOnlineMatch(players) {
    if (matchChannel || !currentLobby || leavingLobby) return;
    const lobbyId = currentLobby.id;
    gameMode = "online";
    infiniteSlot = null;
    matchPlayers = players;
    matchPeers = new Set([getLocalMatchUserId()]);
    matchStarting = false;
    matchSubscribed = false;
    matchTickBusy = false;
    lastMatchHello = 0;
    matchRevision = 0;
    lastMatchRevision = -1;
    matchConnectedAt = Date.now();
    lastMatchMessage = Date.now();
    endingGame = false;
    matchPlantSelections = {[currentUser.id]: [...selectedPlants]};
    const channel = supabaseClient.channel(`match-${lobbyId}`, {config: {broadcast: {ack: true}}});
    matchChannel = channel;
    channel.on("broadcast", {event: "action"}, ({payload}) => {
        if (matchChannel !== channel || !isMatchHost() || payload?.lobbyId !== lobbyId) return;
        const player = matchPlayers.find(p => p.user_id === payload.userId);
        if (!player) return;
        if (payload.type === "hello") {
            const unlocked = new Set(plants.map(plant => plant.id));
            const roster = Array.isArray(payload.selectedPlants)
                ? [...new Set(payload.selectedPlants.filter(id => unlocked.has(id)))].slice(0, 10)
                : [];
            if (roster.length) {
                matchPlantSelections[player.user_id] = roster;
                matchPeers.add(player.user_id);
            }
            return;
        }
        if (!gameRunning || endingGame) return;
        if (payload.type === "plant") plantAt(payload.row, payload.col, payload.plantId, player.username, player.user_id);
        if (payload.type === "sun") collectSun(payload.id, player.user_id);
        if (payload.type === "remove") {
            const plant = boardPlants.find(p => p.id === payload.id);
            if (plant?.owner === player.username) removePlant(plant.id);
        }
    }).on("broadcast", {event: "state"}, ({payload}) => {
        if (matchChannel !== channel || isMatchHost() || payload?.lobbyId !== lobbyId || payload.hostId !== currentLobby?.host_id) return;
        if (payload.revision <= lastMatchRevision || endingGame) return;
        lastMatchRevision = payload.revision;
        lastMatchMessage = Date.now();
        setMatchStatus("");
        if (!gameRunning) {
            matchPlantSelections = payload.state.matchPlantSelections || matchPlantSelections;
            selectedPlants = matchPlantSelections[currentUser.id] || payload.state.selectedPlants;
            startGame(payload.state);
        } else applyMatchState(payload.state);
    }).on("broadcast", {event: "end"}, ({payload}) => {
        if (matchChannel !== channel || isMatchHost() || payload?.hostId !== currentLobby?.host_id || payload.lobbyId !== lobbyId || endingGame) return;
        endingGame = true;
        stopGame();
        alert(payload.message);
        void leaveLobby();
    }).on("broadcast", {event: "chat"}, ({payload}) => {
        if (matchChannel !== channel || payload?.lobbyId !== lobbyId) return;
        // Skip our own echo: the sender already displays the message locally.
        if (payload.userId === getLocalMatchUserId()) return;
        const player = matchPlayers.find(p => p.user_id === payload.userId);
        if (player && typeof payload.message === "string") addChatMessage(player.username, payload.message.slice(0, 500));
    }).subscribe(status => {
        if (matchChannel !== channel) return;
        matchSubscribed = status === "SUBSCRIBED";
        if (matchSubscribed) {
            lastMatchMessage = Date.now();
            void sendMatchAction({type: "hello"});
            setMatchStatus(gameRunning ? "" : "Подключено. Ожидаем остальных игроков…");
        } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
            setMatchStatus("Переподключение к матчу…");
        }
    });
    setMatchStatus("Подключаемся к матчу…");
    matchTimer = setInterval(async () => {
        if (matchChannel !== channel || endingGame || leavingLobby || matchTickBusy) return;
        const now = Date.now();
        const lastActivity = gameRunning ? lastMatchMessage : matchConnectedAt;
        if (now - lastActivity > 30000) {
            await failOnlineMatch(gameRunning ? "❌ Связь с матчем потеряна." : "❌ Не все игроки подключились. Проверьте, что ведущий открыл лобби и нажал «Готов».");
            return;
        }
        if (!matchSubscribed) return;
        matchTickBusy = true;
        try {
            if (!isMatchHost()) {
                if (!gameRunning && now - lastMatchHello >= 1000) {
                    lastMatchHello = now;
                    await sendMatchAction({type: "hello", selectedPlants, unlockedLevel: profile?.unlocked_level || 1});
                }
                return;
            }
            if (!gameRunning && !matchStarting && matchPlayers.length && matchPlayers.every(p => p.ready && matchPeers.has(p.user_id) && matchPlantSelections[p.user_id]?.length)) {
                matchStarting = true;
                const {data, error} = await supabaseClient.from("lobbies").update({status: "playing"})
                    .eq("id", lobbyId).eq("status", "waiting").select().single();
                if (matchChannel !== channel || leavingLobby) return;
                if (error || !data) throw new Error(error?.message || "Лобби уже запущено или закрыто");
                currentLobby = data;
                startGame();
            }
            if (gameRunning) {
                const result = await channel.send({type: "broadcast", event: "state", payload: {
                    lobbyId, hostId: currentUser.id, revision: ++matchRevision, state: captureGame()
                }});
                if (matchChannel !== channel) return;
                if (result === "ok") {
                    lastMatchMessage = Date.now();
                    setMatchStatus("");
                } else setMatchStatus("Не удалось отправить состояние. Повторяем…");
            }
        } catch (error) {
            console.error("Match update:", error);
            if (matchChannel === channel) await failOnlineMatch("❌ Ошибка запуска матча: " + error.message);
        } finally {
            if (matchChannel === channel) matchTickBusy = false;
        }
    }, 250);
}

function getLocalMatchPlayer() {
    return typeof findMyLobbyPlayer === "function"
        ? findMyLobbyPlayer(matchPlayers)
        : matchPlayers.find(player => player.user_id === currentUser?.id) || null;
}

function getLocalMatchUserId() {
    return getLocalMatchPlayer()?.user_id || currentUser?.id;
}

function setMatchStatus(message) {
    const status = document.getElementById("matchStatus");
    status.textContent = message;
    status.hidden = !message;
    if (!gameRunning && message) document.getElementById("lobbyInfo").textContent = message;
}

async function sendMatchAction(action) {
    const channel = matchChannel;
    if (!channel || !currentLobby || !matchSubscribed) return false;
    try {
        const result = await channel.send({type: "broadcast", event: "action", payload: {
            ...action, lobbyId: currentLobby.id, userId: getLocalMatchUserId()
        }});
        if (matchChannel !== channel) return false;
        if (result !== "ok") setMatchStatus("Действие не отправлено. Проверь соединение и повтори.");
        return result === "ok";
    } catch (error) {
        console.error("Match action:", error);
        if (matchChannel === channel) setMatchStatus("Действие не отправлено. Проверь соединение и повтори.");
        return false;
    }
}

function applyMatchState(state) {
    sun = state.sun;
    playerSuns = state.playerSuns || {};
    currentWave = state.wave;
    // Keep existing plant objects so click handlers see their current health.
    boardPlants = state.plants.map(plant => Object.assign(boardPlants.find(p => p.id === plant.id) ?? {}, plant));
    zombies = state.zombies;
    sunDrops = state.sunDrops;
    attackEvents = state.attackEvents || [];
    matchPlantSelections = state.matchPlantSelections || matchPlantSelections;
    selectedPlants = matchPlantSelections[currentUser.id] || selectedPlants;
    renderMyPlants();
    const lawn = document.getElementById("lawn");
    for (const [className, items, render] of [["plant-on-board", boardPlants, renderBoardPlant], ["zombie", zombies, renderZombie], ["sun", sunDrops.filter(isSunVisible), renderSun]]) {
        const ids = new Set(items.map(item => item.id));
        lawn.querySelectorAll(`.${className}`).forEach(element => {
            if (!ids.has(element.dataset.id)) element.remove();
        });
        items.forEach(item => {
            const element = lawn.querySelector(`.${className}[data-id="${item.id}"]`);
            if (!element) render(item);
            else if (className === "zombie") element.style.left = `${item.x}%`;
        });
    }
    attackEvents.forEach(renderAttack);
    document.getElementById("waveNumber").textContent = currentWave;
    updateSun();
}

async function closeMatchConnection() {
    clearInterval(matchTimer);
    matchTimer = null;
    const channel = matchChannel;
    matchChannel = null;
    matchSubscribed = false;
    matchTickBusy = false;
    matchStarting = false;
    setMatchStatus("");
    matchBroadcastBusy = false;
    if (channel) await supabaseClient.removeChannel(channel);
}

async function failOnlineMatch(message) {
    if (!matchChannel || endingGame) return;
    endingGame = true;
    stopGame();
    await closeMatchConnection();
    alert(message);
    await leaveLobby();
}

async function endOnlineMatch(message) {
    endingGame = true;
    stopGame();
    if (matchChannel && isMatchHost()) {
        await matchChannel.send({type: "broadcast", event: "end", payload: {
            lobbyId: currentLobby.id, hostId: currentUser.id, message
        }});
    }
    alert(message);
    await leaveLobby();
}
