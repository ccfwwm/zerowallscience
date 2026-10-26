# clinical risk scoring

Compute and interpret validated bedside clinical risk scores and pretest probabilities for an INDIVIDUAL patient — pick the right score for the scenario, gather inputs, run the deterministic calculator tool, and read the result against an interpretation table. Covers CHA2DS2-VASc (AF stroke risk), HAS-BLED (bleeding on anticoagulation), CURB-65 (pneumonia severity / admit decision), qSOFA (sepsis screen), Child-Pugh + MELD-Na (cirrhosis severity / transplant priority), Wells DVT and Wells PE (VTE pretest probability), ASCVD (10-year cardiovascular risk / statin decision), and eGFR CKD-EPI (kidney function / drug dosing). Use when asked things like "stroke risk for this AF patient", "should this patient be anticoagulated", "pneumonia severity — admit or not?", "sepsis screen this patient", "DVT/PE pretest probability", "10-year cardiovascular risk", "cirrhosis severity / MELD score", or "eGFR / kidney function". Pairs CHA2DS2-VASc with HAS-BLED to weigh anticoagulation. NOT for polygenic/genetic risk (use tooluniverse-polygenic-risk-score), NOT for population-level epidemiology/incidence (use tooluniverse-epidemiological-analysis), and NOT for diagnostic test sensitivity/specificity/likelihood-ratio math (use tooluniverse-diagnostic-test-evaluation).

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Step 1 — Map the scenario to the score(s)
- Step 2 — Gather the required inputs
- Step 3 — Compute
- Step 4 — Interpret (per-score tables)
- CHA2DS2-VASc (stroke risk in AF, 0–9)
- HAS-BLED (major bleeding on anticoagulation, 0–9)
- How to weigh CHA2DS2-VASc + HAS-BLED together
- CURB-65 (CAP severity, 0–5)
- qSOFA (sepsis screen, 0–3)
- Child-Pugh (cirrhosis severity, class A/B/C)
- MELD-Na (90-day mortality / transplant priority, 6–40)
- Wells DVT (pretest probability)
- Wells PE (pretest probability)
- ASCVD 10-year risk (%)
- eGFR CKD-EPI (mL/min/1.73m^2) → CKD stage
- Worked example A — Atrial fibrillation, weigh anticoagulation (paired)
- Worked example B — Cirrhosis severity and transplant priority (paired)
- Completeness checklist
- LIMITATIONS

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ClinicalCalc_ASCVD_risk`
- `tooluniverse.tool.ClinicalCalc_CHA2DS2_VASc`
- `tooluniverse.tool.ClinicalCalc_CURB_65`
- `tooluniverse.tool.ClinicalCalc_Child_Pugh`
- `tooluniverse.tool.ClinicalCalc_HAS_BLED`
- `tooluniverse.tool.ClinicalCalc_MELD_Na`
- `tooluniverse.tool.ClinicalCalc_Wells_DVT`
- `tooluniverse.tool.ClinicalCalc_Wells_PE`
- `tooluniverse.tool.ClinicalCalc_eGFR_CKD_EPI`
- `tooluniverse.tool.ClinicalCalc_qSOFA`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-clinical-risk-scoring/SKILL.md)；Apache-2.0；原文 SHA-256：`86fe30ed7b92de547c4d2cc3727a81e931416f97af8f95ca178a63448a48a904`。
