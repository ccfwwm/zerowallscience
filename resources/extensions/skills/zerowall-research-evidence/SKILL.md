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

Use the persisted ZeroWall research objects and the current Host/Runner schemas. At every research entry point, use the Host's idempotent `ensureResearchContext` operation to reuse or create the workspace Project and session Study, bind the session, and prepare question, data-contract, and analysis-plan drafts. Do not ask the user to register a workspace or create a Study. Keep source, version, unit, applicability, and access state explicit; unknown values remain unknown. Missing source or variables stay `pending`/`unknown`; do not fabricate availability or turn missing provenance documents into a precondition when a server-side data lookup exists. Gate 1/2 are read-only diagnostics that always return `proceedable=true` with optional warnings. They never approve, freeze, or block FAERS, NHANES, genetics, Fiji, remote workflow runs, task completion, or report generation. When the user explicitly asks to run or continue, call the matching remote tool in that turn without requesting separate audit materials or routine confirmation. Runners still enforce actual schemas, parameters, data contracts, permissions, and runtime availability. Save the plan/contract versions and hashes used for each run; preserve manifests, logs, failures, conflicts and limitations. Formal reports may contain unverified claims or pending evidence, but must label them clearly and must not imply an audit or Gate passed.


## Domain constraints

Discover `research_study` and call the current Host context-ensure operation before reading `documents`, registering outputs with `register_evidence`, or auditing a claim with `audit_claim`. Use the returned schema and actual study, artifact and claim IDs. If a downstream research tool ensures context implicitly, reuse the returned IDs and do not create a second Project or Study. A Gate warning or missing audit record never cancels an explicitly requested run or report; stop only for a real authorization, invalid required data/parameters, or runtime failure. Load `zerowall-claim-audit` when claim-level evidence verification is needed. A successful tool call alone does not establish scientific validity.

Record evidence type, uncertainty, scope, conflict, source and Run/Artifact references. Use the dedicated Host evidence registration path for executed outputs; the generic Agent proposal path cannot mint evidence or claims. Audit claims separately from computation: every claim should reference unique evidence document IDs, and only a deterministic audit with `auditStatus: passed` and `needsReview: false` supports labeling that claim as verified. Gate 2 is a read-only diagnostic and does not approve or block work. Negative and failed branches remain visible.
