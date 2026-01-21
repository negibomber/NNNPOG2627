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
        document.getElementById('t_stable').innerText = `${rd.stable || master.stable_name || '未定'} / ${rd.breeder || master.breeder_name || '---'}`;
        document.getElementById('t_horse').innerText = rd.horse || '---';

        // 2. 初期化：すべてのエリアを非表示（アニメーションリセットのためクラスを剥がす）
        ['t_father_area', 't_mother_area', 't_stable_area', 't_horse_area', 't_mc_ctrl'].forEach(id => {
            document.getElementById(id).classList.remove('is-visible');
        });
        
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
        await wait(500); // 少し待ってから開始
        document.getElementById('t_father_area').classList.add('is-visible');
        await wait(1800);
        document.getElementById('t_mother_area').classList.add('is-visible');
        await wait(1500);
        document.getElementById('t_stable_area').classList.add('is-visible');
        await wait(2000);
        document.getElementById('t_horse_area').classList.add('is-visible');

        // --- MC判定と後処理 ---
        await wait(2000); // 馬名表示後の余韻
        
        // 証拠：HTML上にMCパネルが存在するかで判定（より確実な証拠）
        const isMC = !!document.getElementById('mc_panel');

        if (isMC) {
            document.getElementById('t_mc_ctrl').classList.add('is-visible');
        } else {
            await wait(5000);
            this.close();
        }
    },

    // MCがボタンを押した時の処理
    async triggerNext() {
        const btn = document.getElementById('t_next_btn');
        btn.disabled = true;
        btn.innerText = "更新中...";

        // 重要：app.js の演出ガードを解除し、次のデータを受け入れ可能にする
        this.is_playing = false;

        try {
            // ui.js に新設した共通アクションを呼び出し
            await POG_UI.executeMCAction();
            
            // 成功時はボタンエリアを隠す（次の演出に備える）
            document.getElementById('t_mc_ctrl').classList.remove('is-visible');
        } catch (e) {
            console.error("MC Action Error:", e);
            alert("更新に失敗しました。");
            this.is_playing = true; // 失敗時はガードを戻す
        } finally {
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