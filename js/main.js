/**
 * Maple Typing Game - main.js
 */

const SCREENS = {
    MENU: 'screen-menu',
    DIFFICULTY: 'screen-difficulty',
    READY: 'screen-ready',
    GAME: 'screen-game',
    RESULT: 'screen-result'
};

const DIFFICULTY_SETTINGS = {
    'Easy': { time: 30, hp: 800, comboStep: 50, diffValue: 1 }, // コンボ影響小
    'Normal': { time: 60, hp: 2500, comboStep: 30, diffValue: 2 },
    'Hard': { time: 90, hp: 6000, comboStep: 20, diffValue: 3 }  // コンボ影響大
};

let gameData = null;
let romanDict = new Map();
let currentMode = '韓→日';
let currentDifficulty = 'Normal';
let currentWordPool = [];
let currentWord = null;
let currentHiraganaGroups = [];
let currentGroupIndex = 0;
let currentInputInGroup = "";
let finishTimeValue = 0;

let gameState = {
    maxHp: 1000,
    currentHp: 1000,
    timeLeft: 60,
    isGaming: false,
    timerId: null,
    startTime: 0
};

let score = { keys: 0, miss: 0, damage: 0, combo: 0 };

// データのロード
async function loadData() {
    try {
        const [gRes, dRes] = await Promise.all([
            fetch('data/maple_typing_game_data.json'),
            fetch('data/romanTypingParseDictionary.json')
        ]);
        gameData = await gRes.json();
        const dict = await dRes.json();
        dict.forEach(i => romanDict.set(i.Pattern, i.TypePattern));
        console.log("Data ready.");
    } catch (e) { console.error(e); }
}
loadData();

// 画面遷移
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

// モード選択時の処理
function selectMode(mode) {
    currentMode = mode; // '日→日' などが代入される
    console.log("Selected Mode:", currentMode);
    showScreen(SCREENS.DIFFICULTY);
}
function toTitle() { location.reload(); }

function initReady(diff) {
    currentDifficulty = diff;

    // ★追加：ここで単語プールを作成する
    prepareWordPool(diff);

    // スコアとゲーム状態の初期化
    score = { keys: 0, combo: 0, maxCombo: 0, miss: 0, damage: 0 };

    const settings = DIFFICULTY_SETTINGS[diff];
    gameState.maxHp = settings.hp;
    gameState.currentHp = settings.hp;
    gameState.timeLeft = settings.time;

    // UIをリセット
    updateUI();

    const enemyImg = document.getElementById('enemy-img');
    if (enemyImg) {
        enemyImg.style.filter = "none";
        enemyImg.style.opacity = "1";
    }

    document.getElementById('ready-diff-display').textContent = `Difficulty: ${diff}`;
    showScreen(SCREENS.READY);
}

function prepareWordPool(diffName) {
    const target = DIFFICULTY_SETTINGS[diffName].diffValue;
    let pool = [];
    for (let cat in gameData) {
        pool = pool.concat(gameData[cat].filter(i => {
            if (target === 1) return i.difficulty === 1;
            if (target === 2) return i.difficulty <= 2;
            return i.difficulty <= 3;
        }));
    }
    currentWordPool = pool;
}

/**
 * ゲーム開始処理 (練習モードの判定を追加)
 */
function startGame() {
    const s = DIFFICULTY_SETTINGS[currentDifficulty];

    // 練習モードにチェックが入っているか確認
    const isPractice = document.getElementById('practice-mode').checked;

    Object.assign(gameState, {
        maxHp: s.hp,
        currentHp: s.hp,
        timeLeft: s.time,
        isGaming: true,
        startTime: Date.now(),
        isPractice: isPractice // 練習モードの状態を保存
    });

    score = { keys: 0, miss: 0, damage: 0, combo: 0 };

    showScreen(SCREENS.GAME);
    const inp = document.getElementById('type-input');
    if (inp) inp.focus();

    pickNextWord();
    startTimer();
}

function pickNextWord() {
    if (currentWordPool.length === 0) return;

    let nextWord;

    // 単語の候補が2つ以上ある場合、直前の単語（currentWord）と被らないまで選び直す
    if (currentWordPool.length > 1) {
        do {
            nextWord = currentWordPool[Math.floor(Math.random() * currentWordPool.length)];
        } while (nextWord === currentWord);
    } else {
        // 候補が1つしかない場合は、選びようがないのでそのまま使う
        nextWord = currentWordPool[0];
    }

    // 選んだ単語を現在の単語として保存
    currentWord = nextWord;
    currentGroupIndex = 0;
    currentInputInGroup = "";
    currentHiraganaGroups = parseHiragana(nextWord.jp_hiragana);
    renderTypingDisplay();
}

function parseHiragana(arr) {
    let groups = [];
    let i = 0;
    while (i < arr.length) {
        let match = false;
        for (let len = 3; len >= 1; len--) {
            let sub = arr.slice(i, i + len).join("");
            if (romanDict.has(sub)) {
                groups.push({ hiragana: sub, patterns: [...romanDict.get(sub)] });
                i += len; match = true; break;
            }
        }
        if (!match) { groups.push({ hiragana: arr[i], patterns: [arr[i]] }); i++; }
    }
    return groups;
}

function handleKeyDown(e) {
    if (!gameState.isGaming || e.isComposing) return;
    const key = e.key.toLowerCase();
    if (!/^[a-z0-9-]$/.test(key)) return;
    e.preventDefault();

    let g = currentHiraganaGroups[currentGroupIndex];
    if (!g) return;

    // 「ん」の自動確定
    if (g.hiragana === "ん" && currentInputInGroup === "" && key === "n") {
        const next = currentHiraganaGroups[currentGroupIndex + 1];
        if (next) {
            if (!['a', 'i', 'u', 'e', 'o', 'y', 'n'].includes(next.patterns[0][0])) {
                processCorrect(); currentGroupIndex++; currentInputInGroup = "";
                if (currentGroupIndex >= currentHiraganaGroups.length) pickNextWord();
                renderTypingDisplay(); return;
            }
        }
    }

    const attempt = currentInputInGroup + key;
    const isMatched = g.patterns.some(p => p.startsWith(attempt));

    if (isMatched) {
        currentInputInGroup = attempt;
        processCorrect();
        if (g.patterns.includes(attempt)) { currentGroupIndex++; currentInputInGroup = ""; }
        if (currentGroupIndex >= currentHiraganaGroups.length) pickNextWord();
    } else {
        score.miss++; score.combo = 0; updateUI();
    }
    renderTypingDisplay();
}

function processCorrect() {
    score.keys++;
    score.combo++;

    // 難易度設定から「ステップ数」を取得（なければデフォルト30）
    const step = DIFFICULTY_SETTINGS[currentDifficulty].comboStep || 30;

    // 計算： 基礎10 + (コンボ ÷ ステップ) ※最大+10まで
    let dmg = 10 + Math.min(Math.floor(score.combo / step), 10);

    gameState.currentHp = Math.max(0, gameState.currentHp - dmg);
    score.damage += dmg;

    updateUI();
    showDamage(dmg);

    if (gameState.currentHp <= 0) endGame("Finish!");
}

function showDamage(dmg) {
    const c = document.getElementById('enemy-container');
    const p = document.createElement('div');
    p.className = 'damage-num'; p.textContent = dmg;
    p.style.left = `calc(50% + ${Math.random() * 60 - 30}px)`;
    if (c) c.appendChild(p);
    setTimeout(() => p.remove(), 800);
}

// --- 7. UI表示更新 ---
function updateUI() {
    const f = document.getElementById('hp-fill');
    const t = document.getElementById('hp-text');
    const c = document.getElementById('combo-display');
    if (f) f.style.width = `${(gameState.currentHp / gameState.maxHp) * 100}%`;
    if (t) t.textContent = `${gameState.currentHp} / ${gameState.maxHp}`;
    if (c) c.textContent = `Combo: ${score.combo}`;
}

/**
 * 画面表示の更新 (練習モードのスタイル対応)
 */
function renderTypingDisplay() {
    const g = document.getElementById('kana-guide');
    const d = document.getElementById('display-word');
    if (!currentWord || !g || !d) return;

    // 単語の表示 (日本語か韓国語か)
    d.textContent = (currentMode === '韓→日') ? currentWord.kr_display : currentWord.jp_display;

    // ガイド（親要素）に練習モードに応じたクラスを付与
    if (gameState.isPractice) {
        g.className = "practice-on";  // 灰色で見せる
    } else {
        g.className = "practice-off"; // 透明にする
    }

    let html = "";
    currentHiraganaGroups.forEach((group, idx) => {
        let pattern = group.patterns[0];

        // 現在打っているグループで、入力揺れがあればそれに合わせてガイドを更新
        if (idx === currentGroupIndex && currentInputInGroup.length > 0) {
            pattern = group.patterns.find(p => p.startsWith(currentInputInGroup)) || pattern;
        }

        if (idx < currentGroupIndex) {
            // 【過去のグループ】全て入力済み
            html += `<span class="char-typed">${pattern}</span>`;
        } else if (idx === currentGroupIndex) {
            // 【現在のグループ】一文字ずつ判定
            for (let i = 0; i < pattern.length; i++) {
                const isCorrectChar = i < currentInputInGroup.length;
                const className = isCorrectChar ? "char-typed" : "char-not-typed";
                html += `<span class="${className}">${pattern[i]}</span>`;
            }
        } else {
            // 【未来のグループ】全て未入力
            html += `<span class="char-not-typed">${pattern}</span>`;
        }
    });

    g.innerHTML = html;
}

// --- 8. タイマー・リザルト ---
function startTimer() {
    const dur = gameState.timeLeft * 1000;
    gameState.timerId = setInterval(() => {
        const elap = Date.now() - gameState.startTime;
        const rem = Math.max(0, dur - elap);
        const timeDisplay = document.getElementById('time-display');
        if (timeDisplay) timeDisplay.textContent = `Time: ${(rem / 1000).toFixed(2)}`;
        if (rem <= 0) endGame("Time Up!");
    }, 10);
}

function endGame(msg) {
    gameState.isGaming = false;
    clearInterval(gameState.timerId);

    if (msg === "Time Up!") {
        finishTimeValue = DIFFICULTY_SETTINGS[currentDifficulty].time;
    } else {
        finishTimeValue = ((Date.now() - gameState.startTime) / 1000).toFixed(2);
    }

    const b = document.createElement('div');
    b.id = "finish-banner";
    b.textContent = msg;
    document.body.appendChild(b);

    setTimeout(() => {
        b.remove();
        showResult();
    }, 2000);
}
/**
 * リザルト表示 (練習モード時はランキングボタンを隠す)
 *//**
* リザルト表示処理
*/
function showResult() {
    // 1. データの計算
    const time = parseFloat(finishTimeValue);
    const kps = (time > 0) ? (score.keys / time).toFixed(1) : "0.0";
    // ダメージを敵の最大HPで固定（オーバーキル防止）
    const finalDamage = Math.min(score.damage, gameState.maxHp);

    // 2. 画面への反映
    document.getElementById('res-time').textContent = finishTimeValue;
    document.getElementById('res-damage').textContent = finalDamage;
    document.getElementById('res-kps').textContent = kps;
    document.getElementById('res-keys').textContent = score.keys;
    document.getElementById('res-miss').textContent = score.miss;

    // 3. ランキングタイトルの更新
    document.getElementById('ranking-title').textContent = `Global Ranking (${currentDifficulty} - ${currentMode})`;

    // 4. 練習モードなら登録ボタンを隠す
    const rankBtn = document.querySelector('.result-actions button:first-child');
    if (rankBtn) rankBtn.style.display = gameState.isPractice ? 'none' : 'inline-block';

    showScreen(SCREENS.RESULT);

    // 5. ランキング読み込み
    fetchAndRenderRanking(currentMode, currentDifficulty);
}
// イベントリスナー
// main.js の一番下にあるイベントリスナー部分
window.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    const active = document.querySelector('.screen.active')?.id;

    if (active === SCREENS.READY && e.key === 'Enter') { startGame(); return; }
    if (gameState.isGaming) handleKeyDown(e);

    if (e.key === 'Escape') {
        if (active === SCREENS.DIFFICULTY) showScreen(SCREENS.MENU);
        if (active === SCREENS.READY) showScreen(SCREENS.DIFFICULTY);

        // ★修正：単なる画面遷移ではなく、数値をリセットするために initReady を呼ぶ
        if (active === SCREENS.GAME) {
            clearInterval(gameState.timerId);
            initReady(currentDifficulty);
        }
        if (active === SCREENS.RESULT) {
            initReady(currentDifficulty);
        }
    }
});

// 先頭の方にGASのURLを定義しておく（デプロイして取得したURL）
const GAS_URL = "https://script.google.com/macros/s/AKfycbzFfjkBlklt6LnupEXUFmbAivUGH4cBVUTKyCazfvepjIx-_cvCIOdZjPQDaODpmiVq_g/exec";


/**
 * ランキング取得と描画
 */
async function fetchAndRenderRanking(mode, diff) {
    const tbody = document.getElementById('ranking-body');
    if (!tbody) return;

    tbody.innerHTML = "<tr><td colspan='4'>Loading...</td></tr>";

    try {
        // GASのURLにパラメータを付与
        const url = `${GAS_URL}?mode=${encodeURIComponent(mode)}&diff=${encodeURIComponent(diff)}`;

        console.log("Fetching ranking from:", url); // デバッグ用

        const res = await fetch(url);
        const data = await res.json();

        console.log("Received data:", data); // ★ここでデータの中身を確認できます

        tbody.innerHTML = "";

        if (!data || data.length === 0) {
            tbody.innerHTML = "<tr><td colspan='4'>該当するデータがまだありません</td></tr>";
            return;
        }

        data.forEach((r, i) => {
            const tr = document.createElement('tr');

            // 日本語ヘッダーと英語ヘッダーの両方に対応
            const name = r["名前"] || r["name"] || "Anonymous";
            const timeRaw = r["タイム"] || r["time"];
            const time = timeRaw ? parseFloat(timeRaw).toFixed(2) : "0.00";
            const damege_result = r["ダメージ"] || "0";
            const kps = r["KPS"] || r["kps"] || "0.0";

            tr.innerHTML = `
                <td>${i + 1}</td>
                <td><strong>${name}</strong></td>
                <td>${time}s</td>
                <td>${damege_result}</td>
                <td>${kps}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error("Ranking fetch error:", e);
        tbody.innerHTML = "<tr><td colspan='4'>データの取得に失敗しました</td></tr>";
    }
}
/**
 * ランキング登録（KPSと固定ダメージを送信）
 */
async function showRankingRegistration() {
    const name = prompt("名前(12文字以内)", "Anonymous") || "Anonymous";
    const time = parseFloat(finishTimeValue);
    const kps = (time > 0) ? (score.keys / time).toFixed(1) : "0.0";
    const finalDamage = Math.min(score.damage, gameState.maxHp);

    const record = {
        name: name.slice(0, 12),
        time: time,
        damage: finalDamage,
        miss: score.miss,
        mode: currentMode,
        diff: currentDifficulty,
        kps: kps
    };

    try {
        await fetch(GAS_URL, {
            method: "POST",
            mode: "no-cors",
            body: JSON.stringify(record)
        });
        alert("登録しました！");
        fetchAndRenderRanking(currentMode, currentDifficulty);
    } catch (e) {
        alert("登録に失敗しました");
    }
}

function postToX() {
    const text = `メイプルタイピング[${currentDifficulty}]で${score.damage}ダメージ与えました！討伐時間: ${finishTimeValue}秒 #MapleTyping https://wkillsy.github.io/maplestory-typing/`;
    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`);
}
