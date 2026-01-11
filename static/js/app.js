// 状態更新関数
async function updateStatus() {
    try {
        const res = await fetch('/status');
        const data = await res.json();

        // 基本情報の表示
        const roundDisp = document.getElementById('round_display');
        if (roundDisp) roundDisp.innerText = data.round;

        const phaseDisp = document.getElementById('phase_display');
        if (phaseDisp) {
            const phaseMap = {
                'nomination': '指名受付中',
                'reveal': '指名公開中',
                'lottery': '抽選・結果確定'
            };
            phaseDisp.innerText = phaseMap[data.phase] || data.phase;
        }

        // 一人ずつ公開(reveal)の表示ロジック
        const revealArea = document.getElementById('reveal_area');
        if (revealArea) {
            if (data.phase === 'reveal' && data.reveal_data) {
                revealArea.style.display = 'block';
                document.getElementById('reveal_player').innerText = data.reveal_data.player;
                document.getElementById('reveal_horse').innerText = data.reveal_data.horse;
                document.getElementById('reveal_father').innerText = data.reveal_data.father;
                document.getElementById('reveal_mother').innerText = data.reveal_data.mother;
            } else {
                revealArea.style.display = 'none';
            }
        }

        // 指名状況一覧の更新
        const allStatusDiv = document.getElementById('all_status');
        if (allStatusDiv) {
            let html = '<table class="status-table">';
            data.all_players.forEach(playerName => {
                const nom = data.all_nominations.find(n => n.player_name === playerName && n.round === data.round);
                let horseTxt = "-";
                if (nom) {
                    // revealフェーズ以降、または自分の指名なら表示
                    const isMe = (playerName === decodeURIComponent(getCookie('pog_user')));
                    if (data.phase !== 'nomination' || isMe) {
                        horseTxt = nom.horse_name;
                        if (nom.is_winner === 1) horseTxt = `⭐ ${horseTxt}`;
                        if (nom.is_winner === -1) horseTxt = `<del>${horseTxt}</del> (落選)`;
                    } else {
                        horseTxt = "???";
                    }
                }
                html += `<tr><td>${playerName}</td><td>${horseTxt}</td></tr>`;
            });
            html += '</table>';
            allStatusDiv.innerHTML = html;
        }
    } catch (e) {
        console.error("Status update error:", e);
    }
}

// 馬の検索関数
async function searchHorses() {
    const f = document.getElementById('s_father').value;
    const m = document.getElementById('s_mother').value;
    if (f.length < 2 && m.length < 2) {
        alert("父名または母名を2文字以上入力してください");
        return;
    }

    const res = await fetch(`/search_horses?f=${encodeURIComponent(f)}&m=${encodeURIComponent(m)}`);
    const horses = await res.json();

    let html = '';
    horses.forEach(h => {
        html += `
        <div class="horse-item">
            <div class="horse-info">
                <strong>${h.horse_name || '（馬名未定）'}</strong><br>
                <small>父: ${h.father_name} / 母: ${h.mother_name}</small>
            </div>
            <button class="nominate-btn" onclick="nominate('${h.horse_name}', '${h.mother_name}')">指名</button>
        </div>`;
    });
    document.getElementById('search_results').innerHTML = html || '該当する馬が見つかりません';
}

// 指名実行関数
async function nominate(name, mother) {
    if (!confirm(`${name} を指名しますか？`)) return;
    const formData = new URLSearchParams();
    formData.append('horse_name', name);
    formData.append('mother_name', mother);

    await fetch('/nominate', {
        method: 'POST',
        body: formData
    });
    alert("指名完了");
    updateStatus();
}

// MC操作用関数
async function startReveal() {
    if (!confirm("指名公開を開始しますか？")) return;
    await fetch('/mc/start_reveal', { method: 'POST' });
    updateStatus();
}

async function nextReveal() {
    await fetch('/mc/next_reveal', { method: 'POST' });
    updateStatus();
}

async function runLottery() {
    if (!confirm("抽選を実行して結果を確定させますか？")) return;
    await fetch('/mc/run_lottery', { method: 'POST' });
    updateStatus();
}

async function nextRound() {
    if (!confirm("次のラウンドへ進みますか？（落選者がいる場合は再指名になります）")) return;
    await fetch('/mc/next_round', { method: 'POST' });
    updateStatus();
}

// クッキー取得用ヘルパー
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

// タブ切り替えロジック
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
}

// 初期化
setInterval(updateStatus, 3000);
updateStatus();