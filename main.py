import os
from fastapi import FastAPI, Request, Form, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles  # 追加
from supabase import create_client, Client
from typing import List

app = FastAPI()

# staticフォルダをマウントする設定を追加
app.mount("/static", StaticFiles(directory="static"), name="static")

templates = Jinja2Templates(directory="templates")

# Supabase設定
SUPABASE_URL = os.environ.get("SUPABASE_URL") or "https://klnehheffymzcrlofdwt.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or "sb_publishable_rTGUjz-nIYn50RxuwwoqZg_vV9IoWRX"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

@app.get("/")
async def read_root(request: Request):
    user_name = request.cookies.get("user_name")
    if not user_name:
        return RedirectResponse(url="/login_page")
    
    res = supabase.table("participants").select("is_mc").eq("name", user_name).execute()
    is_mc = res.data[0]["is_mc"] if res.data else False
    
    return templates.TemplateResponse("index.html", {
        "request": request, 
        "user_name": user_name, 
        "is_mc": is_mc
    })

@app.get("/setup")
async def setup_page(request: Request):
    return templates.TemplateResponse("setup.html", {"request": request})

@app.post("/do_setup")
async def do_setup(players: str = Form(...), mc: str = Form(...)):
    player_list = [p.strip() for p in players.split(",")]
    
    supabase.table("nominations").delete().neq("id", -1).execute()
    supabase.table("participants").delete().neq("id", -1).execute()
    supabase.table("status").delete().neq("id", -1).execute()
    
    for p in player_list:
        supabase.table("participants").insert({"name": p, "is_mc": (p == mc)}).execute()
    
    supabase.table("status").insert({"round": 1, "phase": "entry"}).execute()
    return RedirectResponse(url="/", status_code=303)

@app.get("/login_page")
async def login_page(request: Request):
    res = supabase.table("participants").select("*").execute()
    return templates.TemplateResponse("login.html", {"request": request, "participants": res.data})

@app.post("/login")
async def login(user: str = Form(...)):
    response = RedirectResponse(url="/", status_code=303)
    response.set_cookie(key="user_name", value=user)
    return response

@app.get("/get_status")
async def get_status():
    status_res = supabase.table("status").select("*").order("id", desc=True).limit(1).execute()
    nom_res = supabase.table("nominations").select("*").execute()
    part_res = supabase.table("participants").select("*").execute()
    
    current_status = status_res.data[0] if status_res.data else {"round": 1, "phase": "entry"}
    
    return {
        "round": current_status["round"],
        "phase": current_status["phase"],
        "nominations": nom_res.data,
        "participants": part_res.data
    }

@app.get("/search")
async def search(name: str = "", sire: str = "", dam: str = ""):
    query = supabase.table("horses").select("*")
    if name:
        query = query.ilike("name", f"%{name}%")
    if sire:
        query = query.ilike("sire", f"%{sire}%")
    if dam:
        query = query.ilike("dam", f"%{dam}%")
    
    res = query.limit(50).execute()
    return res.data

@app.post("/nominate")
async def nominate(request: Request, horse_name: str = Form(...), sire: str = Form(...), dam: str = Form(...)):
    user_name = request.cookies.get("user_name")
    status_res = supabase.table("status").select("*").order("id", desc=True).limit(1).execute()
    current_round = status_res.data[0]["round"]
    
    supabase.table("nominations").delete().match({
        "player_name": user_name, 
        "round": current_round
    }).execute()
    
    supabase.table("nominations").insert({
        "player_name": user_name,
        "round": current_round,
        "horse_name": horse_name,
        "sire": sire,
        "dam": dam,
        "is_winner": None
    }).execute()
    return {"status": "ok"}

@app.post("/update_phase")
async def update_phase(phase: str = Form(...)):
    status_res = supabase.table("status").select("*").order("id", desc=True).limit(1).execute()
    current_id = status_res.data[0]["id"]
    supabase.table("status").update({"phase": phase}).eq("id", current_id).execute()
    return {"status": "ok"}

@app.post("/run_lottery")
async def run_lottery():
    import random
    status_res = supabase.table("status").select("*").order("id", desc=True).limit(1).execute()
    current_round = status_res.data[0]["round"]
    
    noms = supabase.table("nominations").select("*").eq("round", current_round).execute()
    
    horse_groups = {}
    for n in noms.data:
        h_name = n["horse_name"]
        if h_name not in horse_groups:
            horse_groups[h_name] = []
        horse_groups[h_name].append(n)
        
    for h_name, group in horse_groups.items():
        winner = random.choice(group)
        for n in group:
            is_winner = (n["id"] == winner["id"])
            supabase.table("nominations").update({"is_winner": is_winner}).eq("id", n["id"]).execute()
            
    current_id = status_res.data[0]["id"]
    supabase.table("status").update({"phase": "result"}).eq("id", current_id).execute()
    return {"status": "ok"}

@app.post("/next_round")
async def next_round():
    status_res = supabase.table("status").select("*").order("id", desc=True).limit(1).execute()
    next_round_num = status_res.data[0]["round"] + 1
    supabase.table("status").insert({"round": next_round_num, "phase": "entry"}).execute()
    return {"status": "ok"}