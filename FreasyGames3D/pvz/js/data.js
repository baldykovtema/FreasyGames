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

// Every plant has an explicit role; support plants never fire generic peas.
const plantAbilities = {
peashooter: ['●','Горох: 20 урона',20], sunflower: ['','Производит солнце'],
wallnut: ['','Прочная преграда'], potatomine: ['','Взрывается после подготовки'], cherry: ['','Взрыв 3 × 3'],
icepea: ['❄','Замедляет на 3 секунды',20], repeater: ['●','Два горошка за атаку',20],
cactus: ['➤','Иглы пробивают до трёх зомби',30], corn: ['🌽','Зёрна и оглушающее масло',25],
firepea: ['🔥','Поджигает цель',45], mushroom: ['🟣','Споры на короткую дистанцию',25],
bokchoy: ['🥊','Ближний бой в обе стороны',50], snowpea: ['❄','Сильное замедление',20],
torchwood: ['','Поджигает пролетающий горох'], spikeweed: ['','Повреждает проходящих зомби'],
tallnut: ['','Очень прочная преграда'], garlic: ['','Переводит укусившего зомби в другой ряд'],
squash: ['','Давит ближайшую группу'], jalapeno: ['','Сжигает весь ряд'], lily: ['','Поддержка: ускоряет соседей у воды'],
cattail: ['➶','Самонаводящиеся шипы в любой ряд',30], starfruit: ['⭐','Звёзды в пять направлений',25],
splitpea: ['●','Стреляет вперёд и назад',20], threepeater: ['●','Стреляет в три ряда',20],
melonpult: ['🍉','Арбуз с уроном по площади',55], kernelpult: ['🌽','Зерно или оглушающее масло',25],
bloomerang: ['🪃','Бумеранг пробивает и возвращается',25], magnetshroom: ['','Снимает металлическое ведро'],
fumeshroom: ['💨','Дым пробивает всех на короткой дистанции',35], sunshroom: ['','Растёт и производит больше солнца'],
hypnoshroom: ['','Обращает укусившего зомби против остальных'], doomshroom: ['','Мощный взрыв в пяти рядах'],
scaredyshroom: ['🟣','Дальние споры; прячется от близких зомби',20], plantern: ['','Освещает и усиливает соседей'],
cabbagepult: ['🥬','Капуста навесом',40], wintermelon: ['🍈','Ледяной взрыв по площади',50],
spikerock: ['','Прочные шипы с двойным уроном'], imitater: ['','Превращается в соседнее растение'],
umbrellaleaf: ['','Снижает урон соседям'], flowerpot: ['','Укрепляет соседей на крыше'],
coffee: ['','Ускоряет соседние грибы'], seashroom: ['🫧','Короткая атака пузырьками',30],
tanglekelp: ['','Утягивает ближайшего зомби'], marigold: ['','Периодически приносит 50 солнца'],
twinflower: ['','Производит два солнца'], pepperpult: ['🫑','Огненный взрыв по площади',40],
electricpea: ['⚡','Молния перескакивает на соседей',45], moonflower: ['','Даёт солнце и ускоряет соседей ночью'],
primalpea: ['🟤','Отбрасывает и оглушает',40], primalwallnut: ['','Прочная броня с восстановлением']
};
for (const plant of plants) {
    const [shot, description, damage = 0] = plantAbilities[plant.id];
    Object.assign(plant, {shot, description, damage});
}
function getBattleLocation() {
    if (gameMode === "sandbox") return sandboxLocation;
    if (gameMode === "mini") return activeMiniGame === "night" ? 1 : 0;
    return Math.min(4, Math.max(0, Math.floor((currentLevel - 1) / 10)));
}
