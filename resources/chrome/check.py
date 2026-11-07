# Проверка «Google в Chrome» для USP Stories: подключение к Chrome, открытый проект Google Flow, вход в Google.
# Ничего не открывает и не создаёт. Запуск: browser-harness < check.py
#   FLOW_PROJECT — адрес проекта Flow из настроек (пусто: любая вкладка проекта)
import json, os

PROJ = os.environ.get("FLOW_PROJECT", "").strip().rstrip("/")
res = {"chrome": False, "flowTabs": [], "flowMatch": None, "geminiTab": False, "signedIn": None}
try:
    targets = cdp("Target.getTargets")["targetInfos"]
    res["chrome"] = True
    pages = [t for t in targets if t["type"] == "page"]
    flow = [t for t in pages if t["url"].startswith("https://flow.google.com/project/")]
    res["flowTabs"] = [{"url": t["url"].split("?")[0], "title": t.get("title", "")} for t in flow]
    match = [t for t in flow if not PROJ or t["url"].startswith(PROJ)]
    res["flowMatch"] = match[0]["url"].split("?")[0] if match else None
    res["geminiTab"] = any("gemini.google.com" in t["url"] for t in pages)
    try:
        cookies = cdp("Storage.getCookies").get("cookies", [])
        res["signedIn"] = any(c.get("name") in ("SID", "__Secure-1PSID", "__Secure-3PSID") and "google.com" in c.get("domain", "") for c in cookies)
    except Exception as e:
        res["signedIn"] = None
except Exception as e:
    res["error"] = str(e)[:300]
print("RESULT " + json.dumps(res, ensure_ascii=False))
