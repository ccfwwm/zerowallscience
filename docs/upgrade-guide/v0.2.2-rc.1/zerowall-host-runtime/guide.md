---
kind: upgrade-guide
description: "ZeroWall Science 9.1 adds a restart-activated Host Runtime that can update independently of the Desktop installer."
---

# ZeroWall Science Host Runtime

English | [中文](guide.zh.md)

## Change

ZeroWall Science 9.1 keeps a fixed Bootstrap in the Desktop installer and may run a signed Host Runtime from `$DSH_HOME/zerowall/host-runtimes/`. Business plugin updates and Host Runtime updates remain separate candidates, but both activate only after a task-safe restart. The Bootstrap verifies compatibility and payload integrity before starting the Host. A failed startup restores the previous runtime and keeps the failure record.

## Migration

Install the 9.1.2 Desktop once. Existing 8.x or 9.0 installations continue using their bundled Host until the upgrade completes. Do not copy files into a runtime generation. To inspect a prepared generation, read `host-runtime.json` and `state.json` under the Host Runtime store. A successful restart reports the active runtime in the Desktop Host ready handshake. The Desktop owns DSH core and the Bootstrap; Host updates must match its DSH version, protocol, ABI and installed dependency versions. If verification or startup fails, the same startup restores both original generations automatically. Activation and commit decisions survive interruption, and diagnostic records remain available.
