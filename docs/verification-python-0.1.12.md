# Python 插件 0.1.12：固定目录安装修复与验收

2026-10-14，北京时间。用户反馈最新版插件安装科研依赖时报 `PYTHON_FIXED_PATH_REQUIRED: legacy slots are inactive. Initialize the fixed target first.`，升级后仍不能安装。

## 结论与基线

修复、正式签名插件包和七牛发布已完成。旧版 0.1.10 能在隔离环境完整复现错误；同一环境切换到 0.1.12 后，真实 pip 安装、实际 import、任务成功状态及 1/1 进度均通过。用户随后明确授权发布七牛，2026-10-14 10:05 北京时间完成 stage/promote/verify 与普通公网 URL 校验，插件指针已提升。没有提交或推送 Git。

- 分支：`main`；父 HEAD：`f727d39994bf396346e3bf249dc5758b3288d27a`。
- DSH commit：`8c00ce78435cf35300654c41e69336e69dc758b1`，版本 `0.2.0-rc.2`。
- 桌面版本：`8.1.3`；Python 插件：`0.1.10 → 0.1.12`。
- 直接当前 checkout 开发，保留既有修改、未跟踪文件、凭据和缓存；未创建 worktree。
- 修改范围：Python worker 的固定目录 context、初始化、任务进度和错误传递；插件 package/descriptor 版本；生成 inventory 的 Python 条目；Python 专项测试与本报告。inventory 原有的其他改动保留。
- 桌面改动只有四个测试文件，没有修改桌面运行源码或 DSH。

## 为什么页面正常，安装却失败

页面的 `pythonInfo()` 在固定模式下直接扫描安装根的 `python.exe` 和 `Lib/site-packages`，所以能显示 Python 3.12.10、现有包和依赖数量。旧安装流程的 `pythonContext()` 却仍依赖 `.zerowall/current.json`；记录指向旧 slot 或缺失时，生成安装计划会失败。升级插件本身没有修复这份管理记录，因此重复升级不能解决问题。

旧初始化流程即使已有健康的固定 Python、pip 和本地签名 manifest，也先访问 bootstrap 网络清单。网络失败时，状态仍可能是 `phase=ready` 并携带 `lastUpdateError`；环境 API 只检查 phase，忽略该错误，继续创建队列，最终暴露旧 slot 报错。

真实打包 worker 验收另发现进度消息没有映射到持久任务 ID；安装成功时已完成数量可能仍为 0。补齐映射后又发现 controller 将包名 `six` 覆盖为环境版本 `1.5.2`。两处进度问题一起修复，最终验收要求真实安装成功、计数 1/1 且当前包为 `six`，没有降低断言。

## 修复行为与保留边界

1. 固定模式的检测、计划和安装统一使用固定根的解释器、site-packages 和签名 manifest；不读取旧 slot 作为运行来源。
2. 检查与预览保持只读，不重写 current.json。用户明确初始化或安装时，在 writer lock 下恢复未完成事务、复检 Python/pip，再登记固定根管理记录。
3. 健康固定环境优先使用本地签名 manifest，因此登记不依赖 bootstrap 网络。缺少可信 manifest 时，只接受验签成功且解释器版本匹配的 bootstrap fallback。
4. 安装前拒绝旧 slot 的计划。保留固定根已有包、解释器、签名清单和固定根 customization/local revision；旧 slot metadata 不迁移、不激活。
5. 初始化错误在环境 API 中直接失败，不再被 ready 状态吞掉。worker 进度绑定持久任务 ID，显式包名不被环境版本覆盖。
6. 启动/日常检查仍只读；没有增加静默下载、安装、切换根目录或重启操作。

## 真实签名 worker 升级验收

测试解包旧 0.1.10 与最终 0.1.12，使用未修改的桌面 signed broker，运行真实 worker IPC。在临时中文路径 `安装 目录/Python` 复制受控 Python 3.12.10 与 pip，用两个依赖的小清单验证完整科研 `sync` 请求。

| 管理记录 | 旧 0.1.10 完整 sync | 新 0.1.12 完整 sync |
| --- | --- | --- |
| legacy slot pointer | 复现用户同一 `PYTHON_FIXED_PATH_REQUIRED` 错误 | succeeded；six 1.17.0 实际安装并 import；1/1，currentPackage=six |
| current.json 缺失 | `ZeroWall Python 尚未就绪。` | succeeded；six 1.17.0 实际安装并 import；1/1，currentPackage=six |

两种情形均验证：只预览时 pointer 不变；显式安装后 current.json 登记固定根且 generation=false；python.exe 字节不变；用户 sentinel 文件保留；已有 pandas 1.0.0 metadata 保留；未创建 slots。pandas 是测试 metadata fixture，此验收不代表实际 pandas 算法运行或全部 529 项科研依赖已安装。

- 最终测试：`desktop/test/python-packed-worker.integration.spec.ts`，3/3 通过，76.88 秒。
- 证据：`artifacts/verification/8.1.3/python-0.1.12/fixed-worker-legacy.json`、`fixed-worker-absent.json`。
- 最终日志：`artifacts/logs/8.1.3/python-0.1.12-packed-upgrade-final.log`。
- 初期本地候选曾安装成功但进度断言失败；0.1.12 首次候选的包名覆盖失败日志保留于 `python-0.1.12-packed-upgrade.log`。修复后重新打包并通过同一严格测试。重新打包前已确认 0.1.12 公网对象不存在，没有覆盖已发布同版本资源。

## 检查命令与结果

| 检查 | 结果与范围 |
| --- | --- |
| pnpm dsh:inventory / dsh:verify / profiles:check / dsh:runtime:closure | 通过，DSH pin 未变 |
| pnpm version:check | 通过，桌面契约仍为 8.1.3 |
| pnpm typecheck | 全仓通过，包含 plugins:typecheck 与 desktop；日志 `python-0.1.11-typecheck.log` |
| pnpm --filter @zerowallscience/plugin-python run typecheck | 最终插件通过 |
| Python 插件 vitest | 最后修正后 26 通过 |
| python-environment-api / python-updater-service 专项 | 46 通过，覆盖初始化错误和持久进度映射 |
| desktop 全量 vitest | 255 通过、15 跳过；日志 `python-0.1.12-desktop-test.log`；包名最终单行修正另由 unit 与真实 tarball 验收覆盖 |
| pnpm test:security | 2 通过 |
| pnpm test:updates | 59 通过、3 跳过；跳过项未配置 Electron integration executable |
| pnpm plugins:verify-pack | 22 个原生插件包通过；随后最终 0.1.12 由真实 tarball 测试和独立签名/hash 校验验证 |
| pnpm smoke:update | 8.1.3 桌面元数据通过 |
| pnpm release:metadata | 通过；使用既有安装器的硬链接和复制的 latest.yml，在本任务隔离输出目录生成验证元数据 |
| pnpm plugins:test | 未全通过：Research 16 失败、306 通过、3 跳过；失败涉及缺失固定共享 Python / NumPy / H5AD 测试依赖；日志 `python-0.1.11-plugins-test.log` |
| 定向 signed catalog / verify-release.mjs | 通过；39 条资源只替换 Python，其余 38 条保持线上原条目及签名 |
| 七牛 stage / promote / verify | 全部 exit 0；40 个不可变对象与 1 个插件指针通过校验 |
| 普通公网 URL 独立校验 | 通过；目录、指针、归档、worker 签名/hash 正常；六个保护指针不变 |
| git diff --check | 通过 |

`release:metadata` 的隔离目录为 `artifacts/verification/8.1.3/python-0.1.12/desktop-metadata/`，没有重建安装器或更改正式桌面更新指针。没有为使 Research 测试通过而改动 Research 或向用户环境安装科研依赖。

## 最终产物

- Build ID：`python-0.1.12-fixed-20261014`。
- 归档：`C:/softworks/gpt-tools/zerowallscience/artifacts/release/8.1.3/plugins/plugin-python/0.1.12/zerowallscience-plugin-python-0.1.12.tgz`。
- 大小：263,881 字节。
- SHA-256：`a59e7ffec75e5d1c1cd18d9fd10dbc5b728e5c0993964a11a601a46e286ed9b4`。
- worker：ABI 1，正式 `stable-4` 签名；package、descriptor、worker 版本均为 0.1.12；逐个 worker 文件 size/hash 已核对；不是 local-development 包。
- 独立回执：`artifacts/verification/8.1.3/python-0.1.12/release-receipt.json`。
- 独立验证命令：`node artifacts/verification/8.1.3/python-0.1.12/verify-release.mjs`。

另一个资源生成任务会写共享 `artifacts/release/8.1.3/catalogs/`，本次未覆盖其结果。Python 发布输入通过 `ZEROWALL_ARTIFACT_ROOT` 隔离在 `artifacts/verification/8.1.3/python-0.1.12/publication/`；其 release/8.1.3/plugin-packages.json 只包含 Python 候选，定向 generator 合并当前线上其余 38 条资源。

初次本地候选 signed catalog SHA-256 为 `2f0912587eff857f89dbb8fba2e766485bc2fa138e2239bfee7829dc44651cdf`。收到发布授权后重新基于最新公网清单生成目录；最终已发布目录为 68,030 字节，SHA-256 `64d935217ed413090caf09d49eb8b637d47cb75c77614a465f89b81e75f77d55`。旧发布前回执保留于 `release-receipt-before-publication.json`。

## 发布与未验收事项

用户明确授权“将已验证的 0.1.12 发布到七牛，供客户端更新”后，执行以下正式发布流程。只发布 plugin kind，使用本任务隔离输入：

```powershell
$env:ZEROWALL_ARTIFACT_ROOT = Join-Path (Get-Location) 'artifacts/verification/8.1.3/python-0.1.12/publication'
$env:ZEROWALL_BUILD_ID = 'python-0.1.12-fixed-20261014'
node scripts/publish-resources.mjs stage --kind plugin --reuse-published
node scripts/publish-resources.mjs promote --kind plugin --reuse-published
node scripts/publish-resources.mjs verify --kind plugin --reuse-published
```

上列命令均 exit 0。首次 stage 在准备旧账号归档时遭遇网络 `ECONNRESET`，尚未上传对象或提升指针；失败日志保留于 `artifacts/logs/8.1.3/python-0.1.12-qiniu-stage-first-failed.log`。随后将本机保留的 38 个旧归档逐个按签名清单的大小与 SHA-256 核对，放入本任务内容缓存，再运行标准 stage 成功；没有绕过签名、大小、哈希或不可变对象保护。

stage 从公网核对全部 40 个不可变对象（39 个资源加 1 个目录），仅上传新目录和 Python 0.1.12，其余 38 个资源复用原对象。promote 前再次检查线上 baseline，提升 `stable/catalogs/plugin-latest.json` 并刷新 CDN；verify 复核指针成功。签名和七牛凭据使用 ignored 文件，未打印或上传凭据。

- [Python 插件 0.1.12 公网归档](https://zerowall.chengxunkeji.cn/stable/plugins/plugin-python/0.1.12/zerowallscience-plugin-python-0.1.12.tgz)。
- [插件更新指针](https://zerowall.chengxunkeji.cn/stable/catalogs/plugin-latest.json)。
- [不可变签名目录](https://zerowall.chengxunkeji.cn/stable/catalogs/plugin/8.1.3/python-0.1.12-fixed-20261014-1791943228319/catalog.json)。
- 插件指针大小：527 字节；SHA-256：`7e6442c63327077d866d17b0001acacbb0ca60d7bc80caf14c056f830cbd074f`。
- 正式发布收据：本任务 `publication/release/8.1.3/publication/qiniu-resources-plugin-stage.json` 和 `qiniu-resources-plugin-public.json`。
- 普通无 query 公网验证收据：`artifacts/verification/8.1.3/python-0.1.12/qiniu-normal-public-urls.json`，`complete=true`；下载的公网归档保存在同目录 `public-python-0.1.12.tgz`。
- 独立校验命令：`node artifacts/verification/8.1.3/python-0.1.12/check-publication.mjs verify`。验证普通公网指针与本地正式指针字节一致、目录验签和 size/hash、Python 0.1.12 下载 hash、包和 worker 版本、worker 逐文件 hash；其余 38 条资源及签名保持一致。

发布前后 `stable/latest.yml`、两个桌面 JSON 指针，以及 Skills/MCP/Python 内容资源的三个指针 SHA-256 均相同，六项证据保存在上述普通公网收据。没有发布桌面或其他插件，没有创建 GitHub Release/tag。桌面 8.1.3 客户端可在“设置 → 扩展中心 → 检查更新”中更新“Python 环境”插件到 0.1.12，完成插件更新后再重试科研依赖安装。

未在用户真实 GUI/profile 中升级或改动其 Python 环境，未安装全部 529 项科研包，未重建桌面/ASAR/安装器，未运行 installer verify:package、通用 smoke:host/smoke:electron，未验证其他系统或全部历史桌面版本。本轮证明的是 Windows x64 固定目录故障的 signed worker 修复和小规模真实安装路径。
