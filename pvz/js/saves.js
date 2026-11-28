async function showSaves() {

    showScreen(
        "savesScreen"
    );


    await renderSaves();

}


async function renderSaves() {

    const grid =
        document.getElementById(
            "saveGrid"
        );


    grid.innerHTML = "";


    const {
        data,
        error
    } =
        await supabaseClient
            .from("infinite_saves")
            .select("*")
            .eq(
                "user_id",
                currentUser.id
            )
            .order(
                "slot"
            );


    if (error) {

        console.error(error);

        alert(
            "❌ Ошибка загрузки сохранений: " +
            error.message
        );

        return;

    }


    for (
        let slot = 1;
        slot <= 3;
        slot++
    ) {

        const save =
            data?.find(
                x =>
                    x.slot === slot
            );


        const box =
            document.createElement(
                "div"
            );


        box.className =
            "save";


        if (!save) {

            box.innerHTML = `

                <h2>
                    Слот ${slot}
                </h2>

                <p>
                    Пусто
                </p>

                <button
                    class="primary"
                    onclick="newInfiniteGame(${slot})">

                    🌱 Новая игра

                </button>

            `;

        } else {

            const wave =
                save.save_data?.wave || 1;


            const savedSun =
                save.save_data?.sun ?? 125;


            box.innerHTML = `

                <h2>
                    Слот ${slot}
                </h2>

                <p>
                    🌊 Волна: ${wave}
                </p>

                <p>
                    ☀️ Солнце: ${savedSun}
                </p>

                <button
                    class="primary"
                    onclick="continueInfinite(${slot})">

                    ▶️ Продолжить

                </button>

                <button
                    class="secondary danger"
                    style="width:100%;margin-top:8px"
                    onclick="deleteSave(${slot})">

                    🗑️ Удалить сохранение

                </button>

            `;

        }


        grid.appendChild(
            box
        );

    }

}


async function newInfiniteGame(slot) {
    if (savingGame) return;
    gameMode = "infinite";
    infiniteSlot = slot;
    currentLevel = Math.max(1, profile?.unlocked_level || 1);
    const pool = getUnlockedPlantIds(currentLevel);
    openPlantSelection({
        title: `Бесконечная игра • слот ${slot}`,
        description: "Выбери растения для начала. Состав можно будет изменить после каждой десятой волны.",
        pool,
        limit: Math.min(6, pool.length),
        startText: "🎮 НАЧАТЬ БЕСКОНЕЧНУЮ ИГРУ",
        onStart: async () => {
            if (savingGame) return;
            savingGame = true;
            try {
                const saveData = {version: 1, wave: 1, sun: 125, plants: [], zombies: [], sunDrops: [],
                    selectedPlants: [...selectedPlants], location: "infinite"};
                if (await saveInfinite(slot, saveData)) startGame(saveData);
            } finally {
                savingGame = false;
            }
        },
        onCancel: () => showSaves()
    });
}


async function continueInfinite(slot) {
    if (savingGame) return;
    savingGame = true;
    try {
        const {data, error} = await supabaseClient.from("infinite_saves").select("*")
            .eq("user_id", currentUser.id).eq("slot", slot).single();
        if (error || !data?.save_data) {
            alert("❌ Не удалось загрузить сохранение.");
            return;
        }
        const saved = data.save_data;
        gameMode = "infinite";
        infiniteSlot = slot;
        selectedPlants = filterUnlockedPlants(saved.selectedPlants, profile?.unlocked_level || 1);
        if (!selectedPlants.length) selectedPlants = getUnlockedPlantIds(profile?.unlocked_level || 1).slice(0, 2);
        currentLevel = Math.max(1, profile?.unlocked_level || 1);
        const savedRoster = [...selectedPlants];
        openPlantSelection({
            title: `Бесконечная игра • слот ${slot}`,
            description: `Волна ${saved.wave || 1}. Выбери растения для продолжения.`,
            pool: getUnlockedPlantIds(currentLevel),
            selected: savedRoster,
            limit: 10,
            startText: "▶️ ПРОДОЛЖИТЬ",
            onStart: () => startGame({...saved, selectedPlants: [...selectedPlants]}),
            onCancel: () => showSaves()
        });
    } finally {
        savingGame = false;
    }
}


async function saveInfinite(slot, saveData) {
    try {
        const {error} = await supabaseClient.from("infinite_saves").upsert({
            user_id: currentUser.id, slot, save_data: saveData
        }, {onConflict: "user_id,slot"});
        if (error) throw error;
        return true;
    } catch (error) {
        console.error(error);
        alert("❌ Ошибка сохранения: " + error.message);
        return false;
    }
}


async function deleteSave(slot) {

    if (
        !await confirm(
            `Удалить ВСЕ данные слота ${slot}?`
        )
    ) {

        return;

    }


    const {
        error
    } =
        await supabaseClient
            .from("infinite_saves")
            .delete()
            .eq(
                "user_id",
                currentUser.id
            )
            .eq(
                "slot",
                slot
            );


    if (error) {

        alert(
            "❌ Ошибка удаления: " +
            error.message
        );

        return;

    }


    await renderSaves();

}
