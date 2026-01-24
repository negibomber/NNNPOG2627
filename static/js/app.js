/* ==========================================================================
   POG Main Application Module (app.js) - Ver.0.5
   ========================================================================== */
const APP_VERSION = "0.5.13";

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
        // 監視カメラ：MCボタンの属性変化を監視し、犯人を特定する
        const mcBtn = document.getElementById('mc_main_btn');
        if (mcBtn) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.attributeName === 'style' || mutation.attributeName === 'class') {
                        POG_Log.d(`MC_BTN_DETECTED: style=${mcBtn.style.display}, class=${mcBtn.className}`);
                        console.trace(); // ここで「誰が呼び出したか」の証拠をすべて出す
                    }
                });
            });
            observer.observe(mcBtn, { 
                attributes: true, 
                childList: true, 
                characterData: true, 
                subtree: true 
            });
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
    
    // 証拠：強制更新(force)以外は、フラグが立っている間は物理的に即座にリターンする
    if (window.AppState.isUpdating && !force) {
        return; 
    }
    window.AppState.isUpdating = true;
    
    try {
        let data = preFetchedData || await POG_API.fetchStatus();
        if (!data) return;

        window.AppState.latestData = data;
        const incomingLabel = data.mc_action?.label || "no_label";
        POG_Log.d(`DATA_RECEIVE: phase=${data.phase}, reveal_index=${data.reveal_index}, label=${incomingLabel}, uiMode=${window.AppState.uiMode}`);

        // MC操作(MC_ACTION)時は、ボタンの状態を確定させるために描画を許可する必要がある。
        if (caller === "AUTO_TIMER" && !window.AppState.canUpdateUI()) {
            return;
        }
        
        if (data.phase === undefined && DEBUG_MODE) {
            POG_Log.e("汚染データの流入を検知（phase未定義）", data);
        }

        // --- 1. 演出判定 ---
        const isNewReveal = (data.phase === 'reveal' && data.reveal_data && window.AppState.lastPlayedIdx !== data.reveal_index);
        const isNewLottery = (data.phase === 'lottery_reveal' && data.lottery_data && window.AppState.lastPlayedIdx !== data.reveal_index);
        const willStartTheater = isNewReveal || isNewLottery;

        // --- 2. 背景UIの描画 ---
        // メインのボタン以外（カードやフェーズ表示）は先に更新しておく
        POG_UI.updateText('round_display', data.round);
        const phaseMap = {
            'nomination': '指名受付中', 'reveal': '指名公開中', 
            'summary': '重複確認', 'lottery_reveal': '抽選実施中', 'lottery': '抽選終了'
        };
        POG_UI.updatePhaseLabel(data.phase, phaseMap);
        POG_UI.renderStatusCounter(data);
        POG_UI.renderPhaseUI(data);
        
        // 注意: BUSY時は renderPlayerCards がスキップされる仕様だが、背景更新としては正しい挙動
        POG_UI.renderPlayerCards(data);


        // --- 3. 状態遷移 (State Commit) ---
        // 【重要】ボタンを描画する「前」に、次のモードを確定させる。
        // これにより、直後の renderMCPanel が「THEATERだから隠す」のか「IDLEだから出す」のかを正しく判断できる。
        if (willStartTheater) {
            POG_Log.i(`Theater transition detected: ${window.AppState.lastPlayedIdx} -> ${data.reveal_index}`);
            window.AppState.setMode('THEATER', 'updateStatus');
            window.AppState.lastPlayedIdx = data.reveal_index;
        } else {
            // 演出終了判定
            const isTheaterOpen = document.getElementById('theater_layer').style.display === 'flex';
            const isTheaterPhase = ['reveal', 'lottery_reveal'].includes(data.phase);
            
            if (isTheaterOpen && !isTheaterPhase) {
                POG_Log.i(`Phase changed (${data.phase}). Closing theater.`);
                POG_Theater.close();
                window.AppState.lastPlayedIdx = -1;
                // ここでIDLEに戻すことで、直後のrenderMCPanelでボタンが正しく再表示される
                window.AppState.setMode('IDLE', 'updateStatus_close');
            }
        }

        // --- 4. MCボタンの描画 (UI Layer Finalize) ---
        // 証拠：これから演出が始まる（willStartTheater）なら、一瞬でもボタンを出さないよう描画自体をスキップする
        POG_Log.d(`RENDER_CHECK: willStartTheater=${willStartTheater}, isUpdating=${window.AppState.isUpdating}`);
        if (!willStartTheater) {
            POG_Log.d(`RENDER_MC_EXEC: phase=${data.phase}, next_msg=${data.mc_button_text || 'none'}`);
            POG_UI.renderMCPanel(data, isManual);
        } else {
            POG_Log.d("renderMCPanel SKIPPED: Theater transition in progress.");
        }

        // --- 5. 演出実行 ---
        if (willStartTheater) {
            // 決定的な証拠：演出開始のまさにその瞬間、MCボタンに何が書かれているか？
            const currentBtnText = document.getElementById('mc_main_btn')?.innerText;
            POG_Log.i(`THEATER_START_TRACE: BtnText="${currentBtnText}", DataPhase=${data.phase}, LastIdx=${window.AppState.lastPlayedIdx}`);
            
            POG_Log.d(`Starting Theater Animation`);
            POG_Theater.playReveal(data.reveal_data || data.lottery_data);
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
        window.AppState.isUpdating = false;
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