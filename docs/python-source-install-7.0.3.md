# 7.0.3 Python 源码安装修复与验收

## 修复范围

共享 Python 的包管理支持从配置镜像下载源码并本地构建。FlowIO、docopt、autograd-gamma、bibtexparser、nglview 使用通用流程，不将专用 wheel 随安装包分发。科研工作台界面不属于本轮修改范围。

嵌入式 CPython 的 `python312._pth` 会限制模块搜索，并影响 pip 为构建后端建立的隔离环境。构建时复制解释器二进制、标准库及扩展模块到短临时目录，仅该临时副本不使用 `._pth`；活动解释器及其路径配置保持不变。pip 的 PEP 517 构建隔离仍然开启。

## 安装流程

1. 优先解析兼容 wheel；只有明确缺少可用发行文件时，普通用户安装才尝试源码候选。
2. 保留版本范围、extras 与 Python 版本要求，使用当前配置镜像。
3. 下载并验证源码归档 SHA-256 后才执行构建后端。
4. 临时解释器清理继承的 Python/PIP 路径配置，使用有效 CA 和 HTTPS。
5. 保存构建日志、源归档哈希、产物哈希、包名、版本和来源。
6. 将本地 wheel 和原始版本要求一起交给 pip 解析，包含真实转依赖。
7. 应用前再次验证源码、wheel 和收据；安装到候选环境，通过 pip check 和导入检查后由更新服务切换。

签名依赖同步只构建 manifest 明确声明 `source: "sdist"` 的归档。缺少该声明时不能把 wheel 锁定偷偷替换成源码。

## 已完成的真实验证

- CPython 3.12.10 嵌入式副本：五个锁定源码包均实际构建成功，记录于 `.build/python-source-builder-live/receipt.json`。
- 真实 PEP 517 测试后端：在继承路径和 CA 配置受污染时，后端及其子进程仍可加载 `socket` / `ssl`；原始 `._pth` 字节保持不变。
- docopt 版本范围：下载、源码构建、候选安装、导入及函数调用成功；原环境未安装该包，记录于 `.build/source-install-smoke-1790138308217/receipt.json`。
- FlowIO 版本范围及 NumPy 转依赖：普通源码安装和显式授权源码的 manifest 安装均成功；缺少源码授权的 manifest 被拒绝。原始环境保持未安装 FlowIO，记录于 `.build/python-source-install-evidence/source-install-receipt.json`。
- 编译后的桌面 Python 后台进程：通过真实 IPC 完成签名基础包安装、docopt 源码预览、候选安装、导入检查与回滚；使用 128 MiB Node 堆限制和独立目录，记录于 `.build/compiled-python-worker/run-1790140690528/receipt.json`。
- 清华镜像：387 项签名依赖对应文件及索引哈希核对通过，其中 382 项 wheel、5 项源码。

详细验证收据与本地安装包收据分别保存；构建成功不代表全部科学功能或远程生产环境已完成验收。

## 工具链边界

源码安装并不等于所有源码包都无需编译工具。C/C++、Rust 或依赖系统库的包仍需要对应编译器、Python 开发头文件及系统库。构建日志保留原始失败原因。临时构建环境用于依赖和路径隔离，并不是运行不可信源码的操作系统沙箱。

本轮未自动上传七牛依赖清单，未进行生产发布。
