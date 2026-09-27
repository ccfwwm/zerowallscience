# ZeroWall Science 7.2.0 发布说明

## 可编辑的 Univer 演示文稿

- 新增 `zerowall-presentation` Skill，明确路由到 `univer-slide`，用 SVG 和 Univer 原生对象生成可编辑的文字、形状、连接线、表格和图表。
- 参考 PPTX 只用于版式和视觉验收，不再把整页渲染成单一图片。生图只生成独立插图，图片可以在 Univer 中移动、缩放、裁剪和替换。
- 演示文稿支持实时草稿、逐页 `inspect`、`lint`、截图检查、保存重开和 PPTX 导出，重新生成时只更新指定对象。

## 图片配置

- 演示文稿生图继续复用 ZeroWall AI Cloud 的 `generate_image` / `edit_image`。
- 未指定时沿用环境选定的模型和质量；请求明确指定模型、尺寸或质量时只覆盖该次请求，并在结果元数据中记录实际值。
- 不升级 `dsh-univer-office`，继续使用 0.3.2 以兼容 DSH 0.1.5-rc.2。

## 验证

- 增加系统提示、Skill 打包和图像模型/质量覆盖契约测试。
- 保留 7.1.0 科学引擎模型包兼容性，已安装模型无需重新下载。
