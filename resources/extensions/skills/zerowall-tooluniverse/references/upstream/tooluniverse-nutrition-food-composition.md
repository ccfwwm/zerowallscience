# nutrition food composition

Look up nutrient composition, ingredients, allergens, additives, and processing-level classification for foods and branded products via USDA FoodData Central (authoritative US nutrient values, generic + branded foods) and Open Food Facts (crowdsourced global product database — barcode lookup, allergens, additives, Nutri-Score, NOVA processing classification). Use when someone asks 'how much [nutrient] is in [food]', 'what are the ingredients/allergens in [branded product]', 'look up this barcode', 'find products containing/free of [additive/allergen]', or needs dietary/nutrient data for a clinical or research calculation.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to Use This Skill
- 1. USDA FoodData Central — Authoritative US Nutrient Values
- 2. Open Food Facts — Crowdsourced Global Product Database
- When to Use Which
- Common Pitfalls

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.FDC_API_KEY`
- `tooluniverse.tool.FoodDataCentral_get_food`
- `tooluniverse.tool.FoodDataCentral_search_foods`
- `tooluniverse.tool.OpenFoodFacts_filter_products_by_tags`
- `tooluniverse.tool.OpenFoodFacts_get_product`
- `tooluniverse.tool.OpenFoodFacts_search_products`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-nutrition-food-composition/SKILL.md)；Apache-2.0；原文 SHA-256：`d1fab5ac3dda5c6e4cbcc8d9a0fbcdf79e5eaa693f84db99bb560c1e8fb128ff`。
