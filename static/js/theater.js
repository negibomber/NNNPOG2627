/* theater.js (Ver.0.4.4) - MC判定とループ制御の適正化 */
const POG_Theater = {
    // 自身の状態を廃止し、AppStateに依存
    async playReveal(data) {
        
        POG_Log.i(`Theater START: Round=${data.round}, Player=${data.player}`);

        const layer = document.getElementById('theater_layer');
        const rd = data;
        const master = data.horses || {};

        // 1. データ流し込み
        document.getElementById('t_title').innerText = `第 ${rd.round || '?'} 巡 選択希望競走馬`;
        document.getElementById('t_player').innerText = rd.player || '---';
        document.getElementById('t_father').innerText = rd.father || master.father_name || '---';
        document.getElementById('t_mother').innerText = rd.mother || master.mother_name || '---';
        document.getElementById('t_horse').innerText = rd.horse || '---';
        document.getElementById('t_stable').innerText = `${rd.stable || master.stable_name || '未定'} / ${rd.breeder || master.breeder_name || '---'}`;

        // 2. 初期化：すべてのエリアを非表示（アニメーションリセットのためクラスを剥がす）
        ['t_player_area', 't_father_area', 't_mother_area', 't_horse_area', 't_stable_area', 't_mc_ctrl'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('is-visible');
        });
        // 証拠：前回の演出のボタンが一瞬見えるのを防ぐため、明示的に非表示を確実にする
        document.getElementById('t_mc_ctrl').classList.remove('is-visible');
        
        // ボタンの状態もリセット
        const btn = document.getElementById('t_next_btn');
        btn.disabled = false;
        // 証拠：グローバルな最新データからMCアクションのラベルを特定する
        const mcLabel = window.AppState.latestData?.mc_action?.label;
        if (mcLabel) {
            btn.innerText = mcLabel;
        }

        // 画面を表示（既に開いている場合はそのまま）
        layer.style.display = 'flex';
        
        const wait = (ms) => new Promise(res => setTimeout(res, ms));

        // 3. 演出シーケンス（順番に表示）
        POG_Log.d("Theater Sequence: START");
        await wait(800);
        document.getElementById('t_player_area').classList.add('is-visible');
        await wait(2000); 
        POG_Log.d("Theater Sequence: Lineage revealed");
        document.getElementById('t_father_area').classList.add('is-visible');
        await wait(2000);
        document.getElementById('t_mother_area').classList.add('is-visible');
        await wait(1500);
        POG_Log.d("Theater Sequence: Horse name revealed");
        document.getElementById('t_horse_area').classList.add('is-visible');
        await wait(1500);
        document.getElementById('t_stable_area').classList.add('is-visible');
        POG_Log.d("Theater Sequence: FINISHED");

        // --- MC判定と後処理 ---
        await wait(2000); // 馬名表示後の余韻
        
        // 証拠：HTML上にMCパネルが存在するかで判定（より確実な証拠）
        const isMC = !!document.getElementById('mc_panel');

        if (isMC) {
            document.getElementById('t_mc_ctrl').classList.add('is-visible');
        }
    },

    // MCがボタンを押した時の処理
    async triggerNext() {
        const btn = document.getElementById('t_next_btn');
        if (!btn) return;
        POG_Log.d(`triggerNext START: current="${btn.innerText}"`);
        btn.disabled = true;
        btn.innerText = "更新中...";

        try {
            // 証拠：通信開始前に、先行してボタンエリアを物理的に隠す
            document.getElementById('t_mc_ctrl').classList.remove('is-visible');
            
            // ui.js に新設した共通アクションを呼び出し
            await POG_UI.executeMCAction();
            
            POG_Log.d("triggerNext MCAction COMPLETED.");
        } catch (e) {
            POG_Log.e("MC Action Error in Theater", e);
            alert("更新に失敗しました。");
        } finally {
            document.getElementById('t_mc_ctrl').classList.remove('is-visible');
        }
    },

    close() {
        POG_Log.i("Theater CLOSE: Hiding layer and resetting state.");
        document.getElementById('theater_layer').style.display = 'none';
        // 証拠：AppStateのuiMode変更はapp.js側の統治に任せるため、ここでは記録のみ行う
        // もしここで強制的にIDLEに戻すと、app.jsの更新サイクルと衝突してチラつきの原因になる
    }
};