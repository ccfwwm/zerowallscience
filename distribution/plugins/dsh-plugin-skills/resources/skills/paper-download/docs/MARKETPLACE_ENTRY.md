# Marketplace entry for `paper-trail` in `roomi-fields`

Snippet to add to the `plugins` array of
`~/.claude/plugins/marketplaces/roomi-fields/.claude-plugin/marketplace.json`
(or the upstream repo where the marketplace.json lives).

Add the following object as a new entry in the `plugins` array
(after `osc-bridge`) :

```json
{
  "name": "paper-trail",
  "source": {
    "source": "url",
    "url": "https://github.com/roomi-fields/paper-trail.git"
  },
  "description": "Anti-hallucination plugin for academic research. Create State-of-the-Art reviews / papers guaranteed without fabricated citations, audit existing SOTAs/articles (purge or warnings), validate via FSM 8 states + 8-source PDF cascade + page 1 anti-homonymy + 19 invariants. Generic workflow, Obsidian/flat/zotero adapters, optional extended acquisition sources disabled by default (explicit opt-in only).",
  "homepage": "https://github.com/roomi-fields/paper-trail",
  "category": "research",
  "keywords": [
    "anti-hallucination",
    "academic",
    "research",
    "citation-verification",
    "sota",
    "literature-review",
    "pdf-acquisition",
    "obsidian",
    "academic",
    "writing"
  ]
}
```

## Update procedure

```bash
# 1. Open the marketplace repo
cd ~/path/to/roomi-fields-marketplace-repo
# (or where the marketplace.json is checked out as a git repo)

# 2. Edit the .claude-plugin/marketplace.json
# Add the JSON object above to the "plugins" array

# 3. Commit + push
git add .claude-plugin/marketplace.json
git commit -m "Add paper-trail plugin to marketplace"
git push

# 4. Refresh the marketplace cache in Claude Code
/plugin marketplace update roomi-fields
/plugin list --available   # paper-trail should appear
```

## Verification

After adding to the marketplace, any user with the `roomi-fields`
marketplace registered can install via :

```
/plugin install paper-trail
```

The plugin is then available as `/paper-trail:status`,
`/paper-trail:cascade`, etc.

## When to publish

Recommendation: wait for **v0.2** before publishing to the marketplace.
v0.1 is functional but the writing pipeline (sota-writer phases A-D
with all the inverted workflow guards) needs real-world testing before
exposing to a wider audience.

Until then, use locally via `/plugin install file:///path/to/paper-trail`.
