# Where to run browser-based acquisition (`annas_headful` source)

Short answer: **in any headless container**, provided you install a
*virtual display* in it. No desktop machine, no physical screen and no
graphical user session are required.

## The counter-intuitive part

Chromium's "headless" mode **does not work** for this source, even though
it does clear the anti-bot challenge:

| Step | headless | headful under Xvfb |
|---|---|---|
| `/scidb/` or `/md5/` page (DDoS-Guard) | ✅ passes | ✅ passes |
| Partner link obtained | ✅ | ✅ |
| **File download** | ❌ consistent **502** | ✅ **valid PDF** |

It is the *partner file server* that refuses, not the site itself. So a
genuinely windowed browser is needed — but the window can live in an
in-memory framebuffer (Xvfb): invisible, and with no graphics hardware.

## Container recipe (Debian/Ubuntu)

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
      xvfb \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libasound2 fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

RUN pip install playwright && playwright install chromium
```

System package names drift between distribution releases (`libasound2`
became `libasound2t64` on recent ones). To avoid tracking those renames,
let Playwright install what the browser needs itself — only `xvfb` is then
left to add by hand:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends xvfb \
 && rm -rf /var/lib/apt/lists/*
RUN pip install playwright && playwright install --with-deps chromium
```

Launch (a weekly acquisition job, for instance):

```bash
RESEARCH_ENABLE_SHADOW_LIBS=1 \
xvfb-run -a --server-args="-screen 0 1400x1000x24" \
    python -m pipeline run --loop
```

**`RESEARCH_ENABLE_SHADOW_LIBS=1` is not optional**: without it, neither
this source nor the other extended sources enter the cascade — the job runs
without error and never uses the browser. See `DISCLAIMER.md` for what that
activation commits you to.

`xvfb-run -a` picks a free display number, so several jobs can coexist
without stepping on each other.

`--retry-exhausted` (see below) is deliberately absent from this command:
it is a one-off gesture, not a scheduling setting.

## What the browser route covers

With Playwright and a display available, four sources join the cascade. Only
the last two are extended sources gated behind `RESEARCH_ENABLE_SHADOW_LIBS`.

| Source | What it does | Needs |
|---|---|---|
| `publisher_headful` | Opens the article at its DOI and takes the full text | a display |
| `researchgate` | Author-deposited full texts | your session cookies |
| `annas_scidb_optin` | Anna's article reader — no rationed queue | opt-in |
| `annas_headful_optin` | Anna's slot queue — slowest, rationed | opt-in |

All four share **one browser window** for the whole pass. The profile is
persistent, so a cleared anti-bot challenge and any session cookies survive
from one reference to the next. Set `RESEARCH_BROWSER_PROFILE` to move it.

Two details decide whether anything is downloaded at all. The browser must be
**visible** — some file servers answer 502 to an invisible one — and its
profile must be told to **save PDFs instead of displaying them**, otherwise
Chromium opens its built-in viewer and no download ever starts. The plugin
sets both; you only need the virtual display.

### ResearchGate: supplying your session

ResearchGate serves author-deposited full texts only to a signed-in session,
and it checks the client's signature as well as the cookies — replaying them
from a script does not work, which is why this route goes through the browser.

Export the cookies from your own browser to a JSON file (a list of
`{name, value, domain}` objects, as any cookie-export extension produces) and
name it:

```bash
export RESEARCH_BROWSER_COOKIES="$HOME/.config/paper-trail/rg-cookies.json"
```

Without it the source declares itself unavailable and the cascade carries on.
The site throttles insistent visitors: the plugin keeps at least 25 seconds
between two searches (`RESEARCH_RG_SEARCH_GAP_S`) and, when the challenge
closes, returns the reference as a *transient* failure so it is retried later
rather than locked.

## Things to watch for in a container

- **`--no-sandbox`** is already passed by the source (required for Chromium
  in an unprivileged container).
- **`/dev/shm`**: Docker allocates 64 MB by default, which crashes Chromium
  on heavy pages. Run with `--shm-size=1g`.
- **Memory**: budget ~500 MB for Chromium + Xvfb on top of the pipeline.
- **Duration**: "slow download" slots impose roughly twenty seconds of
  waiting per attempt, and the source tries four slots per mirror. Count
  ~2 min per reference in the favourable case, but up to the per-reference
  budget when slots are saturated: `RESEARCH_ANNAS_HEADFUL_BUDGET_S`,
  **600 s by default**. Size the scheduled job's timeout on that budget
  times the number of refs likely to reach this source — not on the 2 min.
  The budget is a hard cap, not an intention: every browser wait is clipped
  to whatever is left of it, and a wall-clock guard cuts the attempt ~30 s
  past the budget even if a download opens and then stalls. You do not need
  an external timeout as a backstop; the reference comes back as a transient
  failure and is retried later.
- **Slot rationing**: past a few dozen files per session, slots get scarce.
  A reference that only hit transient unavailability is not locked: it gets
  a retry date (15 min on the first failure, doubling each time, capped at
  8 h) and the pipeline skips it until then. So it does not resume on the
  next pass, but on the first pass after that date — hence the value of a
  recurring schedule over a single run.
- **`--retry-exhausted`** lifts the automatically-placed cascade exhaustion
  locks so the affected references are retried. Keep it for one-off
  resumptions — after adding a source, for example. In a recurring job it
  replays the full cascade, on every run, over references whose exhaustion
  has already been established; locks placed by a human are left untouched.
- **Quick environment check.** From the plugin root (no environment
  variable is needed for this check alone):

```bash
xvfb-run -a python -c "from lib.shadow.annas_headful import available; print(available())"
# expected:            (True, 'ok')
# without a display:   (False, 'no_display_run_under_xvfb')
# without Playwright:  (False, 'playwright_not_installed')
```

With neither display nor Playwright, the source simply declares itself
unavailable and the cascade carries on without it: the pipeline stays
functional, it just loses that one source.

## Alternative without a graphical container

If operational policy forbids installing a browser in production,
acquisition can run elsewhere (workstation, admin machine, dedicated
container) against the **same shared registry**: the source writes PDFs to
`RESEARCH_SOURCES_PATH` and updates the reference records. Production then
only has to read the registry.
