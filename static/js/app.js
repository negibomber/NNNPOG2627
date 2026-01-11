// [2026-01-11] 最新版ソースを元に、自動検索を確実に実行し、デバッグ機能も残して修正
document.addEventListener('DOMContentLoaded', () => {
    console.log("APP: 起動しました。自動検索の監視を開始します。");
    updateStatus();
    setInterval(updateStatus, 3000);

    // 入力欄を特定し、入力があるたびに searchHorses を実行するように紐付け
    const fInput = document.getElementById('s_father');
    const mInput = document.getElementById('s_mother');
    
    if (fInput) fInput.addEventListener('input', searchHorses);
    if (mInput) mInput.addEventListener('input', searchHorses);
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

        // 既存の表示更新ロジック
        const roundDisp = document.getElementById('round_display');
        if (roundDisp) roundDisp.innerText = data.round;

        const phaseDisp = document.getElementById('phase_label');
        if (phaseDisp) {
            const phaseMap = {'nomination': '指名受付中', 'reveal': '指名公開中', 'lottery': '抽選・結果確定'};
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
                    if (data.phase !== 'nomination' || isMe) horseTxt = nom.horse_name;
                    else horseTxt = '???';
                }
                html += `<tr><td>${playerName}</td><td style="text-align:right;">${horseTxt}</td></tr>`;
            });
            html += '</table>';
            allStatusDiv.innerHTML = html;
        }

        if (lastPhase !== "" && lastPhase !== data.phase) location.reload();
        lastPhase = data.phase;
    } catch (e) { console.error("Update error:", e); }
}

// --- 馬の検索関数 (自動検索 + デバッグログ) ---
async function searchHorses() {
    const fInput = document.getElementById('s_father');
    const mInput = document.getElementById('s_mother');
    const resultsEl = document.getElementById('search_results');

    if (!resultsEl || !fInput || !mInput) return;

    const f = fInput.value;
    const m = mInput.value;

    // デバッグ: 実行されたことを確認
    console.log(`DEBUG: 自動検索実行中... 父[${f}] 母[${m}]`);

    // 2文字未満なら結果をクリアして終了
    if (f.length < 2 && m.length < 2) {
        resultsEl.innerHTML = "";
        return;
    }

    // 検索中表示
    resultsEl.innerHTML = "<div style='font-size:0.8rem; color:#3b82f6;'>[DEBUG] 検索中...</div>";

    try {
        const url = `/search_horses?f=${encodeURIComponent(f)}&m=${encodeURIComponent(m)}`;
        const res = await fetch(url);
        if (!res.ok) {
            resultsEl.innerHTML = `<div style="color:red;">[DEBUG] 通信失敗: ${res.status}</div>`;
            return;
        }

        const horses = await res.json();

        if (horses && horses.length > 0) {
            let html = `<div style="color:green; font-size:0.7rem; margin-bottom:5px;">[DEBUG] ${horses.length}件ヒット</div>`;
            horses.forEach(h => {
                html += `
                <div style="padding:15px; border:1px solid #e2e8f0; border-radius:10px; margin-bottom:10px; background:white; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                    <div style="font-weight:bold; font-size:1.1rem;">${h.horse_name}</div>
                    <div style="font-size:0.85rem; color:#64748b; margin-bottom:10px;">父: ${h.father_name} / 母: ${h.mother_name}</div>
                    <button onclick="doNominate('${h.horse_name.replace(/'/g, "\\'")}', '${h.mother_name.replace(/'/g, "\\'")}')" 
                            style="width:100%; padding:10px; background:#10b981; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">
                        指名する
                    </button>
                </div>`;
            });
            resultsEl.innerHTML = html;
        } else {
            resultsEl.innerHTML = "<div style='padding:10px; color:#64748b; text-align:center;'>[DEBUG] 該当なし</div>";
        }
    } catch (e) {
        resultsEl.innerHTML = `<div style="color:red;">[DEBUG] エラー: ${e.message}</div>`;
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
        }
    } catch (e) { alert("通信エラー"); }
}

// --- MC操作 ---
window.startReveal = async function() { await fetch('/mc/start_reveal', {method:'POST'}); updateStatus(); }
window.nextReveal = async function() { await fetch('/mc/next_reveal', {method:'POST'}); updateStatus(); }
window.runLottery = async function() { if(confirm("抽選実行？")) await fetch('/mc/run_lottery', {method:'POST'}); updateStatus(); }
window.nextRound = async function() { if(confirm("次巡へ？")) await fetch('/mc/next_round', {method:'POST'}); updateStatus(); }