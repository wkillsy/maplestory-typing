const screens = {
  menu: document.getElementById("screen-menu"),
  difficulty: document.getElementById("screen-difficulty"),
  wip: document.getElementById("screen-wip"),
  game: document.getElementById("screen-game"),
  result: document.getElementById("screen-result")
};

let state = "menu";
let menuIndex = 0;
let difficultyIndex = 0;

let questions = [];
let current = 0;
let miss = 0;
let startTime = 0;

// ---------- 画面制御 ----------
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.add("hidden"));
  screens[name].classList.remove("hidden");
  state = name;
}

// ---------- メニュー操作 ----------
const menuItems = screens.menu.querySelectorAll(".menu li");
menuItems[0].classList.add("active");

document.addEventListener("keydown", e => {
  if (state === "menu") handleMenu(e);
  else if (state === "difficulty") handleDifficulty(e);
});

function handleMenu(e) {
  menuItems[menuIndex].classList.remove("active");

  if (e.key === "ArrowDown") menuIndex = (menuIndex + 1) % menuItems.length;
  if (e.key === "ArrowUp") menuIndex = (menuIndex - 1 + menuItems.length) % menuItems.length;

  if (e.key === "Enter") {
    const mode = menuItems[menuIndex].dataset.mode;
    if (mode === "ko-ja") showScreen("difficulty");
    else showScreen("wip");
  }

  menuItems[menuIndex].classList.add("active");
}

// ---------- 難易度 ----------
const diffItems = screens.difficulty.querySelectorAll(".menu li");
diffItems[0].classList.add("active");

function handleDifficulty(e) {
  diffItems[difficultyIndex].classList.remove("active");

  if (e.key === "ArrowDown") difficultyIndex = (difficultyIndex + 1) % diffItems.length;
  if (e.key === "ArrowUp") difficultyIndex = (difficultyIndex - 1 + diffItems.length) % diffItems.length;

  if (e.key === "Enter") startGame();

  diffItems[difficultyIndex].classList.add("active");
}

// ---------- ゲーム ----------
const questionEl = document.getElementById("question");
const typedEl = document.getElementById("typed");
const input = document.getElementById("input");

async function startGame() {
  showScreen("game");

  const res = await fetch("data/questions_ko_ja_easy.json");
  questions = await res.json();

  current = 0;
  miss = 0;
  startTime = performance.now();

  loadQuestion();
}

function loadQuestion() {
  input.value = "";
  typedEl.textContent = "";
  questionEl.textContent = questions[current].ko;
  input.focus();
}

input.addEventListener("input", () => {
  const q = questions[current];
  const v = input.value.toLowerCase();

  if (!q.romaji.some(r => r.startsWith(v))) {
    miss++;
    input.value = "";
    return;
  }

  typedEl.textContent = v;

  if (q.romaji.includes(v)) {
    current++;
    if (current >= questions.length) endGame();
    else loadQuestion();
  }
});

// ---------- 結果 ----------
function endGame() {
  showScreen("result");
  const time = (performance.now() - startTime) / 1000;
  const keys = questions.map(q => q.romaji[0].length).reduce((a,b)=>a+b,0);
  const kps = (keys / time).toFixed(2);

  document.getElementById("score").textContent =
    `Key/sec: ${kps} | Miss: ${miss}`;
}
