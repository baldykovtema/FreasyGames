/* =====================================================
   TECHNICAL EMAIL
===================================================== */

function makeAuthEmail(username) {
    return username.toLowerCase() + "@pvz-game.com";
}

/* =====================================================
   AUTH
===================================================== */

async function register() {

    const username =
        document
            .getElementById("registerUsername")
            .value
            .trim();


    const password =
        document
            .getElementById("registerPassword")
            .value;


    const message =
        document.getElementById("authMessage");


    if (!/^[A-Za-z0-9_]{3,30}$/.test(username)) {

        message.textContent =
            "❌ Ник должен содержать 3–30 символов: A-Z, a-z, 0-9 или _";

        return;
    }


    if (password.length < 6) {

        message.textContent =
            "❌ Пароль должен содержать минимум 6 символов.";

        return;
    }


    message.textContent =
        "⏳ Создаём аккаунт...";


    const fakeEmail =
        makeAuthEmail(username);


    const {
        data,
        error
    } =
        await supabaseClient.auth.signUp({

            email: fakeEmail,

            password: password,

            options: {

                data: {
                    username: username
                }

            }

        });


    if (error) {

        message.textContent =
            "❌ " + error.message;

        return;
    }


    if (data.session) {

        currentUser =
            data.user;

        await loadUser();

    } else {

        message.textContent =
            "✅ Аккаунт создан!";

        /*
           Если Supabase просит подтверждение email,
           отключи подтверждение Email в настройках Auth.
        */

    }

}

/* =====================================================
   LOGIN
===================================================== */

async function login() {

    const username =
        document
            .getElementById("loginUsername")
            .value
            .trim();


    const password =
        document
            .getElementById("loginPassword")
            .value;


    const message =
        document.getElementById("authMessage");


    if (!username || !password) {

        message.textContent =
            "❌ Введи ник и пароль.";

        return;
    }


    message.textContent =
        "⏳ Входим...";


    const fakeEmail =
        makeAuthEmail(username);


    const {
        data,
        error
    } =
        await supabaseClient.auth
            .signInWithPassword({

                email: fakeEmail,

                password: password

            });


    if (error) {

        message.textContent =
            "❌ Неверный ник или пароль.";

        console.error(error);

        return;
    }


    currentUser =
        data.user;


    await loadUser();

}

/* =====================================================
   LOGOUT
===================================================== */

async function logout() {
    if (currentLobby) {
        await leaveLobby();
        if (currentLobby) return;
    }
    stopGame();
    await closeMatchConnection();
    if (onlineChannel) await supabaseClient.removeChannel(onlineChannel);
    onlineChannel = null;
    if (inviteChannel) await supabaseClient.removeChannel(inviteChannel);
    inviteChannel = null;
    const {error} = await supabaseClient.auth.signOut();
    if (error) {
        alert("❌ Не удалось выйти: " + error.message);
        return;
    }
    currentUser = null;
    profile = null;
    showScreen("authScreen");
}

async function requireActiveSession() {
    const {data, error} =
        await supabaseClient.auth.getUser();

    if (error || !data.user) {
        currentUser = null;
        profile = null;
        currentLobby = null;
        currentLobbyPlayerId = null;
        showScreen("authScreen");
        document.getElementById("authMessage").textContent =
            "Сессия устарела. Войди снова.";
        return false;
    }

    currentUser =
        data.user;

    return true;
}

/* =====================================================
   USER
===================================================== */

async function loadUser() {

    const {
        data: authData
    } =
        await supabaseClient.auth.getUser();


    if (!authData.user) {

        showScreen("authScreen");

        return;
    }


    currentUser =
        authData.user;


    let {
        data: profileData,
        error: profileError
    } =
        await supabaseClient
            .from("profiles")
            .select("*")
            .eq("id", currentUser.id)
            .maybeSingle();


    if (profileError) {

        console.error(profileError);

    }


    if (!profileData) {

        const username =
            currentUser
                .user_metadata
                ?.username ||
            "Player_" +
            currentUser.id.slice(0, 8);


        const result =
            await supabaseClient
                .from("profiles")
                .insert({

                    id: currentUser.id,

                    username: username

                })
                .select()
                .single();


        if (result.error) {

            console.error(result.error);

            document.getElementById("authMessage")
                .textContent =
                "❌ Не удалось создать профиль: " +
                result.error.message;

            return;
        }


        profileData =
            result.data;

    }


    profile =
        profileData;


    document.getElementById("usernameLabel")
        .textContent =
        profile.username;


    document.getElementById("progressLabel")
        .textContent =
        profile.unlocked_level;


    document.getElementById("avatar")
        .textContent =
        profile.username
            .charAt(0)
            .toUpperCase();


    showMenu();
    subscribeInvites();
    resumeBackgroundGame();

}

async function refreshCurrentProfile() {
    if (!currentUser) return;

    const {data, error} =
        await supabaseClient
            .from("profiles")
            .select("*")
            .eq("id", currentUser.id)
            .maybeSingle();

    if (error || !data) {
        throw error || new Error("Профиль не найден");
    }

    profile =
        data;

    document.getElementById("usernameLabel")
        .textContent =
        profile.username;

    document.getElementById("progressLabel")
        .textContent =
        profile.unlocked_level;

    document.getElementById("avatar")
        .textContent =
        profile.username
            .charAt(0)
            .toUpperCase();
}
