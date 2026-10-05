/* =====================================================
   SHOW ONLINE
===================================================== */

async function showOnline() {

    showScreen("onlineScreen");

    await refreshOnlineScreen();

    subscribeInvites();

}

async function refreshOnlineScreen() {
    const button = document.getElementById("refreshOnlineButton");
    if (button) {
        button.disabled = true;
        button.textContent = "Обновляем...";
    }

    try {
        await cleanupEmptyWaitingLobbies();
        await renderDifficulties();
        await renderOnlinePlayers();
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Обновить";
        }
    }
}

/* =====================================================
   RENDER DIFFICULTIES
===================================================== */

async function renderDifficulties() {

    const grid =
        document.getElementById(
            "difficultyGrid"
        );


    grid.innerHTML = "";


    for (
        const difficulty
        of difficulties
    ) {

        const count =
            await getLobbyPlayerCount(
                difficulty.id
            );


        const card =
            document.createElement(
                "div"
            );


        card.className =
            "difficulty";


        card.innerHTML = `

            <div style="font-size:35px">
                ${difficulty.emoji}
            </div>

            <h2>
                ${difficulty.name}
            </h2>

            <div class="players-count">
                👥 ${count} игроков
            </div>

            <button
                class="primary"
                style="margin-top:12px">

                🎮 Найти игру

            </button>
            <button class="secondary" style="margin-top:8px">＋ Создать лобби</button>

        `;


        const [joinButton, createButton] = card.querySelectorAll("button");
        joinButton.onclick = () => joinOrCreateLobby(difficulty.id);
        createButton.onclick = () => joinOrCreateLobby(difficulty.id, true);

        grid.appendChild(
            card
        );

    }

}

/* =====================================================
   COUNT PLAYERS
===================================================== */

async function getLobbyPlayerCount(
    difficulty
) {

    const {
        data: lobbies,
        error
    } =
        await supabaseClient
            .from("lobbies")
            .select("id")
            .eq(
                "difficulty",
                difficulty
            )
            .eq(
                "status",
                "waiting"
            );


    if (error) {

        console.error(
            "getLobbyPlayerCount:",
            error
        );

        return 0;

    }


    if (
        !lobbies ||
        lobbies.length === 0
    ) {

        return 0;

    }


    const lobbyIds =
        lobbies.map(
            lobby => lobby.id
        );


    const {
        count,
        error: countError
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
            .in(
                "lobby_id",
                lobbyIds
            )
            .gte(
                "last_seen",
                activePresenceCutoff()
            );


    if (countError) {

        console.error(
            "count players:",
            countError
        );

        return 0;

    }


    return count || 0;

}

/* =====================================================
   ONLINE PLAYERS LIST
===================================================== */

async function renderOnlinePlayers() {

    const container =
        document.getElementById(
            "onlinePlayersList"
        );


    if (!container) {

        return;

    }


    container.innerHTML = `
        <div class="online-empty">
            ⏳ Загружаем игроков...
        </div>
    `;


    const {
        data: lobbies,
        error
    } =
        await supabaseClient
            .from("lobbies")
            .select(
                "id,difficulty,status"
            )
            .eq(
                "status",
                "waiting"
            );


    if (error) {

        console.error(
            "online players:",
            error
        );


        container.innerHTML = `
            <div class="online-empty">
                ❌ Не удалось загрузить игроков
            </div>
        `;

        return;

    }


    if (
        !lobbies ||
        lobbies.length === 0
    ) {

        container.innerHTML = `
            <div class="online-empty">
                👤 Сейчас других игроков нет
            </div>
        `;

        return;

    }


    const lobbyIds =
        lobbies.map(
            lobby => lobby.id
        );


    const {
        data: players,
        error: playersError
    } =
        await supabaseClient
            .from("lobby_players")
            .select(
                "id,lobby_id,user_id,username,player_color,ready,last_seen"
            )
            .in(
                "lobby_id",
                lobbyIds
            );


    if (playersError) {

        console.error(
            "online players:",
            playersError
        );


        container.innerHTML = `
            <div class="online-empty">
                ❌ Ошибка списка игроков
            </div>
        `;

        return;

    }


    const activePlayers =
        (players || [])
            .filter(
                player =>
                    isActivePresence(
                        player.last_seen
                    )
            );


    const otherPlayers =
        dedupeOnlinePlayers(
            activePlayers.filter(
                player =>
                    player.user_id !==
                    currentUser.id
            ),
            lobbies
        );


    if (
        otherPlayers.length === 0
    ) {

        container.innerHTML = `
            <div class="online-empty">
                👤 Сейчас других игроков нет
                <br>
                <small>
                    Открой игру на другом устройстве,
                    чтобы увидеть второго игрока.
                </small>
            </div>
        `;

        return;

    }


    container.innerHTML = "";


    otherPlayers.forEach(
        player => {

            const lobby =
                lobbies.find(
                    l =>
                        l.id ===
                        player.lobby_id
                );


            const difficulty =
                difficulties.find(
                    d =>
                        d.id ===
                        lobby?.difficulty
                );


            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "online-player";


            const colorEmoji =
                getPlayerColorEmoji(
                    player.player_color
                );


            const header =
                document.createElement(
                    "div"
                );


            header.className =
                "online-player-header";


            const avatar =
                document.createElement(
                    "div"
                );


            avatar.className =
                "online-player-avatar";


            avatar.textContent =
                player.username
                    .charAt(0)
                    .toUpperCase();


            const info =
                document.createElement(
                    "div"
                );


            const name =
                document.createElement(
                    "div"
                );


            name.className =
                "online-player-name";


            name.textContent =
                player.username;


            const status =
                document.createElement(
                    "div"
                );


            status.className =
                "online-player-status";


            status.textContent =
                `${colorEmoji} ${difficulty?.name || "Онлайн"}`;


            info.appendChild(
                name
            );


            info.appendChild(
                status
            );


            header.appendChild(
                avatar
            );


            header.appendChild(
                info
            );


            const button =
                document.createElement(
                    "button"
                );


            button.className =
                "primary";


            button.style.marginTop =
                "12px";


            button.textContent =
                "👥 Войти в лобби";


            button.onclick =
                () =>
                    joinPlayerLobby(
                        player.lobby_id
                    );


            card.appendChild(
                header
            );


            card.appendChild(
                button
            );


            container.appendChild(
                card
            );

        }
    );

}

function activePresenceCutoff() {
    return new Date(Date.now() - 60000).toISOString();
}

function isActivePresence(lastSeen) {
    if (!lastSeen) return false;
    return Date.now() - Date.parse(lastSeen) <= 60000;
}

function dedupeOnlinePlayers(players, lobbies) {
    const lobbyOrder =
        new Map(
            lobbies.map(
                (lobby, index) =>
                    [lobby.id, index]
            )
        );


    const sorted =
        [...players]
            .sort(
                (a, b) => {
                    const seenDiff =
                        Date.parse(b.last_seen) -
                        Date.parse(a.last_seen);

                    if (seenDiff) return seenDiff;

                    return (lobbyOrder.get(a.lobby_id) ?? 0) -
                        (lobbyOrder.get(b.lobby_id) ?? 0);
                }
            );


    const result =
        [];


    const seenUsers =
        new Set();


    for (const player of sorted) {
        if (seenUsers.has(player.user_id)) continue;
        seenUsers.add(player.user_id);
        result.push(player);
    }


    return result;
}

function subscribeInvites() {
    if (!currentUser || inviteChannel) return;

    inviteChannel =
        supabaseClient
            .channel(
                "invites-" +
                currentUser.id
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "lobby_invites",
                    filter: `to_user_id=eq.${currentUser.id}`
                },
                async () => {
                    await renderPendingInvite();
                }
            )
            .subscribe();

    void renderPendingInvite();
}

async function renderPendingInvite() {
    if (!currentUser) return;

    const popup = document.getElementById("invitePopup");
    const text = document.getElementById("invitePopupText");
    const acceptButton = document.getElementById("acceptInviteButton");
    const declineButton = document.getElementById("declineInviteButton");

    if (!popup || !text || !acceptButton || !declineButton) return;

    const {data: invites, error} = await supabaseClient
        .from("lobby_invites")
        .select("*")
        .eq("to_user_id", currentUser.id)
        .eq("status", "pending")
        .order("created_at", {ascending: false});

    if (error || !invites?.length) {
        popup.hidden = true;
        return;
    }

    const invite = invites[0];
    text.textContent = `${invite.from_username} хочет пригласить вас в их лобби`;
    popup.hidden = false;

    acceptButton.onclick = async () => {
        await answerLobbyInvite(invite, true);
    };

    declineButton.onclick = async () => {
        await answerLobbyInvite(invite, false);
    };
}

async function answerLobbyInvite(invite, accepted) {
    const popup = document.getElementById("invitePopup");
    popup.hidden = true;

    const {error} = await supabaseClient
        .from("lobby_invites")
        .update({status: accepted ? "accepted" : "declined"})
        .eq("id", invite.id)
        .eq("to_user_id", currentUser.id);

    if (error) {
        alert("❌ Не удалось ответить на приглашение: " + error.message);
        return;
    }

    if (accepted) {
        if (currentLobby && currentLobby.id !== invite.lobby_id && !gameRunning) {
            await leaveLobby();
        }
        await joinPlayerLobby(invite.lobby_id);
    } else {
        await renderPendingInvite();
    }
}
