# @zerowall/dsh-pptcreate

[English](README.md) | 中文

## 摘要

提供可编辑 PPT、图片型 PPT、OCR 重建、质检、逐页任务与恢复。图片参数在生图插件中配置；PPT 转 PDF 消费官方 officeToPdf 服务，PNG 使用同一 LibreOffice kit，不携带第二套引擎。

## 使用

ZeroWall Desktop 根据安装清单选择此包。在插件页检查状态和插件提供的配置。验证基线为 DSH 0.2.2-rc.1 和 Node.js 24.9 或更新版本。更新时保留已有配置与数据。

启动时先加载工作台路由和内置说明，再报告就绪。资源缺失会使插件加载失败并提示重装。桌面安装包将本包保留在 ASAR 外，并逐文件核对准备后的 npm 包。npm 压缩包包含重建脚本和模型锁，不携带模型二进制。首次启动由 Python 插件自动准备 OCR 依赖与模型；PPT 面板显示准备进度和重试入口。

OCR 重建等待 Python 依赖服务准备完成。解释器及依赖路径取自 `ZEROWALL_PYTHON_EXECUTABLE`、`ZEROWALL_PYTHON_ENV_ROOT` 和 `ZEROWALL_PYTHON_SITE_PACKAGES`；插件不搜索旧安装环境。

详细工作流及历史平台要求见[保留的迁移参考](migration-reference.md)。当前依赖版本以包清单为准。

## 开发

在仓库根目录构建并检查压缩包：

```sh
pnpm run zerowall:build
pnpm run zerowall:pack
```

再发行时保留包内 LICENSE 及第三方声明。
