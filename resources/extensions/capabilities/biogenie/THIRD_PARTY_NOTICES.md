# Biopython 许可声明

本插件通过隔离的 Python 虚拟环境使用 **Biopython**（以及 numpy），
并可能随插件分发其 wheel 包。

Biopython 采用双许可：

1. **Biopython License Agreement**（默认，宽松许可）
2. **BSD 3-Clause License**（部分文件可选）

两者均允许：复制、修改、分发、商业使用，无需付费。

条件：
- 保留版权声明（本文件即满足）
- 不得使用 Biopython 贡献者姓名进行广告背书

完整许可文本：
- https://github.com/biopython/biopython/blob/master/LICENSE.rst
- 或本地克隆：`D:\Program\Github\biopython\LICENSE.rst`

---

**注意**：本插件刻意**不包含 BioSQL 模块**。BioSQL 采用 LGPL v3.0
许可（弱 copyleft），为保持插件整体宽松许可，已将其排除。

---

# scipilot-figure-skill 许可声明

本插件的 `python/figurelib/`（setup_style.py / profile_data.py /
export_figure.py / check_figure.py / layout_tools.py / visual_qa.py）
吸收自 [Haojae/scipilot-figure-skill](https://github.com/Haojae/scipilot-figure-skill)
（基线 commit `43098ddb9e6a6d142218540c114f9ed38922fc42`，2026-06-15）。

**MIT License** — Copyright (c) 2026 Haojae

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.

---

# K-Dense scientific-agent-skills 许可声明

本插件的 `python/figurelib/assets/`（nature/publication/presentation.mplstyle、
publisher_profiles.json、color_palettes.py）吸收自
[K-Dense-AI/scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills)
的 scientific-visualization skill（基线 commit
`991bd993aca4e90891d1f9908ba82ef45d77b6f0`，2026-08-07）。
知识型内容（坐标系统、统计检验、富集解读、文献检索策略）经重写吸收
进 skills/ 协议文档，出处已标注在对应协议正文。

**MIT License** — Copyright (c) 2025 K-Dense Inc.

（许可全文与上文 scipilot 条目一致，MIT 标准文本）

---

<!-- R/Bioconductor 生态许可声明已随 R 引擎移除（2026-08）一并删除；
     历史决策记录存于仓库外内部文档，不随插件分发。 -->

---

# aipoch/medical-research-skills 许可声明

本插件 `skills/` 下的以下内容吸收自
[aipoch/medical-research-skills](https://github.com/aipoch/medical-research-skills)
（基线 commit `f5ef65b9bea79b6dd9553f52f95b0d08f7d64d26`，2026-09-11 核验，MIT 许可）：

| 落点 | 来源 skill | 吸收方式 |
|---|---|---|
| `skills/bio-evidence-appraisal.md` | `Evidence Insight/evidence-level-ranker` + `Evidence Insight/scientific-critical-thinking` | 改造（重写为分子生物/合成生物学口径） |
| `skills/bio-literature-review.md`（§三–§五） | `Academic Writing/systematic-review` + `Evidence Insight/rct-bias-assessment-rob2` | 改造（剥离平台耦合，补工具选择表与实测 PMID） |
| `skills/protocols/statistics.md`（§四–§五、§八） | `Protocol Design/sample-size-and-power-planning-assistant` + `Data Analysis/statistical-analysis` | 改造（临床口径→生物学重复口径，配方实测） |

以下内容**仅参考思路、未复制文本**：`skill-auditor`（MedSkillAudit）——
本插件 `scripts/test-skills.mjs` 的静态质量门与棘轮基线机制参考其「否决门 + 分级评分」

**MIT License** — Copyright (c) 2026 AIpoch

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.

---

> 完整吸收台账（含基线 commit、改造摘要、候选仓库裁决）见仓库根 `SKILL-PROVENANCE.yaml`。

---

# jaechang-hits/SciAgent-Skills 许可声明

本插件 `skills/` 下的以下内容吸收自
[jaechang-hits/SciAgent-Skills](https://github.com/jaechang-hits/SciAgent-Skills)
（基线 commit `fe505cae14d20b6c33be2e49666425be98f005bb`，2026-09-11 核验）：

| 落点 | 来源 skill | 许可 | 吸收方式 |
|---|---|---|---|
| `skills/bio-figure.md`（期刊规格速查） | `scientific-writing/*-figure-guide`（9 个期刊规格） | **CC-BY-4.0** | 仅取规格事实，**逐条对官方页复核后重写**（复核发现其 Science/PNAS 栏宽与官方页不符，已改用官方值） |
| `skills/protocols/pub-figure.md`（显著性标注配方） | `data-visualization/statistical-significance-annotation` | **CC-BY-4.0** | 取星号约定与校正/选择纪律，重写为实现配方 |

未使用：`data-visualization/multipanel`（**Proprietary, HITS Inc.**）——本插件多面板配方为自行编写。
仓库根另有部分 GPL/AGPL/CC-BY-NC 系 skill，本插件**一律未取用**（逐条许可审计见 `SKILL-PROVENANCE.yaml`）。

**CC-BY-4.0** — Copyright (c) jaechang-hits。许可全文：https://creativecommons.org/licenses/by/4.0/legalcode
（CC-BY 要求署名：本节即署名与来源声明；修改后的内容标注在各 skill 正文末尾的 HTML 注释中。）
