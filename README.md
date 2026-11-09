# ZeroWall Science 9.0

English | [中文](README.zh.md)

A desktop research workspace connecting models, literature, Skills, MCP tools and local or remote computation. Built on DeepSeek Harness and Cordis, with ZeroWall business plugins for scientific work.

[Website](https://zerowallscience.org/) · [Documentation](https://zerowallscience.org/docs/) · [Windows releases](https://github.com/ccfwwm/zerowallscience/releases) · [Report an issue](https://github.com/ccfwwm/zerowallscience/issues)

## Research in one workspace

Organize questions, files, execution and results in conversations. Connect Zotero and literature tools, run analysis with configured Python or SSH environments, and collect figures, reports and editable presentations.

| Capability | What you can do |
|---|---|
| Models and account | Sign in, refresh balance and models, or configure a provider |
| Native Gemini | Use Google Generative Language for Gemini chat groups |
| Images and media | Generate images, presentations or video with the corresponding plugins |
| Literature | Connect Zotero, search papers and process documents with MinerU |
| Skills and MCP | Enable instructions and tools for the selected workflow |
| Computation | Configure Python, local execution and SSH resources |
| Updates | Update the desktop from Qiniu and owned feature plugins from npm |

Groups containing **生图** are image-generation groups and are not registered as Gemini chat models.

## Install and upgrade

Download the Windows x64 installer from [Releases](https://github.com/ccfwwm/zerowallscience/releases). The Windows delivery target is Windows 10/11. The official application retains the 8.x installation identity and stable channel.

1. Close the previous app and install 9.0.
2. Review the automatic import result. Source histories, settings and credentials remain available. Migration failures do not prevent startup; healthy items are imported and unfinished items retry on the next launch.
3. Open an imported conversation and check its model. Sign in again if Windows cannot unlock a saved credential.
4. Open **Settings → Updates** to refresh desktop and plugin versions. Click to download; desktop installation requires separate restart confirmation.

Windows 9.0 uses the approved unsigned distribution method inherited from 8.x. SHA-256 and Ed25519 resource signatures verify artifacts; they do not provide Windows Authenticode. Feedless newui previews require one manual installation.

Read the [9.0 migration guide](docs/upgrade-guide/v0.2.2-rc.1/zerowall-v9/guide.md) before removing old data.

## Data and credentials

The official Windows app uses `%APPDATA%/zerowall-science/harness-v9`. First launch imports the default newui profile and official 8.x histories, settings, skills and research database. Session directories preserve original log generations; conflicting copies stay in the migration directory.

Remembered ZeroWall credentials use Windows-backed encryption in `credentials/vault-v9.json`, accessed through private desktop IPC. Failed imports preserve their sources and require sign-in. An explicit `DSH_HOME` skips automatic import.

Back up application data, external projects and remote data before changing machines. Conversation history does not contain every external artifact.

<a id="run"></a> <a id="run-from-source"></a>

## Develop

Use Node.js 24.9 or later and the pnpm version declared in `package.json`.

```sh
git clone https://github.com/ccfwwm/zerowallscience.git
cd zerowallscience
pnpm install
pnpm run build:artifacts
pnpm run build:check
pnpm run start:desktop
```

The desktop product version is 9.0.0; bundled DSH remains 0.2.2-rc.1. Do not publish customized core packages over upstream npm versions. Business packages under `@zerowall/` have independent versions.

Start with the [ZeroWall contributor guide](docs/developer/zerowall/README.md), [architecture](docs/architecture.md), [desktop reference](apps/desktop/README.md) and [development guide](docs/development.md). Agent instructions are in [AGENTS.md](AGENTS.md).

## Scope and licenses

Review model output and predictions against source materials, methods and data. Configure suitable isolation for untrusted code and choose the execution environment deliberately.

The retained DSH core uses [MIT](LICENSE). ZeroWall plugins retain their own licenses, including AGPL-3.0-only packages; inspect each before redistribution. [Third-party notices](THIRD_PARTY_NOTICES.md) apply to bundled dependencies. Source and About retain upstream attribution.
