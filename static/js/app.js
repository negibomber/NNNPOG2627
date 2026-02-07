/* ==========================================================================
   POG Main Application Module (app.js) - Ver.0.11
   ========================================================================== */
const APP_VERSION = "0.11.6";

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

/* --- [UI Permission Matrix] 状態ごとの振る舞い定義 --- */
const UI_MATRIX = {
    1:  { name: 'nomination_editing',       board: 1, theater: 0, t_card: 0, t_lot: 0, mc_btn: '指名を送信', api: '/nominate' },
    2:  { name: 'nomination_waiting',       board: 1, theater: 0, t_card: 0, t_lot: 0, mc_btn: '指名待ち...', api: null },
    3:  { name: 'nomination_all_done',      board: 1, theater: 0, t_card: 0, t_lot: 0, mc_btn: '指名公開を開始 ≫', api: '/start_reveal' },
    4:  { name: 'reveal_ongoing',           board: 1, theater: 1, t_card: 1, t_lot: 0, mc_btn: '次の指名公開 ≫', api: '/next_reveal' },
    5:  { name: 'reveal_last_done',         board: 1, theater: 1, t_card: 1, t_lot: 0, mc_btn: '指名結果一覧 ≫', api: '/goto_summary' },
    6:  { name: 'summary_no_conflict',      board: 1, theater: 1, t_card: 0, t_lot: 0, mc_btn: '次の巡目へ ≫', api: '/next_round' },
    7:  { name: 'summary_has_conflict',     board: 1, theater: 1, t_card: 0, t_lot: 0, mc_btn: '抽選開始 ≫', api: '/start_lottery' },
    8:  { name: 'lot_select_waiting',       board: 1, theater: 1, t_card: 0, t_lot: 1, mc_btn: '抽選進行中...', api: null },
    9:  { name: 'lot_select_all_done',      board: 1, theater: 1, t_card: 0, t_lot: 1, mc_btn: '抽選結果を見る ≫', api: '/show_lottery_result' },
    10: { name: 'lot_result_next_exists',   board: 1, theater: 1, t_card: 0, t_lot: 1, mc_btn: '結果確認後、次の抽選へ ≫', api: '/next_lottery' },
    11: { name: 'lot_result_has_loser',     board: 1, theater: 1, t_card: 0, t_lot: 1, mc_btn: '結果確認後、再指名へ ≫', api: '/back_to_nomination' },
    12: { name: 'lot_result_all_confirmed', board: 1, theater: 1, t_card: 0, t_lot: 1, mc_btn: '結果確認後、次の巡目へ ≫', api: '/next_round' }
};

/**
 * 証拠：サーバーデータから現在のアプリ文脈（ID 1-12）を判定する一元的なロジック
 */
function resolveContextId(data) {
    const me = decodeURIComponent((typeof getCookie === 'function' ? getCookie('pog_user') : "") || "").replace(/\+/g, ' ');
    const phase = data.phase;
    const round = data.round;
    const allNoms = data.all_nominations || [];

    if (phase === 'nomination') {
        const myNom = allNoms.find(n => n.player_name === me && n.round === round && n.is_winner === 0);
        if (!myNom) return 1;
        const nominatedPlayers = new Set(allNoms.filter(n => n.round === round && n.is_winner === 0).map(n => n.player_name));
        const allDone = data.all_players.every(p => nominatedPlayers.has(p));
        return allDone ? 3 : 2;
    }
    if (phase === 'reveal') {
        const pastWinners = new Set(allNoms.filter(n => n.round === round && n.is_winner === 1).map(n => n.player_name));
        const activePlayersCount = data.all_players.filter(p => !pastWinners.has(p)).length;
        return (data.reveal_index < activePlayersCount - 1) ? 4 : 5;
    }
    if (phase === 'summary') {
        const hasConflict = allNoms.some(n => n.round === round && n.is_winner === 0);
        return hasConflict ? 7 : 6;
    }
    if (phase === 'lottery_select') {
        const lotData = data.lottery_data || {};
        const participants = lotData.participants || [];
        const choices = lotData.selections || {};
        const allChosen = participants.length > 0 && Object.keys(choices).length >= participants.length;
        return allChosen ? 9 : 8;
    }
    if (phase === 'lottery_result') {
        const hasMore = allNoms.some(n => n.round === round && n.is_winner === 0);
        if (hasMore) return 10;
        const hasLoser = allNoms.some(n => n.round === round && n.is_winner === -1);
        return hasLoser ? 11 : 12;
    }
    return 1;
}

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
        if (!data) return;

        window.AppState.latestData = data;

        // [New Logic] マトリクスIDの解決と設定の適用
        const contextId = resolveContextId(data);
        const config = UI_MATRIX[contextId];
        window.AppState.currentContextId = contextId;
        window.AppState.uiConfig = config;

        POG_Log.d(`DATA_RECEIVE: ID=${contextId}(${config.name}), phase=${data.phase}, idx=${data.reveal_index}, uiMode=${window.AppState.uiMode}, force=${force}`);

        // 演出遷移: マトリクスで theater:1 と定義され、かつインデックスが変わった場合に開始
        const isNewIdx = (window.AppState.lastPlayedIdx !== data.reveal_index);
        const currentTurn = parseInt(data.lottery_data?.turn_index || 0);
        const isSummaryPhase = (data.phase === 'summary');
        const willStartTheater = (config.theater === 1 && (isNewIdx || isSummaryPhase || (data.phase === 'lottery_select' && currentTurn !== (window.AppState.lastTurnIdx || 0))));

        if (willStartTheater) {
            POG_Log.i(`TRANSITION_DECISION: To THEATER (Reason: ID=${contextId} & NewIdx=${data.reveal_index} & Turn=${currentTurn} & Phase=${data.phase})`);
            window.AppState.setMode('THEATER', 'updateStatus');
            window.AppState.lastPlayedIdx = data.reveal_index;
            window.AppState.lastTurnIdx = currentTurn;
            
            // Router機能
            if (data.phase === 'lottery_select') {
                POG_Log.d(`ROUTER: Calling playLotterySelect`);
                POG_Theater.playLotterySelect(data.lottery_data);
            } else if (data.phase === 'lottery_result') {
                POG_Log.d(`ROUTER: Calling playLotteryResult`);
                POG_Theater.playLotteryResult(data.lottery_data);
            } else if (data.phase === 'summary') {
                POG_Log.d(`ROUTER: Summary phase detected, board will be handled by renderPhaseUI`);
            } else {
                POG_Log.d(`ROUTER: Calling playReveal`);
                POG_Theater.playReveal(data.reveal_data);
            }
        } else {
            // ゴースト演出の回収: マトリクスで theater:0 なのに演出画面が開いていたら閉じる
            const isTheaterOpen = document.getElementById('theater_layer').style.display === 'flex';
            if (isTheaterOpen && config.theater === 0) {
                POG_Log.i(`TRANSITION_DECISION: To IDLE (Reason: ID=${contextId} does not allow Theater)`);
                POG_Theater.close();
                window.AppState.lastPlayedIdx = -1;
                window.AppState.setMode('IDLE', 'updateStatus_close');
            }
        }

        // [New Logic] 描画許可判定: マトリクスの board フラグのみを信じる
        const isAllowedToDraw = (config.board === 1) || force;

        if (!isAllowedToDraw) {
            POG_Log.d(`UI_SYNC_HALT: 🛑 PROTECTION ACTIVE: (ID=${contextId}, Board=${config.board}, Force=${force})`);
            return;
        }

        // 許可された場合のみ描画実行 (configを渡す)
        syncAllUI(data, config);

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

function syncAllUI(data, config) {
    POG_Log.d(`syncAllUI: Executing draw (ID=${window.AppState.currentContextId})`);
    POG_UI.updateText('round_display', data.round);
    const phaseMap = {
        'nomination': '指名受付中', 'reveal': '指名公開中', 'summary': '重複確認',
        'lottery_select': '抽選中', 'lottery_result': '抽選結果', 'result': '確定'
    };
    POG_UI.updatePhaseLabel(data.phase, phaseMap);
    
    // Config(許可証)を各現場へ渡す
    POG_UI.renderStatusCounter(data, config);
    POG_UI.renderPhaseUI(data, config);
    POG_UI.renderPlayerCards(data, config);
    POG_UI.renderMCPanel(data, config);
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

        if ((!horses || horses.length === 0) && (f || m)) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'search-no-result card';
            emptyDiv.innerHTML = `
                <p>該当する馬が見つかりません</p>
                <div style="display:flex; gap:10px;">
                    <button class="btn btn-primary" style="flex:1;" onclick="doNominate('', document.getElementById('s_mother').value, document.getElementById('s_father').value, '牡')">この父母で指名(牡)</button>
                    <button class="btn btn-danger" style="flex:1;" onclick="doNominate('', document.getElementById('s_mother').value, document.getElementById('s_father').value, '牝')">この父母で指名(牝)</button>
                </div>`;
            resultsEl.appendChild(emptyDiv);
        }

        if (horses && horses.length > 0) {
            const me = decodeURIComponent(getCookie('pog_user') || "").replace(/\+/g, ' ');
            const d = window.AppState.latestData || {};
            // 修正：落選(-1)以外のレコード（0:未確定 or 1:当選）がある場合に「指名済み」とする
            const myNomination = (d.all_nominations) ? d.all_nominations.find(n => n.player_name === me && parseInt(n.round) === d.round && n.is_winner !== -1) : null;
            const isMeConfirmed = !!myNomination;

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
                if (isMeConfirmed) {
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

window.doNominate = async function(name, mother, father = '', sex = '') {
    // 証拠の収集：手動入力（name空）の場合、入力欄から最新の値を取得
    const finalMother = name ? mother : (mother || document.getElementById('s_mother')?.value || '').trim();
    const finalFather = name ? father : (father || document.getElementById('s_father')?.value || '').trim();

    // バリデーション：未登録馬の場合の必須チェック
    if (!name && (!finalMother || !finalFather)) {
        alert("未登録馬の指名には、父名と母名の両方が必要です。");
        return;
    }

    const dispName = name || `${finalMother}の2024 (${sex})`;
    if (!confirm(`${dispName} を指名しますか？`)) return;

    window.AppState.setMode('BUSY', 'doNominate');
    try {
        const result = await POG_API.postNomination(name, mother, father, sex);
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

// MC専用：指名情報の修正（血統必須・存在チェック付）
window.editNominationByMC = async function(playerName, round) {
    const newFather = prompt(`【MC修正】${playerName} (第${round}巡)\n父名を入力してください:`, "");
    if (!newFather) return;
    
    const newMother = prompt("母名を入力してください:", "");
    if (!newMother) return;
    
    const newSex = prompt("性別を入力してください（牡/牝）:", "");
    if (!['牡', '牝'].includes(newSex)) { alert("性別は「牡」または「牝」で入力してください。"); return; }

    window.AppState.setMode('BUSY', 'editNominationByMC');
    try {
        // horsesテーブルに存在するか証拠を照合（馬名特定のため）
        const horses = await POG_API.search(newFather, newMother);
        const matched = (horses && horses.length > 0) ? horses[0] : null; 
        
        let isManual = !matched;
        let finalName = matched ? matched.horse_name : `${newMother}の2024`;
        let confirmMsg = matched 
            ? `【マスタ一致】\n馬名: ${finalName}\nとして修正しますか？`
            : `【マスタ未登録馬】ですが、\n馬名: ${finalName}\nとして修正しますか？`;

        if (!confirm(confirmMsg)) {
            window.AppState.setMode('IDLE', 'editNominationByMC_cancel');
            return;
        }

        const formData = new URLSearchParams();
        formData.append('target_player', playerName);
        formData.append('target_round', round);
        formData.append('horse_name', finalName); // 自動決定した名前を送信
        formData.append('mother_name', newMother);
        formData.append('father_name', newFather);
        formData.append('sex', newSex);
        formData.append('is_manual', isManual ? "1" : "0");

        const res = await fetch('/mc/update_nomination', {
            method: 'POST',
            body: formData
        });
        const result = await res.json();

        if (result.status === 'success') {
            await updateStatus(null, true);
        } else {
            alert("エラー: " + result.message);
        }
    } catch (e) {
        POG_Log.e("MC Edit Error", e);
    } finally {
        window.AppState.setMode('IDLE', 'editNominationByMC_finally');
    }
};

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

// --- [Utility] CSV Export Logic ---
window.downloadCSV = function() {
    const data = window.AppState.latestData;
    if (!data || !data.all_nominations) {
        alert("保存するデータがありません。");
        return;
    }

    // 当選確定データ（is_winner: 1）のみを抽出してソート
    const winners = data.all_nominations
        .filter(n => n.is_winner === 1)
        .sort((a, b) => (parseInt(a.round) - parseInt(b.round)) || a.player_name.localeCompare(b.player_name));

    if (winners.length === 0) {
        alert("当選確定した指名がまだありません。");
        return;
    }

    // CSVヘッダーとコンテンツの構築
    let csvContent = "巡目,指名者,馬名,性別,父,母,厩舎,生産者\n";
    winners.forEach(n => {
        const row = [
            n.round,
            n.player_name,
            n.horse_name,
            n.horses?.sex || "",
            n.horses?.father_name || "",
            n.horses?.mother_name || n.mother_name || "",
            n.horses?.stable || "",
            n.horses?.breeder || ""
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
        csvContent += row + "\n";
    });

    // Excelでの文字化け防止のためBOMを付与してダウンロード
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.setAttribute("href", url);
    link.setAttribute("download", `pog_results_${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    POG_Log.i("CSV_DOWNLOAD_SUCCESS", { count: winners.length });
};