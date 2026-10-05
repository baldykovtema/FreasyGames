/* =====================================================
   GAME DATA
===================================================== */

const locations = [

    {
        name: "☀️ Дневной сад",
        icon: "🌻",
        from: 1,
        to: 10
    },

    {
        name: "🌙 Ночной сад",
        icon: "🌙",
        from: 11,
        to: 20
    },

    {
        name: "🏊 Дневной бассейн",
        icon: "🏊",
        from: 21,
        to: 30
    },

    {
        name: "🌙🏊 Ночной бассейн",
        icon: "🌙",
        from: 31,
        to: 40
    },

    {
        name: "🏠 Крыша",
        icon: "🏠",
        from: 41,
        to: 50
    }

];


const plants = [

    {
        id: "peashooter",
        name: "Горохострел",
        emoji: "🌱",
        cost: 100,
        unlock: 1
    },

    {
        id: "sunflower",
        name: "Подсолнух",
        emoji: "🌻",
        cost: 50,
        unlock: 2
    },

    {
        id: "wallnut",
        name: "Орех",
        emoji: "🌰",
        cost: 50,
        unlock: 3
    },

    {
        id: "potatomine",
        name: "Картофельная мина",
        emoji: "🥔",
        cost: 75,
        unlock: 4
    },

    {
        id: "cherry",
        name: "Вишнёвая бомба",
        emoji: "🍒",
        cost: 150,
        unlock: 5
    },

    {
        id: "icepea",
        name: "Ледяной горох",
        emoji: "🧊",
        cost: 175,
        unlock: 6
    },

    {
        id: "repeater",
        name: "Двойной горох",
        emoji: "🫘",
        cost: 200,
        unlock: 7
    },

    {
        id: "cactus",
        name: "Кактус",
        emoji: "🌵",
        cost: 125,
        unlock: 8
    },

    {
        id: "corn",
        name: "Кукурузник",
        emoji: "🌽",
        cost: 100,
        unlock: 9
    },

    {
        id: "firepea",
        name: "Огненный горох",
        emoji: "🔥",
        cost: 225,
        unlock: 10
    },

    {
        id: "mushroom",
        name: "Гриб",
        emoji: "🍄",
        cost: 75,
        unlock: 11
    },

    {
        id: "bokchoy",
        name: "Бок-чой",
        emoji: "🥬",
        cost: 125,
        unlock: 12
    },

    ...[
        ["snowpea", "Снежный горох", "❄️", 150],
        ["torchwood", "Факел-дерево", "🪵", 175],
        ["spikeweed", "Колючка", "🌿", 100],
        ["tallnut", "Высокий орех", "🌳", 125],
        ["garlic", "Чеснок", "🧄", 50],
        ["squash", "Тыква", "🎃", 125],
        ["jalapeno", "Перец халапеньо", "🌶️", 150],
        ["lily", "Кувшинка", "🪷", 25],
        ["cattail", "Кошачий хвост", "🐈", 225],
        ["starfruit", "Звёздный плод", "⭐", 125],
        ["splitpea", "Раздвоенный горох", "🫛", 125],
        ["threepeater", "Тройной горох", "🌱", 300],
        ["melonpult", "Арбузная катапульта", "🍉", 300],
        ["kernelpult", "Кукурузная катапульта", "🌽", 100],
        ["bloomerang", "Бумеранг", "🍃", 175],
        ["magnetshroom", "Магнитный гриб", "🧲", 100],
        ["fumeshroom", "Дымный гриб", "💨", 75],
        ["sunshroom", "Солнечный гриб", "🍄", 25],
        ["hypnoshroom", "Гипно-гриб", "🌀", 75],
        ["doomshroom", "Гриб-бомба", "💣", 125],
        ["scaredyshroom", "Пугливый гриб", "😱", 25],
        ["plantern", "Фонарь", "🏮", 25],
        ["cabbagepult", "Капустная катапульта", "🥬", 100],
        ["wintermelon", "Зимний арбуз", "🍈", 200],
        ["spikerock", "Шипастый камень", "🪨", 125],
        ["imitater", "Подражатель", "🎭", 150],
        ["umbrellaleaf", "Зонтичный лист", "☂️", 100],
        ["flowerpot", "Горшок", "🪴", 25],
        ["coffee", "Кофейное зерно", "☕", 75],
        ["seashroom", "Морской гриб", "🪸", 50],
        ["tanglekelp", "Водоросль", "🌊", 25],
        ["marigold", "Бархатцы", "🌼", 50],
        ["twinflower", "Парный подсолнух", "🌻", 125],
        ["pepperpult", "Перечная катапульта", "🫑", 150],
        ["electricpea", "Электрический горох", "⚡", 250],
        ["moonflower", "Лунный цветок", "🌙", 75],
        ["primalpea", "Первобытный горох", "🪴", 225],
        ["primalwallnut", "Первобытный орех", "🌰", 125]
    ].map(([id, name, emoji, cost], index) => ({id, name, emoji, cost, unlock: index + 13}))
];

function getUnlockedLevelCap(level = currentLevel) {
    return Math.max(1, level || 1, profile?.unlocked_level || 0);
}

function getUnlockedPlantIds(level = currentLevel) {
    const cap =
        getUnlockedLevelCap(level);

    return plants
        .filter(plant => plant.unlock <= cap)
        .map(plant => plant.id);
}

function filterUnlockedPlants(ids, level = currentLevel) {
    const unlocked =
        new Set(getUnlockedPlantIds(level));

    return (ids || [])
        .filter(id => unlocked.has(id));
}


const zombieTypes = [

    {
        name: "Обычный",
        emoji: "🧟",
        hp: 100,
        speed: .35
    },

    {
        name: "Быстрый",
        emoji: "🏃🧟",
        hp: 75,
        speed: .65
    },

    {
        name: "Ведёрный",
        emoji: "🪣🧟",
        hp: 250,
        speed: .25
    },

    {
        name: "Сильный",
        emoji: "💪🧟",
        hp: 400,
        speed: .2
    }

];

const difficulties = [

    {
        id: "easy",
        emoji: "🟢",
        name: "Лёгкий"
    },

    {
        id: "medium",
        emoji: "🟡",
        name: "Средний"
    },

    {
        id: "hard",
        emoji: "🟠",
        name: "Сложный"
    },

    {
        id: "insane",
        emoji: "🔴",
        name: "Безумный"
    },

    {
        id: "impossible",
        emoji: "💀",
        name: "Невозможный"
    },

    {
        id: "infinite",
        emoji: "♾️",
        name: "Бесконечный"
    }

];
