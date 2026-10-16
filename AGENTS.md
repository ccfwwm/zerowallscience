# ZeroWall Science Codex Agent Instructions

This file is automatically loaded when Codex works in this repository. It is the short operational contract. Read the detailed guide at [docs/codex-development-guide.zh-CN.md](docs/codex-development-guide.zh-CN.md) before substantial implementation, packaging, migration, or release work.

## Working rules

- Preserve the user's selected model, reasoning effort, image model, protocol, and configured parameters. Do not switch models or weaken assertions to make a test pass.
- Start every task with `git status --short --branch`, `git rev-parse HEAD`, `git submodule status`, and the current package version. Preserve unrelated modified, ignored, and untracked files.
- Treat the root `main` checkout as shared user work. Develop directly in the current checkout; do not create, attach, or switch to worktrees for this repository. If concurrent work blocks a safe change, coordinate in the current checkout instead. Do not use `reset --hard`, broad `git clean`, recursive deletion, or whole-directory replacement.
- Before editing, inspect the affected source, manifest, generator, tests, and relevant `config/` or `tools/` contract. If a file is generated, fix its generator instead of making a patch that the next generation will erase.
- Continue until the requested outcome is implemented and verified. Report evidence, failures, skips, external dependencies, and remaining uncertainty precisely.

## Repository contracts

- Electron desktop core is in `desktop/`; ZeroWall domain features are independent packages under `plugins/`; DSH integrations, composition bundles and support packages are also flat under `plugins/`; Research Store is under `plugins/research-store/`; the pinned DSH fork is the `deepseek-harness/` submodule.
- Formal build output belongs under `artifacts/`: `cache/`, `dev/`, `stage/<version>/<build-id>/`, `packages/<version>/<target>/`, `verification/<version>/`, `release/<version>/`, and `logs/<version>/`. Do not make `desktop/dist/`, `desktop/out/`, `.build/`, plugin `lib/`, or source directories the formal output location.
- `tools/build/paths.cjs` and `tools/build/paths.mjs` are the artifact path contract. Keep `node_modules`, pnpm store, user data, ignored credentials, signing keys, and existing release caches in place.
- The DSH commit, tag, repository, and branch in `config/deepseek-harness/upstream.json` must match the submodule and pass `pnpm dsh:verify`. Do not upgrade DSH for a ZeroWall-only feature; place domain behavior in a plugin.
- Desktop version, plugin semver, Skills version, MCP Server version, Python content revision, and prompt version are separate contracts. A desktop bump does not automatically bump every plugin.
- Every future desktop installer must integrate the complete latest verified shared plugin feed, including new plugins. Reuse immutable tarballs, never freeze the bundled plugin versions: refresh an outdated runtime/offline stage incrementally, verify snapshot and installed versions, and reject feed downgrades or missing entries. Do not rebuild or republish 8.3.0 for this maintenance.
- `@zerowallscience/dsh-bundle-science` is a composition declaration. It must not become a static aggregate of all plugin code. The extension center belongs in Settings and coordinates resource operations; it must not duplicate Skills or MCP domain services.
- The retired `dsh-auto-review` and `packages/dsh-capability-menu` must not re-enter profile, runtime closure, ASAR, or Host loading. DSH's official Auto Review remains part of the submodule.

## Required checks

Run the smallest relevant checks first, then broaden them when shared code or generated output changes:

```powershell
pnpm dsh:inventory
pnpm dsh:verify
pnpm profiles:check
pnpm dsh:runtime:closure
pnpm typecheck
pnpm plugins:typecheck
pnpm plugins:test
pnpm test:security
pnpm test:updates
```

For desktop, Host, packaging, profile migration, or resource-update changes also run the relevant subset of:

```powershell
pnpm verify:package
pnpm smoke:host
pnpm smoke:electron
pnpm smoke:update
pnpm plugins:verify-pack
```

When packaging is requested, use a new build ID and verify the installer, ASAR/runtime closure, `dsh --version`, `zws --version`, artifact manifest, installer size, and SHA-256. An installer exit code alone is not package verification.

## Resource updates

- Plugin, Skills and MCP startup and daily catalog checks are read-only: they may verify signatures and display available versions, but must not download, install, restart, or remove anything without an explicit user action. Python is the explicit 8.3.0 exception: after the desktop is usable, signed bootstrap/recovery and core/science reconciliation run in the durable background queue at the fixed root; resume only eligible automatic tasks.
- Plugin updates use candidate profiles, health checks, atomic activation, transaction journals, and per-plugin rollback. Skills may hot-refresh. MCP configuration may refresh and MCP servers may be started, stopped, or restarted. Python always executes from the fixed installation root (or an explicitly selected fixed root); verified file transactions and rollback restore that same path. Content revisions invalidate consumers; legacy slots are never activated or migrated.
- Keep user-imported Skills, MCP configuration, account/model settings, projects, environment-variable references, third-party plugins, disabled selections, and pinned versions intact during desktop upgrades.
- Never reuse a published resource ID/version for different bytes. If Qiniu reports an immutable-object size or SHA-256 conflict, stop, investigate, increment the resource version, regenerate the signed catalog, and re-test. Never bypass the signature or overwrite guard.
- Secrets must stay in secure storage or ignored environment files. Do not print or commit API keys, tokens, passwords, private keys, cookies, or secret values; logs and CLI output must be redacted.

## Versioning and release

- Update version contracts through their source files and generators, then run `pnpm version:check`, `pnpm profiles:check`, and `pnpm release:metadata`.
- If the user says an existing installer is already built or says not to rebuild, inspect and verify that exact artifact instead of silently repackaging.
- Publishing to Qiniu or creating a GitHub Release is an external action. Do it only when the user explicitly authorizes it. When authorized, verify Qiniu publicly first, then push Git/tag and create the GitHub Release; download the GitHub installer and compare its SHA-256 with the local and Qiniu artifact.
- Desktop publishing uses `pnpm release:publish:stable` and `pnpm release:verify:stable`. Independent plugin/Skills/MCP/Python publishing uses signed catalogs and `node scripts/publish-resources.mjs stage|promote|verify`; promoting resources must not change the desktop `latest.yml` pointer.
- Do not publish a local-development catalog, add a development public key to a stable installer, delete old releases, or upload credentials.

## Cleanup, commits, and reporting

- Clean only exact generated paths after checking ownership and active processes. Do not delete `desktop/build/`, the DSH submodule, `node_modules`, `scripts/env`, `.zerowall`, user data, signing files, or unconfirmed caches.
- Keep commits narrow and reviewable. Before committing run `git diff --check`, `git status --short --untracked-files=all`, and inspect the diff. Do not commit build output, secrets, or user data.
- Final reports must include the branch, parent HEAD, DSH commit, changed scope, commands and results, artifact path/size/SHA-256/build ID, publication URLs when applicable, and all skipped or unverified items.
