---
name: zerowall-research-evidence
description: ZeroWall Science 7.0.0 research evidence workflow; use only when the corresponding research or viewer task is requested.
---

# research evidence

Use the persisted ZeroWall research objects and the current Host/Runner schemas. Keep source, version, unit, applicability, and access state explicit; unknown values remain unknown. Register inputs and parameters before execution, use deterministic runners for numeric outputs, and retain manifests, logs, failures, conflicts, and limitations. Do not claim a professional workflow is available unless the executable adapter and validation artifact are present. A frozen question, plan, or candidate set is immutable: propose an amendment and new version. Escalate only the two research gates: freeze the primary question and validation plan, then approve the final claims.


## Domain constraints

Record evidence type, uncertainty, scope, conflict, source and Run/Artifact references. Use the dedicated Host evidence registration path for executed outputs; the generic Agent proposal path cannot mint evidence or claims. Audit claims separately from computation: every claim must reference unique evidence document IDs, and only a deterministic audit with `auditStatus: passed` and `needsReview: false` can reach Gate 2. Negative and failed branches remain visible.

