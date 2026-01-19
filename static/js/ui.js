/* ==========================================================================
   POG UI Module (Ver.0.3.0)
   ========================================================================== */
const POG_UI = {
    // --- [Utility] 汎用更新 ---
    updateText(id, text) {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    },

    updatePhaseLabel(phase, phaseMap) {
        const currentPhase = String(phase || "").trim().toLowerCase();
        if (currentPhase) {
            this.updateText('phase_label', phaseMap[currentPhase] || currentPhase);
        }
    },

    // --- [UI Renderer] プレイヤーカード一覧の生成 ---
    renderPlayerCards(data) {
        const allStatusDiv = document.getElementById('all_status_list');
        if (!allStatusDiv || !data.all_players || !data.all_nominations) return;

        const currentFingerprint = JSON.stringify(data.all_nominations) + data.phase + data.reveal_index;
        if (window.AppState.lastStatusFingerprint === currentFingerprint) return;
        window.AppState.lastStatusFingerprint = currentFingerprint;

        // getCookieはapp.js側にある共通ツールを想定
        const me = decodeURIComponent(getCookie('pog_user') || "").replace(/\+/g, ' ');
        let html = '';

        data.all_players.forEach(playerName => {
            html += `<div class="card"><h3 class="card-title-border">${playerName}</h3>`;
            html += `<table class="status-table"><thead><tr><th>巡</th><th>馬名 / 血統</th></tr></thead>`;
            const playerNoms = data.all_nominations.filter(n => n.player_name === playerName).sort((a, b) => a.round - b.round);
            if (playerNoms.length === 0) {
                html += `<tr><td colspan="2" class="status-empty-msg">まだ指名がありません</td></tr>`;
            } else {
                playerNoms.forEach(n => {
                    const isMe = (playerName === me), isCurrentRound = (n.round === data.round), isUnconfirmed = (n.is_winner === 0);
                    let shouldHide = false, hideMsg = '??? (未公開)';
                    if (!isMe && isCurrentRound && isUnconfirmed) {
                        if (data.phase === 'nomination') { shouldHide = true; hideMsg = '??? (指名済み)'; }
                        else if (data.phase === 'reveal') {
                            const playerIdx = data.all_players.indexOf(playerName);
                            if (playerIdx > data.reveal_index) { shouldHide = true; hideMsg = '??? (公開待ち)'; }
                        } else if (['summary', 'lottery_reveal'].includes(data.phase)) { shouldHide = true; hideMsg = '??? (抽選待ち)'; }
                    }
                    const hName = shouldHide ? hideMsg : n.horse_name;
                    const father = n.horses?.father_name || '-', mother = n.horses?.mother_name || n.mother_name || '-';
                    const winStatusClass = n.is_winner === 1 ? 'winner' : (n.is_winner === -1 ? 'loser' : 'pending');
                    html += `<tr><td class="col-round">${n.round}</td><td class="col-horse ${winStatusClass}"><div>${hName}</div>`;
                    if (!shouldHide) html += `<div class="col-horse-sub">${father} / ${mother}</div>`;
                    html += `</td></tr>`;
                });
            }
            html += '</table></div>';
        });
        allStatusDiv.innerHTML = html;
    },

    // --- [UI Renderer] フェーズ別表示エリアの制御 ---
    renderPhaseUI(data) {
        const summaryArea = document.getElementById('lottery_summary_area');
        const lotRevealArea = document.getElementById('lottery_reveal_area');
        const revealArea = document.getElementById('reveal_area');

        const toggleArea = (el, show) => {
            if (!el) return;
            if (show) { el.classList.add('is-visible'); el.classList.remove('is-hidden'); }
            else { el.classList.add('is-hidden'); el.classList.remove('is-visible'); }
        };

        toggleArea(summaryArea, data.phase === 'summary');
        toggleArea(lotRevealArea, data.phase === 'lottery_reveal');
        toggleArea(revealArea, data.phase === 'reveal' && !!data.reveal_data);

        if (data.phase === 'summary' && summaryArea) {
            const listEl = document.getElementById('lottery_summary_list');
            const horseGroups = {};
            data.all_nominations.filter(n => n.round === data.round && n.is_winner === 0).forEach(n => {
                if (!horseGroups[n.horse_name]) horseGroups[n.horse_name] = [];
                horseGroups[n.horse_name].push(n.player_name);
            });
            let singleHtml = '<div class="summary-section"><h4 class="summary-label-success">【単独確定】</h4><div class="summary-list-success">';
            let multiHtml = '<div class="summary-section"><h4 class="summary-label-danger">【重複・抽選対象】</h4>';
            let hasMulti = false, hasSingle = false;
            Object.keys(horseGroups).forEach(h => {
                const pts = horseGroups[h];
                if (pts.length > 1) {
                    hasMulti = true;
                    multiHtml += `<div class="summary-card-danger"><div class="summary-horse-name">${h}</div><div class="summary-participants">指名者: ${pts.join(' / ')}</div></div>`;
                } else {
                    hasSingle = true;
                    singleHtml += `<div class="summary-item-success"><strong>${h}</strong> <span class="summary-item-sub">(${pts[0]})</span></div>`;
                }
            });
            listEl.innerHTML = (hasMulti ? multiHtml + '</div>' : "") + (hasSingle ? singleHtml + '</div></div>' : "");
        }

        if (data.phase === 'lottery_reveal' && lotRevealArea) {
            const queue = data.lottery_queue || [], idx = data.lottery_idx || 0, resMap = data.lottery_results || {};
            if (queue[idx]) {
                const hName = queue[idx], res = resMap[hName];
                document.getElementById('lot_horse_name').innerText = hName;
                document.getElementById('lot_candidate_list').innerText = `候補: ${res.participants.join(', ')}`;
                document.getElementById('lot_result_box').classList.add('is-visible');
                document.getElementById('lot_winner_name').innerText = res.winner_name;
            }
        }

        if (data.phase === 'reveal' && data.reveal_data && revealArea) {
            ['round', 'player', 'horse', 'father', 'mother', 'stable', 'breeder'].forEach(key => {
                const el = document.getElementById(`reveal_${key}`);
                if (el) el.innerText = data.reveal_data[key] ?? "";
            });
        }
    },

    // --- [UI Renderer] 指名状況カウンターと待機リストの描画 ---
    renderStatusCounter(data) {
        const counterEl = document.getElementById('status_counter');
        const waitDiv = document.getElementById('waiting_list_bar');
        if (!counterEl) return;

        const currentRoundInt = parseInt(data.round);
        const allNoms = Array.isArray(data.all_nominations) ? data.all_nominations : [];
        const nominatedPlayers = new Set(allNoms.filter(n => n && parseInt(n.round) === currentRoundInt && n.is_winner === 0).map(n => n.player_name));
        const winners = new Set(allNoms.filter(n => n && parseInt(n.round) === currentRoundInt && n.is_winner === 1).map(n => n.player_name));
        const realTargetCount = (data.total_players || 0);

        counterEl.innerText = `指名状況: ${nominatedPlayers.size} / ${realTargetCount} 人`;
        if (waitDiv) {
            const waitingPlayers = data.all_players.filter(p => !winners.has(p) && !nominatedPlayers.has(p));
            if (waitingPlayers.length > 0 && data.phase === 'nomination') {
                waitDiv.innerText = `指名検討中: ${waitingPlayers.join(', ')}`;
                waitDiv.classList.add('is-visible'); waitDiv.classList.remove('is-hidden');
            } else {
                waitDiv.classList.add('is-hidden'); waitDiv.classList.remove('is-visible');
            }
        }
    },

    // --- [UI Renderer] MC操作パネルの描画 (新規追加) ---
    renderMCPanel(data) {
        const btn = document.getElementById('mc_main_btn');
        if (!btn || !data.mc_action) return;

        const action = data.mc_action;
        btn.innerText = action.label;
        btn.disabled = action.disabled || false;
        
        // クラスの付け替え（btn-success, btn-primary等）
        btn.className = 'mc_main_btn ' + (action.class || '');

        // クリックイベントの再設定（以前のイベントをクリアして新しいエンドポイントを紐付け）
        // クリックイベントの再設定
        btn.onclick = async () => {
            if (action.endpoint) {
                // 1. 読み込み表示処理（フィードバックと連打防止）
                const originalText = btn.innerText;
                btn.innerText = "処理中...";
                btn.disabled = true;

                try {
                    // --- 修正の核心：自動更新をブロックするためにロックをかける ---
                    window.AppState.isUpdating = true;

                    const res = await POG_API.postMCAction(action.endpoint);
                    
                    if (res) {
                        // サーバー反映の確実性を高める猶予
                        await new Promise(resolve => setTimeout(resolve, 500));
                        
                        if (typeof updateStatus === 'function') {
                            // ロックを一時解除して最新を強制取得
                            window.AppState.isUpdating = false;
                            await updateStatus();
                        } else {
                            location.reload(); 
                        }
                    }
                } catch (error) {
                    console.error("[MC_ACTION_ERROR]", error);
                } finally {
                    // 失敗・成功を問わず、最終的にロックを解除しUIを復帰
                    window.AppState.isUpdating = false;
                    btn.innerText = originalText;
                    btn.disabled = false;
                }
            }
        };
    }
};