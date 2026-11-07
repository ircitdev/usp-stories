# Один клип через Google Flow, открытый в Chrome (запускается приложением через browser-harness).
#   FLOW_PROMPT  — файл UTF-8 с запросом агенту Flow
#   FLOW_OUT     — куда сохранить mp4
#   FLOW_PROJECT — адрес проекта Flow (пусто: первая открытая вкладка проекта)
#   FLOW_TIMEOUT — сколько ждать готового видео, секунд (по умолчанию 900)
#   FLOW_DRY=1   — ничего не отправлять: скачать первое готовое видео на текущей странице (проверка скачивания)
#   FLOW_KIND    — video (по умолчанию) или image: картинка вместо видео
# Печатает строки «PROGRESS {...}» и в конце «RESULT {...}» (JSON).
# Подтверждает только «Одобрить» для своего запроса; «Всегда одобрять» не нажимает никогда.
import json, os, re, time

def out(kind, **kw):
    print(kind, json.dumps(kw, ensure_ascii=False), flush=True)

def fail(msg):
    out("RESULT", ok=False, error=msg)
    raise SystemExit(0)

DRY = os.environ.get("FLOW_DRY") == "1"
KIND = os.environ.get("FLOW_KIND", "video")
IMAGE = KIND == "image"
WHAT = "картинку" if IMAGE else "видео"
OUT = os.environ["FLOW_OUT"]
PROJ = os.environ.get("FLOW_PROJECT", "").strip().rstrip("/")
TIMEOUT = int(os.environ.get("FLOW_TIMEOUT", "900"))
PROMPT = "" if DRY else open(os.environ["FLOW_PROMPT"], encoding="utf-8").read().strip()

tabs = [t for t in cdp("Target.getTargets")["targetInfos"]
        if t["type"] == "page" and t["url"].startswith("https://flow.google.com/project/") and (not PROJ or t["url"].startswith(PROJ))]
if not tabs:
    fail("В Chrome не открыт проект Google Flow" + (f" ({PROJ})" if PROJ else "") + ". Откройте его и повторите.")
switch_tab(tabs[0]["targetId"]); activate_tab(tabs[0]["targetId"]); wait(1)
m = re.match(r"^(https://flow\.google\.com/project/[^/?#]+)", page_info()["url"])
if not m:
    fail("Вкладка Flow открыта не на проекте: " + page_info()["url"])
ROOT = m.group(1)

def center(sel_js):
    """Centre of the element the JS expression returns, in viewport px (scrolled into view first)."""
    r = js(f"""(()=>{{const e=({sel_js}); if(!e) return null; e.scrollIntoView({{block:'center'}});
              const b=e.getBoundingClientRect(); return [b.x+b.width/2, b.y+b.height/2]}})()""")
    return r

def ax_click(name, role=None, contains=False):
    nodes = cdp("Accessibility.getFullAXTree")["nodes"]
    for n in nodes:
        nm = n.get("name", {}).get("value", "")
        if (name in nm if contains else nm == name) and (role is None or n.get("role", {}).get("value") == role) and n.get("backendDOMNodeId"):
            q = cdp("DOM.getBoxModel", backendNodeId=n["backendDOMNodeId"])["model"]["content"]
            click_at_xy(sum(q[0::2]) / 4, sum(q[1::2]) / 4)
            return True
    return False

def go_root():
    if page_info()["url"].rstrip("/") != ROOT:
        js(f"location.href={json.dumps(ROOT)}"); wait(4)

def filter_videos():
    """Shows only the kind of media this run makes: «Видео» or «Изображения»."""
    icon, title = ("image", "Изображения") if IMAGE else ("videocam", "Видео")
    js(f"""[...document.querySelectorAll('button')].find(b=>b.innerText.includes('{icon}') && b.innerText.trim().endsWith('{title}'))?.click()"""); wait(2)

# Tiles of this run's kind. Pictures are any media tile that is not a video, character or collection.
OF_KIND = ("(t=>t.querySelector('flow-image-tile') || (t.querySelector('img') && !t.querySelector('flow-video-tile,flow-character-tile,flow-collection-tile')))"
           if IMAGE else "(t=>t.querySelector('flow-video-tile'))")
DONE = ("(t=>{const i=t.querySelector('img'); return !!i && i.naturalWidth>0 && !/\\d+\\s*%/.test(t.innerText)})"
        if IMAGE else "(t=>t.innerText.includes('play_circle'))")

TILES = f"""[...document.querySelectorAll('flow-grid-tile-container')].filter({OF_KIND}).map((t,i)=>({{
  i, id:((t.querySelector('img')||{{}}).src||'').split('=')[0]||null, label:t.getAttribute('aria-label')||'',
  done:{DONE}(t), bad:/warning|Ошибка|не удалось/i.test(t.innerText),
  why:t.innerText.split(String.fromCharCode(10)).filter(l=>l.length>25)[0]||''}}))"""

def tiles():
    return js(TILES) or []

def download(index):
    """Saves video tile `index` of the current grid as OUT: the tile's menu › Скачать › 720p (original size).
    Clicking the tile itself only plays it in place; fetching the video URL from the page is refused by Flow."""
    dl = os.path.dirname(os.path.abspath(OUT)); os.makedirs(dl, exist_ok=True)
    cdp("Browser.setDownloadBehavior", behavior="allow", downloadPath=dl, eventsEnabled=True)
    ok = js(f"""(()=>{{const t=[...document.querySelectorAll('flow-grid-tile-container')].filter({OF_KIND})[{index}];
              if(!t) return false; t.scrollIntoView({{block:'center'}});
              const b=[...t.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Дополнительные параметры');
              if(!b) return false; b.click(); return true}})()""")
    if not ok: fail("Не нашёл меню карточки видео во Flow")
    before = set(os.listdir(dl))
    for attempt in range(4):
        wait(1.5)
        if ax_click("Скачать", role="menuitem"): break
        # The menu can close on the first scroll; open it again.
        js(f"""(()=>{{const t=[...document.querySelectorAll('flow-grid-tile-container')].filter({OF_KIND})[{index}];
              [...t.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Дополнительные параметры')?.click()}})()""")
    else:
        fail("В меню карточки Flow нет пункта «Скачать»")
    wait(1.5)
    if IMAGE:
        items = [n.get("name", {}).get("value", "") for n in cdp("Accessibility.getFullAXTree")["nodes"] if n.get("role", {}).get("value") == "menuitem"]
        out("PROGRESS", message="Варианты скачивания Flow: " + ", ".join(i for i in items if i)[:200])
        pick = next((i for i in items if re.search(r"1K|2K|4K|Оригинал|Original|PNG|JPG|JPEG", i)), None)
        if not pick or not ax_click(pick, role="menuitem"):
            fail("В меню скачивания Flow нет варианта для картинки: " + ", ".join(items)[:200])
    elif not ax_click("720p", role="menuitem", contains=True): fail("В меню скачивания Flow нет пункта 720p")
    for _ in range(120):
        time.sleep(1)
        new = [f for f in set(os.listdir(dl)) - before if re.search(r"\.(png|jpe?g|webp)$" if IMAGE else r"\.mp4$", f, re.I) and not f.endswith(".crdownload")]
        if new:
            time.sleep(1)
            target = OUT if not IMAGE else os.path.splitext(OUT)[0] + os.path.splitext(new[0])[1].lower()
            os.replace(os.path.join(dl, new[0]), target)
            return target
    fail("Flow не отдал файл за 2 минуты")

if DRY:
    t = [x for x in tiles() if x["done"]]
    if not t: fail(f"На странице нет готовых {'картинок' if IMAGE else 'видео'}")
    out("PROGRESS", message=f"Скачиваем «{t[0]['label']}»")
    saved = download(t[0]["i"])
    out("RESULT", ok=True, file=saved, label=t[0]["label"])
    raise SystemExit(0)

# 1. Wait until Flow has finished earlier videos: a late one would otherwise be taken for ours.
go_root(); filter_videos()
for _ in range(60):
    busy = [x for x in tiles() if not x["done"] and not x["bad"]]
    if not busy: break
    out("PROGRESS", message=f"Ждём, пока Flow закончит предыдущие {'картинки' if IMAGE else 'видео'} ({len(busy)})")
    time.sleep(10); go_root(); filter_videos()
# A tile is known by its title and thumbnail; one without a thumbnail yet, by its title.
key_of = lambda x: (x["label"], x["id"] or "")
known = {key_of(x) for x in tiles()}
known_labels = {x["label"] for x in tiles()}
perms_before = js("document.querySelectorAll('flow-permission-message').length") or 0

# 2. The request to Flow's agent.
out("PROGRESS", message="Отправляем запрос во Flow")
xy = center("[...document.querySelectorAll('textarea,[contenteditable=true],[role=textbox]')].find(e=>(e.getAttribute('aria-label')||e.getAttribute('placeholder')||'').includes('Что вы хотите создать'))")
if not xy: fail("Не нашёл поле запроса Flow «Что вы хотите создать?»")
click_at_xy(*xy); wait(.5)
press_key("a", modifiers=2); press_key("Backspace")
def key(ch):
    cdp("Input.dispatchKeyEvent", type="keyDown", key=ch, text=ch, unmodifiedText=ch)
    cdp("Input.dispatchKeyEvent", type="keyUp", key=ch)

CHIPS = "document.querySelectorAll('.mention-chip').length"

def mention(name):
    """@-mention of a Flow character: a real key «@» opens Flow's picker (inserted text does not), the name filters it,
    the character's option inserts a chip bound to the character."""
    before = js(CHIPS) or 0
    # Flow opens its picker only on an «@» after a space or at a line start; a typed trailing space is collapsed, so a real one.
    key(" "); wait(.2)
    key("@"); wait(1.2)
    for ch in name: key(ch)
    wait(1.5)
    nodes = cdp("Accessibility.getFullAXTree")["nodes"]
    for n in nodes:
        nm = n.get("name", {}).get("value", "")
        if n.get("role", {}).get("value") == "option" and nm.startswith(name) and "Персонаж" in nm and n.get("backendDOMNodeId"):
            q = cdp("DOM.getBoxModel", backendNodeId=n["backendDOMNodeId"])["model"]["content"]
            click_at_xy(sum(q[0::2]) / 4, sum(q[1::2]) / 4); wait(1)
            if (js(CHIPS) or 0) > before:
                return
    press_key("Escape")
    fail(f"Во Flow нет персонажа «{name}» (Flow › Персонажи). Создайте его там или поправьте поле «Персонаж в Google Flow».")

# The prompt with its @[Name] marks typed in order: plain text as text, each mark as a real mention.
for i, part in enumerate(re.split(r"@\[([^\]]+)\]", PROMPT)):
    if i % 2:
        mention(part.strip())
    elif part:
        type_text(part)
wait(1)
FIELD = "([...document.querySelectorAll('textarea,[contenteditable=true],[role=textbox]')].find(e=>(e.getAttribute('aria-label')||e.getAttribute('placeholder')||'').includes('Что вы хотите создать'))||{})"
typed = (js(f"({FIELD}.value||{FIELD}.innerText||'').trim().length") or 0)
if typed < 10: fail("Не удалось набрать запрос в поле Flow — кликните по вкладке Flow и повторите.")
press_key("Enter"); wait(2)
# Enter may only add a line in some states of the field: then the send arrow.
if (js(f"({FIELD}.value||{FIELD}.innerText||'').trim().length") or 0) > 10:
    js("[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='arrow_forward')?.click()"); wait(2)
PROMPT_TEXT = re.sub(r"@\[([^\]]+)\]", lambda m: m.group(1), PROMPT)

# 3. Flow asks to spend its credits for each video: approve this one request only.
key = PROMPT_TEXT[:40]
approved = None
approved_text = None
errors = 0
for _ in range(60):
    time.sleep(3)
    perm = js(f"""(()=>{{const p=[...document.querySelectorAll('flow-permission-message')];
      if(p.length<={perms_before}) return null; const last=p[p.length-1];
      const r=[...last.querySelectorAll('[role=radio]')].find(x=>x.getAttribute('aria-label')==='Одобрить');
      return {{title:(last.querySelector('.title')||last).innerText.slice(0,120), full:last.innerText.slice(0,500), open: !!r && r.getAttribute('aria-disabled')!=='true'}}}})()""")
    if perm and perm.get("open"):
        js(f"""(()=>{{const p=[...document.querySelectorAll('flow-permission-message')]; const last=p[p.length-1];
              [...last.querySelectorAll('[role=radio]')].find(x=>x.getAttribute('aria-label')==='Одобрить').click()}})()""")
        approved = perm["title"]; approved_text = perm.get("full") or approved; out("PROGRESS", message=f"Flow: {approved} — одобрено")
        break
    text = js("document.body.innerText") or ""
    k = text.rfind(key)
    tail = text[k + len(PROMPT_TEXT):] if k >= 0 else ""
    # Flow sometimes shows an error and then queues the video anyway: only a refusal, or an error that stays, fails.
    if re.search(r"запущен|очеред|создаю|создаётся|генерирую|генерация изображ|сгенерирован|успешно", tail, re.I):
        break
    if re.search(r"нарушает|не могу", tail):
        fail("Flow отклонил запрос: " + tail.strip().split("\n")[0][:200])
    if re.search(r"Ошибка|не так", tail):
        errors += 1
        if errors >= 5:
            fail("Flow ответил ошибкой «Что-то пошло не так» и не поставил видео в очередь. Бонусы не списаны — попробуйте ещё раз.")
else:
    fail("Flow не ответил на запрос за 3 минуты")

# 4. Wait for the new video in the project and download it.
out("PROGRESS", message=f"Flow создаёт {WHAT}")
start = time.time(); found = None
while time.time() - start < TIMEOUT:
    time.sleep(10)
    go_root(); filter_videos()
    fresh = [x for x in tiles() if key_of(x) not in known and x["label"] not in known_labels]
    bad = [x for x in fresh if x["bad"]]
    done = [x for x in fresh if x["done"] and not x["bad"]]
    if done:
        found = done[0]; break
    if bad:
        fail(f"Flow не смог создать {WHAT} «" + bad[0]["label"][:80] + "»: " + (bad[0].get("why") or "ошибка генерации")[:220])
    out("PROGRESS", message=f"Flow создаёт {WHAT}… {int(time.time() - start)} с")
if not found:
    fail(f"{'Картинка' if IMAGE else 'Видео'} во Flow не появилась за {TIMEOUT // 60} мин. Возможно, оно ещё в очереди — проверьте вкладку Flow.")
out("PROGRESS", message=f"Скачиваем {WHAT} из Flow")
saved = download(found["i"])
go_root()
js("""[...document.querySelectorAll('button')].find(b=>b.innerText.trim().endsWith('Все типы'))?.click()""")
out("RESULT", ok=True, file=saved, label=found["label"], approved=approved, approved_text=approved_text)
