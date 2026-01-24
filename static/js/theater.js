/* theater.js (Ver.0.4.4-DEBUG) - 証拠収集用 */
const POG_Theater = {
    async playReveal(data) {
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
        // 修正：冒頭での状態記録
        POG_Log.d(`DEBUG_EVIDENCE: Theater START: [${getVisibleStatus()}]`);

        // 1. 【核心】レイヤーを表示する前に「先行リセット」を実行し、物理的な隙を消す
        POG_Log.d("DEBUG_EVIDENCE: Resetting 'is-visible' classes before layer display...");
        ['t_player_area', 't_father_area', 't_mother_area', 't_horse_area', 't_stable_area', 't_mc_ctrl'].forEach(id => {
            document.getElementById(id)?.classList.remove('is-visible');
        });
        
        // リセット直後の状態記録（この時点で mc_ctrl:false であることが絶対条件）
        POG_Log.d(`DEBUG_EVIDENCE: AFTER_RESET:  [${getVisibleStatus()}]`);

        const layer = document.getElementById('theater_layer');
        POG_Log.d(`DEBUG_EVIDENCE: layer_display=[${layer.style.display}] -> Setting to flex`);
        
        // 2. 真っ白（ボタンなし）が保証された状態でレイヤーを表示
        layer.style.display = 'flex';

        const master = data.horses || {};
        
        // 3. データ流し込み（裏側で実行）
        document.getElementById('t_title').innerText = `第 ${data.round || '?'} 巡 選択希望競走馬`;
        document.getElementById('t_player').innerText = data.player || '---';
        document.getElementById('t_father').innerText = data.father || master.father_name || '---';
        document.getElementById('t_mother').innerText = data.mother || master.mother_name || '---';
        document.getElementById('t_horse').innerText = data.horse || '---';
        document.getElementById('t_stable').innerText = `${data.stable || master.stable_name || '未定'} / ${data.breeder || master.breeder_name || '---'}`;

        // 4. ボタンの準備（文字の更新のみ。is-visible はまだ付けない）
        POG_Log.d(`DEBUG_EVIDENCE: BEFORE MAKE BTN : [${getVisibleStatus()}]`);
        const btn = document.getElementById('t_next_btn');
        POG_Log.d(`DEBUG_EVIDENCE: AFTER MAKE BTN : [${getVisibleStatus()}]`);
        const latestMC = window.AppState.latestData?.mc_action;
        if (btn && latestMC) {
            POG_Log.d(`DEBUG_EVIDENCE: Setting Theater Button Text. Label=[${latestMC.label}]`);
            POG_Log.d(`DEBUG_EVIDENCE: BEFORE MAKE BTN : [${getVisibleStatus()}]`);
            btn.innerText = latestMC.label;
            POG_Log.d(`DEBUG_EVIDENCE: AFTER innerText : [${getVisibleStatus()}]`);
            btn.disabled = latestMC.disabled || false;
            POG_Log.d(`DEBUG_EVIDENCE: AFTER disabled : [${getVisibleStatus()}]`);
        }
        const wait = (ms) => new Promise(res => setTimeout(res, ms));
        POG_Log.d(`DEBUG_EVIDENCE: AFTER wait : [${getVisibleStatus()}]`);

        // 5. 演出シーケンス
        POG_Log.d("Theater Sequence: START");
        POG_Log.d(`DEBUG_EVIDENCE: Theater Sequence: START : [${getVisibleStatus()}]`);
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

        // 6. MCパネル表示
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