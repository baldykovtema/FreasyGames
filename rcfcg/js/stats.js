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

const GUEST_ID = "offline-guest";
const GUEST_STATS_KEY = "rcfcgGuestStats";
const GUEST_ACTIVE_KEY = "rcfcgGuestActive";

// Офлайн-режим: играть без аккаунта, прогресс хранится только на этом устройстве.
function isGuest() {
    return currentUser?.id === GUEST_ID;
}

function isTestAccount() {
    return currentUser?.id === "local-chatgpt-test";
}

function isAdmin() {
    return isTestAccount() || currentUser?.user_metadata?.username?.toLowerCase() === "updatetest";
}

function getMaxCubes() {
    if (isAdmin()) return MAX_CUBES;
    let unlocked = 1;
    for (let i = 2; i <= MAX_CUBES; i++) {
        if (stats.cubesCompleted >= UNLOCKS[i]) unlocked = i;
        else break;
    }
    return Math.min(MAX_CUBES, unlocked + (Date.now() < bonusCubeUntil ? 1 : 0));
}

// An ad opens one more cube for ten minutes.
let bonusCubeUntil = 0;
const cubeAd = window.FreasyRewards ? FreasyRewards.offer({
    host: "#controls", before: "#restart", name: "rcfcg-cube", label: "🎬 +1 куб на 10 минут",
    onReward: () => { bonusCubeUntil = Date.now() + 10 * 60 * 1000; updateButtons(); updateUnlockInfo(); }
}) : null;
if (cubeAd) Object.assign(cubeAd.button.style, { width: "auto", margin: "0", padding: "10px 16px", fontSize: "14px" });
setInterval(() => {
    if (!cubeAd) return;
    const has = Date.now() < bonusCubeUntil;
    if (has || getMaxCubes() >= MAX_CUBES) cubeAd.hide(); else cubeAd.show();
    if (bonusCubeUntil && !has) { bonusCubeUntil = 0; updateButtons(); updateUnlockInfo(); }
}, 3000);


function updateUnlockInfo() {
    if (isAdmin()) {
        unlockInfo.textContent = `${isTestAccount() ? "ChatGpt (без сохранения)" : "updatetest"}: доступны все 21 куб`;
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
    if (isGuest()) {
        stats = { bestPercentage: 0, dominantColor: "white", totalPlaySeconds: 0, cubesCompleted: 0, bestColors: [] };
        try { Object.assign(stats, JSON.parse(localStorage.getItem(GUEST_STATS_KEY) || "{}")); } catch {}
        updateStatsUI();
        return;
    }
    if (!user || isTestAccount()) return;
    const { data, error } = await supabaseClient.from(STATS_TABLE).select("username,best_percentage,dominant_color,total_play_seconds,cubes_completed,colors").eq("user_id", user.id).maybeSingle();
    if (error) {
        console.error("Stats load:", error);
        stats = { bestPercentage: 0, dominantColor: "white", totalPlaySeconds: 0, cubesCompleted: 0, bestColors: [] };
        updateStatsUI();
        return;
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
    if (isGuest()) {
        try { localStorage.setItem(GUEST_STATS_KEY, JSON.stringify(stats)); } catch {}
        return;
    }
    if (!currentUser || isTestAccount() || savingStats) return;
    savingStats = true;
    // Сервер (rcfcg3d_save) сам проверяет данные и хранит лучшие значения игрока.
    const payload = {
        new_percentage: Number(stats.bestPercentage) || 0,
        new_color: stats.dominantColor || "white",
        new_colors: Array.isArray(stats.bestColors) && stats.bestColors.length === LINE_COUNT ? stats.bestColors : [],
        new_seconds: Math.floor(Number(stats.totalPlaySeconds) || 0),
        new_cubes: Math.floor(Number(stats.cubesCompleted) || 0)
    };
    const { error } = await supabaseClient.rpc("rcfcg3d_save", payload);
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
    adminMessage.textContent = `${isTestAccount() ? "Установлено без сохранения" : "Сохранено"}: ${value} открытых кубов`;
});

adminResetButton.addEventListener("click", async () => {
    if (!isAdmin()) return;
    stats.cubesCompleted = 0;
    adminCubeInput.value = 0;
    updateStatsUI();
    await savePlayerStats();
    adminMessage.textContent = "Установлено 0";
});