/* ==========================================================================
   POG UI Module (Ver.0.11.0)
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
    renderPlayerCards(data, config) {
        const allStatusDiv = document.getElementById('all_status_list');
        if (!allStatusDiv || !data.all_players || !data.all_nominations) return;

        // 修正：独自のガード句を削除し、マトリクス許可証(config.board)に従う
        // これにより、抽選中(ID:8)でも裏側のカード更新が可能になる
        if (!config || config.board !== 1) {
            return;
        }

        // getCookieはapp.js側の共通ツールをwindow経由または直接参照
        const me = decodeURIComponent((typeof getCookie === 'function' ? getCookie('pog_user') : "") || "").replace(/\+/g, ' ');
        let html = '';

        data.all_players.forEach(playerName => {
            html += `<div class="card"><h3 class="card-title-border">${playerName}</h3>`;
            html += `<table class="status-table"><thead><tr><th>巡</th><th>馬名 / 血統</th></tr></thead>`;
            const playerNoms = data.all_nominations.filter(n => n.player_name === playerName).sort((a, b) => (a.round - b.round) || (a.is_winner - b.is_winner));
            if (playerNoms.length === 0) {
                html += `<tr><td colspan="2" class="status-empty-msg">まだ指名がありません</td></tr>`;
            } else {
                playerNoms.forEach(n => {
                    const isMe = (playerName === me), isCurrentRound = (n.round === data.round), isUnconfirmed = (n.is_winner === 0);
                    let shouldHide = false, hideMsg = '??? (未公開)';
                    if (!isMe && isCurrentRound && isUnconfirmed) {
                        if (data.phase === 'nomination') { shouldHide = true; hideMsg = '??? (指名済み)'; }
                        else if (data.phase === 'reveal' && data.all_players.indexOf(playerName) > data.reveal_index) {
                            shouldHide = true; hideMsg = '??? (公開待ち)';
                        }
                    }
                    const hName = shouldHide ? hideMsg : n.horse_name;
                    
                    // 性別の取得
                    let sexMarker = "";
                    if (!shouldHide && n.horses?.sex) {
                        const s = n.horses.sex;
                        const sClass = s === '牡' ? 'sex-m' : (s === '牝' ? 'sex-f' : '');
                        sexMarker = `<span class="${sClass}">${s}</span>`;
                    }

                    const father = n.horses?.father_name || '-', mother = n.horses?.mother_name || n.mother_name || '-';
                    const winStatusClass = n.is_winner === 1 ? 'winner' : (n.is_winner === -1 ? 'loser' : 'pending');
                    // 修正：落選馬（-1）の場合は取り消し線スタイルを適用して表示
                    const nameStyle = (n.is_winner === -1) ? 'text-decoration:line-through; opacity:0.8;' : '';

                    // 権限証拠（window.IS_MC）に基づき修正ボタンを生成
                    const editBtn = (window.IS_MC && n.is_winner === 1) ? `<button class="btn-edit-mini" onclick="event.stopPropagation(); window.editNominationByMC('${playerName}', ${n.round})">修正</button>` : '';

                    html += `<tr><td class="col-round">${n.round}</td><td class="col-horse ${winStatusClass}"><div style="${nameStyle}">${hName}${sexMarker}${editBtn}</div>`;
                    if (!shouldHide) html += `<div class="col-horse-sub">${father} / ${mother}</div>`;
                    html += `</td></tr>`;
                });
            }
            html += '</table></div>';
        });
        allStatusDiv.innerHTML = html;
    },

    // --- [UI Renderer] フェーズ別表示エリアの制御 ---
    renderPhaseUI(data, config) {
        const summaryArea = document.getElementById('lottery_summary_area');
        const boardLayer = document.getElementById('board_layer');
        
        // 修正：フェーズ名での分岐を廃止し、マトリクス(config.board)で表示を制御
        const showBoard = (config && config.board === 1 && document.getElementById('theater_layer').style.display === 'flex'); 
        // ※ 解説: boardレイヤーは「シアターの下地」として使われるため、
        //   通常画面(IDLE)では非表示(none)、シアター起動中かつconfig.board=1なら表示(flex)とする運用に合わせて調整

        if (boardLayer) {
            // ボード表示条件：シアター演出中 OR config.boardが1
            const isSummaryPhase = (data.phase === 'summary');
            const isTheaterActive = (document.body.classList.contains('is-theater-active') || window.AppState.uiMode === 'THEATER');
            const shouldShow = (config && config.board === 1 && (isSummaryPhase || isTheaterActive));
            
            POG_Log.d(`BOARD_DISPLAY: phase=${data.phase}, board=${config?.board}, theaterActive=${isTheaterActive}, shouldShow=${shouldShow}`);
            
            if (shouldShow) {
                boardLayer.style.display = 'flex';
                POG_Log.d(`BOARD_DISPLAY: Setting flex, calling renderDraftPanel`);
                this.renderDraftPanel(data);
            } else {
                boardLayer.style.display = 'none';
                POG_Log.d(`BOARD_DISPLAY: Hiding board`);
            }
        } else {
            POG_Log.d(`BOARD_DISPLAY: boardLayer element not found!`);
        }
        const lotRevealArea = document.getElementById('lottery_reveal_area');
        const revealArea = document.getElementById('reveal_area');

        const toggleArea = (el, show) => {
            if (!el) return;
            if (show) { el.classList.add('is-visible'); el.classList.remove('is-hidden'); }
            else { el.classList.add('is-hidden'); el.classList.remove('is-visible'); }
        };

        toggleArea(summaryArea, data.phase === 'summary');
        // 証拠：抽選エリアもtoggleAreaで管理し、必要な時以外は物理的に消す
        toggleArea(lotRevealArea, data.phase === 'lottery_reveal');
        toggleArea(revealArea, data.phase === 'reveal' && !!data.reveal_data);

        // 抽選演出への委譲は app.js の Router に統合済みのため削除
        // フラグのリセットのみ残す
        if (data.phase !== 'lottery_result') {
            window.AppState.lastProcessedPhase = null;
        }

        if (data.phase === 'summary' && summaryArea) {
            const listEl = document.getElementById('lottery_summary_list');
            const horseGroups = {};
            data.all_nominations.filter(n => n.round === data.round && n.is_winner === 0).forEach(n => {
                if (!horseGroups[n.horse_name]) {
                    // 馬名と性別をセットで保持
                    let sexMark = "";
                    if (n.horses?.sex) {
                        const s = n.horses.sex;
                        const sClass = s === '牡' ? 'sex-m' : (s === '牝' ? 'sex-f' : '');
                        sexMark = `<span class="${sClass}">${s}</span>`;
                    }
                    horseGroups[n.horse_name] = { pts: [], sexMark: sexMark };
                }
                horseGroups[n.horse_name].pts.push(n.player_name);
            });
            let singleHtml = '<div class="summary-section"><h4 class="summary-label-success">【単独確定】</h4><div class="summary-list-success">';
            let multiHtml = '<div class="summary-section"><h4 class="summary-label-danger">【重複・抽選対象】</h4>';
            let hasMulti = false, hasSingle = false;
            Object.keys(horseGroups).forEach(h => {
                const group = horseGroups[h];
                if (group.pts.length > 1) {
                    hasMulti = true;
                    // 馬名の横に sexMark を追加
                    multiHtml += `<div class="summary-card-danger"><div class="summary-horse-name">${h}${group.sexMark}</div><div class="summary-participants">指名者: ${group.pts.join(' / ')}</div></div>`;
                } else {
                    hasSingle = true;
                    // 馬名の横に sexMark を追加
                    singleHtml += `<div class="summary-item-success"><strong>${h}${group.sexMark}</strong> <span class="summary-item-sub">(${group.pts[0]})</span></div>`;
                }
            });
            listEl.innerHTML = (hasMulti ? multiHtml + '</div>' : "") + (hasSingle ? singleHtml + '</div></div>' : "");
        }

        if (data.phase === 'lottery_reveal' && lotRevealArea) {
            const queue = data.lottery_queue || [], idx = data.lottery_idx || 0, resMap = data.lottery_results || {};
            if (queue[idx]) {
                const hName = queue[idx], res = resMap[hName];
                POG_Log.d(`renderPhaseUI LOTTERY: index=${idx}, horse=${hName}`);
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
    renderStatusCounter(data, config) {
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

    // --- [MC Action] MC操作の実行 (共通ロジック) ---
    async executeMCAction() {
        const data = window.AppState.latestData;
        if (!data || !data.mc_action) return;
        const btn = document.getElementById('mc_main_btn');

        try {
            // 1. 通信開始: 自ら BUSY を宣言し、描画を物理ロックする
            window.AppState.setMode('BUSY', 'executeMCAction');
            
            if (btn) {
                btn.innerText = "処理中...";
                btn.disabled = true;
            }

            // タイマー停止
            if (window.statusTimer) {
                clearInterval(window.statusTimer);
                window.statusTimer = null;
            }

            const res = await POG_API.postMCAction(data.mc_action.endpoint);
            
            // 2. 通信完了後: updateStatus に次の判断を委ねる
            if (res && typeof updateStatus === 'function') {
                await updateStatus(null, true);
            }

        } catch (error) {
            POG_Log.e("MCAction Error", error);
            window.AppState.setMode('IDLE', 'executeMCAction_error');
            throw error;
        } finally {
            // 3. 統治権の確認
            // updateStatus の結果、THEATER（演出中）になっていなければ IDLE に戻す
            if (window.AppState.uiMode === 'BUSY') {
                window.AppState.setMode('IDLE', 'executeMCAction_finally');
                
                if (!window.statusTimer) {
                    window.statusTimer = setInterval(updateStatus, 3000);
                }
                // 重要：古い変数を直接触らず、必ず正規の描画関数を通して最新データを反映する
                this.renderMCPanel(window.AppState.latestData);
            }
        }
    },

    renderMCPanel(data, config) {
        // MC専用機能: 参加者はスキップ
        if (!window.IS_MC) return;

        const btn = document.getElementById('mc_main_btn');
        const panel = document.getElementById('mc_panel');
        
        POG_Log.i(`🎮 MC_BTN_RENDER_START: btnExists=${!!btn}, panelExists=${!!panel}, configExists=${!!config}, config.mc_btn=${config?.mc_btn}, hasAction=${!!data.mc_action}`);
        
        if (!btn) {
            POG_Log.e(`   ✗ MC_BTN_RENDER: Button element not found!`);
            return;
        }

        // 1. マトリクスによる表示許可チェック
        if (!config || !config.mc_btn) {
            btn.style.display = 'none';
            POG_Log.i(`   ► MC_BTN_RENDER: Hidden by config (no mc_btn)`);
            return;
        }

        // 2. データチェック
        if (!data.mc_action) {
            btn.style.display = 'none';
            POG_Log.i(`   ► MC_BTN_RENDER: Hidden (no mc_action data)`);
            return;
        }

        // 3. 表示実行
        btn.style.display = 'block';
        btn.innerText = data.mc_action.label;
        btn.disabled = data.mc_action.disabled || false;
        btn.className = 'mc_main_btn ' + (data.mc_action.class || '');

        // パネルの状態も確認
        const panelDisplay = panel ? window.getComputedStyle(panel).display : 'N/A';
        const panelVisibility = panel ? window.getComputedStyle(panel).visibility : 'N/A';
        
        POG_Log.i(`   ✓ MC_BTN_RENDER: ID=${window.AppState.currentContextId}, Label=${data.mc_action.label}, btn.display=${btn.style.display}, panel.computed.display=${panelDisplay}, panel.computed.visibility=${panelVisibility}`);

        btn.onclick = () => {
            this.executeMCAction().catch(() => alert("操作に失敗しました。"));
        };
    },
    renderDraftPanel(data) {
        POG_Log.d(`RENDER_DRAFT_PANEL: Called with ${data.all_players?.length || 0} players`);
        const boardContainer = document.getElementById('board_grid_container');
        const roundLabel = document.getElementById('board_round_label');
        if (!boardContainer || !data.all_players) {
            POG_Log.d(`RENDER_DRAFT_PANEL: Missing elements - container=${!!boardContainer}, players=${!!data.all_players}`);
            return;
        }

        if (roundLabel) roundLabel.innerText = `第 ${data.round} 巡`;

        let html = '';
        const me = decodeURIComponent((typeof getCookie === 'function' ? getCookie('pog_user') : "") || "").replace(/\+/g, ' ');

        data.all_players.forEach(playerName => {
            const n = data.all_nominations.find(nom => nom.player_name === playerName && nom.round === data.round);
            const isMe = (playerName === me);
            
            let shouldHide = false;
            // 役割を分離：公開隠蔽用と、データ欠如時の表示用
            const maskMsg = '公開待ち';
            const emptyMsg = (data.phase === 'nomination') ? '検討中...' : '再指名へ';
            if (n) {
                // 公開フェーズ(reveal)でのみ、まだの順番の人を隠す
                if (data.phase === 'reveal' && !isMe) {
                    const playerIdx = data.all_players.indexOf(playerName);
                    if (playerIdx > data.reveal_index) {
                        shouldHide = true; hideMsg = '公開待ち';
                    }
                }
            }

            const winVal = n ? Number(n.is_winner) : 0;
            let cardClass = 'is-pending'; // デフォルト：未指名
            if (n) {
                if (winVal === 1) {
                    cardClass = 'is-winner'; // 当選
                } else if (winVal === -1) {
                    cardClass = 'is-loser';  // 落選
                } else {
                    cardClass = 'is-normal'; // 抽選待ち
                }
            }
            
            html += `<div class="draft-item-card ${cardClass}">`;
            html += `<div class="draft-item-player">${playerName}</div>`;
            
            if (n) {
                // 役割分離：隠す必要があればマスク、そうでなければ当選状態を確認
                const hName = shouldHide ? maskMsg : (n.is_winner === -1 ? '再指名へ' : n.horse_name);
                let sexMarker = "";
                
                // 修正：落選時(-1)は性別や父母情報を表示しない
                const showDetails = !shouldHide && n.is_winner !== -1;

                if (showDetails && n.horses?.sex) {
                    const s = n.horses.sex;
                    sexMarker = `<span class="${s === '牡' ? 'sex-m' : 'sex-f'}" style="margin-left:8px;">${s}</span>`;
                }
                html += `<div class="draft-item-horse">${hName}${sexMarker}</div>`;
                
                if (showDetails) {
                    const father = n.horses?.father_name || '-';
                    const mother = n.horses?.mother_name || n.mother_name || '-';
                    html += `<div class="draft-item-pedigree">`;
                    html += `<div><span class="label-tag">父</span>${father}</div>`;
                    html += `<div><span class="label-tag">母</span>${mother}</div>`;
                    html += `</div>`;
                }
            } else {
                html += `<div class="draft-item-horse" style="color:#475569;">${emptyMsg}</div>`;
            }
            html += `</div>`;
        });
        boardContainer.innerHTML = html;
    }
};