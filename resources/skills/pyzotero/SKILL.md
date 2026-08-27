---
name: pyzotero
description: Interact with Zotero reference management libraries using the pyzotero Python client. Retrieve, create, update, and delete items, collections, tags, and attachments via the Zotero Web API v3. Use this skill when working with Zotero libraries programmatically, managing bibliographic references, exporting citations, searching library contents, uploading PDF attachments, or building research automation workflows that integrate with Zotero.
allowed-tools: read write edit search grep shell python r search_mcp_tools run_in_context get_run monitor_run cancel_run
license: MIT License
compatibility: Requires Python 3.10+ and pyzotero 1.13+. Web API access needs a Zotero API key. Optional CLI and MCP extras require Zotero 7 with local API access enabled.
metadata:
  version: "1.1"
  skill-author: K-Dense Inc.
  openclaw:
    primaryEnv: ZOTERO_API_KEY
    envVars:
    - name: ZOTERO_API_KEY
      required: true
      description: Zotero API key.
    - name: ZOTERO_LIBRARY_ID
      required: true
      description: Zotero library id.
    - name: ZOTERO_LIBRARY_TYPE
      required: false
      description: 'Zotero library type: ''user'' or ''group'' (default ''user'').'
source:
  project: scientific-agent-skills
  version: "2.63.0"
  commit: "13385c7c4db02fdcc84a020752c07cce91ef780e"
  license: MIT
zerowall:
  schema_version: 1
  domains: [bioinformatics]
  research_stages: [retrieval]
  roles: [retrieval]
  evidence_types: [omics]
  outputs: [analysis-module]
  side_effects: external_service
---

## ZeroWall execution contract

These host rules override upstream examples when they differ:

- Use ZeroWall tools by their actual names: `read`, `write`, `edit`, `search`, `grep`, `shell`, `python`, `r`, `search_mcp_tools`, `run_in_context`, `get_run`, `monitor_run`, and `cancel_run`.
- Use `python` or `r` for short interactive work. Use `run_in_context` plus `monitor_run` for training, GPU, Nextflow, batch, remote, or otherwise long-running work; do not extend the ordinary `shell` timeout.
- Resolve credentials only through **Settings > Credentials** and the approved execution-context environment. Never create, scan, or load project `.env` files and never print or persist secret values.
- Treat network calls, cloud jobs, experiment submissions, writes, deletion, and physical equipment actions as approval-gated. Default to read-only inspection, validation, or dry-run planning until the user explicitly requests execution.
- Do not install runtimes or dependencies automatically. When Python, R, Node, CUDA, MATLAB, containers, or a third-party CLI is unavailable, report `missing_runtime` with the exact requirement.
- Use `pathlib`, project-relative paths, and platform temporary directories. Gate Unix-only commands behind an explicit WSL/SSH execution context.
- Current companion capabilities take precedence over upstream names: `publication-figures`, `figure-style`, `paper-to-report`, `literature-review`, `citation-reviewer`, `probe-compute-environment`, `zerowall-ppt`, `generate_image`, and bundled MCP tools discovered with `search_mcp_tools`.

# Pyzotero

Pyzotero is a Python wrapper for the [Zotero API v3](https://www.zotero.org/support/dev/web_api/v3/start). Use it to programmatically manage Zotero libraries: read items and collections, create and update references, upload attachments, manage tags, and export citations.

**Current upstream:** pyzotero 1.13.0 (PyPI, May 2026). Docs: [pyzotero.readthedocs.io](https://pyzotero.readthedocs.io/en/latest/).

## Authentication Setup

**Required credentials** — get from https://www.zotero.org/settings/keys:
- **User ID**: shown as "Your userID for use in API calls"
- **API Key**: create at https://www.zotero.org/settings/keys/new
- **Library ID**: for group libraries, the integer after `/groups/` in the group URL

Store credentials in ZeroWall Settings > Credentials. The approved execution
context injects these environment variables without writing a project file:
```
ZOTERO_LIBRARY_ID=your_user_id
ZOTERO_API_KEY=your_api_key
ZOTERO_LIBRARY_TYPE=user  # or "group"
```

See [references/authentication.md](references/authentication.md) for full setup details.

## Installation

```bash
uv add pyzotero              # Web API client
uv add "pyzotero[cli]"       # + local CLI (Zotero 7)
uv add "pyzotero[mcp]"       # + MCP server for LLM clients (Zotero 7)
```

## Quick Start

```python
import os
from pyzotero import Zotero

zot = Zotero(
    library_id=os.environ['ZOTERO_LIBRARY_ID'],
    library_type=os.environ.get('ZOTERO_LIBRARY_TYPE', 'user'),
    api_key=os.environ['ZOTERO_API_KEY'],
)

# Retrieve top-level items (returns 100 by default)
items = zot.top(limit=10)
for item in items:
    print(item['data']['title'], item['data']['itemType'])

# Search by keyword
results = zot.items(q='machine learning', limit=20)

# Retrieve all items (use everything() for complete results)
all_items = zot.everything(zot.items())
```

## Core Concepts

- A `Zotero` instance is bound to a single library (user or group). All methods operate on that library.
- Item data lives in `item['data']`. Access fields like `item['data']['title']`, `item['data']['creators']`.
- Pyzotero returns 100 items by default (API default is 25). Use `zot.everything(zot.items())` to get all items.
- Write methods return `True` on success or raise a `ZoteroError`.

## Reference Files

| File | Contents |
|------|----------|
| [references/authentication.md](references/authentication.md) | Credentials, library types, local mode |
| [references/read-api.md](references/read-api.md) | Retrieving items, collections, tags, groups |
| [references/search-params.md](references/search-params.md) | Filtering, sorting, search parameters |
| [references/write-api.md](references/write-api.md) | Creating, updating, deleting items |
| [references/collections.md](references/collections.md) | Collection CRUD operations |
| [references/tags.md](references/tags.md) | Tag access and management |
| [references/files-attachments.md](references/files-attachments.md) | File download and attachment uploads |
| [references/exports.md](references/exports.md) | BibTeX, CSL-JSON, bibliography export |
| [references/pagination.md](references/pagination.md) | follow(), everything(), generators |
| [references/full-text.md](references/full-text.md) | Full-text content indexing and access |
| [references/saved-searches.md](references/saved-searches.md) | Saved search management |
| [references/cli.md](references/cli.md) | Command-line interface (local Zotero 7) |
| [references/mcp.md](references/mcp.md) | MCP server for LLM clients (local Zotero 7) |
| [references/error-handling.md](references/error-handling.md) | Errors and exception handling |

## Common Patterns

### Fetch and modify an item
```python
item = zot.item('ITEMKEY')
item['data']['title'] = 'New Title'
zot.update_item(item)
```

### Create an item from a template
```python
template = zot.item_template('journalArticle')
template['title'] = 'My Paper'
template['creators'][0] = {'creatorType': 'author', 'firstName': 'Jane', 'lastName': 'Doe'}
zot.create_items([template])
```

### Export as BibTeX
```python
zot.add_parameters(format='bibtex')
bibtex = zot.top(limit=50)
# bibtex is a bibtexparser BibDatabase object
print(bibtex.entries)
```

### Local mode (read-only, no API key needed)
```python
zot = Zotero(library_id='123456', library_type='user', local=True)
items = zot.items()
```

### Local Zotero 7 (CLI or MCP, no API key)

For searching a locally running Zotero desktop app (including full-text PDF search), use the CLI or MCP server instead of the Web API. Both require Zotero 7 with local API access enabled. See [references/cli.md](references/cli.md) and [references/mcp.md](references/mcp.md).
