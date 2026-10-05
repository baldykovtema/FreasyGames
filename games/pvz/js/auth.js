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
            "Сессия устарела. Войдите на FreasyGames.";
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
