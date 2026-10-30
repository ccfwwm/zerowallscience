---
name: zerowall-claim-audit
description: 核查科研主张是否有可追溯证据支持，并在本次交付中标明已核验或未核验状态；不写入 Research 项目记录。
allowed-tools: read
metadata:
  zerowall:
    schema_version: 1
    version: 0.1.5
    source: bundled
    deterministic: true
    side_effects: none
---

# 主张审计

需要核验主张时，读取用户提供的文件、当前会话中已返回的产物和来源。软件不自动创建项目记录，也不提供持久化 claim/audit 服务。用户文字、搜索摘要和 Agent 推测都不是独立证据；不要猜测文件或运行 ID，也不要把相似研究或不同供者的数据当成同一队列的证据。

对每个待交付主张核对可追溯的 Run、Artifact、原始文件或外部来源，确认来源身份、时间、版本、样本范围、方法和校验摘要。缺少引用时保留缺口，不补引用、不修改数值，也不为让主张成立而追加未经授权的分析。

只有证据与主张一致、范围匹配且关键限制已处理时才标为“本次核验通过”；否则标为“未核验”并说明原因。这是交付中的审查结论，不是软件持久化状态、Study Gate 或系统审批。阴性和不确定结果可支持与其范围一致的主张。不得通过改写事实或补造证据来通过审查。
