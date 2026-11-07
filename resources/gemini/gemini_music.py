# Музыка через gemini.google.com (режим «Создание музыки») в Chrome пользователя; запускается приложением через browser-harness.
#   GEM_PROMPT  — файл UTF-8 с описанием трека
#   GEM_OUT_DIR — куда сохранить результат
#   GEM_TIMEOUT — сколько ждать трек, секунд (по умолчанию 420)
# Открывает свою вкладку и закрывает её в конце — вкладки пользователя не трогает.
# Печатает «RESULT {...}» (JSON): {"ok": true, "file": "...mp4"} или {"ok": false, "error": "..."}.
import json, os, time, base64

def out(**kw):
    print("RESULT", json.dumps(kw, ensure_ascii=False), flush=True)

PROMPT = open(os.environ["GEM_PROMPT"], encoding="utf-8").read().strip()
OUT_DIR = os.environ["GEM_OUT_DIR"]
TIMEOUT = int(os.environ.get("GEM_TIMEOUT", "420"))
tab = None

def finish(**kw):
    out(**kw)
    try:
        if tab: cdp("Target.closeTarget", targetId=tab)
    except Exception:
        pass
    raise SystemExit(0)

def ax_click(name, role=None, exact=True):
    for n in cdp("Accessibility.getFullAXTree")["nodes"]:
        nm = n.get("name", {}).get("value", "")
        if (nm == name if exact else name in nm) and (role is None or n.get("role", {}).get("value") == role) and n.get("backendDOMNodeId"):
            q = cdp("DOM.getBoxModel", backendNodeId=n["backendDOMNodeId"])["model"]["content"]
            click_at_xy(sum(q[0::2]) / 4, sum(q[1::2]) / 4)
            return True
    return False

before = {t["targetId"] for t in cdp("Target.getTargets")["targetInfos"]}
new_tab("https://gemini.google.com/app?hl=ru"); wait_for_load(); wait(4)
tab = next((t["targetId"] for t in cdp("Target.getTargets")["targetInfos"] if t["targetId"] not in before and "gemini.google.com" in t["url"]), None)
# A background tab closes its menus at once: bring it to the front.
if tab:
    switch_tab(tab); activate_tab(tab); wait(1)
if "accounts.google.com" in page_info()["url"]:
    finish(ok=False, error="В Chrome не выполнен вход в Google: откройте gemini.google.com и войдите.")

# Chrome may be in the background (the user works elsewhere): the page must think it has focus, or its menus close.
cdp("Emulation.setFocusEmulationEnabled", enabled=True)
for _ in range(30):
    if js("!!document.querySelector('button[aria-label=\"Загрузка и инструменты\"]')"):
        break
    time.sleep(.5)
time.sleep(2)
picked = False
for attempt in range(5):
    js("document.querySelector('button[aria-label=\"Загрузка и инструменты\"]')?.click()")
    time.sleep(1.5)
    picked = js("""(()=>{const m=[...document.querySelectorAll('[role=menuitemcheckbox],[role=menuitem]')].find(e=>/Создание музыки/.test(e.innerText)); if(!m) return false; m.click(); return true})()""")
    if picked:
        break
    press_key("Escape"); time.sleep(1.5)
if not picked:
    finish(ok=False, error="В Gemini нет «Создания музыки» для этого аккаунта (нужна подписка Google AI) или интерфейс изменился.")
time.sleep(1.5)
# The prompt field: contenteditable; focus it from the page.
box = js("""(()=>{const e=[...document.querySelectorAll('[contenteditable=true],[role=textbox],textarea')].find(x=>x.offsetParent); if(!e) return null; e.focus(); const r=e.getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]})()""")
if not box:
    finish(ok=False, error="Не нашёл поле запроса Gemini.")
click_at_xy(*box); wait(.5)
type_text(PROMPT); wait(1); press_key("Enter"); wait(3)
# Enter may not reach a background window: press the send button if the prompt is still in the field.
if js("""(()=>{const e=[...document.querySelectorAll('[contenteditable=true],[role=textbox],textarea')].find(x=>x.offsetParent); return !!e && e.innerText.trim().length>10})()"""):
    js("""[...document.querySelectorAll('button')].find(b=>/Отправить|Send/i.test(b.getAttribute('aria-label')||''))?.click()""")
    wait(3)
if not js(f"document.body.innerText.includes({json.dumps(PROMPT[:30])})"):
    finish(ok=False, error="Запрос не отправился в Gemini.")

start = time.time(); media = 0
while time.time() - start < TIMEOUT:
    time.sleep(6)
    media = js("document.querySelectorAll('main video, main audio, video, audio').length") or 0
    busy = js("!![...document.querySelectorAll('button')].find(b=>/Остановить|Stop/i.test(b.getAttribute('aria-label')||''))")
    if media and not busy:
        break
    if not busy and time.time() - start > 90:
        text = js("document.querySelector('main')?.innerText.slice(-400)") or ""
        finish(ok=False, error="Gemini не создал музыку: " + text.strip().split("\n")[-1][:200])
if not media:
    finish(ok=False, error=f"Gemini не отдал трек за {TIMEOUT // 60} мин.")

# The track is a video element (cover + sound); the page may fetch it with the user's session.
r = js("""(async()=>{const v=[...document.querySelectorAll('video,audio')].pop(); const src=v.currentSrc||v.src;
  try{const res=await fetch(src,{credentials:'include'}); if(!res.ok) return {ok:false,err:'HTTP '+res.status};
    const b=await res.blob(); const buf=new Uint8Array(await b.arrayBuffer()); let s='';
    for(let i=0;i<buf.length;i+=32768) s+=String.fromCharCode(...buf.subarray(i,i+32768));
    return {ok:true,type:b.type,b64:btoa(s)}}catch(e){return {ok:false,err:String(e)}}})()""")
if not r or not r.get("ok"):
    finish(ok=False, error="Не удалось скачать трек из Gemini: " + str((r or {}).get("err")))
ext = ".mp4" if "mp4" in (r.get("type") or "") else ".mp3" if "mpeg" in (r.get("type") or "") else ".m4a"
os.makedirs(OUT_DIR, exist_ok=True)
path = os.path.join(OUT_DIR, f"gemini-{int(time.time())}{ext}")
open(path, "wb").write(base64.b64decode(r["b64"]))
finish(ok=True, file=path)
