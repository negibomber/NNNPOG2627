/* theater.js (Ver.0.6.16) - 右寄せ・ガタつき防止反映版 */
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
        POG_Log.d(`DEBUG_EVIDENCE: Theater START: [${getVisibleStatus()}]`);

        // 1. 【核心】先行リセット：場所を確保しつつ透明化（ガタつき防止）
        POG_Log.d("DEBUG_EVIDENCE: Resetting Theater UI components with layout preservation...");
        ['t_player_area', 't_father_area', 't_mother_area', 't_horse_area', 't_stable_area', 't_mc_ctrl'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.remove('is-visible');
            
            // ボタンエリア特有の制御：右寄せを維持したまま、物理的な場所（flex）は消さずに隠す
            if (id === 't_mc_ctrl') {
                el.style.setProperty('display', 'flex', 'important');
                el.style.setProperty('align-items', 'flex-end', 'important'); // 右寄せ
                el.style.setProperty('opacity', '0', 'important');           // 透明化
                el.style.setProperty('visibility', 'hidden', 'important');    // 隠蔽
                el.style.setProperty('pointer-events', 'none', 'important');  // 誤クリック防止
            }
        });
        
        POG_Log.d(`DEBUG_EVIDENCE: AFTER_RESET:  [${getVisibleStatus()}]`);

        const layer = document.getElementById('theater_layer');
        layer.style.display = 'flex';

        const master = data.horses || {};
        
        // 3. データ流し込み
        document.getElementById('t_title').innerText = `第 ${data.round || '?'} 巡 選択希望競走馬`;
        document.getElementById('t_player').innerText = data.player || '---';
        document.getElementById('t_father').innerText = data.father || master.father_name || '---';
        document.getElementById('t_mother').innerText = data.mother || master.mother_name || '---';
        // 馬名と性別の反映
        const horseEl = document.getElementById('t_horse');
        const sexEl = document.getElementById('t_sex');
        
        // データの汚染源対策：確実に性別データを取得する
        const sex = data.sex || (data.horse_info && data.horse_info.sex) || '';
        
        horseEl.innerText = data.horse_name || data.horse || '---';

        if (sexEl) {
            // 性別データの正規化と表示反映
            if (sex === '牡' || sex === '牝') {
                sexEl.innerText = sex; // 記号を廃止し、データ通りの「牡」「牝」を表示
                sexEl.className = sex === '牡' ? 'sex-m' : 'sex-f'; // CSSクラスに委譲
                sexEl.style.display = 'inline-block';
            } else {
                sexEl.innerText = '';
                sexEl.className = '';
                sexEl.style.display = 'none';
            }
            sexEl.style.removeProperty('color');
        }
        document.getElementById('t_stable').innerText = `${data.stable || master.stable_name || '未定'} / ${data.breeder || master.breeder_name || '---'}`;

        const wait = (ms) => new Promise(res => setTimeout(res, ms));

        // 5. 演出シーケンス
        POG_Log.d("Theater Sequence: START");
        await wait(500);
        document.getElementById('t_player_area').classList.add('is-visible');
        await wait(2000); 
        document.getElementById('t_father_area').classList.add('is-visible');
        await wait(2000);
        document.getElementById('t_mother_area').classList.add('is-visible');
        await wait(500);
        document.getElementById('t_horse_area').classList.add('is-visible');
        document.getElementById('t_stable_area').classList.add('is-visible');
        POG_Log.d("Theater Sequence: FINISHED");

        // 6. MCパネル表示：場所を動かさず、透明度だけを戻す
        await wait(2000); 
        const finalMC = window.AppState.latestData?.mc_action;
        if (finalMC) {
            const tBtn = document.getElementById('t_next_btn');
            if (tBtn) {
                tBtn.innerText = finalMC.label;
                tBtn.disabled = finalMC.disabled || false;
            }
            const ctrl = document.getElementById('t_mc_ctrl');
            if (ctrl) {
                // 透明封印を解き、右寄せのまま表示
                ctrl.style.setProperty('opacity', '1', 'important');
                ctrl.style.setProperty('visibility', 'visible', 'important');
                ctrl.style.setProperty('pointer-events', 'auto', 'important');
                ctrl.classList.add('is-visible');
            }
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