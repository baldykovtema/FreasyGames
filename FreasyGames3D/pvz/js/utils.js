/* =====================================================
   SAFE HTML
===================================================== */

function escapeHtml(text) {

    const div =
        document.createElement(
            "div"
        );


    div.textContent =
        text || "";


    return div.innerHTML;

}

/* =====================================================
   IN-GAME NOTIFICATIONS
===================================================== */

const browserAlert =
    globalThis.alert?.bind(globalThis);

const browserConfirm =
    globalThis.confirm?.bind(globalThis);

function getGameModal() {
    if (!document.body) return null;

    const modal =
        document.getElementById("gameModal");

    const message =
        document.getElementById("gameModalMessage");

    const actions =
        document.getElementById("gameModalActions");

    return modal && message && actions
        ? {modal, message, actions}
        : null;
}

function gameAlert(message) {
    const parts =
        getGameModal();

    if (!parts) {
        browserAlert?.(message);
        return;
    }

    parts.message.textContent =
        String(message ?? "");

    parts.actions.innerHTML =
        "";

    const closeButton =
        document.createElement("button");

    closeButton.className =
        "primary";

    closeButton.textContent =
        "Закрыть";

    closeButton.onclick =
        () => {
            parts.modal.hidden = true;
        };

    parts.actions.appendChild(
        closeButton
    );

    parts.modal.hidden =
        false;
}

function gameConfirm(message) {
    const parts =
        getGameModal();

    if (!parts) {
        return browserConfirm
            ? browserConfirm(message)
            : true;
    }

    return new Promise(resolve => {
        parts.message.textContent =
            String(message ?? "");

        parts.actions.innerHTML =
            "";

        const okButton =
            document.createElement("button");

        okButton.className =
            "primary";

        okButton.textContent =
            "Да";

        const cancelButton =
            document.createElement("button");

        cancelButton.className =
            "secondary";

        cancelButton.textContent =
            "Нет";

        okButton.onclick =
            () => {
                parts.modal.hidden = true;
                resolve(true);
            };

        cancelButton.onclick =
            () => {
                parts.modal.hidden = true;
                resolve(false);
            };

        parts.actions.appendChild(
            cancelButton
        );

        parts.actions.appendChild(
            okButton
        );

        parts.modal.hidden =
            false;
    });
}

globalThis.alert =
    gameAlert;

globalThis.confirm =
    gameConfirm;

/* =====================================================
   PLAYER COLORS
===================================================== */

function getPlayerColorEmoji(
    color
) {

    const colors = {

        red: "🔴",

        yellow: "🟡",

        green: "🟢",

        blue: "🔵"

    };


    return colors[color] || "⚪";

}

/* =====================================================
   COLOR
===================================================== */

function getPlayerColor(
    color
) {

    const colors = {

        red: "#a94c4c",

        yellow: "#a99a35",

        green: "#35a94c",

        blue: "#3975a9"

    };


    return colors[color] || "#666";

}
