---
name: zerowall-research-evidence
description: ZeroWall Science 7.0.0 research evidence workflow; use only when the corresponding research or viewer task is requested.
metadata:
  zerowall:
    schema_version: 1
    version: 7.0.0-1
    source: bundled
    deterministic: true
---

# research evidence

Use the persisted ZeroWall research objects and the current Host/Runner schemas. At every research entry point, first use the Host's idempotent `ensureResearchContext` operation to reuse or create the workspace Project and session Study, bind the session, and prepare question, data-contract, and analysis-plan drafts. Do not ask the user to register a workspace or create a Study. Keep source, version, unit, applicability, and access state explicit; unknown values remain unknown. Missing source or variables stay `pending`/`unknown` and are listed as recovery conditions rather than fabricated as available. Public catalog lookup and in-scope discovery/download may proceed while context is being prepared or a formal-analysis gate is blocked; update the draft contract when verified data arrives. Register concrete inputs and parameters before execution, use deterministic runners for numeric outputs, and retain manifests, logs, failures, conflicts, and limitations. Do not claim a professional workflow is available unless the executable adapter and validation artifact are present. Once the question, plan, source contract, and input validations all pass, the system records its rule version and document hashes, automatically approves Gate 1, and freezes an immutable snapshot; identify this as system validation, never human approval. A frozen question, plan, or candidate set is immutable: propose an amendment and new version. Gate 2 passes automatically only when evidence is complete and deterministic audits for every related claim pass with `auditStatus: passed` and `needsReview: false`; otherwise retain a draft report and structured blocking items with affected stage and recovery conditions.


## Domain constraints

Discover `research_study` and call the current Host context-ensure operation before reading `documents`, registering outputs with `register_evidence`, or auditing a claim with `audit_claim`. Use the returned schema and actual study, artifact and claim IDs. If a downstream research tool ensures context implicitly, reuse the returned IDs and do not create a second Project or Study. A context or formal-run blocker must not cancel independent in-scope source discovery, public lookup, or downloads; stop only the affected operation for a real authorization, scientific-validity, or runtime blocker. For the final audit load `zerowall-claim-audit`; a successful tool call is not Gate 2 approval.

Record evidence type, uncertainty, scope, conflict, source and Run/Artifact references. Use the dedicated Host evidence registration path for executed outputs; the generic Agent proposal path cannot mint evidence or claims. Audit claims separately from computation: every claim must reference unique evidence document IDs, and only a deterministic audit with `auditStatus: passed` and `needsReview: false` can reach Gate 2. Negative and failed branches remain visible.
