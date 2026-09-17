# zotero-harvest — Zotero 文献采集入库插件（DSH external plugin）

zotero-harvest 把"检索文献 → 判断够不够 → 存进本地 Zotero → 让 zotero-wave-rag 能检索到"这条链路做成
**6 个纯确定性工具**（无 LLM 依赖），机制取自 AgentLaboratory / STORM / PaperQA / Anaxa：

- **检索原语化**（AgentLab）：`lit_fetch` 一次取多源结果
- **高精度命中 + 下载链接**（参考 paper-qa 的 OpenAlex/Crossref/Unpaywall 客户端设计）：
  - query 传 **DOI 或 arXiv id 直接精确定位**该文献（OpenAlex `doi:` 过滤 / arXiv id_list / Crossref DOI）
  - 每篇结果解析 **OA 下载链接**：arXiv/Europe PMC/OpenAlex 直链 + **Unpaywall**（DOI→最佳 OA PDF + 全部 OA 位置）
  - `open_access_only` 过滤、`sort_by: relevance|citations`
- **充分性判定 = 配额 + 覆盖审计**（Anaxa + AgentLab）：`lit_sufficiency_check`
- **缺口显式化**（STORM）：审计输出 `gaps` + 由缺口推导下一轮查询
- **循环驱动 + 预算上限**（AgentLab）：`lit_review_run` 凑够配额或预算耗尽即停
- **入库**：Zotero 本地 API（桌面运行）→ 离线 sqlite 直写（桌面关闭）→ inbox（RIS/BibTeX+PDF）
- **与 RAG 打通**：入库后触发 zotero-wave-rag 增量重建，`zotero_search` 立即可检索新文献

## 数据源（全部免费 API，实测可达）

| 来源 | 用途 | Key |
|---|---|---|
| OpenAlex（api.openalex.org） | 主检索 + OA 状态 + best_oa pdf + DOI 精确查询 | 免 key |
| arXiv（export.arxiv.org） | 预印本 + 全文 PDF 直链 + id 精确定位 | 免 key |
| Crossref（api.crossref.org） | DOI 元数据 + DOI 精确查询 | 免 key |
| Europe PMC（ebi.ac.uk/europepmc） | 生物医学文献 + PDF 直链 | 免 key |
| Unpaywall（api.unpaywall.org） | DOI → OA 全文链接解析（下载链接的关键来源） | 免 key（polite pool，需邮箱） |
| Semantic Scholar | **默认源**；`LIT_S2_API_KEY` 可提升额度（无 key 限流严格，429 自动降级不影响其他源） | 免 key |
| Google Scholar（`scholar`） | **可选源**：Google Scholar 无官方 API，此为 HTML 抓取（curl 走 `LIT_SCHOLAR_PROXY`）；需代理可达 google.com 且出口为**住宅 IP**，否则抛清晰错误（captcha/不可达）而非垃圾结果 | 免 key |

## 工具

| 工具 | 参数 | 说明 |
|---|---|---|
| `lit_fetch` | `query`（支持 DOI/arXiv id 精确定位）, `sources?`（含可选 `scholar`）, `max?`, `min_year?`, `max_year?`, `open_access_only?`, `resolve_downloads?`(默认 true), `sort_by?` | 多源检索 + 去重排序 + **解析每篇的 OA 下载链接**，返回 `downloadLinks[]` + `primaryDownloadUrl` |
| `lit_paper_detail` | `title` 必填, `pdf_url?`, `source?`, `id?`, ... | 下载 PDF → pdftotext 抽全文 → 确定性提取摘要/关键词/章节/方法类型 → 证据卡 |
| `lit_save` | `papers[]` 必填, `mode?`(auto/zotero-api/sqlite/inbox), `collection?` | 入库 Zotero，DOI/标题去重，PDF 附件自动挂载（优先 primaryDownloadUrl） |
| `lit_sufficiency_check` | `topic`, `subtopics?`, `collected[]`, `min_core?`, `min_total?` | 配额 + 子主题覆盖审计 → `{sufficient, gaps, additionalQueries}` |
| `lit_download_links` | `papers[]` 必填 | 批量解析 OA 下载链接（已有直链 + Unpaywall DOI 查询）→ 每篇 `downloadLinks` + `primaryDownloadUrl`，交给用户下载 |
| `lit_review_run` | `topic`, `subtopics?`, `max_rounds?`, `per_round?`, `save_mode?`, `run_reindex?` | 完整循环：fetch → 审计 → 不足则按 gaps 继续 → 达标/预算耗尽 → 保存（含 PDF 附件）→ 触发重建 |

## 配置

优先级：运行时配置文件 > 环境变量 > 默认值。

- 运行时配置 `~/.config/lit-harvest/config.json`：
  `{"dataDir": "/path/to/zotero", "minCorePapers": 5, "minTotalPapers": 10, "maxRounds": 3, "autoReindex": true}`
- 环境变量：`LIT_DATA_DIR`、`LIT_INBOX_DIR`、`LIT_MIN_CORE`、`LIT_MIN_TOTAL`、`LIT_MAX_ROUNDS`、
  `LIT_AUTO_REINDEX`、`LIT_S2_API_KEY`、`LIT_UNPAYWALL_EMAIL`（默认 `lit-harvest@users.noreply.github.com`）、
  `LIT_RESOLVE_DOWNLOADS`、`LIT_SCHOLAR_PROXY`（可选 scholar 源的 HTTP 代理，如 `http://<proxy-host>:7890`）、`LIT_ZWR_DIR`
- **Zotero 数据目录与 zotero-wave-rag 共享**：优先读 `ZWR_DATA_DIR` /
  `~/.config/zotero-wave-rag/config.json` 的 `dataDir`（本机即 `<zotero-data-dir>`，如 Windows 侧的 `C:\Users\<user>\Zotero`），
  无需额外配置即可入库真实库。

## 保存模式

- `zotero-api`：Zotero 桌面运行时走本地 HTTP API（`127.0.0.1:23119`），创建条目 + 上传 PDF 附件
- `sqlite`：桌面未运行时直接写 `zotero.sqlite`（**仅当 Zotero 未运行**；introspection 驱动插入，
  兼容真实 Zotero 6/7 schema；DOI/标题去重，从不更新/删除已有行，单事务提交）
- `inbox`：不可写时落 `~/.local/share/lit-harvest/inbox/<slug>/`（paper.json + citation.ris +
  citation.bib + paper.pdf），可用 Zotero 的"文件→导入"收编
- `auto`：探测本地 API → 不可达且有库 → sqlite → 否则 inbox

## 构建与测试

```sh
# 构建（用 DSH checkout 的 tsc）
<dsh-checkout>/node_modules/.bin/tsc -p tsconfig.json

# 冒烟：5 工具注册 + 真实 API 调用 + 入库 inbox
node tests/smoke.mjs

# 端到端：空测试库 → review 采集 → sqlite 入库 → zotero-wave-rag 重建 → BM25 可检索
node tests/e2e.mjs

# 真实 Zotero schema 兼容性（在副本上验证写入/去重/附件/RAG 读回）
# 先 cp 真实库到 /tmp/lit-real-test/zotero/ 再运行（路径可改，见脚本内 DB/STORAGE）：
#   node tests/real-lib-check.mjs
```

## 挂载

```sh
dshx install zotero-harvest <plugin-dir>   # 需要用户确认启用
```

注意：`node_modules/@deepseek-ai/dsh-tools` 是指向 DSH checkout 的符号链接（构建期类型 + 运行期解析），
staging 轮转后若失效，重建一次 `ln -sfn <dsh-checkout>/packages/core/tools node_modules/@deepseek-ai/dsh-tools`。

## License

MIT © 2026 — 本插件为个人研究工具，无外部依赖分发（运行时仅依赖 DSH 宿主提供的
`@deepseek-ai/dsh-tools`），数据源均为公开免费 API（OpenAlex / arXiv / Crossref /
Europe PMC / Unpaywall / Semantic Scholar）。
