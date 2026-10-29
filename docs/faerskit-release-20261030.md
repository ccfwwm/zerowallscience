# Conversation Research and automatic FAERS preflight — 2026-10-30

## Behavior

Research is managed in the conversation: Project/Study context, tasks, remote
runs, evidence and reports. Viewers display visual results. The separate
workbench surface, unused NHANES/genetics workbench panels and
`zerowall-science-workbench` Skill have been removed. The plugin generator no
longer recreates a reference to the deleted workbench TypeScript configuration.
Historical workbench events and annotation origins remain readable.

`research_study.auto_gate1/auto_gate2` are read-only diagnostics returning
`proceedable=true` and warnings. Gate approval and frozen plans are no longer
prerequisites for remote analyses, NHANES, genetics, Fiji, task completion or
final reports. Runs save Study document versions/hashes and their actual inputs.
Missing audits or evidence are labelled unverified. Real access, schema,
parameter, data-contract, revision and service failures remain explicit.

The FAERS Skill directs an explicit run request to the remote tool in the same
turn, setting `confirm=true`; it does not request separate audit materials.
Status and lookup query the actual ClickHouse schema, names, role counts,
coverage and matching reports. Analyze automatically attaches the preflight,
uses exact/unique names, preserves user filters and proceeds with no-match or
partial-coverage warnings. Claim audit is independent of analysis and report
generation; its Skill no longer prescribes Gate 2 approval or a frozen Study.

## Published resources

This is an independent resource release. Desktop **8.4.15** and DSH
`cb61e6caf4664e82fc4bf30e9a15d0d8bf32293a` remain selected. No desktop installer
was rebuilt. The signed public feeds contain 40 plugin/support entries and
281 Skills, retaining unrelated immutable resources.

| Resource | Version |
| --- | --- |
| plugin-base | 0.1.30 |
| plugin-extension-center | 0.1.19 |
| plugin-mcp | 0.2.30 |
| plugin-research | 0.1.27 |
| research-store (support package) | 4.1.5 |
| zerowall-faerskit | 0.1.1 |
| zerowall-research-orchestrator | 0.1.4 |
| zerowall-research-evidence | 0.1.4 |
| zerowall-claim-audit | 0.1.4 |
| zerowall-science-viewer | 0.1.0 |

Final cleanup archives were independently downloaded and verified:

| Archive | Bytes | SHA-256 |
| --- | ---: | --- |
| plugin-research 0.1.27 | 9898565 | `8f2d597589ce86b89da27a74ad8f2c882ba80a22573aa0955f5fe1adc837669d` |
| zerowall-claim-audit 0.1.4 | 1668 | `16cb805ccb14f375d3397b9141c883c7d0c7b24c3916b98b5ddf5d7d165c74df` |

There are 24 changed/new Skills across this release. The retired workbench
Skill is absent from the public catalog. Resource signatures, catalog and
archive sizes/SHA-256 are verified by the stage/promote/verify receipts under
`artifacts/release/8.4.15/publication/`; independent public downloads are
recorded under `artifacts/verification/8.4.15/faerskit-release/`.

- [Plugin pointer](https://zerowall.chengxunkeji.cn/stable/catalogs/plugin-latest.json)
- [Skill pointer](https://zerowall.chengxunkeji.cn/stable/catalogs/skill-latest.json)
- [Client source](https://github.com/ccfwwm/zerowallscience)
- [Canonical plugin source](https://github.com/ccfwwm/zerowall-dsh-plugins)

Canonical source is exported with the maintained `--update --source-only`
exporter, excluding dependencies, generated runtime, credentials and user data.
Current Skills source is `resources/extensions/skills/`; top-level exported
`skills/` and `catalogs/` are retained historical publication snapshots.

## Execution and model verification

The server runs faerskit **0.3.5**, source
`7898f402b7af330dd6f752e5af6b6f104fae9450`, with platform runtime
`6f0390f9bf0e49d2f7d28e769e379110ccd3e599`. Public HTTPS MCP acceptance used the
real `druginfo` database, which contains **20,690,897** reports with coverage
**2004Q1–2026Q2**. Citalopram and Torsade de pointes matched exact database
names; PS through 2026Q1 matched **118** distinct reports.

- CFun / Citalopram / TdP / PS / pair / through 2026Q1: job
  `20261030000600.998039-2ao1p3i08u2dcpe5`, succeeded, **25 files**.
- AFun / nonexistent drug / PS / pair / through 2026Q1: job
  `20261030000905.528421-9xjyedzoskirftql`, succeeded, **28 files**, zero matches.

Both preserved the original parameters, returned logs/Manifest and generated
`summary.json`, CSV and `faerskit_preflight.json`; actual download lengths and
SHA-256 matched the Manifest. The zero case retained its requested name and a
`no_match` warning. Detailed hashes are in the platform repository's matching
release record. These are engineering acceptance results, not causal findings.

The configured route `zerowall-ai-cloud-33-responses`, model `gpt-6.1-sol` and
effort `high` were preserved. A live provider call using the released prompts,
FAERS and claim-audit Skills selected `research_workflow`, described the FAERS analysis and
then generated a run call with CFun, Citalopram, TdP, PS, pair, 2026Q1 and
`confirm=true`, without a separate confirmation or audit request. Tool responses
in this prompt-routing check were acceptance fixtures; the two public jobs
above independently verify actual remote execution. No installed-desktop GUI
upgrade or future provider behavior is claimed by this check.

## Validation

Initial implementation checks: Research **329 passed, 3 skipped**; Research
Store **91 passed**; all plugin type checks and DSH/profile checks passed.
After removal of the two unused UI components, Research **320 passed, 3 skipped**
across 59 passing files (two files skipped), and type checks passed. The removed
components' nine tests were retired with their unused UI. Existing Host integration tests cover pending Gates
for FAERS, NHANES, genetics and Fiji and final-report generation with unverified
evidence. Unrelated execution errors remain failures.

The claim-audit Skill passed Skill Creator structural validation using UTF-8.
Profiles, DSH pin/inventory/runtime closure and source-export checks were
repeated. The generator was run after its fix, confirming that future generation
keeps the Research typecheck command valid.
