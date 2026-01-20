const POG_Theater = {
    is_playing: false,

    async playReveal(data) {
        if (this.is_playing) return;
        this.is_playing = true;
        
        // [EVIDENCE] 受け取った生データをログ出力して構造を確認
        console.log("[THEATER_DEBUG] Received data:", data);

        const layer = document.getElementById('theater_layer');
        
        // データの安全なマッピング（ネストされた horses オブジェクトも考慮）
        const h = data.horses || {};
        const round = data.round || window.AppState.latestData?.round || '?';

        document.getElementById('t_title').innerText = `第 ${round} 巡 選択希望選手`;
        document.getElementById('t_player').innerText = data.player_name || '---';
        document.getElementById('t_father').innerText = data.father_name || h.father_name || '---';
        document.getElementById('t_mother').innerText = data.mother_name || h.mother_name || '---';
        document.getElementById('t_stable').innerText = `${data.stable_name || h.stable_name || '未定'} / ${data.breeder_name || h.breeder_name || '---'}`;
        document.getElementById('t_horse').innerText = data.horse_name || '---';

        // 初期化：すべてのエリアを透明にする
        ['t_father_area', 't_mother_area', 't_stable_area', 't_horse_area'].forEach(id => {
            document.getElementById(id).classList.remove('is-visible');
        });

        layer.style.display = 'flex';

        const wait = (ms) => new Promise(res => setTimeout(res, ms));

        await wait(2000);
        document.getElementById('t_father_area').classList.add('is-visible');
        await wait(1800);
        document.getElementById('t_mother_area').classList.add('is-visible');
        await wait(1500);
        document.getElementById('t_stable_area').classList.add('is-visible');
        await wait(2000);
        document.getElementById('t_horse_area').classList.add('is-visible');

        await wait(4000);
        this.close();
    },

    close() {
        document.getElementById('theater_layer').style.display = 'none';
        this.is_playing = false;
    }
};