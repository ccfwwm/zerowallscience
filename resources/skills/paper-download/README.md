# paper-trail

> Anti-hallucination plugin for academic research in Claude Code.
> Create literature reviews and papers guaranteed without fabricated
> citations.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](CHANGELOG.md)
[![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-plugin-purple.svg)](https://docs.claude.com/en/docs/claude-code/plugins)

## Why this exists

Citation hallucinations in academic writing — fabricated quotes,
inverted attributions, misidentified authors — are systemic when the
author writes from memory and looks up sources afterward. Retracted
papers from major venues have shown the failure mode is structural,
not anecdotal.

`paper-trail` makes the error **mechanically impossible** by enforcing
a research-first workflow with strict state transitions, automated PDF
acquisition with anti-homonymy validation, and per-citation audit
against the actual source text.

## Features

- **Strict state machine (8 states)** — no reference can be cited
  without traversing acquisition → page 1 validation → claim
  verification
- **Anti-homonymy guard** — page 1 of each downloaded PDF is matched
  against expected author, title, and domain keywords before
  acceptance
- **10-source acquisition cascade** — a supplied URL, Crossref OA, arXiv,
  OpenAlex, Unpaywall, HAL, CORE, the publisher's own page followed from
  the DOI, archive.org, and a WebSearch queue as a last resort
- **Browser routes** (up to 13 sources) — several publishers refuse every
  programmatic client and serve an ordinary browser without difficulty. With
  Playwright and a display, the plugin opens the article itself, and can
  reach author-deposited full texts on ResearchGate using your own session
  cookies. See [`docs/ACQUISITION_HEADFUL.md`](docs/ACQUISITION_HEADFUL.md)
- **Extended sources** (up to 17) — disabled by default and **strict opt-in**
  only, see [`DISCLAIMER.md`](DISCLAIMER.md)
- **19 mechanical invariants** — automated registry health check with
  safe auto-fix for cosmetic drift
- **Inverted writing workflow** — researches and reads first, writes
  last; refuses to draft when source corpus is too thin
- **Per-citation audit** — generates `RECEIPTS.md` classifying each
  citation as VALID / ADJUST / INVALID / UNVERIFIABLE
- **Vault-agnostic** — works with Obsidian, flat markdown, or Zotero
  layouts (adapter pattern)
- **Mechanical coverage guard** — refuses to ship a new version
  without explicit test evidence for each component

## Supported sources

paper-trail's acquisition cascade and search layer cover the major
academic indexing and full-text platforms.

### Open access (default, always enabled)

| Source | Coverage | Used for |
|---|---|---|
| **Crossref** | Cross-domain DOI registry, 150M+ records | DOI lookup, metadata, open-access URL |
| **arXiv** | Preprints (CS, math, physics, q-bio, q-fin, stats, EE) | Full-text PDFs of preprints |
| **OpenAlex** | 200M+ scholarly works, cross-domain aggregator | Metadata, abstracts, citation graph |
| **Unpaywall** | 30M+ free full-text articles | OA PDF discovery |
| **HAL** | French academic repository | Full-text, OA |
| **CORE** | UK-based aggregator, 200M+ OA records | Full-text fallback |
| **archive.org** | Digitized books and articles, Internet Archive | Books, older publications, scans |
| **Semantic Scholar** | AI-curated academic graph, 200M+ papers | Cross-reference, related papers |
| **PubMed / PMC / bioRxiv / medRxiv** | Biomedical, preprints | Biomedical full-text |
| **Zenodo / SSRN / DBLP / DOAJ / BASE / IACR / EuropePMC** | Cross-domain | Additional metadata and full-text |

| Source | Coverage | Activation |
|---|---|---|
| **Sci-Hub** | Paywalled scholarly literature, ~88M papers | `RESEARCH_ENABLE_SHADOW_LIBS=1` |
| **Anna's Archive** | Books and articles, aggregates Library Genesis, Sci-Hub, Z-Library | `RESEARCH_ENABLE_SHADOW_LIBS=1` |
| **Anna's Archive via browser** | Same coverage, when the plain HTTP route is blocked | Above **+** Playwright **+** a display — see [`docs/ACQUISITION_HEADFUL.md`](docs/ACQUISITION_HEADFUL.md) |

Shadow-library activation is **explicit** and **per-session**. A
disclaimer prints to stderr on first use. The user is responsible
for legal compliance in their jurisdiction. See
[`DISCLAIMER.md`](DISCLAIMER.md).

Anna's Archive now answers the plain HTTP route with an anti-bot
challenge, and its file server rejects a headless browser. The browser
route drives a *windowed* Chromium instead — which runs fine in a
container with no screen, inside a virtual display. It adds itself to the
cascade only when Playwright and a display are both present, and says so
on stderr when they are not; everything else keeps working without it.
[`docs/ACQUISITION_HEADFUL.md`](docs/ACQUISITION_HEADFUL.md) has the
container recipe and the scheduled-job command.

### MCP integrations

| MCP | Coverage | Status |
|---|---|---|
| **paper-search MCP** | Unified API over 22 platforms above | **Required** for SOTA writing — install from git (see [`INSTALL.md`](INSTALL.md)) |
| **NotebookLM MCP** | Books corpus (Q&A with citations) | Optional — `RESEARCH_ENABLE_NOTEBOOKLM=1` |
| **RTFM MCP** | Local indexed corpus (code, docs, research) | Optional — failure correlation only |

> ⚠️ **Do not install `paper-search-mcp` from PyPI** — the published
> version (`0.1.3`) is severely outdated (13 / 63 tools, no OpenAlex,
> no Crossref, no Semantic Scholar). Use the git HEAD recipe in
> [`INSTALL.md`](INSTALL.md#install-the-paper-search-mcp-required-for-sota-writing).

## Quick start

### Install

In a Claude Code session:

```
/plugin install file:///path/to/paper-trail
```

Or via marketplace (when published):

```
/plugin marketplace add roomi-fields
/plugin install paper-trail
```

### Configure

`RESEARCH_VAULT_PATH` is **required** — the plugin refuses to start
without it. Set it (and any reusable secret like `S2_API_KEY`) **once**
in `~/.config/paper-trail/env` so every project picks them up
automatically :

```bash
mkdir -p ~/.config/paper-trail
cat > ~/.config/paper-trail/env <<'EOF'
RESEARCH_VAULT_PATH=~/Documents/MyResearch
RESEARCH_CONTACT_EMAIL=you@example.org
S2_API_KEY=s2k-...
EOF
chmod 600 ~/.config/paper-trail/env
```

Per-project shell overrides take priority. For complete configuration,
see [`INSTALL.md`](INSTALL.md).

### Verify install

```bash
python3 -m pipeline preflight
```

Reports vault, Python deps, `paper-search` MCP registration, and any
missing optional secret — with a copy-pastable fix command for each
problem.

### Try it

```
/paper-trail:status              # overview of the registry
/paper-trail:new-sota "your research topic"
/paper-trail:audit-article path/to/your/paper.tex
```

## How it works

Three primary workflows, all enforced by the plugin's state machine
and pre-write hooks:

### Creating a new literature review

```
/paper-trail:new-sota "topic"
```

1. Multi-source search across 22 academic platforms via the
   `paper-search` MCP
2. You select candidate references from proposed matches
3. Automated PDF acquisition with mandatory page 1 anti-homonymy
   validation
4. Structured notes extracted into each reference's markdown body
5. Final SOTA cites **only** references that reached
   `page1_validated` state; rejected candidates are listed with
   reasons

### Auditing an existing literature review or paper

```
/paper-trail:audit-sota path/to/SOTA.md [--purge]
/paper-trail:audit-article path/to/paper.tex [--warn]
```

Classifies each citation, optionally purges hallucinations from the
SOTA (with `.bak` backup), or inserts inline warnings adjacent to
problematic citations in the paper.

### Daily registry maintenance

```
/paper-trail:cascade <slug>      # acquire a specific reference
/paper-trail:doctor [--fix]      # check and repair registry consistency
/paper-trail:reactivate-ocr      # resume OCR-waiting refs
```

## Architecture overview

```
User → 9 slash commands → 6 skills → 4 sub-agents → Worker engine
                                                     ↓
                                                YAML registry
```

- **Skills** orchestrate (Claude Code markdown)
- **Sub-agents** isolate heavy work (PDF reading, search) from main
  context
- **Worker engine** (Python) enforces the FSM, runs the cascade,
  checks invariants — deterministic, testable
- **YAML registry** is the source of truth (one file per reference,
  Obsidian-compatible frontmatter)

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full
diagram and [`pipeline/ARCHITECTURE.md`](pipeline/ARCHITECTURE.md)
for the worker engine internals.

## Documentation

- [`docs/USAGE.md`](docs/USAGE.md) — daily workflows
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system overview
- [`docs/ACQUISITION_HEADFUL.md`](docs/ACQUISITION_HEADFUL.md) — running
  browser-based acquisition in a headless container (virtual display,
  scheduled job)
- [`docs/LEGAL.md`](docs/LEGAL.md) — licensing and attribution
- [`DISCLAIMER.md`](DISCLAIMER.md) — shadow libraries opt-in policy
- [`NOTICE.md`](NOTICE.md) — third-party attributions
- [`CHANGELOG.md`](CHANGELOG.md) — version history

## Configuration via environment variables

| Variable | Default | Purpose |
|---|---|---|
| `RESEARCH_VAULT_PATH` | — (required) | Vault root — plugin refuses to start without it |
| `RESEARCH_SOURCES_PATH` | `$VAULT/10_SOURCES` | PDF directory |
| `RESEARCH_REGISTRY_PATH` | `$SOURCES/_registry` | YAML registry |
| `RESEARCH_VAULT_LAYOUT` | `obsidian` | Adapter (obsidian / flat / zotero) |
| `RESEARCH_RTFM_DB` | unset | Optional RTFM SQLite DB for failure correlation |
| `RESEARCH_CONTACT_EMAIL` | `anonymous@example.org` | Email sent to Crossref, Semantic Scholar (politeness) |
| `S2_API_KEY` | unset | Optional Semantic Scholar API key (stricter rate limit without) |
| `RESEARCH_ENABLE_SHADOW_LIBS` | unset | Enable Anna's Archive & Sci-Hub (opt-in, see DISCLAIMER) |
| `RESEARCH_ANNAS_HEADFUL_BUDGET_S` | `600` | Per-reference time budget for the browser route, in seconds |
| `RESEARCH_BROWSER_COOKIES` | unset | Your own session cookies, exported to a JSON file — enables the ResearchGate route |
| `RESEARCH_BROWSER_PROFILE` | `~/.cache/paper-trail/browser-profile` | Where the shared browser keeps its profile |
| `RESEARCH_LIBGEN_MIRRORS` | built-in list | Comma-separated Library Genesis mirrors to try |
| `RESEARCH_MIN_BOOK_PAGES` | `30` | Page floor below which a file is not the book it claims to be |
| `RESEARCH_ENABLE_NOTEBOOKLM` | unset | Enable NotebookLM in `sota-writer` phase A |
| `RESEARCH_SKIP_END_DOCTOR` | unset | Skip the SessionEnd consistency check |

The `PROJECT_AUTHORS` whitelist used by the Semantic Scholar resolver
(group names treated as anonymous in queries — e.g. "Anonymous", "Group")
is loaded from `$XDG_CONFIG_HOME/paper-trail/project_authors.txt`
(default `~/.config/paper-trail/project_authors.txt`), one entry per line.
The file is optional; if absent the whitelist is empty.

## License

MIT — see [`LICENSE`](LICENSE).

## Acknowledgments

This plugin builds on patterns and components from several open-source
projects in the Claude Code ecosystem. See [`NOTICE.md`](NOTICE.md)
for detailed attributions.

## Contributing

Issues and pull requests welcome at
[github.com/roomi-fields/paper-trail/issues](https://github.com/roomi-fields/paper-trail/issues).
The plugin is in active development; structural changes may happen
between minor versions before v1.0.
