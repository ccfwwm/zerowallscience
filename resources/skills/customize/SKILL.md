---
name: customize
description: Create a ZeroWall specialist or author a project-local skill using the tools ZeroWall actually exposes. Use when the user wants a custom Agent persona, a restricted specialist loadout, a new skill, or changes to an existing project-local skill.
---

# Customize ZeroWall

ZeroWall exposes customization through explicit tools and Settings UI. Python has
no control-plane SDK. Never invent profile, connector, or skill CRUD methods.

## Create a specialist

Use `save_specialist` only when it is advertised in the current session. It is
create-only.

1. Ask what single job the specialist owns and what it must not do.
2. Draft a display name, one-line description, and concise instructions that
   extend ZeroWall's base prompt.
3. Decide whether to inherit project skills/connectors or use explicit
   whitelists. Use exact installed skill names returned by `search_skills`.
   Include connector names only when the user supplied or confirmed them.
4. Show the complete proposal and obtain confirmation before creating it.
5. Call `save_specialist` with `name` and `instructions`; add `description`,
   `model_id`, `skills`, or `connectors` only when intentionally chosen.
6. Report the returned specialist id. Direct the user to
   **Settings → Specialists** for edits, deletion, icons, or later loadout
   changes; no Agent tool performs those mutations.

Omit `skills` and `connectors` to inherit project settings. An empty list is an
explicit zero-access whitelist and is not equivalent to omission.

## Author or update a skill

Load `skill-creator`. For a project-local skill, edit files under:

```text
.zerowall/skills/<skill-name>/SKILL.md
```

Use `read`, `write`, and `edit`. `search_skills` and `use_skill` are discovery
and loading tools, not mutation tools. If a newly created project skill is not
visible immediately, refresh or reopen the project so ZeroWall rebuilds its skill
index.

For a user-wide skill, create the folder in the project first, validate it, then
ask the user to install that folder through **Settings → Skills**. ZeroWall copies
installed skills to its user skill directory; there is no Agent-side publish or
delete interface.

## Boundaries

- Do not modify ZeroWall's SQLite store directly.
- Do not use `python`, `shell`, or `run_in_context` to bypass Settings or tool
  authorization.
- Do not promise conversation identity switching; the user selects specialists
  through ZeroWall's UI.
- Do not claim connector enumeration when no connector-management tool is
  advertised.
