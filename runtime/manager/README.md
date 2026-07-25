# runtime/manager

The local Runtime Manager. Keeps the desktop installer light and installs the
scientific environment on demand.

Responsibilities:

- Detect OpenCode, Python / uv, Node, Git.
- Create and manage the workspace and per-project isolated environments.
- Install base Python packages and scientific tool dependencies on demand.
- Start / supervise the bundled OpenCode sidecar (and later the Jupyter Kernel Gateway).
- Manage ports; monitor runtime health.
- Write `provenance.jsonl`; collect logs.

## Runtime directory (per OS)

```text
macOS:   ~/Library/Application Support/ZeroWall Science/
Windows: %APPDATA%/ZeroWall Science/
generic: ~/.zerowall/
  config/  runtime/{opencode,python,node}/  profiles/zerowall-science/
  workspaces/  logs/  cache/  secrets/
```

## Startup order

UI starts first → Runtime Manager checks dependencies → starts the OpenCode sidecar →
connects → loads projects. A failed OpenCode connection must not block the UI.
