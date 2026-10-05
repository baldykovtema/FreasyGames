/* =====================================================
   INITIALIZATION
===================================================== */

async function init() {
    if (document.documentElement.classList.contains("phone-device")) return;

    const {
        data
    } =
        await supabaseClient
            .auth
            .getSession();


    if (data.session) {

        await loadUser();

    } else {

        showScreen(
            "authScreen"
        );

    }


    // Auth events run while Supabase holds its session lock. Do not await another
    // auth request here: getUser() inside loadUser() would wait for the same lock.
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session && !currentUser) {
            setTimeout(() => {
                if (!currentUser) void loadUser().catch(error => {
                    console.error("Profile load:", error);
                    document.getElementById("authMessage").textContent = "❌ Не удалось загрузить профиль: " + error.message;
                });
            }, 0);
        }
    });
}

init();
