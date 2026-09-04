# ZeroWall Science 5.1.1

- Reworked image-to-PowerPoint reconstruction around a native-first editable scene model instead of using a full-slide raster image as a pseudo-editable background.
- Added separate scene maps, editable manifests, local asset manifests, draw logs, rendered previews, and QA reports for reconstructed slides.
- Added editable PowerPoint export safeguards that reject full-slide or near-full-slide raster fallbacks and derive native/raster object counts from actual exported objects.
- Added native editable text, shapes, lines, and layout regions while limiting complex source imagery to explicitly identified local visual-core regions.
- Strengthened reconstruction validation and tests for scene-map identity, artifact paths, editability statistics, revision behavior, and unsupported fallback handling.
