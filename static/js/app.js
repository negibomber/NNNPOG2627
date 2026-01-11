// [2026-01-11] 既存の「自動検索機能」を復元し、最新ソースに適合
document.addEventListener('DOMContentLoaded', () => {
    updateStatus();
    setInterval(updateStatus, 3000);

    // 入力時に自動検索を実行するイベントリスナーを追加
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
            html += '</table>';
            allStatusDiv.innerHTML = html;
        }

        if (lastPhase !== "" && lastPhase !== data.phase) {
            location.reload();
        }
        lastPhase = data.phase;
    } catch (e) { console.error("Update error:", e); }
}

// --- 馬の検索関数 (自動検索に対応) ---
async function searchHorses() {
    const fInput = document.getElementById('s_father');
    const mInput = document.getElementById('s_mother');
    const resultsEl = document.getElementById('search_results');

    if (!resultsEl || !fInput || !mInput) return;

    const f = fInput.value;
    const m = mInput.value;

    // 以前の仕様通り、2文字未満なら結果をクリアして終了
    if (f.length < 2 && m.length < 2) {
        resultsEl.innerHTML = "";
        return;
    }

    try {
        const url = `/search_horses?f=${encodeURIComponent(f)}&m=${encodeURIComponent(m)}`;
        const res = await fetch(url);
        if (!res.ok) return;

        const horses = await res.json();

        let html = '';
        if (horses && horses.length > 0) {
            horses.forEach(h => {
                html += `
                <div style="padding:15px; border:1px solid #e2e8f0; border-radius:10px; margin-bottom:10px; background:white; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                    <div style="font-weight:bold; font-size:1.1rem;">${h.horse_name}</div>
                    <div style="font-size:0.85rem; color:#64748b; margin-bottom:10px;">父: ${h.father_name} / 母: ${h.mother_name}</div>
                    <button onclick="doNominate('${h.horse_name.replace(/'/g, "\\'")}', '${h.mother_name.replace(/'/g, "\\'")}')" 
                            style="width:100%; padding:10px; background:#10b981; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">
                        この馬を指名する
                    </button>
                </div>`;
            });
            resultsEl.innerHTML = html;
        } else {
            resultsEl.innerHTML = "<div style='padding:10px; color:#64748b; text-align:center;'>該当する馬が見つかりません</div>";
        }
    } catch (e) {
        console.error("Search error:", e);
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
    } catch (e) { alert("通信エラーが発生しました"); }
}

// --- MC操作 ---
window.startReveal = async function() { await fetch('/mc/start_reveal', {method:'POST'}); updateStatus(); }
window.nextReveal = async function() { await fetch('/mc/next_reveal', {method:'POST'}); updateStatus(); }
window.runLottery = async function() { if(confirm("抽選実行？")) await fetch('/mc/run_lottery', {method:'POST'}); updateStatus(); }
window.nextRound = async function() { if(confirm("次巡へ？")) await fetch('/mc/next_round', {method:'POST'}); updateStatus(); }