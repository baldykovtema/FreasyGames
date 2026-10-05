const playerStatsName = document.getElementById("playerStatsName");
const bestPercentageStat = document.getElementById("bestPercentageStat");
const playTimeStat = document.getElementById("playTimeStat");
const cubesCompletedStat = document.getElementById("cubesCompletedStat");
const unlockInfo = document.getElementById("unlockInfo");
const adminPanel = document.getElementById("adminPanel");
const adminCubeInput = document.getElementById("adminCubeInput");
const adminSaveButton = document.getElementById("adminSaveButton");
const adminResetButton = document.getElementById("adminResetButton");
const adminMessage = document.getElementById("adminMessage");

function isAdmin() {
    return currentUser?.user_metadata?.username?.toLowerCase() === "updatetest";
}

function getMaxCubes() {
    if (isAdmin()) return MAX_CUBES;
    let unlocked = 1;
    for (let i = 2; i <= MAX_CUBES; i++) {
        if (stats.cubesCompleted >= UNLOCKS[i]) unlocked = i;
        else break;
    }
    return unlocked;
}

function updateUnlockInfo() {
    if (isAdmin()) {
        unlockInfo.textContent = "updatetest: доступны все 21 куб";
        return;
    }
    const max = getMaxCubes();
    if (max >= MAX_CUBES) {
        unlockInfo.textContent = "Открыты все 21 куб";
        return;
    }
    const next = max + 1;
    const missing = Math.max(0, UNLOCKS[next] - stats.cubesCompleted);
    unlockInfo.textContent = `До открытия ${next}-го куба: ${missing}`;
}

function updateStatsUI() {
    const username = currentUser?.user_metadata?.username || currentUser?.email?.split("@")[0] || "Игрок";
    playerStatsName.textContent = username;
    bestPercentageStat.textContent = stats.bestPercentage + "%";
    bestPercentageStat.style.color = stats.dominantColor || "white";
    playTimeStat.textContent = formatTime(stats.totalPlaySeconds);
    cubesCompletedStat.textContent = stats.cubesCompleted;
    updateUnlockInfo();
    updateButtons();
}

async function loadPlayerStats(user) {
    if (!user) return;
    const { data, error } = await supabaseClient.from("leaderboard").select("username,best_percentage,dominant_color,total_play_seconds,cubes_completed,colors").eq("user_id", user.id).maybeSingle();
    if (error) {
        console.error("Stats load:", error);
        throw error;
    }
    if (data) {
        stats.bestPercentage = Number(data.best_percentage || 0);
        stats.dominantColor = data.dominant_color || "white";
        stats.totalPlaySeconds = Number(data.total_play_seconds || 0);
        stats.cubesCompleted = Number(data.cubes_completed || 0);
        stats.bestColors = Array.isArray(data.colors) ? data.colors : [];
    } else {
        stats = { bestPercentage: 0, dominantColor: "white", totalPlaySeconds: 0, cubesCompleted: 0, bestColors: [] };
        await savePlayerStats();
    }
    updateStatsUI();
}

async function savePlayerStats() {
    if (!currentUser || savingStats) return;
    savingStats = true;
    const username = currentUser?.user_metadata?.username || currentUser?.email?.split("@")[0] || "Игрок";
    const payload = {
        user_id: currentUser.id,
        username: username,
        best_percentage: Number(stats.bestPercentage) || 0,
        dominant_color: stats.dominantColor || "white",
        total_play_seconds: Number(stats.totalPlaySeconds) || 0,
        cubes_completed: Number(stats.cubesCompleted) || 0,
        colors: Array.isArray(stats.bestColors) ? stats.bestColors : []
    };
    const { error } = await supabaseClient.from("leaderboard").upsert(payload, { onConflict: "user_id" });
    if (error) console.error("Stats save:", error);
    savingStats = false;
}

function startPlayTimer() {
    if (playTimer || !currentUser) return;
    lastPlaySave = Date.now();
    playTimer = setInterval(async () => {
        const now = Date.now();
        const delta = Math.floor((now - lastPlaySave) / 1000);
        if (delta > 0) {
            stats.totalPlaySeconds += delta;
            lastPlaySave = now;
            updateStatsUI();
            if (stats.totalPlaySeconds % 10 < delta) await savePlayerStats();
        }
    }, 1000);
}

async function stopPlayTimer() {
    if (playTimer) {
        const now = Date.now();
        const delta = Math.floor((now - lastPlaySave) / 1000);
        if (delta > 0) {
            stats.totalPlaySeconds += delta;
            lastPlaySave = now;
            updateStatsUI();
        }
        clearInterval(playTimer);
        playTimer = null;
    }
    await savePlayerStats();
}

adminSaveButton.addEventListener("click", async () => {
    if (!isAdmin()) return;
    let value = Math.floor(Number(adminCubeInput.value));
    if (!Number.isFinite(value) || value < 0) value = 0;
    if (value > 25000000) value = 25000000;
    stats.cubesCompleted = value;
    adminCubeInput.value = value;
    updateStatsUI();
    adminMessage.textContent = "Сохранение...";
    await savePlayerStats();
    adminMessage.textContent = `Сохранено: ${value} открытых кубов`;
});

adminResetButton.addEventListener("click", async () => {
    if (!isAdmin()) return;
    stats.cubesCompleted = 0;
    adminCubeInput.value = 0;
    updateStatsUI();
    await savePlayerStats();
    adminMessage.textContent = "Установлено 0";
});