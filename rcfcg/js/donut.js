const DONUT_INTERVAL = 5 * 60 * 1000;
const GOLDEN_DONUT_INTERVAL = 15 * 60 * 1000;
const DONUT_BOOST_DURATION = 60 * 1000;
const DONUT_VISIBLE_DURATION = 15 * 1000;
const donutBoostInfo = document.getElementById("donutBoostInfo");

function formatDonutTime(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function updateBoostInfo() {
    donutBoostInfo.style.display = donutBoostActive || goldenDonutBoostActive ? "block" : "none";
    donutBoostInfo.textContent = goldenDonutBoostActive ? "Золотой 🍩 Бонус: шанс x5.0!" : "🍩 Бонус: шанс x2.5!";
}

function createDonutSpawner(id, timerId, interval, golden = false) {
    const element = document.getElementById(id);
    const timer = document.getElementById(timerId);
    const label = golden ? "Золотой 🍩" : "🍩";
    let spawnTimer, hideTimer, boostTimer, countdownTimer, nextTime;
    function updateTimer() {
        timer.textContent = `${label} ${formatDonutTime(nextTime - Date.now())}`;
    }
    function schedule() {
        clearTimeout(spawnTimer);
        nextTime = Date.now() + interval;
        updateTimer();
        spawnTimer = setTimeout(show, interval);
    }
    function show() {
        if (!currentUser) return;
        clearTimeout(spawnTimer);
        clearTimeout(hideTimer);
        nextTime = Date.now();
        element.style.display = "block";
        updateTimer();
        hideTimer = setTimeout(() => {
            element.style.display = "none";
            schedule();
        }, DONUT_VISIBLE_DURATION);
    }
    function collect() {
        if (!currentUser || element.style.display !== "block") return;
        clearTimeout(hideTimer);
        element.style.display = "none";
        if (golden) goldenDonutBoostActive = true;
        else donutBoostActive = true;
        updateBoostInfo();
        clearTimeout(boostTimer);
        boostTimer = setTimeout(() => {
            if (golden) goldenDonutBoostActive = false;
            else donutBoostActive = false;
            updateBoostInfo();
        }, DONUT_BOOST_DURATION);
        schedule();
    }
    element.addEventListener("click", collect);
    element.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); collect(); }
    });
    return {
        show,
        start() {
            if (countdownTimer) return;
            schedule();
            countdownTimer = setInterval(updateTimer, 1000);
        },
        stop() {
            clearTimeout(spawnTimer);
            clearTimeout(hideTimer);
            clearTimeout(boostTimer);
            clearInterval(countdownTimer);
            countdownTimer = null;
            element.style.display = "none";
            timer.textContent = `${label} --:--`;
        }
    };
}
const regularDonutSpawner = createDonutSpawner("donut", "donutTimer", DONUT_INTERVAL);
const goldenDonutSpawner = createDonutSpawner("goldenDonut", "goldenDonutTimer", GOLDEN_DONUT_INTERVAL, true);
function showDonut() { regularDonutSpawner.show(); }
function startDonutSpawner() { regularDonutSpawner.start(); goldenDonutSpawner.start(); }
function stopDonutSpawner() {
    regularDonutSpawner.stop();
    goldenDonutSpawner.stop();
    donutBoostActive = goldenDonutBoostActive = false;
    updateBoostInfo();
}
document.getElementById("spawnDonutButton").addEventListener("click", () => { if (isAdmin()) regularDonutSpawner.show(); });
document.getElementById("spawnGoldenDonutButton").addEventListener("click", () => { if (isAdmin()) goldenDonutSpawner.show(); });
