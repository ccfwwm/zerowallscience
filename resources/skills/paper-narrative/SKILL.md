---
name: paper-narrative
description: Judge and reshape the story told by a manuscript and its figure deck. Use when revising paper structure, testing whether Figure 1 is a hook, ordering figures, moving panels, identifying missing analyses, or defining the claim passed to figure-composer.
license: Apache-2.0
---

# Paper narrative

Use this skill before `figure-composer`. The sidecar only builds schemas and
self-contained reviewer instructions. Model reasoning happens in the current
Agent or an explicitly delegated ZeroWall Agent, never inside Python.

## Workflow

1. Read the abstract, introduction, captions, and concrete figure paths.
2. Build an instruction with `paper_brief_task(...)`. Produce a brief matching
   `paper_brief_schema()` in the current Agent. If `delegate_tasks` is advertised,
   the brief may instead be assigned to one `reasoning` task with a structured
   output schema.
3. Review the entire brief. Preserve supplied `composite_path` values and fix
   unsupported claims before continuing.
4. If the deck is a PDF, use `pdf-explore` to render the relevant pages to local
   images. Pass their concrete paths to `narrative_review_task(...)`.
5. Inspect the images with `view_image`. Optionally delegate one handling-editor
   task with the minimum advertised `reasoning`, `project_read`, and
   `image_inspection` capabilities and `narrative_review_schema()`.
6. Act on the result:
   - use `arc` as the main-figure order;
   - apply `figure_moves`;
   - turn `missing_panels` into explicit analyses;
   - demote or remove the `kill_list`;
   - send `boldest_defensible_fig1` to `figure-composer`.
7. Re-review the revised deck. Converge when the hook verdict is `yes` and no
   figure moves or missing panels remain.

Use `run_in_context` only for deterministic analyses requested by
`missing_panels`. Narrative reasoning and Agent delegation are not Runs.

## Boundaries

- Do not pass artifact markers where a path is required.
- Do not call another model from `python`.
- Do not claim the deck was inspected unless every relevant page was rendered
  and viewed.
