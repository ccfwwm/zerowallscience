---
name: bio-proto-enrichment-workflow
domain: functional-analysis
inputs: [基因符号列表]
outputs: [富集通路/GO term + p 值 + 解读]
requires_network: true
language: python
---

# 富集分析工作流协议（语义工具版）

**适用场景**：差异表达基因列表、CRISPR 筛选 hits、共表达模块——"这组基因在功能上指向什么"。

## 步骤

1. 整理基因符号列表（5-500 个，去掉重复）
2. 用 `bio_enrichr` 跑多个库：GO_BP → 功能过程；KEGG → 通路；Reactome → 信号级联
3. 按 adjusted_p_value 升序取 top，交叉解读

## 工具调用序列

```
bio_enrichr genes=["TP53","BRCA1","EGFR",...] library="GO_Biological_Process_2023" top=10
bio_enrichr genes=[...] library="KEGG_2021_Human" top=10
bio_enrichr genes=[...] library="Reactome_2022" top=10   # 可选交叉验证
```

## 常见坑

- 基因符号要统一物种与命名（人源大写；小鼠首字母大写；其他物种先转 human ortholog）
- 同一物种内 GO 库与 KEGG 库的 p 值不可直接比较（背景集不同），分别报告
- `adjusted_p_value` 才是多重校正后的结论依据，别拿 raw p 值讲故事
- 基因数 < 5 富集意义弱；> 2000 背景校正失真

## 解读要点（科学严谨性约束）

- 报告格式：通路名 + adjusted p 值 + 重叠基因数/总命中数 + combined score
- 富集到「癌症相关通路」≠ 这组基因致癌——只能说与已知通路的成员重叠
- 结合基因已知功能交叉验证：如富集到 DNA repair 且列表里有 BRCA1/TP53，结论才自洽
- 结论标注证据来源（Enrichr + library 名 + 日期），如需文献支撑接 literature-review 协议

## 进阶解读（2026-08-17 吸收 K-Dense pathway-enrichment / ontology 知识）

### 背景集与 p 值可解释性

- ORA 的 p 值强烈依赖**背景集**（universe）：Enrichr 各库背景不同，GO 与 KEGG 的 p 值不可直接比较——分别报告，不比大小。
- 基因列表 < 5 富集意义弱；> 2000 校正失真（背景几乎被抽空）。列表来自差异表达时，应只取显著基因（DE 阈值后的列表）而非全部测到的基因。

### 冗余消除（top 结果里全是相似 GO term？）

GO 条目天然层次重叠（如「DNA 修复」与「双链断裂修复」同时显著）。消除冗余：

1. 同一父术语下的子术语簇只保留**最特异且显著**的一个（p 最小者）；
2. 用基因重叠判断：两个 term 的重叠基因 > 70% 视为同一信号，保留 p 更小者；
3. 总结时按**功能主题**归并（DNA 修复 / 细胞周期 / 免疫应答…），每主题报 1-2 个代表 term，而不是列 30 条相似条目；
4. 语义相似度归并可用 REVIGO（网页服务）——bio_python 可 urllib 提交，或按上述启发式手工归并。

### 术语消歧（基因符号/术语不统一时）

- 人源大写（TP53）、小鼠首字母大写（Tp53）、其他物种先转 human ortholog。
- GO/疾病/表型术语有多种 ID 体系（GO:0006281 vs 中文名 vs 别名）——需要权威解析时用 EBI OLS4 REST（无需 key）：

```python
import json, urllib.request
url = ('https://www.ebi.ac.uk/ols4/api/search?q='
       + urllib.parse.quote('double-strand break repair') + '&ontology=go')
with urllib.request.urlopen(url, timeout=20) as r:
    docs = json.loads(r.read().decode())['response']['docs']
for d in docs[:5]:
    print(d.get('obo_id'), '|', d.get('label'), '|', d.get('ontology_name'))
```

### 与 GSEA 的关系（何时用哪种）

- ORA（Enrichr）：输入是**基因列表**（阈值截断后）——信息有损但简单。
- GSEA/ranked：输入是**全基因组排序**（按 log2FC）——不丢信息、能检出"整体弱趋势"。
- 插件当前只有 ORA 工具（bio_enrichr）；用户提供排序数据时可用 bio_python 手写 GSEA（纯 numpy 可行但繁琐）或如实告知走外部 gseapy（不在插件环境）。
