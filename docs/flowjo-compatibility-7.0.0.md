# FlowJo workspace compatibility and FCS batch design

This note defines the shipped minimum scope for the FlowJo/FCS workbench gate.
The product imports this strict subset through `flow_workspace_import` and
executes registered local FCS assets through `flow_batch`; it does not claim
general FlowJo compatibility.

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
3. Run a two-file batch where one file is valid and one is deliberately missing;
   verify partial success and an auditable refusal.
4. Run a workspace containing an ellipsoid or unknown transform; verify refusal
   rather than approximation.
5. Verify all opened descriptors and temporary files are released after success,
   refusal, cancellation, and source-change detection.
