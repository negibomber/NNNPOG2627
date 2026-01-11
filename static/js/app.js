// --- ヘルパー関数 ---
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

        // 1. 基本情報の表示
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

        // 2. 指名済人数のカウント表示
        const counterEl = document.getElementById('status_counter');
        if (counterEl && data.all_nominations) {
            const nominatedCount = new Set(data.all_nominations
                .filter(n => n.round === data.round && (n.is_winner === 0 || n.is_winner === 1))
                .map(n => n.player_name)).size;
            counterEl.innerText = `指名状況: ${nominatedCount} / ${data.total_players} 人`;
        }

        // 3. 公開(reveal)の表示
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

        // 4. 全体状況の更新
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

// --- 馬の検索関数（最新 main.py に完全適合） ---
async function searchHorses() {
    const f = document.getElementById('s_father').value;
    const m = document.getElementById('s_mother').value;
    const resultsEl = document.getElementById('search_results');

    if (!resultsEl) return;
    if (f.length < 2 && m.length < 2) {
        alert("2文字以上入力してください");
        return;
    }

    resultsEl.innerHTML = "検索中...";

    try {
        const res = await fetch(`/search_horses?f=${encodeURIComponent(f)}&m=${encodeURIComponent(m)}`);
        const horses = await res.json();

        let html = '';
        if (horses && horses.length > 0) {
            horses.forEach(h => {
                html += `
                <div style="padding:10px; border:1px solid #ddd; border-radius:8px; margin-bottom:8px; background:white;">
                    <strong>${h.horse_name}</strong><br>
                    <small>父: ${h.father_name} / 母: ${h.mother_name}</small><br>
                    <button onclick="doNominate('${h.horse_name}', '${h.mother_name}')" 
                            style="width:100%; margin-top:5px; padding:8px; background:#10b981; color:white; border:none; border-radius:4px;">
                        指名する
                    </button>
                </div>`;
            });
        } else {
            html = "見つかりませんでした。";
        }
        resultsEl.innerHTML = html;
    } catch (e) {
        resultsEl.innerHTML = "エラーが発生しました。";
        console.error(e);
    }
}

// --- 指名実行 ---
async function doNominate(name, mother) {
    if (!confirm(`${name} を指名しますか？`)) return;
    const formData = new URLSearchParams();
    formData.append('horse_name', name);
    formData.append('mother_name', mother);
    await fetch('/nominate', { method: 'POST', body: formData });
    alert("指名完了");
    updateStatus();
    if (typeof switchTab === 'function') switchTab('tab-my');
}

// --- MC操作 ---
async function startReveal() { await fetch('/mc/start_reveal', {method:'POST'}); updateStatus(); }
async function nextReveal() { await fetch('/mc/next_reveal', {method:'POST'}); updateStatus(); }
async function runLottery() { await fetch('/mc/run_lottery', {method:'POST'}); updateStatus(); }
async function nextRound() { await fetch('/mc/next_round', {method:'POST'}); updateStatus(); }

setInterval(updateStatus, 3000);
updateStatus();