# P4 Phase 1: 建立 23 个领域组和 247 tools 固定 registry

## 目标

建立生命科学 MCP connectors 的固定 registry，定义 23 个领域组和 247 个 tools。

## 实施计划

### Phase 1: 基础结构

1. 创建 `runtime/connectors/` 目录结构
2. 定义 connector schema 和 TypeScript 类型
3. 创建 23 个领域组的 manifest 文件

### Phase 2: 领域组定义

23 个领域组：

1. literature - 文献检索
2. clinical-trials - 临床试验
3. genomics - 基因组
4. variants - 变异数据
5. gene-expression - 基因表达
6. proteomics - 蛋白质组
7. protein-structure - 蛋白质结构
8. protein-interactions - 蛋白质相互作用
9. chemistry - 化学数据库
10. drug-discovery - 药物发现
11. metabolomics - 代谢组学
12. transcriptomics - 转录组学
13. single-cell - 单细胞分析
14. imaging - 生物成像
15. pathways - 信号通路
16. ontology - 本体论/注释
17. taxonomy - 分类学
18. epidemiology - 流行病学
19. regulatory - 监管数据
20. biobanks - 生物样本库
21. cell-lines - 细胞系
22. antibodies - 抗体数据
23. assays - 生物检测

### Phase 3: Tool Registry

- 为每个领域组定义 tools 列表（共 247 个）
- Schema 验证
- Tool name 唯一性检查
- 公共/私有工具标记

### Phase 4: Connector Catalog

- 整合现有 SCIENCE_CONNECTORS (8个)
- 扩展为完整的 23 组 MCP
- 添加 Rakserver 对照 fixtures

## 文件清单

```
runtime/connectors/
├── schema.ts                  # Connector schema 定义
├── types.ts                   # TypeScript 类型
├── registry.ts                # 247 tools 注册表
├── catalog.ts                 # Connector 目录
├── life-science/
│   ├── literature/
│   │   └── manifest.yaml
│   ├── clinical-trials/
│   │   └── manifest.yaml
│   ├── genomics/
│   │   └── manifest.yaml
│   └── ... (20 more groups)
└── fixtures/
    └── rakserver-contracts/   # Rakserver 行为对照
```

## 验收标准

- ✅ 23 个领域组 manifest 创建
- ✅ 247 个 tools 定义完整
- ✅ Schema 可解析
- ✅ Tool name 无冲突
- ✅ 类型检查通过
