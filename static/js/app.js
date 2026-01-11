// [2026-01-11] 最新版のソースを元に、既存機能を削除・変更せず修正
document.addEventListener('DOMContentLoaded', () => {
    updateStatus();
    setInterval(updateStatus, 3000);
});

// --- ヘルパー関数 ---
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

let lastPhase = "";

// --- 状態更新関数 (既存ロジックを維持) ---
async function updateStatus() {
    try {
        const res = await fetch('/status');
        if (!res.ok) return;
        const data = await res.json();

        // index.html の各 ID と同期
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

        const revealArea = document.getElementById('reveal_area');
        if (revealArea) {
            if (data.phase === 'reveal' && data.reveal_data) {
                revealArea.style.display = 'block';
                document.getElementById('reveal_player').innerText = `${data.reveal_data.player} の指名`;
                document.getElementById('reveal_horse').innerText = data.reveal_data.horse;
                document.getElementById('reveal_father').innerText = data.reveal_data.father;
                document.getElementById('reveal_mother').innerText = data.reveal_data.mother;
            } else {
                revealArea.style.display = 'none';
            }
        }

        const allStatusDiv = document.getElementById('all_status_list');
        if (allStatusDiv && data.all_players) {
            let html = '<table style="width:100%; border-collapse:collapse;">';
            data.all_players.forEach(playerName => {
                const nom = data.all_nominations.find(n => n.player_name === playerName && n.round === data.round);
                let horseTxt = '<span style="color:#94a3b8;">-</span>';
                if (nom) {
                    const isMe = (playerName === decodeURIComponent(getCookie('pog_user') || ""));
                    if (data.phase !== 'nomination' || isMe) {
                        horseTxt = `<strong>${nom.horse_name}</strong>`;
                        if (nom.is_winner === 1) horseTxt = `⭐ ${horseTxt}`;
                        if (nom.is_winner === -1) horseTxt = `<del>${nom.horse_name}</del> (落選)`;
                    } else {
                        horseTxt = '???';
                    }
                }
                html += `<tr style="border-bottom:1px solid #eee;"><td style="padding:8px 0;">${playerName}</td><td style="text-align:right;">${horseTxt}</td></tr>`;
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

// --- 馬の検索関数 (main.py の search_horses API の戻り値に完全準拠) ---
window.searchHorses = async function() {
    const f = document.getElementById('s_father').value;
    const m = document.getElementById('s_mother').value;
    const resultsEl = document.getElementById('search_results');

    if (!resultsEl) return;
    if (f.length < 2 && m.length < 2) {
        alert("父名または母名を2文字以上入力してください");
        return;
    }

    resultsEl.innerHTML = "<div style='padding:20px; text-align:center;'>検索中...</div>";

    try {
        // main.py の query パラメータ f, m を使用
        const res = await fetch(`/search_horses?f=${encodeURIComponent(f)}&m=${encodeURIComponent(m)}`);
        const horses = await res.json();

        let html = '';
        if (horses && horses.length > 0) {
            horses.forEach(h => {
                // main.py の return [h for h in res.data ...] のキー名を使用
                html += `
                <div style="padding:15px; border:1px solid #e2e8f0; border-radius:10px; margin-bottom:10px; background:white; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                    <div style="font-weight:bold; font-size:1.1rem;">${h.horse_name}</div>
                    <div style="font-size:0.85rem; color:#64748b; margin-bottom:10px;">父: ${h.father_name} / 母: ${h.mother_name}</div>
                    <button onclick="window.doNominate('${h.horse_name.replace(/'/g, "\\'")}', '${h.mother_name.replace(/'/g, "\\'")}')" 
                            style="width:100%; padding:10px; background:#10b981; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">
                        この馬を指名する
                    </button>
                </div>`;
            });
        } else {
            html = "<div style='padding:20px; text-align:center; color:#64748b;'>該当する馬が見つかりません</div>";
        }
        resultsEl.innerHTML = html;
    } catch (e) {
        resultsEl.innerHTML = "<div style='color:red; padding:20px; text-align:center;'>通信エラーが発生しました</div>";
        console.error("Search error:", e);
    }
}

// --- 指名実行関数 (既存ロジック維持) ---
window.doNominate = async function(name, mother) {
    if (!confirm(`${name} を指名しますか？`)) return;
    const formData = new URLSearchParams();
    formData.append('horse_name', name);
    formData.append('mother_name', mother);
    try {
        const res = await fetch('/nominate', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.status === 'success') {
            alert("指名完了");
            updateStatus();
            if (typeof switchTab === 'function') switchTab('tab-my');
        }
    } catch (e) { console.error("Nominate error:", e); }
}

// --- MC操作用関数 (既存ロジック維持) ---
window.startReveal = async function() { if(confirm("公開を開始しますか？")) await fetch('/mc/start_reveal', {method:'POST'}); updateStatus(); }
window.nextReveal = async function() { await fetch('/mc/next_reveal', {method:'POST'}); updateStatus(); }
window.runLottery = async function() { if(confirm("抽選を実行しますか？")) await fetch('/mc/run_lottery', {method:'POST'}); updateStatus(); }
window.nextRound = async function() { if(confirm("次のラウンドへ進みますか？")) await fetch('/mc/next_round', {method:'POST'}); updateStatus(); }