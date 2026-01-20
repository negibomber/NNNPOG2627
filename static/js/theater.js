/* ==========================================================================
   POG Theater Module (Ver.0.1.0) - ドラフト会議風演出
   ========================================================================== */
const POG_Theater = {
    is_playing: false,

    async playReveal(data) {
        if (this.is_playing) return;
        this.is_playing = true;

        const layer = document.getElementById('theater_layer');
        // 初期化（ドラフト風レイアウトの構築）
        layer.innerHTML = `
            <div class="theater-card theater-animate-in">
                <div class="draft-title">第 ${data.round || '?'} 巡 選択希望選手</div>
                <div class="draft-label">指名者</div>
                <div class="draft-value">${data.player_name}</div>
                <div id="t_father_area" style="opacity:0">
                    <div class="draft-label">父</div>
                    <div class="draft-value">${data.horses?.father_name || '---'}</div>
                </div>
                <div id="t_mother_area" style="opacity:0">
                    <div class="draft-label">母</div>
                    <div class="draft-value">${data.horses?.mother_name || data.mother_name}</div>
                </div>
                <div id="t_stable_area" style="opacity:0">
                    <div class="draft-label">厩舎 / 生産者</div>
                    <div class="draft-value draft-stable">${data.horses?.stable_name || '未定'} / ${data.horses?.breeder_name || '---'}</div>
                </div>
                <div id="t_horse_area" style="opacity:0">
                    <div class="draft-label">馬名</div>
                    <div class="draft-value" style="color:#d4af37">${data.horse_name}</div>
                </div>
            </div>
        `;
        layer.style.display = 'flex';

        // 演出の階段（ドラフト会議風のタメ）
        const wait = (ms) => new Promise(res => setTimeout(res, ms));

        await wait(1500); // 指名者表示後のタメ
        document.getElementById('t_father_area').style.opacity = 1;
        await wait(1200); // 父名表示後のタメ
        document.getElementById('t_mother_area').style.opacity = 1;
        await wait(1000); // 母名表示後のタメ
        document.getElementById('t_stable_area').style.opacity = 1;
        await wait(1500); // 厩舎表示後のタメ
        document.getElementById('t_horse_area').style.opacity = 1;

        await wait(3000); // 最終表示の余韻
        this.close();
    },

    close() {
        const layer = document.getElementById('theater_layer');
        layer.style.display = 'none';
        layer.innerHTML = '';
        this.is_playing = false;
    }
};