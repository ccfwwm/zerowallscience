# NOTICE — 署名 / Attribution

## 本仓库是什么 / What this is

`dsh-academic-research-skills` 是 DeepSeek Harness（DSH）插件形态的
**Academic Research Skills (ARS)** 移植版。ARS 原本是 Claude Code 插件
（research → write → review → revise → finalize 的契约审计学术流水线）。
本包将其 4 个技能与 16 个斜杠命令移植为 DSH 技能注册。

This repository is a DeepSeek Harness (DSH) plugin port of
**Academic Research Skills (ARS)**, originally a Claude Code plugin providing a
contract-audited academic research pipeline
(research → write → review → revise → finalize).

## 上游项目 / Upstream

| 项 | 值 |
| --- | --- |
| 项目 / Project | Academic Research Skills |
| 作者 / Author | Cheng-I Wu |
| 作者主页 / Author URL | https://github.com/Imbad0202 |
| 上游仓库 / Upstream repo | https://github.com/Imbad0202/academic-research-skills |
| 上游版本 / Upstream version | 3.21.2 |
| 上游提交 / Upstream commit | `8fa3d651ad45da9e02762a6ba1fa3d1f231f91b6` |
| 上游许可 / Upstream license | [CC-BY-NC-4.0](academic-research-skills-LICENSE.txt) |

## 内容归属 / Content ownership

- 本包中的 4 个技能包（`resources/skills/deep-research`、`resources/skills/academic-paper`、
  `resources/skills/academic-paper-reviewer`、`resources/skills/academic-pipeline`，含其
  `SKILL.md`、`agents/`、`references/`、`templates/`、`examples/`）以及
  16 个命令定义（`resources/skills/ars-*`）**全部衍生自上游项目**，继续以
  **CC-BY-NC-4.0** 授权。任何再分发须保留本署名并仅限非商业用途。
- 移植层（`lib/startup.js`、`cordis.patch.yml`、打包与文档）为
  `nullptr-DZF` 的新增作品，为保持一致同样以 **CC-BY-NC-4.0** 发布。

The 4 skill bundles and 16 command definitions in this package are **derived
from the upstream project** and remain licensed under **CC-BY-NC-4.0**; any
redistribution must retain this attribution and stay non-commercial. The
porting layer (registrar, bundle patch, packaging, docs) is new work by
`nullptr-DZF`, released under the same license for consistency.

## 打包者 / Packager

- GitHub: https://github.com/nullptr-DZF
- 本仓库 / This repo: https://github.com/nullptr-DZF/dsh-academic-research-skills

## DSH 适配来源 / DSH port source

- DSH adapter: https://github.com/nullptr-DZF/dsh-academic-research-skills
- Adapter commit: `a6859a3752cfe582a166ca283c10d3a45e1f9c9c`
- Hooks are intentionally omitted because DSH has no Claude Code hook system; file protection remains provided by the DSH file sandbox.
- Deterministic Python scripts and their dependencies remain in the upstream ARS checkout and are not bundled here.
