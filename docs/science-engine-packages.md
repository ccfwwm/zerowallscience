# ZeroWall Science 7.1.0 科学引擎模型包

7.1.0 的 HE / StarDist 包只携带模型数据和来源证明，不携带 wheel、Python、venv、conda 环境或私有 `site-packages`。所有本地 Python 代码使用软件唯一的共享运行时：

```text
%APPDATA%\zerowall-science\Python\python.exe
%APPDATA%\zerowall-science\Python\Lib\site-packages
```

依赖版本来自签名的 `resources/python/dependency-manifest.json`，通过桌面 Python 依赖同步流程安装到上述目录。HE、StarDist、MCP、Skills、论文查重、OCR、数值审计、BioGenie 和脚本都不能创建或切换到独立依赖 profile。Fiji、napari、R 和远程服务仍是外部运行时，不会被伪装成 Python profile。

## 包格式

`tools/science/build-he-engine-package.mjs` 生成一个模型包 ZIP、一个清单和 `SHA256SUMS`。清单固定：

- `engineVersion` 和 `compatibleApplications` 为 `7.1.0`；
- Windows x64 与 CPython 3.12 共享布局；
- 每个模型/来源文件的大小与 SHA-256；
- 共享依赖清单中的包名和版本引用，包本体不进入 ZIP；
- 明确的能力和未提供能力。

HE 包只包含 OpenSlide 读取所需的来源证明；StarDist 包另包含固定哈希的 `2D_versatile_he` 模型文件。`openslide-python`、`openslide-bin`、`Pillow`、`stardist`、`csbdeep`、`tensorflow` 等依赖由共享依赖清单安装。

## 构建与核验

```powershell
node tools/science/build-he-engine-package.mjs --engine he --output .build/science-engine-packages/he-7.1.0
node tools/science/build-he-engine-package.mjs --engine he-stardist --model <已核验模型目录> --output .build/science-engine-packages/he-stardist-7.1.0
node tools/science/science-engine.mjs verify --manifest <manifest.json> --archive <package.zip> --manifest-sha256 <可信清单摘要>
node tools/science/science-engine.mjs import --manifest <manifest.json> --archive <package.zip> --manifest-sha256 <可信清单摘要> --root <模型数据目录>
```

导入前验证清单摘要、平台、共享 Python 布局、归档摘要、每个成员摘要、路径安全和展开上限。导入使用临时目录原子替换模型目录，并写入 `install-receipt.json`；失败不会覆盖现有模型。导入命令不会创建 Python 环境，也不接受 Python 路径参数。

## 运行时和依赖安装

桌面安装包只带 Python 解释器和 pip。其余依赖由签名清单驱动的共享环境同步任务安装，界面显示实时日志、当前包、总进度和失败包。单个包失败会记录并跳过，其余包继续；失败包保留在同步状态中，可以单独重试。依赖版本在界面中显示为包版本，`1.4.1-r*` 这类依赖清单修订号只用于校验，不作为 Python 环境名称。

Python 设置页提供共享解释器路径、site-packages 路径、依赖清单检查、同步日志、镜像设置和“一键打开共享 Python 命令行”。命令行启动时固定 `PYTHONNOUSERSITE=1` 和共享 `PYTHONPATH`，不会加载用户 venv、conda 或 Skills 私有目录。

## 外部运行时边界

Fiji、napari、R、远程 Biomni/R、GPU 驱动和系统级命令行工具由各自探测器管理。它们可以有自己的系统安装或远程环境，但不能写入 ZeroWall 的 Python 依赖目录，也不能把外部环境显示为本地 Python profile。

## 测试

```powershell
node --test tests/contracts/science-engine-package.test.mjs
node tools/science/test-he-engine-package.mjs --manifest <manifest.json> --archive <package.zip> --manifest-sha256 <可信清单摘要> --output <新的测试目录>
```

测试覆盖模型包完整性、路径穿越、未登记成员、模型目录原子替换、损坏包拒绝、共享 Python 清单引用和 StarDist 的固定模型信任边界。
