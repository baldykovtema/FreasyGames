const cubesContainer = document.getElementById("cubes");
const addButton = document.getElementById("addCube");
const removeButton = document.getElementById("removeCube");
const restartButton = document.getElementById("restart");
const fastModeCheckbox = document.getElementById("fastModeCheckbox");
const autoClickCheckbox = document.getElementById("autoClickCheckbox");
const disableAllCheckbox = document.getElementById("disableAllCheckbox");

const AUTO_CLICK_INTERVALS = [1000, 900, 800, 700, 600, 500, 400, 300, 200, 100, 50, 10];

function createCube() {
    const cube = document.createElement("div");
    cube.className = "cube";
    const canvas = document.createElement("canvas");
    cube.appendChild(canvas);
    const percentage = document.createElement("div");
    percentage.className = "percentage";
    percentage.textContent = "0%";
    cube.appendChild(percentage);
    cubesContainer.appendChild(cube);
    const data = {
        element: cube,
        canvas: canvas,
        percentage: percentage,
        colors: generateColors(),
        progress: 0,
        animation: null,
        showPercentage: false,
        counted: false
    };
    cubes.push(data);
    resizeCube(data);
    return data;
}

function resizeCube(data) {
    const rect = data.element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const size = Math.floor(Math.min(rect.width, rect.height));
    data.canvas.width = size;
    data.canvas.height = size;
    drawCube(data, data.progress);
}

function drawCube(data, progress) {
    const canvas = data.canvas;
    const ctx = canvas.getContext("2d");
    const size = canvas.width;
    if (size <= 0) return;
    ctx.clearRect(0, 0, size, size);
    const center = size / 2;
    const lineHeight = size / LINE_COUNT;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(center, center);
    ctx.lineTo(0, size);
    ctx.closePath();
    ctx.clip();
    for (let i = 0; i < LINE_COUNT; i++) {
        const y = i * lineHeight;
        const maxX = center * (1 - Math.abs(y + lineHeight / 2 - center) / center);
        ctx.fillStyle = data.colors[i].css;
        ctx.fillRect(0, y, maxX * progress, lineHeight + 1);
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(center, center);
    ctx.lineTo(size, size);
    ctx.closePath();
    ctx.clip();
    for (let i = 0; i < LINE_COUNT; i++) {
        const y = i * lineHeight;
        const maxX = center * (1 - Math.abs(y + lineHeight / 2 - center) / center);
        const currentX = maxX * progress;
        ctx.fillStyle = data.colors[(i + 20) % LINE_COUNT].css;
        ctx.fillRect(size - currentX, y, currentX, lineHeight + 1);
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size, 0);
    ctx.lineTo(center, center);
    ctx.closePath();
    ctx.clip();
    const lineWidth = size / LINE_COUNT;
    for (let i = 0; i < LINE_COUNT; i++) {
        const x = i * lineWidth;
        const maxY = center * (1 - Math.abs(x + lineWidth / 2 - center) / center);
        ctx.fillStyle = data.colors[(i + 40) % LINE_COUNT].css;
        ctx.fillRect(x, 0, lineWidth + 1, maxY * progress);
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, size);
    ctx.lineTo(center, center);
    ctx.lineTo(size, size);
    ctx.closePath();
    ctx.clip();
    for (let i = 0; i < LINE_COUNT; i++) {
        const x = i * lineWidth;
        const maxY = center * (1 - Math.abs(x + lineWidth / 2 - center) / center);
        const currentY = maxY * progress;
        ctx.fillStyle = data.colors[(i + 60) % LINE_COUNT].css;
        ctx.fillRect(x, size - currentY, lineWidth + 1, currentY);
    }
    ctx.restore();

    if (progress >= 1) {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(center, center, 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

function animateCube(data) {
    data.counted = false;
    if (data.animation) cancelAnimationFrame(data.animation);
    data.progress = 0;
    drawCube(data, 0);
    if (fastModeCheckbox.checked) {
        data.animation = requestAnimationFrame(() => {
            data.animation = null;
            data.progress = 1;
            drawCube(data, 1);
            completeCube(data);
        });
        return;
    }
    const start = performance.now();
    function frame(now) {
        const elapsed = now - start;
        data.progress = Math.min(elapsed / FILL_TIME, 1);
        drawCube(data, data.progress);
        if (data.progress < 1) {
            data.animation = requestAnimationFrame(frame);
        } else {
            data.animation = null;
            completeCube(data);
        }
    }
    data.animation = requestAnimationFrame(frame);
}

function getDominantColor(data) {
    const groups = [];
    data.colors.forEach(color => {
        let found = null;
        for (const group of groups) {
            let difference = Math.abs(color.hue - group.hue);
            difference = Math.min(difference, 360 - difference);
            if (difference <= 5) {
                found = group;
                break;
            }
        }
        if (found) {
            found.count++;
        } else {
            groups.push({ hue: color.hue, count: 1, css: color.css });
        }
    });
    groups.sort((a, b) => b.count - a.count);
    return groups[0];
}

async function showPercentageAutomatically(data) {
    if (!data || data.progress < 1) return;
    if (data.showPercentage) return;
    const dominant = getDominantColor(data);
    const percentage = Math.round(dominant.count / LINE_COUNT * 100);
    data.percentage.textContent = percentage + "%";
    data.percentage.style.color = dominant.css;
    data.percentage.style.display = "block";
    data.showPercentage = true;
    if (percentage > stats.bestPercentage) {
        stats.bestPercentage = percentage;
        stats.dominantColor = dominant.css;
        stats.bestColors = data.colors.map(color => color.css);
        updateStatsUI();
        await savePlayerStats();
    }
}

async function completeCube(data) {
    if (data.counted || data.progress < 1) return;
    data.counted = true;
    stats.cubesCompleted++;
    updateStatsUI();
    await showPercentageAutomatically(data);
    await savePlayerStats();
}

function updateLayout() {
    const count = cubes.length;
    if (!count) return;
    const gameArea = document.getElementById("gameArea");
    const areaWidth = gameArea.clientWidth;
    const areaHeight = gameArea.clientHeight;
    let bestColumns = 1;
    let bestRows = count;
    let bestSize = 0;

    for (let columns = 1; columns <= count; columns++) {
        const rows = Math.ceil(count / columns);
        const width = (areaWidth - GAP * (columns - 1)) / columns;
        const height = (areaHeight - GAP * (rows - 1)) / rows;
        const size = Math.floor(Math.min(width, height));
        if (size > bestSize) {
            bestSize = size;
            bestColumns = columns;
            bestRows = rows;
        }
    }

    cubesContainer.style.gridTemplateColumns = `repeat(${bestColumns},${bestSize}px)`;
    cubesContainer.style.gridTemplateRows = `repeat(${bestRows},${bestSize}px)`;
    cubes.forEach(resizeCube);
}

function isAutoClickAllowed() {
    // Автокликер доступен, если максимальное количество кубов у игрока больше 10
    return getMaxCubes() > 10;
}

function updateButtons() {
    const count = cubes.length;
    const maxAllowed = getMaxCubes();
    addButton.textContent = `Добавить куб ${count}/${maxAllowed}`;
    addButton.disabled = addingCube || count >= maxAllowed;
    removeButton.style.display = count >= 2 ? "block" : "none";
    removeButton.disabled = false;
    fastModeCheckbox.disabled = false;
    fastModeCheckbox.title = "";
    const leaderboardButton = document.getElementById("leaderboardButton");
    leaderboardButton.disabled = false;

    const autoClickAvailable = isAutoClickAllowed() && fastModeCheckbox.checked;
    autoClickCheckbox.disabled = !autoClickAvailable;
    if (!autoClickAvailable) {
        stopAutoClicker();
        autoClickCheckbox.checked = false;
        autoClickCheckbox.title = !isAutoClickAllowed() ? "Нужно больше 10 максимальных кубов" : "Требуется быстрый режим";
    } else {
        autoClickCheckbox.title = `Скорость: 1 клик / ${(getAutoClickInterval() / 1000).toLocaleString("ru-RU")} сек`;
    }

    // Логика галочки "Отключить всё кроме заново"
    const disableAll = disableAllCheckbox.checked;
    if (disableAll) {
        addButton.disabled = true;
        removeButton.disabled = true;
        leaderboardButton.disabled = true;
    }
    // Кнопка "Заново" (restartButton) всегда остаётся активной
    // Галочки (Быстрый режим, Автокликер) остаются активными
}

function getAutoClickInterval() {
    const count = cubes.length;
    if (count < 1) return null;
    // Для количества кубов меньше 10 используем самый медленный интервал (1000 мс)
    if (count < 10) return AUTO_CLICK_INTERVALS[0];
    const index = Math.min(count - 10, AUTO_CLICK_INTERVALS.length - 1);
    return AUTO_CLICK_INTERVALS[index];
}

function autoClickTick() {
    if (!autoClickActive) return;
    if (!fastModeCheckbox.checked || !isAutoClickAllowed()) {
        stopAutoClicker();
        return;
    }
    const donutEl = document.getElementById("donut");
    if (donutEl && donutEl.style.display === "block") {
        donutEl.click();
    }
    restartButton.click();
}

function startAutoClicker() {
    if (autoClickTimer) return;
    const interval = getAutoClickInterval();
    if (interval === null) {
        stopAutoClicker();
        return;
    }
    autoClickActive = true;
    autoClickCheckbox.checked = true;
    lastAutoClickTime = performance.now();
    autoClickTick();
    autoClickTimer = setInterval(autoClickTick, interval);
}

function stopAutoClicker() {
    autoClickActive = false;
    if (autoClickTimer) {
        clearInterval(autoClickTimer);
        autoClickTimer = null;
    }
    autoClickCheckbox.checked = false;
}

function restartAutoClickTimer() {
    if (!autoClickActive) return;
    const interval = getAutoClickInterval();
    if (interval === null) {
        stopAutoClicker();
        return;
    }
    if (autoClickTimer) {
        clearInterval(autoClickTimer);
        autoClickTimer = null;
    }
    autoClickTimer = setInterval(autoClickTick, interval);
}

addButton.addEventListener("click", () => {
    if (addingCube) return;
    const maxAllowed = getMaxCubes();
    if (cubes.length >= maxAllowed) {
        updateButtons();
        return;
    }
    if (cubes.length >= MAX_CUBES) {
        updateButtons();
        return;
    }
    addingCube = true;
    updateButtons();
    const cube = createCube();
    updateLayout();
    requestAnimationFrame(() => {
        resizeCube(cube);
        animateCube(cube);
    });
    setTimeout(() => {
        addingCube = false;
        updateButtons();
        restartAutoClickTimer();
    }, 250);
});

removeButton.addEventListener("click", () => {
    if (cubes.length <= 1) return;
    const removed = cubes.pop();
    if (removed.animation) cancelAnimationFrame(removed.animation);
    removed.element.remove();
    updateLayout();
    updateButtons();
    restartAutoClickTimer();
});

restartButton.addEventListener("click", () => {
    cubes.forEach(cube => {
        if (cube.animation) cancelAnimationFrame(cube.animation);
        cube.colors = generateColors();
        cube.progress = 0;
        cube.counted = false;
        cube.percentage.style.display = "none";
        cube.percentage.textContent = "0%";
        cube.showPercentage = false;
    });
    cubes.forEach(animateCube);
});

fastModeCheckbox.addEventListener("change", () => {
    if (!fastModeCheckbox.checked) {
        stopAutoClicker();
    }
    cubes.forEach(cube => {
        if (cube.animation) cancelAnimationFrame(cube.animation);
        cube.animation = null;
        cube.progress = 0;
        cube.counted = false;
        cube.showPercentage = false;
        cube.percentage.style.display = "none";
        cube.percentage.textContent = "0%";
        animateCube(cube);
    });
    updateButtons();
});

autoClickCheckbox.addEventListener("change", () => {
    if (autoClickCheckbox.checked) {
        if (!fastModeCheckbox.checked || !isAutoClickAllowed()) {
            autoClickCheckbox.checked = false;
            return;
        }
        startAutoClicker();
    } else {
        stopAutoClicker();
    }
});

disableAllCheckbox.addEventListener("change", () => {
    updateButtons();
});

window.addEventListener("resize", updateLayout);