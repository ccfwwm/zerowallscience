# 在线目录源文件

[English](README.md) | 中文

七牛云的 `plugins.json` 是 [`market/index.json`](../index.json) 的发布副本，采用共享 market format 1。[`skills.json`](skills.json) 是本目录的 schema-1 技能压缩包清单。先上传不可变的包与压缩包，再替换两个可变 JSON 对象并刷新 CDN。Host Runtime 9.1.9 的内置[插件页面](../../packages/client/ui-plugin-market/README.zh.md)在打开或刷新目录时发现新增内容；兼容的新内容无需发布 EXE 或 Host Runtime。

公开清单地址为 `https://zerowall.chengxunkeji.cn/stable/catalog/plugins.json` 和 `https://zerowall.chengxunkeji.cn/stable/catalog/skills.json`。插件条目指定精确 npm 版本或固定 Git 提交；npm 仍是包来源。技能条目指定不可变 HTTPS ZIP 地址、字节数和 SHA-256；这些压缩包可以托管在七牛云。目录条目无法增加 Host API 兼容性。

`science-research` 技能套装由 `node distribution/scripts/build-science-research.mjs` 根据固定来源提交构建。其生成 ZIP 位于 [`science-research/`](science-research/)，包含命名空间化的 40 个技能、上游许可证与服务条款、来源校验和及可复现的软件包哈希。构建脚本还会生成对应的 Python 能力声明和 [`skills.json`](skills.json) 条目。先上传生成的不可变 ZIP，再发布更新后的两个目录并刷新 CDN。修改本地目录不会上传文件或自动发布到公开目录。
