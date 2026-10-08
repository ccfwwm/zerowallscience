# R 与 AnnData 转换

转换复用 `r.compute` 工作流和现有 R Worker，Python 解释器固定为独立 OmicVerse 环境。输入必须已在同一远程项目中，不能直接传本地 Windows 路径。

```json
{"name":"research_workflow","arguments":{"action":"describe","workflow_id":"r.compute","operation":"r.convert.anndata"}}
```

```json
{"name":"research_workflow","arguments":{"action":"run","workflow_id":"r.compute","parameters":{"operation":"r.convert.anndata","arguments":{"project_id":"rmcp-demo","input_path":"inputs/cells.rds","direction":"rds_to_h5ad","assay":"RNA","confirm":true},"request_id":"convert-cells-1"}}}
```

用返回的本地 `run_id` 查询 status。RDS 必须为 Seurat 或 SingleCellExperiment；Seurat 导出所选 assay。返回 `converted.h5ad`、`conversion-report.json`，验证细胞/基因维度和顺序，以及全部表达 assay 数值。报告列出元数据字段、降维、警告与不能保留的 Seurat 字段；不能宣称无损转换整个 Seurat 对象。

反向转换使用 `direction=h5ad_to_rds`，输入改为结果 H5AD 的实际项目相对路径。输出为 SingleCellExperiment RDS。`X` 的含义由原始数据决定，不能把归一化值改称 raw counts；counts 层单独保留。

OmicVerse Python 随后使用转换 Manifest 对应的路径作为 `input_path`。NHANES 的复杂抽样统计继续由 R 处理，跨模块只交付有明确权重定义的结果表。
