/* theater.js (Ver.0.7.0) - 右寄せ・ガタつき防止完全維持 + 抽選機能追加版 */
const POG_Theater = {
    async playReveal(data) {
        // 証拠：現在の演出IDを生成し、同一ステータスでの重複再生（ループ）を防止する
        const isLottery = (data.mode === 'lottery' || data.is_lottery === true);
        const playId = `${data.round}_${data.player}_${data.mode}_${data.turn_index || 0}`;
        if (this.currentPlayId === playId) return; 
        this.currentPlayId = playId;

        // 証拠：ステータスに合わせて表示するコンテナを切り替え、不要な方の残像を防ぐ
        if (document.getElementById('theater_lottery')) document.getElementById('theater_lottery').style.display = isLottery ? 'flex' : 'none';
        if (document.getElementById('theater_card')) document.getElementById('theater_card').style.display = isLottery ? 'none' : 'flex';

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

        // 1. 【核心】先行リセット：場所を確保しつつ透明化（ガタつき防止）
        POG_Log.d("DEBUG_EVIDENCE: Resetting Theater UI components with layout preservation...");
        ['t_player_area', 't_father_area', 't_mother_area', 't_horse_area', 't_stable_area', 't_mc_ctrl'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.remove('is-visible');
            
            // ボタンエリア特有の制御：右寄せを維持したまま、物理的な場所（flex）は消さずに隠す
            if (id === 't_mc_ctrl') {
                el.style.setProperty('display', 'flex', 'important');
                el.style.setProperty('align-items', 'flex-end', 'important'); // 右寄せ
                el.style.setProperty('opacity', '0', 'important');           // 透明化
                el.style.setProperty('visibility', 'hidden', 'important');    // 隠蔽
                el.style.setProperty('pointer-events', 'none', 'important');  // 誤クリック防止
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

        // 6. MCパネル表示：場所を動かさず、透明度だけを戻す
        await wait(2000); 
        const finalMC = window.AppState.latestData?.mc_action;
        if (finalMC) {
            const tBtn = document.getElementById('t_next_btn');
            if (tBtn) {
                tBtn.innerText = finalMC.label;
                tBtn.disabled = finalMC.disabled || false;
            }
            const ctrl = document.getElementById('t_mc_ctrl');
            if (ctrl) {
                // 透明封印を解き、右寄せのまま表示
                ctrl.style.setProperty('opacity', '1', 'important');
                ctrl.style.setProperty('visibility', 'visible', 'important');
                ctrl.style.setProperty('pointer-events', 'auto', 'important');
                ctrl.classList.add('is-visible');
            }
        }
        // --- [Ver.0.6.16 コピーここまで] ---
    },

    // --- [ここから抽選用に追加したメソッド] ---

    async playLotterySelect(data) {
        this.resetTheaterUI('lottery');
        const hName = data.horse_name;
        const participants = data.participants || [];
        const selections = data.selections || {};
        const turnIdx = data.turn_index || 0;
        const currentPlayer = participants[turnIdx];
        const me = decodeURIComponent((document.cookie.match(/(?:^|;\s*)pog_user=([^;]*)/) || [])[1] || '').replace(/\+/g, ' ');

        const horseDisplay = document.getElementById('tl_horse');
        if (horseDisplay) horseDisplay.innerText = hName;
        
        const msgEl = document.getElementById('tl_message');
        if (msgEl) {
            if (currentPlayer === me) {
                msgEl.innerText = "あなたの番です。封筒を選んでください。";
                msgEl.style.color = "#fbbf24";
            } else {
                msgEl.innerText = `${currentPlayer} さんが選択中...`;
                msgEl.style.color = "#fff";
            }
        }

        const area = document.getElementById('tl_envelopes_area');
        if (area) {
            area.innerHTML = ''; 
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
                } else if (currentPlayer === me) {
                    env.classList.add('is-selectable');
                    env.onclick = () => this.selectEnvelope(i);
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
        }
    },

    async playLotteryResult(data) {
        this.resetTheaterUI('lottery');
        const hName = data.horse_name;
        const selections = data.selections || {};
        const winIdx = data.winning_index;
        
        const horseDisplay = document.getElementById('tl_horse');
        if (horseDisplay) horseDisplay.innerText = hName;
        const msgEl = document.getElementById('tl_message');
        if (msgEl) msgEl.innerText = "一斉開封！";

        const area = document.getElementById('tl_envelopes_area');
        if (area) {
            area.innerHTML = '';
            Object.keys(selections).forEach(idx => {
                const env = document.createElement('div');
                env.className = 'envelope';
                const label = document.createElement('div');
                label.className = 'envelope-name';
                label.innerText = selections[idx];
                env.appendChild(label);
                area.appendChild(env);
                
                setTimeout(() => {
                    if (parseInt(idx) === winIdx) env.classList.add('is-winner');
                    else env.classList.add('is-loser');
                    if (msgEl) msgEl.innerText = "抽選結果確定";
                    // 証拠：演出終了をMCに通知し、次のアクション（再指名等）を促す
                    if (window.IS_MC) {
                        const finalMC = window.AppState.latestData?.mc_action;
                        const ctrl = document.getElementById('t_mc_ctrl');
                        const tBtn = document.getElementById('t_next_btn');
                        if (finalMC && ctrl && tBtn) {
                            tBtn.innerText = finalMC.label;
                            tBtn.disabled = finalMC.disabled || false;
                            ctrl.style.setProperty('opacity', '1', 'important');
                            ctrl.style.setProperty('visibility', 'visible', 'important');
                            ctrl.style.setProperty('pointer-events', 'auto', 'important');
                        }
                    }
                }, 1000);
            });
        }
    },

    async selectEnvelope(idx) {
        if (!confirm("この封筒にしますか？")) return;
        try {
            const formData = new URLSearchParams();
            formData.append('envelope_index', idx);
            const res = await fetch('/select_envelope', { method: 'POST', body: formData });
            const json = await res.json();
            if (json.status === 'error') alert(json.message);
        } catch(e) {
            alert("通信エラーが発生しました");
        }
    },

    resetTheaterUI(mode) {
        const layer = document.getElementById('theater_layer');
        if (!layer) return;
        layer.style.display = 'flex';
        
        const cardDiv = document.getElementById('theater_card');
        const lotDiv = document.getElementById('theater_lottery');
        if (cardDiv) cardDiv.style.display = (mode === 'reveal' ? 'flex' : 'none');
        if (lotDiv) lotDiv.style.display = (mode === 'lottery' ? 'flex' : 'none');
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
        // 証拠：再生中IDをクリアし、次回の異なる演出を正しく受け入れ可能にする
        this.currentPlayId = null;
        // 証拠：シーンを解除。これによりCSSの制約が解け、メインボタンが自動で復活する。
        document.body.classList.remove('is-theater-active');
        document.getElementById('theater_layer').style.display = 'none';
    }
};