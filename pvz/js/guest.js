/* =====================================================
   OFFLINE MODE (guest without an account)
   Прогресс гостя хранится только на этом устройстве (localStorage).
   Онлайн-игра, приглашения и чат требуют аккаунта.
===================================================== */

const GUEST_ID = "offline-guest";
const GUEST_DB_KEY = "pvzGuestDb";
const GUEST_ACTIVE_KEY = "pvzGuestActive";
const GUEST_TABLES = ["profiles", "infinite_saves"];

function isGuest() {
    return currentUser?.id === GUEST_ID;
}

function guestDb() {
    let db = null;
    try { db = JSON.parse(window.localStorage?.getItem(GUEST_DB_KEY) || "null"); } catch {}
    if (!db || typeof db !== "object") db = {};
    GUEST_TABLES.forEach(t => { if (!Array.isArray(db[t])) db[t] = []; });
    if (!db.profiles.length) db.profiles.push({id: GUEST_ID, username: "Офлайн", unlocked_level: 1});
    return db;
}

function saveGuestDb(db) {
    try { window.localStorage?.setItem(GUEST_DB_KEY, JSON.stringify(db)); } catch {}
}

// Маленькая замена supabaseClient.from(...) для гостя: поддерживает те цепочки, что есть в игре.
function guestFrom(table) {
    const q = {op: "select", row: null, filters: [], order: null, one: false, conflict: null};
    const run = () => {
        if (!GUEST_TABLES.includes(table)) {
            return {data: null, error: {message: "Нужен аккаунт и интернет"}, count: 0};
        }
        const db = guestDb();
        let rows = db[table];
        const match = r => q.filters.every(([k, v]) => String(r[k]) === String(v));
        let result;
        if (q.op === "select") {
            result = rows.filter(match);
        } else if (q.op === "update") {
            result = rows.filter(match);
            result.forEach(r => Object.assign(r, q.row));
        } else if (q.op === "delete") {
            result = rows.filter(match);
            db[table] = rows.filter(r => !match(r));
        } else {
            const list = Array.isArray(q.row) ? q.row : [q.row];
            const keys = (q.conflict || "id").split(",").map(s => s.trim());
            result = list.map(item => {
                const existing = q.op === "upsert" && rows.find(r => keys.every(k => String(r[k]) === String(item[k])));
                if (existing) return Object.assign(existing, item);
                rows.push({...item});
                return rows[rows.length - 1];
            });
        }
        if (q.op !== "select") saveGuestDb(db);
        if (q.order) result = [...result].sort((a, b) => (a[q.order] > b[q.order] ? 1 : a[q.order] < b[q.order] ? -1 : 0));
        result = JSON.parse(JSON.stringify(result));
        if (q.one) {
            if (!result.length && q.one === "single") return {data: null, error: {message: "Не найдено"}};
            return {data: result[0] || null, error: null};
        }
        return {data: result, error: null, count: result.length};
    };
    const chain = new Proxy({}, {
        get(_, key) {
            if (key === "then") return (ok, fail) => Promise.resolve(run()).then(ok, fail);
            if (key === "select") return () => chain;
            if (key === "insert" || key === "update" || key === "upsert") {
                return (row, options) => { q.op = key; q.row = row; q.conflict = options?.onConflict || null; return chain; };
            }
            if (key === "delete") return () => { q.op = "delete"; return chain; };
            if (key === "eq") return (k, v) => { q.filters.push([k, v]); return chain; };
            if (key === "order") return k => { q.order = k; return chain; };
            if (key === "single") return () => { q.one = "single"; return chain; };
            if (key === "maybeSingle") return () => { q.one = "maybe"; return chain; };
            return () => chain;
        }
    });
    return chain;
}

const guestOriginals = {};

function playOffline() {
    try { window.localStorage?.setItem(GUEST_ACTIVE_KEY, "1"); } catch {}
    if (!guestOriginals.from) {
        guestOriginals.from = supabaseClient.from.bind(supabaseClient);
        guestOriginals.getUser = supabaseClient.auth.getUser.bind(supabaseClient.auth);
        guestOriginals.logout = logout;
        guestOriginals.showOnline = typeof showOnline === "function" ? showOnline : null;
        guestOriginals.subscribeInvites = typeof subscribeInvites === "function" ? subscribeInvites : null;
    }
    currentUser = {id: GUEST_ID, user_metadata: {username: "Офлайн"}};
    supabaseClient.from = guestFrom;
    supabaseClient.auth.getUser = async () => ({data: {user: currentUser}, error: null});
    logout = leaveOffline;
    showOnline = () => alert("Онлайн-игра доступна после входа в аккаунт. Нажми «Выйти» и войди.");
    subscribeInvites = () => {};

    profile = guestDb().profiles[0];
    document.getElementById("usernameLabel").textContent = "Офлайн-режим";
    document.getElementById("progressLabel").textContent = profile.unlocked_level;
    document.getElementById("avatar").textContent = "⚡";
    showMenu();
    resumeBackgroundGame();
}

function leaveOffline() {
    stopGame();
    try { window.localStorage?.removeItem(GUEST_ACTIVE_KEY); } catch {}
    supabaseClient.from = guestOriginals.from;
    supabaseClient.auth.getUser = guestOriginals.getUser;
    logout = guestOriginals.logout;
    if (guestOriginals.showOnline) showOnline = guestOriginals.showOnline;
    if (guestOriginals.subscribeInvites) subscribeInvites = guestOriginals.subscribeInvites;
    currentUser = null;
    profile = null;
    showScreen("authScreen");
}

// main.js: если в прошлый раз играли офлайн — сразу продолжаем офлайн.
function guestAutoStart() {
    let active = false;
    try { active = window.localStorage?.getItem(GUEST_ACTIVE_KEY) === "1"; } catch {}
    if (active) playOffline();
    return active;
}
