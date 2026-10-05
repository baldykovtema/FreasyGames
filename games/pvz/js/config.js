/* =====================================================
   SUPABASE
===================================================== */

const SUPABASE_URL =
    "https://ywqxrbmgmvpbeytxjkpi.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_igyJK68YpyJYo-0KNrVZPA_rm6_gIRg";

const SUPABASE_AUTH_KEY =
    "sb-ywqxrbmgmvpbeytxjkpi-auth-token";

if (
    typeof window.localStorage === "object" &&
    typeof window.sessionStorage === "object" &&
    !window.sessionStorage.getItem(SUPABASE_AUTH_KEY) &&
    window.localStorage.getItem(SUPABASE_AUTH_KEY)
) {
    window.sessionStorage.setItem(
        SUPABASE_AUTH_KEY,
        window.localStorage.getItem(SUPABASE_AUTH_KEY)
    );
}

const supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY,
        {
            auth: {
                storage:
                    typeof window.sessionStorage === "object"
                        ? window.sessionStorage
                        : undefined,
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        }
    );

const BOARD_ROWS = 5;
const BOARD_X_START = 12;
const BOARD_X_WIDTH = 80;

function boardColWidth() {
    return BOARD_X_WIDTH / 10;
}

function boardColStart(col) {
    return BOARD_X_START + col * boardColWidth();
}

function boardColCenter(col) {
    return boardColStart(col) + boardColWidth() / 2;
}

function rowTop(row) {
    return row * (100 / BOARD_ROWS);
}

function rowCenter(row) {
    return rowTop(row) + (50 / BOARD_ROWS);
}
