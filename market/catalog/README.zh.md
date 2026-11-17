# 在线目录源文件

[English](README.md) | 中文

七牛云的 `plugins.json` 是 [`market/index.json`](../index.json) 的发布副本，采用共享 market format 1。[`skills.json`](skills.json) 是本目录的 schema-1 技能压缩包清单。先上传不可变的包与压缩包，再替换两个可变 JSON 对象并刷新 CDN。Host Runtime 9.1.6 的内置[插件页面](../../packages/client/ui-plugin-market/README.zh.md)在打开或刷新目录时发现新增内容；兼容的新内容无需发布 EXE 或 Host Runtime。

公开清单地址为 `https://zerowall.chengxunkeji.cn/stable/catalog/plugins.json` 和 `https://zerowall.chengxunkeji.cn/stable/catalog/skills.json`。插件条目指定精确 npm 版本或固定 Git 提交；npm 仍是包来源。技能条目指定不可变 HTTPS ZIP 地址、字节数和 SHA-256；这些压缩包可以托管在七牛云。目录条目无法增加 Host API 兼容性。
