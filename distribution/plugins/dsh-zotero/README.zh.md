# @zerowall/dsh-zotero

同一个 npm 包提供默认文献组件 `@zerowall/dsh-zotero/pubmed`，合并 PubMed、Europe PMC、PubTator、Semantic Scholar 与 OpenAlex 检索、文章元数据、引文发现和当前对话文献图谱。凭据及接口地址在环境设置中配置；服务等待官方环境初始化后读取实时环境变量。图谱仅在当前运行的对话中保存，重置或停用服务后清除，不再附带独立 PubMed Skill。请求按服务分别注入凭据，并包含限流、响应大小限制、取消和代理支持。上游文献引擎署名和 Apache-2.0 许可证随包保留。

[English](README.md) | 中文

## 摘要

合并本地 Zotero 与 Harvest，提供检索、详情、下载链接、授权保存、去重、充分性检查、综述和离线导出。只挂载一套实现。个人库写入需要 Zotero 授权；外部 scholarly 检索组件由其独立开关控制。

## 使用

ZeroWall Desktop 根据安装清单选择此包。在插件页检查状态和插件提供的配置。验证基线为 DSH 0.2.2-rc.1 和 Node.js 24.9 或更新版本。更新时保留已有配置与数据。

详细工作流及历史平台要求见[保留的迁移参考](migration-reference.md)。当前依赖版本以包清单为准。

## 开发

在仓库根目录构建并检查压缩包：

```sh
pnpm run zerowall:build
pnpm run zerowall:pack
```

再发行时保留包内 LICENSE 及第三方声明。
