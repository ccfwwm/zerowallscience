---
kind: upgrade-guide
description: New PPT projects default to image output before OCR reconstruction into an editable copy.
---

# Image-first presentation creation

English | [中文](guide.zh.md)

## Change

In `@zerowall/dsh-pptcreate@0.1.1`, omitting `presentation_prepare.output_mode` for a new workflow selects `image` instead of `editable`. The bundled `ppt-maker` workflow exports a non-editable full-page image PPTX first, then reconstructs an independent editable copy through OCR. Existing workflows retain their saved output mode.

## Migration

1. Load `ppt-maker` before creating presentations. Use its image-first sequence and keep both exported PPTX files. Review representative OCR pages before converting the rest.
2. Automated callers that require native editable construction must pass `output_mode: editable` explicitly. Existing saved workflows need no migration.
3. Confirm a new workflow without `output_mode` reports `image` in `presentation_status`; verify the image PPTX exists before OCR and the editable copy uses a separate project and output file. Complex raster regions remain images and are disclosed at delivery.
