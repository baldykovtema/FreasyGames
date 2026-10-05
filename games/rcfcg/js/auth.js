const authScreen = document.getElementById("authScreen");
const game = document.getElementById("game");
function showGame() {
    authScreen.style.display = "none";
    game.style.display = "block";
    adminPanel.style.display = isAdmin() ? "block" : "none";
    if (isAdmin()) {
        adminCubeInput.value = stats.cubesCompleted;
        adminMessage.textContent = "";
    }
    updateStatsUI();
    startPlayTimer();
    startDonutSpawner();
    requestAnimationFrame(updateLayout);
}

function showAuth() {
    game.style.display = "none";
    authScreen.style.display = "flex";
    adminPanel.style.display = "none";
    stopDonutSpawner();
    stopAutoClicker();
}

async function checkSession() {
    try {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        if (data.session) {
            currentUser = data.session.user;
            await loadPlayerStats(currentUser);
            showGame();
        } else {
            showAuth();
        }
    } catch (error) {
        currentUser = null;
        showAuth();
        document.getElementById("authMessage").textContent = "Не удалось загрузить аккаунт или прогресс. Обновите страницу и попробуйте снова.";
        console.error(error);
    }
}
