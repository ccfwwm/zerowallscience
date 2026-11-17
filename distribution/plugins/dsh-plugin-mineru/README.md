# @zerowall/dsh-plugin-mineru

English | [中文](README.zh.md)

MinerU remote document parsing for ZeroWallScience, DSH 0.2.2-rc.1 and Node.js 24.9 or later. Install this npm plugin through the DSH plugin manager, or update the Science bundle. It supplies the existing parsing tools and the discoverable `mineru-document-parser` skill; no separate Python MinerU installation is needed.

Credentials resolve from the saved MinerU token first, then the environment settings variable. Without the environment plugin, the standard DSH credential resolver and launch environment provide `MINERU_API_TOKEN` (or the configured `tokenCredential` name). Environment-service deletions remain authoritative. Keys never enter tool arguments, status responses or artifacts.

In `auto` mode a token selects Precision; otherwise Agent processes documents remotely without a token. Agent supports up to 10 MB and 20 pages and returns Markdown. Precision supports up to 200 MB, structured content, images and extra formats. Scientific analysis, comparison and integrity workflows explicitly use `mode: "precision", isOcr: true`; missing credentials or structured content stop dependent interpretation. Both APIs upload or fetch documents remotely.

Inputs are HTTP(S) URLs, ordinary files inside the session workspace, or native `sha256:` file attachments verified against the session's user messages. Conversations without a workspace accept authorized attachments and keep artifacts beneath `DSH_HOME` or the standard user DSH home. Local paths outside a workspace require an authorized attachment.

Precision `pageRanges` accepts ascending selections such as `2,4-6` or `2--2` for readable local PDFs. Agent uses `pageRange`, for example `1-10`. Local PDFs selecting more than 200 pages are submitted in sequential chunks; every chunk uploads the source independently. Physical page indexes and image paths are retained in the merged result. Optional `anchor: true` adds `document.md` with page/block markers when structured content exists; warnings disclose missing coverage.

Task and run records precede uploads. Resume an interrupted operation with `mineru_task` and its `taskId`, or `runId` for long PDFs. `wait: false` never submits unstarted chunks. Unknown submission outcomes are retained and never silently resubmitted. Completed artifacts are verified before cache reuse; modified files are reported. Original task records remain readable.

True Precision batches group up to 50 files per API request and accept 1–1000 sources per tool call. Per-source errors carry recovery identifiers where available. Submission, polling and UTC-day limits are configurable; counters belong to the plugin process and do not replace server quotas. Disposal cancels and drains active parsing. Results retain `parse-manifest.json` schema 1, normalized content and checksums for existing integrity scripts.

The connection check sends no document and only checks endpoint routing. Development checks: `pnpm run build`, `pnpm run test` and `pnpm run typecheck`. The adapted upstream components retain their MIT notice in [THIRD-PARTY-LICENSES](THIRD-PARTY-LICENSES).
