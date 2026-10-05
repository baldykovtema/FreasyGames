/* =====================================================
   STATE
===================================================== */

let currentUser = null;
let profile = null;

let currentLevel = 1;

let selectedPlants = [];

let sun = 125;
let playerSuns = {};

let shovelMode = false;

let boardPlants = [];

let zombies = [];

let gameTimer = null;
let spawnTimer = null;
let sunTimer = null;

let currentWave = 1;
let activePlantId = null;
let gameMode = "campaign";
let infiniteSlot = null;
let gameRunning = false;
let waveSpawned = 0;
let spawnElapsed = 0;
let sunElapsed = 0;
let sunDrops = [];
let attackEvents = [];
let renderedAttackEvents = new Set();
let lastPointerX = 0;
let lastPointerY = 0;
let activeMiniGame = null;
let plantSelectionPool = [];
let plantSelectionLimit = 10;
let plantSelectionStart = null;
let plantSelectionCancel = null;
let matchPlantSelections = {};
let endingGame = false;
let savingGame = false;
let autosaveTimer = null;
let audioContext = null;
let soundEnabled = true;
try {
    soundEnabled = window.localStorage?.getItem("pvzSoundEnabled") !== "false";
} catch {}
let lobbyPollTimer = null;
let matchChannel = null;
let matchTimer = null;
let matchPlayers = [];
let matchPeers = new Set();
let matchStarting = false;
let matchRevision = 0;
let lastMatchRevision = -1;
let lastMatchMessage = 0;
let matchConnectedAt = 0;
let matchBroadcastBusy = false;
let lobbyRenderBusy = false;
let leavingLobby = false;

let currentLobby = null;
let currentLobbyPlayerId = null;

let lobbyChannel = null;

let onlineChannel = null;
let inviteChannel = null;
let inviteBusy = false;

let matchSubscribed = false;
let matchTickBusy = false;
let lastMatchHello = 0;
let joiningLobby = false;
let readyBusy = false;
