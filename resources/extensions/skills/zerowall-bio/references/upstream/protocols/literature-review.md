---
name: bio-proto-literature-review
domain: literature
inputs: [研究主题关键词]
outputs: [文献列表 + 结构化摘要 + 综述要点]
requires_network: true
language: python
---

# 文献调研工作流协议（语义工具版）

**适用场景**：新课题背景调研、方法学文献查证、为分析结论找文献支撑。

## 步骤

1. 用 `bio_pubmed_search` 检索主题（支持 PubMed 语法：`TP53[Title]`、`AND/OR`）
2. 挑相关 PMID，用 `bio_pubmed_abstract` 批量取结构化摘要
3. 汇总：研究问题 → 方法 → 主要发现 → 与当前任务的关联

## 工具调用序列

```
bio_pubmed_search term="CRISPR prime editing" retmax=10
bio_pubmed_abstract ids=["42595700","42589580",...]
```

## 检索式技巧

- 精确主题：`"prime editing"[Title/Abstract] AND review[Publication Type]`
- 限定年份：`AND 2023:2026[dp]`
- 排除噪声：`NOT "case report"[Publication Type]`

## 常见坑

- retmax 默认 10，综述调研可加到 30-50（限流已由插件内置）
- 摘要为空 = 无摘要（letter/editorial），跳过或标注
- 批量取摘要一次 ≤ 30 个 PMID，多了分批
- 结论引用文献时必须带 PMID/DOI——科学严谨性约束要求可溯源

## OpenAlex 检索（补充通道，2026-08-17 吸收 K-Dense citation-management 知识）

OpenAlex 是免费开放的学术元数据 API（**无需 key**），与 PubMed 互补：覆盖面更广（预印本/学位论文）、支持概念检索、引用计数现成。生物医学主题仍以 PubMed 为主，OpenAlex 用于：跨学科检索、找预印本、按引用量排序、按 DOI 反查元数据。

```python
import json, urllib.request, urllib.parse

def openalex_search(query, n=10, sort='cited_by_count:desc'):
    """OpenAlex 作品检索。返回 id/title/year/cited_by/doi/type。"""
    base = 'https://api.openalex.org/works'
    params = urllib.parse.urlencode({'search': query, 'per-page': n, 'sort': sort})
    url = f'{base}?{params}&mailto=shuaihao264@gmail.com'   # 礼貌参数，建议换成用户邮箱
    with urllib.request.urlopen(url, timeout=20) as r:
        data = json.loads(r.read().decode())
    out = []
    for w in data.get('results', []):
        out.append({
            'title': w.get('title'),
            'year': w.get('publication_year'),
            'cited_by': w.get('cited_by_count'),
            'doi': (w.get('doi') or '').removeprefix('https://doi.org/'),
            'type': w.get('type'),
            'oa_url': (w.get('open_access') or {}).get('oa_url'),
        })
    return out

# 按 DOI 反查
def openalex_by_doi(doi):
    url = 'https://api.openalex.org/works/https://doi.org/' + urllib.parse.quote(doi)
    with urllib.request.urlopen(url, timeout=20) as r:
        return json.loads(r.read().decode())
```

要点：
- `search=` 做全文/标题/摘要匹配；精确字段用 `filter=title.search:...`（见 OpenAlex 文档）。
- 过滤条件：`filter=publication_year:2023-2026,type:article`；生物学预印本用 `type:preprint`。
- OpenAlex 的引用计数口径宽松（含预印本/学位论文引用），只作影响力参考。
- 代理环境若 api.openalex.org 直连失败，bio_python 里给 urllib 加 ProxyHandler({}) 直连优先（同 ref_genome 模式）。

## 解读要点

- 按年份 + 期刊影响力加权判断结论可信度（顶刊 + 近期 > 其他）
- 综述（review）适合快速了解领域；原创研究（article）适合引用具体方法参数
- 输出建议用表格：PMID | 年份 | 期刊 | 核心发现一句话
