# FlowJo workspace compatibility and FCS batch design

This note records the shipped minimum scope for the FlowJo/FCS workbench gate.
The product imports this strict subset through `flow_workspace_import` and
executes registered local FCS assets through the persistent
`flow_batch_submit`, `flow_batch_status`, `flow_batch_cancel`, and
`flow_batch_list` lifecycle. It does not claim general FlowJo compatibility.

## Reference implementation

The independent reference uses `flowkit==1.3.2` (Python 3.12.10 managed by
`uv`) and its `flowio==1.4.0` dependency. FlowKit's `Workspace`/`parse_wsp`
reads FlowJo 10 workspace XML and returns groups, sample membership, sample
keywords, compensation, transforms, and a per-sample `GatingStrategy`. Its
exporter emits FlowJo workspace version 20.0 / FlowJo 10.6.2 XML. The reference
script is `tools/integration/flowjo-flowkit-reference.py`.

The script creates two valid float FCS files and a FlowJo workspace with one
group and one rectangle gate, parses the workspace with FlowKit, and writes a
JSON snapshot containing the library versions, sample membership, channels,
compensation/transform presence, gate paths, and SHA-256 values. The fixture is
synthetic and is only a parser/contract check.

## Accepted workspace subset

The product accepts a `.wsp` only when all of the following hold:

- XML is well formed, uses the FlowJo workspace shape with `Groups` and
  `SampleList`, and is no larger than 64 MiB.
- Every referenced sample URI resolves to a registered local FCS asset inside
  the active project. Absolute paths, URLs, path traversal, missing assets, and
  duplicate sample IDs are rejected.
- Sample groups and membership are preserved. A sample belonging to multiple
  groups is represented once with a membership list.
- Per-sample gates are limited to FlowKit/FlowJo rectangle and polygon gates,
  with a single parent path and dimensions that resolve to FCS channel labels.
  Boolean, quadrant, ellipsoid, ratio, and instrument-specific custom gates are
  reported as unsupported and do not silently become rectangles.
- Workspace compensation matrices and workspace transform definitions are
  rejected in 7.0.0. Users may explicitly apply an FCS-declared spillover matrix
  or import the separately validated GatingML compensation/arcsinh subset.
- Gating boundaries retain FlowJo's untransformed-space declaration and the
  source XML hash. They are converted to the existing standard gate boundary
  mode only through an explicit user action.

## FCS batch contract

Batch input is a list of 1–64 registered `.fcs` assets plus an optional compatible
workspace. Each file is opened and closed independently through the existing
`FcsReader`, with SHA-256 and size/mtime/ctime checked before and after decode.
Batch execution is bounded to the existing 512 MiB/file, 2M events, 128
channels, 8,192-event blocks, and 2 GiB temporary-statistics limits. One failed
file produces a structured error and does not discard successful file results.

Each result records `sourceAssetId`, `sourceSha256`, `workspaceSha256` (when
present), sample ID, group memberships, applied compensation/transform, gate
IDs, event count, statistics scale, artifact checksum, and an explicit
`unsupported` list. No batch result is a biological conclusion.

## Shipped lifecycle and isolation

The batch runner records a generic existing `Run`, preserving the source
request in `.zerowall/flow-batches/<run-id>/request.json`, a progressive
`partial-result.json`, and a terminal `batch-result.json` Artifact. The request
uses a stable `requestId` plus SHA-256 of canonical JSON. On recovery, the Host
revalidates both the fingerprint and the complete 1–64 distinct-asset contract
before it can start any saved request. A changed request ID with different
inputs is refused.

Flow batches have a single local execution slot. Further valid submissions stay
`submitted`; queued time counts against the 30 minute timeout. Cancellation
retains the request and partial file. A Host shutdown aborts owned work, waits
for its tasks to reach a terminal Run state, and only then closes the Store.
Unowned `running` records fail explicitly rather than being silently resumed.

All batch directories and result files are resolved with the active-project
containment check before use. Terminal result bytes are SHA-256 checked against
the registered Artifact before a status response returns per-sample output.
This is execution provenance and integrity checking, not scientific review;
the terminal batch Artifact remains marked `needsReview: true`.

## Actual 7.0.0 verification

The independent reference command completed with FlowKit 1.3.2, FlowIO 1.4.0,
and Python 3.12.10:

```powershell
uv run --quiet --with flowkit python tools/integration/flowjo-flowkit-reference.py --output .build/flowjo-flowkit-reference/2026-09-22T06-33-29
```

It produced two synthetic FCS inputs and a FlowJo 10 workspace whose two sample
URIs omit `.fcs`, confirming the deliberately bounded basename/stem mapping.

`tools/integration/flowjo-batch-viewer-smoke.ts --run` exercised actual source
React `FlowViewer`, `FlowService`, `ResearchStore`, and Chromium. It selected
two compatible synthetic FCS assets and one malformed FCS asset through the
browser, applied the compatible per-sample WSP rectangle gates, observed the
persistent `submitted` then `succeeded` Run states, preserved the individual
refusal, and registered the result Artifact. The captured evidence is
`.build/flowjo-batch-viewer-smoke/2026-09-22T06-33-29.417Z/report.json` and
`flowjo-batch-result.png`. These synthetic checks do not establish compatibility
with all FlowJo workspaces or biological validity.

## Compatibility refusal rules

Reject before computation when a workspace cannot be mapped to registered FCS
assets, a gate dimension is absent, the XML changes during read, a matrix is
singular or malformed, an unsupported gate is required for the requested
analysis, or a transform has no exact runner equivalent. A refusal must include
the path/element and the reason. It must never silently drop a gate, infer a
compensation matrix, or treat FlowJo display settings as an analysis result.

## Required acceptance evidence

1. Run the independent reference script and retain its JSON snapshot.
2. Compare product metadata against FlowKit for sample IDs, groups, channels,
   gate paths, and matrix dimensions.
3. Run a multi-file persistent batch with compatible samples and a deliberate
   invalid input; verify partial success, the submitted/running/succeeded Run
   lifecycle, checksum-verified output, and an auditable refusal.
4. Run a workspace containing an ellipsoid or unknown transform; verify refusal
   rather than approximation.
5. Verify all opened descriptors and temporary files are released after success,
   refusal, cancellation, and source-change detection.
