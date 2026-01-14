// [2026-01-12] app.js Version: 0.0.1 - Firefox Event Isolation & Timer Control
(function() {
    const APP_VERSION = "0.0.1";
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
async function updateStatus() {
    try {
        const res = await fetch('/status');
        if (!res.ok) return;
        const data = await res.json();
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
            // 今巡ですでに当選(1)している人数をカウント
            const currentWinnersCount = new Set(allNoms
                .filter(n => n && parseInt(n.round) === currentRoundInt && n.is_winner === 1)
                .map(n => n.player_name)).size;
            
            // 指名すべき総人数から、今巡の当選者を引く
            const realTargetCount = (data.total_players || 0) - currentWinnersCount;

            const nominatedCount = new Set(allNoms
                .filter(n => n && parseInt(n.round) === currentRoundInt && n.is_winner === 0)
                .map(n => n.player_name)).size;
            counterEl.innerText = `指名状況: ${nominatedCount} / ${realTargetCount} 人`;
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
                    html += `<div class="card" style="background:white; padding:15px; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.1); margin-bottom:15px;">`;
                    html += `<h3 style="margin:0 0 10px 0; font-size:1rem; border-left:4px solid #2563eb; padding-left:10px;">${playerName}</h3>`;
                    html += `<table style="width:100%; border-collapse:collapse; font-size:0.85rem;">`;
                    html += `<tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0;"><th style="padding:5px; text-align:left; width:10%;">巡</th><th style="padding:5px; text-align:left;">馬名 / 血統</th></tr>`;

                    const playerNoms = data.all_nominations
                        .filter(n => n.player_name === playerName)
                        .sort((a, b) => a.round - b.round);

                    if (playerNoms.length === 0) {
                        html += `<tr><td colspan="2" style="padding:10px; color:#94a3b8; text-align:center;">まだ指名がありません</td></tr>`;
                    } else {
                        playerNoms.forEach(n => {
                            let hName = n.horse_name;
                            // 指名フェーズかつ他人の未確定指名は隠す
                            if (data.phase === 'nomination' && n.round === data.round && playerName !== me && n.is_winner === 0) {
                                hName = '??? (指名済み)';
                            }
                            const father = n.horses?.father_name || '-';
                            const mother = n.horses?.mother_name || n.mother_name || '-';
                            // winClassの判定において、不適切な変数参照がないか再確認
                            const winClass = n.is_winner === 1 ? 'color:#059669; font-weight:bold;' : (n.is_winner === -1 ? 'color:#94a3b8; text-decoration:line-through;' : '');

                            html += `<tr style="border-bottom:1px solid #f1f5f9;">`;
                            html += `<td style="padding:8px 5px; vertical-align:top;">${n.round}</td>`;
                            html += `<td style="padding:8px 5px; ${winClass}">`;
                            html += `<div>${hName}</div>`;
                            if (hName !== '??? (指名済み)') {
                                html += `<div style="font-size:0.7rem; color:#64748b;">${father} / ${mother}</div>`;
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
        if (summaryArea) summaryArea.style.display = (data.phase === 'summary') ? 'block' : 'none';
        if (lotRevealArea) lotRevealArea.style.display = (data.phase === 'lottery_reveal') ? 'block' : 'none';

        if (data.phase === 'summary' && summaryArea) {
            const listEl = document.getElementById('lottery_summary_list');
            let sHtml = '<ul style="list-style:none; padding:0; font-size:0.9rem;">';
            const horseGroups = {};
            data.all_nominations.filter(n => n.round === data.round && n.is_winner === 0).forEach(n => {
                if (!horseGroups[n.horse_name]) horseGroups[n.horse_name] = [];
                horseGroups[n.horse_name].push(n.player_name);
            });
            Object.keys(horseGroups).forEach(h => {
                const pts = horseGroups[h];
                if (pts.length > 1) {
                    sHtml += `<li style="padding:8px; border-bottom:1px dotted #cbd5e1; color:#ef4444;">⚠️ <strong>${h}</strong>: ${pts.join(', ')} (重複)</li>`;
                } else {
                    sHtml += `<li style="padding:8px; border-bottom:1px dotted #cbd5e1; color:#059669;">✅ <strong>${h}</strong>: ${pts[0]} (単独確定)</li>`;
                }
            });
            listEl.innerHTML = sHtml + '</ul>';
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
                document.getElementById('lot_result_box').style.display = 'block';
                document.getElementById('lot_winner_name').innerText = res.winner_name;
            }
        }

        const revealArea = document.getElementById('reveal_area');
        if (revealArea) {
            if (data.phase === 'reveal' && data.reveal_data) {
                revealArea.style.display = 'block';
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
                revealArea.style.display = 'none';
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
    resultsEl.innerHTML = "<div style='color:blue; font-size:0.8rem;'>[DEBUG] サーバー通信中...</div>";

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
            debugInfo.style.cssText = "color:green; font-size:0.7rem; margin-bottom:5px;";
            debugInfo.textContent = `[DEBUG] ${horses.length}件表示`;
            resultsEl.appendChild(debugInfo);

            horses.forEach(h => {
                // 1. カードコンテナ作成
                const card = document.createElement('div');
                card.style.cssText = "padding:15px; border:1px solid #e2e8f0; border-radius:10px; margin-bottom:10px; background:white; box-shadow:0 2px 4px rgba(0,0,0,0.05);";

                // 2. 馬名表示
                const nameDiv = document.createElement('div');
                nameDiv.style.cssText = "font-weight:bold; font-size:1.1rem;";
                nameDiv.textContent = h.horse_name;

                // 3. 父母情報表示
                const infoDiv = document.createElement('div');
                infoDiv.style.cssText = "font-size:0.8rem; color:#64748b; margin-bottom:8px;";
                infoDiv.textContent = `父: ${h.father_name} / 母: ${h.mother_name}`;

                // 4. ボタン作成
                const btn = document.createElement('button');
                btn.type = "button";
                if (isMeWinner) {
                    btn.textContent = "指名確定済み";
                    btn.disabled = true;
                    btn.style.cssText = "width:100%; padding:10px; background:#94a3b8; color:white; border:none; border-radius:6px; font-weight:bold; cursor:not-allowed;";
                } else {
                    btn.textContent = "指名する";
                    btn.style.cssText = "width:100%; padding:10px; background:#10b981; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer;";
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
            resultsEl.innerHTML = "<div style='color:#94a3b8; text-align:center; padding:10px;'>[DEBUG] 該当なし</div>";
        }
    } catch (e) {
        console.error("SEARCH ERROR:", e);
        resultsEl.innerHTML = `<div style="color:red; font-size:0.8rem;">通信エラー: ${e.message}</div>`;
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
    try {
        await fetch(url, { method: method });
        // ボタン押下後の status 更新を最優先で行う
        await updateStatus();
    } finally {
        // 処理完了後にタイマーを再開
        if (!window.statusTimer) window.statusTimer = setInterval(updateStatus, 3000);
    }
}

window.startReveal = async function() { await mcAction('/mc/start_reveal'); }
window.nextReveal = async function() { await mcAction('/mc/next_reveal'); }
window.runLottery = async function() { if(confirm("抽選の準備（重複チェック）をしますか？")) await mcAction('/mc/run_lottery'); }
window.advanceLottery = async function() { await mcAction('/mc/advance_lottery'); }
window.nextRound = async function() { if(confirm("確定して次の巡（または再指名）へ進みますか？")) await mcAction('/mc/next_round'); }

// --- MC用ボタンの活性・非活性制御 ---
function updateMCButtons(data) {
    const phase = data.phase;
    const isAllNominated = data.is_all_nominated;
    const hasDuplicates = data.has_duplicates;
    const btnReveal = document.getElementById('btn_mc_reveal');
    const btnLottery = document.getElementById('btn_mc_lottery');
    const btnNext = document.getElementById('btn_mc_next');
    if (!btnReveal || !btnLottery || !btnNext) return;

    const setBtn = (btn, active) => {
        btn.disabled = !active;
        btn.style.opacity = active ? "1.0" : "0.3";
        btn.style.cursor = active ? "pointer" : "not-allowed";
    };

    if (phase === 'nomination') {
        btnReveal.innerText = "1. 公開開始";
        btnReveal.onclick = window.startReveal;

        // 【修正】サーバーフラグに加え、フロント側の「必要人数 vs 完了人数」でも判定
        const currentRoundInt = parseInt(data.round);
        const allNoms = Array.isArray(data.all_nominations) ? data.all_nominations : [];
        const winCount = new Set(allNoms.filter(n => n && parseInt(n.round) === currentRoundInt && n.is_winner === 1).map(n => n.player_name)).size;
        const target = Math.max(0, (data.total_players || 0) - winCount);
        const nominated = new Set(allNoms.filter(n => n && parseInt(n.round) === currentRoundInt && n.is_winner === 0).map(n => n.player_name)).size;
        
        setBtn(btnReveal, isAllNominated || (nominated >= target && target > 0)); 
        setBtn(btnLottery, false);
        setBtn(btnNext, false);
    } else if (phase === 'reveal') {
        const isEnd = data.reveal_index >= data.total_players;
        btnReveal.innerText = isEnd ? "全公開終了" : "次の公開へ";
        btnReveal.onclick = isEnd ? null : window.nextReveal;
        setBtn(btnReveal, !isEnd); 
        setBtn(btnLottery, isEnd); // 全員の公開が終わったら抽選ボタンを有効化
        setBtn(btnNext, false);
    } else if (phase === 'summary') {
        btnReveal.innerText = "抽選演出を開始";
        btnReveal.onclick = window.advanceLottery;
        setBtn(btnReveal, true);
        setBtn(btnLottery, false);
        setBtn(btnNext, false);
    } else if (phase === 'lottery_reveal') {
        btnReveal.innerText = "次の抽選/確定へ";
        btnReveal.onclick = window.advanceLottery;
        setBtn(btnReveal, true);
        setBtn(btnLottery, false);
        setBtn(btnNext, false);
    } else if (phase === 'lottery') {
        btnReveal.innerText = "公開済み";
        setBtn(btnReveal, false);
        setBtn(btnLottery, false);
        setBtn(btnNext, true);
    }
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}