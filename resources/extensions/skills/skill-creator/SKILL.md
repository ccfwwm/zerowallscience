---
name: skill-creator
description: Create, update, validate, and evaluate ZeroWall skills. Use when authoring a project-local or installable skill, refining its trigger description, adding deterministic scripts or Python sidecars, or testing whether another Agent can follow the workflow.
---

# Create ZeroWall skills

Author project-local skills under `.zerowall/skills/<name>/`. ZeroWall also discovers
bundled skills, user-installed skills, and paths configured by
`ZEROWALL_SKILLS_PATH`, but only normal project paths are directly writable through
Agent file tools.

## Structure

```text
<skill-name>/
├── SKILL.md
├── kernel.py              # optional pure helper definitions
├── scripts/               # optional standalone deterministic programs
├── references/            # optional detailed domain material
└── assets/                # optional output templates or static inputs
```

Keep `SKILL.md` concise. Put triggering information in frontmatter
`description`; put essential procedure in the body; move detailed variants to
one-level-deep references. Add only resources the workflow actually uses.

## Workflow

1. Define concrete user requests that should trigger the skill and the expected
   outputs.
2. Search existing skills before creating a duplicate.
3. Choose a lowercase hyphenated name and create
   `.zerowall/skills/<name>/SKILL.md` with `write`.
4. Add reusable scripts before writing long inline code examples. Execute every
   new script on representative local data.
5. Add `kernel.py` only for small reusable Python helpers. Loading a skill does
   not inject ZeroWall tools into Python. The rendered skill supplies a one-time
   `exec(compile(open(...)))` instruction that defines the sidecar names in the
   persistent `python` kernel.
6. Validate structure with this skill's
   `scripts/quick_validate.py <skill-directory>`.
7. Refresh or reopen the project if the new skill does not yet appear, then find
   it with `search_skills` and load it with `use_skill`.
8. Exercise the skill on realistic tasks. When explicit ZeroWall delegation is
   available, use a fresh bounded task with only the skill path and user-style
   request; do not leak the expected answer into the evaluation prompt.

For a user-wide installation, ask the user to install the validated folder via
**Settings → Skills**. There is no Agent-side publish, overwrite, or delete API.

## Frontmatter

At minimum include:

```yaml
---
name: my-skill
description: Perform X. Use when the user asks for Y, Z, or related output.
---
```

The folder name and `name` should match. The description is the primary trigger;
state both what the skill does and when it should be selected.

## Python sidecar rules

Keep top-level code definition-only:

- allow imports, function definitions, and literal constant assignments;
- defer optional third-party imports into function bodies;
- do not run work, access the network, or modify files at load time;
- do not depend on injected Agent, Run, credential, artifact, or model objects;
- pass paths and configuration explicitly;
- use `python` to call helpers after the one-time loader instruction.

Use `scripts/` instead when a helper is a standalone CLI, exceeds roughly one
hundred lines, needs argument parsing, or should run through `run_in_context`.

## Evaluation resources

Use the bundled scripts only when their extra rigor is useful:

- `scripts/run_eval.py` for test prompts;
- `scripts/aggregate_benchmark.py` for repeated result aggregation;
- `scripts/generate_report.py` and `eval-viewer/` for human review;
- `scripts/improve_description.py` for trigger-description experiments;
- `scripts/package_skill.py` to package a validated skill folder.

Inspect each script's CLI help before running it. Keep evaluation artifacts out
of the skill folder unless they are intentional reusable resources.

## ZeroWall boundaries

- `search_skills` and `use_skill` do not edit the catalog.
- Project file tools cannot manage user-wide installed skills outside granted
  workspace paths.
- `run_in_context` executes deterministic work; it does not publish skills or
  call models.
- Specialist creation is separate. Load `customize` and use
  `save_specialist` only when that explicit tool is advertised.
