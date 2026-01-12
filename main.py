from fastapi import FastAPI, Request, Form, Response
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from supabase import create_client
import urllib.parse
import random
import os

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
        return res.data[0]['value'] if res.data else None
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
    raw_user = request.cookies.get("pog_user")
    user = urllib.parse.unquote(raw_user) if raw_user else None
    phase = get_setting("phase")
    
    if not phase: 
        return RedirectResponse(url="/setup", status_code=303)
    
    if not user:
        pts = supabase.table("participants").select("name").order("name").execute()
        return templates.TemplateResponse("login.html", {"request": request, "participants": pts.data}, media_type="text/html")
    
    round_now = int(get_setting("current_round") or 1)
    
    won_horse = supabase.table("draft_results").select("horse_name").eq("player_name", user).eq("round", round_now).eq("is_winner", 1).execute()
    current_nom = supabase.table("draft_results").select("horse_name").eq("player_name", user).eq("round", round_now).eq("is_winner", 0).execute()
    role_row = supabase.table("participants").select("role").eq("name", user).execute()
    confirmed = supabase.table("draft_results").select("round, player_name, horse_name").eq("is_winner", 1).order("round").order("player_name").execute()

    return templates.TemplateResponse("index.html", {
        "request": request, "user": user, "phase": phase, "current_round": round_now, 
        "won_horse": won_horse.data[0]['horse_name'] if won_horse.data else None, 
        "current_horse": current_nom.data[0]['horse_name'] if current_nom.data else None, 
        "is_mc": 1 if role_row.data and role_row.data[0]['role'] == 'MC' else 0,
        "confirmed_horses": confirmed.data
    }, media_type="text/html")

@app.get("/status")
async def status():
    phase = get_setting("phase")
    round_now = int(get_setting("current_round") or 1)
    rev_idx = int(get_setting("reveal_index") or -1)

    all_pts = supabase.table("participants").select("name").order("name").execute()
    all_players_list = [p['name'] for p in all_pts.data]

    winners = supabase.table("draft_results").select("player_name").eq("round", round_now).eq("is_winner", 1).execute()
    winner_names = [w['player_name'] for w in winners.data]
    active_players = [p for p in all_players_list if p not in winner_names]
    
    all_noms = supabase.table("draft_results").select("*").execute()

    # 今回の巡の有効な指名（is_winner=0）のみを抽出して判定
    current_noms = [n for n in all_noms.data if n['round'] == round_now and n['is_winner'] == 0]
    is_all_nominated = len(current_noms) >= len(active_players)
    
    horse_names = [n['horse_name'] for n in current_noms]
    has_duplicates = len(horse_names) != len(set(horse_names))
    
    reveal_data = None
    if phase == "reveal" and 0 <= rev_idx < len(active_players):
        target = active_players[rev_idx]
        res = supabase.table("draft_results").select("*").eq("player_name", target).eq("round", round_now).eq("is_winner", 0).execute()
        if res.data:
            h_info = supabase.table("horses").select("father_name").eq("horse_name", res.data[0]['horse_name']).execute()
            reveal_data = {
                "player": target, 
                "horse": res.data[0]['horse_name'], 
                "mother": res.data[0]['mother_name'], 
                "father": h_info.data[0]['father_name'] if h_info.data else "データなし"
            }
        else:
            reveal_data = {"player": target, "horse": "（未入力）", "mother": "-", "father": "-"}

    return {
        "phase": phase, "round": round_now, "reveal_index": rev_idx, 
        "total_players": len(active_players), "all_players": all_players_list, 
        "reveal_data": reveal_data, "all_nominations": all_noms.data,
        "is_all_nominated": is_all_nominated,
        "has_duplicates": has_duplicates
    }

@app.post("/nominate")
async def nominate(request: Request, horse_name: str = Form(...), mother_name: str = Form(...)):
    raw_user = request.cookies.get("pog_user")
    user = urllib.parse.unquote(raw_user) if raw_user else None
    if not user: return {"status": "error"}

    round_now = int(get_setting("current_round") or 1)
    supabase.table("draft_results").delete().eq("player_name", user).eq("round", round_now).eq("is_winner", 0).execute()
    supabase.table("draft_results").insert({
        "player_name": user, "horse_name": horse_name, "mother_name": mother_name, "round": round_now
    }).execute()
    return {"status": "success"}

@app.post("/mc/start_reveal")
async def start_reveal():
    update_setting("phase", "reveal")
    update_setting("reveal_index", "0")
    return {"status": "ok"}

@app.post("/mc/next_reveal")
async def next_reveal():
    round_now = int(get_setting("current_round"))
    all_pts = supabase.table("participants").select("name").execute()
    winners = supabase.table("draft_results").select("player_name").eq("round", round_now).eq("is_winner", 1).execute()
    active_count = len(all_pts.data) - len(winners.data)
    
    current_idx = int(get_setting("reveal_index"))
    new_idx = current_idx + 1
    if new_idx >= active_count:
        update_setting("phase", "lottery")
    else:
        update_setting("reveal_index", str(new_idx))
    return {"status": "ok"}

@app.post("/mc/run_lottery")
async def run_lottery():
    round_now = int(get_setting("current_round") or 1)
    noms = supabase.table("draft_results").select("id, horse_name").eq("round", round_now).eq("is_winner", 0).execute()
    
    horse_groups = {}
    for n in noms.data:
        horse_groups.setdefault(n['horse_name'], []).append(n['id'])
    
    for h_name, ids in horse_groups.items():
        winner_id = random.choice(ids)
        supabase.table("draft_results").update({"is_winner": 1}).eq("id", winner_id).execute()
        supabase.table("draft_results").update({"is_winner": -1}).eq("horse_name", h_name).eq("round", round_now).eq("is_winner", 0).execute()
    
    update_setting("phase", "lottery")
    return {"status": "ok"}

@app.post("/mc/next_round")
async def next_round():
    round_now = int(get_setting("current_round") or 1)
    losers = supabase.table("draft_results").select("id", count="exact").eq("is_winner", -1).execute()
    
    if losers.count > 0:
        supabase.table("draft_results").delete().eq("is_winner", -1).execute()
    else:
        supabase.table("draft_results").update({"is_winner": 1}).eq("round", round_now).eq("is_winner", 0).execute()
        update_setting("current_round", str(round_now + 1))
    
    update_setting("phase", "nomination")
    return {"status": "ok"}

@app.post("/login")
async def login(user: str = Form(...)):
    response = RedirectResponse(url="/", status_code=303)
    response.set_cookie(key="pog_user", value=urllib.parse.quote(user), max_age=86400)
    return response

@app.get("/logout")
async def logout():
    response = RedirectResponse(url="/", status_code=303)
    response.delete_cookie("pog_user")
    return response

@app.get("/search_horses")
async def search_horses(f: str = "", m: str = ""):
    if len(f) < 2 and len(m) < 2: return []
    
    won = supabase.table("draft_results").select("horse_name").eq("is_winner", 1).execute()
    won_list = [w['horse_name'] for w in won.data]
    
    query = supabase.table("horses").select("horse_name, father_name, mother_name")
    if f: query = query.ilike("father_name", f"%{f}%")
    if m: query = query.ilike("mother_name", f"%{m}%")
    
    res = query.limit(100).execute()
    return [h for h in res.data if h['horse_name'] not in won_list]

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)