/* theater.js 全面書き換え（機能追加のため） */
const POG_Theater = {
    is_playing: false,

    async playReveal(data) {
        if (this.is_playing) return;
        this.is_playing = true;
        
        console.log("[THEATER_DEBUG] Received data:", data);

        const layer = document.getElementById('theater_layer');
        const rd = data;
        const master = data.horses || {};

        // データ流し込み
        document.getElementById('t_title').innerText = `第 ${rd.round || '?'} 巡 選択希望競走馬`;
        document.getElementById('t_player').innerText = rd.player || '---';
        document.getElementById('t_father').innerText = rd.father || master.father_name || '---';
        document.getElementById('t_mother').innerText = rd.mother || master.mother_name || '---';
        document.getElementById('t_stable').innerText = `${rd.stable || master.stable_name || '未定'} / ${rd.breeder || master.breeder_name || '---'}`;
        document.getElementById('t_horse').innerText = rd.horse || '---';

        // 初期化：すべてのエリア（MCボタン含む）を非表示
        ['t_father_area', 't_mother_area', 't_stable_area', 't_horse_area', 't_mc_ctrl'].forEach(id => {
            document.getElementById(id).classList.remove('is-visible');
        });

        layer.style.display = 'flex';
        const wait = (ms) => new Promise(res => setTimeout(res, ms));

        // 演出シーケンス
        await wait(2000);
        document.getElementById('t_father_area').classList.add('is-visible');
        await wait(1800);
        document.getElementById('t_mother_area').classList.add('is-visible');
        await wait(1500);
        document.getElementById('t_stable_area').classList.add('is-visible');
        await wait(2000);
        document.getElementById('t_horse_area').classList.add('is-visible');

        // --- MC判定と後処理 ---
        await wait(2000); // 馬名表示後の余韻
        
        // 証拠：AppStateから現在のMC権限を確認
        const isMC = window.AppState?.latestData?.is_mc;

        if (isMC) {
            // MCなら「次へ」ボタンを表示して待機（自動で閉じない）
            document.getElementById('t_mc_ctrl').classList.add('is-visible');
        } else {
            // 一般ユーザーは数秒後に自動で閉じる
            await wait(5000);
            this.close();
        }
    },

    // MCがボタンを押した時の処理
    async triggerNext() {
        const btn = document.getElementById('t_next_btn');
        btn.disabled = true;
        btn.innerText = "更新中...";

        try {
            // 既存の MCアクション関数を呼び出す（ui.js側に定義されている想定）
            // fetchStatusの結果、フェーズが進めば app.js が検知して自動で次の演出が始まる
            await POG_UI.handleMCAction('next_reveal');
            
            // 次の演出の邪魔にならないよう、自身のボタンを隠す
            document.getElementById('t_mc_ctrl').classList.remove('is-visible');
        } catch (e) {
            console.error("MC Action Error:", e);
            alert("更新に失敗しました。");
        } finally {
            btn.disabled = false;
            btn.innerText = "次の指名を公開 ≫";
        }
    },

    close() {
        document.getElementById('theater_layer').style.display = 'none';
        this.is_playing = false;
    }
};