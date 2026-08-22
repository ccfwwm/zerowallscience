---
name: managed-model-endpoints
description: Explain ZeroWall's current managed-model endpoint boundary and plan a safe integration. Use when the user asks to register, start, stop, tunnel, authenticate, or manage a persistent inference service.
license: Apache-2.0
---

# Managed model endpoint boundary

ZeroWall does not currently expose an endpoint registry or a service-lifecycle
backend. The Agent cannot allocate ports, configure tunnels, read secrets,
register health checks, or start and stop a persistent inference service
through Python.

Do not model service startup as a normal `run_in_context` command: a Run tracks
one process lifecycle, while a managed endpoint also needs a durable endpoint
identity, health, routing, authentication, restart policy, and ownership.

## Supported path

If the user already operates an endpoint outside ZeroWall and the selected local,
WSL, or SSH context can reach it using credentials already configured in that
execution environment, load `using-model-endpoint` to run a bounded inference
client. Never request or print secret values merely to make the call.

Otherwise explain that endpoint registration and service management are not
available in this ZeroWall build. A future implementation should add a typed service
or execution-context backend with keyring-backed secret binding, health checks,
start/stop/recovery semantics, and auditable invocation Runs.
