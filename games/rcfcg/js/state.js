let registrationMode = false;
let currentUser = null;
let stats = { bestPercentage: 0, dominantColor: "white", totalPlaySeconds: 0, cubesCompleted: 0, bestColors: [] };
let playTimer = null;
let lastPlaySave = Date.now();
let savingStats = false;

let cubes = [];
let addingCube = false;

let donutBoostActive = false;

let autoClickActive = false;
let autoClickTimer = null;
let lastAutoClickTime = 0;
