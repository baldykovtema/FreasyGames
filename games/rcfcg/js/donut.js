const donut = document.getElementById("donut");
const donutBoostInfo = document.getElementById("donutBoostInfo");
const donutTimerEl = document.getElementById("donutTimer");

const DONUT_INTERVAL = 5 * 60 * 1000; // 5 минут
const DONUT_BOOST_DURATION = 60 * 1000; // 1 минута
const DONUT_VISIBLE_DURATION = 15 * 1000; // пончик виден 15 секунд

let donutTimer = null;
let donutBoostTimer = null;
let donutCountdownTimer = null;
let nextDonutTime = 0;

function formatDonutTime(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function updateDonutTimerDisplay() {
    if (!currentUser) return;
    const remaining = nextDonutTime - Date.now();
    if (remaining <= 0) {
        donutTimerEl.textContent = "🍩 0:00";
        return;
    }
    donutTimerEl.textContent = `🍩 ${formatDonutTime(remaining)}`;
}

function startDonutCountdown() {
    if (donutCountdownTimer) clearInterval(donutCountdownTimer);
    nextDonutTime = Date.now() + DONUT_INTERVAL;
    updateDonutTimerDisplay();
    donutCountdownTimer = setInterval(updateDonutTimerDisplay, 1000);
}

function stopDonutCountdown() {
    if (donutCountdownTimer) {
        clearInterval(donutCountdownTimer);
        donutCountdownTimer = null;
    }
    donutTimerEl.textContent = "🍩 --:--";
}

function showDonut() {
    if (!currentUser) return;
    donut.style.display = "block";
    donutTimerEl.textContent = "🍩 0:00";
    // Пончик виден 15 секунд, после чего таймер перезапускается
    setTimeout(() => {
        donut.style.display = "none";
        startDonutCountdown();
    }, DONUT_VISIBLE_DURATION);
}

function activateDonutBoost() {
    donutBoostActive = true;
    donutBoostInfo.style.display = "block";
    donut.style.display = "none";
    if (donutBoostTimer) clearTimeout(donutBoostTimer);
    donutBoostTimer = setTimeout(() => {
        donutBoostActive = false;
        donutBoostInfo.style.display = "none";
    }, DONUT_BOOST_DURATION);
    // После активации бонуса перезапускаем таймер до следующего пончика
    startDonutCountdown();
}

donut.addEventListener("click", activateDonutBoost);

function startDonutSpawner() {
    if (donutTimer) return;
    startDonutCountdown();
    donutTimer = setInterval(showDonut, DONUT_INTERVAL);
}

function stopDonutSpawner() {
    if (donutTimer) {
        clearInterval(donutTimer);
        donutTimer = null;
    }
    donut.style.display = "none";
    donutBoostActive = false;
    donutBoostInfo.style.display = "none";
    if (donutBoostTimer) {
        clearTimeout(donutBoostTimer);
        donutBoostTimer = null;
    }
    stopDonutCountdown();
}