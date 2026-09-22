# ZeroWall Science 7.0.0 按需引擎包与离线导入

本轮已实现并实测 **Windows x64 HE / OpenSlide 和独立 HE / StarDist 离线 wheel 包**。两者均支持校验、隔离导入、修复重装和回滚。它们不是全量科研引擎，也没有把依赖系统 Python 的 venv 冒充可移植 Python 发行包。

## 当前可交付范围

| 模块 | 包状态 | 已验证边界 |
|---|---|---|
| HE / OpenSlide | 已构建实际离线包，并完成真实安装、损坏拒绝、回滚、TIFF 读取 | OpenSlide 层级及 ROI 读取、Pillow；不含 StarDist 和全切片批处理 |
| HE / StarDist | 65 个固定依赖和 2D_versatile_he 模型；两次实际离线安装、CPU 推理健康检查、损坏拒绝和回滚通过 | 独立 CPython 3.11 x64 前提；不替代切片分割质量验收 |
| 外部 Python | 明确的安装前提，不在本包内 | CPython 3.12 x64，具备 `venv` 与 `pip`；本次实测 3.12.10 |
| Fiji | 复用现有外部安装；本链路不分发 | 不修改 `C:\softworks\fiji`、插件或 Java |
| napari | 复用现有外部安装；本链路不分发 | 不修改已安装环境 |
| BrainGlobe、遗传 R、流式、分子等 | 本链路尚无已验收离线包 | 各模块已有代码或远程环境不等于离线引擎包已交付 |

本次是本地源码工具与工程包。安装器内的图形化离线导入入口、正式签名发布和独立运行时分发尚未由这一子任务完成。原有桌面 MCP/Python 包的签名逻辑和版本不变。

## 文件与机制

- `tools/science/build-he-engine-package.mjs`：固定 HE 组件的构建工具。
- `tools/science/science-engine-package.mjs`：清单验证、流式解压、隔离安装、切换和回滚。
- `tools/science/science-engine.mjs`：`verify`、`import`、`rollback` 命令入口。
- `tools/science/test-he-engine-package.mjs`：真实离线安装与已知金字塔 TIFF 的集成测试。
- `tests/contracts/science-engine-package.test.mjs`：归档安全、完整性及事务回滚的契约测试。

解压复用桌面运行时已有的 `yauzl` 依赖和逐项读取方式；不另外引入运行时 ZIP 库。构建使用桌面现有 `jszip`。工具需要已安装仓库依赖；它们目前不作为独立 Node 发行包提供。

包由 ZIP、JSON 清单及 `SHA256SUMS` 构成。清单包括：

- 引擎 ID、引擎版本、兼容应用版本、平台和架构。
- 外部 Python 条件，以及明确的 `bundled: false`。
- 每个组件的固定版本、PyPI 官方文件 URL、许可证表达式与许可文本路径。
- 每个归档成员的路径、类型、字节数及 SHA-256。
- 完整 ZIP 的字节数及 SHA-256。
- 已提供和明确未提供的能力。

固定组件为 `openslide-python==1.4.6`、`openslide-bin==4.0.1.2`、`Pillow==11.3.0`。构建从 PyPI 下载 wheel，逐一核对 PyPI 文件摘要，并将 wheel 内的许可证文本和来源记录一并装包。包内保留原 wheel，因此 wheel 内的元数据和原始许可证也保留。正式发行仍需完成项目级第三方分发义务审阅；这里只登记实际携带的许可信息。

## 构建

在 Windows x64、仓库根目录执行，输出目录必须为空：

```powershell
node tools/science/build-he-engine-package.mjs --output .build/science-engine-packages/he-7.0.0 --python 'C:\Program Files\Python312\python.exe'
```

只有构建步骤需要网络。输出中的 `manifestSha256` 是导入要固定的清单摘要。导入工具不接受省略摘要，也不会把同目录的 `SHA256SUMS` 自动当作可信来源。外部取得的包应从已信任的分发记录取得摘要；哈希用于完整性校验，本链路不声称已验证正式发行签名。

## 离线核验、导入及回滚

```powershell
node tools/science/science-engine.mjs verify --manifest '<manifest.json>' --archive '<package.zip>' --manifest-sha256 '<可信清单SHA256>'

node tools/science/science-engine.mjs import --manifest '<manifest.json>' --archive '<package.zip>' --manifest-sha256 '<可信清单SHA256>' --python 'C:\Program Files\Python312\python.exe'

node tools/science/science-engine.mjs rollback
```

StarDist 使用相同命令，但指定其清单、ZIP 和 `--python 'C:\Program Files\Python311\python.exe'`；回滚时必须传 `--engine he-stardist`，与 OpenSlide 的 `he` 安装状态相互独立。模型文件及 provenance 必须与仓库固定 profile 完全匹配。

### StarDist 实测记录（2026-09-22）

- 包路径：`.build/he-stardist-package-20260922-v4`。ZIP 为 496,153,296 bytes，共 294 个成员。
- ZIP SHA-256：`13cedeed4c3873b3f862d36cfc7a41e2ce4cf7a90988ede523b0ec648b056339`。
- 清单 SHA-256：`655198af0ba545bd18e61ce62f80b276e2b0627eddc3d4bb9489268897c9be35`。
- 固定环境：Python 3.11.9（外部）、StarDist 0.9.1、TensorFlow 2.15.1、NumPy 1.26.4、csbdeep 0.8.1。模型权重 SHA-256：`ce23a21f09511132c51e2c7b077054355b6b0c1cbece61066dd280054ee7178f`。
- `.build/he-stardist-offline-20260922/report.json` 记录两次隔离离线安装、两次 CPU 白图零核健康检查、三次 OpenSlide 三层 TIFF 参考读取、损坏 ZIP 拒绝和实际回滚。独立测试根目录未替换用户现有 Fiji、napari 或 HE 环境。
- 19 项包契约检查通过，包括固定模型哈希、模型遗漏/额外文件、依赖漂移和引擎隔离。StarDist 独立上限为 ZIP 1.5 GiB、单成员 512 MiB、展开 3 GiB、1500 个成员；原 HE 的较小上限保持不变。
- 所有 wheel 均重新对照官方 PyPI 文件摘要。5 个声明 Apache 2.0 却未携带许可正文的 wheel，补入哈希固定的 Apache 官方文本，并在 provenance 中明确其外部来源。3 个缺少明确 License 字段的 wheel 根据本次实际审阅的许可正文和精确文件哈希补记；其余许可及嵌入的第三方 NOTICE 原样保存。这不代替最终发行的第三方义务审阅。

默认管理根目录为 `%LOCALAPPDATA%\ZeroWallScience\science-engines`。可用 `--root '<独立目录>\science-engines'` 指定测试根目录；必须是名为 `science-engines` 的专用目录。不能将 Fiji 或 napari 目录作为安装根。自定义根目录下的 Python 路径需要通过现有 `ZEROWALL_HE_PYTHON` 提供给 Host；默认根目录使用既有 HE Reader 发现规则。

导入顺序如下：

1. 检查可信清单摘要、schema、固定组件、平台和 Python 条件。
2. 获取管理根目录安装锁，检查至少 1.5 GiB 可用空间。
3. 在 `.installs/he-7.0.0-<UUID>` 创建候选；流式校验 ZIP 及每个成员。
4. 使用外部 Python 创建 venv；通过 `--no-index`、`--only-binary`、`--require-hashes` 从包内 wheel 安装。
5. 验证固定组件版本、OpenSlide DLL 加载和已知颜色图像读取。
6. 保存清单、Python 完整版本/可执行文件摘要和健康探测的安装回执。
7. 使用目录 junction 激活候选；原安装进入 `.history`。成功后更新状态文件。

venv 创建后不搬迁，避免 `pip.exe` 等启动器中记录的绝对路径失效。`he-7.0.0` 只是激活入口；真正环境留在不可变候选路径。重复导入会产生新环境，并保留前一版本。`rollback` 交换当前与前一入口，不删除分析结果或用户数据。当前不自动清理历史版本。

已有普通 HE 安装目录也会保留为历史目录，回滚时恢复原路径。切换前安装或健康检查失败，不改变当前安装；切换过程中可恢复的文件系统错误会撤销切换。若系统中断或激活与回滚同时遇到文件系统错误，保留候选和旧安装供恢复，不声称回滚已经成功。进程硬终止遗留的 `.install.lock` 不会被自动删除；应先核实记录的 PID 和目录状态，再恢复操作。

## 归档与执行限制

- 拒绝父目录、绝对路径、盘符、反斜杠、Windows 设备名、尾部点/空格及替代数据流路径。
- 拒绝链接、特殊文件、加密成员、重复成员、大小写冲突、清单遗漏和未登记成员。
- ZIP 上限 256 MiB、单成员 128 MiB、解压总量 512 MiB、成员数 200；逐块读取并计量实际输出。
- 只执行工具内置的 HE 安装和探测命令，不运行包提供的脚本。
- 所有写入发生在专用管理根目录；删除失败候选前验证其绝对路径仍位于该根的 `.installs` 内。
- 外部 Python 必须持续可用。移除或升级其路径后需要重新探测/导入；本包不解决外部运行时迁移。

## 实测记录（2026-09-22）

实际工程包位于 `.build/science-engine-packages/he-7.0.0-20260922`：

| 项目 | 结果 |
|---|---|
| ZIP 大小 | 11,184,655 字节 |
| 成员数 | 31：3 个 wheel、25 份许可文本、3 份来源记录 |
| ZIP SHA-256 | `c3a02543fea50186349d105f4664bd3b2523fa232f28c341892594307b4d880c` |
| 清单 SHA-256 | `b0f56684a6e0c01910fd97768024ad6436dde9408cc05f8cc7506b8c6a625732` |
| 实际 OpenSlide 库 | 4.0.1；binding 1.4.6；binary wheel 4.0.1.2 |

16 项契约测试通过，覆盖真实临时目录和 ZIP，但其中环境创建使用测试回调，不冒充真实 Python 安装。真实集成测试另外运行两次离线安装、损坏包拒绝、回滚和三次参考读取，最终报告保存在 `.build/he-offline-package-smoke-20260922-final/report.json`。参考 TIFF 为软件合成基准：三层 `512×384 / 256×192 / 128×96`，L1 ROI 输出 `64×32`，颜色 `[80,60,120,255]`，MPP 为 `0.25 / 0.5`。这是图像读取与环境工程验证，没有医学推断。

```powershell
node --test tests/contracts/science-engine-package.test.mjs

node tools/science/test-he-engine-package.mjs --manifest '<manifest.json>' --archive '<package.zip>' --manifest-sha256 '<可信清单SHA256>' --reference '<create-he-reference.py生成的pyramid.tif>' --output '<新的测试目录>'
```

未完成的发布验收包括安装器内实际操作、签名分发、真实大型 SVS/NDPI 性能，以及其他按需引擎包。这些不能由上述 HE 小型合成测试替代。
