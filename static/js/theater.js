/* theater.js (Ver.0.4.4-DEBUG) - 証拠収集用 */
const POG_Theater = {
    async playReveal(data) {
        POG_Log.i(`Theater PLAY_START: Round=${data.round}, Index=${window.AppState.lastPlayedIdx}`);

        const layer = document.getElementById('theater_layer');
        // 証拠：実行時のレイヤー表示状態
        POG_Log.d(`DEBUG_EVIDENCE: layer_display=[${layer.style.display}]`);

        const master = data.horses || {};
        
        // 1. データ流し込み
        document.getElementById('t_title').innerText = `第 ${data.round || '?'} 巡 選択希望競走馬`;
        document.getElementById('t_player').innerText = data.player || '---';
        document.getElementById('t_father').innerText = data.father || master.father_name || '---';
        document.getElementById('t_mother').innerText = data.mother || master.mother_name || '---';
        document.getElementById('t_horse').innerText = data.horse || '---';
        document.getElementById('t_stable').innerText = `${data.stable || master.stable_name || '未定'} / ${data.breeder || master.breeder_name || '---'}`;

        // 2. 初期化（ここが消える犯人かどうかの証拠を取る）
        POG_Log.d("DEBUG_EVIDENCE: Resetting 'is-visible' classes...");
        ['t_player_area', 't_father_area', 't_mother_area', 't_horse_area', 't_stable_area', 't_mc_ctrl'].forEach(id => {
            document.getElementById(id)?.classList.remove('is-visible');
        });
        
        // 3. ボタンの初期化
        const btn = document.getElementById('t_next_btn');
        const latestMC = window.AppState.latestData?.mc_action;
        if (btn && latestMC) {
            POG_Log.d(`DEBUG_EVIDENCE: Setting Theater Button. Label=[${latestMC.label}]`);
            btn.innerText = latestMC.label;
            btn.disabled = latestMC.disabled || false;
        }

        layer.style.display = 'flex';
        const wait = (ms) => new Promise(res => setTimeout(res, ms));

        // 4. 演出シーケンス
        POG_Log.d("Theater Sequence: START");
        await wait(1000);
        document.getElementById('t_player_area').classList.add('is-visible');
        POG_Log.d("DEBUG_EVIDENCE: player_area VISIBLE");
        await wait(2000); 
        document.getElementById('t_father_area').classList.add('is-visible');
        POG_Log.d("DEBUG_EVIDENCE: father_area VISIBLE");
        await wait(2500);
        document.getElementById('t_mother_area').classList.add('is-visible');
        POG_Log.d("DEBUG_EVIDENCE: mother_area VISIBLE");
        await wait(1000);
        document.getElementById('t_horse_area').classList.add('is-visible');
        POG_Log.d("DEBUG_EVIDENCE: horse_area VISIBLE");
        await wait(1000);
        document.getElementById('t_stable_area').classList.add('is-visible');
        POG_Log.d("DEBUG_EVIDENCE: stable_area VISIBLE");
        POG_Log.d("Theater Sequence: FINISHED");

        // 5. MCパネル表示
        await wait(2000); 
        if (window.AppState.latestData?.mc_action) {
            POG_Log.d("DEBUG_EVIDENCE: Showing MC control panel");
            document.getElementById('t_mc_ctrl').classList.add('is-visible');
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
            POG_Log.d("triggerNext MCAction COMPLETED.");
        } catch (e) {
            POG_Log.e("MC Action Error in Theater", e);
            alert("更新に失敗しました。");
            btn.disabled = false;
        }
    },

    close() {
        POG_Log.i("Theater CLOSE: Hiding layer.");
        document.getElementById('theater_layer').style.display = 'none';
    }
};