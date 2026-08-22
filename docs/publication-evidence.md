# Publication Evidence Workspace

The Publication Workspace selects the small set of project evidence that
supports a manuscript. It is separate from project backup and Session export.

Open **Publication** from the project sidebar. A Publication contains ordered
manuscript items (Section, Claim, Figure, Table, Methods, and Supplement) and
one or more revisions. Draft revisions can be edited. Frozen and Published
revisions are read-only; use **Clone revision** to continue work without
changing historical evidence.

Registered Artifacts and persisted Runs expose **Use in publication**. The
binding dialog records:

- the exact target revision and manuscript item;
- the evidence purpose and optional supported Claim;
- Candidate, Selected, or Rejected selection state;
- Public, Restricted, or Private visibility.

An Artifact selection is resolved to its current exact `ArtifactVersion` when
the binding is saved. The binding never follows `Artifact.latest_version_id`
afterward. The evidence panel shows the exact source ID, review and
reproduction state, lineage quality, version/checksum details, drift, and
revision-local supersession.

## Freezing

**Freeze** runs dependency and safety checks before making a revision
immutable. Select the intended Capsule visibility and explicitly confirm PHI /
PII and redistribution review where applicable. The readiness panel reports
blockers, warnings, omissions, documented waivers, and the resulting capability
level:

- `archived`
- `traceable`
- `re_executable`
- `reproduced`

Historical live files without trustworthy creation-time checksums are captured
as a new `late_capture` version and reported as
`historical_content_unverified`. They are not rewritten to look like original
Run output.

Public policy never includes Restricted or Private dependency bytes. Those
dependencies remain manifest references or omissions with access instructions.
Frozen evidence and its manifest hash are retained independently of ordinary
Artifact, Session, undo, and garbage-collection operations.

## Building a Capsule

Frozen and Published revisions expose **Build Capsule**. The save produces a
deterministic ZIP derived only from the stored frozen manifest and exact
content-addressed snapshots. It never falls back to a current workspace file.
Every copied blob is streamed through SHA-256 verification before the archive
is published.

The schema-v1 archive contains:

- `capsule.json`, `checksums.sha256`, `README.md`, `REPRODUCE.md`, and
  `CITATION.cff`;
- the exact frozen manifest and selected evidence under `evidence/`;
- Run, input, output, code, and environment lineage under `provenance/`;
- access instructions and reference-only dependencies under `data/`;
- immutable reference results and the verification report.

Entry names, ordering, timestamps, and permissions are normalized. Rebuilding
the same revision from the same immutable blobs produces the same archive
bytes and SHA-256. Public Capsules copy only Public allowlisted bytes;
Restricted and Private dependencies remain metadata and access instructions.
Traversal paths, symlinks, credential-like content, missing snapshots, and
checksum mismatches fail closed. Each attempt is recorded separately from the
frozen revision, including its revision-manifest hash and archive hash.

## Precise evidence and clean verification

Draft revisions expose **Add precise evidence**. It accepts an exact
`MessageSpan`, `ToolCall`, `ExecutionLog`, `CodeCell`, or `ExternalResource`
identity. Message and tool locators contain the frame, persisted message
sequence, and UTF-8 byte range or tool-call ID. Execution and code anchors use
the exact execution-log ID, never the most recent execution for a path. ZeroWall
copies the selected text, arguments, result, code, log, or resource metadata
into a hash-authenticated binding snapshot when it is selected. Later Session
compaction or deletion cannot change that snapshot.

A Frozen or Published evidence card with a producing Run exposes **Verify in
clean workspace**. Verification:

- creates a new temporary directory;
- copies only exact input and code snapshots allowed by the frozen manifest;
- clears the inherited process environment and restores a small
  platform-required allowlist;
- rejects non-local contexts, unsafe paths, credential-like commands, and
  commands with explicit network access;
- records the actual context capabilities, host OS/architecture, locale, and
  timezone fingerprint;
- compares every declared output against the frozen reference; and
- stores an append-only reproduction run and per-output report without
  changing the Frozen Revision.

The backend supports byte-exact SHA-256, normalized UTF-8 text, semantic JSON,
and numeric absolute/relative-tolerance comparators. The Workspace action uses
SHA-256 by default and shows environment parity, comparator, output path, and
pass/fail status.

`reproduced` is an effective display capability, not a mutation of the frozen
manifest. ZeroWall shows it only when every Run named by that manifest has a
completed report with parity for every captured environment field, exit code
zero, and all required comparisons passing. A failed or mismatched rerun
remains `re_executable`.

## Current scope and limitations

Clean verification currently supports local Runs only. Its fresh directory,
allowlist, cleared environment, path checks, and process cleanup prevent
accidental access to ordinary project files, but this is process-level
isolation rather than a hardened OS/container network sandbox. Do not use it
to execute untrusted code. Commands that obtain network access indirectly
through an interpreter or spawned child are outside this release's threat
model.

Structured text, JSON, and numeric comparisons are limited to 16 MiB; SHA-256
comparison streams files of any supported size. The precise-evidence dialog
currently requires persisted IDs and byte offsets; direct transcript
highlighting and code-cell selection are follow-up interaction improvements.
Interpreter, package, container, CUDA, and driver versions participate in
parity only when the selected Execution Context captured them in its
capabilities. A `reproduced` report therefore means the declared outputs were
reproduced under the recorded fingerprint; it is not proof that an
uncaptured dependency was identical.

ZeroWall does not currently expose destructive garbage collection for
content-addressed Artifact blobs. Frozen source records are protected from
ordinary deletion; any future blob collector must treat Frozen and Published
manifests as retention roots.

Until a clean rerun satisfies the full contract, the product calls the result
a Publication Evidence / Traceability Capsule rather than claiming full
reproducibility.

## Manual smoke check

1. Open **Publication**, create a Draft revision and Methods/Figure item, then
   add a persisted Run with exact inputs, outputs, code, and environment.
2. Use **Add precise evidence** to bind a message excerpt or exact execution,
   then press Escape immediately; only that dialog should close.
3. Freeze the revision as Private or Restricted and inspect the readiness
   report.
4. On the frozen Run evidence card, choose **Verify in clean workspace**.
5. Confirm the report lists environment parity and one result per output. A
   changed output or environment must leave the capability at
   `re_executable`.
