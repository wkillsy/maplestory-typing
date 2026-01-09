/**
 * Maple Typing Game - main.js
 * * 役割:
 * 1. データのロードと管理
 * 2. 画面遷移とゲームサイクル（開始・リセット・終了）
 * 3. PC（ローマ字）とスマホ（フリック）の両入力判定
 * 4. ランキングシステムとの通信
 */

// =========================================
// 1. 定数・設定管理
// =========================================
const SCREENS = {
    MENU: 'screen-menu',
    DIFFICULTY: 'screen-difficulty',
    READY: 'screen-ready',
    GAME: 'screen-game',
    RESULT: 'screen-result'
};

const DIFFICULTY_SETTINGS = {
    'Easy': { time: 30, hp: 1000, comboStep: 50, diffValue: 1, enemyImg: 'image/enemy01.png' },
    'Normal': { time: 60, hp: 3000, comboStep: 30, diffValue: 2, enemyImg: 'image/enemy01.png' },
    'Hard': { time: 90, hp: 5000, comboStep: 20, diffValue: 3, enemyImg: 'image/enemy01.png' }
};

const GAS_URL = "https://script.google.com/macros/s/AKfycbzpsZhx8yYJic7YjXW-K3uzZU0gCLSV2u-TMnf8ht7VEtMx1tAxom3nprGzIYlWpMCvIQ/exec";

// =========================================
// 2. グローバル変数
// =========================================
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

// =========================================
// 3. データロード・初期化
// =========================================

/**
 * 起動時に一度だけ実行：外部JSONデータの読み込み
 */
async function loadData() {
    try {
        const [gRes, dRes] = await Promise.all([
            fetch('data/maple_typing_game_data.json'),
            fetch('data/romanTypingParseDictionary.json')
        ]);
        gameData = await gRes.json();
        const dict = await dRes.json();
        dict.forEach(i => romanDict.set(i.Pattern, i.TypePattern));
        console.log("Master data successfully loaded.");
    } catch (e) {
        console.error("Data load error:", e);
    }
}
loadData();

/**
 * デバイス判定と初期設定
 * スマホならフリック入力をデフォルトに、PCならフリック選択肢を隠す
 */
function initDeviceSettings() {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
        document.body.classList.add('is-mobile');
        const flickRadio = document.querySelector('input[value="flick"]');
        const romajiRadio = document.querySelector('input[value="romaji"]');
        if (flickRadio) {
            flickRadio.checked = true;
            if (romajiRadio) romajiRadio.checked = false;
        }
    } else {
        document.body.classList.add('is-pc');
    }
}
document.addEventListener('DOMContentLoaded', initDeviceSettings);

/**
 * 画面の切り替え
 */
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

/**
 * ホーム画面でのモード選択（日→日、韓→日など）
 */
function selectMode(mode) {
    currentMode = mode;
    showScreen(SCREENS.DIFFICULTY);
}

/**
 * タイトルへ戻る（ページリロード）
 */
function toTitle() { location.reload(); }

// =========================================
// 4. ゲームサイクル管理（Ready / Start / End）
// =========================================

/**
 * ゲームの準備（難易度選択後、またはリトライ時）
 */
function initReady(diff) {
    currentDifficulty = diff;
    prepareWordPool(diff); // 単語在庫の補充

    // スコアと状態のリセット
    score = { keys: 0, combo: 0, miss: 0, damage: 0 };
    const settings = DIFFICULTY_SETTINGS[diff];

    Object.assign(gameState, {
        maxHp: settings.hp,
        currentHp: settings.hp,
        timeLeft: settings.time,
        isGaming: false
    });

    // UI表示の更新
    updateUI();
    const enemyImg = document.getElementById('enemy-img');
    if (enemyImg) {
        enemyImg.src = settings.enemyImg;
        enemyImg.style.filter = enemyImg.style.opacity = "";
    }

    document.getElementById('ready-diff-display').textContent = `Difficulty: ${diff}`;
    showScreen(SCREENS.READY);
}

/**
 * 待機画面でのタップ・開始処理
 */
function handleStartTap() {
    if (document.querySelector('.screen.active')?.id === SCREENS.READY) startGame();
}

/**
 * ゲーム本番の開始
 */
function startGame() {
    const s = DIFFICULTY_SETTINGS[currentDifficulty];
    gameState.isPractice = document.getElementById('practice-mode').checked;
    gameState.isGaming = true;
    gameState.startTime = Date.now();

    showScreen(SCREENS.GAME);

    // キーボード呼び出し（スマホ対策）
    const inp = document.getElementById('type-input');
    if (inp) {
        inp.value = "";
        inp.focus();
        inp.click();
    }

    pickNextWord();
    startTimer();
}

// =========================================
// 強制フォーカス管理（スマホのフリーズ対策）
// =========================================
function enforceFocus() {
    if (!gameState.isGaming) return;
    const inp = document.getElementById('type-input');
    if (inp && document.activeElement !== inp) {
        inp.focus();
    }
}

// 入力欄がフォーカスを失ったら即座に戻す
document.getElementById('type-input').addEventListener('blur', () => {
    if (gameState.isGaming) {
        setTimeout(enforceFocus, 10); // わずかな遅延を入れて再フォーカス
    }
});

// =========================================
// 入力方式の取得
// =========================================
function getInputMethod() {
    // HTML内のラジオボタンから「romaji」か「flick」を取得
    const method = document.querySelector('input[name="input-method"]:checked').value;
    return method === 'romaji' ? 'ローマ字' : 'フリック';
}

/**
 * ゲーム終了処理
 */
function endGame(msg) {
    gameState.isGaming = false;
    clearInterval(gameState.timerId);

    // 記録の算出
    finishTimeValue = (msg === "Time Up!")
        ? DIFFICULTY_SETTINGS[currentDifficulty].time
        : ((Date.now() - gameState.startTime) / 1000).toFixed(2);

    // バナー表示
    const banner = document.createElement('div');
    banner.id = "finish-banner";
    banner.textContent = msg;
    document.body.appendChild(banner);

    setTimeout(() => {
        banner.remove();
        showResult();
    }, 2000);
}

/**
 * 中断・リトライ（ESCキーやボタン）
 */
function retryGame() {
    if (gameState.timerId) clearInterval(gameState.timerId);
    const banner = document.getElementById('finish-banner');
    if (banner) banner.remove();
    initReady(currentDifficulty);
}

// =========================================
// 5. 単語ロジック
// =========================================

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

function pickNextWord() {
    if (currentWordPool.length === 0) return;

    let next;
    if (currentWordPool.length > 1) {
        do { next = currentWordPool[Math.floor(Math.random() * currentWordPool.length)]; }
        while (next === currentWord);
    } else {
        next = currentWordPool[0];
    }

    currentWord = next;
    currentGroupIndex = 0;
    currentInputInGroup = "";

    // ★JSONデータ内で「う」と「゛」が分かれている場合に対処するため、結合してからパースする
    let hiraStr = Array.isArray(next.jp_hiragana) ? next.jp_hiragana.join("") : next.jp_hiragana;
    hiraStr = hiraStr.normalize('NFKC'); // "う"+"゛" -> "ゔ" に結合
    const hiraArr = Array.from(hiraStr); // 配列に戻す

    currentHiraganaGroups = parseHiragana(hiraArr);
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

// =========================================
// 6. 入力判定コア
// =========================================

/**
 * PC用：キーダウン判定（ローマ字）
 */
function handleKeyDown(e) {
    if (!gameState.isGaming || e.isComposing) return;
    const key = e.key.toLowerCase();
    if (!/^[a-z0-9-]$/.test(key)) return;
    e.preventDefault();

    let g = currentHiraganaGroups[currentGroupIndex];
    if (!g) return;

    // 「ん」の自動補完
    if (g.hiragana === "ん" && currentInputInGroup === "" && key === "n") {
        const next = currentHiraganaGroups[currentGroupIndex + 1];
        if (next && !['a', 'i', 'u', 'e', 'o', 'y', 'n'].includes(next.patterns[0][0])) {
            processCorrect(); currentGroupIndex++; currentInputInGroup = "";
            if (currentGroupIndex >= currentHiraganaGroups.length) pickNextWord();
            renderTypingDisplay(); return;
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


/**
 * 文字の正規化（強力版）
 * NFKC(半角->全角/結合) -> 濁点統一 -> カタカナ->ひらがな変換
 */
function normalizeChar(str) {
    // 1. NFKCで結合 (例: "う"+"゛" -> "ゔ")
    let s = str.normalize('NFKC');
    // 2. 独立した濁点(\u309B)・半濁点(\u309C)を結合用(\u3099, \u309A)に置換 (念のため)
    s = s.replace(/\u309B/g, '\u3099').replace(/\u309C/g, '\u309A');
    // 3. カタカナ範囲をひらがなにシフト
    return s.replace(/[\u30a1-\u30f6]/g, (match) => {
        return String.fromCharCode(match.charCodeAt(0) - 0x60);
    });
}
/**
 * スマホ用：インプット判定（フリック入力）
 * ★「ゔ」や濁点対応を強化
 */


function setupMobileInput() {
    const inp = document.getElementById('type-input');
    if (!inp) return;

    // Try to reduce keyboard candidate suggestions
    inp.setAttribute('autocorrect', 'off');
    inp.setAttribute('autocomplete', 'off');
    inp.setAttribute('autocapitalize', 'off');
    inp.setAttribute('spellcheck', 'false');

    let composing = false;
    let lastCorrectInput = ""; // ★追加: 直前の正解文字（高速入力での連結対策）

    // ---------------------------------------------------------
    // 共通の入力処理ロジック
    // ---------------------------------------------------------
    const checkInput = () => {
        if (!gameState.isGaming) return;

        const val = inp.value;
        let g = currentHiraganaGroups[currentGroupIndex];
        if (!g) return;

        // 単語の先頭なら履歴リセット
        if (currentGroupIndex === 0) lastCorrectInput = "";

        // 強化したnormalizeCharを使用
        const normalizedInput = normalizeChar(val);
        const normalizedTarget = normalizeChar(g.hiragana || "");

        // ★Ghost Input対策:
        // 入力が「直前の正解」と全く同じで、かつ「現在の正解」とは異なる場合、
        // それは前回の入力が残っている(or Ghost)可能性が高いので無視する。
        if (lastCorrectInput && normalizedInput === lastCorrectInput && normalizedInput !== normalizedTarget) {
            return;
        }

        // 判定ロジック修正: 直前の正解文字が残ってしまっている場合(例: "ぜ"+"の"="ぜの")も許容する
        // ★さらに追加: 入力の末尾が正解と一致していればOKとする（最強の救済措置）
        if (normalizedInput === normalizedTarget || 
           (lastCorrectInput && normalizedInput === lastCorrectInput + normalizedTarget) ||
           (normalizedInput.length > normalizedTarget.length && normalizedInput.endsWith(normalizedTarget))) {
            // 完全一致
            currentGroupIndex++;
            currentInputInGroup = "";
            lastCorrectInput = normalizedTarget; // 次のために保存
            processCorrect();
            inp.value = "";

            if (currentGroupIndex >= currentHiraganaGroups.length) {
                pickNextWord();
            }
        } else {
            // 部分一致なら表示
            // 1. 通常の部分一致 (例: "あ" vs "あ")
            // 2. 濁点・半濁点の分離比較 (例: "ぜ" vs "せ")
            // 3. 小文字を大文字として比較 (例: "しょ" vs "しよ")
            // 4. 半濁点(ぷ)の入力途中に濁点(ぶ)を経由する場合の許容 (例: "ぷ" vs "ぶ")
            
            const nfdTarget = normalizedTarget.normalize('NFD');
            const nfdInput = normalizedInput.normalize('NFD');
            const enlarge = (s) => s.replace(/[ぁぃぅぇぉっゃゅょゎ]/g, c => String.fromCharCode(c.charCodeAt(0) + 1));
            
            // 入力の濁点(\u3099)を半濁点(\u309A)に置き換えて比較（"ぶ" -> "ぷ" への変化を想定）
            const inputSwapDakuten = nfdInput.replace(/\u3099/g, '\u309A');

            const isPartialMatch = normalizedTarget.startsWith(normalizedInput) ||
                                   nfdTarget.startsWith(nfdInput) ||
                                   enlarge(normalizedTarget).startsWith(enlarge(normalizedInput)) ||
                                   enlarge(nfdTarget).startsWith(enlarge(nfdInput)) ||
                                   (nfdTarget.startsWith(inputSwapDakuten) && nfdInput.includes('\u3099'));

            if (isPartialMatch) {
                currentInputInGroup = normalizedInput;
            } else {
                // 一致しない入力が溜まったらミス扱いして即リセット
                // かな入力の場合はモードに関わらず1文字で判定する（設定忘れ対策）
                const isKana = /[\u3040-\u309f\u30a0-\u30ff]/.test(normalizedInput);
                const threshold = (getInputMethod() === 'フリック' || isKana) ? 1 : 3;
                if (normalizedInput.length >= threshold) {
                    inp.value = "";
                    currentInputInGroup = "";
                    lastCorrectInput = ""; // ミスしたらリセット
                    score.miss++; score.combo = 0; updateUI();
                }
            }
        }
        renderTypingDisplay();
    };

    // ---------------------------------------------------------
    // イベントリスナー設定
    // ---------------------------------------------------------
    
    // IME状態管理
    inp.addEventListener('compositionstart', () => { composing = true; });
    inp.addEventListener('compositionend', () => {
        composing = false;
        checkInput(); // 確定した瞬間に判定を行う
    });

    // キーボード表示時のUI調整
    inp.addEventListener('focus', () => {
        document.body.classList.add('keyboard-open');
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
    });

    inp.addEventListener('blur', () => {
        setTimeout(() => {
            document.body.classList.remove('keyboard-open');
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';
        }, 50);
    });

    // Enterキーでのクリアフォールバック
    inp.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            inp.value = '';
            currentInputInGroup = '';
            renderTypingDisplay();
            updateUI();
        }
    });

    // 入力イベント
    inp.addEventListener('input', (e) => {
        checkInput();
    });
}
setupMobileInput();

// =========================================
// 7. ダメージ・UI演出
// =========================================

function processCorrect() {
    score.keys++;
    score.combo++;

    // コンボダメージ計算
    const step = DIFFICULTY_SETTINGS[currentDifficulty].comboStep || 30;
    let dmg = 10 + Math.min(Math.floor(score.combo / step), 10);

    gameState.currentHp = Math.max(0, gameState.currentHp - dmg);
    score.damage += dmg;

    updateUI();
    showDamageEffect(dmg);
    if (gameState.currentHp <= 0) endGame("Finish!");
}

function showDamageEffect(dmg) {
    const container = document.getElementById('enemy-container');
    const el = document.createElement('div');
    el.className = 'damage-num';
    el.textContent = dmg;
    el.style.left = `calc(50% + ${Math.random() * 60 - 30}px)`;
    if (container) container.appendChild(el);
    setTimeout(() => el.remove(), 800);
}

function updateUI() {
    const hpFill = document.getElementById('hp-fill');
    const hpText = document.getElementById('hp-text');
    const comboText = document.getElementById('combo-display');

    if (hpFill) hpFill.style.width = `${(gameState.currentHp / gameState.maxHp) * 100}%`;
    if (hpText) hpText.textContent = `${gameState.currentHp} / ${gameState.maxHp}`;
    if (comboText) comboText.textContent = `Combo: ${score.combo}`;
}

function renderTypingDisplay() {
    const guideEl = document.getElementById('kana-guide');
    const wordEl = document.getElementById('display-word');
    if (!currentWord || !guideEl || !wordEl) return;

    wordEl.textContent = (currentMode === '韓→日') ? currentWord.kr_display : currentWord.jp_display;
    guideEl.className = gameState.isPractice ? "practice-on" : "practice-off";

    let html = "";
    currentHiraganaGroups.forEach((group, idx) => {
        // フリック入力では "hiragana" を表示（例: きゃ -> きゃ）
        if (getInputMethod() === 'フリック') {
            const hira = group.hiragana || "";
            const chars = Array.from(hira);
            const inputChars = Array.from(currentInputInGroup);

            if (idx < currentGroupIndex) {
                html += `<span class="char-typed">${hira}</span>`;
            } else if (idx === currentGroupIndex) {
                for (let i = 0; i < chars.length; i++) {
                    // ★厳密な判定: 入力文字とターゲット文字が「正規化後に一致」している場合のみ色をつける
                    // これにより、「う」を入力しただけでは「ヴ」が黄色くならず、濁点を打って初めて黄色くなる
                    const isTyped = inputChars[i] && (normalizeChar(inputChars[i]) === normalizeChar(chars[i]));
                    
                    // ★追加: 入力はされているが、厳密には一致していない（濁点待ちなど）場合は「Pending」色にする
                    const isPending = inputChars[i] && !isTyped;
                    
                    let className = 'char-not-typed';
                    if (isTyped) className = 'char-typed';
                    else if (isPending) className = 'char-pending';

                    html += `<span class="${className}">${chars[i]}</span>`;
                }
            } else {
                html += `<span class="char-not-typed">${hira}</span>`;
            }

        } else {
            // 既存のローマ字表示
            let pattern = group.patterns[0];
            if (idx === currentGroupIndex && currentInputInGroup.length > 0) {
                pattern = group.patterns.find(p => p.startsWith(currentInputInGroup)) || pattern;
            }

            if (idx < currentGroupIndex) {
                html += `<span class="char-typed">${pattern}</span>`;
            } else if (idx === currentGroupIndex) {
                for (let i = 0; i < pattern.length; i++) {
                    const isTyped = i < currentInputInGroup.length;
                    html += `<span class="${isTyped ? 'char-typed' : 'char-not-typed'}">${pattern[i]}</span>`;
                }
            } else {
                html += `<span class="char-not-typed">${pattern}</span>`;
            }
        }
    });
    guideEl.innerHTML = html;
}

// =========================================
// 8. 通信・ランキング
// =========================================

function startTimer() {
    const duration = gameState.timeLeft * 1000;
    gameState.timerId = setInterval(() => {
        const elapsed = Date.now() - gameState.startTime;
        const remaining = Math.max(0, duration - elapsed);
        const display = document.getElementById('time-display');
        if (display) display.textContent = `Time: ${(remaining / 1000).toFixed(2)}`;
        if (remaining <= 0) endGame("Time Up!");
    }, 10);
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

async function fetchAndRenderRanking(mode, diff) {
    const tbody = document.getElementById('ranking-body');
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='5'>Loading...</td></tr>";

    try {
        const method = getInputMethod(); // 現在選択中の方式のランキングを表示
        const url = `${GAS_URL}?mode=${encodeURIComponent(mode)}&diff=${encodeURIComponent(diff)}&method=${encodeURIComponent(method)}`;
        const res = await fetch(url);
        const data = await res.json();
        tbody.innerHTML = "";
        if (!data || data.length === 0) {
            tbody.innerHTML = "<tr><td colspan='5'>No Data</td></tr>";
            return;
        }
        data.forEach((r, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${i + 1}</td>
                <td><strong>${r["名前"] || r["name"] || "Anonymous"}</strong></td>
                <td>${(r["タイム"] || r["time"] || 0)}s</td>
                <td>${r["ダメージ"] || 0}</td>
                <td>${r["KPS"] || "0.0"}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        tbody.innerHTML = "<tr><td colspan='5'>Fetch Error</td></tr>";
    }
}

// =========================================
// ランキング登録時の送信データ変更
// =========================================
async function showRankingRegistration() {
    const name = prompt("名前(12文字以内)", "Anonymous") || "Anonymous";
    const time = parseFloat(finishTimeValue);
    const inputMethod = getInputMethod(); // ★現在の方式を取得

    const record = {
        name: name.slice(0, 12),
        time: time,
        damage: Math.min(score.damage, gameState.maxHp),
        miss: score.miss,
        mode: currentMode,
        diff: currentDifficulty,
        kps: (time > 0) ? (score.keys / time).toFixed(1) : "0.0",
        inputMethod: inputMethod // ★GASへ送信
    };

    try {
        await fetch(GAS_URL, { method: "POST", mode: "no-cors", body: JSON.stringify(record) });
        alert(`${inputMethod}ランキングに登録しました！`);
        fetchAndRenderRanking(currentMode, currentDifficulty);
    } catch (e) { alert("failed"); }
}

function postToX() {
    const text = `メイプルタイピング[${currentDifficulty}]で${score.damage}ダメージ！討伐時間: ${finishTimeValue}秒 #MapleTyping https://wkillsy.github.io/maplestory-typing/`;
    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`);
}

// =========================================
// 9. イベントリスナー
// =========================================

window.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    const activeId = document.querySelector('.screen.active')?.id;

    if (gameState.isGaming) handleKeyDown(e);

    if (activeId === SCREENS.READY && e.key === 'Enter') startGame();

    if (e.key === 'Escape') {
        if (activeId === SCREENS.DIFFICULTY) showScreen(SCREENS.MENU);
        if (activeId === SCREENS.READY) showScreen(SCREENS.DIFFICULTY);
        if (activeId === SCREENS.GAME || activeId === SCREENS.RESULT) retryGame();
    }
});

// 画面タップで入力を強制維持
const handleGlobalFocus = (e) => {
    if (gameState.isGaming && e.target.tagName !== 'BUTTON') {
        const inp = document.getElementById('type-input');
        if (inp) inp.focus();
    }
};
document.addEventListener('click', handleGlobalFocus);
document.addEventListener('touchstart', handleGlobalFocus, { passive: false });

// Prevent scroll while keyboard is open (useful when candidate bar pushes viewport)
document.addEventListener('touchmove', (e) => {
    if (document.body.classList.contains('keyboard-open')) {
        e.preventDefault();
    }
}, { passive: false });
