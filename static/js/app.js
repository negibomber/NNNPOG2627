// [2026-01-12] 既存ロジックを完全維持しつつ、MCボタンの制御を追加
(function() {
    console.log("--- POG DEBUG START ---");
    console.log("1. スクリプトの読み込みを確認しました閉。");

    const init = () => {
        console.log("2. 初期化関数(init)が実行されました。");
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
            console.log("4. 監視(addEventListener)を登録します。");
            
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
            console.log("5. 監視の登録が完了しました。入力待ちです。");
        } else {
            console.error("CRITICAL: 入力欄が見つかりません。HTMLのIDが正しいか確認してください。");
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

// ステータス管理変数をグローバルスコープで初期化
window.lastPhase = "";

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
            // 修正：is_winner === 0 (抽選待ち・再指名待ち) の人だけを分子としてカウント
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

        // --- フェーズ変更によるリロード制御 (windowスコープを使用) ---
        if (window.lastPhase !== "" && window.lastPhase !== data.phase) {
            window.lastPhase = data.phase;
            location.reload();
            return;
        }
        window.lastPhase = data.phase;

        // --- 公開エリアの表示・更新ロジック ---
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

    console.log(`SEARCH: 検索判定中... (父:${f.length}文字, 母:${m.length}文字)`);

    // 2文字未満ならクリア
    if (f.length < 2 && m.length < 2) {
        resultsEl.innerHTML = "";
        return;
    }

    console.log(`SEARCH: サーバーへリクエスト送信: /search_horses?f=${f}&m=${m}`);
    resultsEl.innerHTML = "<div style='color:blue; font-size:0.8rem;'>[DEBUG] サーバー通信中...</div>";

    try {
        const res = await fetch(`/search_horses?f=${encodeURIComponent(f)}&m=${encodeURIComponent(m)}`);
        const horses = await res.json();
        console.log("SEARCH: サーバー回答受信", horses ? horses.length : 0, "件");

        if (horses && horses.length > 0) {
            let html = `<div style="color:green; font-size:0.7rem; margin-bottom:5px;">[DEBUG] ${horses.length}件表示</div>`;
            horses.forEach(h => {
                html += `
                <div style="padding:15px; border:1px solid #e2e8f0; border-radius:10px; margin-bottom:10px; background:white; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                    <div style="font-weight:bold; font-size:1.1rem;">${h.horse_name}</div>
                    <div style="font-size:0.8rem; color:#64748b; margin-bottom:8px;">父: ${h.father_name} / 母: ${h.mother_name}</div>
                    <button onclick="doNominate('${h.horse_name.replace(/'/g, "\\'")}', '${h.mother_name.replace(/'/g, "\\'")}')" 
                            style="width:100%; padding:10px; background:#10b981; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">
                        指名する
                    </button>
                </div>`;
            });
            resultsEl.innerHTML = html;
        } else {
            console.log("SEARCH: ヒットなし");
            resultsEl.innerHTML = "<div style='color:#94a3b8; text-align:center; padding:10px;'>[DEBUG] 該当なし</div>";
        }
    } catch (e) {
        console.error("SEARCH ERROR:", e);
        resultsEl.innerHTML = `<div style="color:red; font-size:0.8rem;">通信エラー: ${e.message}</div>`;
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
            // リロード後にマイリストタブを開くようにフラグを保存
            localStorage.setItem('activeTab', 'tab-my');
            location.reload();
        } else {
            alert("エラー: " + (data.message || "指名に失敗しました"));
        }
    } catch (e) { console.error("Nominate error:", e); }
}

// --- MC操作 ---
window.startReveal = async function() { await fetch('/mc/start_reveal', {method:'POST'}); updateStatus(); }

// 次の公開（Next Reveal）を呼び出す関数を追加
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
        // (1) 指名待ち => 何も押せない, (2) 指名終了 => 公開開始のみ
        setBtn(btnReveal, isAllNominated); 
        setBtn(btnLottery, false); 
        setBtn(btnNext, false);
    } else if (phase === 'reveal') {
        // (3) 公開中 => 公開ボタンを「次の公開」として再利用
        btnReveal.innerText = "次の公開へ";
        btnReveal.onclick = window.nextReveal;
        setBtn(btnReveal, true); 
        setBtn(btnLottery, false); 
        setBtn(btnNext, false);
    } else if (phase === 'lottery') {
        btnReveal.innerText = "1. 公開開始";
        btnReveal.onclick = window.startReveal;
        // (4) 抽選必要 => 抽選のみ, (5) 不要 => 次の巡のみ
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