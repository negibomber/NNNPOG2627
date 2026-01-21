/* theater.js (Ver.0.4.4) - MC判定とループ制御の適正化 */
const POG_Theater = {
    is_playing: false,

    async playReveal(data) {
        // app.jsからの二重呼び出し防止
        if (this.is_playing) return;
        this.is_playing = true;
        
        console.log("[THEATER_DEBUG] Received data:", data);

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
        if (data.mc_action && data.mc_action.label) {
            btn.innerText = data.mc_action.label;
        }

        // 画面を表示（既に開いている場合はそのまま）
        layer.style.display = 'flex';
        
        const wait = (ms) => new Promise(res => setTimeout(res, ms));

        // 3. 演出シーケンス（順番に表示）
        await wait(800);
        document.getElementById('t_player_area').classList.add('is-visible');
        await wait(2000); 
        document.getElementById('t_father_area').classList.add('is-visible');
        await wait(2000);
        document.getElementById('t_mother_area').classList.add('is-visible');
        await wait(1500);
        document.getElementById('t_horse_area').classList.add('is-visible');
        await wait(1500);
        document.getElementById('t_stable_area').classList.add('is-visible');

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
        btn.disabled = true;
        btn.innerText = "更新中...";

        try {
            // 証拠：通信開始前に、先行してボタンエリアを物理的に隠す
            document.getElementById('t_mc_ctrl').classList.remove('is-visible');
            
            // ui.js に新設した共通アクションを呼び出し（内部でupdateStatusをawaitしている）
            await POG_UI.executeMCAction();
            
            if (DEBUG_MODE) console.log("[EVIDENCE] theater: triggerNext MCAction COMPLETED.");
        } catch (e) {
            console.error("MC Action Error:", e);
            alert("更新に失敗しました。");
            this.is_playing = true; // 失敗時はガードを戻す
        } finally {
            // 成功時はガードを維持する（これにより「更新中...」が描画される隙をなくす）
            document.getElementById('t_mc_ctrl').classList.remove('is-visible');
            
            if (DEBUG_MODE) console.log("[EVIDENCE] theater: triggerNext FINISHED. (Guard maintained)");
            
            btn.disabled = false;
            if (window.AppState.latestData?.mc_action?.label) {
                btn.innerText = window.AppState.latestData.mc_action.label;
            }
        }
    },

    close() {
        document.getElementById('theater_layer').style.display = 'none';
        this.is_playing = false;
    }
};