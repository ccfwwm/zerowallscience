---
name: zerowall-he
description: ZeroWall Science 7.0.0 he workflow; use only when the corresponding research or viewer task is requested.
---

# he

Use the persisted ZeroWall research objects and the current Host/Runner schemas. Keep source, version, unit, applicability, and access state explicit; unknown values remain unknown. Register inputs and parameters before execution, use deterministic runners for numeric outputs, and retain manifests, logs, failures, conflicts, and limitations. Do not claim a professional workflow is available unless the executable adapter and validation artifact are present. A frozen question, plan, or candidate set is immutable: propose an amendment and new version. Escalate only the two research gates: freeze the primary question and validation plan, then approve the final claims.


## Domain constraints

The current adapter accepts SVS/NDPI/TIFF inputs that the bounded native decoder can read, opens the first decoded page/level, validates original-pixel ROI bounds, and reports deterministic RGB, nuclei-like colour/brightness pixels, and 8-connected component counts/areas with a parameterized artifact. The component count is a screening heuristic, not StarDist and not diagnosis. Full OpenSlide tile streaming, physical calibration, StarDist nuclei segmentation, tissue-region models and batch processing are not yet available.

