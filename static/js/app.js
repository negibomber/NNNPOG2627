/* ==========================================================================
   POG Main Application Module (app.js) - Ver.0.6 (Refactored)
   ========================================================================== */
const APP_VERSION = "0.6.3";

// 証拠：アプリ全域の状態を自動付与する共通司令塔
window.POG_Log = {
    level: 1, // 1:DEBUG, 2:INFO, 3:ERROR
    d(msg, data = null) { this.out(1, 'DEBUG', msg, data); },
    i(msg, data = null) { this.out(2, 'INFO ', msg, data); },
    e(msg, data = null) { this.out(3, 'ERROR', msg, data); },
    out(lv, label, msg, data) {
        if (lv < this.level) return;
        const s = window.AppState;
        const state = s ? `[${s.uiMode}|Upd:${s.isUpdating}|Idx:${s.lastPlayedIdx}]` : '[INIT]';
        const logMsg = `${state} ${label}: ${msg}`;
        if (data) console.log(logMsg, data); else console.log(logMsg);
    }
};

// --- [State Management] アプリケーションの状態を一括管理 ---
window.AppState = {
    uiMode: 'IDLE',      // 'IDLE', 'BUSY', 'THEATER'
    latestData: null,
    lastPlayedIdx: -1,
    isUpdating: false,

    canUpdateUI() {
        return this.uiMode === 'IDLE';
    },

    setMode(newMode, caller) {
        // 証拠：演出中の不正なモード遷移を検知
        if (this.uiMode === 'THEATER' && newMode === 'BUSY') {
            POG_Log.d(`STATE_LOCKED: Theater is running. Entry to BUSY allowed only for Action.`);
        }
        POG_Log.d(`STATE_CHANGE: ${this.uiMode} -> ${newMode} (by ${caller})`);
        this.uiMode = newMode;
    }
};

window.searchController = null;
window.statusTimer = null;

/* ==========================================================================
   1. [Core] App Initialization
   ========================================================================== */
(function() {
    console.log(`%c --- POG APP START (Ver.${APP_VERSION}) --- `, 'background: #222; color: #bada55');

    const init = () => {
        updateStatus();
        const fInput = document.getElementById('s_father');
        const mInput = document.getElementById('s_mother');

        if (fInput && mInput) {
            fInput.oninput = null;
            mInput.oninput = null;

            const handleInput = (e) => {
                if (!window.AppState.canUpdateUI() || document.activeElement?.tagName === 'BUTTON') {
                    return;
                }
                searchHorses();
            };

            fInput.addEventListener('input', handleInput);
            mInput.addEventListener('input', handleInput);
        }
        
        // 監視カメラ：MCボタンの属性変化を監視
        const mcBtn = document.getElementById('mc_main_btn');
        if (mcBtn) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.attributeName === 'style' || mutation.attributeName === 'class') {
                        POG_Log.d(`MC_BTN_DETECTED: style=${mcBtn.style.display}, class=${mcBtn.className}`);
                    }
                });
            });
            observer.observe(mcBtn, { attributes: true });
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    window.statusTimer = setInterval(updateStatus, 3000);
})();

function shouldReloadPage(oldPhase, newPhase) {
    if (!oldPhase || oldPhase === "" || oldPhase === newPhase) return false;
    if (oldPhase === 'lottery' && newPhase === 'nomination') return true;
    if (newPhase === 'finished' || oldPhase === 'DRAFT_FINISHED') return true;
    return false;
}

/* ==========================================================================
   2. [Logic] Data Fetching & Core Logic
   ========================================================================== */
async function updateStatus(preFetchedData = null, force = false) {
    if (window.AppState.isUpdating && !force) {
        POG_Log.d(`UPDATE_LOCKED: isUpdating=${window.AppState.isUpdating}, force=${force}`);
        return; 
    }
    window.AppState.isUpdating = true;
    
    try {
        let data = preFetchedData || await POG_API.fetchStatus();
        if (!data) {
            POG_Log.e("DATA_EMPTY: fetchStatus returned null");
            return;
        }

        window.AppState.latestData = data;
        POG_Log.d(`DATA_RECEIVE: phase=${data.phase}, idx=${data.reveal_index}, uiMode=${window.AppState.uiMode}, force=${force}`);

        // --- 1. 演出判定 ---
        const isNewReveal = (data.phase === 'reveal' && data.reveal_data && window.AppState.lastPlayedIdx !== data.reveal_index);
        const isNewLottery = (data.phase === 'lottery_reveal' && data.lottery_data && window.AppState.lastPlayedIdx !== data.reveal_index);
        const willStartTheater = isNewReveal || isNewLottery;

        // --- 2. 状態遷移の確定 (証拠ログ) ---
        if (willStartTheater) {
            POG_Log.i(`TRANSITION_DECISION: To THEATER (Reason: New Data for Idx ${data.reveal_index})`);
            window.AppState.setMode('THEATER', 'updateStatus');
            window.AppState.lastPlayedIdx = data.reveal_index;
        } else {
            const isTheaterOpen = document.getElementById('theater_layer').style.display === 'flex';
            const isTheaterPhase = ['reveal', 'lottery_reveal'].includes(data.phase);
            
            if (isTheaterOpen && !isTheaterPhase) {
                POG_Log.i(`TRANSITION_DECISION: To IDLE (Reason: Phase [${data.phase}] is not for Theater)`);
                POG_Theater.close();
                window.AppState.lastPlayedIdx = -1;
                window.AppState.setMode('IDLE', 'updateStatus_close');
            }
        }

        // --- 3. 演出実行 ---
        if (willStartTheater) {
            POG_Log.i(`THEATER_LAUNCH: Calling playReveal`);
            POG_Theater.playReveal(data.reveal_data || data.lottery_data);
        }

        // --- 4. 描画ガード（統治権の行使） ---
        // 鉄壁：演出中(THEATER)は、たとえ force(MC操作)であっても syncAllUI を絶対に踏ませない
        const isTheaterActive = (window.AppState.uiMode === 'THEATER');
        const shouldSkipSync = (!window.AppState.canUpdateUI() && !force) || isTheaterActive;

        POG_Log.d(`DRAW_GATE_CHECK: mode=${window.AppState.uiMode}, force=${force}, skip=${shouldSkipSync}`);

        if (shouldSkipSync) {
            // 演出中の syncAllUI 呼び出しをここで物理的に遮断する
            POG_Log.d(`UI_SYNC_HALT: 🛑 Stopped syncAllUI to protect Theater layer. (Mode: ${window.AppState.uiMode})`);
            return;
        }

        // --- 5. 正規描画 (IDLE時のみ) ---
        syncAllUI(data, force);

        if (shouldReloadPage(window.AppState.lastPhase, data.phase)) {
            POG_Log.i(`PAGE_RELOAD: ${window.AppState.lastPhase} -> ${data.phase}`);
            window.AppState.lastPhase = data.phase;
            location.reload();
            return;
        }
        window.AppState.lastPhase = data.phase;

    } catch (e) {
        POG_Log.e("Status update error", e);
    } finally {
        window.AppState.isUpdating = false;
        POG_Log.d(`UPDATE_FINISHED`);
    }
}

/**
 * UI全体を最新データと同期する（描画の唯一の入り口）
 */
function syncAllUI(data, isManual = false) {
    POG_Log.d("syncAllUI: Executing IDLE draw");
    
    // 背景表示の更新
    POG_UI.updateText('round_display', data.round);
    const phaseMap = {
        'nomination': '指名受付中', 'reveal': '指名公開中', 
        'summary': '重複確認', 'lottery_reveal': '抽選実施中', 'lottery': '抽選終了'
    };
    POG_UI.updatePhaseLabel(data.phase, phaseMap);
    
    // 各コンポーネントの描画
    POG_UI.renderStatusCounter(data);
    POG_UI.renderPhaseUI(data);
    POG_UI.renderPlayerCards(data);
    
    // MCボタンの最終描画（チラつきポイントを完全制御）
    POG_UI.renderMCPanel(data, isManual);
}

/* ==========================================================================
   3. [Actions] Search & Nomination
   ========================================================================== */
async function searchHorses() {
    if (window.searchController) window.searchController.abort();
    window.searchController = new AbortController();

    const fInput = document.getElementById('s_father');
    const mInput = document.getElementById('s_mother');
    const resultsEl = document.getElementById('search_results');
    if (!fInput || !mInput || !resultsEl) return;

    const f = fInput.value;
    const m = mInput.value;
    const currentQuery = `f=${f}&m=${m}`;

    // 証拠：ガードされた理由を明確にする
    if (currentQuery === window.AppState.lastSearchQuery) {
        POG_Log.d(`SEARCH_SKIP: Query unchanged (${currentQuery})`);
        return;
    }
    if (!window.AppState.canUpdateUI()) {
        POG_Log.d(`SEARCH_SKIP: UI Busy (Mode=${window.AppState.uiMode})`);
        return;
    }

    window.AppState.lastSearchQuery = currentQuery;
    window.AppState.setMode('BUSY', 'searchHorses');
    POG_Log.i(`SEARCH_START: query=[${currentQuery}]`);
    resultsEl.innerHTML = '<div class="search-loading">サーバー通信中...</div>';

    try {
        const horses = await POG_API.search(f, m, window.searchController.signal);
        resultsEl.innerHTML = ""; 

        if (horses && horses.length > 0) {
            const me = decodeURIComponent(getCookie('pog_user') || "").replace(/\+/g, ' ');
            const d = window.AppState.latestData || {};
            const myNomination = (d.all_nominations) ? d.all_nominations.find(n => n.player_name === me && parseInt(n.round) === d.round && n.is_winner === 1) : null;
            const isMeWinner = !!myNomination;

            horses.forEach(h => {
                const card = document.createElement('div');
                card.className = "search-item-card card";
                card.innerHTML = `<div class="search-horse-name">${h.horse_name}</div><div class="search-horse-info">父: ${h.father_name} / 母: ${h.mother_name}</div>`;

                const btn = document.createElement('button');
                btn.type = "button";
                const isNominationPhase = (d.phase === 'nomination');
                const isOverLimit = (parseInt(d.round) > 10);

                if (isMeWinner) { btn.textContent = "指名確定済み"; btn.disabled = true; btn.className = "btn-search-action is-disabled"; }
                else if (isOverLimit) { btn.textContent = "全10頭 指名終了"; btn.disabled = true; btn.className = "btn-search-action is-disabled"; }
                else if (!isNominationPhase) { btn.textContent = "指名受付外"; btn.disabled = true; btn.className = "btn-search-action is-off"; }
                else { btn.textContent = "指名する"; btn.className = "btn-search-action active"; }
                
                btn.setAttribute('onclick', `event.preventDefault(); event.stopPropagation(); window.doNominate("${h.horse_name.replace(/"/g, '&quot;')}", "${h.mother_name.replace(/"/g, '&quot;')}")`);
                card.appendChild(btn);
                resultsEl.appendChild(card);
            });
        } else {
            resultsEl.innerHTML = '<div class="search-no-result">該当なし</div>';
        }
    } catch (e) {
        if (e.name !== 'AbortError') {
            resultsEl.innerHTML = `<div class="search-error">通信エラー: ${e.message}</div>`;
        }
    } finally { window.AppState.setMode('IDLE', 'searchHorses_finally'); }
}

window.doNominate = async function(name, mother) {
    window.doNominate = async function(name, mother) {
    POG_Log.i(`NOMINATE_ATTEMPT: horse="${name}"`);
    if (window.searchController) window.searchController.abort();
    
    if (!confirm(`${name} を指名しますか？`)) {
        POG_Log.i(`NOMINATE_CANCEL: User clicked cancel for "${name}"`);
        return;
    }

    window.AppState.setMode('BUSY', 'doNominate_start');

    if (window.statusTimer) { 
        clearInterval(window.statusTimer); 
        window.statusTimer = null; 
    }
    try {
        if (!confirm(`${name} を指名しますか？`)) return;

        const result = await POG_API.postNomination(name, mother);
        POG_Log.d(`NOMINATE_RESPONSE:`, result);
        const data = JSON.parse(result.text);
        if (data.status === 'success') {
            alert("指名完了");
            localStorage.setItem('activeTab', 'tab-my');
            location.reload();
        } else {
            alert("エラー: " + (data.message || "指名に失敗しました"));
        }
    } catch (e) { 
        POG_Log.e("Nominate error", e);
    } finally {
        await new Promise(resolve => setTimeout(resolve, 500));
        window.AppState.setMode('IDLE', 'doNominate_finally');
        if (!window.statusTimer) window.statusTimer = setInterval(updateStatus, 3000);
    }
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

window.downloadCSV = function() {
    const data = window.AppState.latestData; 
    if (!data || !data.all_nominations) return;
    const rows = [["参加者名", "指名順位", "馬名", "父名", "母名"]];
    data.all_nominations.forEach(n => {
        if (n && n.is_winner === 1) rows.push([n.player_name, n.round, n.horse_name, n.horses?.father_name || "", n.horses?.mother_name || n.mother_name || ""]);
    });
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const csvString = rows.map(e => e.join(",")).join("\n");
    const blob = new Blob([bom, csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `pog_result_round_${data.round}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};