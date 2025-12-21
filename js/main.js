const input = document.getElementById("input");
const questionEl = document.getElementById("question");
const resultEl = document.getElementById("result");
const answerJa = document.getElementById("answer-ja");
const answerImg = document.getElementById("answer-image");

/**
 * 仮の問題データ（あとで JSON 化）
 */
const question = {
  ko: "라라",
  ja: "ララ",
  romaji: ["rara"],
  image: "apple.webp"
};

let solved = false;

// 初期表示
questionEl.textContent = question.ko;

/**
 * 入力監視（Enter不要）
 */
input.addEventListener("input", () => {
  if (solved) return;

  const value = input.value.toLowerCase();

  // 途中一致チェック（寿司打的）
  const isPrefix = question.romaji.some(r =>
    r.startsWith(value)
  );

  // どの正解にも一致しない → ミス
  if (!isPrefix) {
    input.value = "";
    return;
  }

  // 完全一致 → 正解
  if (question.romaji.includes(value)) {
    solved = true;
    showResult();
  }
});

/**
 * 正解時の処理
 */
function showResult() {
  answerJa.textContent = question.ja;
  answerImg.src = `images/${question.image}`;

  resultEl.hidden = false;
  input.disabled = true;
}
