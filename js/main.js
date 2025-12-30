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

// 難易度設定に enemyImg を追加
const DIFFICULTY_SETTINGS = {
    'Easy': { time: 60, hp: 1500, comboStep: 50, diffValue: 1, enemyImg: 'image/enemy01.png' },
    'Normal': { time: 90, hp: 4500, comboStep: 30, diffValue: 2, enemyImg: 'image/enemy01.png' },
    'Hard': { time: 120, hp: 8000, comboStep: 20, diffValue: 3, enemyImg: 'image/enemy01.png' }
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
    startTime: 0,
    isPractice: false
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

// モード選択
function selectMode(mode) {
    currentMode = mode;
    showScreen(SCREENS.DIFFICULTY);
}

function toTitle() { location.reload(); }

// ゲーム準備（数値とUIのリセット）
function initReady(diff) {
    currentDifficulty = diff;
    prepareWordPool(diff); // 単語プールの補充

    score = { keys: 0, combo: 0, maxCombo: 0, miss: 0, damage: 0 };

    const settings = DIFFICULTY_SETTINGS[diff];
    gameState.maxHp = settings.hp;
    gameState.currentHp = settings.hp;
    gameState.timeLeft = settings.time;

    // UIをリセット
    updateUI();

    // 難易度に応じた画像をセット
    const enemyImg = document.getElementById('enemy-img');
    if (enemyImg) {
        enemyImg.src = settings.enemyImg;
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

// タップでスタートするための関数
function handleStartTap() {
    const active = document.querySelector('.screen.active')?.id;
    if (active === SCREENS.READY) startGame();
}

/**
 * ゲーム開始処理
 */
function startGame() {
    const s = DIFFICULTY_SETTINGS[currentDifficulty];
    const isPractice = document.getElementById('practice-mode').checked;

    Object.assign(gameState, {
        maxHp: s.hp,
        currentHp: s.hp,
        timeLeft: s.time,
        isGaming: true,
        startTime: Date.now(),
        isPractice: isPractice
    });

    score = { keys: 0, miss: 0, damage: 0, combo: 0 };

    showScreen(SCREENS.GAME);

    // 入力欄のフォーカス（スマホキーボード表示対策）
    const inp = document.getElementById('type-input');
    if (inp) {
        inp.value = "";
        inp.focus();
        inp.click();
    }

    pickNextWord();
    startTimer();
}

// 次の単語を選択（連続重複回避）
function pickNextWord() {
    if (currentWordPool.length === 0) return;

    let nextWord;
    if (currentWordPool.length > 1) {
        do {
            nextWord = currentWordPool[Math.floor(Math.random() * currentWordPool.length)];
        } while (nextWord === currentWord);
    } else {
        nextWord = currentWordPool[0];
    }

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

// PC用：ローマ字入力判定
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

// スマホ・フリック用：直接かな入力判定
const typeInput = document.getElementById('type-input');
if (typeInput) {
    typeInput.addEventListener('input', (e) => {
        if (!gameState.isGaming) return;
        const char = e.data;
        if (!char) return;

        // ひらがなが直接入力された場合
        if (/[ぁ-ん]/.test(char)) {
            let g = currentHiraganaGroups[currentGroupIndex];
            if (g && char === g.hiragana) {
                currentGroupIndex++;
                currentInputInGroup = "";
                processCorrect();
                if (currentGroupIndex >= currentHiraganaGroups.length) pickNextWord();
                renderTypingDisplay();
            } else {
                score.miss++; score.combo = 0; updateUI();
            }
            e.target.value = ""; // 入力欄を常に空にする
        }
    });
}

function processCorrect() {
    score.keys++;
    score.combo++;
    const step = DIFFICULTY_SETTINGS[currentDifficulty].comboStep || 30;
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

function updateUI() {
    const f = document.getElementById('hp-fill');
    const t = document.getElementById('hp-text');
    const c = document.getElementById('combo-display');
    if (f) f.style.width = `${(gameState.currentHp / gameState.maxHp) * 100}%`;
    if (t) t.textContent = `${gameState.currentHp} / ${gameState.maxHp}`;
    if (c) c.textContent = `Combo: ${score.combo}`;
}

function renderTypingDisplay() {
    const g = document.getElementById('kana-guide');
    const d = document.getElementById('display-word');
    if (!currentWord || !g || !d) return;

    d.textContent = (currentMode === '韓→日') ? currentWord.kr_display : currentWord.jp_display;
    g.className = gameState.isPractice ? "practice-on" : "practice-off";

    let html = "";
    currentHiraganaGroups.forEach((group, idx) => {
        let pattern = group.patterns[0];
        if (idx === currentGroupIndex && currentInputInGroup.length > 0) {
            pattern = group.patterns.find(p => p.startsWith(currentInputInGroup)) || pattern;
        }
        if (idx < currentGroupIndex) {
            html += `<span class="char-typed">${pattern}</span>`;
        } else if (idx === currentGroupIndex) {
            for (let i = 0; i < pattern.length; i++) {
                const className = i < currentInputInGroup.length ? "char-typed" : "char-not-typed";
                html += `<span class="${className}">${pattern[i]}</span>`;
            }
        } else {
            html += `<span class="char-not-typed">${pattern}</span>`;
        }
    });
    g.innerHTML = html;
}

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
    finishTimeValue = (msg === "Time Up!") ? DIFFICULTY_SETTINGS[currentDifficulty].time : ((Date.now() - gameState.startTime) / 1000).toFixed(2);

    const b = document.createElement('div');
    b.id = "finish-banner";
    b.textContent = msg;
    document.body.appendChild(b);

    setTimeout(() => { b.remove(); showResult(); }, 2000);
}

function showResult() {
    const time = parseFloat(finishTimeValue);
    const kps = (time > 0) ? (score.keys / time).toFixed(1) : "0.0";
    const finalDamage = Math.min(score.damage, gameState.maxHp);

    document.getElementById('res-time').textContent = finishTimeValue;
    document.getElementById('res-damage').textContent = finalDamage;
    document.getElementById('res-kps').textContent = kps;
    document.getElementById('res-keys').textContent = score.keys;
    document.getElementById('res-miss').textContent = score.miss;

    document.getElementById('ranking-title').textContent = `Global Ranking (${currentDifficulty} - ${currentMode})`;
    const rankBtn = document.querySelector('.result-actions button:first-child');
    if (rankBtn) rankBtn.style.display = gameState.isPractice ? 'none' : 'inline-block';

    showScreen(SCREENS.RESULT);
    fetchAndRenderRanking(currentMode, currentDifficulty);
}

// イベントリスナー
window.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    const active = document.querySelector('.screen.active')?.id;

    if (active === SCREENS.READY && e.key === 'Enter') { startGame(); return; }
    if (gameState.isGaming) handleKeyDown(e);

    if (e.key === 'Escape') {
        if (active === SCREENS.DIFFICULTY) showScreen(SCREENS.MENU);
        if (active === SCREENS.READY) showScreen(SCREENS.DIFFICULTY);
        if (active === SCREENS.GAME) { clearInterval(gameState.timerId); initReady(currentDifficulty); }
        if (active === SCREENS.RESULT) { initReady(currentDifficulty); }
    }
});

const GAS_URL = "https://script.google.com/macros/s/AKfycbzFfjkBlklt6LnupEXUFmbAivUGH4cBVUTKyCazfvepjIx-_cvCIOdZjPQDaODpmiVq_g/exec";

async function fetchAndRenderRanking(mode, diff) {
    const tbody = document.getElementById('ranking-body');
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='5'>Loading...</td></tr>";

    try {
        const url = `${GAS_URL}?mode=${encodeURIComponent(mode)}&diff=${encodeURIComponent(diff)}`;
        const res = await fetch(url);
        const data = await res.json();
        tbody.innerHTML = "";
        if (!data || data.length === 0) {
            tbody.innerHTML = "<tr><td colspan='5'>該当データなし</td></tr>";
            return;
        }
        data.forEach((r, i) => {
            const tr = document.createElement('tr');
            const name = r["名前"] || r["name"] || "Anonymous";
            const timeRaw = r["タイム"] || r["time"];
            const time = timeRaw ? parseFloat(timeRaw).toFixed(2) : "0.00";
            const dmg = r["ダメージ"] || "0";
            const kps = r["KPS"] || r["kps"] || "0.0";

            tr.innerHTML = `
                <td>${i + 1}</td>
                <td><strong>${name}</strong></td>
                <td>${time}s</td>
                <td>${dmg}</td>
                <td>${kps}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        tbody.innerHTML = "<tr><td colspan='5'>取得失敗</td></tr>";
    }
}

async function showRankingRegistration() {
    const name = prompt("名前(12文字以内)", "Anonymous") || "Anonymous";
    const time = parseFloat(finishTimeValue);
    const kps = (time > 0) ? (score.keys / time).toFixed(1) : "0.0";
    const finalDamage = Math.min(score.damage, gameState.maxHp);

    const record = { name: name.slice(0, 12), time: time, damage: finalDamage, miss: score.miss, mode: currentMode, diff: currentDifficulty, kps: kps };

    try {
        await fetch(GAS_URL, { method: "POST", mode: "no-cors", body: JSON.stringify(record) });
        alert("登録しました！");
        fetchAndRenderRanking(currentMode, currentDifficulty);
    } catch (e) { alert("登録失敗"); }
}

function postToX() {
    const text = `メイプルタイピング[${currentDifficulty}]で${score.damage}ダメージ！討伐時間: ${finishTimeValue}秒 #MapleTyping https://wkillsy.github.io/maplestory-typing/`;
    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`);
}
