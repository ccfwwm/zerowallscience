# ZeroWall Science 4.3.3

[English](README.md) | [简体中文](README.zh-CN.md)

[ZeroWall Science](https://zerowallscience.org/) is a local-first, model-agnostic scientific research workbench built with Electron, React, TypeScript, and a pinned DSH Host. It keeps projects, research records, and credentials under explicit local security boundaries while providing an integrated agent workspace for research, execution, publication, and presentations.

![ZeroWall Science workspace](docs/assets/app-home.png)

## Highlights

- DSH Agent, sessions, tools, Skills, MCP, subagents, and approval workflows.
- Durable `Project`, `ExecutionContext`, `DataAsset`, `Run`, `Artifact`, `Paper`, and `Decision` records.
- Local, WSL, and SSH execution contexts with a persistent Run Manager. WSL is available on Windows only.
- Scientific file previews, publication evidence, research graphs, and recoverable presentation workflows.
- Local-first storage with a separate SQLite research database and operating-system credential vault.
- Sandboxed Electron Renderer with context isolation, no Node.js integration, and loopback-only Host access.

## Architecture

ZeroWall-owned Host and Client plugins provide the product domains. DSH is the sole Agent, session, tool, Skills, MCP, approval, plugin, and React UI kernel. Research records remain independent from DSH session persistence, and credentials are stored through Electron `safeStorage`, never in Renderer state, SQLite, logs, or exports.

The pinned DSH source is a Git submodule at `dsh/source`. Its upstream identity, fork commit, and version are recorded in `dsh/lock/upstream.json`.

## Requirements

- Node.js 24.9.0
- pnpm 11.7.0
- Windows 10/11 for Windows packaging
- A matching macOS runner for macOS packaging, signing, notarization, and launch validation

## Setup

```powershell
git clone --recurse-submodules https://github.com/ccfwwm/zerowallscience.git
cd zerowallscience
pnpm install --frozen-lockfile
pnpm dev
```

If the repository was cloned without submodules:

```powershell
git submodule update --init --recursive
```

## Verification

Run focused tests while developing, then run the complete repository gates:

```powershell
pnpm typecheck
pnpm test
pnpm package:dir
```

Agent composition changes must also pass:

```powershell
pnpm test:dsh:rc2
```

Automated tests do not require real SSH, WSL, GPU, API keys, or network access.

## Packaging

```powershell
# Windows preview channel
pnpm package:win

# Windows stable channel
pnpm package:stable:win

# macOS, on matching macOS runners only
pnpm package:mac:x64
pnpm package:mac:arm64
```

Preview and Stable use separate application identities, data directories, and update channels. See [BUILD.md](BUILD.md), the [architecture guide](docs/dsh-architecture.md), and the [release channel guide](docs/release-channels.md).

## Security

Do not commit API keys, tokens, passwords, private keys, research data, or local `.env` files. External commands, deletion, installation, and remote operations remain subject to explicit approval boundaries. Please redact secrets before submitting an issue.

## License

Copyright (C) 2026 ZeroWall Science contributors.

ZeroWall Science first-party code is licensed under [GNU AGPL-3.0-only](LICENSE). Bundled and referenced third-party components remain under their respective licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

- Website: [zerowallscience.org](https://zerowallscience.org/)
- Source: [github.com/ccfwwm/zerowallscience](https://github.com/ccfwwm/zerowallscience)
