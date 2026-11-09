# @zerowall/dsh-plugin-mineru

English | [中文](README.zh.md)

MinerU document parsing for ZeroWallScience, using DSH 0.2.2-rc.1 and Node.js 24.9 or later. The package supplies `mineru_activate`, `mineru_parse`, `mineru_batch_parse` and `mineru_task`. Configure the API endpoint, parsing mode and token in the environment settings page or this plugin's configuration page. It uses the Host credential store and waits for official environment initialization before resolving `MINERU_API_TOKEN`.

Inputs are HTTP(S) document URLs, files inside the current session workspace, or native file attachments verified against the current session's user messages and SHA-256 digest. Local paths outside the workspace require an authorized session attachment. Paths derive from the selected workspace or `DSH_HOME`; no previous installation directory is required.

Task records and checksummed Markdown, normalized content lists and image artifacts are written under the session workspace's configured artifact directory. Conversations without a workspace store artifacts beneath `DSH_HOME` (or the standard user DSH home). Interrupted uploads and parsing resume through `mineru_task` using the original task ID, without submitting another document. Service disposal cancels and waits for active parsing before releasing its state.

No Python runtime or separate MinerU Skill is installed by this package. A missing token is reported explicitly, and the settings page offers a connection test that does not submit a document.

Development: `node ../../scripts/build-plugin.mjs`, `node node_modules/vitest/vitest.mjs run`, and `node node_modules/typescript/bin/tsc -p tsconfig.build.json --noEmit`.
