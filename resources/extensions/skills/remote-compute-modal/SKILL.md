---
name: remote-compute-modal
description: Explain ZeroWall's current Modal boundary and migrate a requested Modal workload to a supported direct SSH Run when possible. Use when an existing workflow mentions Modal, BYOC cloud compute, provider images, or cloud GPU dispatch.
license: Apache-2.0
---

# Modal compute boundary

ZeroWall does not currently implement a Modal `ExecutionContext` or Run backend.
Only `local`, `wsl:<distro>`, and direct `ssh:<alias>` contexts can be passed to
`run_in_context`. Python receives no provider SDK, cloud credentials, image
builder, or cloud-job handle.

## What to do

1. Do not submit, build, monitor, or claim to reuse a Modal image.
2. If the workload can run on a user-controlled Linux GPU host, select and
   Probe an SSH context, load `compute-env-setup`, build the required user-space
   environment there, then load `remote-compute-ssh` and submit a persisted Run.
3. Keep large inputs and model weights remote. Stage only small project scripts
   and configuration with `input_paths`.
4. If no suitable SSH context exists, explain that the workload cannot be
   dispatched by this ZeroWall build. Do not offer an untracked local SDK call as a
   substitute.

A future Modal integration must add a typed execution context and a mockable
Run backend implementing resource requests, environment/image references,
keyring-backed secret binding, submit, poll, cancel, recovery, and output
harvest. That belongs in Rust, not in a Python sidecar.
