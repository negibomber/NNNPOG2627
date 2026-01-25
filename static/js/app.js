/* ==========================================================================
   POG Main Application Module (app.js) - Ver.0.8
   ========================================================================== */
const APP_VERSION = "0.8.5";

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
    lastPhase: "",

    canUpdateUI() {
        return this.uiMode === 'IDLE';
    },

    setMode(newMode, caller) {
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

        const isNewReveal = (data.phase === 'reveal' && data.reveal_data && window.AppState.lastPlayedIdx !== data.reveal_index);
        const isNewLottery = (data.phase === 'lottery_reveal' && data.lottery_data && window.AppState.lastPlayedIdx !== data.reveal_index);
        const willStartTheater = isNewReveal || isNewLottery;

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

        if (willStartTheater) {
            POG_Log.i(`THEATER_LAUNCH: Calling playReveal`);
            POG_Theater.playReveal(data.reveal_data || data.lottery_data);
        }

        // --- 統治権の厳格化: AND条件による許可制描画 ---
        const isTheaterActive = (window.AppState.uiMode === 'THEATER');
        const canUpdate = window.AppState.canUpdateUI();

        // 許可条件: 「演出中でない」 かつ 「(待機中である または 強制フラグがある)」
        const isAllowedToDraw = (!isTheaterActive) && (canUpdate || force);

        POG_Log.d(`DRAW_GATE_CHECK: mode=${window.AppState.uiMode}, force=${force}, allow=${isAllowedToDraw}`);

        if (!isAllowedToDraw) {
            POG_Log.d(`UI_SYNC_HALT: 🛑 PROTECTION ACTIVE: (Theater=${isTheaterActive}, canUpdate=${canUpdate}, force=${force})`);
            return;
        }

        // --- 許可された場合のみ描画実行 ---
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
    }
}
function syncAllUI(data, isManual = false) {
    POG_Log.d("syncAllUI: Executing IDLE draw");
    POG_UI.updateText('round_display', data.round);
    const phaseMap = {
        'nomination': '指名受付中', 'reveal': '指名公開中', 
        'summary': '重複確認', 'lottery_reveal': '抽選実施中', 'lottery': '抽選終了'
    };
    POG_UI.updatePhaseLabel(data.phase, phaseMap);
    POG_UI.renderStatusCounter(data);
    POG_UI.renderPhaseUI(data);
    POG_UI.renderPlayerCards(data);
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

    if (currentQuery === window.AppState.lastSearchQuery || !window.AppState.canUpdateUI()) return;

    window.AppState.lastSearchQuery = currentQuery;
    window.AppState.setMode('BUSY', 'searchHorses');

    try {
        const horses = await POG_API.search(f, m, window.searchController.signal);
        resultsEl.innerHTML = ""; 
        if (horses && horses.length > 0) {
            const me = decodeURIComponent(getCookie('pog_user') || "").replace(/\+/g, ' ');
            const d = window.AppState.latestData || {};
            const myNomination = (d.all_nominations) ? d.all_nominations.find(n => n.player_name === me && parseInt(n.round) === d.round && n.is_winner === 1) : null;
            const isMeWinner = !!myNomination;

            const template = document.getElementById('temp-search-card');

            horses.forEach(h => {
                const clone = template.content.cloneNode(true);
                
                // 馬名と性別（牡牝）の設定：innerHTMLを排除し安全に反映
                clone.querySelector('.js-name').textContent = h.horse_name;
                const sexEl = clone.querySelector('.js-sex');
                sexEl.textContent = h.sex; 
                sexEl.className = h.sex === '牡' ? 'sex-m' : (h.sex === '牝' ? 'sex-f' : '');

                // 血統情報
                clone.querySelector('.search-horse-info').textContent = `父: ${h.father_name} / 母: ${h.mother_name}`;

                // ボタン制御
                const btn = clone.querySelector('.btn-search-action');
                if (isMeWinner) {
                    btn.textContent = "指名確定済み";
                    btn.disabled = true;
                    btn.classList.add('is-disabled');
                } else {
                    btn.textContent = "指名する";
                    btn.classList.add('active');
                    btn.onclick = (e) => {
                        e.preventDefault();
                        window.doNominate(h.horse_name, h.mother_name);
                    };
                }
                resultsEl.appendChild(clone);
            });
        }
    } catch (e) {
        if (e.name !== 'AbortError') POG_Log.e("Search error", e);
    } finally {
        window.AppState.setMode('IDLE', 'searchHorses_finally');
    }
}

window.doNominate = async function(name, mother) {
    if (!confirm(`${name} を指名しますか？`)) return;
    window.AppState.setMode('BUSY', 'doNominate');
    try {
        const result = await POG_API.postNomination(name, mother);
        const data = JSON.parse(result.text);
        if (data.status === 'success') {
            location.reload();
        } else {
            alert("エラー: " + data.message);
        }
    } catch (e) { 
        POG_Log.e("Nominate error", e);
    } finally {
        window.AppState.setMode('IDLE', 'doNominate_finally');
    }
};

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}