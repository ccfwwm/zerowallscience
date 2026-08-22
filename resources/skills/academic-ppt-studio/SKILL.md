---
name: academic-ppt-studio
description: Build editable, evidence-traceable academic presentations from PDFs, DOCX, PPTX, images, project files, Artifacts, or ZeroWall sessions. Use for academic PPT, thesis defense, research proposal, project review, lecture, journal presentation, scientific slide outline, slide generation, speaker notes, or presentation QA. Produce structured outlines and SlideSpec objects for ZeroWall's native editor; preserve scientific figures and exact numbers instead of burning them into generated images.
---

# Academic PPT Studio

Uploaded PDF, DOCX, PPTX, XLSX, Markdown, CSV, TSV, and JSON files are already parsed by the host. Use their attachment metadata and `read_uploaded_file` for source-ledger extraction before requesting any external conversion.

Create a claim-driven presentation whose text, shapes, tables, charts, notes, and scientific evidence remain editable and traceable. Treat image generation as a visual-asset service, never as the source of scientific facts.

## Required workflow

1. Inspect all supplied materials and build a source ledger before proposing slides.
2. Define the communication job in one sentence: audience, desired outcome, and central takeaway.
3. Build an 8-30 slide outline. Default to 12 slides and 16:9 when the user gives no size.
4. Stop for outline confirmation. Create an immutable outline revision after approval.
5. Generate exactly four materially different style boards. Each board must represent cover, content, evidence/mechanism, and summary compositions.
6. Stop for style selection. Treat the selected board as `approved_style_reference`.
7. Present the price snapshot and balance. Treat this as billing authorization, not a third content review.
8. Create self-contained SlideSpec tasks and visual jobs. Use the configured image model only for backgrounds, illustrations, icons, and non-data visuals.
9. Generate native objects first, then attach visual assets. Keep one image request active per slide.
10. Run scientific, visual, provenance, and editability QA before export.

Do not introduce an extra sample-slide approval after the four-board choice.

## Source ledger

Record each source with:

- stable source or Artifact version identifier;
- display name, page/section/range, and MIME type;
- SHA-256 of original bytes;
- derived-file SHA-256 when conversion is unavoidable;
- allowed use, protected status, and parsing warnings.

Treat experimental plots, statistical charts, microscopy, screenshots, and supplied figures as protected by default. Embed their original bytes as locked `ImageElement` objects. Never ask an image model to redraw them.

## Outline contract

Give every slide exactly one narrative job and one primary claim. Store:

- `role` and conclusion-style `title`;
- 3-5 concise audience-facing points;
- exact `source_refs` and protected assets;
- `visual_intent` and layout role;
- `speaker_note_prompt`;
- transition from the previous slide and need created for the next slide.

Do not invent claims, values, sample sizes, P values, citations, authors, affiliations, or outcomes. Mark unsupported statements as unresolved.

## SlideSpec contract

Emit one self-contained task per slide:

```json
{
  "deck_context": {
    "central_argument": "...",
    "terminology": {},
    "global_sources": [],
    "style_lock": {}
  },
  "local_context": {
    "slide_id": "...",
    "role": "evidence",
    "claim": "...",
    "facts": [],
    "previous_claim": "...",
    "next_claim": "...",
    "speaker_goal": "..."
  },
  "source_assets": [],
  "protected_assets": [],
  "elements": [],
  "visual_jobs": []
}
```

Make every task understandable without parent-conversation context. Include prompt version, selected style version, model Profile, source hashes, and protected-asset rules.

## Native object rules

Render these as editable native objects:

- titles, body copy, conclusions, page numbers, footnotes, and citations;
- tables and basic bar, line, and pie charts;
- shapes, lines, arrows, labels, and simple mechanisms;
- all exact numbers, statistical values, axes, and sample sizes;
- speaker notes and `[Sources]` blocks.

Use generated PNG assets only for complex non-data visuals. Never put final scientific text, numerical conclusions, chart axes, or citations into an image prompt.

## Style selection

Read `references/styles.v1.json` when choosing the four candidates. Prefer styles appropriate to the audience and material; ensure the four candidates differ in layout, palette, density, and image language. Apply user or personal styles ahead of built-ins when present.

Use the style definitions as composition rules, not as fixed page templates. Vary adjacent slide silhouettes while preserving typography, palette, spacing, and image treatment.

## Speaker notes and citations

Write a concise talk track for every slide. Append a `[Sources]` block for every externally sourced non-trivial claim and asset. Include source title, page or range, Artifact version when applicable, and SHA-256.

## QA gates

Block export when:

- a protected asset is missing or its original hash changed;
- an exact value cannot be traced to a source;
- the PPTX package is invalid or relationships/media are missing;
- text overflows, important objects are clipped, or editable coverage is below the configured threshold.

Warn, but allow explicit user override, for minor visual consistency or optional compatibility findings.

Check all slides for overlap, clipping, title wrapping, minimum sizes, contrast, image clarity, source completeness, notes, and editable coverage. Default minimum sizes are 50 pt deck title, 35 pt slide title, 24 pt subheading, and 16 pt body.

## Concurrency and recovery

Honor the product scheduler. Configure 1-10 workers; default to `min(slide_count, 10)`. Cap four-board preview at four active requests. On 429, follow `Retry-After`, temporarily lower effective concurrency, and recover gradually without changing the user's saved value.

Do not retry authentication, disabled-model, or insufficient-balance failures. Mark an issued request with an unknown result as `uncertain` to avoid duplicate billing.

## Output

Return the editable presentation, document snapshot, visual assets, source ledger, and QA report as ZeroWall Artifacts. Re-open the exported PPTX in the built-in preview before reporting success.
