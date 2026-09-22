---
name: zerowall-sanger
description: ZeroWall Science 7.0.0 sanger workflow; use only when the corresponding research or viewer task is requested.
---

# sanger

Use the persisted ZeroWall research objects and the current Host/Runner schemas. Keep source, version, unit, applicability, and access state explicit; unknown values remain unknown. Register inputs and parameters before execution, use deterministic runners for numeric outputs, and retain manifests, logs, failures, conflicts, and limitations. Do not claim a professional workflow is available unless the executable adapter and validation artifact are present. A frozen question, plan, or candidate set is immutable: propose an amendment and new version. Escalate only the two research gates: freeze the primary question and validation plan, then approve the final claims.


## Domain constraints

Use `science_viewer` actions `sanger_open`, `sanger_analyze`, `sanger_export` and `sanger_review`. Open project-local SCF 1/2/3 or common ABIF v1 AB1 assets. Subsequent actions require the returned viewer ID and `expected_revision`; bidirectional review also requires `reverse_viewer_id` and `reverse_expected_revision` for a distinct, unchanged reverse trace. Host rechecks both source hashes and revisions. Do not reuse stale views.

SCF quality is the maximum stored base probability divided by 255, not Phred. AB1 PCON is instrument Phred Q; trimming confidence is `1 - 10^(-Q/10)`. Missing PCON remains unknown and blocks quality trimming. Existing IUPAC ambiguity calls are preserved, not inferred from a second peak. Call positions are one-based; displayed sample windows use original zero-based sample coordinates.

Trimming and bounded reference alignment retain parameters, source hashes and limitations. Bidirectional review reverse-complements the reverse read, exposes disagreements, and does not establish a mutation or diagnostic interpretation. Export produces a checksummed result manifest and trimmed FASTA. Manual base/peak revisions, mixed-peak inference and a broad real-instrument compatibility benchmark remain unverified; report these limits.

