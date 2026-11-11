// Keep repeated clicks from creating parallel lobby entries or overwriting currentLobby.
async function enterLobby(action) {
    if (joiningLobby || leavingLobby) return;
    if (currentLobby) {
        showScreen(gameRunning ? "gameScreen" : "lobbyScreen");
        return;
    }
    joiningLobby = true;
    try {
        await action();
    } catch (error) {
        console.error("Lobby entry:", error);
        alert("❌ Не удалось войти в лобби: " + error.message);
    } finally {
        joiningLobby = false;
    }
}

function joinPlayerLobby(lobbyId) {
    return enterLobby(() => joinPlayerLobbyInternal(lobbyId));
}

function joinOrCreateLobby(difficulty, createNew = false) {
    return enterLobby(() => joinOrCreateLobbyInternal(difficulty, createNew));
}

function resetInviteTargets() {
    const container = document.getElementById("invitePlayersList");
    if (!container) return;
    delete container.dataset.loaded;
    container.textContent = "";
}

async function cleanupOwnWaitingLobbies(exceptLobbyId = null) {
    if (!currentUser) return;

    const {data: myRows, error} = await supabaseClient
        .from("lobby_players")
        .select("lobby_id")
        .eq("user_id", currentUser.id)
        .eq("username", profile.username);

    if (error) throw error;

    const staleLobbyIds =
        [...new Set((myRows || [])
            .map(row => row.lobby_id)
            .filter(lobbyId => lobbyId && lobbyId !== exceptLobbyId))];

    if (!staleLobbyIds.length) return;

    const {data: lobbies, error: lobbyError} = await supabaseClient
        .from("lobbies")
        .select("id,status")
        .in("id", staleLobbyIds);

    if (lobbyError) throw lobbyError;

    const waitingLobbyIds =
        (lobbies || [])
            .filter(lobby => lobby.status === "waiting")
            .map(lobby => lobby.id);

    if (!waitingLobbyIds.length) return;

    const {error: deleteError} = await supabaseClient
        .from("lobby_players")
        .delete()
        .eq("user_id", currentUser.id)
        .in("lobby_id", waitingLobbyIds);

    if (deleteError) throw deleteError;
}

async function cleanupEmptyWaitingLobbies() {
    if (!currentUser) return;

    const {data: hostedLobbies, error} = await supabaseClient
        .from("lobbies")
        .select("id")
        .eq("host_id", currentUser.id)
        .eq("status", "waiting");

    if (error) {
        console.error("cleanup lobbies:", error);
        return;
    }

    for (const lobby of hostedLobbies || []) {
        const {count, error: countError} = await supabaseClient
            .from("lobby_players")
            .select("*", {count: "exact", head: true})
            .eq("lobby_id", lobby.id);

        if (countError) {
            console.error("cleanup lobby count:", countError);
            continue;
        }

        if ((count || 0) === 0) {
            const {error: updateError} = await supabaseClient
                .from("lobbies")
                .update({status: "finished"})
                .eq("id", lobby.id)
                .eq("status", "waiting");

            if (updateError) console.error("cleanup lobby:", updateError);
        }
    }
}

async function touchLobbyPresence(lobbyId = currentLobby?.id) {
    if (!currentUser || !lobbyId) return;

    const {error} = await supabaseClient
        .from("lobby_players")
        .update({last_seen: new Date().toISOString()})
        .eq("lobby_id", lobbyId)
        .eq("user_id", currentUser.id);

    if (error) console.error("presence:", error);
}

async function fetchLobbyPlayers(lobbyId) {
    if (typeof supabaseClient.rpc === "function") {
        const {data, error} =
            await supabaseClient
                .rpc(
                    "get_lobby_players",
                    {
                        p_lobby_id:
                            lobbyId
                    }
                );

        if (!error) {
            return {
                data:
                    data || [],

                error:
                    null
            };
        }

        console.error(
            "get_lobby_players rpc:",
            error
        );
    }

    return supabaseClient
        .from("lobby_players")
        .select("*")
        .eq(
            "lobby_id",
            lobbyId
        )
        .order(
            "joined_at",
            {
                ascending:
                    true
            }
        );
}

/* =====================================================
   JOIN PLAYER LOBBY
===================================================== */

async function joinPlayerLobbyInternal(
    lobbyId
) {
    if (!await requireActiveSession()) return;

    await cleanupOwnWaitingLobbies(lobbyId);

    const {
        data: lobby,
        error
    } =
        await supabaseClient
            .from("lobbies")
            .select("*")
            .eq(
                "id",
                lobbyId
            )
            .single();


    if (error || !lobby) {
        await renderOnlinePlayers();

        return;

    }


    if (
        lobby.status !== "waiting"
    ) {
        await renderOnlinePlayers();

        return;

    }


    currentLobby =
        lobby;

    currentLobbyPlayerId =
        null;

    resetInviteTargets();


    const success =
        await joinLobby(
            lobby
        );


    if (!success) {

        currentLobby = null;

        return;

    }


    showScreen(
        "lobbyScreen"
    );


    subscribeLobby();
    await renderLobby();

}

/* =====================================================
   JOIN OR CREATE
===================================================== */

async function joinOrCreateLobbyInternal(
    difficulty, createNew = false
) {
    if (!await requireActiveSession()) return;

    await cleanupOwnWaitingLobbies();
    await cleanupEmptyWaitingLobbies();

    /*
       Получаем все ожидающие лобби,
       а не первое попавшееся.
    */

    const {
        data: lobbies,
        error
    } =
        await supabaseClient
            .from("lobbies")
            .select("*")
            .eq(
                "difficulty",
                difficulty
            )
            .eq(
                "status",
                "waiting"
            )
            .order(
                "created_at",
                {
                    ascending: true
                }
            );


    if (error) {

        alert(
            "❌ Ошибка поиска лобби: " +
            error.message
        );

        return;

    }


    let selectedLobby =
        null;


    /*
       Ищем лобби, где меньше 4 игроков.
    */

    for (
        const lobby
        of (createNew ? [] : (lobbies || []))
    ) {

        const {
            count, error: countError
        } =
            await supabaseClient
                .from("lobby_players")
                .select(
                    "*",
                    {
                        count: "exact",
                        head: true
                    }
                )
                .eq(
                    "lobby_id",
                    lobby.id
                );


        if (countError) throw countError;
        if (
            (count || 0) < 4
        ) {

            selectedLobby =
                lobby;

            break;

        }

    }


    /*
       Если подходящего лобби нет —
       создаём новое.
    */

    if (!selectedLobby) {

        const result =
            await supabaseClient
                .from("lobbies")
                .insert({

                    difficulty,

                    host_id:
                        currentUser.id,

                    status:
                        "waiting"

                })
                .select()
                .single();


        if (result.error) {

            alert(
                "❌ Не удалось создать лобби: " +
                result.error.message
            );

            return;

        }


        selectedLobby =
            result.data;

    }


    currentLobby =
        selectedLobby;

    currentLobbyPlayerId =
        null;

    resetInviteTargets();


    const success =
        await joinLobby(
            selectedLobby
        );


    if (!success) {

        currentLobby = null;

        return;

    }


    showScreen(
        "lobbyScreen"
    );


    subscribeLobby();
    await renderLobby();

}

function findMyLobbyPlayer(players = []) {
    return players.find(
        player =>
            currentLobbyPlayerId &&
            player.id === currentLobbyPlayerId
    ) || players.find(
        player =>
            profile?.username &&
            player.username === profile.username
    ) || players.find(
        player =>
            currentUser?.id &&
            player.user_id === currentUser.id
    ) || null;
}

/* =====================================================
   JOIN LOBBY
===================================================== */

async function joinLobby(
    lobby
) {
    if (typeof supabaseClient.rpc === "function") {
        const {data: joinedPlayer, error: rpcError} =
            await supabaseClient
                .rpc(
                    "join_lobby",
                    {
                        p_lobby_id:
                            lobby.id,

                        p_username:
                            profile.username
                    }
                );

        if (!rpcError) {
            currentLobbyPlayerId =
                joinedPlayer?.id ||
                null;

            return true;
        }

        console.error(
            "join_lobby rpc:",
            rpcError
        );

        alert(
            "❌ Ошибка входа в лобби: " +
            rpcError.message
        );

        return false;
    }

    const colors = [

        "red",
        "yellow",
        "green",
        "blue"

    ];


    const {
        data: players,
        error
    } =
        await supabaseClient
            .from("lobby_players")
            .select("*")
            .eq(
                "lobby_id",
                lobby.id
            );


    if (error) {

        alert(
            "❌ Ошибка получения игроков: " +
            error.message
        );

        return false;

    }


    /*
       Уже внутри?
    */

    const alreadyInside =
        players?.find(
            p =>
                p.user_id ===
                currentUser.id
        );


    if (alreadyInside) {
        currentLobbyPlayerId =
            alreadyInside.id ||
            null;

        return true;

    }


    /*
       Проверяем максимум 4.
    */

    if (
        (players?.length || 0) >= 4
    ) {

        alert(
            "❌ Лобби уже заполнено."
        );

        return false;

    }


    /*
       Выбираем свободный цвет.
    */

    const usedColors =
        (players || [])
            .map(
                p =>
                    p.player_color
            );


    const color =
        colors.find(
            c =>
                !usedColors.includes(c)
        );


    if (!color) {

        alert(
            "❌ Нет свободного цвета."
        );

        return false;

    }


    const {
        data: insertedPlayer,
        error: insertError
    } =
        await supabaseClient
            .from("lobby_players")
            .insert({

                lobby_id:
                    lobby.id,

                user_id:
                    currentUser.id,

                username:
                    profile.username,

                player_color:
                    color,

                ready:
                    false

            })
            .select()
            .single();


    if (insertError) {

        alert(
            "❌ Ошибка входа в лобби: " +
            insertError.message
        );

        return false;

    }

    currentLobbyPlayerId =
        insertedPlayer?.id ||
        null;


    return true;

}

/* =====================================================
   RENDER LOBBY
===================================================== */

async function renderLobby() {
    if (lobbyRenderBusy || leavingLobby) return;
    lobbyRenderBusy = true;
    try {
        await renderLobbyState();
    } finally {
        lobbyRenderBusy = false;
    }
}

async function renderLobbyState() {
    const lobbyId = currentLobby?.id;
    if (!lobbyId) return;
    await touchLobbyPresence(lobbyId);
    const {data: lobby, error: lobbyError} = await supabaseClient.from("lobbies").select("*").eq("id", lobbyId).maybeSingle();
    if (currentLobby?.id !== lobbyId || lobbyError || leavingLobby) return;
    if (!lobby || lobby.status === "finished") {
        await closeStaleLobby();
        return;
    }
    currentLobby = lobby;

    if (!currentLobby) {

        return;

    }


    const {
        data: players,
        error
    } =
        await fetchLobbyPlayers(
            currentLobby.id
        );


    if (error) {

        console.error(
            "renderLobby:",
            error
        );

        return;

    }


    if (currentLobby?.id !== lobbyId || leavingLobby) return;
    if (matchChannel) {
        if ((players || []).length) {
            matchPlayers = players || [];
        }
        if (gameRunning) {
            renderPlayersPanel();
            updateSun();
        }
    }

    initializeInviteTargets();

    const container =
        document.getElementById(
            "lobbyPlayers"
        );


    container.innerHTML = "";


    document.getElementById(
        "lobbyInfo"
    ).textContent =
        matchChannel && !gameRunning
            ? "🎮 Подключаем игроков к матчу…"
            : `👥 Игроков: ${players?.length || 0} / 4`;


    /*
       Показываем 4 места.
    */

    for (
        let index = 0;
        index < 4;
        index++
    ) {

        const player =
            players?.[index];


        const wrapper =
            document.createElement(
                "div"
            );


        wrapper.className =
            "lobby-player";


        if (!player) {

            wrapper.innerHTML = `

                <div class="player-circle">
                    +
                </div>

                <div
                    style="margin-top:8px;color:#777">

                    Свободно

                </div>

            `;

            container.appendChild(
                wrapper
            );

            continue;

        }


        const circle =
            document.createElement(
                "div"
            );


        circle.className =
            "player-circle" +
            (
                player.ready
                    ? " ready"
                    : ""
            );


        circle.textContent =
            player.username
                .charAt(0)
                .toUpperCase();


        circle.style.background =
            getPlayerColor(
                player.player_color
            );


        circle.title =
            `${player.username} • ${getPlayerColorEmoji(player.player_color)}`;


        const name =
            document.createElement(
                "div"
            );


        name.style.marginTop =
            "8px";


        name.textContent =
            player.username;


        const status =
            document.createElement(
                "div"
            );


        status.style.fontSize =
            "12px";


        status.style.color =
            player.ready
                ? "#8af09a"
                : "#aaa";


        status.textContent =
            player.ready
                ? "✅ Готов"
                : "⏳ Не готов";


        wrapper.appendChild(
            circle
        );


        wrapper.appendChild(
            name
        );


        wrapper.appendChild(
            status
        );


        container.appendChild(
            wrapper
        );

    }


    const me =
        findMyLobbyPlayer(
            players || []
        );


    document.getElementById(
        "readyButton"
    ).textContent =
        me?.ready
            ? "🔴 НЕ ГОТОВ"
            : "🟢 ГОТОВ";


    const allReady =
        players &&
        players.length >= 1 &&
        players.length <= 4 &&
        players.every(
            p => p.ready
        );


    if (allReady && !matchChannel && !leavingLobby) {
        void startOnlineMatch(players);

        document.getElementById(
            "lobbyInfo"
        ).textContent =
            "🎮 Все игроки готовы!";

    }

}

function initializeInviteTargets() {
    const container = document.getElementById("invitePlayersList");
    if (!container || container.dataset.loaded === "true") return;
    void refreshInviteTargets();
}

async function refreshInviteTargets() {
    const button = document.getElementById("refreshInviteButton");
    const container = document.getElementById("invitePlayersList");

    if (button) {
        button.disabled = true;
        button.textContent = "Обновляем...";
    }

    try {
        const lobbyId = currentLobby?.id;

        if (!container || !lobbyId) return;

        const {data: players, error} =
            await fetchLobbyPlayers(
                lobbyId
            );

        if (error) {
            container.textContent = "Не удалось загрузить игроков";
            return;
        }

        await renderInviteTargets(players || []);
        container.dataset.loaded = "true";
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Обновить";
        }
    }
}

async function renderInviteTargets(lobbyPlayers = []) {
    const container = document.getElementById("invitePlayersList");
    if (!container || !currentLobby || currentLobby.status !== "waiting") return;

    container.innerHTML = "Загружаем...";

    const invitedIds =
        new Set(
            lobbyPlayers.map(
                player =>
                    player.user_id
            )
        );

    const {data: lobbies, error: lobbyError} = await supabaseClient
        .from("lobbies")
        .select("id,status")
        .eq("status", "waiting");

    if (lobbyError) {
        container.textContent = "Не удалось загрузить игроков";
        return;
    }

    const lobbyIds =
        (lobbies || [])
            .map(
                lobby =>
                    lobby.id
            );

    if (!lobbyIds.length) {
        container.textContent = "Нет игроков онлайн";
        return;
    }

    const {data: players, error} = await supabaseClient
        .from("lobby_players")
        .select("lobby_id,user_id,username,last_seen")
        .in("lobby_id", lobbyIds)
        .gte("last_seen", activePresenceCutoff());

    if (error) {
        container.textContent = "Не удалось загрузить игроков";
        return;
    }

    const candidates =
        dedupeOnlinePlayers(
            (players || [])
                .filter(
                    player =>
                        player.user_id !== currentUser.id &&
                        player.username !== profile?.username &&
                        !invitedIds.has(player.user_id) &&
                        isActivePresence(player.last_seen)
                ),
            lobbies || []
        );

    container.innerHTML = "";

    if (!candidates.length) {
        container.textContent = "Нет игроков для приглашения";
        return;
    }

    for (const player of candidates) {
        const row = document.createElement("div");
        row.className = "invite-row";

        const name = document.createElement("span");
        name.textContent = player.username;
        row.appendChild(name);

        const button = document.createElement("button");
        button.className = "secondary";
        button.textContent = "Пригласить";
        button.onclick = () => sendLobbyInvite(player);
        row.appendChild(button);

        container.appendChild(row);
    }
}

async function sendLobbyInvite(player) {
    if (!currentLobby || inviteBusy) return;
    inviteBusy = true;
    try {
        const {error} = await supabaseClient
            .from("lobby_invites")
            .insert({
                lobby_id: currentLobby.id,
                from_user_id: currentUser.id,
                from_username: profile.username,
                to_user_id: player.user_id
            });

        if (error) throw error;
        alert(`Приглашение отправлено игроку ${player.username}`);
    } catch (error) {
        alert("❌ Не удалось отправить приглашение: " + error.message);
    } finally {
        inviteBusy = false;
    }
}

async function closeStaleLobby() {
    clearInterval(lobbyPollTimer);
    lobbyPollTimer = null;
    stopGame();
    await closeMatchConnection();
    if (lobbyChannel) await supabaseClient.removeChannel(lobbyChannel);
    lobbyChannel = null;
    currentLobby = null;
    currentLobbyPlayerId = null;
    gameMode = "campaign";
    resetInviteTargets();
    await showOnline();
}

/* =====================================================
   READY
===================================================== */

async function toggleReady() {
    if (matchChannel || leavingLobby || readyBusy || !currentLobby) return;
    readyBusy = true;
    const lobbyId = currentLobby.id;
    const button = document.getElementById("readyButton");
    button.disabled = true;
    try {
        const {data: players, error} = await supabaseClient.from("lobby_players").select("id,user_id,username,ready")
            .eq("lobby_id", lobbyId);
        const me =
            findMyLobbyPlayer(
                players || []
            );
        if (error || !me) throw error || new Error("Игрок не найден в лобби");
        if (currentLobby?.id !== lobbyId || leavingLobby) return;
        if (!me.ready) {
            readyBusy = false;
            button.disabled = false;
            openPlantSelection({
                title: "Онлайн игра",
                description: "Выбери растения, которыми будешь играть в этом матче.",
                pool: plants.map(plant => plant.id),
                limit: 10,
                startText: "🟢 ВЫБРАТЬ И ГОТОВ",
                onStart: async () => {
                    matchPlantSelections[currentUser.id] = [...selectedPlants];
                    showScreen("lobbyScreen");
                    await setLobbyReady(me.id, true);
                },
                onCancel: () => showScreen("lobbyScreen")
            });
            return;
        }
        await setLobbyReady(me.id, false);
    } catch (error) {
        alert("❌ Не удалось изменить готовность: " + error.message);
    } finally {
        readyBusy = false;
        button.disabled = false;
    }
}

async function setLobbyReady(playerId, ready) {
    const {error} = await supabaseClient.from("lobby_players").update({ready}).eq("id", playerId);
    if (error) {
        alert("❌ Не удалось изменить готовность: " + error.message);
        return;
    }
    await renderLobby();
}

/* =====================================================
   LOBBY REALTIME
===================================================== */

function subscribeLobby() {
    clearInterval(lobbyPollTimer);
    lobbyPollTimer = setInterval(() => { void renderLobby(); }, 2000);

    if (!currentLobby) {

        return;

    }


    if (lobbyChannel) {

        supabaseClient
            .removeChannel(
                lobbyChannel
            );

        lobbyChannel = null;

    }


    const channelName =
        "lobby-" +
        currentLobby.id +
        "-" +
        currentUser.id;


    lobbyChannel =
        supabaseClient
            .channel(channelName)


            .on(

                "postgres_changes",

                {

                    event: "*",

                    schema: "public",

                    table: "lobby_players",

                    filter:
                        `lobby_id=eq.${currentLobby.id}`

                },

                async payload => {

                    console.log(
                        "👥 Изменение игроков:",
                        payload
                    );


                    await renderLobby();

                }

            )


            .subscribe(
                (status, error) => {

                    console.log(
                        "Realtime lobby:",
                        status,
                        error || ""
                    );


                    if (
                        status ===
                        "SUBSCRIBED"
                    ) {

                        console.log(
                            "✅ Realtime лобби подключён"
                        );

                    }


                    if (
                        status ===
                        "CHANNEL_ERROR"
                    ) {

                        console.error(
                            "❌ Realtime ошибка:",
                            error
                        );

                    }


                    if (
                        status ===
                        "TIMED_OUT"
                    ) {

                        console.error(
                            "⏱️ Realtime timeout"
                        );

                    }

                }
            );

}

/* =====================================================
   LEAVE LOBBY
===================================================== */

async function leaveLobby() {
    if (leavingLobby) return;
    leavingLobby = true;
    stopGame();
    clearInterval(lobbyPollTimer);
    lobbyPollTimer = null;
    const lobby = currentLobby;
    try {
        if (lobby) {
            let myLobbyUserId =
                currentUser.id;

            const {data: players} =
                await supabaseClient
                    .from("lobby_players")
                    .select("user_id,username")
                    .eq("lobby_id", lobby.id);

            myLobbyUserId =
                findMyLobbyPlayer(players || [])?.user_id ||
                myLobbyUserId;

            if (isMatchHost()) {
                const {error} = await supabaseClient.from("lobbies").update({status: "finished"}).eq("id", lobby.id);
                if (error) throw error;
            }
            const {error} = await supabaseClient.from("lobby_players").delete()
                .eq("lobby_id", lobby.id).eq("user_id", myLobbyUserId);
            if (error) throw error;
        }
        await closeMatchConnection();
        if (lobbyChannel) await supabaseClient.removeChannel(lobbyChannel);
        lobbyChannel = null;
        currentLobby = null;
        currentLobbyPlayerId = null;
        gameMode = "campaign";
        resetInviteTargets();
        await showOnline();
    } catch (error) {
        alert("❌ Не удалось выйти из лобби: " + error.message);
        showScreen("lobbyScreen");
        lobbyPollTimer = setInterval(() => { void renderLobby(); }, 2000);
    } finally {
        leavingLobby = false;
    }
}
