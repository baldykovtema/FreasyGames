const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

createCube();
updateLayout();
updateButtons();

requestAnimationFrame(() => {
    if (cubes[0]) {
        resizeCube(cubes[0]);
        animateCube(cubes[0]);
    }
});

window.addEventListener("beforeunload", () => {
    if (currentUser) savePlayerStats();
});

checkSession();