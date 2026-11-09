# 文献发现与核验

检索词：EuropePMC、PubMed、Crossref、OpenAlex、Semantic Scholar。先确定研究问题、日期范围和纳排条件，按数据库真实 schema 搜索并分页，保留实际总数和检索式。按 DOI/PMID 去重，核对标题、作者、年份和撤稿信息。摘要用于筛选，不能作为已阅读全文的证据。

用 research_workflow 搜索关键词 `EuropePMC search articles`，describe 原始能力后运行；示例底层参数为 `query=BRCA1, limit=1`，应以当前 schema 为准。结果写入项目产物，后续综述流程读取经核验记录及来源。下载全文另走已有论文获取流程，记录合法可用的全文地址和失败原因。

固定上游的相关研究任务可按需从[工作流导航](upstream/literature.md)选择。每个摘要保留原文链接、摘要 SHA-256、阶段结构和固定 SDK 工具候选，执行仍以实时 schema 为准。
