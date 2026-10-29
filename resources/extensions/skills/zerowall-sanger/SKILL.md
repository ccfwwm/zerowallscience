---
name: zerowall-sanger
description: 在 ZeroWall 查看 SCF/AB1 峰图，并通过 Host 执行质量裁剪、双向核对与修订。
---

# Sanger 峰图

## 7.0.5 查看入口

选择 SCF/AB1 后导入项目，文件导入上限 128 MiB。对话请求查看时由 `science_viewer_panel(action="open", tool="sanger", asset_id=..., request_id=...)` 打开峰图，默认页面只提供样本窗口、缩放和翻页；未选择资产提示“请先选择资产”，解析失败提示“打开失败”。裁剪、双向核对、人工修订和导出直接在对话中调用 `science_viewer` 的 `sanger_analyze`、`sanger_review`、`sanger_revise`、`sanger_export` 等真实 action，并遵循当前 Host schema。检查源哈希、双向来源、修订版本及产物 SHA-256；需要查看结果时再按需打开或聚焦查看器。

Use the current Host/Runner schemas and preserve source, version, unit, applicability, manifests, logs, failures, conflicts, and limitations. Gate 1/2 are non-blocking diagnostics: continue the requested run and report warnings. Record the actual plan/input version and hashes for each run; mark unreviewed claims as unverified in reports.


## Domain constraints

Use `science_viewer` actions `sanger_open`, `sanger_analyze`, `sanger_export` and `sanger_review`. Open project-local SCF 1/2/3 or common ABIF v1 AB1 assets. Subsequent actions require the returned viewer ID and `expected_revision`; bidirectional review also requires `reverse_viewer_id` and `reverse_expected_revision` for a distinct, unchanged reverse trace. Host rechecks both source hashes and revisions. Do not reuse stale views.

SCF quality is the maximum stored base probability divided by 255, not Phred. AB1 PCON is instrument Phred Q; trimming confidence is `1 - 10^(-Q/10)`. Missing PCON remains unknown and blocks quality trimming. Existing IUPAC ambiguity calls are preserved, not inferred from a second peak. Call positions are one-based; displayed sample windows use original zero-based sample coordinates.

Trimming and bounded reference alignment retain parameters, source hashes and limitations. Bidirectional review reverse-complements the reverse read, exposes disagreements, and does not establish a mutation or diagnostic interpretation. Export produces a checksummed result manifest and trimmed FASTA. Manual substitution revisions are available via `sanger_revise`, with `viewer_id`, `expected_revision` and `sanger_edits: [{position,from,to,reason}]`. Positions refer to original one-based calls. Never invent a visual review reason: record actual user review or identified trace evidence. Host preserves peak data and source hashes, rejects stale/duplicate edits, stores revision history, and invalidates downstream outputs. Edited quality becomes unknown; probability trimming is reset to 0, exposing the full read for review. Export retains edits and needsReview. Reopening identical source bytes in two views is not bidirectional evidence. Automated mixed-peak inference, insertions/deletions and broad clinical instrument validation remain unavailable. Six public AB1 files have independent parser references; this does not establish experimental variant accuracy.
