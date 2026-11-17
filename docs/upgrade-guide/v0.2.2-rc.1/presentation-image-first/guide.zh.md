---
kind: upgrade-guide
description: 新建 PPT 工程默认先生成图片版，再通过 OCR 重建为独立的可编辑副本。
---

# 演示文稿默认先生成图片版

[English](guide.md) | 中文

## 变更

在 `@zerowall/dsh-pptcreate@0.1.1` 中，新工作流省略 `presentation_prepare.output_mode` 时选择 `image`，而非 `editable`。内置 `ppt-maker` 流程先导出不可编辑的整页图片 PPTX，再通过 OCR 重建独立的可编辑副本。已有工作流保留保存的输出模式。

## 迁移

1. 创建演示前加载 `ppt-maker`，按图片优先顺序处理并保留两个导出的 PPTX 文件。转换其余页前先审阅 OCR 代表页。
2. 依赖直接原生可编辑构建的自动化调用方须显式传入 `output_mode: editable`。已有保存的工作流无需迁移。
3. 确认未传 `output_mode` 的新工作流在 `presentation_status` 中显示 `image`；确认 OCR 前已存在图片版 PPTX，且可编辑副本使用独立工程和输出文件。复杂的栅格区域仍作为图片，并在交付时说明。
