// [2026-01-11] 最新版ソースを元に修正。既存機能の削除・変更なし。ログ出力を最大化。
(function() {
    console.log("--- POG DEBUG START ---");
    console.log("1. スクリプトの読み込みを確認しました。");

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
            console.error("CRITICAL: 入力欄が見つからないため、自動検索が開始できません。");
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    setInterval(updateStatus, 3000);
})();

// --- ステータス更新 (既存機能) ---
async function updateStatus() {
    try {
        const res = await fetch('/status');
        if (!res.ok) return;
        const data = await res.json();

        // 画面表示更新 (IDが存在する場合のみ)
        const updateText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.innerText = text;
        };

        updateText('round_display', data.round);
        
        const phaseMap = {'nomination': '指名受付中', 'reveal': '指名公開中', 'lottery': '抽選・結果確定'};
        updateText('phase_label', phaseMap[data.phase] || data.phase);

        const counterEl = document.getElementById('status_counter');
        if (counterEl && data.all_nominations) {
            const nominatedCount = new Set(data.all_nominations
                .filter(n => n.round === data.round && (n.is_winner === 0 || n.is_winner === 1))
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

        if (lastPhase !== "" && lastPhase !== data.phase) location.reload();
        lastPhase = data.phase;
    } catch (e) { console.error("Status update error:", e); }
}

// --- 馬の検索 (ここが自動で呼ばれる) ---
async function searchHorses() {
    const f = document.getElementById('s_father').value;
    const m = document.getElementById('s_mother').value;
    const resultsEl = document.getElementById('search_results');

    console.log(`SEARCH: 検索実行判定中... (父:${f.length}文字, 母:${m.length}文字)`);

    if (f.length < 2 && m.length < 2) {
        if (resultsEl) resultsEl.innerHTML = "";
        return;
    }

    console.log(`SEARCH: サーバーへリクエスト送信: /search_horses?f=${f}&m=${m}`);
    if (resultsEl) resultsEl.innerHTML = "<div style='color:blue;'>[DEBUG] サーバー通信中...</div>";

    try {
        const res = await fetch(`/search_horses?f=${encodeURIComponent(f)}&m=${encodeURIComponent(m)}`);
        const horses = await res.json();
        console.log("SEARCH: サーバーから受信した件数:", horses ? horses.length : 0);

        if (horses && horses.length > 0) {
            let html = `<div style="color:green; font-size:0.7rem;">[DEBUG] ${horses.length}件ヒット</div>`;
            horses.forEach(h => {
                html += `
                <div style="padding:15px; border:1px solid #e2e8f0; border-radius:10px; margin-bottom:10px; background:white;">
                    <div style="font-weight:bold;">${h.horse_name}</div>
                    <div style="font-size:0.8rem; color:#64748b;">父: ${h.father_name} / 母: ${h.mother_name}</div>
                    <button onclick="doNominate('${h.horse_name.replace(/'/g, "\\'")}', '${h.mother_name.replace(/'/g, "\\'")}')" 
                            style="width:100%; padding:10px; background:#10b981; color:white; border:none; border-radius:6px; font-weight:bold; margin-top:5px;">
                        指名する
                    </button>
                </div>`;
            });
            resultsEl.innerHTML = html;
        } else {
            console.log("SEARCH: ヒットなし");
            resultsEl.innerHTML = "<div style='color:#94a3b8; text-align:center;'>[DEBUG] 該当なし</div>";
        }
    } catch (e) {
        console.error("SEARCH ERROR:", e);
        if (resultsEl) resultsEl.innerHTML = `<div style="color:red;">通信エラー: ${e.message}</div>`;
    }
}

// --- 以下、既存の操作関数 ---
window.doNominate = async function(name, mother) {
    if (!confirm(`${name} を指名しますか？`)) return;
    try {
        const formData = new URLSearchParams();
        formData.append('horse_name', name);
        formData.append('mother_name', mother);
        const res = await fetch('/nominate', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.status === 'success') { alert("指名完了"); updateStatus(); if (typeof switchTab === 'function') switchTab('tab-my'); }
    } catch (e) { console.error(e); }
}

window.startReveal = async function() { await fetch('/mc/start_reveal', {method:'POST'}); updateStatus(); }
window.nextReveal = async function() { await fetch('/mc/next_reveal', {method:'POST'}); updateStatus(); }
window.runLottery = async function() { if(confirm("抽選？")) await fetch('/mc/run_lottery', {method:'POST'}); updateStatus(); }
window.nextRound = async function() { if(confirm("次巡？")) await fetch('/mc/next_round', {method:'POST'}); updateStatus(); }

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}
let lastPhase = "";