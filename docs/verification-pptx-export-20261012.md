# PPTX 技能与导出接口修复验收（2026-10-12）

本次修复截图所示 `presentationFindings` 接口错误，并恢复审核后的 PPTX 导出。用户明确授权“请发布七牛云”后，四项修复资源已发布到七牛 Stable，正式插件与技能更新指针已切换，公网签名、完整下载哈希和安装版检查均通过。桌面版本保持 `8.1.3`；修改直接位于共享 `main`，父 HEAD / 验收时 HEAD 均为 `a807b52ef4023bed765b327bfd1aba2387ea8b62`，DSH 为 `8c00ce78435cf35300654c41e69336e69dc758b1`。未修改 DSH 子模块，未创建 worktree、提交、推送、新安装器或 GitHub Release。工作区存在并发的 Python、Archive Manager 等修改，它们不属于本次 PPTX 修复。

## 问题与修改

DSH 的真实 ToolRuntime 在插件 around-dispatch 之后再次验证工具的 canonical output，并将返回值冻结。`univer_lint` 的闭合输出定义不允许顶层追加 `presentationFindings`，原工作流追加该字段后产生 `INVALID_TOOL_OUTPUT`。原 PPTX 导出分支还尝试对冻结的 `result.value` 执行 `Object.assign`，因此即使审核完成仍可能在备注处理后报错。

- `plugins/images/src/host/presentation-workflow.ts`：保留 Univer canonical result；ZeroWall 检查结果由 `presentation_check_pages` 和 `presentation_status` 的顶层 `presentationFindings` 返回，含页码与 waiver hash。备注保留后的路径、大小、SHA-256 写入 `state.exportReceipt`，修改页面或开始新的导出会清除旧收据。导出仍要求当前版本的 inspect/lint/screenshot 和实际视觉审核。
- `resources/extensions/skills/zerowall-presentation/SKILL.md`：更新字段位置、批量审核调用参数、命令行恢复步骤和导出回读要求。
- `tools/packaging/adapt-univer-office.mjs`：更新生成的 Univer Slide 技能，继续核对锁定上游的 identity 和 SHA-256；没有直接修改上游安装副本。
- `plugins/images/test/presentation-tool-contract.spec.ts`：通过真实 DSH dispatcher 验证严格返回 schema、冻结值、遮挡 finding、未审核拦截、审核后导出和 journal 恢复。单测中的截图/观察为测试 fixture；实际视觉验收见下一节。
- `tools/verification/presentation-tool-smoke.mts`：新增实际 Univer 命令行验收入口；默认先 check，导出阶段读取人工查看真实 PNG 后填写的 `reviews.json`。现有 `presentation-regression.mts` 改读检查接口顶层字段。

独立版本：`plugin-images 0.2.6 → 0.2.7`、`zerowall-presentation 0.1.3 → 0.1.4`、`univer-slide 0.1.3 → 0.1.4`、适配后的 `dsh-univer-office 0.3.7-zws.1 → 0.3.7-zws.2`。Univer 上游继续固定 `0.3.7` / `8f85ce4074fdbe51416b6c337468bb916a302c2a`；其资源版本递增是为了配套技能内容的变化。库存通过 `pnpm dsh:inventory` 生成，保留了其他并发资源版本。

## 实际命令行与文件验收

执行 `pnpm exec tsx tools/verification/presentation-tool-smoke.mts check`，通过真实 DSH ToolRuntime 和锁定 Univer 的原始工具声明，创建两页独立中文 Slide Unit。截图使用实际 Gateway/render 服务，CLI 将 PNG 保存到工作区；该入口用工作区图片代替桌面 attachment 服务，未验证桌面图片附件投递。

未记录审核时 `univer_export` 正确拒绝第 1、2 页。逐页查看实际 PNG 后，保存中文观察到 `reviews.json`，执行 `pnpm exec tsx tools/verification/presentation-tool-smoke.mts export` 成功。导出备注后返回值保持原契约，journal 无 failure，blockedPages 为空，notesWritten 为 2。

实际文件为 `C:\softworks\gpt-tools\zerowallscience\artifacts\verification\8.1.3\presentation-tool-smoke\PPTX-命令行验证.pptx`，大小 **17,837 字节**，SHA-256 **76d1049b0c1d04a872741fdef70d305ead3eed2a602f800a94e0df633f3315f7**。

OOXML 回读确认两页分别有 2、3 个独立文本 run，均有对应备注；测试页未被整页图片化。LibreOffice 将实际 PPTX 转为两页 PDF，逐页渲染后再次目视核对：中文、英文、箭头、字号层次和位置正常，无重叠、缺字或裁切。MuPDF 在读取 LibreOffice PDF 时输出结构树警告，但页数、文本提取和两页 PNG 渲染均通过。

收据位于 `artifacts/verification/8.1.3/presentation-tool-smoke/run.json`、`readback.json`；原始 PNG 位于 `screenshots/batch-1/`，导出回读 PNG 位于 `export-render/`。这是独立的两页功能验证，没有打开或修改截图中用户的原始 `.univer` 文件，也未生成其第三版实际交付稿。

## 构建产物

build ID 为 **pptx-fix-20261012-1948**。只构建变化的资源；没有重建桌面 EXE。

以下路径均以 `C:\softworks\gpt-tools\zerowallscience\` 为绝对路径前缀：

| 资源 | 路径 | 字节 | SHA-256 |
| --- | --- | ---: | --- |
| plugin-images 0.2.7 | `artifacts/release/8.1.3/plugins/plugin-images/0.2.7/zerowallscience-plugin-images-0.2.7.tgz` | 175771 | `763b808feaadc4a8fc97be55807a28d5a621461e9803f9e73d6bf5a08d399757` |
| dsh-univer-office 0.3.7-zws.2 | `artifacts/release/8.1.3/plugins/dsh-univer-office/0.3.7-zws.2/dsh-univer-office-0.3.7-zws.2.tgz` | 49742085 | `ea581a0ec0f577ea8333bdf6516c1d1a271417803fba45da7113f8f10f54c692` |
| zerowall-presentation 0.1.4 | `artifacts/stage/8.1.3/pptx-fix-20261012-1948/resource-packages/skill/zerowall-presentation/0.1.4/zerowall-presentation.tgz` | 5891 | `a3912881f3172ab7da31784c6dc4e159a1db03585bfb7a8cd230b0e7c7e757c0` |
| univer-slide 0.1.4 | `artifacts/stage/8.1.3/pptx-fix-20261012-1948/resource-packages/skill/univer-slide/0.1.4/univer-slide.tgz` | 9041 | `f7d492b7d6292484f7f3bd8ba44ac3e07cff27419f35766feed22014ef12a6af` |

Images 通过 `pnpm plugin:pack images` 构建；ZeroWall 技能通过 `pnpm resource:build skill zerowall-presentation` 构建。Univer 资源从锁定安装依赖的声明分发文件生成新的独立 stage，应用现有 manifest/Skill adaptation 后归档；包内 `package/package.json` 版本已核对。没有复制 node_modules 或修改上游依赖字节。

最初两项 Skill 的本地开发 catalog 通过签名、payload SHA-256 和 YAML/ZeroWall metadata 校验，标记 `localOnly=true`；这些目录仅保留作开发收据，没有上传 Stable。开发收据为 `artifacts/stage/8.1.3/pptx-fix-20261012-1948/univer-resources-receipt.json` 和 `skill-validation.json`。正式发布随后使用已有 `stable-4` 密钥生成 `localOnly=false` 的资源条目、catalog 和 pointer，验证其公钥与稳定安装版的信任合同一致，没有添加开发公钥。

## 安装后的更新与回滚验收

使用已验收的 8.1.3 安装目录 `artifacts/verification/8.1.3/nsis-813-final-ustc/安装 目录/ZeroWallScience`，通过实际 Electron、ASAR 中的 DSH Host、安装版 resource-manager 和真实 pnpm，在独立 `artifacts/verification/8.1.3/pptx-fix-installed-accepted/harness` profile 验证正式签名资源。

- 同批安装 `plugin-images 0.2.7` 与 `dsh-univer-office 0.3.7-zws.2`，连同签名依赖闭包共 8 个包。两项插件进入真实 Host 的 active inventory；该批更新只停止、启动 Host 各一次。
- 两项 Skills 分别执行 `0.1.3 → 0.1.4 → 回滚 0.1.3 → 再更新 0.1.4`，通过实际 Host 查询声明版本，并验证回滚后的完整内容与旧内容相等；没有重启 Host。
- 整个插件 profile 回滚后，manifest 与原 profile 完全相同。另在真实候选 Host 已启动后注入健康检查失败，旧 profile 和可用 Host 均成功恢复。

收据 `artifacts/verification/8.1.3/pptx-fix-installed-accepted/batch-receipt.json` 为 `complete=true`，日志为 `artifacts/logs/8.1.3/pptx-fix-installed-verification-accepted.log`。任务专用验收入口 `artifacts/stage/8.1.3/pptx-fix-20261012-1948/verify-installed-pptx.mjs` 使用安装版 Electron 的 `ELECTRON_RUN_AS_NODE=1` / `--expose-internals` 运行，避免用源码模拟安装环境。

发布后再次使用同一安装版和真实 Host，只读检查正式公网目录。旧插件分别显示 `0.2.6 → 0.2.7`、`0.3.7-zws.1 → 0.3.7-zws.2` 的可用更新；已更新的两项 Skills 显示已安装 `0.1.4`，无重复更新。检查只写验证后的 catalog 缓存，profile manifest 和 Skill 内容保持相同，没有下载或安装资源。收据 `public-check-receipt.json` 为 `complete=true` / `readOnly=true`，验收时间为 **2026-10-12 21:14:48（Asia/Shanghai）**。

最初选择的历史 `nsis-release-final` 验收目录缺少离线签名文件集，安装前门禁失败；未修补或放宽该目录的断言。改用此前已通过完整验收的 `nsis-813-final-ustc` 目录后，上述安装和回滚门禁通过，原失败日志仍保留。

## 七牛 Stable 发布

发布使用任务独立输出根 `artifacts/stage/8.1.3/pptx-fix-20261012-1948/publication-store`，避免共享 release 输出被其他并发任务覆盖。只替换上述 2 个插件和 2 个 Skills，精确保留其他已公开条目的原 metadata、签名和字节。首次指针切换前检测到 Archive Manager 并发发布，门禁拒绝覆盖；重新获取、验签当前基线，保留新增的 Archive Manager 与已发布 Python 插件条目，再生成与 stage 新目录。已验收的 8 包依赖闭包及 2 项 Skills 与合并后的条目逐项相等，见 `rebased-verification.json`。

合并后的 generation 为 **pptx-fix-20261012-1948-1791808789294**：

| 目录 | 条目数 / 原样保留 | 字节 | SHA-256 |
| --- | --- | ---: | --- |
| plugin | 39 / 37 | 68024 | `3452b149a6cbf7deace6cb1a8088bb9840c1121a6fb727879a41580fa01a5745` |
| skill | 282 / 280 | 238104 | `f3761d04ab5eae3d135d5e006f69398cbbc4d5cdb03a7d70c0a5d2dcea75c15e` |

公开入口：[插件更新指针](https://zerowall.chengxunkeji.cn/stable/catalogs/plugin-latest.json)、[技能更新指针](https://zerowall.chengxunkeji.cn/stable/catalogs/skill-latest.json)。不可变目录：[plugin catalog](https://zerowall.chengxunkeji.cn/stable/catalogs/plugin/8.1.3/pptx-fix-20261012-1948-1791808789294/catalog.json)、[skill catalog](https://zerowall.chengxunkeji.cn/stable/catalogs/skill/8.1.3/pptx-fix-20261012-1948-1791808789294/catalog.json)。

四项公开包：[plugin-images 0.2.7](https://zerowall.chengxunkeji.cn/stable/plugins/plugin-images/0.2.7/zerowallscience-plugin-images-0.2.7.tgz)、[dsh-univer-office 0.3.7-zws.2](https://zerowall.chengxunkeji.cn/stable/plugins/dsh-univer-office/0.3.7-zws.2/dsh-univer-office-0.3.7-zws.2.tgz)、[zerowall-presentation 0.1.4](https://zerowall.chengxunkeji.cn/stable/skills/zerowall-presentation/0.1.4/zerowall-presentation.tgz)、[univer-slide 0.1.4](https://zerowall.chengxunkeji.cn/stable/skills/univer-slide/0.1.4/univer-slide.tgz)。字节与 SHA-256 见构建产物表。

在上述独立 artifact root 下，分别执行 `node scripts/publish-resources.mjs stage|promote|verify --kind plugin|skill --reuse-published`。插件 stage 完整验收 40 个不可变对象，Skill stage 完整验收 283 个不可变对象；两项 promote 和 verify 均成功。共享 publisher 在并发工作中新增的 baseline 合同曾因独立目录缺少 `plugin-targeted-baseline.json` 拒绝切换；补齐已验签基线并再次核对公网 pointer 后通过，没有绕过防覆盖门禁。

最终独立执行 `node artifacts/stage/8.1.3/pptx-fix-20261012-1948/verify-public-final.mjs`，直接请求**不带查询参数**的正常公网地址，确认两项 pointer 与预期完全相同、catalog 大小与 SHA-256 一致、全部签名有效、其他条目原样保留、插件依赖闭包兼容，并完整下载四项 tarball 核对本地与远端哈希。最终收据 `artifacts/verification/8.1.3/pptx-fix-qiniu-public/publication-receipt.json` 为 `complete=true`，公网验收时间为 **2026-10-12 21:10:53（Asia/Shanghai）**。

桌面 `stable/latest.yml`、MCP 与 Python 更新指针与发布前已验签基线的 SHA-256 完全相同：分别为 `e8f399458eeb021fc57d2a09cac639674785db4024df3d01d1459758ece60f62`、`53f351688905528147b7080f09cd674190371aab3d1aed4e891bbc9b0e5942b2`、`5adb2841f9385dc59731050fd2ec18e882fb2bac8f38ca87d7982647934ff812`。本次没有重新上传或修改这些发布面。

## 检查结果与限制

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter @zerowallscience/plugin-images test` | 6 文件、40 测试通过，含真实 dispatcher 回归 |
| `pnpm --filter @zerowallscience/plugin-images typecheck` | 通过 |
| `pnpm --filter @zerowallscience/plugin-skills test` | 2 文件、11 测试通过，含真实 Skill parser 的 PPTX 路由读取 |
| `node --test tests/contracts/file-visual-adapters.test.mjs` | 4 测试通过 |
| `pnpm dsh:inventory` / `pnpm dsh:verify` | 通过，DSH pin 保持一致 |
| `pnpm profiles:check` / `pnpm dsh:runtime:closure` | 通过，290 个 workspace runtime packages |
| `pnpm version:check` / `pnpm release:metadata` | 通过，桌面仍为 8.1.3，仅生成本地 metadata |
| `pnpm plugins:typecheck` | 通过 |
| `pnpm plugins:verify-pack` | 22 个原生插件包通过 |
| `pnpm test:security` | 2 测试通过 |
| `pnpm test:updates` | 59 通过、3 跳过 |
| `pnpm smoke:update` | 通过；验证现有桌面 metadata，不能代替本次资源安装验收 |
| 安装版正式签名批量更新 / Skill 热更新 / 回滚 / 健康失败恢复 | 全部通过，`batch-receipt.json complete=true` |
| 两项资源 `stage` / `promote` / `verify` | 全部通过，正式指针已切换；使用独立 artifact root 与当前公网基线 |
| 不带查询参数的公网目录及四项完整下载 | 全部通过，签名、版本、大小、SHA-256 与预期一致 |
| 安装版正式公网只读资源检查 | 通过，两项旧插件可检测到更新，已更新技能显示当前 0.1.4；无安装与 Host 重启 |
| `pnpm typecheck` | DSH 和插件阶段通过；桌面已有并发 Python 测试 fixture 在 `desktop/test/python-environment-api.spec.ts:286` 缺少 package `source` / `health` 字段，exit 2 |
| `pnpm plugins:test` | Research 306 通过、16 失败、3 跳过；失败涉及测试解释器缺少 NumPy 和固定共享 Python 未找到。其余已运行插件通过，本次没有修改这些功能或切换它们的解释器 |
| Skill Creator quick_validate | `univer-slide` 通过；通用校验器不认识 ZeroWall 技能已有的 `zerowall` frontmatter，因此原样保留领域 metadata，另按实际 ZeroWall 合同验证通过 |
| `git diff --check` | 本次修改通过 |

第一次从仓库根目录运行 Vitest 文件过滤器还匹配了历史 `artifacts/source` 副本，产生 6 个无关 suite 失败；改为插件目录的正式命令后 40 个实际源码测试通过。相关日志保存在 `artifacts/logs/8.1.3/pptx-fix-*.log`。

本次未运行新安装器的 `verify:package` / `smoke:host` / `smoke:electron`，因为没有构建包含修复的新桌面安装器。导出行为由真实 CLI ToolRuntime + Univer 链路验证，资源安装由实际旧版安装器的 Electron / Host / pnpm 链路验证；仍未验证 PowerPoint/WPS、所有原生图表/图片格式或用户原演示文稿。

用户可在 8.1.3 的“设置 → 扩展中心”检查并更新上述两个插件与两个 Skills。命令行也可先运行 `zws plugin check` / `zws skill check`，再分别执行 `zws plugin update @zerowallscience/plugin-images`、`zws plugin update dsh-univer-office`、`zws skill update zerowall-presentation`、`zws skill update univer-slide`；CLI 需要已运行的 ZeroWall Science Host。插件更新会重启 Host，Skills 支持热更新。本次仅修改独立验收 profile，实际用户 profile、账户、模型设置、环境变量引用、旧安装器和原始演示文稿保持原有状态。
