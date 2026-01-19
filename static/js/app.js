/* ==========================================================================
   POG Main Application Module (app.js) - Ver.0.3.1
   ========================================================================== */

const DEBUG_MODE = true;
const debugLog = (msg, data = null) => {
    if (DEBUG_MODE) {
        if (data) console.log(`[POG_DEBUG] ${msg}`, data);
        else console.log(`[POG_DEBUG] ${msg}`);
    }
};

// --- [State Management] アプリケーションの状態を一括管理 ---
window.AppState = {
    lastPhase: "",
    lastSearchQuery: "",
    isSearching: false,
    isProcessingNomination: false,
    latestData: null,
    lastStatusFingerprint: ""
};

window.searchController = null;
window.statusTimer = null;

/* ==========================================================================
   1. [Core] App Initialization
   ========================================================================== */
(function() {
    const APP_VERSION = "0.3.1";
    console.log(`--- POG APP START (Ver.${APP_VERSION}) ---`);

    const init = () => {
        updateStatus();
        const fInput = document.getElementById('s_father');
        const mInput = document.getElementById('s_mother');

        if (fInput && mInput) {
            fInput.oninput = null;
            mInput.oninput = null;

            const handleInput = (e) => {
                if (window.AppState.isSearching || window.AppState.isProcessingNomination || document.activeElement?.tagName === 'BUTTON') {
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
async function updateStatus(preFetchedData = null) {
    debugLog(`[EVIDENCE_IN] updateStatus called.`);
    try {
        let data = preFetchedData || await POG_API.fetchStatus();
        if (!data) return;

        window.AppState.latestData = data;
        
        if (data.phase === undefined && DEBUG_MODE) {
            console.error("[CRITICAL_EVIDENCE] 汚染データの流入を検知:", data);
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

        updateMCButtons(data);

        if (shouldReloadPage(window.AppState.lastPhase, data.phase)) {
            window.AppState.lastPhase = data.phase;
            location.reload();
            return;
        }
        window.AppState.lastPhase = data.phase;
    } catch (e) { console.error("Status update error:", e); }
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

    if (currentQuery === window.AppState.lastSearchQuery || window.AppState.isSearching || window.AppState.isProcessingNomination) return;

    if (f.length < 2 && m.length < 2) {
        resultsEl.innerHTML = "";
        window.AppState.lastSearchQuery = currentQuery;
        return;
    }

    window.AppState.lastSearchQuery = currentQuery;
    window.AppState.isSearching = true;
    resultsEl.innerHTML = '<div class="search-loading">[DEBUG] サーバー通信中...</div>';

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
                
                btn.onmousedown = () => { window.AppState.isProcessingNomination = true; };
                btn.setAttribute('onclick', `event.preventDefault(); event.stopPropagation(); window.doNominate("${h.horse_name.replace(/"/g, '&quot;')}", "${h.mother_name.replace(/"/g, '&quot;')}")`);

                card.appendChild(btn);
                resultsEl.appendChild(card);
            });
        } else {
            resultsEl.innerHTML = '<div class="search-no-result">[DEBUG] 該当なし</div>';
        }
    } catch (e) {
        if (e.name !== 'AbortError') resultsEl.innerHTML = `<div class="search-error">通信エラー: ${e.message}</div>`;
    } finally { window.AppState.isSearching = false; }
}

window.doNominate = async function(name, mother) {
    if (window.searchController) window.searchController.abort();
    window.AppState.isProcessingNomination = true; 

    if (window.statusTimer) { clearInterval(window.statusTimer); window.statusTimer = null; }
    try {
        if (!confirm(`${name} を指名しますか？`)) {
            window.AppState.isProcessingNomination = false;
            if (!window.statusTimer) window.statusTimer = setInterval(updateStatus, 3000);
            return;
        }

        const result = await POG_API.postNomination(name, mother);
        const resText = result.text;

        let data;
        try { data = JSON.parse(resText); } catch(e) {
            alert(`致命的エラーが発生しました(HTTP ${result.status})\n\n${resText.substring(0, 300)}`);
            window.AppState.isProcessingNomination = false;
            window.statusTimer = setInterval(updateStatus, 3000);
            return;
        }
        if (data.status === 'success') {
            alert("指名完了");
            localStorage.setItem('activeTab', 'tab-my');
            location.reload();
        } else {
            alert("エラー: " + (data.message || "指名に失敗しました"));
            window.AppState.isProcessingNomination = false;
            window.statusTimer = setInterval(updateStatus, 3000);
        }
    } catch (e) { 
        console.error("Nominate error:", e); 
        window.AppState.isProcessingNomination = false;
        window.statusTimer = setInterval(updateStatus, 3000);
    }
}

async function mcAction(url) {
    if (window.statusTimer) { clearInterval(window.statusTimer); window.statusTimer = null; }
    const mainBtn = document.getElementById('mc_main_btn');
    if (mainBtn) { mainBtn.disabled = true; mainBtn.innerText = "処理中..."; }
    try {
        const newData = await POG_API.postMCAction(url);
        window.AppState.lastPhase = newData.phase;
        await updateStatus(newData);
    } catch (e) { console.error("MC Action Error:", e); }
    finally { if (!window.statusTimer) window.statusTimer = setInterval(updateStatus, 3000); }
}

window.startReveal = () => mcAction('/mc/start_reveal');
window.nextReveal = () => mcAction('/mc/next_reveal');
window.runLottery = () => mcAction('/mc/run_lottery');
window.advanceLottery = () => mcAction('/mc/advance_lottery');
window.nextRound = () => mcAction('/mc/next_round');

function updateMCButtons(data) {
    const phase = data.phase;
    const mainBtn = document.getElementById('mc_main_btn');
    if (!mainBtn) return;

    const setBtn = (btn, active, colorClass = "") => {
        btn.classList.remove('mc-bg-blue', 'mc-bg-emerald');
        if (colorClass) btn.classList.add(colorClass); 
        btn.disabled = !active;
        btn.className = active ? `mc_main_btn active ${colorClass}` : "mc_main_btn disabled";
    };

    if (phase === 'nomination') {
        const currentRoundInt = parseInt(data.round);
        const winners = (data.all_nominations || []).filter(n => parseInt(n.round) === currentRoundInt && n.is_winner === 1);
        const target = (data.total_players || 0) - new Set(winners.map(n => n.player_name)).size;
        const noms = (data.all_nominations || []).filter(n => parseInt(n.round) === currentRoundInt && n.is_winner === 0);
        const nominated = new Set(noms.map(n => n.player_name)).size;
        
        const isReady = data.is_all_nominated || (nominated >= target && target > 0);
        mainBtn.innerText = isReady ? "指名公開を開始する" : "指名待機中";
        mainBtn.onclick = isReady ? window.startReveal : null;
        setBtn(mainBtn, isReady, "mc-bg-blue");

    } else if (phase === 'reveal') {
        const isEnd = (data.reveal_index >= (data.total_players || 0) - 1);
        mainBtn.innerText = isEnd ? "指名結果を表示" : `次の指名を公開 (あと ${data.total_players - data.reveal_index - 1}人)`;
        mainBtn.onclick = isEnd ? window.runLottery : window.nextReveal;
        setBtn(mainBtn, true, isEnd ? "mc-bg-emerald" : "mc-bg-blue");

    } else if (phase === 'summary') {
        if (data.has_duplicates) {
            mainBtn.innerText = "抽選を開始";
            mainBtn.onclick = window.advanceLottery;
            setBtn(mainBtn, true, "mc-bg-blue");
        } else {
            mainBtn.innerText = (parseInt(data.round) >= 10) ? "ドラフト終了" : "次の巡へ進む";
            mainBtn.onclick = window.nextRound; 
            setBtn(mainBtn, true, "mc-bg-emerald");
        }
    } else if (phase === 'lottery_reveal') {
        const isEnd = ((data.lottery_idx || 0) + 1 >= (data.lottery_queue || []).length);
        mainBtn.innerText = isEnd ? "再指名へ進む" : "次の抽選結果を表示";
        mainBtn.onclick = isEnd ? window.nextRound : window.advanceLottery;
        setBtn(mainBtn, true, isEnd ? "mc-bg-emerald" : "mc-bg-blue");

    } else if (phase === 'lottery') {
        mainBtn.innerText = "再指名へ進む"; // シンプル化
        mainBtn.onclick = window.nextRound;
        setBtn(mainBtn, true, "mc-bg-blue");
    } else if (phase === 'finished') {
        mainBtn.innerText = "ドラフト終了";
        setBtn(mainBtn, false, "mc-bg-gray");
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