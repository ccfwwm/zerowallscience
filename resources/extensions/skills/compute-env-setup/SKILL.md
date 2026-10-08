---
name: compute-env-setup
description: Set up and validate a reproducible Python or R environment on a ZeroWall execution context. Use for a selected local, WSL, or direct SSH context when installing scientific packages, configuring caches, recording interpreter activation, or producing an environment smoke test. Do not use for scheduler clusters or managed cloud providers that ZeroWall cannot track yet.
license: Apache-2.0
---

# Set up a compute environment

Treat the selected and probed `ExecutionContext` as authoritative. ZeroWall
currently supports `local`, `wsl:<distro>`, and direct `ssh:<alias>` contexts;
it does not expose an authenticated provider SDK inside Python.

## Plan the environment

Define before installing:

- Python or R version;
- ordered conda/pip/R package phases with important pins;
- required CUDA capability and minimum VRAM;
- cache variables and durable weight locations;
- import checks, CLI checks, and one seeded representative workload;
- the exact activation command later Runs must include.

Use `references/envs_reference.md` for package-order and cache examples, but
replace container-specific paths with paths valid on the selected context.

## Direct SSH workflow

1. Require a selected `ssh:<alias>` context with a recent Probe result. Respect
   recorded GPU, privilege, interpreter, conda/mamba, module, and scheduler
   capabilities.
2. If a scheduler is detected, stop. Do not install or run long work on a
   shared login node; ZeroWall needs a scheduler-aware Run backend first.
3. Use at most a few bounded read-only `shell` commands to confirm free space,
   existing environments, and cache paths.
4. Write an idempotent project script such as
   `runs/setup-<environment>.sh`. It must use user-writable paths, fail fast,
   activate the environment explicitly, run all smoke checks, and write a
   small JSON manifest only after validation succeeds.
5. Submit the setup script through one persisted Run:

```json
{
  "context_id": "ssh:gpu-box",
  "title": "Set up singlecell environment",
  "command": "bash setup-singlecell.sh /home/me/envs/singlecell /home/me/zerowall-env-manifests/singlecell.json",
  "timeout_secs": 14400,
  "input_paths": ["runs/setup-singlecell.sh"],
  "output_specs": [
    {
      "glob": "ssh://gpu-box/home/me/zerowall-env-manifests/singlecell.json",
      "kind": "environment-manifest",
      "residency": "remote"
    }
  ]
}
```

6. Replace all example paths with probed absolute paths. Call `monitor_run`
   exactly once when waiting is useful. Use one `get_run` snapshot later or
   `cancel_run` when requested.
7. Record the validated activation command, versions, cache paths, GPU witness,
   date, and known limitations in a normal project file such as
   `environments/<context>/<name>.md`. This file is documentation, not a hidden
   resolver.

## Setup-script requirements

- Make repeated execution safe: reuse a matching environment or stop with an
  actionable version mismatch.
- Keep pip install phases ordered; a later dependency resolver must not silently
  replace pinned torch, CUDA, JAX, NumPy, or compiled extensions.
- Never use `sudo` unless the Probe explicitly records suitable privilege and
  the user authorizes it. Prefer conda packages, modules, or user paths.
- Put multi-gigabyte weights in durable remote storage. Populate them with the
  model's real loader, verify non-empty content and completion markers, then run
  a representative inference witness.
- Write the manifest atomically only after imports, GPU visibility, and the
  representative workload pass.

## Local and WSL boundary

Local and WSL Runs are currently capped at 300 seconds and do not support
`input_paths`. Use `local-env-setup` for normal interactive setup. Use
`run_in_context` only for a bounded command that finishes within that limit and
writes outputs to host-visible project paths.

## Unsupported backends

ZeroWall has no scheduler, Modal, RunPod, cloud Batch, container-service, or managed
endpoint execution context today. Do not invent a provider id or hide those
lifecycles inside an SSH submission command. Explain the boundary or use a
dedicated direct SSH host until a backend implementing submit, poll, cancel,
recovery, secrets, and artifact harvest exists.
