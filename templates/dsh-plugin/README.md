# ZeroWall DSH Plugin Template

This template is the starting point for a ZeroWall-owned DSH rc8 plugin. Copy
the directory, replace `example` in package and manifest names, then add the
new workspace under `plugins/`.

The Host entry owns services and privileged operations. The Client entry may
only contribute DSH React slots and call public Remote services. Credentials,
Electron APIs, filesystem authority, and approval decisions must stay outside
the Renderer.

Required checks:

```powershell
pnpm plugins:generate
pnpm profiles:generate
pnpm --filter @zerowallscience/plugin-example typecheck
pnpm --filter @zerowallscience/plugin-example test
pnpm test:dsh:composition
```
