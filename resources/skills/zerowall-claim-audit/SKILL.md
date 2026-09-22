---
name: zerowall-claim-audit
description: ZeroWall Science 7.0.0 主张审计；用于研究交付前核查主张是否有同一研究内、可追溯且已复核的证据支持。
allowed-tools: tool_search tool_dispatch read
metadata:
  zerowall:
    schema_version: 1
    version: 7.0.0-1
    source: bundled
    deterministic: true
    side_effects: read_write_research_record
---

# 主张审计

只在研究已有主张和证据记录时使用。先发现 `research_study`，读取真实的
`documents`，找到 `kind=claim` 的实际 claim ID 和版本；用户文字、搜索摘要和
Agent 推测都不是证据。不要猜测 ID，也不要把相似研究或不同供者的数据当作本研究证据。

对每个待交付主张核对：主张的 `evidenceIds` 非空且不重复；每条证据属于同一
study、`kind=evidence`，`needsReview` 不是 `true`，并且引用真实的 Run、Artifact、
Asset、Document 或 Source。缺少任何引用时保留失败原因，不补引用、不修改数值、
不为了让主张通过而运行新的分析。

调用确定性 Host 操作（替换为读取到的真实 ID）：

```json
{
  "name": "research_study",
  "arguments": {
    "action": "audit_claim",
    "study_id": "实际研究ID",
    "claim_id": "实际主张ID",
    "expected_version": 1
  }
}
```

只接受 Host 返回的 `auditStatus`、`auditErrors` 和 `needsReview`。只有
`auditStatus=passed` 且 `needsReview=false` 的主张才能进入第二个人工科研门禁。
失败、冲突、阴性和证据不足必须继续显示。审计结果本身不等于人工认可，不能由
Skill 自行批准 Gate 2。

交付记录应保留研究版本、Skill 的 `source`/版本、工具与 Runner 版本及证据 ID。
如果当前 Host 尚未自动写入这些字段，明确标记为待补功能，不在报告中假装已经登记。
