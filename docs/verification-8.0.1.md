# ZeroWall Science 8.0.1 本地候选包验收

本次已经融合 main 修复、完成插件化边界调整，并验证新的 Windows 安装包。所有实现均在 `dsh-allupdate` worktree 内进行，没有合回 main、推送、上传七牛或创建 GitHub Release。

## 构建来源与文件

| 项目 | 结果 |
| --- | --- |
| 分支 | `dsh-allupdate` |
| 二进制构建提交 | `8c34608b90f2043d036ee6cb79c123ae3556dc9f` |
| Build ID | `1790838143129-d48b9e1c` |
| main 来源 | `c7cfc76917a8348da0a488546fb96bb727d0bec2` / 7.5.0 |
| DSH | `93bacb7e30c888cc01a1322245a33ff3be9ff2b3` / 0.2.0-rc.2 |
| 安装包 | `artifacts/packages/8.0.1/windows-x64/zerowall-science-8.0.1-win-x64.exe` |
| 大小 | 389,845,069 字节，约 371.79 MiB |
| SHA-256 | `256409f8b5862e285badc69e3ab5eee03e769bb3898ce049de84b08b66112f32` |
| Authenticode | `NotSigned`，未签名；不根据 Builder 的 signing 日志推断成功签名 |

所有路径以 `C:\Users\ccf\.codex\worktrees\dsh-allupdate\zerowallscience` 为根。完整机器收据位于 `artifacts/verification/8.0.1/final-verification.json`，逐文件产物哈希位于安装包目录的 `artifact-manifest.json`。

二进制源码在上述提交后没有修改。最终交付提交补充的是验收脚本、Skill/MCP 发布归档生成规则和文档；重新生成的独立归档与 catalog 不改变安装包内的运行时代码或 Skill 内容。安装包哈希保持不变，并在这些调整后再次通过 `verify:package`。

## 源码与合同检查

| 检查 | 结果 | 日志（`artifacts/verification/8.0.1/`） |
| --- | --- | --- |
| 根与插件类型检查 | 通过 | `typecheck-verified.log` |
| DSH 固定提交、清单、profile | 通过 | `dsh-pin-verified.log`、`dsh-inventory-verified.log`、`profiles-final.log` |
| DSH runtime closure | 完整构建通过，291 个 workspace package | `package-build-verified.log` |
| 活跃插件测试 | 641 通过，6 个既有跳过 | `active-plugin-tests-recheck.log` |
| Desktop 单元测试 | 196 通过，4 个既有跳过 | `desktop-tests.log` |
| Research Store | 36 通过 | `store-tests.log` |
| 合同、安全、Release 工具测试 | 72 通过，2 个既有跳过 | `contracts-security-release-final.log` |
| 更新事务测试 | 24 通过 | `update-tests-final.log` |
| 发布生成器重复执行 | 源码 diff 不变 | `generator-receipt.json` |
| 应用与产物版本一致 | 通过 | `version-artifacts-final.log` |
| 包内 Host、桌面、语言与资源策略 | 通过 | `package-verification-final.log` |
| 源码运行时审计 | 通过 | `runtime-audit.log` |
| 本地桌面更新 metadata | 通过 | `release-local-verified.log` |

跳过项保留原测试条件，没有为本次新失败增加 skip，也没有更改模型预期以取得通过。不把以上清单表述为“所有上游测试都已运行”。

## 真实安装包与预览

隔离 NSIS 使用独立 App ID，安装到临时的短路径中文目录，避免影响已安装的正式应用。安装后的 ASAR 与正式候选包相同，729 个 LibreOffice 物理资源全部存在。收据为 `installer-test-801/installation-receipt.json`。

六份样本包括 PPTX、DOCX、XLSX、PDF、已有真实生成的 PPTX 和中国 SHP。最终执行 `smoke-file-routes.mjs`，直接使用隔离安装后的 EXE，没有客户端或 Excel override：

- 42 项文档/Office 检查，包括附件解析、原件读取、聊天预览、文件树、历史重载、无工作区、Office 转换和 PDF/Excel 缩放。
- 5 个 GIS 入口均渲染本地要素，底图网络被主动阻断；地图尺寸与几何范围有效。
- 47 项全部通过，页面错误为 0。
- 三份 Office 文件单独完成转换，原件 SHA-256 不变，没有缺失字体；转换测试进程正常退出。
- Desktop 完整 E2E 为 14/14 通过，无新增跳过，覆盖 Markdown 图片、科研工作台、分子/序列功能、品牌、设置、凭据、Skills 与 MCP。

收据：`file-routes-complete/results.json`、`office-conversion-verified/office-conversion.json`、`electron-smoke-acceptance.log`。最终截图也在 `file-routes-complete/`，已检查 Excel 和断网 GIS 的实际显示。

提示词保留独立版本 `7.5.0-file-visual.1`，区分读附件与制作 PPT，保持生图、Univer 工具与 Skill 适配边界。已有生成 PPT 可以打开、转换和检查。本轮没有新增付费模型调用，不能据此声称通过了一次新的真实模型生成验收。无凭据的隔离会话出现 `MISSING_CREDENTIAL` 是该测试配置的预期结果。

## 独立组件与更新

产物索引为 `artifacts/release/8.0.1/plugin-packages.json`。共 27 个插件、组合或支持包；20 个活跃 ZeroWall 插件还完成了真实 `pnpm pack` 检查，收据为 `native-pack/fb3a2098-022f-4465-8960-bfa0988dffa0/`。

文件插件 tarball 包含 Host/client/remote、许可和完整查看器资源。发布依赖不含 `workspace:` 或 Git 源依赖；共享 DSH/React 仍保持模块边界。

| 验收 | 结果 | 收据 |
| --- | --- | --- |
| 环境插件安装、升级、回滚 | 通过 | `profiles/cb018d94-725e-4654-b92f-d204cb1f667f/receipt.json` |
| 文件插件 0.1.0 → 0.2.0 → 回滚与版本化资源 | 通过 | 同上 |
| 缺依赖升级失败恢复、组合去重 | 通过 | 同上 |
| Skills 导入、更新、回滚、启停及热刷新 | 通过，不重启 Host | 同上 |
| MCP 启停重启、签名独立 Server 包更新与回滚 | 通过 | 同上 |
| 环境变量敏感值不回显 | 通过 | 同上 |
| 安装包 `dsh/zws` 包装命令与实际版本 doctor | 通过，文件插件实际为 bundled 0.2.0、compatible | `commands/58faa75c-ce0f-4bbe-bdf2-15f531c6ffc1/receipt.json` |
| 四种 profile 切换中断后的包内启动恢复 | 全部通过，失败 candidate 保留供诊断 | `profile-recovery/be626a3f-3881-4995-89d0-659c3c0bcfe4/receipt.json` |

四类签名 catalog 在 `artifacts/release/8.0.1/catalogs/`：27 个包、281 个 Skills、2 个 MCP 条目和 1 个 Python 科学依赖 manifest。catalog 为 `localOnly` 候选，正式应用没有加入开发公钥。

21 个同版本插件/支持包保留原归档字节；274 个未变 Skills 和两个同版本 MCP 条目的哈希与 8.0.0 相同。新增的不可变资源合同测试还验证：真实内容变化、增删文件和历史归档哈希被修改时必须拒绝复用。收据为 `immutable-package-receipt.json`、`immutable-resource-receipt.json`，均在 release 目录。

## Python generation

精简安装包不含完整 Python archive。启动、打开 Python 页面不隐式创建下载任务。显式安装使用现有签名环境 1.4.0 / Python 3.12.10，校验 archive SHA-256 后启用；本轮实际导入 numpy、pandas、scipy、anndata、scanpy、flowio，并验证重启复用。

恢复测试使用仅在隔离 localhost 提供的签名 content revision，未修改公开 feed：暂停解包、关闭桌面、重启并续装相同任务 ID；候选健康检查前保持原 generation；旧 Python 进程及其已导入 numpy 保持原 interpreter；新 generation 启用后可回滚到原 snapshot。所有检查通过。

收据：`python-on-demand/76bb70ac-fc8f-4b5a-9ed5-3c266b28b55b/receipt.json`、`python-generation-recovery/73b004e7-8390-4f17-97ba-c03f7ae2ef0e/receipt.json`。

## 失败定位与保留限制

- GIS 首轮发生销毁后 Leaflet 动画访问 `_leaflet_pos` 的错误。已通过精确版本构建适配修复，重新完整打包，并在最终安装包的五入口验证通过。
- 重建后的第一次包检查在并发构建/测试期间 Host 导航超时；独立复测同一包及最终 `verify:package` 均通过。初次正式构建命令因此退出 1；安装器构建本身完成，后续 metadata、manifest 与完整包验收均显式补跑并通过。保留失败日志，不称首次构建命令全部成功。
- 科研细胞查看器一次报 Python `Bad file descriptor`；没有修改算法或削弱断言。11 项专项及完整 641 项插件测试复测通过。
- 新 PDF 验收最初误选隐藏/被替换的 canvas；修正实时 DOM 定位后，最终 47 项全部通过。
- E2E 的停止按钮竞态与 MCP 配置重载导致四项失败；改为等待自动结束、检查 Host 持久化并重新加载设置，保留原值/可见性断言，最终 14 项全部通过。
- Python 验收曾在原子提交与 UI 状态之间读到不同时间点；改为检查已提交 generation 的健康状态、revision 和 durable job，不修改 updater 运行时。
- Windows NSIS 过长安装路径仍可能遗漏深层 Office 文件，短路径中文目录已验证。生产 App ID 注册、机器范围 UAC 和实际正式应用覆盖安装未在本轮执行。
- 安装内容约 1.7 GiB，超过已有 1.5 GiB 提示预算，含 Office/Node/查看器资源；仍不含完整 Python archive。安装包未做 Authenticode 签名。

## 原进度保护

最后检查确认 main 干净且 HEAD 仍为 `c7cfc769`，两边 DSH 提交及工作区状态均保持不变。7.5.0 与 8.0.0 安装包大小和 SHA-256 与融合前一致。没有删除旧版本、缓存或任何 `node_modules`，没有新增正式产物写入 `desktop/dist`。证据：`protected-baselines-final.json`。

后续可在此分支继续测试或修复，再独立发布插件总仓库与签名公共 catalog；本轮交付的是本地候选包。
