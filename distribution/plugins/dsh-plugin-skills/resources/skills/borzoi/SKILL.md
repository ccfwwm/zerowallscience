---
name: borzoi
description: >
  Predict genome-wide functional tracks (RNA-seq, CAGE, DNase, ChIP) from DNA
  sequence with Borzoi. Use this skill when: (1) Scoring the regulatory effect
  of a variant on expression/accessibility, (2) Generating predicted coverage
  tracks for a locus, (3) Prioritising non-coding variants by predicted track
  delta.
license: Apache-2.0
category: biomodels
requirements:
  - gpu
metadata:
  third_party:
    - kind: weights
      name: Borzoi (PyTorch port)
      provider: Calico Life Sciences
      license: CC-BY-4.0
      info_url: https://huggingface.co/johahi/borzoi-replicate-0
---

## ZeroWall runtime

Use only the tools exposed by the active DSH session. Load skills with the `skill` tool. Local Python dependencies are managed through `python_environment`; the executable and dependency paths come from the Host runtime service. Resource scripts read `ZEROWALL_PYTHON_EXECUTABLE`, `ZEROWALL_PYTHON_SITE_PACKAGES` and `ZEROWALL_PYTHON_ENV_ROOT` when they need explicit runtime paths. Never reconstruct an installation path or alter system Python. Remote workflows use the live `research_workflow` and `r_files` schemas; missing remote capabilities remain unavailable. Loading instructions does not execute code, install dependencies, enable external models or activate upstream CLI hooks.

# Borzoi — DNA → Functional Track Prediction

## Prerequisites

When Borzoi runs inside ZeroWall Science, it uses the application's single
shared Python 3.12 runtime and shared `Lib/site-packages`. Do not create a
local venv, Conda environment, or per-model Python profile. GPU drivers and
remote Linux environments remain host-managed; only the local Windows Python
dependency list is installed through `python_environment`.

| Requirement | Minimum | Recommended |
| ----------- | ------- | ----------- |
| Python      | 3.10+   | 3.11        |
| CUDA        | 12.1+   | 12.4+       |
| GPU VRAM    | 16 GB   | 24 GB+      |

## How to run

```python
from borzoi_pytorch import Borzoi

model = Borzoi.from_pretrained("johahi/borzoi-replicate-0").cuda().eval()
# input: (batch, 4, 524288) one-hot DNA  → output: (batch, tracks, 6144) bins
```

Borzoi consumes ~524 kb one-hot windows and emits binned predictions across
7,611 human tracks (the separate 2,608-track mouse head is off by default;
enable via `enable_mouse_head=True` and select with
`forward(..., is_human=False)`). For variant scoring, run ref/alt windows
centred on the variant and compare per-track output.

## Output format

`(B, T, L)` tensor — `T` tracks × `L` 32-bp bins. Track metadata (assay,
biosample) is in `borzoi_pytorch.pytorch_borzoi_model.TRACKS_DF` (or `model.tracks_df` when using the `AnnotatedBorzoi` subclass) — the base `Borzoi` model has no `targets` attribute.


## Remote compute

Needs ≥24 GB VRAM and either pre-cached HF weights or egress to
`huggingface.co`. Use a selected and probed `ssh:<alias>` context and load
`remote-compute-ssh`. Confirm `borzoi-pytorch` and the cache location, then
submit a self-contained runner with `shell`:

```json
{
  "context_id": "ssh:gpu-box",
  "title": "Borzoi prediction for one locus",
  "command": "HF_HOME=/srv/model-cache python borzoi_run.py --output $WORKSPACE_ROOT/zerowall-results/borzoi/tracks.npz",
  "timeout_secs": 1800,
  "input_paths": [
    "runs/borzoi_run.py"
  ],
  "output_specs": [
    {
      "glob": "ssh://gpu-box$WORKSPACE_ROOT/zerowall-results/borzoi/tracks.npz",
      "kind": "npz",
      "residency": "remote"
    }
  ]
}
```

Replace context, environment, cache, and output paths with discovered values.
Call `job_status` once to wait, `get_run` once for a snapshot, or `cancel_run`
to stop.


## Troubleshooting

| Symptom                        | Cause                    | Fix                                  |
| ------------------------------ | ------------------------ | ------------------------------------ |
| `module has no __version__`    | Package exposes no attr  | Use `importlib.metadata.version("borzoi-pytorch")` |
| Shape mismatch on input        | Wrong window length      | Pad/crop to 524288 bp (fixed; not exposed as a model attribute) |

---

**Next**: combine track deltas with `evo2` likelihood deltas for a
two-axis variant prioritisation.
