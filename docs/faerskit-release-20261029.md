# FAERS plugin and Skills release — 2026-10-29

Historical initial FAERS publication. The current conversation Research and
automatic-preflight release is recorded in [2026-10-30](faerskit-release-20261030.md).

## Source baseline and scope

- Branch: `main`; parent HEAD: `c972eeba8fa079910b64733ec07b17a64250a2cf`.
- Desktop contract: `8.4.14`; existing artifact build ID:
  `1793204809408-11ec2ef4`. This is an independent resource publication.
- DSH pin: `cb61e6caf4664e82fc4bf30e9a15d0d8bf32293a`, `0.2.1-rc.2`.
- Canonical plugin source: `zerowall-dsh-plugins`, commits `69f0b796` and
  `6443f58b`, exported with the maintained source exporter and provenance.
- Existing source edits are included, as authorized. Build output, credentials
  and user data are excluded from Git.

The MCP plugin now discovers `r.faerskit`, treats status as a query, persists the
shared R job lifecycle, resumes local run IDs, cancels jobs, and exposes project
artifact references. A new Skill explains the 14 supported Fun functions,
period codes, parameter differences and evidence limitations. Existing RMCP
entry points and generated operation references are synchronized.

Publication tooling now bounds long receipt filenames on Windows. Selective
source export hashes retained files sequentially to avoid exhausting Windows
file handles in the large canonical source repository.

## Published resources

| Resource | Version | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| MCP plugin | 0.2.29 | 390073 | `0271b6e75f06d023f514576147d2d8faf9ace5f97cb674dfd25191e40b3b42a3` |
| zerowall-faerskit | 0.1.0 | 10409 | `78e4a8e3dd605e934c7f8d81ffc181b96a540a787b4b179ffaae8cac9a10ca1a` |

- [Plugin archive](https://zerowall.chengxunkeji.cn/stable/plugins/plugin-mcp/0.2.29/zerowallscience-plugin-mcp-0.2.29.tgz)
- [FAERS Skill archive](https://zerowall.chengxunkeji.cn/stable/skills/zerowall-faerskit/0.1.0/zerowall-faerskit.tgz)
- [Plugin pointer](https://zerowall.chengxunkeji.cn/stable/catalogs/plugin-latest.json)
- [Skill pointer](https://zerowall.chengxunkeji.cn/stable/catalogs/skill-latest.json)

The plugin feed contains 40 entries and the Skill feed 281 entries. Changed
Skills (14): sc-tenifold-knockout 0.1.5; zerowall-geo 0.1.6;
zerowall-mcp-guide 0.1.4; zerowall-mr 0.1.5; zerowall-nhanes 0.1.6;
zerowall-omicverse 0.1.6; zerowall-r-files 0.1.7; zerowall-r-packages 0.1.6;
zerowall-rbioagent 0.1.6; zerowall-rmcp 0.1.6; zerowall-rplatform 0.1.6;
zerowall-rplotfigure 0.1.5; zerowall-tooluniverse 0.1.5; zerowall-faerskit 0.1.0.

Targeted generation merged current signed public catalogs. Qiniu stage,
promote and verify passed for both kinds, including all retained immutable
objects. Independently downloaded plugin/Skill archives, catalog signatures,
lengths, hashes and archive entries passed inspection. Resource publication did
not write the desktop update pointer.

Artifacts:

- `artifacts/release/plugins/plugin-mcp/0.2.29/zerowallscience-plugin-mcp-0.2.29.tgz`
- `artifacts/release/8.4.14/skills/zerowall-faerskit/0.1.0/zerowall-faerskit.tgz`
- `artifacts/release/8.4.14/publication/` — signed publication receipts.
- `artifacts/verification/8.4.14/faerskit-release/public-archive-verification.json`.
- `artifacts/logs/8.4.14/faerskit-*.log` — build, test and publication evidence.

## Checks and limits

Passed: `pnpm version:check`, `pnpm profiles:check`, `pnpm dsh:inventory`,
`pnpm dsh:verify`, `pnpm dsh:runtime:closure`, `pnpm typecheck`,
`pnpm plugins:typecheck`, MCP bundling and targeted immutable packaging,
`pnpm release:metadata`, and generated workflow/reference drift checks.

- MCP plugin tests: **106 passed, 2 skipped**.
- Security tests: **2 passed**.
- Update tests: **297 passed, 4 skipped**.
- Source exporter tests: **9 passed**; both actual source exports passed.
- Skill structure validation passed; changed FAERS/RMCP entry references have
  no broken links. The broad audit reports 24 links elsewhere for follow-up.
- Broad plugin suite: **1384 passed, 16 failed, 9 skipped**, plus three WeChat
  suites that could not import missing DSH dependencies. Failures are in seven
  test files: WeChat imports and research tests requiring the managed Python
  environment/NumPy. They are outside the changed MCP implementation and are
  recorded rather than presented as a passing full suite.

A new desktop installer and a full desktop GUI install/update/rollback session
were not run. Existing installer bytes were not rebuilt. Actual published
resource verification, MCP workflow lifecycle regression, update-service tests
and public server execution are the acceptance evidence for this publication.

The server runs faerskit **0.3.2**. Its public MCP acceptance job
`20261029130538.079797-acxt2jms485pdldl` succeeded with 27 files and verified
summary/CSV hashes. This small selected cohort had no demographic rows; the
result is engineering acceptance, not a scientific conclusion. See the server
repository's `docs/faerskit-release-20261029.md` for deployment and backups.
