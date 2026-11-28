/* =====================================================
   CHAT
===================================================== */

function toggleChat() {

    document
        .getElementById("chatBox")
        .classList
        .toggle("open");

}


function addChatMessage(
    username,
    message
) {

    const container =
        document.getElementById(
            "chatMessages"
        );


    const item =
        document.createElement(
            "div"
        );


    item.className =
        "chat-message";


    item.textContent =
        `${username}: ${message}`;


    container.appendChild(
        item
    );


    container.scrollTop =
        container.scrollHeight;

}


function sendChat() {

    const input =
        document.getElementById(
            "chatInput"
        );


    const message =
        input.value.trim();


    if (!message) {

        return;

    }


    if (!profile) {

        return;

    }


    addChatMessage(
        profile.username,
        message
    );


    if (gameMode === "online" && matchChannel) {
        const userId =
            typeof getLocalMatchUserId === "function"
                ? getLocalMatchUserId()
                : currentUser.id;

        void matchChannel.send({type: "broadcast", event: "chat", payload: {
            lobbyId: currentLobby.id, userId, message: message.slice(0, 500)
        }});
    }
    input.value = "";

}
