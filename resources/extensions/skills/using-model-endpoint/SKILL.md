---
name: using-model-endpoint
description: Invoke an already configured model endpoint from a supported ZeroWall execution context and capture the bounded inference as a Run. Use only when the endpoint URL and authentication are already available inside that context; this skill does not register or manage services.
license: Apache-2.0
---

# Use an existing model endpoint

ZeroWall can record a bounded client invocation as a Run, but it does not register
or manage the endpoint. Require all of the following:

- a selected `local`, `wsl:<distro>`, or `ssh:<alias>` context;
- a concrete endpoint URL reachable from that context;
- authentication already configured by the user in that execution environment
  or the endpoint client's own external configuration;
- a documented request and response schema;
- a finite request timeout and a concrete output path.

Do not ask the user to paste secrets into the command, project files, or chat.
ZeroWall exposes no credential accessor to the Agent and does not inject keyring
values into `run_in_context` commands.

## Invocation workflow

1. Write a small deterministic client such as `runs/call_endpoint.py`. Read the
   URL and credential variable names at runtime; never embed secret values.
2. Validate its request against the endpoint's documented schema.
3. For SSH, stage the client and small inputs with `input_paths`. Keep large
   inputs at an existing absolute remote path.
4. Submit one invocation with `run_in_context` and register the response with
   `output_specs`:

```json
{
  "context_id": "ssh:gpu-box",
  "title": "Existing endpoint inference",
  "command": "source ~/miniforge3/etc/profile.d/conda.sh && conda activate endpoint-client && python call_endpoint.py --input request.json --output /home/me/zerowall-results/endpoint/response.json",
  "timeout_secs": 300,
  "input_paths": ["runs/call_endpoint.py", "data/request.json"],
  "output_specs": [
    {
      "glob": "ssh://gpu-box/home/me/zerowall-results/endpoint/response.json",
      "kind": "json",
      "residency": "remote"
    }
  ]
}
```

5. Replace all example context and paths. Call `monitor_run` once when waiting
   is useful, `get_run` once for a snapshot, or `cancel_run` to stop.

Local and WSL Runs are capped at 300 seconds and do not accept `input_paths`.
Keep their client and outputs in host-visible project paths. If endpoint setup,
tunnelling, health management, or deployment is required, stop and load
`managed-model-endpoints` for the explicit current boundary.
