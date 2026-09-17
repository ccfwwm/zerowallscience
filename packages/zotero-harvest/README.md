# Zotero Harvest for ZeroWall Science

基于 Fisfzy/zotero-harvest 0.2.0（9635a4f27ba186f414d3ba23042bd12ee176cddc，MIT），适配 DSH 0.1.5-rc.2。

## 使用

在对话中要求搜索文献并保存到 Zotero，例如：“搜索单细胞分析相关文献，将选中的论文保存到 Zotero 的单细胞分类。”

- `lit_fetch`：多源检索和去重。
- `lit_paper_detail`：元数据和可选 PDF 文本提取（系统有 pdftotext 时）。
- `lit_download_links`：开放获取链接解析，不保证每篇都有可下载 PDF。
- `lit_save`：通过 Zotero 本地接口授权入库，按 DOI／标题去重，支持分类和 PDF 附件。
- `lit_sufficiency_check`：配额和主题覆盖检查，不代表学术质量评审。
- `lit_review_run`：有预算限制的检索、检查和入库循环。

复用设置中的 Zotero 本地地址。Zotero 必须运行并启用本地 API；首次写入由 Zotero 弹出原生授权窗口。支持当前 Zotero 的本地写入授权协议，允许永久授权时凭据保存在 DSH 凭据服务中。旧版本或离线时 auto 模式准备待导入文件，明确返回 saved=0、requiresImport=true，不声称已入库。可使用 zotero-api 模式要求直接入库，否则报错。

已确认保存的条目及去重找到的已有条目会显示在当前对话的 Zotero 列表中。未导入的 inbox 文件不会显示成库中条目。现有 Zotero 插件直接查询本地库，不依赖 zotero-wave-rag 重建索引。

## 与上游的差异

禁止直接写 Zotero SQLite；实现本地授权、数组批量提交、实例校验、PDF 三步上传；串行化入库防止并发重复；中文标题去重；PDF 上限 30 MB，每次最多 50 篇、最多 5 轮。引用下载使用 Windows 保存文件窗口。保留 README.upstream.md 和 LICENSE 记录来源。
