# Legal

> Licensing and attribution details. For precise attributions see
> `NOTICE.md`. For shadow libraries see `DISCLAIMER.md`.

## Plugin license

`paper-trail` is distributed under the **MIT License** (see
`LICENSE`).

This means you can:

- Use the plugin for commercial and non-commercial purposes
- Modify, fork, and redistribute it
- Include it in a proprietary product

Subject to:

- Preserving the original copyright notice and the MIT license text
  in all copies or substantial portions

## Imported components

Some components are imported from other projects by the same author,
relicensed under MIT for this repository (see `NOTICE.md` for detail):

- **Worker engine** (`pipeline/`, `tools/`) — originally written for
  a personal project, relicensed MIT
- **PDF acquisition helpers** (`lib/`) — originally written for a
  personal Claude Code plugin, relicensed MIT
- **Writing and audit skills** (`skills/sota-writer`,
  `skills/sota-auditor`, `skills/citation-receipts`,
  `skills/paper-writer`) — originally written for a private academic
  research project, generalized and relicensed MIT

## Inspiration patterns (no code copied)

The following architectural patterns are inspired by third-party
projects, without any line of source code being copied. This
preserves the MIT licensing compatibility of the plugin:

- `Imbad0202/academic-research-skills` (ARS) — CC BY-NC 4.0:
  multi-stage pipeline concept, audit anchors, adapter pattern.
  **No code copied.**
- `Agents365-ai/paper-fetch` — MIT: JSON output format, naming
  convention. Inspiration pattern.
- `JamesWeatherhead/receipts` — MIT: local PDF↔claim audit pattern,
  RECEIPTS.md format. Independent Python reimplementation.
- `fcakyon/phd-skills` — MIT: integrity hooks design.
- `Psypeal/claude-knowledge-vault` — MIT: YAML frontmatter,
  Sci-Hub opt-in pattern.

## Shadow libraries (Anna's Archive, Sci-Hub)

See `DISCLAIMER.md` for full detail.

**Legal summary**:

- Disabled by default
- Explicit activation via `RESEARCH_ENABLE_SHADOW_LIBS=1`
- The user acknowledges legal responsibility according to their
  jurisdiction
- The plugin hosts no copyrighted content
- Traced in the registry (`acquisition_attempts[].via` prefixed with
  `_optin`)

## External MCPs (paper-search, notebooklm, rtfm)

The plugin documents the use of third-party MCP servers
(`paper-search`, `notebooklm`, `rtfm`) that the user configures
independently in their `~/.claude/mcp.json` or `<project>/.mcp.json`.

These MCPs are **not** distributed with paper-trail. The plugin does
not formally depend on their presence (skills operate in degraded
mode without `paper-search`, for example, by prompting the user to
provide references).

## In case of legal question

- For questions about MIT license and attribution: open an issue at
  https://github.com/roomi-fields/paper-trail/issues
- For questions about your use of shadow libraries in your
  jurisdiction: consult a legal professional, do not seek advice via
  the repo issues
