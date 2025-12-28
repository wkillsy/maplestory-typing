let dict = [];
let gameData = {};
let current = null;
let expected = [];
let buffer = "";
let mode = "kr";

Promise.all([
  fetch("romanTypingParseDictionary.json").then(r => r.json()),
  fetch("maple_typing_game_data.json").then(r => r.json())
]).then(([d, g]) => {
  dict = buildPatternList(d);
  gameData = g;
  nextQuestion();
});

function buildPatternList(raw) {
  const list = [];
  raw.forEach(e => {
    e.TypePattern.forEach(t => {
      list.push({ type: t, pattern: e.Pattern });
    });
  });
  return list.sort((a, b) => b.type.length - a.type.length);
}

function nextQuestion() {
  const categories = Object.keys(gameData);
  const cat = categories[Math.floor(Math.random() * categories.length)];
  const q = gameData[cat][Math.floor(Math.random() * gameData[cat].length)];

  current = q;
  expected = q.jp_hiragana.slice(); // ← 配列
  buffer = "";

  document.getElementById("question").textContent =
    mode === "kr" ? q.kr_display : q.jp_display;

  document.getElementById("answer").textContent = q.jp_display;
  updateView();
}

function updateView() {
  document.getElementById("typed").textContent =
    current.jp_hiragana.slice(0, current.jp_hiragana.length - expected.length).join("");

  document.getElementById("remain").textContent = expected.join("");
}

document.addEventListener("keydown", e => {
  if (!current) return;
  if (e.key.length !== 1) return;

  buffer += e.key.toLowerCase();

  for (const p of dict) {
    if (buffer.endsWith(p.type)) {
      buffer = buffer.slice(0, -p.type.length);

      if (expected[0] === p.pattern) {
        expected.shift();
        document.getElementById("log").textContent = "✓";
      } else {
        document.getElementById("log").textContent = "✗";
      }

      updateView();

      if (expected.length === 0) {
        setTimeout(nextQuestion, 500);
      }
      return;
    }
  }
});

document.querySelectorAll("#mode button").forEach(btn => {
  btn.onclick = () => {
    mode = btn.dataset.mode;
    nextQuestion();
  };
});
