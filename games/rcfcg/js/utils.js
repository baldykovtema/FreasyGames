function formatTime(seconds) {
    seconds = Math.floor(seconds);
    const days = Math.floor(seconds / 86400);
    seconds %= 86400;
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (days > 0) return `${days}д ${hours}ч`;
    if (hours > 0) return `${hours}ч ${minutes}м`;
    if (minutes > 0) return `${minutes}м ${secs}с`;
    return `${secs}с`;
}

function isValidUsername(username) {
    return /^[a-zA-Z0-9_]{3,30}$/.test(username);
}

function usernameToEmail(username) {
    return username.trim().toLowerCase() + "@rcfcg-game.com";
}

function randomColor() {
    const hue = Math.floor(Math.random() * 360);
    const saturation = 75 + Math.random() * 25;
    const lightness = 50 + Math.random() * 20;
    return { css: `hsl(${hue},${saturation}%,${lightness}%)`, hue: hue };
}

function generateColors() {
    const colors = [];
    if (donutBoostActive) {
        // Бонус пончика: 20% цветов одного оттенка → шанс большого процента x2.5
        const dominantHue = Math.floor(Math.random() * 360);
        const dominantCount = Math.floor(LINE_COUNT * 0.2);
        for (let i = 0; i < LINE_COUNT; i++) {
            if (i < dominantCount) {
                const saturation = 75 + Math.random() * 25;
                const lightness = 50 + Math.random() * 20;
                colors.push({ css: `hsl(${dominantHue},${saturation}%,${lightness}%)`, hue: dominantHue });
            } else {
                colors.push(randomColor());
            }
        }
        return colors;
    }
    for (let i = 0; i < LINE_COUNT; i++) colors.push(randomColor());
    return colors;
}
