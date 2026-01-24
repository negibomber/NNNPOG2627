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

        // 2. 初期化：クラスをリセット（前回の状態を引きずらないため）
        ['t_player_area', 't_father_area', 't_mother_area', 't_horse_area', 't_stable_area', 't_mc_ctrl'].forEach(id => {
            document.getElementById(id)?.classList.remove('is-visible');
        });
        
        // 3. ボタンの初期化
        const btn = document.getElementById('t_next_btn');
        // 引数の data ではなく、必ず AppState の最新データからボタン状態を作る（Single Source of Truth）
        const latestMC = window.AppState.latestData?.mc_action;
        if (btn && latestMC) {
            btn.innerText = latestMC.label;
            btn.disabled = latestMC.disabled || false;
        }

        layer.style.display = 'flex';
        
        const wait = (ms) => new Promise(res => setTimeout(res, ms));

        // 4. 演出シーケンス
        POG_Log.d("Theater Sequence: START");
        await wait(1000);
        document.getElementById('t_player_area').classList.add('is-visible');
        await wait(2000); 
        document.getElementById('t_father_area').classList.add('is-visible');
        await wait(2500);
        document.getElementById('t_mother_area').classList.add('is-visible');
        await wait(1000);
        document.getElementById('t_horse_area').classList.add('is-visible');
        await wait(1000);
        document.getElementById('t_stable_area').classList.add('is-visible');
        POG_Log.d("Theater Sequence: FINISHED");

        // 5. MCパネル表示
        await wait(2000); 
        if (window.AppState.latestData?.mc_action) {
            document.getElementById('t_mc_ctrl').classList.add('is-visible');
        }
    },

    // MCがボタンを押した時の処理
    async triggerNext() {
        const btn = document.getElementById('t_next_btn');
        if (!btn || btn.disabled) return;
        
        POG_Log.d(`triggerNext START: current="${btn.innerText}"`);
        
        // UIロックのみ行う。画面を隠す（is-visible削除）のはやめる。
        btn.disabled = true;
        btn.innerText = "更新中...";

        try {
            // ui.js の共通アクションを呼ぶ。
            // これが updateStatus を呼び、次の演出があれば playReveal が再実行され、そこで初めて画面がリセットされる。
            await POG_UI.executeMCAction();
            
            POG_Log.d("triggerNext MCAction COMPLETED.");
        } catch (e) {
            POG_Log.e("MC Action Error in Theater", e);
            alert("更新に失敗しました。");
            btn.disabled = false; // エラー時のみ復帰
        }
        // finally で何かを隠したり戻したりしない。AppStateに従う。
    },

    close() {
        POG_Log.i("Theater CLOSE: Hiding layer and resetting state.");
        document.getElementById('theater_layer').style.display = 'none';
        // 証拠：AppStateのuiMode変更はapp.js側の統治に任せるため、ここでは記録のみ行う
        // もしここで強制的にIDLEに戻すと、app.jsの更新サイクルと衝突してチラつきの原因になる
    }
};