# product safety surveillance

- Post-market safety surveillance and recall/adverse-event RETRIEVAL across the full spectrum of FDA-regulated products that are NOT covered by the drug-AE signal skills: medical devices, food / dietary supplements / cosmetics, veterinary drugs, and drug supply (shortages). Orchestrates openFDA endpoints (MAUDE device adverse events + device recalls + 510(k), CAERS food/supplement/ cosmetic adverse events, veterinary adverse events, drug shortages, and cross-product enforcement/recall reports). USE WHEN the user asks: "are there adverse events for [device / pacemaker / infusion pump / insulin pump]", "device recalls for [firm/product]", "supplement / vitamin / cosmetic adverse reactions", "is [drug] in shortage", "what injectables are on shortage", "veterinary / animal adverse events for [drug] in [dog/cat/horse]", "food recall for listeria", "MAUDE report for [device]", "CAERS reactions for [brand]". DO NOT USE for drug adverse-event SIGNAL detection or disproportionality (PRR / ROR / IC) or drug-AE association scoring — that is `tooluniverse-pharmacovigilance` / `tooluniverse-adverse-event-detection`. This skill is multi-product surveillance and retrieval, not drug-AE statistical signal mining.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to Use vs When NOT to Use
- Tool Map (which tool for which question)
- openFDA Query Grammar (CRITICAL — read before querying)
- Interpretation Tables (raw openFDA field → meaning)
- Medical devices — MAUDE adverse events (`/device/event.json`)
- Medical devices — recalls (`/device/recall.json`)
- Enforcement reports (device / drug / food `/.../enforcement.json`)
- Food / supplement / cosmetic — CAERS adverse events (`/food/event.json`)
- Veterinary — animal drug adverse events (`/animalandveterinary/event.json`)
- Drug shortages (`/drug/shortages.json`)
- Workflow
- Worked Examples (verified live)
- Example 1 — Device deaths for a device type (MAUDE)
- Example 2 — Device recalls for a firm
- Example 3 — Drug shortage lookup for an injectable
- Example 4 — Supplement / cosmetic CAERS reactions
- Example 5 — Veterinary adverse events for a drug in a species
- Limitations (state these in every report)

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.OpenFDADevice_get_classification`
- `tooluniverse.tool.OpenFDADevice_search_pma`
- `tooluniverse.tool.OpenFDADevice_search_recalls`
- `tooluniverse.tool.OpenFDADevice_search_udi`
- `tooluniverse.tool.OpenFDA_search_animalvet_adverse_events`
- `tooluniverse.tool.OpenFDA_search_device_510k`
- `tooluniverse.tool.OpenFDA_search_device_adverse_events`
- `tooluniverse.tool.OpenFDA_search_device_enforcement`
- `tooluniverse.tool.OpenFDA_search_device_recalls`
- `tooluniverse.tool.OpenFDA_search_drug_enforcement`
- `tooluniverse.tool.OpenFDA_search_drug_events`
- `tooluniverse.tool.OpenFDA_search_drug_labels`
- `tooluniverse.tool.OpenFDA_search_drug_shortages`
- `tooluniverse.tool.OpenFDA_search_food_adverse_events`
- `tooluniverse.tool.OpenFDA_search_food_enforcement`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-product-safety-surveillance/SKILL.md)；Apache-2.0；原文 SHA-256：`852b0f8849e36e3373450d6f11b24d919ebdaccb1692a5c05e422d8b38f6a281`。
