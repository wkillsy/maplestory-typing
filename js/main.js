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
    'Easy': { time: 60, hp: 1000, diffValue: 1 },
    'Normal': { time: 90, hp: 3000, diffValue: 2 },
    'Hard': { time: 120, hp: 8000, diffValue: 3 }
};

let gameData = null;
let romanDict = new Map();
let currentMode = '1-1';
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

function selectMode(m) { currentMode = m; showScreen(SCREENS.DIFFICULTY); }
function toTitle() { location.reload(); }

function initReady(diff) {
    currentDifficulty = diff;
    prepareWordPool(diff);
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

function startGame() {
    const s = DIFFICULTY_SETTINGS[currentDifficulty];
    Object.assign(gameState, {
        maxHp: s.hp, currentHp: s.hp, timeLeft: s.time,
        isGaming: true, startTime: Date.now()
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
    const w = currentWordPool[Math.floor(Math.random() * currentWordPool.length)];
    currentWord = w;
    currentGroupIndex = 0;
    currentInputInGroup = "";
    currentHiraganaGroups = parseHiragana(w.jp_hiragana);
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
    score.keys++; score.combo++;
    let dmg = 10 + Math.min(Math.floor(score.combo / 50), 10);
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
    d.textContent = currentWord.jp_display;
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
                html += `<span class="${i < currentInputInGroup.length ? 'char-typed' : 'char-not-typed'}">${pattern[i]}</span>`;
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
        document.getElementById('time-display').textContent = `Time: ${(rem / 1000).toFixed(2)}`;
        if (rem <= 0) endGame("Time Up!");
    }, 10);
}

function endGame(msg) {
    gameState.isGaming = false;
    clearInterval(gameState.timerId);
    finishTimeValue = (msg === "Time Up!") ? DIFFICULTY_SETTINGS[currentDifficulty].time : ((Date.now() - gameState.startTime) / 1000).toFixed(2);
    const b = document.createElement('div'); b.id = "finish-banner"; b.textContent = msg;
    document.body.appendChild(b);
    setTimeout(() => { b.remove(); showResult(); }, 2000);
}

function showResult() {
    document.getElementById('res-time').textContent = finishTimeValue;
    document.getElementById('res-damage').textContent = score.damage;
    document.getElementById('res-keys').textContent = score.keys;
    document.getElementById('res-miss').textContent = score.miss;
    showScreen(SCREENS.RESULT);
}

// イベントリスナー
window.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    const active = document.querySelector('.screen.active')?.id;
    if (active === SCREENS.READY && e.key === 'Enter') { startGame(); return; }
    if (gameState.isGaming) handleKeyDown(e);
    if (e.key === 'Escape') {
        if (active === SCREENS.DIFFICULTY) showScreen(SCREENS.MENU);
        if (active === SCREENS.READY) showScreen(SCREENS.DIFFICULTY);
        if (active === SCREENS.GAME) { clearInterval(gameState.timerId); showScreen(SCREENS.DIFFICULTY); }
    }
});

function showRankingRegistration() {
    //const name = prompt("名前(12文字以内)", "Anonymous") || "Anonymous";
    //let rank = JSON.parse(localStorage.getItem('maple_typing_rank') || "[]");
    //rank.push({ name: name.slice(0, 12), time: parseFloat(finishTimeValue), damage: score.damage, miss: score.miss, mode: currentMode, diff: currentDifficulty });
    //\\rank.sort((a, b) => a.time - b.time || b.damage - a.damage || a.miss - b.miss);
    //localStorage.setItem('maple_typing_rank', JSON.stringify(rank));
    alert("未実装！");
}

function postToX() {
    const text = `メイプルタイピング[${currentDifficulty}]で${score.damage}ダメージ与えました！討伐時間: ${finishTimeValue}秒 #MapleTyping https://wkillsy.github.io/maplestory-typing/`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`);
}
