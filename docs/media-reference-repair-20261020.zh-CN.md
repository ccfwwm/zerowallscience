# 媒体参考素材修复与独立插件发布记录

本次修复保留参考素材和供应商扩展参数，统一估价与提交请求，记录脱敏的实际发送收据。内部素材类型仍为 `video`；V6K 输出 `images`、`videos`、`audios`，云飞及原生协议分别映射。`references_file` 可直接读取工作区 JSON 清单。失败后的草稿和素材保留，空数组不能隐式降级为纯文本生成。

任务详情区分准备发送、已尝试发送和上游已受理。历史任务未保存发送快照时显示“未记录”，不把草稿作为发送证据。旧媒体兼容包 `@oh-story/dsh` 从官方生成器、离线依赖、共享包目录和公开插件目录退役；保留旧 ID 的迁移识别、用户选择、固定版本历史和自定义同名安装。

## 版本与源码基线

- 分支：三个源码仓库均为 `main`。
- ZeroWall 父提交：`4034508fd8cd46f478518cc75d061ddd3d959153`。
- Sub2API 父提交：`2a469243d60ab050d7777d001bfb405ab2b7cb42`；保留其已有生产验证文档提交。
- 插件源码总仓库父提交：`d792379`，由官方导出器同步当前完整源码并保留来源收据。
- DSH：`683cb0318b9a0fa09362794588d01acb0366850f` / `0.2.1-rc.2`。
- 桌面版本保持 `8.4.3`；本次不生成安装器。
- Build ID：`media-repair-20261020-r1`。

## 正式插件产物

正式包由 `pnpm plugin:pack ai-cloud`、`pnpm plugin:pack videos` 生成，存于 `artifacts/release/plugins/<包名>/<版本>/`。下列正式包取代早期临时验证包，AI Cloud 的早期验证包摘要不作为发布依据。

| 插件 | 版本 | 字节数 | SHA-256 |
| --- | --- | ---: | --- |
| @zerowallscience/plugin-ai-cloud | 0.1.30 | 1683181 | `fe3dedf732b4ce37c1d3848bc7b687ab2fa5831e3cf383bcb991553d0b3c2924` |
| @zerowallscience/plugin-videos | 0.2.2 | 328422 | `c967f9942b49027f803a46d7da9ab7c305ce94c170c48b1e91e5c8c8e09b4c97` |

- [AI Cloud 正式包](https://zerowall.chengxunkeji.cn/stable/plugins/plugin-ai-cloud/0.1.30/zerowallscience-plugin-ai-cloud-0.1.30.tgz)
- [创作插件正式包](https://zerowall.chengxunkeji.cn/stable/plugins/plugin-videos/0.2.2/zerowallscience-plugin-videos-0.2.2.tgz)
- [稳定插件签名指针](https://zerowall.chengxunkeji.cn/stable/catalogs/plugin-latest.json)

发布使用现有 `stable-4` 信任根，定向合并线上目录。目录保留其他 37 个资源的原签名和字节，仅替换上述两个版本并移除兼容包条目。`stage` 已逐一公开下载并验证 40 个不可变对象（39 个包及 1 个目录）。发布全过程不修改桌面 `stable/latest.yml`；切换与公开复核收据存于 `artifacts/release/8.4.3/publication/`。

`promote` 与 `verify` 均已完成。独立读取公开签名指针确认两个新版本和兼容包退役，桌面 `latest.yml` 发布前后 SHA-256 均为 `fbca6fcc3cc4795acd8b3038924177a74d141f8e644b558e0b15aae845f2da63`。

## 验证记录

- AI Cloud：158 项；创作插件：64 项；其他非 Research 插件检查通过，保留原有跳过。
- 更新事务：214 项通过、3 项跳过；目录签名合并、退役与媒体迁移定向检查：18 项通过。
- `dsh:inventory`、`dsh:verify`、`profiles:check`、`dsh:runtime:closure`、`typecheck`、`plugins:typecheck`、`version:check`、`test:security`、`smoke:update`、`verify:package --audit-source` 通过。
- 原生插件打包检查通过；两个正式包另行核对版本、描述文件、入口、发布依赖和摘要。
- 候选安装使用真实 pnpm 和公开签名包，在独立 profile 验证升级、独立进程入口导入、激活失败恢复、整批快照回滚和再次升级。宿主依赖来自固定 DSH 运行时；完整 Host 服务图与 Electron 界面验收仍单列为未完成事项。
- 网关媒体 Go 单测、4 个 handler 单测包、隔离 PostgreSQL 媒体集成测试通过；前端详情与历史 10 项测试、生产构建和 i18n 检查通过。
- 两个主仓库 `git diff --check` 通过。详细日志、正式包收据与候选安装收据位于 `artifacts/verification/8.4.3/media-repair-20261020-r1/` 及 `artifacts/logs/8.4.3/media-*`。

## 尚未完成的验收

- 全量 `plugins:test` 中无关的 Research Python 测试缺少 `numpy`；未通过修改断言或切换环境掩盖。
- `go test -race` 因当前 Windows Go 环境关闭 CGO 且无 gcc，未完成。
- 显式单插件回滚被已有依赖冲突阻止：旧 AI Cloud 包声明 `dsh-dream-skin@10.16.0`，而已签名目录提供 `10.16.1-zws.3` 适配版本。未弱化回滚冲突校验；失败激活的自动恢复和整批快照回滚分别验收。
- 未重打桌面安装器，未运行其完整 Host / Electron 冒烟；候选 profile 的入口加载不等同于完整宿主服务图验收。
- 未调用付费生成，额度使用 0 次。TTseadanco2.5-720 是否接受这 1 个官网视频与 4 张官网图片，以及生成内容是否符合参考，仍须候选网关实测。
- 本次发布仅切换插件更新目录并提交源码。Sub2API 网关生产服务未部署；网关新增的透传与详情收据能力须在另行授权切换后才会在生产生效。
