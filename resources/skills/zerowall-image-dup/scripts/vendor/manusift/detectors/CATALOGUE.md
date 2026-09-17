# Detector Catalogue

R-2026-06-20 (CDE-D1): generated from the live `manusift.detectors` entry-point registry.

Each detector exposes a `Finding` with a deterministic `detector_id` (the entry-point name). Findings roll up to a per-detector report section.

**Layering (pipeline vs agent-only vs EXCLUDED):** see
[`docs/DETECTOR_LAYERS.md`](../../docs/DETECTOR_LAYERS.md) — capability
owners, `image_dup` vs `imagehash_*`, `panel_dup` vs `panel_duplicate`,
and why `table_forensics` is not in the offline pipeline.

## Index

- [`ai_generated_figure`](#ai-generated-figure)
- [`author_emails`](#author-emails)
- [`chart_data_extract`](#chart-data-extract)
- [`citation_network`](#citation-network)
- [`cited_retraction`](#cited-retraction)
- [`compliance`](#compliance)
- [`cross_paper_image`](#cross-paper-image)
- [`data_availability_concern`](#data-availability-concern)
- [`figure_grim`](#figure-grim)
- [`figure_stat_text`](#figure-stat-text)
- [`figure_table_consistency`](#figure-table-consistency)
- [`figure_table_ocr`](#figure-table-ocr)
- [`forest_plot`](#forest-plot)
- [`image_dup`](#image-dup)
- [`image_forensics`](#image-forensics)
- [`image_noise_inconsistency`](#image-noise-inconsistency)
- [`image_sift_copymove`](#image-sift-copymove)
- [`image_ssim`](#image-ssim)
- [`image_statistics`](#image-statistics)
- [`imagehash_ahash`](#imagehash-ahash)
- [`imagehash_dhash`](#imagehash-dhash)
- [`imagehash_phash`](#imagehash-phash)
- [`imagehash_whash`](#imagehash-whash)
- [`metadata`](#metadata)
- [`page_raster_dup`](#page-raster-dup)
- [`panel_dup`](#panel-dup)
- [`panel_duplicate`](#panel-duplicate)
- [`paper_mill_authorship`](#paper-mill-authorship)
- [`paper_mill_template`](#paper-mill-template)
- [`pdf_metadata`](#pdf-metadata)
- [`ref_duplicate`](#ref-duplicate)
- [`ref_format_anomaly`](#ref-format-anomaly)
- [`source_data_consistency`](#source-data-consistency)
- [`stat_corr_psd`](#stat-corr-psd)
- [`stat_grim`](#stat-grim)
- [`stat_percent`](#stat-percent)
- [`stat_pvalue`](#stat-pvalue)
- [`stat_pvalue_pileup`](#stat-pvalue-pileup)
- [`stat_sprite`](#stat-sprite)
- [`supplementary`](#supplementary)
- [`table_benford`](#table-benford)
- [`table_cross_copy`](#table-cross-copy)
- [`table_duplicate_row`](#table-duplicate-row)
- [`table_file_metadata`](#table-file-metadata)
- [`table_forensics`](#table-forensics)
- [`table_highlight_focus`](#table-highlight-focus)
- [`table_near_duplicate_row`](#table-near-duplicate-row)
- [`table_outlier`](#table-outlier)
- [`table_relationships`](#table-relationships)
- [`table_round_bias`](#table-round-bias)
- [`text_patterns`](#text-patterns)
- [`text_tortured_phrases`](#text-tortured-phrases)

## Detectors

### `ai_generated_figure`

> Three-probe AI-figure detector. See module docstring.


### `author_emails`

> Look at the author


### `chart_data_extract`

> For every image in the


### `citation_network`

> P2-D1 detector. The ``name`` attribute


### `cited_retraction`

> P2.2 detector. Flags references whose DOI resolves to an


### `compliance`

> Scan the document text


### `cross_paper_image`

> P6.3: match figure pHashes against the local fingerprint index
> (cross-paper reuse). See `cross_paper_image.py`.


### `data_availability_concern`

> Scan the data-availability section for red-flag phrases.


### `figure_grim`

> Run EasyOCR over each figure region, then GRIM-check


### `figure_stat_text`

> Run EasyOCR over each figure region and emit


### `figure_table_consistency`

> Check that the


### `figure_table_ocr`

> Recover table-like numeric grids from figure OCR (P4a).


### `forest_plot`

> Detect forest plots and cross-check their printed numeric


### `image_dup`

> Detect near-duplicate images inside the PDF.


### `image_forensics`

> Unified image forensics (P0/P1).


### `image_noise_inconsistency`

> Run the noise-level


### `image_sift_copymove`

> Run SIFT-CMFD + RANSAC on every image in the document.


### `image_ssim`

> Per-pair SSIM check on


### `image_statistics`

> Per-image statistics check.


### `imagehash_ahash`

> Average hash. Fastest of the


### `imagehash_dhash`

> Difference hash. Strong on


### `imagehash_phash`

> Classic DCT-based perceptual


### `imagehash_whash`

> Wavelet hash. Slowest but


### `metadata`

> Inspect PDF metadata (producer, creator, dates) and


### `page_raster_dup`

> Detect duplicate figure regions across PDF pages by


### `panel_dup`

> Detect duplicate panels within PDF figures.


### `panel_duplicate`

> For every image in the document, segment panels and


### `paper_mill_authorship`

> Multi-probe paper-mill / peer-review detector.


### `paper_mill_template`

> Scan the document for


### `pdf_metadata`

> Run the metadata +


### `ref_duplicate`

> Emit a finding per pair


### `ref_format_anomaly`

> Emit a single finding


### `source_data_consistency`

> Cross-check PDF table numbers against companion Source Data.


### `stat_corr_psd`

> P6.2: correlation / covariance matrices that fail positive
> semi-definiteness. See `stat_extra.py`.


### `stat_grim`

> The GRIM test on every


### `stat_percent`

> For every column whose


### `stat_pvalue`

> Recompute the p-value


### `stat_pvalue_pileup`

> P6.2: concentration of reported p-values just below α=0.05.
> See `stat_extra.py`.


### `stat_sprite`

> P6.2 SPRITE-lite summary M±SD,n feasibility (default off).
> See `stat_extra.py`.


### `supplementary`

> Inspect the PDF for


### `table_benford`

> Apply the Benford goodness-


### `table_cross_copy`

> Detect identical data rows shared across different tables/sheets.


### `table_duplicate_row`

> Find rows that are byte-identical or numerically identical


### `table_file_metadata`

> Inspect companion spreadsheet file metadata (creator, timestamps).


### `table_forensics`

> Orchestrate all table-forgery detectors into one suite.


### `table_highlight_focus`

> Prioritize author-highlighted spreadsheet cells for deep table checks.


### `table_near_duplicate_row`

> Flag rows that differ by only 1–2 cells (copy-paste + tweak).


### `table_outlier`

> Detect "too clean" numeric columns (fabrication / over-smoothing).


### `table_relationships`

> Flag exact arithmetic relationships across manuscript data tables.


### `table_round_bias`

> Last-digit forensic bias (0/5 over-representation).


### `text_patterns`

> Dispatcher that runs every enabled text-pattern check against


### `text_tortured_phrases`

> Scan the document text
