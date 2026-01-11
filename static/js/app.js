// [2026-01-11] 最新版ソースを元に、実行状況を可視化するデバッグ処理を追加
document.addEventListener('DOMContentLoaded', () => {
    console.log("APP: DOMContentLoaded - 初期化開始");
    updateStatus();
    setInterval(updateStatus, 3000);
});

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

let lastPhase = "";

// --- 状態更新関数 ---
async function updateStatus() {
    try {
        const res = await fetch('/status');
        if (!res.ok) return;
        const data = await res.json();

        const roundDisp = document.getElementById('round_display');
        if (roundDisp) roundDisp.innerText = data.round;

        const phaseDisp = document.getElementById('phase_label');
        if (phaseDisp) {
            const phaseMap = {
                'nomination': '指名受付中',
                'reveal': '指名公開中',
                'lottery': '抽選・結果確定'
            };
            phaseDisp.innerText = phaseMap[data.phase] || data.phase;
        }

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
                    if (data.phase !== 'nomination' || isMe) {
                        horseTxt = nom.horse_name;
                    } else {
                        horseTxt = '???';
                    }
                }
                html += `<tr><td>${playerName}</td><td>${horseTxt}</td></tr>`;
            });
            allStatusDiv.innerHTML = html;
        }

        if (lastPhase !== "" && lastPhase !== data.phase) {
            location.reload();
        }
        lastPhase = data.phase;
    } catch (e) { console.error("Update error:", e); }
}

// --- 馬の検索関数 (デバッグ出力強化版) ---
window.searchHorses = async function() {
    const resultsEl = document.getElementById('search_results');
    const fInput = document.getElementById('s_father');
    const mInput = document.getElementById('s_mother');

    if (!resultsEl) {
        alert("エラー: ID 'search_results' が見つかりません");
        return;
    }

    const f = fInput.value;
    const m = mInput.value;

    // デバッグ開始表示
    resultsEl.innerHTML = `
        <div style="background:#f1f5f9; padding:10px; border-radius:5px; font-size:0.8rem; border-left:4px solid #3b82f6;">
            [DEBUG] 検索を開始します...<br>
            入力: 父[${f}] 母[${m}]
        </div>
    `;

    if (f.length < 2 && m.length < 2) {
        alert("2文字以上入力してください");
        return;
    }

    try {
        const url = `/search_horses?f=${encodeURIComponent(f)}&m=${encodeURIComponent(m)}`;
        console.log("DEBUG: Fetch URL:", url);
        
        const res = await fetch(url);
        
        if (!res.ok) {
            resultsEl.innerHTML += `<div style="color:red;">[DEBUG] 通信失敗: ステータス ${res.status}</div>`;
            return;
        }

        const horses = await res.json();
        console.log("DEBUG: Received data:", horses);

        if (horses && horses.length > 0) {
            let html = `<div style="color:green; font-size:0.8rem; margin-bottom:10px;">[DEBUG] ${horses.length}件のデータを取得しました</div>`;
            horses.forEach(h => {
                html += `
                <div style="padding:15px; border:1px solid #e2e8f0; border-radius:10px; margin-bottom:10px; background:white;">
                    <div style="font-weight:bold;">${h.horse_name}</div>
                    <div style="font-size:0.85rem; color:#64748b; margin-bottom:10px;">父: ${h.father_name} / 母: ${h.mother_name}</div>
                    <button onclick="window.doNominate('${h.horse_name.replace(/'/g, "\\'")}', '${h.mother_name.replace(/'/g, "\\'")}')" 
                            style="width:100%; padding:10px; background:#10b981; color:white; border:none; border-radius:6px; font-weight:bold;">
                        指名する
                    </button>
                </div>`;
            });
            resultsEl.innerHTML = html;
        } else {
            resultsEl.innerHTML += `<div style="color:#64748b; padding:10px;">[DEBUG] データは空でした。検索条件に合う馬がいないか、既に当選済みです。</div>`;
        }
    } catch (e) {
        console.error("DEBUG: Exception:", e);
        resultsEl.innerHTML += `<div style="color:red; padding:10px;">[DEBUG] JS例外発生: ${e.message}</div>`;
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
            updateStatus();
            if (typeof switchTab === 'function') switchTab('tab-my');
        } else {
            alert("エラー: " + data.message);
        }
    } catch (e) { alert("通信エラーが発生しました"); }
}

// --- MC操作 ---
window.startReveal = async function() { await fetch('/mc/start_reveal', {method:'POST'}); updateStatus(); }
window.nextReveal = async function() { await fetch('/mc/next_reveal', {method:'POST'}); updateStatus(); }
window.runLottery = async function() { if(confirm("抽選実行？")) await fetch('/mc/run_lottery', {method:'POST'}); updateStatus(); }
window.nextRound = async function() { if(confirm("次巡へ？")) await fetch('/mc/next_round', {method:'POST'}); updateStatus(); }