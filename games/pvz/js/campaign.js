/* =====================================================
   MAP
===================================================== */

function renderMap() {

    const container =
        document.getElementById("locations");


    container.innerHTML = "";


    locations.forEach(location => {

        const box =
            document.createElement("div");


        box.className =
            "location";


        box.innerHTML = `

            <h2>
                ${location.icon}
                ${location.name}
            </h2>

            <div class="levels"></div>

        `;


        const levels =
            box.querySelector(".levels");


        for (
            let level = location.from;
            level <= location.to;
            level++
        ) {

            const button =
                document.createElement("button");


            button.className =
                "level";


            const unlocked =
                level <= Math.max(

                    1,

                    (profile?.unlocked_level || 0)
                    + 1

                );


            button.disabled =
                !unlocked;


            button.textContent =
                unlocked
                    ? level
                    : "🔒";


            if (unlocked) {

                button.onclick =
                    () => chooseLevel(level);

            }


            levels.appendChild(button);

        }


        container.appendChild(box);

    });

}

/* =====================================================
   LEVEL
===================================================== */

function chooseLevel(level) {

    gameMode = "campaign";
    infiniteSlot = null;
    currentLevel =
        level;


    openPlantSelection({
        title: `Уровень ${level}`,
        description: `${getLocationForLevel(level)} • ${getWaveLimit()} волн зомби`,
        selected: [],
        pool: getUnlockedPlantIds(level),
        limit: 10,
        startText: "🎮 НАЧАТЬ УРОВЕНЬ",
        onStart: () => startGame(),
        onCancel: () => showMap()
    });

}


function getLocationForLevel(level) {

    const location =
        locations.find(

            l =>
                level >= l.from &&
                level <= l.to

        );


    return location
        ? location.name
        : "Локация";

}

/* =====================================================
   PLANTS
===================================================== */

function renderPlants() {

    const grid =
        document.getElementById("plantGrid");


    grid.innerHTML = "";


    plants.forEach(plant => {

        const unlocked = plantSelectionPool.includes(plant.id);


        const card =
            document.createElement("div");


        card.className =
            "plant" +
            (!unlocked ? " locked" : "");


        if (
            selectedPlants
                .includes(plant.id)
        ) {

            card.classList.add("selected");

        }


        card.innerHTML = `

            <div class="big">
                ${plant.emoji}
            </div>

            <b>
                ${plant.name}
            </b>

            <div>
                ☀️ ${plant.cost}
            </div>

            ${
                unlocked
                    ? "<small>Доступно</small>"
                    : `<small>${plant.unlock > getUnlockedLevelCap(currentLevel) ? `🔒 Уровень ${plant.unlock}` : "Недоступно в этом режиме"}</small>`
            }

        `;


        if (unlocked) {

            card.onclick =
                () => togglePlant(plant.id);

        }


        grid.appendChild(card);

    });


    updateSelectedCount();

}


function togglePlant(id) {

    if (
        selectedPlants
            .includes(id)
    ) {

        selectedPlants =
            selectedPlants.filter(
                x => x !== id
            );

    } else {

        if (
            selectedPlants.length >= plantSelectionLimit
        ) {

            alert(
                `Можно выбрать максимум ${plantSelectionLimit} растений.`
            );

            return;
        }


        selectedPlants.push(id);

    }


    renderPlants();

}


function updateSelectedCount() {

    document.getElementById("selectedCount")
        .textContent =
        `Выбрано: ${selectedPlants.length} / ${plantSelectionLimit}`;

}

function openPlantSelection({title, description, selected = [], pool, limit = 10, startText = "🎮 НАЧАТЬ ИГРУ", onStart, onCancel}) {
    plantSelectionPool = [...new Set(pool || getUnlockedPlantIds(currentLevel))];
    plantSelectionLimit = Math.max(1, Math.min(limit, plantSelectionPool.length || 1));
    selectedPlants = (gameMode === "online" ? selected : filterUnlockedPlants(selected, currentLevel)).filter(id => plantSelectionPool.includes(id)).slice(0, plantSelectionLimit);
    plantSelectionStart = onStart;
    plantSelectionCancel = onCancel;
    document.getElementById("selectedLevelTitle").textContent = title;
    document.getElementById("plantDescription").textContent = description;
    document.getElementById("startPlantSelectionButton").textContent = startText;
    document.getElementById("plantSelectionBackButton").hidden = !onCancel;
    renderPlants();
    showScreen("plantsScreen");
}

function confirmPlantSelection() {
    if (!selectedPlants.length) {
        alert("Выбери хотя бы одно растение.");
        return;
    }
    const start = plantSelectionStart;
    plantSelectionStart = null;
    plantSelectionCancel = null;
    start?.();
}

function cancelPlantSelection() {
    const cancel = plantSelectionCancel;
    plantSelectionStart = null;
    plantSelectionCancel = null;
    cancel?.();
}
