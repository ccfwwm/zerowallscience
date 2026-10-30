---
name: zerowall-science-viewer
description: Route conversation requests to a dedicated scientific file or visualization viewer. Research planning, analysis, evidence and reports stay in conversation tools.
---

# ZeroWall Science viewer

Use `science_viewer_panel` only to open or focus a scientific file or visual result after the underlying conversation tool has succeeded. The conversation automatically opens the matching viewer and selects the returned tool and asset. Pass the current session context and a stable `request_id` when available.

Analysis submission, status and artifact retrieval use `research_workflow` and the matching domain skill. The viewer does not create projects, studies, plans or gates. An explicit request to run or continue authorizes that submission in the current turn.

The viewer route only coordinates display and accepts `open` or `focus`; it does not run, inspect, cancel, or export analyses. Use the specialized conversation tool (`science_viewer`, `fijiWorkflow`, `fijiExperiment`, `he`, `flow`, `sanger`, `molecule`, `cell`, `canvas`, `brain`, `research_workflow`, or `r_files`) for computation, task status and file operations. Read numeric values only from returned Run or Artifact manifests. Do not claim an engine is available when Host reports `unknown`, `invalid`, or `degraded`.

## Supported viewers

| Viewer | Inputs | Default Host action | Skill |
| --- | --- | --- | --- |
| ImageJ | PNG/JPEG/TIFF/OME-Zarr | `image_open` | `zerowall-fiji` |
| HE | SVS/NDPI/TIFF | `he_open` | `zerowall-he` |
| Flow | FCS | `flow_open` | `zerowall-flow` |
| Cells | H5AD | `cell_open` | `zerowall-cells` |
| Sequence | FASTA/GenBank | `open` | `zerowall-sequence` |
| Sanger | SCF/AB1 | `sanger_open` | `zerowall-sanger` |
| Molecule | PDB/CIF/SDF | `molecule_open` | `zerowall-molecule-viewer` |
| Canvas | registered canvas specification | `canvas_render` | `zerowall-science-canvas` |
| Brain atlas | managed atlas or registered data | `brain_open` | `zerowall-brainglobe` |

For a local file, the viewer offers a picker restricted to the selected tool's supported extensions. Host copies the file into the active conversation workspace's `.zerowall/imports/`, verifies size and SHA-256, and registers it as a viewer asset. Existing OME-Zarr and other local assets can be opened through the matching specialized action. A viewer or engine may impose a lower import limit.

Use the matching domain Skill and its conversation tool for analysis. Do not route analysis through the viewer or ask the user to open a separate research interface. Reuse a request ID only for an identical retry. Verify output using the returned Run/Artifact ID and checksum; a viewer render alone is not an analysis result.

Show loading, loaded, engine-unavailable, process-started, and error states only when confirmed by Host results. A spawned native process is not proof that its GUI opened.
