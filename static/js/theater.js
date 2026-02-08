/* theater.js (Ver.0.11.0) - 右寄せ・ガタつき防止完全維持 + 抽選機能追加版 */
const POG_Theater = {
    async playReveal(data) {
        // 証拠：現在の演出IDを生成し、同一ステータスでの重複再生（ループ）を防止する
        const isLottery = (data.mode === 'lottery' || data.is_lottery === true);
        const playId = `${data.round}_${data.player}_${data.mode}_${data.turn_index || 0}`;
        if (this.currentPlayId === playId) return; 
        this.currentPlayId = playId;

        // 証拠：ステータスに合わせて表示するコンテナを切り替え、不要な方の残像を防ぐ
        const lotDiv = document.getElementById('theater_lottery');
        const cardDiv = document.getElementById('theater_card');
        if (lotDiv) { lotDiv.style.display = isLottery ? 'flex' : 'none'; lotDiv.style.visibility = isLottery ? 'visible' : 'hidden'; }
        if (cardDiv) { cardDiv.style.display = isLottery ? 'none' : 'flex'; cardDiv.style.visibility = isLottery ? 'hidden' : 'visible'; }

        // 証拠：抽選モードの場合は抽選演出へ分岐し、公開画面の処理（第？巡〜）を通さない
        if (isLottery) {
            this.playLotterySelect(data);
            return;
        }

        // --- [ここから Ver.0.6.16 のロジックを1文字も変えず維持] ---
        // クラス状態を可視化する内部ヘルパー
        const getVisibleStatus = () => {
            return ['t_player_area', 't_father_area', 't_mother_area', 't_horse_area', 't_stable_area', 't_mc_ctrl']
                .map(id => {
                    const el = document.getElementById(id);
                    return `${id.replace('t_', '')}:${el ? el.classList.contains('is-visible') : 'NOT_FOUND'}`;
                })
                .join(', ');
        };

        POG_Log.i(`Theater PLAY_START: Round=${data.round}, Index=${window.AppState.lastPlayedIdx}`);
        POG_Log.d(`DEBUG_EVIDENCE: Theater START: [${getVisibleStatus()}]`);

        // 1. 先行リセット：要素の可視性クラスのみを外す（DOM操作をCSSクラス制御へ委譲）
        POG_Log.d("DEBUG_EVIDENCE: Resetting Theater UI components...");
        ['t_player_area', 't_father_area', 't_mother_area', 't_horse_area', 't_stable_area', 't_mc_ctrl'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.remove('is-visible');

            // 修正：ゴースト現象の防止（以前の約束を適用）。物理的に隠し、スタイル崩れを防ぐ。
            // また、ボタン位置が左になる問題を解決するため、JS側で明示的に flex-end を指定する。
            if (id === 't_mc_ctrl') {
                el.style.setProperty('display', 'flex', 'important');
                el.style.setProperty('justify-content', 'flex-end', 'important'); // 右寄せ
                el.style.setProperty('align-items', 'flex-end', 'important');
                el.style.setProperty('opacity', '0', 'important');            // 透明化
                el.style.setProperty('visibility', 'hidden', 'important');     // 不可視
            }
        });
        
        POG_Log.d(`DEBUG_EVIDENCE: AFTER_RESET:  [${getVisibleStatus()}]`);

        // 証拠：シーン「シアター演出中」を宣言。これによりCSSでメインボタンが自動消去される。
        document.body.classList.add('is-theater-active');
        const layer = document.getElementById('theater_layer');
        layer.style.display = 'flex';

        const master = data.horses || {};
        
        // 3. データ流し込み
        document.getElementById('t_title').innerText = `第 ${data.round || '?'} 巡 選択希望競走馬`;
        document.getElementById('t_player').innerText = data.player || '---';
        document.getElementById('t_father').innerText = data.father || master.father_name || '---';
        document.getElementById('t_mother').innerText = data.mother || master.mother_name || '---';
        // 馬名と性別の反映
        const horseEl = document.getElementById('t_horse');
        const sexEl = document.getElementById('t_sex');
        
        // データの汚染源対策：確実に性別データを取得する
        const sex = data.sex || (data.horse_info && data.horse_info.sex) || '';
        
        horseEl.innerText = data.horse_name || data.horse || '---';

        if (sexEl) {
            // 性別データの正規化と表示反映
            if (sex === '牡' || sex === '牝') {
                sexEl.innerText = sex; // 記号を廃止し、データ通りの「牡」「牝」を表示
                sexEl.className = sex === '牡' ? 'sex-m' : 'sex-f'; // CSSクラスに委譲
                sexEl.style.display = 'inline-block';
            } else {
                sexEl.innerText = '';
                sexEl.className = '';
                sexEl.style.display = 'none';
            }
            sexEl.style.removeProperty('color');
        }
        document.getElementById('t_stable').innerText = `${data.stable || master.stable_name || '未定'} / ${data.breeder || master.breeder_name || '---'}`;

        const wait = (ms) => new Promise(res => setTimeout(res, ms));

        // 5. 演出シーケンス
        POG_Log.d("Theater Sequence: START");
        await wait(500);
        document.getElementById('t_player_area').classList.add('is-visible');
        await wait(2000); 
        document.getElementById('t_father_area').classList.add('is-visible');
        await wait(2000);
        document.getElementById('t_mother_area').classList.add('is-visible');
        await wait(500);
        document.getElementById('t_horse_area').classList.add('is-visible');
        document.getElementById('t_stable_area').classList.add('is-visible');
        POG_Log.d("Theater Sequence: FINISHED");

        // 6. MCパネル表示
        await wait(2000); 
        // 修正：ボタンの表示可否は app.js のマトリクスで既に判定されているため、ここでは単に visible クラスを付与するだけ
        const tBtn = document.getElementById('t_next_btn');
        const ctrl = document.getElementById('t_mc_ctrl');
        
        // window.AppState.uiConfig.mc_btn が有効な場合のみボタンを出す
        if (window.AppState.uiConfig && window.AppState.uiConfig.mc_btn && ctrl) {
             const finalMC = window.AppState.latestData?.mc_action;
             if (finalMC && tBtn) {
                 tBtn.innerText = finalMC.label;
                 tBtn.disabled = finalMC.disabled || false;
             }
             // 修正：封印解除。右寄せを維持しつつ可視化する。
             ctrl.style.removeProperty('opacity');
             ctrl.style.removeProperty('visibility');
             // displayはflexのまま維持されるので触らない
             ctrl.classList.add('is-visible');
        }
    },

    // --- [ここから抽選用に追加したメソッド] ---

    async playLotterySelect(data) {
        POG_Log.i(`🎰 ═══ playLotterySelect START ═══`);
        POG_Log.i(`   - horse_name: ${data.horse_name}`);
        POG_Log.i(`   - turn_index: ${data.turn_index}`);
        POG_Log.i(`   - participants: [${(data.participants || []).join(', ')}]`);
        POG_Log.i(`   - selections: ${JSON.stringify(data.selections || {})}`);
        POG_Log.i(`   - winning_index: ${data.winning_index}`);
        
        this.resetTheaterUI('lottery');
        const hName = data.horse_name;
        const participants = data.participants || [];
        const selections = data.selections || {};
        const winningIndex = data.winning_index;
        const turnIdx = data.turn_index || 0;
        const currentPlayer = participants[turnIdx];
        const me = decodeURIComponent((document.cookie.match(/(?:^|;\s*)pog_user=([^;]*)/) || [])[1] || '').replace(/\+/g, ' ');

        POG_Log.i(`   - currentPlayer: ${currentPlayer} (index=${turnIdx})`);
        POG_Log.i(`   - me: ${me}`);
        POG_Log.i(`   - isMyTurn: ${currentPlayer === me}`);

        const horseDisplay = document.getElementById('tl_horse');
        if (horseDisplay) horseDisplay.innerText = hName;
        
        const msgEl = document.getElementById('tl_message');
        if (msgEl) {
            if (currentPlayer === me) {
                msgEl.innerText = "あなたの番です。封筒を選んでください。";
                msgEl.style.color = "#fbbf24";
                POG_Log.i(`   ► Message: "あなたの番です" (yellow)`);
            } else {
                msgEl.innerText = `${currentPlayer} さんが選択中...`;
                msgEl.style.color = "#fff";
                POG_Log.i(`   ► Message: "${currentPlayer} さんが選択中..." (white)`);
            }
        }

        const area = document.getElementById('tl_envelopes_area');
        if (area) {
            area.innerHTML = ''; 
            POG_Log.i(`   - Creating ${participants.length} envelopes`);
            participants.forEach((_, i) => {
                const env = document.createElement('div');
                env.className = 'envelope';
                const selector = selections[String(i)];
                if (selector) {
                    env.classList.add('is-taken');
                    const label = document.createElement('div');
                    label.className = 'envelope-name';
                    label.innerText = selector;
                    env.appendChild(label);
                    if (selector === me) env.classList.add('is-my-choice');
                    POG_Log.d(`     [${i}] TAKEN by ${selector}${selector === me ? ' (ME)' : ''}`);
                } else if (currentPlayer === me) {
                    env.classList.add('is-selectable');
                    env.onclick = () => this.selectEnvelope(i);
                    POG_Log.d(`     [${i}] SELECTABLE (my turn)`);
                } else {
                    POG_Log.d(`     [${i}] EMPTY (not my turn)`);
                }
                area.appendChild(env);
            });
        }

        // 透視ボタン（参加者以外のみ表示）
        const peekBtn = document.getElementById('tl_peek_btn');
        if (peekBtn) {
            const isParticipant = participants.includes(me);
            peekBtn.style.display = !isParticipant ? 'inline-block' : 'none';
            peekBtn.onclick = () => {
                const target = area.children[data.winning_index];
                if (target) target.classList.add('is-peek-winner');
                peekBtn.style.display = 'none';
            };
            POG_Log.i(`   - Peek button: ${!isParticipant ? 'VISIBLE' : 'HIDDEN'}`);
        }
        
        POG_Log.i(`🎰 ═══ playLotterySelect END ═══`);
    },

    async playLotteryResult(data) {
        POG_Log.i(`🏆 ═══ playLotteryResult START ═══`);
        POG_Log.i(`   - horse_name: ${data.horse_name}`);
        POG_Log.i(`   - winning_index: ${data.winning_index}`);
        POG_Log.i(`   - participants: [${(data.participants || []).join(', ')}]`);
        POG_Log.i(`   - selections: ${JSON.stringify(data.selections || {})}`);
        
        this.resetTheaterUI('lottery');
        const hName = data.horse_name;
        const participants = data.participants || [];
        const winningIndex = data.winning_index;
        const turnIdx = data.turn_index || 0;
        const me = decodeURIComponent((document.cookie.match(/(?:^|;\s*)pog_user=([^;]*)/) || [])[1] || '').replace(/\s/g, ' ');
        const currentPlayer = participants[turnIdx];
        const selections = data.selections || {};
        
        const winner = participants[winningIndex];
        POG_Log.i(`   - 🎉 WINNER: ${winner} (index=${winningIndex})`);
        POG_Log.i(`   - me: ${me}`);
        POG_Log.i(`   - I won: ${winner === me}`);
        
        const horseDisplay = document.getElementById('tl_horse');
        if (horseDisplay) horseDisplay.innerText = hName;
        const msgEl = document.getElementById('tl_message');
        if (msgEl) msgEl.innerText = "一斉開封";

        const area = document.getElementById('tl_envelopes_area');
        if (area) {
            // 土台がない場合のみ作成（全消去を回避）
            if (area.children.length !== participants.length) {
                POG_Log.i(`   - Creating envelope containers (${participants.length})`);
                area.innerHTML = '';
                participants.forEach((_, i) => {
                    const div = document.createElement('div');
                    div.className = 'envelope';
                    div.id = `env-${i}`;
                    area.appendChild(div);
                });
            }
            // 各封筒の状態だけを更新
            POG_Log.i(`   - Updating envelope states:`);
            participants.forEach((_, i) => {
                const env = document.getElementById(`env-${i}`);
                if (!env) return;
                const selector = selections[String(i)];
                
                // クラスの制御
                env.classList.toggle('is-taken', !!selector);
                env.classList.toggle('is-my-choice', selector === me);
                env.classList.toggle('is-selectable', (!selector && currentPlayer === me));

                // 当選封筒のハイライト
                const isWinner = (i === winningIndex);
                if (isWinner) {
                    env.classList.add('is-winner');
                }
                
                POG_Log.d(`     [${i}] ${selector || 'EMPTY'}${isWinner ? ' 🏆 WINNER' : ''}${selector === me ? ' (ME)' : ''}`);
                
                // 名前ラベルの更新（変化がある場合のみ）
                let label = env.querySelector('.envelope-name');
                if (selector) {
                    if (!label) {
                        label = document.createElement('div');
                        label.className = 'envelope-name';
                        env.appendChild(label);
                    }
                    if (label.innerText !== selector) label.innerText = selector;
                } else if (label) {
                    label.remove();
                }
                
                env.onclick = (!selector && currentPlayer === me) ? () => this.selectEnvelope(i) : null;
            });
        }
        
        POG_Log.i(`🏆 ═══ playLotteryResult END ═══`);
    },

    async selectEnvelope(idx) {
        POG_Log.i(`📮 selectEnvelope: index=${idx}`);
        if (!confirm("この封筒にしますか？")) {
            POG_Log.i(`   ► User cancelled`);
            return;
        }
        
        try {
            POG_Log.i(`   ► Sending POST /select_envelope`);
            const formData = new URLSearchParams();
            formData.append('envelope_index', idx);
            const res = await fetch('/select_envelope', { method: 'POST', body: formData });
            const json = await res.json();
            
            POG_Log.i(`   ► Response: ${JSON.stringify(json)}`);
            
            if (json.status === 'error') {
                POG_Log.e(`   ✗ Error: ${json.message}`);
                alert(json.message);
            } else {
                POG_Log.i(`   ✓ Success! Forcing updateStatus()`);
                // 成功したら即座に画面更新
                if (typeof updateStatus === 'function') {
                    await updateStatus(null, true);
                }
            }
        } catch(e) {
            POG_Log.e(`   ✗ Exception: ${e.message}`);
            alert("通信エラーが発生しました");
        }
    },

    resetTheaterUI(mode) {
        POG_Log.i(`🎬 resetTheaterUI: mode=${mode}`);
        const layer = document.getElementById('theater_layer');
        if (!layer) {
            POG_Log.e(`   ✗ theater_layer not found!`);
            return;
        }
        layer.style.display = 'flex';

        // シアター演出中であることを宣言（CSSでメインボタンを自動非表示）
        const hadClass = document.body.classList.contains('is-theater-active');
        document.body.classList.add('is-theater-active');
        POG_Log.i(`   - body.is-theater-active: ${hadClass} → true`);
        
        const cardDiv = document.getElementById('theater_card');
        const lotDiv = document.getElementById('theater_lottery');
        if (cardDiv) {
            cardDiv.style.display = (mode === 'reveal' ? 'flex' : 'none');
            POG_Log.i(`   - theater_card.display: ${cardDiv.style.display}`);
        }
        if (lotDiv) {
            lotDiv.style.display = (mode === 'lottery' ? 'flex' : 'none');
            POG_Log.i(`   - theater_lottery.display: ${lotDiv.style.display}`);
        }
        
        const mcCtrl = document.getElementById('t_next_btn')?.parentElement;
        if (mcCtrl) {
            mcCtrl.style.setProperty('display', 'flex', 'important');
            mcCtrl.style.setProperty('justify-content', 'flex-end', 'important');
            mcCtrl.style.setProperty('opacity', '0', 'important');
            mcCtrl.style.setProperty('visibility', 'hidden', 'important');
            POG_Log.i(`   - MC control: hidden (will show after animation)`);
        }
    },

    async triggerNext() {
        const btn = document.getElementById('t_next_btn');
        if (!btn || btn.disabled) return;
        
        POG_Log.i(`triggerNext START: current="${btn.innerText}"`);
        btn.disabled = true;
        btn.innerText = "更新中...";

        try {
            await POG_UI.executeMCAction();
        } catch (e) {
            POG_Log.e("MC Action Error in Theater", e);
            alert("更新に失敗しました。");
            btn.disabled = false;
        }
    },

    close() {
        POG_Log.i("Theater CLOSE: Hiding layer.");
        this.currentPlayId = null;
        
        const layer = document.getElementById('theater_layer');
        const hadClass = document.body.classList.contains('is-theater-active');
        
        document.body.classList.remove('is-theater-active');
        if (layer) layer.style.display = 'none';
        
        POG_Log.d(`THEATER_CLOSE_COMPLETE: hadClass=${hadClass}, layerNowHidden=${layer?.style.display === 'none'}, bodyHasClass=${document.body.classList.contains('is-theater-active')}`);
    }
};