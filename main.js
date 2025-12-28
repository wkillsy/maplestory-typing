/* =====================
   状態管理
===================== */
let state = "MENU";
let selectIndex = 0;
let mode = null;
let difficulty = null;

let dict = [];
let gameData = [];
let questions = [];

let romanCandidates = [];
let charIndex = 0;
let inputBuffer = "";
let missCount = 0;
let startTime = 0;

/* =====================
   定数
===================== */
const GAME_MODES = ["JP_ROMA", "KR_JP_ROMA"];
const DIFF_MAP = {
  EASY: [1],
  NORMAL: [1, 2],
  HARD: [1, 2, 3]
};

/* =====================
   JSON 読込
===================== */
Promise.all([
  fetch("data/romanTypingParseDictionary.json").then(r => r.json()),
  fetch("data/maple_typing_game_data.json").then(r => r.json())
]).then(([d, g]) => {
  dict = buildDict(d);
  gameData = Object.values(g).flat();
});

/* =====================
   辞書構築（最長一致）
===================== */
function buildDict(json) {
  return json
    .map(e => ({
      pattern: Array.from(e.Pattern),
      roman: e.TypePattern
    }))
    .sort((a, b) => b.pattern.length - a.pattern.length);
}

/* =====================
   ひらがな → ローマ字候補列
===================== */
function buildRomanCandidates(hiraArr) {
  const result = [];
  let i = 0;

  while (i < hiraArr.length) {
    let matched = false;

    for (const d of dict) {
      const slice = hiraArr.slice(i, i + d.pattern.length);
      if (
        slice.length === d.pattern.length &&
        slice.every((c, idx) => c === d.pattern[idx])
      ) {
        result.push([...d.roman]);
        i += d.pattern.length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      result.push([hiraArr[i]]);
      i++;
    }
  }
  return result;
}

/* =====================
   画面制御
===================== */
function show(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function updateMenu(listId) {
  document.querySelectorAll(`#${listId} li`).forEach((li, i) => {
    li.classList.toggle("selected", i === selectIndex);
  });
}

/* =====================
   キー入力
===================== */
document.addEventListener("keydown", e => {
  if (state === "MENU") menuKey(e);
  else if (state === "DIFF") diffKey(e);
  else if (state === "GAME") gameKey(e);
  else if (state === "RESULT" && e.key === "Enter") {
    state = "MENU";
    selectIndex = 0;
    show("screen-menu");
    updateMenu("menu-list");
  }
});

/* =====================
   MENU
===================== */
function menuKey(e) {
  const items = document.querySelectorAll("#menu-list li");

  if (e.key === "ArrowDown") selectIndex = (selectIndex + 1) % items.length;
  if (e.key === "ArrowUp") selectIndex = (selectIndex - 1 + items.length) % items.length;

  if (e.key === "Enter") {
    mode = items[selectIndex].dataset.mode;
    if (GAME_MODES.includes(mode)) {
      state = "DIFF";
      selectIndex = 0;
      show("screen-difficulty");
      updateMenu("difficulty-list");
      return;
    }
    state = "WIP";
    show("screen-wip");
  }
  updateMenu("menu-list");
}

/* =====================
   DIFFICULTY
===================== */
function diffKey(e) {
  const items = document.querySelectorAll("#difficulty-list li");

  if (e.key === "ArrowDown") selectIndex = (selectIndex + 1) % items.length;
  if (e.key === "ArrowUp") selectIndex = (selectIndex - 1 + items.length) % items.length;

  if (e.key === "Escape") {
    state = "MENU";
    selectIndex = 0;
    show("screen-menu");
    updateMenu("menu-list");
  }

  if (e.key === "Enter") {
    difficulty = items[selectIndex].dataset.diff;
    startGame();
  }
  updateMenu("difficulty-list");
}

/* =====================
   GAME START
===================== */
function startGame() {
  state = "GAME";
  show("screen-game");

  const pool = gameData.filter(q =>
    DIFF_MAP[difficulty].includes(q.difficulty)
  );

  questions = pool.sort(() => Math.random() - 0.5).slice(0, 10);
  missCount = 0;
  startTime = performance.now();
  nextQuestion();
}

/* =====================
   QUESTION
===================== */
function nextQuestion() {
  const q = questions.shift();

  romanCandidates = buildRomanCandidates(q.jp_hiragana);
  charIndex = 0;
  inputBuffer = "";

  document.getElementById("q-main").textContent = q.jp_display;
  document.getElementById("q-sub").textContent = q.kr_display;
  updateTyping();
}

/* =====================
   TYPING
===================== */
function gameKey(e) {
  if (e.key.length !== 1) return;

  inputBuffer += e.key;
  const list = romanCandidates[charIndex];
  const matched = list.filter(r => r.startsWith(inputBuffer));

  if (matched.length === 0) {
    missCount++;
    inputBuffer = inputBuffer.slice(0, -1);
    return;
  }

  romanCandidates[charIndex] = matched;

  if (matched.includes(inputBuffer)) {
    charIndex++;
    inputBuffer = "";
    if (charIndex >= romanCandidates.length) {
      if (questions.length === 0) return endGame();
      nextQuestion();
    }
  }
  updateTyping();
}

function updateTyping() {
  const typed = romanCandidates.slice(0, charIndex).map(c => c[0]).join("");
  const remain = romanCandidates.slice(charIndex).map(c => c[0]).join("");

  document.getElementById("typed").textContent = typed + inputBuffer;
  document.getElementById("remain").textContent = remain.slice(inputBuffer.length);
  document.getElementById("status-miss").textContent = `Miss: ${missCount}`;
}

/* =====================
   RESULT
===================== */
function endGame() {
  state = "RESULT";
  show("screen-result");

  const time = (performance.now() - startTime) / 1000;
  const keys = document.getElementById("typed").textContent.length;

  document.getElementById("result-kps").textContent =
    `Key/sec: ${(keys / time).toFixed(2)}`;
  document.getElementById("result-miss").textContent =
    `Miss: ${missCount}`;
}

/* 初期 */
updateMenu("menu-list");
