# Картинка через ChatGPT в Chrome пользователя (USP Stories). Запуск: browser-harness < chatgpt_image.py
#   GPT_PROMPT  — файл с текстом запроса
#   GPT_FILES   — JSON-список картинок для приложения к запросу (карты персонажей), можно пусто
#   GPT_OUT     — куда сохранить картинку
#   GPT_TIMEOUT — сколько ждать, секунд (по умолчанию 480)
#   GPT_KEEP    — 1: не скрывать чат из истории после работы
# Работает в своей вкладке и закрывает её. Временный чат не подходит: в нём ChatGPT не рисует по загруженному фото,
# поэтому запрос идёт в обычный чат, а после него чат скрывается из истории (как «Скрыть» в самом ChatGPT).
# Если хранилище файлов ChatGPT заполнено, запрос повторяется без вложений: персонажи описаны в самом тексте.
import base64, json, os, time

def out(kind, **kw):
    print(kind + " " + json.dumps(kw, ensure_ascii=False), flush=True)

PROMPT = " ".join(open(os.environ["GPT_PROMPT"], encoding="utf-8").read().split())  # a newline would send early
FILES = json.loads(os.environ.get("GPT_FILES") or "[]")
OUT = os.environ["GPT_OUT"]
TIMEOUT = int(os.environ.get("GPT_TIMEOUT", "480"))
BUSY = "[...document.querySelectorAll('button')].some(b=>{const l=(b.getAttribute('aria-label')||'')+(b.dataset.testid||'');return l.indexOf('Останов')>=0||l.indexOf('Stop')>=0||l.indexOf('stop-button')>=0})"
GENERATED = "[...document.querySelectorAll('main img')].filter(i=>/Сгенерированное изображение|Generated image/i.test(i.alt||'') && i.naturalWidth>300)"

tab = None

def hide_chat():
    if os.environ.get("GPT_KEEP") == "1":
        return
    try:
        js("""(async()=>{const m=location.pathname.match(/\\/c\\/([0-9a-f-]{20,})/); if(!m) return 'no id';
          const s=await (await fetch('/api/auth/session',{credentials:'include'})).json();
          const r=await fetch('/backend-api/conversation/'+m[1],{method:'PATCH',credentials:'include',
            headers:{'Content-Type':'application/json',Authorization:'Bearer '+s.accessToken},body:JSON.stringify({is_visible:false})});
          return r.status})()""")
    except Exception:
        pass

def finish(**kw):
    try:
        if tab:
            hide_chat()
            cdp("Target.closeTarget", targetId=tab)
    except Exception:
        pass
    out("RESULT", **kw)
    raise SystemExit(0)

def open_chat():
    for _ in range(20):
        if js("!!document.querySelector('.ProseMirror')"):
            return
        wait(1)
    if js("[...document.querySelectorAll('button,a')].some(b=>/log in|войти|sign up/i.test(b.innerText))"):
        finish(ok=False, error="В ChatGPT не выполнен вход. Войдите в аккаунт ChatGPT в Chrome и повторите.")
    finish(ok=False, error="ChatGPT не открыл поле запроса.")

def attach(files):
    out("PROGRESS", message=f"Прикладываем карты персонажей: {len(files)}")
    root = cdp("DOM.getDocument", depth=-1, pierce=True)["root"]["nodeId"]
    ids = cdp("DOM.querySelectorAll", nodeId=root, selector="input[type=file][multiple]")["nodeIds"]
    if not ids:
        return False
    target = ids[0]
    for nid in ids:
        attrs = cdp("DOM.getAttributes", nodeId=nid)["attributes"]
        if "image" in dict(zip(attrs[0::2], attrs[1::2])).get("accept", ""):
            target = nid; break
    cdp("DOM.setFileInputFiles", files=files, nodeId=target)
    names = [os.path.basename(f) for f in files]
    for _ in range(60):  # a preview gets a «Удалить <имя файла>» button once uploaded
        wait(1)
        labels = js("[...document.querySelectorAll('form button')].map(b=>b.getAttribute('aria-label')||'').join('|')") or ""
        if all(n in labels for n in names):
            break
    wait(3)
    return True

def send():
    out("PROGRESS", message="Отправляем запрос в ChatGPT")
    js("document.querySelector('.ProseMirror').focus()")
    type_text(PROMPT)
    wait(1)
    press_key("Enter")
    wait(3)
    if (js("(document.querySelector('.ProseMirror')||{}).innerText||''") or "").strip():
        js("(document.querySelector('#composer-submit-button,[data-testid=send-button],button[aria-label=\"Отправить\"]')||{click(){}}).click()")

def answer_text():
    tail = " ".join((js("(document.querySelector('main')||document.body).innerText") or "").split())
    k = tail.rfind(PROMPT[:40])
    return (tail[k + len(PROMPT):] if k >= 0 else tail[-400:]).strip()

def wait_picture():
    """('ok', None) once the picture is saved; ('words', text) when ChatGPT answered without one."""
    out("PROGRESS", message="ChatGPT рисует картинку")
    start = time.time(); idle_since = None
    while time.time() - start < TIMEOUT:
        wait(5)
        n = js(GENERATED + ".length") or 0
        busy = js(BUSY)
        tail_now = js("(document.querySelector('main')||document.body).innerText.slice(-300)") or ""
        drawing = any(w in tail_now for w in ("Создание изображения", "Создаю изображение", "Creating image", "Генерирую"))
        if n and not busy:
            wait(4)  # the sharp final version replaces the preview
            src = js(GENERATED + ".pop().src")
            data = js("""(async()=>{const r=await fetch(%s,{credentials:'include'});const b=await r.blob();
              return await new Promise(ok=>{const f=new FileReader();f.onload=()=>ok(f.result);f.readAsDataURL(b)})})()""" % json.dumps(src))
            if not data or "," not in data:
                finish(ok=False, error="Не удалось забрать картинку из ChatGPT.")
            with open(OUT, "wb") as f:
                f.write(base64.b64decode(data.split(",", 1)[1]))
            return "ok", None
        if "хранилище заполнено" in tail_now or "storage is full" in tail_now.lower():
            return "words", answer_text()
        idle_since = None if (busy or drawing) else (idle_since or time.time())
        if idle_since and time.time() - idle_since > 45 and time.time() - start > 60:
            return "words", answer_text()
        out("PROGRESS", message=f"ChatGPT рисует картинку… {int(time.time() - start)} с")
    finish(ok=False, error=f"ChatGPT не нарисовал картинку за {TIMEOUT // 60} мин.")

before = {t["targetId"] for t in cdp("Target.getTargets")["targetInfos"]}
new_tab("https://chatgpt.com/"); wait_for_load(); wait(4)
tab = next((t["targetId"] for t in cdp("Target.getTargets")["targetInfos"] if t["targetId"] not in before and "chatgpt.com" in t["url"]), None)
if not tab:
    finish(ok=False, error="Не удалось открыть вкладку ChatGPT в Chrome.")
switch_tab(tab)
cdp("Emulation.setFocusEmulationEnabled", enabled=True)
open_chat()

note = None
if FILES and not attach(FILES):
    note = "ChatGPT не дал приложить карты — персонажи переданы описанием."
send()
status, text = wait_picture()
if status == "words" and FILES and ("хранилище" in text or "storage" in text.lower()):
    # Full file storage: a new chat in the same tab, words only.
    hide_chat()
    note = "Хранилище файлов ChatGPT заполнено — карты не приложены, персонажи переданы описанием. Освободите место в «Библиотеке» ChatGPT."
    out("PROGRESS", message=note)
    goto_url("https://chatgpt.com/"); wait_for_load(); wait(4)
    open_chat()
    send()
    status, text = wait_picture()
if status == "ok":
    finish(ok=True, file=OUT, note=note)
finish(ok=False, error="ChatGPT не нарисовал картинку: " + (text or "")[:300])
