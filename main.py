from fastapi import FastAPI, Request, Form, Response
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from supabase import create_client
import urllib.parse
import random
import os
import traceback

app = FastAPI()

# 【重要】staticフォルダをマウントする設定
app.mount("/static", StaticFiles(directory="static"), name="static")

templates = Jinja2Templates(directory="templates")

# --- Supabase 設定 ---
SUPABASE_URL = "https://klnehheffymzcrlofdwt.supabase.co"
SUPABASE_KEY = "sb_publishable_rTGUjz-nIYn50RxuwwoqZg_vV9IoWRX"
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# --- ヘルパー関数 ---
def get_setting(key):
    try:
        res = supabase.table("draft_settings").select("value").eq("key", key).execute()
        return res.data[0]['value'].strip() if (res.data and res.data[0].get('value')) else ""
    except:
        return None

def update_setting(key, value):
    supabase.table("draft_settings").upsert({"key": key, "value": str(value)}).execute()

@app.get("/setup")
async def setup_page(request: Request):
    return templates.TemplateResponse("setup.html", {"request": request})

@app.post("/do_setup")
async def do_setup(players: str = Form(...), mc: str = Form(...)):
    # 1. 入力値のクリーニング（全角スペース対応・カンマ区切り）
    clean_players = players.replace("　", " ")
    player_list = [p.strip() for p in clean_players.split(",") if p.strip()]
    mc_name = mc.strip()
    
    # 2. 【最重要】MC存在チェック
    # リストにMCの名前がなければ、DB操作を一切行わずに即座にエラーを返す
    if mc_name not in player_list:
        error_msg = f"エラー: MC『{mc_name}』が参加者リストに存在しません。\\n現在のリスト: {', '.join(player_list)}"
        return HTMLResponse(content=f"""
            <!DOCTYPE html>
            <html>
            <body>
                <script>
                    alert("{error_msg}");
                    window.history.back();
                </script>
            </body>
            </html>
        """, status_code=400)
    
    # 3. チェックを通った場合のみ、既存データの削除を実行
    try:
        supabase.table("draft_results").delete().neq("id", -1).execute()
        supabase.table("draft_settings").delete().neq("key", "empty").execute()
        supabase.table("participants").delete().neq("name", "empty").execute()
        
        # 4. 新規データの挿入
        pts = [{"name": p, "role": "MC" if p == mc_name else "Player"} for p in player_list]
        supabase.table("participants").insert(pts).execute()
        
        update_setting("current_round", "1")
        update_setting("phase", "nomination")
        update_setting("reveal_index", "-1")
        
        return RedirectResponse(url="/", status_code=303)
    except Exception as e:
        return HTMLResponse(content=f"DBエラーが発生しました: {str(e)}", status_code=500)

@app.get("/")
async def index(request: Request):
    import datetime
    ver = datetime.datetime.now().strftime("%m%d%H%M")
    raw_user = request.cookies.get("pog_user")
    user = urllib.parse.unquote(raw_user) if raw_user else None
    phase = get_setting("phase")
    
    if not phase: 
        return RedirectResponse(url="/setup", status_code=303)
    
    if not user:
        pts = supabase.table("participants").select("name, is_online").order("name").execute()
        return templates.TemplateResponse("login.html", {"request": request, "participants": pts.data}, media_type="text/html")
    
    round_now = int(get_setting("current_round") or 1)
    
    won_horse = supabase.table("draft_results").select("horse_name").eq("player_name", user).eq("round", round_now).eq("is_winner", 1).execute()
    current_nom = supabase.table("draft_results").select("horse_name").eq("player_name", user).eq("round", round_now).eq("is_winner", 0).execute()
    role_row = supabase.table("participants").select("role").eq("name", user).execute()
    confirmed = supabase.table("draft_results").select("round, player_name, horse_name").eq("is_winner", 1).order("player_name").order("round").execute()

    return templates.TemplateResponse("index.html", {
        "request": request, "user": user, "phase": phase, "current_round": round_now, 
        "won_horse": won_horse.data[0]['horse_name'] if won_horse.data else None, 
        "current_horse": current_nom.data[0]['horse_name'] if current_nom.data else None, 
        "is_mc": 1 if role_row.data and role_row.data[0]['role'] == 'MC' else 0,
        "confirmed_horses": confirmed.data,
        "version": ver
    }, media_type="text/html")

@app.get("/status")
async def status():
    import json
    phase = get_setting("phase")
    round_now = int(get_setting("current_round") or 1)
    rev_idx = int(get_setting("reveal_index") or -1)

    all_pts = supabase.table("participants").select("name").order("name").execute()
    all_players_list = [p['name'] for p in all_pts.data]

    # 今巡において、既に当選確定(is_winner=1)している人だけを除外する
    past_winners_res = supabase.table("draft_results").select("player_name").eq("round", round_now).eq("is_winner", 1).execute()
    past_winner_names = list(set([w['player_name'] for w in past_winners_res.data]))
    active_players = [p for p in all_players_list if p not in past_winner_names]
    
    # 役割変更：履歴保存のため全データを取得。UI側のfindが最新の指名を優先するようID降順でソート。
    noms_res = supabase.table("draft_results").select("*").order("id", desc=True).execute()
    all_noms_data = noms_res.data or []

    # 修正：履歴（-1）を除外し、現在有効な指名（0または1）のみをカウント対象とする
    current_noms = [n for n in all_noms_data if n.get('round') == round_now and n.get('is_winner') in [0, 1]]
    relevant_h_names = list(set([n['horse_name'].strip() for n in all_noms_data if n.get('horse_name')]))
    
    h_map = {}
    if relevant_h_names:
        # 必要な馬情報だけをピンポイントで取得
        # strip() 済みのリストを渡すことで照合を確実にし、負荷を抑える
        clean_names = [n.strip() for n in relevant_h_names if n]
        h_info_res = supabase.table("horses").select("horse_name, father_name, mother_name, stable, breeder, sex").in_("horse_name", clean_names).execute()
        h_map = {h['horse_name'].strip(): h for h in h_info_res.data} if h_info_res.data else {}

    for n in all_noms_data:
        h_key = n.get('horse_name', "").strip()
        h_info = h_map.get(h_key, {})
        n['horses'] = {
            "father_name": str(h_info.get('father_name') or n.get('father_name') or "-"),
            "mother_name": str(h_info.get('mother_name') or n.get('mother_name') or "-"),
            "sex": str(h_info.get('sex') or n.get('sex') or ""),
            "stable": str(h_info.get('stable') or "-"),
            "breeder": str(h_info.get('breeder') or "-")
        }
    # 修正：指名(0)または当選(1)を出したユニーク人数が、全参加者数と一致するかで判定
    unique_nominated_count = len(set([n['player_name'] for n in current_noms]))
    is_all_nominated = (unique_nominated_count >= len(all_players_list) and len(all_players_list) > 0)
    
    horse_names = [n['horse_name'] for n in current_noms]
    has_duplicates = len(horse_names) != len(set(horse_names))
    
    reveal_data = None
    if phase == "reveal" and 0 <= rev_idx < len(active_players):
        target = active_players[rev_idx]
        res = [n for n in current_noms if n['player_name'] == target]
        if res:
            h_name = res[0]['horse_name'].strip()
            h_d = h_map.get(h_name, {}) # 事前に取得済みのh_mapから抽出
            reveal_data = {
                "round": str(round_now),
                "player": target, 
                "horse": h_name, 
                "mother": res[0]['mother_name'], 
                "father": str(h_d.get('father_name') or res[0].get('father_name') or "データなし"),
                "stable": str(h_d.get('stable') or "未登録"),
                "breeder": str(h_d.get('breeder') or "未登録"),
                "sex": str(h_d.get('sex') or res[0].get('sex') or "")
            }

    # --- 演出用データの取得 ---
    lottery_queue = json.loads(get_setting("lottery_queue") or "[]")
    lottery_results = json.loads(get_setting("lottery_results") or "{}")
    lottery_idx = int(get_setting("lottery_idx") or 0)

    # MCボタン情報の生成
    mc_action = None
    if phase == "nomination":
        if is_all_nominated:
            mc_action = {"label": "指名公開を開始 ≫", "endpoint": "/mc/start_reveal", "class": "btn-primary"}
        else:
            mc_action = {"label": "指名待ち...", "endpoint": None, "class": "btn-secondary", "disabled": True}
    elif phase == "reveal":
        if rev_idx < len(active_players) - 1:
            mc_action = {"label": "次の指名公開 ≫", "endpoint": "/mc/next_reveal", "class": "btn-primary"}
        else:
            mc_action = {"label": "指名結果確認 ≫", "endpoint": "/mc/run_lottery", "class": "btn-primary"} 
    elif phase == "summary":
        if lottery_queue:
            mc_action = {"label": "抽選開始 ≫", "endpoint": "/mc/advance_lottery", "class": "btn-danger"}
        else:
            mc_action = {"label": "次の巡へ ≫", "endpoint": "/mc/next_round", "class": "btn-success"}
    elif phase == "lottery_reveal":
        if lottery_idx + 1 < len(lottery_queue):
            mc_action = {"label": "次の抽選へ ≫", "endpoint": "/mc/advance_lottery", "class": "btn-danger"}
        else:
            mc_action = {"label": "再指名へ ≫", "endpoint": "/mc/next_round", "class": "btn-success"}
    return {
        "phase": phase, "round": round_now, "reveal_index": rev_idx, 
        "total_players": len(active_players), "all_players": all_players_list, 
        "reveal_data": reveal_data, "all_nominations": all_noms_data,
        "is_all_nominated": is_all_nominated,
        "has_duplicates": has_duplicates,
        "lottery_queue": lottery_queue,
        "lottery_results": lottery_results,
        "lottery_idx": lottery_idx,
        "is_finished": (round_now >= 10 and phase == "nomination" and not current_noms and not lottery_queue),
        "mc_action": mc_action  # ←【追加】
    }

@app.post("/nominate")
async def nominate(request: Request, horse_name: str = Form(None), mother_name: str = Form(None), horse_id: str = Form(None), father_name: str = Form(None), sex: str = Form(None)):
    import traceback
    print(f"\n[SERVER_TRACE] === Nominate Process Start ===")
    print(f"[SERVER_TRACE] Received: horse_name='{horse_name}', mother='{mother_name}', father='{father_name}', sex='{sex}'")
    try:
        raw_user = request.cookies.get("pog_user")
        user = urllib.parse.unquote(raw_user) if raw_user else None
        print(f"[SERVER_TRACE] Auth User: {user}")
        if not user: return {"status": "error", "message": "ログインユーザーが見つかりません"}

        round_now = int(get_setting("current_round") or 1)
        print(f"[SERVER_TRACE] Current Round: {round_now}")

        # 【追加】フェーズチェック
        current_phase = get_setting("phase")
        if current_phase != "nomination":
            return {"status": "error", "message": "現在は指名期間外です"}

        # 【追加】今巡で既に当選確定（is_winner=1）しているプレイヤーは指名をブロックする
        already_won = supabase.table("draft_results").select("id").eq("player_name", user).eq("round", round_now).eq("is_winner", 1).execute()
        if already_won.data:
            return {"status": "error", "message": "あなたはこの巡で既に指名が確定しています"}

        print(f"[SERVER_TRACE] Executing DELETE (previous nomination)...")
        supabase.table("draft_results").delete().eq("player_name", user).eq("round", round_now).eq("is_winner", 0).execute()
        
        print(f"[SERVER_TRACE] Executing INSERT (new nomination)...")
        
        # 手動指名判定：馬名が空なら母名から生成
        is_manual = not bool(horse_name)
        
        # バリデーション：手動指名は父・母必須
        if is_manual and (not mother_name or not father_name):
            return {"status": "error", "message": "未登録馬の指名には、父名と母名の両方が必須です"}

        final_horse_name = horse_name if horse_name else f"{mother_name}の2024"
        
        # データ補完：既存馬指名で父・性別が空の場合、マスタから補填する
        final_father = father_name
        final_sex = sex
        if not is_manual and (not final_father or not final_sex):
            h_master = supabase.table("horses").select("father_name, sex").eq("horse_name", horse_name).execute()
            if h_master.data:
                final_father = final_father or h_master.data[0]['father_name']
                final_sex = final_sex or h_master.data[0]['sex']

        res = supabase.table("draft_results").insert({
            "player_name": user, 
            "horse_name": final_horse_name, 
            "mother_name": mother_name, 
            "father_name": final_father,
            "sex": final_sex,
            "round": round_now,
            "is_manual": is_manual,
            "is_winner": 0
        }).execute()
        
        print(f"[SERVER_TRACE] Process Completed Successfully")
        return {"status": "success"}
    except Exception as e:
        err_msg = traceback.format_exc()
        print(f"[SERVER_TRACE] !!! ERROR OCCURRED !!!\n{err_msg}")
        return {"status": "error", "message": f"Server Side Error: {str(e)}", "debug_trace": err_msg}

@app.post("/mc/start_reveal")
async def start_reveal():
    import datetime
    print(f"[SERVER_EVIDENCE] {datetime.datetime.now().strftime('%H:%M:%S.%f')} - start_reveal: returning status")
    update_setting("phase", "reveal")
    update_setting("reveal_index", "0")
    return await status()

@app.post("/mc/next_reveal")
async def next_reveal():
    round_now = int(get_setting("current_round"))
    all_pts = supabase.table("participants").select("name").execute()
    # 【修正】公開フェーズの対象人数は、今巡の開始時点で未確定だった人数（＝参加人数 - 前巡までの当選者）で固定する
    past_winners = supabase.table("draft_results").select("player_name").lt("round", round_now).eq("is_winner", 1).execute()
    past_winner_names = [w['player_name'] for w in past_winners.data]
    active_count = len([p for p in all_pts.data if p['name'] not in past_winner_names])
    
    current_idx = int(get_setting("reveal_index"))
    new_idx = current_idx + 1
    update_setting("reveal_index", str(new_idx))
    return await status()

@app.post("/mc/run_lottery")
async def run_lottery():
    import json
    round_now = int(get_setting("current_round") or 1)
    # 現在の巡で指名されている全データを取得（is_winner=0）
    noms = supabase.table("draft_results").select("*").eq("round", round_now).eq("is_winner", 0).execute()
    
    horse_groups = {}
    for n in noms.data:
        horse_groups.setdefault(n['horse_name'], []).append(n)
    
    lottery_results = {}
    lottery_queue = []
    
    for h_name, participants in horse_groups.items():
        if len(participants) > 1:
            # 重複：ここではキューに入れるだけ
            lottery_queue.append(h_name)
        else:
            # 単独：この瞬間に確定（正しい即時更新）
            supabase.table("draft_results").update({"is_winner": 1}).eq("id", participants[0]['id']).execute()

    # 演出用データを保存
    update_setting("lottery_queue", json.dumps(lottery_queue))
    update_setting("lottery_results", json.dumps(lottery_results))
    update_setting("lottery_idx", "0")
    
    # 重複の有無に関わらず、必ず「指名結果(summary)」画面へ遷移させる
    update_setting("phase", "summary")
        
    return await status()

@app.post("/mc/advance_lottery")
async def advance_lottery():
    import json
    phase = get_setting("phase")
    round_now = int(get_setting("current_round") or 1)
    queue = json.loads(get_setting("lottery_queue") or "[]")
    results = json.loads(get_setting("lottery_results") or "{}")
    idx = int(get_setting("lottery_idx") or 0)

    # 抽選ロジックの実行（ボタンが押された瞬間に決定する）
    def perform_lottery(target_idx):
        h_name = queue[target_idx]
        # その馬を指名している人を再取得
        noms = supabase.table("draft_results").select("*").eq("horse_name", h_name).eq("round", round_now).eq("is_winner", 0).execute()
        if noms.data:
            winner = random.choice(noms.data)
            # 1. 演出用データの更新
            results[h_name] = {
                "winner_name": winner['player_name'],
                "winner_id": winner['id'],
                "participants": [p['player_name'] for p in noms.data]
            }
            update_setting("lottery_results", json.dumps(results))
            # 2. DBの更新（即時反映）
            supabase.table("draft_results").update({"is_winner": -1}).eq("horse_name", h_name).eq("round", round_now).eq("is_winner", 0).execute()
            supabase.table("draft_results").update({"is_winner": 1}).eq("id", winner['id']).execute()

    if phase == "summary":
        if queue:
            perform_lottery(0) # 最初の抽選を実行
            update_setting("phase", "lottery_reveal")
    elif phase == "lottery_reveal":
        if idx + 1 < len(queue):
            new_idx = idx + 1
            perform_lottery(new_idx) # 次の抽選を実行
            update_setting("lottery_idx", str(new_idx))
            
    return await status()

@app.post("/mc/next_round")
async def next_round():
    import json
    round_now = int(get_setting("current_round") or 1)
    
    # 修正：落選データの有無ではなく、「その巡の当選者数 == 参加人数」で判定する
    # 修正：落選データの有無ではなく、「その巡の当選者数 < 参加人数」で判定する
    winners_res = supabase.table("draft_results").select("id", count="exact").eq("round", round_now).eq("is_winner", 1).execute()
    players_res = supabase.table("participants").select("id", count="exact").execute()
    is_incomplete = (winners_res.count or 0) < (players_res.count or 0)

    if is_incomplete:
        print(f"[SERVER_EVIDENCE] Round {round_now}: Re-nomination required.")
    else:
        # 全員が当選確定した時のみ、次の巡目へ進む
        if round_now < 10:
            update_setting("current_round", str(round_now + 1))
        else:
            update_setting("current_round", "10")
    
    # 抽選データをクリアして次へ
    update_setting("lottery_queue", "[]")
    update_setting("lottery_results", "{}")

    # 10巡目完了かつ、その巡で未確定者がいなければ終了
    is_done = (round_now >= 10 and not is_incomplete)
    update_setting("phase", "finished" if is_done else "nomination")
    return await status()

@app.post("/mc/update_nomination")
async def update_nomination(request: Request, 
                           target_player: str = Form(...), 
                           target_round: int = Form(...),
                           horse_name: str = Form(None), 
                           mother_name: str = Form(None), 
                           father_name: str = Form(None), 
                           sex: str = Form(None),
                           is_manual: str = Form("0")):
    try:
        # 1. MC権限チェック
        raw_user = request.cookies.get("pog_user")
        user = urllib.parse.unquote(raw_user) if raw_user else None
        role_row = supabase.table("participants").select("role").eq("name", user).execute()
        if not role_row.data or role_row.data[0]['role'] != 'MC':
            return {"status": "error", "message": "MC権限が必要です"}

        # 2. 論理整合性：マスタ判定の結果を数値として評価
        bool_is_manual = (is_manual == "1")
        
        # 馬名が未入力（母名指名）の場合は強制的にis_manual=TRUE
        final_horse_name = horse_name if horse_name else f"{mother_name}の2024"
        if not horse_name:
            bool_is_manual = True

        # 3. DB更新
        # あるべき姿：MC入力情報を最優先し、is_manualフラグを適切に設定する
        supabase.table("draft_results").update({
            "horse_name": final_horse_name,
            "mother_name": mother_name,
            "father_name": father_name,
            "sex": sex,
            "is_manual": bool_is_manual
        }).eq("player_name", target_player).eq("round", target_round).in_("is_winner", [0, 1]).execute()

        return {"status": "success"}
    except Exception as e:
        import traceback
        print(f"[MC_UPDATE_ERROR] {traceback.format_exc()}")
        return {"status": "error", "message": str(e)}

@app.post("/login")
async def login(user: str = Form(...)):
    # 1. 証拠の確認：選ばれたユーザーが現在入室中(is_online)かチェック
    res = supabase.table("participants").select("is_online").eq("name", user).execute()
    
    if res.data and res.data[0].get("is_online"):
        # すでに入室済みの場合は、アラートを出して戻す（同時押し対策）
        return HTMLResponse(content=f"""
            <script>
                alert("エラー：『{user}』さんは既に入室済みです。別の名前を選択してください。");
                window.location.href = "/";
            </script>
        """, status_code=400)

    # 2. 入室状態に更新（早い者勝ちの確定）
    supabase.table("participants").update({"is_online": True, "last_seen": "now()"}).eq("name", user).execute()

    response = RedirectResponse(url="/", status_code=303)
    response.set_cookie(key="pog_user", value=urllib.parse.quote(user), max_age=86400)
    return response

@app.get("/logout")
async def logout(request: Request):
    raw_user = request.cookies.get("pog_user")
    if raw_user:
        user = urllib.parse.unquote(raw_user)
        # 退出時に is_online を False に戻す
        supabase.table("participants").update({"is_online": False}).eq("name", user).execute()

    response = RedirectResponse(url="/", status_code=303)
    response.delete_cookie("pog_user")
    return response

@app.get("/search_horses")
async def search_horses(f: str = "", m: str = ""):
    if len(f) < 2 and len(m) < 2: return []
    
    won = supabase.table("draft_results").select("horse_name").eq("is_winner", 1).execute()
    won_list = [w['horse_name'] for w in won.data]
    
    query = supabase.table("horses").select("horse_name, father_name, mother_name, sex")
    if f: query = query.ilike("father_name", f"%{f}%")
    if m: query = query.ilike("mother_name", f"%{m}%")
    
    res = query.limit(100).execute()
    return [h for h in res.data if h['horse_name'] not in won_list]

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)