# Optional browser test. Needs: pip install playwright && playwright install chromium
# Start the app first (demo mode, no API key): PORT=3111 npm start
# Then: python3 e2e/ui_test.py   (set VELNOR_URL to test another address)
# Note: the server allows 12 generations/minute per IP, so wait a minute between runs.
import os; os.makedirs("e2e-shots", exist_ok=True)
import json, sys
from playwright.sync_api import sync_playwright

import os
URL = os.environ.get("VELNOR_URL", "http://localhost:3111/")
results = []
def check(name, cond, extra=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if extra and not cond else ""))

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1366, "height": 900}, permissions=["clipboard-read", "clipboard-write"])
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    page.goto(URL, wait_until="domcontentloaded")
    page.wait_for_selector("#modeBadge[data-mode='demo']", timeout=8000)

    check("demo badge visible and labeled", "Demo mode" in page.inner_text("#modeBadge"))
    check("empty state shown", "Nothing generated yet" in page.inner_text("#output"))
    check("platform/tone/duration chips rendered", page.locator("#platformChips input").count() == 4 and page.locator("#toneChips input").count() == 7 and page.locator("#durationChips input").count() == 5)
    check("language select populated", page.locator("#language option").count() >= 5)
    page.screenshot(path="./e2e-shots/01-empty.png")

    # validation
    page.click("#generateBtn")
    check("short idea shows inline error", "few words" in page.inner_text("#ideaError"))

    # example chip fills idea
    page.click(".example >> nth=0")
    check("example fills idea", len(page.input_value("#idea")) > 10)

    # generate
    page.fill("#idea", "Why old film cameras are making a comeback with Gen Z")
    page.click("label[for='tone-Energetic']")
    page.click("label[for='duration-45']")
    page.click("#generateBtn")
    page.wait_for_selector(".result", timeout=10000)
    check("result rendered", page.locator(".beat").count() >= 5, f"beats={page.locator('.beat').count()}")
    check("5 title rows", page.locator(".title-row").count() == 5)
    check("hook non-empty", len(page.input_value(".edit-hook")) > 10)
    check("demo notice shown on result", "built from templates, not AI" in page.inner_text(".notice"))
    check("all 6 sections present", all(page.locator(f"#{i}").count() == 1 for i in ["s-hook","s-script","s-titles","s-caption","s-sound","s-edit"]))
    check("editing blueprint mentions DaVinci Resolve", "DaVinci Resolve" in page.inner_text("section[aria-labelledby='s-edit']"))
    check("status says Not saved", page.inner_text(".dirty") == "Not saved")
    page.screenshot(path="./e2e-shots/02-result-top.png")
    page.locator("#s-script").scroll_into_view_if_needed()
    page.screenshot(path="./e2e-shots/03-script.png")

    # edit hook then copy hook
    page.fill(".edit-hook", "My edited hook line")
    page.click("section[aria-labelledby='s-hook'] .copy")
    clip = page.evaluate("navigator.clipboard.readText()")
    check("copy hook copies the EDITED text", clip == "My edited hook line", clip)

    # copy a single title
    t3 = page.input_value(".title-row >> nth=2 >> textarea")
    page.click(".title-row >> nth=2 >> .copy")
    check("single title copy", page.evaluate("navigator.clipboard.readText()") == t3)

    # edit a title and verify copy-all titles includes edit
    page.fill(".title-row >> nth=0 >> textarea", "EDITED TITLE ONE")
    page.click("section[aria-labelledby='s-titles'] .block-head .copy")
    check("copy all titles has edited title", "1. EDITED TITLE ONE" in page.evaluate("navigator.clipboard.readText()"))

    # edit script time and strip updates; timeline strip count
    check("timeline strip has one button per script row", page.locator(".strip button").count() == page.locator(".beat").count())
    page.click(".strip button >> nth=2")  # should not throw

    # hashtags edit
    page.fill("section[aria-labelledby='s-caption'] textarea[aria-label='Hashtags']", "#one #two, three")
    page.click("section[aria-labelledby='s-caption'] .block-head .copy")
    cb = page.evaluate("navigator.clipboard.readText()")
    check("hashtag edit normalised and copied with caption", cb.endswith("#one #two #three"), cb[-40:])

    # copy all
    page.click(".result-bar .copy")
    allc = page.evaluate("navigator.clipboard.readText()")
    check("copy-all contains every section", all(k in allc for k in ["OPENING HOOK","SCRIPT","TITLE OPTIONS","CAPTION","HASHTAGS","MUSIC","SOUND EFFECTS","DAVINCI RESOLVE EDITING BLUEPRINT"]))
    check("copy-all contains edits", "My edited hook line" in allc and "EDITED TITLE ONE" in allc)

    # save project
    page.fill(".result-bar .name", "Film cameras comeback")
    page.click(".result-bar button:has-text('Save project')")
    check("status Saved after save", page.inner_text(".dirty") == "Saved")
    check("saved list shows project", "Film cameras comeback" in page.inner_text("#libList"))
    check("saved count = 1", page.inner_text("#countProjects") == "1")
    check("history count = 1", page.inner_text("#countHistory") == "1")

    # edit after save -> unsaved changes
    page.fill(".edit-hook", "Another edit")
    check("edit after save flags Unsaved changes", page.inner_text(".dirty") == "Unsaved changes")
    page.click(".result-bar button:has-text('Save project')")

    # regenerate (accept confirm dialogs)
    page.on("dialog", lambda d: d.accept())
    old_hook = page.input_value(".edit-hook")
    page.click(".result-bar button:has-text('Regenerate')")
    for _ in range(40):
        if page.locator(".edit-hook").count() and page.input_value(".edit-hook") != "Another edit":
            break
        page.wait_for_timeout(200)
    new_hook = page.input_value(".edit-hook")
    check("regenerate replaces content", new_hook != old_hook)
    check("regenerate adds to history", page.inner_text("#countHistory") == "2")
    check("regenerated saved project flagged unsaved changes", page.inner_text(".dirty") == "Unsaved changes")

    # persistence across reload
    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector("#modeBadge[data-mode='demo']")
    check("saved project persists after reload", "Film cameras comeback" in page.inner_text("#libList"))
    check("prefs restored (Energetic, 45s)", page.is_checked("input[name='tone'][value='Energetic']") and page.is_checked("input[name='duration'][value='45']"))

    # open saved project -> returns the SAVED edits ("Another edit")
    page.click(".lib-open >> nth=0")
    page.wait_for_selector(".result")
    check("open saved project restores edited hook", page.input_value(".edit-hook") == "Another edit")
    check("form refilled from project", "film cameras" in page.input_value("#idea").lower())

    # history tab + search
    page.click("#tabHistory")
    check("history lists 2 items", page.locator("#libList .lib-item").count() == 2)
    page.fill("#searchInput", "zzzznomatch")
    check("search no-match message", "No history match" in page.inner_text("#libList"))
    page.fill("#searchInput", "film cameras")
    check("search finds history", page.locator("#libList .lib-item").count() == 2)
    page.click("#tabProjects")
    check("search applies to saved tab", page.locator("#libList .lib-item").count() == 1)
    page.fill("#searchInput", "")

    # delete saved project
    page.click("#libList .lib-del >> nth=0")
    check("delete saved project", page.inner_text("#countProjects") == "0" and "Nothing saved yet" in page.inner_text("#libList"))

    # error state: server 500
    page.route("**/api/generate", lambda r: r.fulfill(status=502, content_type="application/json", body=json.dumps({"error": "The AI provider rejected the API key. Check the key on the server."})))
    page.fill("#idea", "A brand new idea about espresso")
    page.click("#generateBtn")
    page.wait_for_selector(".state-error")
    check("API error shown with message", "rejected the API key" in page.inner_text(".state-error"))
    page.screenshot(path="./e2e-shots/04-error.png")
    page.unroute("**/api/generate")
    page.click("text=Try again")
    page.wait_for_selector(".result", timeout=8000)
    check("Try again recovers", page.locator(".result").count() == 1)

    # network failure
    page.route("**/api/generate", lambda r: r.abort())
    page.click("#generateBtn")
    page.wait_for_selector(".state-error")
    check("network failure shows clear error", "Could not reach the server" in page.inner_text(".state-error"))
    page.unroute("**/api/generate")

    # loading state + cancel (slow response)
    held = []
    page.route("**/api/generate", lambda r: held.append(r))
    page.click("#generateBtn")
    page.wait_for_selector(".state.loading", timeout=3000)
    check("loading state visible", page.locator(".skel").count() >= 3)
    check("button disabled while loading", page.is_disabled("#generateBtn"))
    check("loading text shown on button", "Generating" in page.inner_text("#generateBtn"))
    page.screenshot(path="./e2e-shots/05-loading.png")
    # cancel while loading
    page.click(".state.loading button:has-text('Cancel')")
    check("cancel leaves loading state", page.locator(".state.loading").count() == 0 and not page.is_disabled("#generateBtn"))
    page.unroute("**/api/generate")

    real=[e for e in errors if "ERR_NAME_NOT_RESOLVED" not in e and "502" not in e and "ERR_FAILED" not in e]
    check("no unexpected console/page errors (offline font fetches and deliberately injected failures ignored)", not real, str(real[:3]))
    ctx.close()

    # mobile
    m = b.new_context(viewport={"width": 390, "height": 800}, is_mobile=True, has_touch=True)
    mp = m.new_page()
    merrs = []
    mp.on("pageerror", lambda e: merrs.append(str(e)))
    mp.goto(URL, wait_until="domcontentloaded")
    mp.wait_for_selector("#modeBadge[data-mode='demo']")
    check("mobile: rail hidden off-screen", mp.evaluate("document.querySelector('#rail').getBoundingClientRect().right <= 0"))
    mp.click("#menuBtn")
    mp.wait_for_timeout(400)
    check("mobile: drawer opens", mp.evaluate("document.querySelector('#rail').getBoundingClientRect().left >= 0"))
    mp.click("#railClose"); mp.wait_for_timeout(400)
    mp.fill("#idea", "How to color grade a night street scene")
    mp.click("#generateBtn")
    mp.wait_for_selector(".result", timeout=8000)
    check("mobile: no horizontal overflow", mp.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), str(mp.evaluate("document.documentElement.scrollWidth")))
    mp.screenshot(path="./e2e-shots/06-mobile-result.png")
    mp.screenshot(path="./e2e-shots/07-mobile-top.png", full_page=False)
    check("mobile: no page errors", not merrs, str(merrs[:2]))
    m.close(); b.close()

bad = [n for n, ok in results if not ok]
print(f"\n{len(results)-len(bad)}/{len(results)} UI checks passed")
sys.exit(1 if bad else 0)
