---
name: figure-composer
description: Compose or improve a publication-grade multi-panel scientific figure from a claim, concrete data paths, or an existing image. Use for figure outlining, parallel panel rendering, exact-grid composition, visual inspection, and adversarial figure review. Use figure-style for one standalone plot and paper-narrative for whole-paper figure ordering.
license: Apache-2.0
---

# Figure composer

Load `figure-style` with this skill. The sidecar provides pure geometry,
composition, task-building, and review-schema helpers. It does not call models,
delegate Agents, resolve artifacts, or inspect images from Python.

## Inputs

Require a one-sentence claim, target width in millimetres, and concrete
project-relative or absolute data paths. Never use artifact ids as paths. For an
existing figure, inspect the real image with `view_image` and write the outline
yourself; pixels cannot reveal the source data path.

## Workflow

1. Build an outline matching `figure_outline_schema()`. Put real paths in
   `data_path`; use `null` for schematics.
2. Make panel `a` the conceptual hook and panel `b` the primary evidence. Use a
   12-column grid and one row per sub-claim.
3. Build one instruction per panel with `panel_task(...)`.
4. If `delegate_tasks` is advertised, submit the independent panel tasks as one
   batch. Grant each task the minimum advertised capabilities needed, normally
   `visualization` plus `project_read`. Require a concrete PNG filename in each
   output schema. If delegation is unavailable, render the panels sequentially
   with `python`.
5. Compose returned paths with `compose_figure(...)`. Do not pass placeholder
   markers to the composer.
6. Use `compose_crops(...)` with Pillow to save temporary crop files, then call
   `view_image` on the composite and every crop. Fix seams, clipped labels,
   aliases, empty space, and misplaced panel letters before review.
7. Build one reviewer instruction with `composite_review_task(...)`. Delegate it
   with `image_inspection`, `project_read`, and `reasoning` when those capability
   ids are advertised; otherwise perform the review in the current Agent.
8. Apply outline revisions and regenerate only affected panels. Stop after three
   rounds or when there are no blockers and at most two major findings.

## Outline example

```json
{
  "claim": "Treatment restores the disease-associated trajectory.",
  "width_mm": 180,
  "ncol": 12,
  "row_heights_mm": [42, 60],
  "panels": [
    {
      "letter": "a",
      "role": "schematic",
      "row": 0,
      "col": 0,
      "colspan": 12,
      "chart_family": "study schematic",
      "message": "The experiment tests trajectory rescue.",
      "data_path": null,
      "ask": "Show cohorts, treatment, sampling, and comparison."
    },
    {
      "letter": "b",
      "role": "primary",
      "row": 1,
      "col": 0,
      "colspan": 12,
      "chart_family": "trajectory plot",
      "message": "Treatment moves cells toward the healthy trajectory.",
      "data_path": "results/trajectory.csv",
      "ask": "Plot disease, treated, and healthy cells with confidence bands."
    }
  ]
}
```

## Boundaries

- Use `delegate_tasks` only as an explicit ZeroWall tool; never call delegation from
  `python`.
- Use `view_image` only on a concrete local image file.
- Keep data preparation in normal project files. Use `run_in_context` only when
  a deterministic render or preprocessing job is long enough to require a
  persisted Run; Agent delegation itself is not a Run.
- Save the accepted composite to a stable project path and report that path.
