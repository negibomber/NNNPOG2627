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
        btn.innerText = "次の指名を公開 ≫";

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

        // 4. MC判定と後処理
        await wait(2000); 
        
        // 【修正点1】HTML上のMCパネルの有無で判定（確実な証拠）
        const isMC = !!document.getElementById('mc_panel');

        if (isMC) {
            document.getElementById('t_mc_ctrl').classList.add('is-visible');
        } else {
            await wait(5000);
            this.close();
        }
    },

    async triggerNext() {
        const btn = document.getElementById('t_next_btn');
        btn.disabled = true;
        btn.innerText = "更新中...";

        // 【修正点2】app.js のガードを通すため、演出フラグを下ろす
        // 画面は閉じずに（黒背景のまま）、次の playReveal を待つ
        this.is_playing = false;

        try {
            // ui.js の関数を呼び出し、サーバーの状態を進める
            await POG_UI.handleMCAction('next_reveal');
            
            // 成功すれば、app.js が新しいIndexを検知し、
            // 自動的に playReveal() が再度呼ばれる -> 画面の内容が書き換わる
            
        } catch (e) {
            console.error("MC Action Error:", e);
            alert("更新に失敗しました。");
            // エラー時は復帰させる
            this.is_playing = true; 
            btn.disabled = false;
            btn.innerText = "次の指名を公開 ≫";
        }
    },

    close() {
        document.getElementById('theater_layer').style.display = 'none';
        this.is_playing = false;
    }
};