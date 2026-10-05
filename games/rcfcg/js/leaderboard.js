const leaderboardButton = document.getElementById("leaderboardButton");
const leaderboardScreen = document.getElementById("leaderboardScreen");
const leaderboardBack = document.getElementById("leaderboardBack");
const leaderboardMessage = document.getElementById("leaderboardMessage");
const leaderboardSlots = [
    document.getElementById("slot0"),
    document.getElementById("slot1"),
    document.getElementById("slot2")
];

let leaderboardMode = "percentage";

function clearLeaderboardCubes() {
    leaderboardSlots.forEach(slot => {
        const canvas = slot.querySelector("canvas");
        const percentageEl = slot.querySelector(".lbPercentage");
        const wrap = slot.querySelector(".lbCubeWrap");
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        percentageEl.textContent = "";
        wrap.style.display = "none";
    });
}

function drawLeaderboardCube(canvas, colors) {
    const ctx = canvas.getContext("2d");
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);
    if (!Array.isArray(colors) || colors.length !== LINE_COUNT) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, size, size);
        return;
    }
    const data = {
        canvas: canvas,
        colors: colors.map(css => ({ css: css, hue: 0 }))
    };
    drawCube(data, 1);
}

function renderLeaderboardSlot(slot, row, mode) {
    const canvas = slot.querySelector("canvas");
    const percentageEl = slot.querySelector(".lbPercentage");
    const nameEl = slot.querySelector(".lbName");
    const wrap = slot.querySelector(".lbCubeWrap");
    const size = Math.floor(slot.getBoundingClientRect().width);
    canvas.width = size > 0 ? size : 200;
    canvas.height = canvas.width;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    nameEl.textContent = row ? row.username : "—";

    if (!row) {
        wrap.style.display = mode === "percentage" ? "block" : "none";
        percentageEl.textContent = "";
        return;
    }

    if (mode === "percentage") {
        wrap.style.display = "block";
        drawLeaderboardCube(canvas, Array.isArray(row.colors) ? row.colors : []);
        percentageEl.textContent = Number(row.best_percentage || 0) + "%";
        percentageEl.style.color = row.dominant_color || "white";
    } else {
        wrap.style.display = "none";
        percentageEl.textContent = "";
    }

    if (mode === "time") {
        nameEl.textContent = `${row.username} — ${formatTime(row.total_play_seconds)}`;
    } else if (mode === "cubes") {
        nameEl.textContent = `${row.username} — ${row.cubes_completed} кубов`;
    }
}

async function loadLeaderboard(mode) {
    leaderboardMode = mode;
    document.querySelectorAll(".lbTab").forEach(tab => {
        tab.classList.toggle("active", tab.dataset.mode === mode);
    });
    leaderboardMessage.textContent = "Загрузка...";
    if (mode !== "percentage") clearLeaderboardCubes();

    let query = supabaseClient.from("leaderboard").select("username,best_percentage,dominant_color,colors,total_play_seconds,cubes_completed");

    if (mode === "percentage") query = query.order("best_percentage", { ascending: false });
    if (mode === "time") query = query.order("total_play_seconds", { ascending: false });
    if (mode === "cubes") query = query.order("cubes_completed", { ascending: false });

    const { data, error } = await query.limit(3);

    if (error) {
        console.error("Leaderboard load:", error);
        leaderboardMessage.textContent = "Не удалось загрузить таблицу лидеров.";
        return;
    }

    leaderboardMessage.textContent = data.length ? "" : "Пока нет результатов.";

    requestAnimationFrame(() => {
        leaderboardSlots.forEach((slot, index) => {
            renderLeaderboardSlot(slot, data[index] || null, mode);
        });
    });
}

leaderboardButton.addEventListener("click", async () => {
    await savePlayerStats();
    game.style.display = "none";
    leaderboardScreen.style.display = "flex";
    await loadLeaderboard("percentage");
});

document.querySelectorAll(".lbTab").forEach(tab => {
    tab.addEventListener("click", async () => {
        await loadLeaderboard(tab.dataset.mode);
    });
});

leaderboardBack.addEventListener("click", () => {
    leaderboardScreen.style.display = "none";
    game.style.display = "block";
    requestAnimationFrame(updateLayout);
});