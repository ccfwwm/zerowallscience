---
name: journal-club-ppt
description: "Use this skill whenever the user provides a scientific paper PDF and asks for a group-meeting literature report, journal-club slides, 文献汇报PPT, 组会PPT, paper presentation, article walkthrough, or to explain a paper with PowerPoint. The skill first reconstructs the paper's scientific logic, then builds author/background sections, chooses an evidence-driven slide outline, crops only main-text figure panels from the PDF, and creates an academic PPT with 10–30 slides including title and conclusion/discussion. Always use this skill for '把这篇论文做成PPT', '文献汇报', 'journal club', or '组会汇报', even if the user only says they need slides."
---

# Journal Club PPT — scientific paper → academic group-meeting slides

This skill turns a scientific paper PDF into a claim-driven PPT for lab meeting, journal club, or 文献汇报. The deck must explain the paper's logic, not merely summarize sections or paste screenshots.

Default language: Chinese, with key technical terms preserved in English when helpful. Use another language only if the user asks.

## Hard constraints

1. **Read the argument before designing slides.** Do not create a slide outline until you can state the paper's central question, knowledge gap, hypothesis, experimental/computational strategy, evidence chain, and final claim.
2. **Include author introduction.** At minimum: first author(s), corresponding/senior author(s), affiliations, research direction inferred from the paper, and why this team is relevant to the work. Use external sources only for text facts when available and appropriate; never import external images.
3. **Include background introduction.** Explain the field context as: broad problem → unresolved gap → why this paper matters → what question the paper asks.
4. **Confirm a PPT outline before filling slides unless the user asked for a fully automatic final deck.** The outline must be evidence-driven and include planned figure panels.
5. **Use only figures from the PDF's main text/body.** Do not use web images, stock images, AI-generated images, author photos, journal logos, graphical abstracts, supplementary figures, Extended Data, or figures from other papers unless the user explicitly overrides this constraint.
6. **Select subfigures by logic.** Crop and use only panels that support the narrative. Do not paste whole pages or dump every panel from every figure.
7. **End with evaluation.** The deck must discuss strengths, limitations, unanswered questions, and possible follow-up experiments/analyses.
8. **Slide count is a hard quality gate.** The final PPT must contain **at least 10 and at most 30 slides**, including title and conclusion/discussion slides. Use 10–12 slides for short papers, 14–18 for standard research articles, 19–24 for complex multi-omics or method-heavy papers, and 25–30 only when the paper genuinely needs it.

## ZeroWall-specific workflow

Use ZeroWall's strengths rather than treating the PDF as static screenshots:

- Use PDF text extraction / `pdf-explore`-style helpers when available to read abstract, introduction, results, methods, discussion, captions, author information, and references.
- Use vision on rendered PDF pages to inspect figures, layouts, panel labels, legends, axes, scale bars, and multi-panel structure.
- Use Python to render PDF pages at high DPI, crop selected figure panels, name crops consistently, and build a figure ledger.
- Use ZeroWall's persistent Python runtime to keep intermediate objects: paper outline, figure inventory, selected crop paths, and slide plan.
- Use MCP/web/PubMed/ORCID/lab pages only for textual author/background verification when helpful. External visual assets remain forbidden.

## Phase 1 — Paper logic reconstruction

Before touching the PPT, produce a compact internal `paper_logic` brief:

- **Bibliographic identity:** title, journal/preprint server, year, DOI if present, article type, field.
- **Central problem:** what biological/clinical/computational problem is being addressed?
- **Knowledge gap:** what prior uncertainty or technical bottleneck motivates the work?
- **Main hypothesis or central claim:** one sentence.
- **System and data:** organism/cell type/cohort/dataset/model, sample scale, intervention or comparison.
- **Experimental/computational design:** key assays, models, algorithms, controls, statistics.
- **Evidence chain:** ordered claims from Result 1 → Result 2 → Result N, each mapped to figure panels.
- **Final conclusion:** what becomes more believable after the paper?
- **Scope boundary:** what the paper does *not* prove.

Use the whole paper, especially results opening/closing paragraphs and figure captions. Do not rely only on the abstract.

## Phase 2 — Author and background preparation

### Author slide

Create one author slide unless the user asks for a longer introduction. Prefer facts from the PDF:

- First author(s): role inferred from author order and contribution statement if present.
- Corresponding/senior author(s): affiliation, lab/institute, likely research area from the article and author contribution statement.
- Collaboration structure: single-lab, multi-center, consortium, clinical cohort, computational/experimental partnership.
- Why the author team matters for this paper: access to special cohort, platform, model system, algorithm, or prior expertise.

Avoid unsupported reputation claims such as “国际顶尖专家” unless sourced. If using external textual sources, record source links in speaker notes or a references slide. Do not use author portraits or lab logos unless they are in the PDF body figures and are scientifically relevant, which is rare.

### Background slides

The background must teach enough context for a lab audience to follow the results:

1. Define the biological/technical problem.
2. Explain the state of the field before this paper.
3. Identify the specific gap or controversy.
4. State why the paper's approach is plausible or novel.
5. End with the paper's guiding question.

Use text, simple native PowerPoint shapes, and figure crops from the paper's main text. Do not bring in external review figures.

## Phase 3 — Main-text figure inventory

Build a `figure_ledger` before slide construction. Each row should contain:

- `figure_id`: e.g. `Fig1`, `Fig2`, `Fig3`.
- `panel_id`: e.g. `Fig2b`; use `whole_figure` only when a full figure overview is truly needed.
- `page`: PDF page where it appears.
- `caption_summary`: concise panel meaning from the caption/results text.
- `paper_claim_supported`: which result claim this panel supports.
- `visual_type`: schematic, workflow, microscopy, UMAP, volcano plot, survival curve, bar plot, model architecture, validation experiment, etc.
- `include_decision`: include / maybe / exclude.
- `reason`: why this panel is necessary or redundant.
- `crop_path`: final crop file path if included.

Main-text/body figure rule:

- Include ordinary main figures labeled `Figure 1`, `Fig. 1`, etc. that appear in the article body/results.
- Exclude Supplementary Figures, Figure S*, Extended Data, appendix figures, cover art, graphical abstracts, and reference figures.
- If the article places methods or data availability after the results, still treat only article-body research figures as eligible.
- If a crucial claim depends only on supplementary material, explain that limitation in text rather than importing the supplementary figure.

## Phase 4 — Subfigure selection rules

Select panels by argumentative value. Use the following scoring logic qualitatively:

`include_score = centrality_to_claim + closes_key_gap + method_explanatory_value + visual_readability - redundancy - excessive_detail`

A selected panel should usually satisfy at least one of these:

- It establishes the paper's model/system/workflow.
- It directly supports the central claim.
- It is the strongest positive evidence for a key result.
- It is the most important validation/control.
- It explains a method or dataset that would otherwise be hard to understand.
- It reveals a limitation, caveat, or surprising negative result needed for fair discussion.

Avoid these anti-patterns:

- Using every panel because it exists.
- Full-page screenshots.
- Cropping away axes, legends, scale bars, color bars, sample sizes, statistical marks, or panel labels needed to interpret the result.
- Showing a dense figure without telling the audience exactly what to look at.
- Reusing the same panel multiple times unless one slide is an overview and another is a justified zoom-in.
- Recreating the paper's data as new plots unless the user explicitly asks for reanalysis and provides data.

## Phase 5 — Cropping and figure handling

Use Python to render pages at 200–300 DPI, then crop only the selected panels. Recommended naming:

```text
figures/
  Fig1a_p03_workflow.png
  Fig2c_p06_validation.png
  Fig4f_p11_mechanism.png
figure_ledger.csv
```

Cropping rules:

- Preserve scientific interpretability: axes, legends, labels, scale bars, color bars, panel letters, and statistical annotations should remain visible.
- If a panel letter must be removed for layout, add a clear slide label such as `Fig. 2c` next to the crop.
- Use minimal overlays only: arrows, boxes, translucent highlights, or callouts that guide attention. Do not alter data, labels, colors, or conclusions.
- Combine panels from different figures only when the slide explicitly compares them and every crop is labeled with its source figure.
- Prefer one central crop per result slide; use two to three crops only when the comparison is the point.

## Phase 6 — Deck outline design

The outline must follow the paper's logic rather than the PDF page order. A standard deck:

1. **Title slide** — paper title, journal/year, presenter, group/date.
2. **One-slide takeaway** — the central claim and why the paper matters.
3. **Author/team introduction** — first/corresponding authors, affiliations, team capability.
4. **Background I** — field problem and motivation.
5. **Background II / knowledge gap** — what remained unknown before this study.
6. **Study design / methods overview** — main system, samples, assays, computational workflow.
7. **Result 1** — first major evidence point, selected panel(s).
8. **Result 2** — second major evidence point, selected panel(s).
9. **Result 3** — mechanism, model, validation, or application, selected panel(s).
10. **Integrated model / conclusion** — how the results support the central claim.
11. **Strengths** — novelty, design, controls, data scale, method quality, translational or conceptual value.
12. **Limitations and discussion** — caveats, missing controls, generalizability, reproducibility, follow-up questions.

For papers requiring more than 12 slides, expand by splitting complex result chains, not by adding filler. Every added result slide must answer: “What claim does this slide make more believable?”

## Phase 7 — Slide writing rules

Academic PPT style:

- Use a clean 16:9 layout with restrained colors, high contrast, and generous whitespace.
- Each slide title should be a claim, not a topic label. Prefer “单细胞图谱揭示 X 细胞群扩增” over “Figure 2”.
- Keep body text concise: usually 2–4 bullets or a short explanatory sentence.
- Put interpretation near the figure, not only in speaker notes.
- Use speaker notes for: experimental setup, what each panel shows, how to interpret axes, and caveats.
- Label every crop on slide: `Fig. 3b`, `Fig. 4e–f`, etc.
- Do not overcrowd slides. If the audience cannot read the crop on a projector, split the slide.

Suggested slide structure for a result slide:

- Title: one-sentence claim.
- Left/top: the selected figure crop.
- Right/bottom: “How to read it” and “What it proves”.
- Footer or small label: source panel ID.
- Speaker notes: more detailed explanation and caveat.

## Phase 8 — Strengths, limitations, and discussion

The final discussion must be specific to the paper. Cover both scientific merit and weaknesses:

Strength examples:

- Clear biological question and direct experimental design.
- Strong validation across independent datasets, cohorts, perturbations, or orthogonal assays.
- Appropriate controls and statistical tests.
- Useful resource, method, atlas, or conceptual model.
- Mechanistic evidence rather than only correlation.

Limitation examples:

- Small sample size or biased cohort.
- Confounding factors, batch effects, or insufficient controls.
- Correlative results without perturbation.
- Model organism/cell-line limits.
- Unclear clinical/generalizable relevance.
- Missing benchmark, ablation, reproducibility details, code/data availability, or failure cases.

End with 2–4 discussion questions suitable for group meeting.

## Phase 9 — Deliverables

When generating the final output, produce:

- `deck_outline.md`: slide-by-slide plan with slide title, claim, figure panels, and notes.
- `figure_ledger.csv`: all main-text figures/panels considered and inclusion decisions.
- `figures/`: cropped panels used in the deck.
- `journal_club_ppt.pptx`: final presentation.

In the final response to the user, report:

- PPT file path.
- Slide count.
- Figure panels used.
- Any constraints or missing information, especially if author details were limited to the PDF.

## Self-check before final delivery

Do not deliver until all checks pass:

- [ ] Slide count is 10–30 including title and conclusion/discussion.
- [ ] The first result slide appears only after author/background/method context.
- [ ] Every result slide has a claim title.
- [ ] Every used image is a crop from the PDF's main-text/body figures.
- [ ] No supplementary, Extended Data, web, stock, or AI-generated image is present.
- [ ] The deck uses selected subfigures, not all panels by default.
- [ ] Figure crops are readable and not missing necessary labels/legends/scale bars.
- [ ] The paper's core logic is clear from the slide sequence.
- [ ] Strengths and limitations are specific, not generic.
- [ ] Speaker notes or slide text explain how to read important panels.

## Minimal invocation

```text
Load `journal-club-ppt`.
Paper: @paper.pdf
Make a Chinese academic journal-club PPT for group meeting.
Target length: 15–20 slides unless the paper complexity suggests otherwise.
Use only main-text figure panels from the PDF.
```
