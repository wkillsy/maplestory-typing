/**
 * Maple Typing Game - Main Logic (Fixed Version)
 */

// --- 状態管理クラス ---
class GameState {
    constructor() {
        this.reset();
        this.volume = 50;
        this.ranking = this.loadRanking();
    }

    reset() {
        // モードはリセットせず保持（再挑戦のため）
        // this.currentMode = null; 
        this.difficulty = null;
        this.difficultyName = ''; 
        this.isPractice = false;
        
        this.questions = [];
        this.currentQuestionIndex = 0;
        this.score = 0;
        this.timeLimit = 0;
        this.timeLeft = 0;
        
        this.enemyMaxHp = 1000;
        this.enemyHp = 1000;
        
        this.combo = 0;
        this.maxCombo = 0;
        this.totalDamage = 0;
        this.correctKeys = 0;
        this.missKeys = 0;
        
        this.isPlaying = false;
        this.timerId = null;
    }

    loadRanking() {
        try {
            return JSON.parse(localStorage.getItem('mapleTypingRanking')) || [];
        } catch (e) {
            return [];
        }
    }

    saveRanking(entry) {
        this.ranking.push(entry);
        this.ranking.sort((a, b) => {
            if (b.damage !== a.damage) return b.damage - a.damage;
            return a.miss - b.miss;
        });
        this.ranking = this.ranking.slice(0, 100);
        localStorage.setItem('mapleTypingRanking', JSON.stringify(this.ranking));
    }
}

// --- グローバル変数 ---
const state = new GameState();
let gameData = [];
let romanDictionary = {};

// --- DOM Elements ---
const screens = {
    menu: document.getElementById('screen-menu'),
    difficulty: document.getElementById('screen-difficulty'),
    game: document.getElementById('screen-game'),
    result: document.getElementById('screen-result')
};

const dom = {
    volSlider: document.getElementById('volume-slider'),
    hpBar: document.getElementById('enemy-hp-bar'),
    hpText: document.getElementById('enemy-hp-text'),
    timer: document.getElementById('game-timer'),
    enemyImg: document.getElementById('enemy-img'),
    damageContainer: document.getElementById('damage-container'),
    displayTxt: document.getElementById('display-text'),
    readingTxt: document.getElementById('reading-text'),
    input: document.getElementById('game-input'),
    inputOverlay: document.getElementById('input-overlay'),
    combo: document.getElementById('combo-count'),
    inputMethodOptions: document.getElementById('input-method-options'),
    localRankList: document.getElementById('local-ranking-list')
};

// --- 初期化処理 ---
window.onload = async () => {
    await loadData();
    setupEventListeners();
};

async function loadData() {
    try {
        const [dataRes, dicRes] = await Promise.all([
            fetch('data/maple_typing_game_data.json'),
            fetch('data/romanTypingParseDictionary.json')
        ]);
        
        if (!dataRes.ok || !dicRes.ok) throw new Error("File not found");

        gameData = await dataRes.json();
        romanDictionary = await dicRes.json();
        
        console.log(`Data Loaded: ${gameData.length} questions.`);
    } catch (e) {
        console.error("Failed to load data:", e);
        alert("データ読み込みエラー。\n1. ローカルサーバー(Live Server等)で実行していますか？\n2. dataフォルダにjsonファイルはありますか？");
    }
}

function setupEventListeners() {
    // 音量
    dom.volSlider.addEventListener('input', (e) => state.volume = e.target.value);

    // メニュー選択
    document.querySelectorAll('.menu-btn[data-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            state.reset(); 
            state.currentMode = btn.dataset.mode;
            showScreen('difficulty');
            renderInputMethods();
        });
    });

    // 難易度選択
    document.querySelectorAll('.diff-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const diff = btn.dataset.diff;
            startGame(diff);
        });
    });

    // ゲーム内入力
    dom.input.addEventListener('input', handleTyping);
    
    // リザルト画面
    document.getElementById('btn-register-rank').addEventListener('click', registerRanking);
    document.getElementById('btn-tweet').addEventListener('click', shareOnX);
    document.getElementById('btn-retry').addEventListener('click', () => showScreen('difficulty'));
    document.getElementById('btn-title').addEventListener('click', () => showScreen('menu'));

    // キーボードショートカット (ESC制御の修正)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            handleEscKey();
        }
        // F5はブラウザデフォルト動作
    });
}

// --- 画面遷移制御 ---
function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    screens[screenName].classList.remove('hidden');
    
    if (screenName === 'game') {
        dom.input.focus();
        dom.input.click(); // スマホ用フォーカス補助
    }
}

// ESCキーのコンテキスト別動作
function handleEscKey() {
    // 現在表示されている画面を判定
    let currentScreenId = '';
    for (const [key, el] of Object.entries(screens)) {
        if (!el.classList.contains('hidden')) {
            currentScreenId = key;
            break;
        }
    }

    if (state.isPlaying) {
        // ゲーム中 → 強制終了して難易度選択へ
        quitGame();
        return;
    }

    switch (currentScreenId) {
        case 'menu':
            // 何もしない
            break;
        case 'difficulty':
            // 難易度選択 → タイトルへ戻る
            showScreen('menu');
            break;
        case 'game':
            // isPlayingがfalseでここに来ることは稀だが念のため
            quitGame();
            break;
        case 'result':
            // リザルト → 難易度選択へ（再挑戦）
            showScreen('difficulty');
            break;
    }
}

function renderInputMethods() {
    // 簡易的に今回は「ローマ字入力」固定
    let html = `<label><input type="radio" name="input-method" value="romaji" checked> ローマ字 / Romaji</label>`;
    dom.inputMethodOptions.innerHTML = html;
}

// --- ゲームコアロジック ---

function startGame(difficultyStr) {
    // データロードチェック
    if (!gameData || gameData.length === 0) {
        alert("問題データが読み込まれていません。\n画面をリロードしてください。");
        return;
    }

    state.difficultyName = difficultyStr;
    state.isPractice = document.getElementById('check-practice').checked;

    // 難易度設定
    let diffIds = [];
    switch(difficultyStr) {
        case 'easy':   state.timeLimit = 60;  state.enemyMaxHp = 1000; diffIds=[1]; break;
        case 'normal': state.timeLimit = 90;  state.enemyMaxHp = 3000; diffIds=[1,2]; break;
        case 'hard':   state.timeLimit = 120; state.enemyMaxHp = 8000; diffIds=[1,2,3]; break;
    }

    // 問題データフィルタリング (型変換を追加して堅牢に)
    const filtered = gameData.filter(d => {
        // JSONのdifficultyが文字列("1")でも数値(1)でもヒットするように比較
        return diffIds.includes(Number(d.difficulty));
    });

    if(filtered.length === 0) {
        console.error("No matching data found. DiffIDs:", diffIds, "GameData Sample:", gameData[0]);
        alert("該当する難易度のデータがありません。\nJSONデータの difficulty 値を確認してください (1, 2, 3)");
        return;
    }

    // ランダムシャッフル
    state.questions = [];
    for(let i=0; i<500; i++) {
        const r = filtered[Math.floor(Math.random() * filtered.length)];
        state.questions.push(r);
    }

    // 初期化
    state.enemyHp = state.enemyMaxHp;
    state.timeLeft = state.timeLimit;
    state.score = 0;
    state.combo = 0;
    state.totalDamage = 0;
    state.correctKeys = 0;
    state.missKeys = 0;
    
    state.isPlaying = true;
    state.currentQuestionIndex = 0;

    updateHUD();
    showScreen('game');
    setNextQuestion();
    startTimer();
}

// 強制終了（ESC用）
function quitGame() {
    clearInterval(state.timerId);
    state.isPlaying = false;
    showScreen('difficulty');
}

// ゲーム終了（クリア or 時間切れ）
function endGame(isClear) {
    clearInterval(state.timerId);
    state.isPlaying = false;
    
    // リザルト計算
    const elapsed = state.timeLimit - state.timeLeft;
    // 0除算対策
    const speed = elapsed > 0 ? (state.correctKeys / elapsed).toFixed(2) : "0.00";
    
    document.getElementById('res-time').textContent = elapsed.toFixed(2) + "s";
    document.getElementById('res-damage').textContent = state.totalDamage;
    document.getElementById('res-speed').textContent = speed;
    document.getElementById('res-miss').textContent = state.missKeys;
    
    // 登録ボタンの有効化
    document.getElementById('btn-register-rank').disabled = false;

    showScreen('result');
    renderRankingList();
}

let currentTargetRomaji = ""; 
let originalKana = "";        

function setNextQuestion() {
    const q = state.questions[state.currentQuestionIndex];
    state.currentQuestionIndex++;

    let display = "";
    let reading = "";

    // モード定義
    if (state.currentMode === 'jp_jp') {
        display = q.jp_display;
        reading = q.jp_hiragana;
    } else if (state.currentMode === 'kr_jp') {
        display = q.kr_display;
        reading = q.jp_hiragana;
    } else if (state.currentMode === 'kr_kr') {
        display = q.kr_display;
        reading = q.kr_display;
    } else if (state.currentMode === 'jp_kr') {
        display = q.jp_display;
        reading = q.kr_display; 
    }

    dom.displayTxt.textContent = display;
    dom.readingTxt.textContent = reading;
    dom.input.value = "";
    
    originalKana = reading;
    
    if(state.isPractice) {
        if(state.currentMode.includes('jp') && !state.currentMode.endsWith('kr')) {
             dom.inputOverlay.textContent = convertKanaToRomajiSimple(reading);
        } else {
             dom.inputOverlay.textContent = reading;
        }
    } else {
        dom.inputOverlay.textContent = "";
    }
}

// 簡易的な全変換
function convertKanaToRomajiSimple(text) {
    let res = "";
    for(let i=0; i<text.length; i++) {
        let c = text[i];
        if(romanDictionary[c]) res += romanDictionary[c][0];
        else res += c;
    }
    return res;
}

function handleTyping(e) {
    if (!state.isPlaying) return;

    const inputVal = dom.input.value;
    
    // 韓国語モード（完全一致判定）
    if (state.currentMode.endsWith('kr')) {
        if (inputVal === dom.readingTxt.textContent) {
            applyDamage(inputVal.length * 10);
            dom.input.value = "";
            setNextQuestion();
        }
        return;
    }

    // 日本語モード（簡易判定）
    const targetKana = originalKana;
    const isValid = checkRomajiMatch(inputVal, targetKana);

    if (isValid === 'complete') {
        const len = inputVal.length; 
        state.correctKeys += len; // 概算
        applyDamage(10); 
        dom.input.value = "";
        setNextQuestion();
    } else if (isValid === 'partial') {
        // 入力継続中OK
    } else {
        // ミス
        dom.input.style.backgroundColor = "rgba(255,0,0,0.3)";
        setTimeout(() => dom.input.style.backgroundColor = "rgba(255,255,255,0.1)", 200);
        state.missKeys++;
        state.combo = 0;
        dom.combo.textContent = 0;
    }
}

// 辞書を使ったマッチング（簡易版）
function checkRomajiMatch(input, targetKana) {
    const idealRomaji = convertKanaToRomajiSimple(targetKana);
    if (input === idealRomaji) return 'complete';
    if (idealRomaji.startsWith(input)) return 'partial';
    return 'error';
}

function applyDamage(baseDmg) {
    state.combo++;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
    
    const comboBonus = Math.min(Math.floor(state.combo / 50), 10);
    const totalDmg = baseDmg + comboBonus;
    
    state.totalDamage += totalDmg;
    state.enemyHp -= totalDmg;
    if(state.enemyHp < 0) state.enemyHp = 0;

    updateHUD();
    dom.combo.textContent = state.combo;
    spawnDamageNumber(totalDmg);
    
    dom.enemyImg.classList.add('enemy-hit');
    setTimeout(() => dom.enemyImg.classList.remove('enemy-hit'), 100);

    if (state.enemyHp <= 0) {
        endGame(true);
    }
}

function spawnDamageNumber(dmg) {
    const el = document.createElement('div');
    el.className = 'damage-number';
    el.textContent = dmg;
    const offset = (Math.random() - 0.5) * 50;
    el.style.left = `calc(50% + ${offset}px)`;
    dom.damageContainer.appendChild(el);
    setTimeout(() => el.remove(), 800);
}

function updateHUD() {
    const pct = (state.enemyHp / state.enemyMaxHp) * 100;
    dom.hpBar.style.width = `${pct}%`;
    dom.hpText.textContent = `HP: ${state.enemyHp} / ${state.enemyMaxHp}`;
}

// --- タイマー ---
function startTimer() {
    if(state.timerId) clearInterval(state.timerId);
    
    state.timerId = setInterval(() => {
        state.timeLeft -= 0.01;
        if(state.timeLeft <= 0) {
            state.timeLeft = 0;
            endGame(false); // 時間切れ
        }
        dom.timer.textContent = state.timeLeft.toFixed(2);
    }, 10);
}

// --- ランキング & SNS ---
function registerRanking() {
    if(state.isPractice) {
        alert("練習モードは登録できません");
        return;
    }
    const name = document.getElementById('rank-name').value;
    if(!name) return alert("名前を入力してください");
    
    const entry = {
        name: name,
        mode: state.currentMode,
        diff: state.difficultyName,
        time: (state.timeLimit - state.timeLeft).toFixed(2),
        damage: state.totalDamage,
        miss: state.missKeys
    };
    
    state.saveRanking(entry);
    alert("登録しました！");
    renderRankingList();
    document.getElementById('btn-register-rank').disabled = true;
}

function renderRankingList() {
    const list = dom.localRankList;
    list.innerHTML = "";
    
    const currentRank = state.ranking.filter(r => 
        r.mode === state.currentMode && r.diff === state.difficultyName
    ).slice(0, 5);
    
    currentRank.forEach((r, i) => {
        const li = document.createElement('li');
        li.textContent = `${i+1}. ${r.name} - Dmg:${r.damage} Time:${r.time}s`;
        list.appendChild(li);
    });
}

function shareOnX() {
    const text = `Maple Typing (${state.difficultyName}) Clear!%0A`
        + `Damage: ${state.totalDamage} / Time: ${(state.timeLimit - state.timeLeft).toFixed(2)}s%0A`
        + `#MapleTyping`;
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
}
