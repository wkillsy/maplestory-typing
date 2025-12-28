/* ===== 状態 ===== */
let state = "MENU";
let selectedIndex = 0;
let selectedMode = null;
let selectedDifficulty = null;

let dict = [];
let gameData = [];

let questions = [];
let currentQ = 0;
let missCount = 0;
let startTime = 0;

/* ===== 定数 ===== */
const MODES_WITH_GAME = ["JP_ROMA", "KR_JP_ROMA"];
const DIFF_FILTER = {
  EASY: [1],
  NORMAL: [1, 2],
  HARD: [1, 2, 3]
};

/* ===== JSON読込 ===== */
Promise.all([
  fetch("data/romanTypingParseDictionary.json").then(r => r.json()),
  fetch("data/maple_typing_game_data.json").then(r => r.json())
]).then(([d, g]) => {
  dict = d;
  gameData = g;
});

/* ===== 画面切替 ===== */
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

/* ===== メニュー制御 ===== */
function updateMenu() {
  document.querySelectorAll(".menu").forEach(menu => {
    const items = menu.querySelectorAll("li");
    items.forEach((li, i) => {
      li.classList.toggle("selected", i === selectedIndex);
    });
  });
}

/* ===== キー入力 ===== */
document.addEventListener("keydown", e => {
  if (state === "MENU") handleMenu(e);
  else if (state === "DIFF") handleDiff(e);
  else if (state === "GAME") handleGame(e);
  else if (state === "RESULT") {
    if (e.key === "Enter") {
      state = "MENU";
      selectedIndex = 0;
      showScreen("screen-menu");
      updateMenu();
    }
  }
});

/* ===== メニュー処理 ===== */
function handleMenu(e) {
  const items = document.querySelectorAll("#screen-menu .menu li");

  if (e.key === "ArrowDown") selectedIndex = (selectedIndex + 1) % items.length;
  if (e.key === "ArrowUp") selectedIndex = (selectedIndex - 1 + items.length) % items.length;

  if (e.key === "Enter") {
    selectedMode = items[selectedIndex].dataset.mode;

    if (MODES_WITH_GAME.includes(selectedMode)) {
      state = "DIFF";
      selectedIndex = 0;
      showScreen("screen-difficulty");
    } else {
      state = "WIP";
      showScreen("screen-wip");
    }
  }
  updateMenu();
}

/* ===== 難易度処理 ===== */
function handleDiff(e) {
  const items = document.querySelectorAll("#screen-difficulty .menu li");

  if (e.key === "ArrowDown") selectedIndex = (selectedIndex + 1) % items.length;
  if (e.key === "ArrowUp") selectedIndex = (selectedIndex - 1 + items.length) % items.length;

  if (e.key === "Escape") {
    state = "MENU";
    selectedIndex = 0;
    showScreen("screen-menu");
  }

  if (e.key === "Enter") {
    selectedDifficulty = items[selectedIndex].dataset.diff;
    startGame();
  }
  updateMenu();
}

/* ===== ゲーム開始 ===== */
function startGame() {
  state = "GAME";
  showScreen("screen-game");

  const diffs = DIFF_FILTER[selectedDifficulty];
  const pool = gameData.filter(q => diffs.includes(q.difficulty));

  questions = pool.sort(() => Math.random() - 0.5).slice(0, 10);
  currentQ = 0;
  missCount = 0;
  startTime = performance.now();

  loadQuestion();
}

/* ===== 問題表示 ===== */
function loadQuestion() {
  const q = questions[currentQ];
  document.getElementById("display-main").textContent = q.jp_display;
  document.getElementById("display-sub").textContent = q.kr_display;
  document.getElementById("typed").textContent = "";
  document.getElementById("remain").textContent = q.jp_hiragana;
}

/* ===== 入力処理（仮：ローマ字処理は後で接続） ===== */
function handleGame(e) {
  if (e.key.length !== 1) return;

  const remain = document.getElementById("remain");
  if (e.key === remain.textContent[0]) {
    document.getElementById("typed").textContent += e.key;
    remain.textContent = remain.textContent.slice(1);

    if (remain.textContent.length === 0) {
      currentQ++;
      if (currentQ >= questions.length) endGame();
      else loadQuestion();
    }
  } else {
    missCount++;
  }
}

/* ===== 終了 ===== */
function endGame() {
  state = "RESULT";
  showScreen("screen-result");

  const time = (performance.now() - startTime) / 1000;
  const totalKeys = questions.reduce((a, q) => a + q.jp_hiragana.length, 0);

  document.getElementById("result-kps").textContent =
    `Key/sec: ${(totalKeys / time).toFixed(2)}`;
  document.getElementById("result-miss").textContent =
    `Miss: ${missCount}`;
}

/* 初期表示 */
showScreen("screen-menu");
updateMenu();
