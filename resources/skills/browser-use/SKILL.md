---
name: browser-use
description: "Use this skill to drive the user's real, persistent Chrome/Chromium session — open pages, read them, click, fill and submit forms, navigate, switch tabs, or scrape content that needs the user's existing cookies and login state. Triggers when the user asks to do something in their browser, log into a site and act inside it, fill out a web form, click through a flow, or extract data from a page that requires being signed in. Tools: browser_setup (check/connect the extension), web_open_tab (open a URL), web_scan (read visible content + actionable elements with ready-made selectors), web_execute_js (click/type/navigate, or a JSON command for tabs/CDP), web_screenshot (see what the tab is showing — layout, charts, canvas, QR codes). Not for the built-in read-only web fetch — this is for interacting with a live browser."
fold_cue: "instead_of=guessing-selectors use=web_scan first — it returns a unique CSS selector and rect for every actionable element; never invent selectors"
---

# Browser Use — act inside the user's real Chrome

ZeroWall does **not** launch an automation browser. It talks to a small
extension inside the user's own Chrome/Chromium, so every action runs in
their real profile — existing cookies, logins, extensions, and normal
fingerprint all apply. That is the whole point: you can operate pages the
user is already signed into.

Every `web_scan` and `web_execute_js` call needs the user's approval by
design. Do not treat that as a bug to route around.

## Before anything: confirm the bridge is live

Call `browser_setup`. If `status` is not `connected`, relay its `steps`
(load the unpacked extension from `extension_path`, verbatim) and stop
until the popup shows *Connected to ZeroWall*. Never invent the path.

## The loop

1. **`web_open_tab`** `{url}` — open the page (works even with no tab
   open yet). Returns the new tab id.
2. **`web_scan`** — read the page. Returns `page.text`, `page.title`, and
   `page.elements[]`, where each element carries a **unique `selector`**,
   its visible `text`/`aria_label`, and a `rect` `[x,y,w,h]`. Use these
   selectors directly — do not guess. Use `tabs_only:true` first when you
   are unsure which tab to target; pass `switch_tab_id:<id>` to pin one.
3. **`web_execute_js`** — act, then re-scan to confirm the effect.

## Recipes (`web_execute_js` `script`)

| Goal | script |
|---|---|
| Click | `document.querySelector('<selector>').click()` |
| Type into a field | `const e=document.querySelector('<sel>'); e.value='text'; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}))` |
| Submit a form | click the submit control by its selector, then re-scan |
| Navigate current tab | `location.href='https://example.com'` |
| Read a value | `document.querySelector('<sel>').textContent` |

`script` may instead be a **JSON command**:

| Goal | JSON command |
|---|---|
| Switch to & focus a tab (so the user sees it) | `{"cmd":"tabs","method":"switch","tabId":<id>}` |
| List tabs | `{"cmd":"tabs"}` (or just `web_scan tabs_only`) |
| Close tabs you opened | `{"cmd":"tabs","method":"close","tabIds":[<id>,...]}` — returns `closed` + `remaining` |
| Trusted click when `.click()` is ignored | `{"cmd":"cdp","method":"Input.dispatchMouseEvent","params":{"type":"mousePressed","x":<x>,"y":<y>,"button":"left","clickCount":1}}` then the same with `"type":"mouseReleased"` — use the element's `rect` centre from `web_scan` |

Prefer plain JS. Reach for `cmd:cdp` only when a page blocks synthetic
events or you truly need trusted input.

## Seeing the page — `web_screenshot`

`web_scan` gives text and elements; **`web_screenshot`** gives sight. Use it
when structure isn't enough: rendered layout, a chart or diagram, a
canvas/WebGL page, a QR code, a PDF or image viewer, or a page that looks
broken. It captures the **visible viewport** of the tab — to see below the
fold, scroll first (`web_execute_js` `scrollTo(0, 1200)`) and capture again.
Pass `question` to say what to read out of it, e.g.
`{"question":"is the login QR code visible and not expired?"}`.

It goes through the configured vision model, so `web_scan` stays the cheaper
default — screenshot when you need eyes, not for every step.

## Tab hygiene — track what you open, offer to close it

Browsing tasks (searching papers, opening a dozen results) leave the user
with a pile of tabs to close by hand. So:

1. Every `web_open_tab` returns `tab.id`. **Keep a running list of the ids
   you opened in this task**, in your own message text — e.g. after a batch
   write `opened tabs: 1234, 1235, 1236`. `{"cmd":"tabs"}` cannot tell you
   which tabs are yours, only what exists.
2. When the task is done, before your final answer, **ask the user**:
   name the count and offer to close them, e.g. *"我为这次检索开了 6 个标签
   页，需要我关掉吗？"* Do not close anything without a yes.
3. On a yes, close them in one call:
   `{"cmd":"tabs","method":"close","tabIds":[1234,1235,1236]}`. Report
   `closed`; ids already gone are skipped silently.

Close **only ids you opened yourself**. Tabs the user had open, or ones
they opened during the task, are theirs — never include them, and never
close a tab mid-task that later steps still need.

## Stop conditions (do not automate through these)

- **Human verification / CAPTCHA:** if `web_scan` returns
  `human_intervention.required=true`, stop, ask the user to complete the
  challenge in the visible tab, and wait for their confirmation before
  scanning again.
- **Credentials:** never type passwords, card numbers, or one-time codes
  yourself. If a step needs a password, have the user sign in directly in
  the browser and continue once they confirm.
- **Irreversible / outward actions** (send, pay, post, delete): confirm
  with the user before clicking the control.
- **Downloads:** for multiple-file downloads, first surface the browser
  settings from `browser_setup` (`download_automation`) and wait for the
  user to confirm; until then trigger at most one download.
