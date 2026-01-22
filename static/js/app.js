/* ==========================================================================
   POG Main Application Module (app.js) - Ver.0.5
   ========================================================================== */

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
    uiMode: 'IDLE',      // 'IDLE', 'BUSY' (通信中), 'THEATER' (演出中)
    latestData: null,    // 唯一のデータソース
    lastPlayedIdx: -1,   // 演出重複防止
    isUpdating: false,   // 通信ロック

    // UI更新の唯一の判断基準
    canUpdateUI() {
        return this.uiMode === 'IDLE';
    },

    // 状態遷移の記録（現行犯逮捕用）
    setMode(newMode, caller) {
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
    const APP_VERSION = "0.5.2";
    console.log(`--- POG APP START (Ver.${APP_VERSION}) ---`);

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
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    window.statusTimer = setInterval(updateStatus, 3000);
})();

/**
 * フェーズ遷移に伴うリロードが必要か判定する
 */
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
    const caller = force ? "MC_ACTION" : (preFetchedData ? "PRE_FETCHED" : "AUTO_TIMER");
    const isManual = force || (preFetchedData === null && !window.statusTimer);
    
    POG_Log.d(`updateStatus INVOKE: caller=${caller}, force=${force}`);

    // 証拠：強制更新(force)以外は、フラグが立っている間は物理的に即座にリターンする
    if (window.AppState.isUpdating && !force) {
        POG_Log.d(`updateStatus ABORTED: Parallel execution blocked for ${caller}`);
        return; 
    }
    window.AppState.isUpdating = true;
    POG_Log.d(`updateStatus START: isManual=${isManual}`);
    try {
        let data = preFetchedData || await POG_API.fetchStatus();
        if (!data) return;

        window.AppState.latestData = data;

        // 証拠：演出中(THEATER)は、最新データが届いてもUIの再描画を完全にブロックする
        // 証拠：自動更新(AUTO_TIMER)時のみ、演出中(THEATER)の再描画をブロックする。
        // MC操作(MC_ACTION)時は、ボタンの状態を確定させるために描画を許可する必要がある。
        if (caller === "AUTO_TIMER" && !window.AppState.canUpdateUI()) {
            POG_Log.d(`UI_REFRESH ABORTED: caller=${caller}`);
            return;
        }
        
        if (data.phase === undefined && DEBUG_MODE) {
            POG_Log.e("汚染データの流入を検知（phase未定義）", data);
        }

        // --- UI Layer Call ---
        POG_UI.updateText('round_display', data.round);
        const phaseMap = {
            'nomination': '指名受付中', 'reveal': '指名公開中', 
            'summary': '重複確認', 'lottery_reveal': '抽選実施中', 'lottery': '抽選終了'
        };
        POG_UI.updatePhaseLabel(data.phase, phaseMap);

        POG_UI.renderStatusCounter(data);
        POG_UI.renderPlayerCards(data);
        POG_UI.renderPhaseUI(data);

        POG_Log.d(`UI_REFRESH EXEC: caller=${caller}, phase=${data.phase}, idx=${data.reveal_index}`);

        POG_UI.renderMCPanel(data, isManual);

        // --- Theater Mode Trigger ---
        if (data.phase === 'reveal' && data.reveal_data) {
            const revealIdx = data.reveal_index;
            // 証拠：新しいインデックスのデータが届いた時のみ、古い演出ガードを解いて次を開始する。
            // これにより「通信完了〜次のデータ到着」までの空白期間も is_playing=true が維持される。
            if (window.AppState.lastPlayedIdx !== revealIdx) {
                POG_Log.i(`New Index detected: ${window.AppState.lastPlayedIdx} -> ${revealIdx}. Starting Theater Mode.`);
                window.AppState.setMode('THEATER', 'updateStatus');
                window.AppState.lastPlayedIdx = revealIdx;
                POG_Theater.playReveal(data.reveal_data);
            }
        } else {
            // [あるべき姿] 指名公開データが尽きた、あるいは公開フェーズを抜けた場合は演出を閉じる
            if (document.getElementById('theater_layer').style.display === 'flex') {
                POG_Log.i(`Phase changed (${data.phase}) or No data. Closing theater.`);
                POG_Theater.close();
                window.AppState.lastPlayedIdx = -1;
            }
        }

        if (shouldReloadPage(window.AppState.lastPhase, data.phase)) {
            window.AppState.lastPhase = data.phase;
            location.reload();
            return;
        }
        window.AppState.lastPhase = data.phase;
    } catch (e) {
        POG_Log.e("Status update error", e);
    } finally {
        window.AppState.isUpdating = false; // 必ずロックを解除
    }
}

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

    if (currentQuery === window.AppState.lastSearchQuery || !window.AppState.canUpdateUI()) return;

    if (f.length < 2 && m.length < 2) {
        resultsEl.innerHTML = "";
        window.AppState.lastSearchQuery = currentQuery;
        return;
    }

    window.AppState.lastSearchQuery = currentQuery;
    window.AppState.setMode('BUSY', 'searchHorses');
    POG_Log.d(`searchHorses START: ${currentQuery}`);
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
                
                // 証拠：onmousedownでの個別フラグ操作を廃止。doNominate内のsetModeで統治する。
                btn.setAttribute('onclick', `event.preventDefault(); event.stopPropagation(); window.doNominate("${h.horse_name.replace(/"/g, '&quot;')}", "${h.mother_name.replace(/"/g, '&quot;')}")`);

                card.appendChild(btn);
                resultsEl.appendChild(card);
            });
        } else {
            resultsEl.innerHTML = '<div class="search-no-result">該当なし</div>';
        }
    } catch (e) {
        if (e.name !== 'AbortError') {
            POG_Log.e("Search horses error", e);
            resultsEl.innerHTML = `<div class="search-error">通信エラー: ${e.message}</div>`;
        }
    } finally { window.AppState.setMode('IDLE', 'searchHorses_finally'); }
}

window.doNominate = async function(name, mother) {
    if (window.searchController) window.searchController.abort();
    window.AppState.setMode('BUSY', 'doNominate');

    // 安全にタイマーを停止
    if (window.statusTimer) { 
        POG_Log.d(`TIMER_STOP: ID=${window.statusTimer}`);
        clearInterval(window.statusTimer); 
        window.statusTimer = null; 
    }
    try {
        if (!confirm(`${name} を指名しますか？`)) {
            return;
        }

        const result = await POG_API.postNomination(name, mother);
        const resText = result.text;

        let data;
        try { data = JSON.parse(resText); } catch(e) {
            alert(`致命的エラーが発生しました(HTTP ${result.status})\n\n${resText.substring(0, 300)}`);
            return;
        }
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
        // --- 反映猶予：サーバーDBの書き換え完了を待つ ---
        await new Promise(resolve => setTimeout(resolve, 500));
        window.AppState.setMode('IDLE', 'doNominate_finally');
        if (!window.statusTimer) window.statusTimer = setInterval(updateStatus, 3000);
        POG_Log.d(`TIMER_RESTART: ID=${window.statusTimer}`);
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

    // 文字化け対策：UTF-8 BOM (0xEF, 0xBB, 0xBF) を追加
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