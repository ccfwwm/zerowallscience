---
name: zerowall-sanger
description: ZeroWall Science 7.0.0 sanger workflow; use only when the corresponding research or viewer task is requested.
---

# sanger

Use the persisted ZeroWall research objects and the current Host/Runner schemas. Keep source, version, unit, applicability, and access state explicit; unknown values remain unknown. Register inputs and parameters before execution, use deterministic runners for numeric outputs, and retain manifests, logs, failures, conflicts, and limitations. Do not claim a professional workflow is available unless the executable adapter and validation artifact are present. A frozen question, plan, or candidate set is immutable: propose an amendment and new version. Escalate only the two research gates: freeze the primary question and validation plan, then approve the final claims.


## Domain constraints

Validate SCF quality, trimming and bounded reference alignment. The current deterministic adapter accepts SCF 1/2/3 only, exposes stored-call probability (not Phred), preserves source hashes and 1-based call coordinates, and exports a manifest plus trimmed FASTA. AB1 parsing, reverse-complemented read pairing, bidirectional confirmation, mixed-base/IUPAC review and manual peak revisions remain unavailable until their own parser and validation fixtures exist; stop with an explicit limitation instead of substituting a different format.

