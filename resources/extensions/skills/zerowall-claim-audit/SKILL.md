---
name: zerowall-claim-audit
description: ZeroWall Science 7.0.0 主张审计；用于研究交付前核查主张是否有同一研究内、可追溯且已复核的证据支持。
allowed-tools: read
metadata:
  zerowall:
    schema_version: 1
    version: 7.0.0-1
    source: bundled
    deterministic: true
    side_effects: read_write_research_record
---

# 主张审计

交付前主动加载本 Skill 并发现 `research_study` 实时 schema；Host 自动确保并关联当前工作区的研究上下文，无需用户先登记 Project 或创建 Study。读取真实的
`documents`，找到 `kind=claim` 的实际 claim ID 和版本；用户文字、搜索摘要和
Agent 推测都不是证据。不要猜测 ID，也不要把相似研究或不同供者的数据当作本研究证据。

对每个待交付主张核对：主张的 `evidenceIds` 非空且不重复；每条证据属于同一
study、`kind=evidence`，`needsReview` 不是 `true`，并且引用真实的 Run、Artifact、
Asset、Document 或 Source。缺少任何引用时保留失败原因，不补引用、不修改数值、
不为了让主张通过而运行新的分析。

调用确定性 Host 操作（替换为读取到的真实 ID）：

```json
{
  "action": "audit_claim",
  "study_id": "实际研究ID",
  "claim_id": "实际主张ID",
  "expected_version": 1
}
```

只接受 Host 返回的 `auditStatus`、`auditErrors` 和 `needsReview`。只有
`auditStatus=passed` 且 `needsReview=false` 的主张才能被 Host 纳入 Gate 2 自动校验。
Host 仅在所有相关 claim 都通过、证据属于当前冻结 Study 时，才可记录 Gate 2 系统
校验通过；这不是人工评审。缺失、未经核验、与主张冲突或无法支持主张的证据会阻止
Gate 2，须列明受影响阶段与恢复条件。经过核验的阴性或不确定结果可支持与其范围一致
的主张，应如实保留。Skill 不得自行批准门禁，也不得为通过而改写 claim 或补造证据。

交付记录应保留研究版本、Skill 的 `source`/版本、工具与 Runner 版本及证据 ID。
如果当前 Host 尚未自动写入这些字段，明确标记为待补功能，不在报告中假装已经登记。
