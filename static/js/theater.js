/* ==========================================================================
   POG Theater Module (Ver.0.1.1) - クリーンなDOM操作版
   ========================================================================== */
const POG_Theater = {
    is_playing: false,

    async playReveal(data) {
        if (this.is_playing) return;
        this.is_playing = true;

        // 1. 各要素への参照を取得
        const layer = document.getElementById('theater_layer');
        const areas = ['t_father_area', 't_mother_area', 't_stable_area', 't_horse_area'];
        
        // 2. データの流し込み（innerHTMLを使わずinnerTextで安全に）
        document.getElementById('t_title').innerText = `第 ${data.round || '?'} 巡 選択希望競走馬`;
        document.getElementById('t_player').innerText = data.player_name || '---';
        document.getElementById('t_father').innerText = data.father_name || (data.horses && data.horses.father_name) || '---';
        document.getElementById('t_mother').innerText = data.mother_name || (data.horses && data.horses.mother_name) || '---';
        document.getElementById('t_stable').innerText = `${data.stable_name || (data.horses && data.horses.stable_name) || '未定'} / ${data.breeder_name || (data.horses && data.horses.breeder_name) || '---'}`;
        document.getElementById('t_horse').innerText = data.horse_name || '---';

        // 3. 全エリアを隠し、レイヤーを表示
        areas.forEach(id => {
            const el = document.getElementById(id);
            el.classList.add('is-hidden');
            el.classList.remove('is-visible');
        });
        layer.style.display = 'flex';

        // 4. 演出の階段（適切なタメ）
        const wait = (ms) => new Promise(res => setTimeout(res, ms));

        await wait(2000); // タイトル表示
        this.showArea('t_father_area');
        await wait(1800);
        this.showArea('t_mother_area');
        await wait(1500);
        this.showArea('t_stable_area');
        await wait(2000);
        this.showArea('t_horse_area');

        await wait(4000); // 余韻を長めに
        this.close();
    },

    showArea(id) {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('is-hidden');
            el.classList.add('is-visible');
        }
    },

    close() {
        document.getElementById('theater_layer').style.display = 'none';
        this.is_playing = false;
    }
};