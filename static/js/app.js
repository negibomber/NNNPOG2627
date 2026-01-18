const DEBUG_MODE = true; // 開発時は true、本番は false に切り替え
const debugLog = (msg, data = null) => {
    if (DEBUG_MODE) {
        if (data) console.log(`[POG_DEBUG] ${msg}`, data);
        else console.log(`[POG_DEBUG] ${msg}`);
    }
};
(function() {
    const APP_VERSION = "0.2.4";
    console.log(`--- POG DEBUG START (Ver.${APP_VERSION}) ---`);
    console.log("1. スクリプトの読み込みを確認しました.");

    const init = () => {
        console.log(`2. 初期化関数(init) Ver.${APP_VERSION} が実行されました.`);
        updateStatus();
        
        const fInput = document.getElementById('s_father');
        const mInput = document.getElementById('s_mother');
        const resultsEl = document.getElementById('search_results');

        // 各要素の存在チェックをログ出力
        console.log("3. HTML要素のチェック:", {
            "父入力(s_father)": fInput ? "OK" : "MISSING",
            "母入力(s_mother)": mInput ? "OK" : "MISSING",
            "結果エリア(search_results)": resultsEl ? "OK" : "MISSING"
        });

        if (fInput && mInput) {
            console.log("4. 監視(addEventListener)を登録します.");
            
            // 既存のイベントを一度クリア（重複防止）
            fInput.oninput = null;
            mInput.oninput = null;

            // 入力があったら即座に searchHorses() を実行
            fInput.addEventListener('input', (e) => {
                // 【修正】Firefox対策：通信中、または指名処理(confirm表示中)は検索を完全にブロック
                // さらに、現在フォーカスが「指名する」ボタンにある場合（クリックの瞬間）も検索を阻止する
                if (window.isSearching || window.isProcessingNomination || document.activeElement?.tagName === 'BUTTON') {
                    console.log("-> 入力検知しましたが、処理中のため検索をスキップします.");
                    return;
                }
                console.log(`-> 父入力検知: "${e.target.value}"`);
                searchHorses();
            });
            mInput.addEventListener('input', (e) => {
                // 【修正】Firefox対策
                if (window.isSearching || window.isProcessingNomination || document.activeElement?.tagName === 'BUTTON') {
                    console.log("-> 入力検知しましたが、処理中のため検索をスキップします.");
                    return;
                }
                console.log(`-> 母入力検知: "${e.target.value}"`);
                searchHorses();
            });
            console.log("5. 監視の登録が完了しました。入力待ちです.");
        } else {
            console.error("CRITICAL: 入力欄が見つかりません。HTMLのIDが正しいか確認してください.");
        }
    };

    // DOMの読み込み状況に合わせて初期化を実行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    // 【修正】タイマーIDを管理し、指名処理中は停止できるようにする
    window.statusTimer = setInterval(updateStatus, 3000);
})();

// グローバルスコープで管理
window.lastPhase = "";
window.lastSearchQuery = ""; // 【追加】重複検索・再描画防止用
window.isSearching = false;  // 【追加】通信中フラグ
window.isProcessingNomination = false; // 【追加】指名処理中(confirm表示中)フラグ

// --- ステータス更新 (既存機能維持) ---
async function updateStatus(preFetchedData = null) {
    debugLog(`[EVIDENCE_IN] updateStatus called. Source: ${preFetchedData ? 'Argument' : 'Fetch'}, Phase in Arg: ${preFetchedData?.phase}`);
    try {
        let data;
        if (preFetchedData) {
            // 【聖約：現行犯逮捕】データ汚染（phaseなし）を検知した際に証拠を全出力
            if (preFetchedData.phase === undefined && DEBUG_MODE) {
                console.error("[CRITICAL_EVIDENCE] 汚染データの流入を検知:", {
                    arg: preFetchedData,
                    stack: new Error().stack
                });
            }
            data = preFetchedData;
        } else {
            const res = await fetch('/status');
            if (!res.ok) return;
            data = await res.json();
        }
        window.latestStatusData = data; // 【追加】他関数から参照可能にする

        const updateText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.innerText = text;
        };

        updateText('round_display', data.round);
        
        const phaseMap = {
            'nomination': '指名受付中', 
            'reveal': '指名公開中', 
            'summary': '重複確認',
            'lottery_reveal': '抽選実施中',
            'lottery': '抽選終了'
        };
        const currentPhase = String(data.phase || "").trim().toLowerCase(); // 小文字に統一して比較
        console.log(`[DEBUG] Current Phase from server: "${currentPhase}"`); // 追跡用ログ
        if (currentPhase) {
            updateText('phase_label', phaseMap[currentPhase] || currentPhase);
        }

        // 指名人数の更新を優先（MCボタンのエラーに巻き込まれないようにする）
        const counterEl = document.getElementById('status_counter');
        const currentRoundInt = parseInt(data.round);
        const allNoms = Array.isArray(data.all_nominations) ? data.all_nominations : [];

        if (counterEl) {
            // 証拠収集用ログ：2巡目開始時の計算の元ネタを確認
            console.log(`[EVIDENCE_LOG] Round:${currentRoundInt}, TotalPlayers:${data.total_players}, AllNomsLen:${allNoms.length}`);
            console.log(`[EVIDENCE_LOG] 2巡目当選者リスト:`, allNoms.filter(n => parseInt(n.round) === currentRoundInt && n.is_winner === 1));
            // 今巡ですでに当選(1)している人数をカウント
            const currentWinnersCount = new Set(allNoms
                .filter(n => n && parseInt(n.round) === currentRoundInt && n.is_winner === 1)
                .map(n => n.player_name)).size;
            
            // 指名すべき総人数から、今巡の当選者を引く
            const realTargetCount = (data.total_players || 0);

            const nominatedPlayers = new Set(allNoms.filter(n => n && parseInt(n.round) === currentRoundInt && n.is_winner === 0).map(n => n.player_name));
            const winners = new Set(allNoms.filter(n => parseInt(n.round) === currentRoundInt && n.is_winner === 1).map(n => n.player_name));
            const waitingPlayers = data.all_players.filter(p => !winners.has(p) && !nominatedPlayers.has(p));

            counterEl.innerText = `指名状況: ${nominatedPlayers.size} / ${realTargetCount} 人`;

            const waitDiv = document.getElementById('waiting_list_bar');
            if (waitDiv) {
                if (waitingPlayers.length > 0 && data.phase === 'nomination') {
                    waitDiv.innerText = `指名検討中: ${waitingPlayers.join(', ')}`;
                    waitDiv.classList.add('is-visible'); waitDiv.classList.remove('is-hidden');
                } else {
                    waitDiv.classList.add('is-hidden'); waitDiv.classList.remove('is-visible');
                }
            }
        }

        const allStatusDiv = document.getElementById('all_status_list');
        if (allStatusDiv && data.all_players && data.all_nominations) {
            // 【修正】データに変化がない場合は重いDOM操作(innerHTML)をスキップする
            const currentFingerprint = JSON.stringify(data.all_nominations) + data.phase + data.reveal_index;
            if (window.lastStatusFingerprint === currentFingerprint) {
                // 変化なし
            } else {
                window.lastStatusFingerprint = currentFingerprint;
                const me = decodeURIComponent(getCookie('pog_user') || "").replace(/\+/g, ' ');
                let html = '';

                data.all_players.forEach(playerName => {
                    html += `<div class="card">`;
                    html += `<h3 class="card-title-border">${playerName}</h3>`;
                    html += `<table class="status-table">`;
                    html += `<thead><tr><th>巡</th><th>馬名 / 血統</th></tr></thead>`;

                    const playerNoms = data.all_nominations
                        .filter(n => n.player_name === playerName)
                        .sort((a, b) => a.round - b.round);

                    if (playerNoms.length === 0) {
                        html += `<tr><td colspan="2" class="status-empty-msg">まだ指名がありません</td></tr>`;
                    } else {
                        playerNoms.forEach(n => {
                            // 1. 基本情報の取得
                            const isMe = (playerName === me);
                            const isCurrentRound = (n.round === data.round);
                            const isUnconfirmed = (n.is_winner === 0);

                            // 2. 「他人の未確定な今巡の指名」を隠すべきかどうかの判定（ステータスベース）
                            let shouldHide = false;
                            let hideMsg = '??? (未公開)';

                            if (!isMe && isCurrentRound && isUnconfirmed) {
                                if (data.phase === 'nomination') {
                                    shouldHide = true;
                                    hideMsg = '??? (指名済み)';
                                } else if (data.phase === 'reveal') {
                                    const playerIdx = data.all_players.indexOf(playerName);
                                    if (playerIdx > data.reveal_index) {
                                        shouldHide = true;
                                        hideMsg = '??? (公開待ち)';
                                    }
                                } else if (['summary', 'lottery_reveal'].includes(data.phase)) {
                                    shouldHide = true;
                                    hideMsg = '??? (抽選待ち)';
                                }
                            }

                            // 3. 表示用データの確定
                            const hName = shouldHide ? hideMsg : n.horse_name;
                            const father = n.horses?.father_name || '-';
                            const mother = n.horses?.mother_name || n.mother_name || '-';
                            const winStatusClass = n.is_winner === 1 ? 'winner' : (n.is_winner === -1 ? 'loser' : 'pending');

                            // 4. HTML組み立て（フラグ一つで馬名も血統も制御）
                            html += `<tr>`;
                            html += `<td class="col-round">${n.round}</td>`;
                            html += `<td class="col-horse ${winStatusClass}">`;
                            html += `<div>${hName}</div>`;
                            if (!shouldHide) {
                                html += `<div class="col-horse-sub">${father} / ${mother}</div>`;
                            }
                            html += `</td></tr>`;
                        });
                    }
                    html += '</table></div>';
                });
                allStatusDiv.innerHTML = html;
            }
        }

        // 最後に依存度の低いMCボタン更新を実行
        console.log(`[TRACE_3] calling updateMCButtons now`); // 追加
        updateMCButtons(data);

        // 【修正】リロードが必要なのは「指名終了時」と「次の巡へ進む時」だけに限定し、チラつきを防止
        if (window.lastPhase !== undefined && window.lastPhase !== "" && window.lastPhase !== data.phase) {
            const needReload = (window.lastPhase === 'lottery' || data.phase === 'nomination');
            window.lastPhase = data.phase;
            if (needReload) {
                console.log("[PHASE_CHANGE] リロードを実行します");
                location.reload();
                return;
            }
            console.log("[PHASE_CHANGE] フェーズが切り替わりました（リロードなし）");
        }
        window.lastPhase = data.phase;

        // ブラウザコンソールで同期状態を確認できるようにする
        console.debug(`[SYNC] Phase:${data.phase}, RevealIdx:${data.reveal_index}, ActiveCount:${data.total_players}`);

// --- 抽選まとめ・演出画面の表示制御 ---
        const summaryArea = document.getElementById('lottery_summary_area');
        const lotRevealArea = document.getElementById('lottery_reveal_area');
        const revealArea = document.getElementById('reveal_area');

        // フェーズに応じたエリアの排他表示
        console.log(`[DISPLAY_CHECK] phase:${data.phase}, summaryArea:${!!summaryArea}, revealArea:${!!revealArea}`);
if (summaryArea) {
            if (data.phase === 'summary') { summaryArea.classList.add('is-visible'); summaryArea.classList.remove('is-hidden'); }
            else { summaryArea.classList.add('is-hidden'); summaryArea.classList.remove('is-visible'); }
        }
        if (lotRevealArea) {
            if (data.phase === 'lottery_reveal') { lotRevealArea.classList.add('is-visible'); lotRevealArea.classList.remove('is-hidden'); }
            else { lotRevealArea.classList.add('is-hidden'); lotRevealArea.classList.remove('is-visible'); }
        }
        if (revealArea) {
            if (data.phase === 'reveal' && data.reveal_data) { revealArea.classList.add('is-visible'); revealArea.classList.remove('is-hidden'); }
            else { revealArea.classList.add('is-hidden'); revealArea.classList.remove('is-visible'); }
        }
        if (data.phase === 'summary' && summaryArea) {
            const listEl = document.getElementById('lottery_summary_list');
            const horseGroups = {};
            data.all_nominations.filter(n => n.round === data.round && n.is_winner === 0).forEach(n => {
                if (!horseGroups[n.horse_name]) horseGroups[n.horse_name] = [];
                horseGroups[n.horse_name].push(n.player_name);
            });

            let singleHtml = '<div class="summary-section"><h4 class="summary-label-success">【単独確定】</h4><div class="summary-list-success">';
            let multiHtml = '<div class="summary-section"><h4 class="summary-label-danger">【重複・抽選対象】</h4>';
            let hasMulti = false;
            let hasSingle = false;

            Object.keys(horseGroups).forEach(h => {
                const pts = horseGroups[h];
                if (pts.length > 1) {
                    hasMulti = true;
                    multiHtml += `<div class="summary-card-danger">`;
                    multiHtml += `<div class="summary-horse-name">${h}</div>`;
                    multiHtml += `<div class="summary-participants">指名者: ${pts.join(' / ')}</div></div>`;
                } else {
                    hasSingle = true;
                    singleHtml += `<div class="summary-item-success"><strong>${h}</strong> <span class="summary-item-sub">(${pts[0]})</span></div>`;
                }
            });

            singleHtml += '</div></div>';
            multiHtml += '</div>';

            listEl.innerHTML = (hasMulti ? multiHtml : "") + (hasSingle ? singleHtml : "");
        }

        if (data.phase === 'lottery_reveal' && lotRevealArea) {
            const queue = data.lottery_queue || [];
            const idx = data.lottery_idx || 0;
            const resMap = data.lottery_results || {};
            if (queue[idx]) {
                const hName = queue[idx];
                const res = resMap[hName];
                document.getElementById('lot_horse_name').innerText = hName;
                document.getElementById('lot_candidate_list').innerText = `候補: ${res.participants.join(', ')}`;
                document.getElementById('lot_result_box').classList.add('is-visible');
                document.getElementById('lot_winner_name').innerText = res.winner_name;
            }
        }

        if (revealArea) {
            if (data.phase === 'reveal' && data.reveal_data) {
                revealArea.classList.add('is-visible');
                revealArea.classList.remove('is-hidden');
                const updateRev = (id, val) => {
                    const el = document.getElementById(id);
                    if (el) el.innerText = (val !== undefined && val !== null) ? val : "";
                };
                updateRev('reveal_round', data.reveal_data.round);
                updateRev('reveal_player', data.reveal_data.player);
                updateRev('reveal_horse', data.reveal_data.horse);
                updateRev('reveal_father', data.reveal_data.father);
                updateRev('reveal_mother', data.reveal_data.mother);
                updateRev('reveal_stable', data.reveal_data.stable);
                updateRev('reveal_breeder', data.reveal_data.breeder);
            } else {
                revealArea.classList.add('is-hidden');
            }
        }

    } catch (e) { console.error("Status update error:", e); }
}

// --- 馬の検索 (自動で呼ばれる本体) ---
window.searchController = null; // 通信キャンセル用

async function searchHorses() {
    // 実行中の検索があれば即座にキャンセルして新しいリクエストを優先する
    if (window.searchController) window.searchController.abort();
    window.searchController = new AbortController();

    const fInput = document.getElementById('s_father');
    const mInput = document.getElementById('s_mother');
    const resultsEl = document.getElementById('search_results');

    if (!fInput || !mInput || !resultsEl) return;

    const f = fInput.value;
    const m = mInput.value;
    const currentQuery = `f=${f}&m=${m}`;

    // 【修正】検索語に変化がない、または通信中、または指名処理中の場合は処理をスキップ
    // これにより、Firefoxでボタンクリック時に「ボタンが消えて再描画される」のを防ぎます
    if (currentQuery === window.lastSearchQuery || window.isSearching || window.isProcessingNomination) {
        console.log("SEARCH: スキップ (変化なし または 処理中)");
        return;
    }

    console.log(`SEARCH: 検索判定中... (父:${f.length}文字, 母:${m.length}文字)`);

    if (f.length < 2 && m.length < 2) {
        resultsEl.innerHTML = "";
        window.lastSearchQuery = currentQuery;
        return;
    }

    // 状態を更新
    window.lastSearchQuery = currentQuery;
    window.isSearching = true;

    console.log(`SEARCH: サーバーへリクエスト送信: /search_horses?f=${f}&m=${m}`);
    resultsEl.innerHTML = '<div class="search-loading">[DEBUG] サーバー通信中...</div>';

    try {
        const res = await fetch(`/search_horses?f=${encodeURIComponent(f)}&m=${encodeURIComponent(m)}`, { signal: window.searchController.signal });
        const horses = await res.json();
        console.log("SEARCH: サーバー回答受信", horses ? horses.length : 0, "件");

        resultsEl.innerHTML = ""; // 既存の結果をクリア

        if (horses && horses.length > 0) {
            // 【修正】保存された latestStatusData を使用して判定
            const me = decodeURIComponent(getCookie('pog_user') || "").replace(/\+/g, ' ');
            const d = window.latestStatusData || {};
            const myNomination = (d.all_nominations) ? d.all_nominations.find(n => n.player_name === me && parseInt(n.round) === d.round && n.is_winner === 1) : null;
            const isMeWinner = !!myNomination;
            // デバッグ情報表示
            const debugInfo = document.createElement('div');
            debugInfo.className = "search-debug-info";
            debugInfo.textContent = `[DEBUG] ${horses.length}件表示`;
            resultsEl.appendChild(debugInfo);

            horses.forEach(h => {
                // 1. カードコンテナ作成
                const card = document.createElement('div');
                card.className = "search-item-card card";

                // 2. 馬名表示
                const nameDiv = document.createElement('div');
                nameDiv.className = "search-horse-name";
                nameDiv.textContent = h.horse_name;

                // 3. 父母情報表示
                const infoDiv = document.createElement('div');
                infoDiv.className = "search-horse-info";
                infoDiv.textContent = `父: ${h.father_name} / 母: ${h.mother_name}`;

                // 4. ボタン作成
                const btn = document.createElement('button');
                btn.type = "button";
                const isNominationPhase = (d.phase === 'nomination');
                const isOverLimit = (parseInt(d.round) > 10); // 10頭固定の判定

                if (isMeWinner) {
                    btn.textContent = "指名確定済み";
                    btn.disabled = true;
                    btn.className = "btn-search-action is-disabled";
                } else if (isOverLimit) {
                    btn.textContent = "全10頭 指名終了";
                    btn.disabled = true;
                    btn.className = "btn-search-action is-disabled";
                } else if (!isNominationPhase) {
                    btn.textContent = "指名受付外";
                    btn.disabled = true;
                    btn.className = "btn-search-action is-off";
                } else {
                    btn.textContent = "指名する";
                    btn.className = "btn-search-action active";
                }
                
                // 【デバッグログ追加】イベントの発生順序を詳細に記録
                btn.onmousedown = (e) => {
                    console.log(`[EVENT_LOG] mousedown検知: 馬名="${h.horse_name}"`);
                    // ボタンを押した瞬間に「指名処理中」フラグを立てて、inputイベントを封じる
                    window.isProcessingNomination = true;
                };

                btn.onmouseup = () => console.log(`[EVENT_LOG] mouseup検知`);

                // 【修正】イベントを完全に独立させ、ブラウザの干渉を排除する
                btn.setAttribute('onclick', `event.preventDefault(); event.stopPropagation(); console.log('[EVENT_LOG] click検知(attr)'); window.doNominate("${h.horse_name.replace(/"/g, '&quot;')}", "${h.mother_name.replace(/"/g, '&quot;')}", "${h.id}")`);

                // カードにすべて追加
                card.appendChild(nameDiv);
                card.appendChild(infoDiv);
                card.appendChild(btn);

                // 結果エリアに追加
                resultsEl.appendChild(card);
            });
        } else {
            console.log("SEARCH: ヒットなし");
            resultsEl.innerHTML = '<div class="search-no-result">[DEBUG] 該当なし</div>';
        }
    } catch (e) {
        console.error("SEARCH ERROR:", e);
        resultsEl.innerHTML = `<div class="search-error">通信エラー: ${e.message}</div>`;
    } finally {
        // 通信完了
        window.isSearching = false;
    }
}

// --- 指名実行 ---
window.doNominate = async function(name, mother, horse_id) {
    // ボタンが押されたら即座に進行中の検索通信を強制切断する
    if (window.searchController) window.searchController.abort();
    window.isProcessingNomination = true; 

    console.log(`[NOMINATE_DEBUG] 関数開始: ${name}`);
    // 【重要】ダイアログ表示前にステータス更新タイマーを完全に停止させ、割り込みを防ぐ
    if (window.statusTimer) {
        console.log(`[NOMINATE_DEBUG] タイマーを一時停止します`);
        clearInterval(window.statusTimer);
        window.statusTimer = null; // 確実にクリア
    }
    try {
        console.log(`[NOMINATE_DEBUG] confirm直前`);
        const confirmed = confirm(`${name} を指名しますか？`);
        console.log(`[NOMINATE_DEBUG] confirm結果: ${confirmed}`);
        
        if (!confirmed) {
            window.isProcessingNomination = false; // キャンセル時はフラグ解除
            // タイマーを再開
            if (!window.statusTimer) window.statusTimer = setInterval(updateStatus, 3000);
            return;
        }
        const formData = new URLSearchParams();
        formData.append('horse_name', name || "");
        formData.append('mother_name', mother || "");
        
        console.log("--- DEBUG POST DATA ---");
        for (let [k, v] of formData.entries()) { console.log(`${k}: ${v}`); }

        const res = await fetch('/nominate', { method: 'POST', body: formData });
        const resText = await res.text(); // 生の応答をテキストで取得
        console.log(`[CLIENT_TRACE] HTTP STATUS: ${res.status}`);
        console.log(`[CLIENT_TRACE] RAW RESPONSE:`, resText);

        let data;
        try {
            data = JSON.parse(resText);
        } catch(e) {
            // JSONとして解釈できない（＝サーバーがクラッシュしてHTMLを返した）場合
            alert(`致命的エラーが発生しました(HTTP ${res.status})\n\n【サーバーの応答内容】\n${resText.substring(0, 300)}`);
            window.isProcessingNomination = false;
            if (!window.statusTimer) window.statusTimer = setInterval(updateStatus, 3000);
            return;
        }
        if (data.status === 'success') {
            debugLog("[EVIDENCE_NOM] Nomination Result Data:", data);
            alert("指名完了");
            localStorage.setItem('activeTab', 'tab-my');
            location.reload();
        } else {
            alert("エラー: " + (data.message || "指名に失敗しました"));
            window.isProcessingNomination = false; // エラー時もフラグ解除
            if (!window.statusTimer) window.statusTimer = setInterval(updateStatus, 3000);
        }
    } catch (e) { 
        console.error("Nominate error:", e); 
        window.isProcessingNomination = false;
        if (!window.statusTimer) window.statusTimer = setInterval(updateStatus, 3000);
    }
}

// --- MC操作 ---
// ボタン押下後の通信を高速化するため、既存のタイマーを一度リセットしてから即時実行する
async function mcAction(url, method = 'POST') {
    if (window.statusTimer) {
        clearInterval(window.statusTimer);
        window.statusTimer = null; 
    }
    const mainBtn = document.getElementById('mc-btn-main');
    if (mainBtn) {
        mainBtn.disabled = true;
        mainBtn.innerText = "処理中...";
        mainBtn.onclick = null;
    }
    try {
        const res = await fetch(url, { method: method });
        const newData = await res.json();
        debugLog("[EVIDENCE_MC] MC Action Result Data:", newData);
        window.lastPhase = newData.phase;
        await updateStatus(newData);
    } catch (e) {
        console.error("MC Action Error:", e);
    } finally {
        if (!window.statusTimer) {
            window.statusTimer = setInterval(updateStatus, 3000);
        }
    }
}

window.startReveal = async function() { await mcAction('/mc/start_reveal'); }
window.nextReveal = async function() { await mcAction('/mc/next_reveal'); }
window.runLottery = async function() { await mcAction('/mc/run_lottery'); }
window.advanceLottery = async function() { await mcAction('/mc/advance_lottery'); }
window.nextRound = async function() { await mcAction('/mc/next_round'); }

// --- MC用ボタンの活性・非活性制御 ---
function updateMCButtons(data) {
    const phase = data.phase;
    console.log(`[TRACE_4] Inside updateMCButtons. phase="${phase}"`); // 追加
    const isAllNominated = data.is_all_nominated;
    const hasDuplicates = data.has_duplicates;
    const mainBtn = document.getElementById('mc-btn-main');
    if (!mainBtn) return;

    const setBtn = (btn, active, colorClass = "") => {
        btn.classList.remove('mc-bg-blue', 'mc-bg-emerald');
        if (colorClass) btn.classList.add(colorClass); 
        btn.disabled = !active;
        btn.className = active ? `mc-btn-main active ${colorClass}` : "mc-btn-main disabled";
    };

    if (phase === 'nomination') {
        const currentRoundInt = parseInt(data.round);
        const allNoms = Array.isArray(data.all_nominations) ? data.all_nominations : [];
        const winners = allNoms.filter(n => n && parseInt(n.round) === currentRoundInt && n.is_winner === 1);
        const winCount = new Set(winners.map(n => n.player_name)).size;
        const target = (data.total_players || 0) - winCount;
        const noms = allNoms.filter(n => n && parseInt(n.round) === currentRoundInt && n.is_winner === 0);
        const nominated = new Set(noms.map(n => n.player_name)).size;

        if (DEBUG_MODE) {
            console.log(`[MC_CALC_EVIDENCE] Round:${currentRoundInt}, Total:${data.total_players}, WinCount:${winCount}, Target:${target}, Nominated:${nominated}`);
        }
        
        const isReady = isAllNominated || (nominated >= target && target > 0);
        mainBtn.innerText = isReady ? "指名公開を開始する" : "指名待機中";
        mainBtn.onclick = isReady ? window.startReveal : null;
        setBtn(mainBtn, isReady, "mc-bg-blue");

    } else if (phase === 'reveal') {
        const isEnd = (data.reveal_index >= (data.total_players || 0) - 1);
        // 残り人数計算に -1 を維持し、完了時は「抽選を開始」に統一
        // 全員表示済み(isEnd)なら「指名結果を表示」、未表示がいれば「公開」ボタン
        mainBtn.innerText = isEnd ? "指名結果を表示" : ( (data.total_players - data.reveal_index - 1 === 0) ? "最後の一人を公開" : `次の指名を公開 (あと ${data.total_players - data.reveal_index - 1}人)` );
        // 全員出し終えたら advanceLottery を呼ぶことで、直接「重複状況(summary)」へ移行させる
        console.log(`[DEBUG_REVEAL] index:${data.reveal_index}, total:${data.total_players}, isEnd:${isEnd}`);
        mainBtn.onclick = () => {
            // 再検証：isEndの状態をログに出し、正しい関数を呼び出す
            console.log(`[CLICK_EVENT_TRACE] isEnd:${isEnd}`);
            if (isEnd) {
                console.log("[EXECUTE] window.runLottery を実行します");
                window.runLottery();
            } else {
                window.nextReveal();
            }
        };
        setBtn(mainBtn, true, isEnd ? "mc-bg-emerald" : "mc-bg-blue");

    } else if (phase === 'summary') {
        if (hasDuplicates) {
            mainBtn.innerText = "抽選を開始";
            mainBtn.onclick = window.advanceLottery;
            setBtn(mainBtn, true, "mc-bg-blue");
        } else {
            const isLastRound = (parseInt(data.round) >= 10);
            mainBtn.innerText = isLastRound ? "ドラフト終了" : "次の巡へ進む";
            mainBtn.onclick = window.nextRound; 
            setBtn(mainBtn, true, "mc-bg-emerald");
        }
    } else if (phase === 'lottery_reveal') {
        const queueLen = (data.lottery_queue || []).length;
        const currentIdx = (data.lottery_idx || 0);
        const isEnd = (currentIdx + 1 >= queueLen);
        
        if (isEnd) {
            // 演出終了：「再指名へ」を表示
            mainBtn.innerText = "再指名へ進む";
            mainBtn.onclick = window.nextRound;
            setBtn(mainBtn, true, "mc-bg-emerald");
        } else {
            mainBtn.innerText = "次の抽選結果を表示";
            mainBtn.onclick = window.advanceLottery;
            setBtn(mainBtn, true, "mc-bg-blue");
        }

    } else if (phase === 'lottery') {
        const allNoms = Array.isArray(data.all_nominations) ? data.all_nominations : [];
        const currentRoundInt = parseInt(data.round);
        // 今巡で「確定(is_winner=1)」した人数をカウント
        const winnersCount = new Set(allNoms.filter(n => parseInt(n.round) === currentRoundInt && n.is_winner === 1).map(n => n.player_name)).size;
        // 確定人数が参加総数より少なければ、未確定（再指名が必要）な人がいる
        const hasUnfinished = winnersCount < (data.total_players || 0);

        const isLastRound = (currentRoundInt >= 10);
        mainBtn.innerText = hasUnfinished ? "再指名へ進む" : (isLastRound ? "ドラフト終了" : "次の巡へ進む");
        mainBtn.onclick = (isLastRound && !hasUnfinished) ? () => {
            // 抽選後の10巡目確定処理を実行
            mcAction('/mc/next_round').then(() => {
                alert("全10巡の指名がすべて確定しました。お疲れ様でした！");
                const summaryArea = document.getElementById('lottery_summary_area');
                const lotRevealArea = document.getElementById('lottery_reveal_area');
                if (summaryArea) { summaryArea.classList.add('is-hidden'); summaryArea.classList.remove('is-visible'); }
                if (lotRevealArea) { lotRevealArea.classList.add('is-hidden'); lotRevealArea.classList.remove('is-visible'); }
                // 表示のデグレ（11巡発生）を防止
                window.lastPhase = "DRAFT_FINISHED";
                const roundEl = document.getElementById('round_display');
                if (roundEl) roundEl.innerText = "10";
                if (typeof switchTab === 'function') switchTab('tab-all');
            });
        } : window.nextRound;
        setBtn(mainBtn, true, hasUnfinished ? "mc-bg-blue" : "mc-bg-emerald");
    } else if (phase === 'finished') {
        mainBtn.innerText = "ドラフト終了";
        mainBtn.onclick = null;
        setBtn(mainBtn, false, "mc-bg-gray");
        // 終了時の一回限りの通知
        if (window.lastPhase !== 'finished') {
            alert("全10巡の指名がすべて確定しました。お疲れ様でした！");
            if (typeof switchTab === 'function') switchTab('tab-all');
        }
    }
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

// CSV出力機能：確定した全指名リストを保存
window.downloadCSV = function() {
    const data = window.latestStatusData; 
    if (!data || !data.all_nominations) {
        alert("データがロードされていません。しばらく待ってから再度お試しください。");
        return;
    }

    const rows = [["参加者名", "指名順位", "馬名", "父名", "母名"]];
    data.all_nominations.forEach(n => {
        if (n && n.is_winner === 1) {
            rows.push([n.player_name, n.round, n.horse_name, n.horses?.father_name || '-', n.horses?.mother_name || n.mother_name || '-']);
        }
    });

    const csvContent = "\uFEFF" + rows.map(r => r.map(field => `"${field}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const fileRound = (parseInt(data.round) >= 10) ? 10 : (data.round - 1);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pog_results_round_${fileRound}.csv`;
    link.click();
    URL.revokeObjectURL(url);
};