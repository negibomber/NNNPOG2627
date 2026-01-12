// [2026-01-12] 既存ロジックを完全維持しつつ、DOM操作による生成で Firefox 不具合を根本解決
(function() {
    console.log("--- POG DEBUG START ---");
    console.log("1. スクリプトの読み込みを確認しました.");

    const init = () => {
        console.log("2. 初期化関数(init)が実行されました.");
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
                console.log(`-> 父入力検知: "${e.target.value}"`);
                searchHorses();
            });
            mInput.addEventListener('input', (e) => {
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
    
    setInterval(updateStatus, 3000);
})();

// グローバルスコープで管理
window.lastPhase = "";
window.lastSearchQuery = ""; // 【追加】重複検索・再描画防止用
window.isSearching = false;  // 【追加】通信中フラグ

// --- ステータス更新 (既存機能維持) ---
async function updateStatus() {
    try {
        const res = await fetch('/status');
        if (!res.ok) return;
        const data = await res.json();

        const updateText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.innerText = text;
        };

        updateText('round_display', data.round);
        
        const phaseMap = {'nomination': '指名受付中', 'reveal': '指名公開中', 'lottery': '抽選・結果確定'};
        updateText('phase_label', phaseMap[data.phase] || data.phase);

        // MCボタンの制御を呼び出し
        updateMCButtons(data);

        const counterEl = document.getElementById('status_counter');
        if (counterEl && data.all_nominations) {
            const nominatedCount = new Set(data.all_nominations
                .filter(n => n.round === data.round && n.is_winner === 0)
                .map(n => n.player_name)).size;
            counterEl.innerText = `指名状況: ${nominatedCount} / ${data.total_players} 人`;
        }

        const allStatusDiv = document.getElementById('all_status_list');
        if (allStatusDiv && data.all_players) {
            let html = '<table style="width:100%; border-collapse:collapse;">';
            data.all_players.forEach(playerName => {
                const nom = data.all_nominations.find(n => n.player_name === playerName && n.round === data.round);
                let horseTxt = '-';
                if (nom) {
                    const isMe = (playerName === decodeURIComponent(getCookie('pog_user') || ""));
                    horseTxt = (data.phase !== 'nomination' || isMe) ? nom.horse_name : '???';
                }
                html += `<tr style="border-bottom:1px solid #eee;"><td style="padding:5px;">${playerName}</td><td style="text-align:right;">${horseTxt}</td></tr>`;
            });
            html += '</table>';
            allStatusDiv.innerHTML = html;
        }

        if (window.lastPhase !== undefined && window.lastPhase !== "" && window.lastPhase !== data.phase) {
            console.log(`PHASE CHANGE DETECTED: ${window.lastPhase} -> ${data.phase}`);
            window.lastPhase = data.phase;
            location.reload();
            return;
        }
        window.lastPhase = data.phase;

        const revealArea = document.getElementById('reveal_area');
        if (revealArea) {
            if (data.phase === 'reveal' && data.reveal_data) {
                revealArea.style.display = 'block';
                const updateRev = (id, val) => {
                    const el = document.getElementById(id);
                    if (el) el.innerText = val || "";
                };
                updateRev('reveal_player', data.reveal_data.player);
                updateRev('reveal_horse', data.reveal_data.horse);
                updateRev('reveal_father', data.reveal_data.father);
                updateRev('reveal_mother', data.reveal_data.mother);
            } else {
                revealArea.style.display = 'none';
            }
        }

    } catch (e) { console.error("Status update error:", e); }
}

// --- 馬の検索 (自動で呼ばれる本体) ---
async function searchHorses() {
    const fInput = document.getElementById('s_father');
    const mInput = document.getElementById('s_mother');
    const resultsEl = document.getElementById('search_results');

    if (!fInput || !mInput || !resultsEl) return;

    const f = fInput.value;
    const m = mInput.value;
    const currentQuery = `f=${f}&m=${m}`;

    // 【修正】検索語に変化がない、または通信中の場合は処理をスキップ
    // これにより、Firefoxでボタンクリック時に「ボタンが消えて再描画される」のを防ぎます
    if (currentQuery === window.lastSearchQuery || window.isSearching) {
        console.log("SEARCH: スキップ (変化なし または 通信中)");
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
        const res = await fetch(`/search_horses?f=${encodeURIComponent(f)}&m=${encodeURIComponent(m)}`);
        const horses = await res.json();
        console.log("SEARCH: サーバー回答受信", horses ? horses.length : 0, "件");

        resultsEl.innerHTML = ""; // 既存の結果をクリア

        if (horses && horses.length > 0) {
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

                // 4. ボタン作成 (これが王道の方法)
                const btn = document.createElement('button');
                btn.type = "button"; // Firefox対策
                btn.textContent = "指名する";
                btn.style.cssText = "width:100%; padding:10px; background:#10b981; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer;";
                
                // 【デバッグログ追加】イベントの発生順序を詳細に記録
                btn.onmousedown = (e) => {
                    console.log(`[EVENT_LOG] mousedown検知: 馬名="${h.horse_name}"`);
                    console.log(`[EVENT_LOG] isSearchingの状態: ${window.isSearching}`);
                    // Firefoxでの競合を避けるため、一旦ここではログのみ
                };

                btn.onmouseup = () => console.log(`[EVENT_LOG] mouseup検知`);

                btn.onclick = (e) => {
                    console.log(`[EVENT_LOG] click検知: 馬名="${h.horse_name}"`);
                    window.doNominate(h.horse_name, h.mother_name);
                };

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
window.doNominate = async function(name, mother) {
    if (!confirm(`${name} を指名しますか？`)) return;
    try {
        const formData = new URLSearchParams();
        formData.append('horse_name', name);
        formData.append('mother_name', mother);
        const res = await fetch('/nominate', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.status === 'success') {
            alert("指名完了");
            localStorage.setItem('activeTab', 'tab-my');
            location.reload();
        } else {
            alert("エラー: " + (data.message || "指名に失敗しました"));
        }
    } catch (e) { console.error("Nominate error:", e); }
}

// --- MC操作 ---
window.startReveal = async function() { await fetch('/mc/start_reveal', {method:'POST'}); updateStatus(); }
window.nextReveal = async function() { await fetch('/mc/next_reveal', {method:'POST'}); updateStatus(); }
window.runLottery = async function() { if(confirm("抽選を実行しますか？")) await fetch('/mc/run_lottery', {method:'POST'}); updateStatus(); }
window.nextRound = async function() { if(confirm("次のラウンドへ進みますか？")) await fetch('/mc/next_round', {method:'POST'}); updateStatus(); }

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
        setBtn(btnReveal, isAllNominated); 
        setBtn(btnLottery, false); 
        setBtn(btnNext, false);
    } else if (phase === 'reveal') {
        btnReveal.innerText = "次の公開へ";
        btnReveal.onclick = window.nextReveal;
        setBtn(btnReveal, true); 
        setBtn(btnLottery, false); 
        setBtn(btnNext, false);
    } else if (phase === 'lottery') {
        btnReveal.innerText = "1. 公開開始";
        btnReveal.onclick = window.startReveal;
        setBtn(btnReveal, false);
        setBtn(btnLottery, hasDuplicates);
        setBtn(btnNext, !hasDuplicates);
    }
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}