# Python 环境与后台依赖维护

当前合同适用于 8.4.1。Python 插件及桌面桥接共同管理一个固定运行时，Python 内容 revision、依赖层版本和桌面版本独立。资源维护操作见 [扩展更新指南](extensions-update-guide.md)，构建发布见 [开发指导](codex-development-guide.zh-CN.md)。

## 固定路径

默认解释器为实际安装应用目录下的 Python/python.exe，依赖为同一目录的 Python/Lib/site-packages。用户可以明确选择其他固定根目录；所有消费方使用解析后的同一实际路径。不会自动回退到 Roaming/LocalAppData、创建 profile 私有环境、激活旧 slots 或迁移旧解释器。MCP、Skills、科研服务和脚本不得自行创建另一套 Python 依赖。

当前稳定安装器采用薄包，不携带完整 Python ZIP 或全部科学依赖。首次在线准备依赖签名 bootstrap 和依赖清单；离线首次安装不能声称 Python 科学环境已就绪。已有健康环境直接复用。运行时文件和依赖缓存、任务记录分别管理。

安装器外层和应用保留原用户身份。可写目录按现有后台策略维护；固定 Python 根需要额外权限时，自动任务报告 `PYTHON_AUTHORIZATION_REQUIRED` 并等待用户在 Python 设置手动确认。只有签名 Python worker 单独请求 UAC，提权前与提权进程启动时分别复核 worker 签名及文件摘要；受保护通道仅允许固定根的签名 bootstrap、签名依赖层事务、状态、取消及回滚。任意包安装不能通过该通道提权。界面、账户、Host 和凭据仍由原用户进程持有。升级改变应用目录时，将已有 Python 根保存为原用户的明确固定路径，不移动解释器。

## 自动维护

桌面先可用，再在持久后台队列处理签名 bootstrap/recovery 和 core/science 依赖：

1. 启动时检查固定根的解释器、已安装包及已验证签名清单。
2. 自动准备缺失或需要恢复的基础运行时，再逐包处理 core/science 的缺失和版本差异。
3. 下载并校验包，按完整签名清单逐包安装，确认 distribution 版本元数据；更新清单和任务状态。
4. 完成后读取已安装 distribution 元数据，重新计算待同步差异；安装期间不运行 import 探测或全环境 pip check。
5. 定期（按小时）读取线上签名依赖清单；发现可适用更新时由同一后台队列执行。

不是追逐 PyPI 任意最新版，而是跟随已签名、审核并发布的版本清单。正常维护不要求用户逐包点击，不阻塞界面。网络不可用、实际安装失败或签名异常时保留真实失败状态及可恢复任务；不能仅因任务执行完或解释器可运行就显示科学依赖全部完成。

core/science 为自动维护范围；capability 属于可选能力，由用户明确选择。重启只恢复符合自动维护条件的任务，不重新启动原先需要人工选择的操作。打开扩展中心只读取状态，不借读取动作触发安装。

## 校验、事务和恢复

依赖来源为 resources/extensions/python 中的 dependency-manifest.json、core-dependency-manifest.json、requirements 锁定文件与 skill-dependencies.json；签名信任由 config/catalogs/trusted-keys.json 管理。签名清单的 applicationVersion 和 revision 可能早于当前桌面，不能为桌面版本对齐而随意改写签名字节。

下载检查长度、SHA-256 和 ZIP 完整性，临时文件校验通过才进入安装事务。逐包记录旧 distribution 的文件清单，文件提交或 distribution 元数据写入失败时恢复同一固定根路径中的旧文件；成功包保留，失败包记录原因并供重试。不通过切换 current.json、generation 或 Junction 更换解释器。

源码包先验证归档，在临时构建环境执行 PEP 517，再验证产出的 wheel 和构建收据。构建工具不替换活动 Python，不修改其固定路径或启动隔离配置。

队列、下载缓存、状态和日志持久化；安装状态核对实际文件、版本、剩余差异与恢复结果；import 和 pip check 仅作为单独的显式诊断，不把进度条当验收。用户自装包与已成功内容不得为修复一个失败包而整体删除。

## 镜像和凭据

默认中科大镜像 https://mirrors.ustc.edu.cn/pypi/simple，保留用户明确选择的其他镜像。pip 显式使用当前镜像并隔离外部配置，不改全局 pip.ini。不通过关闭 TLS 校验或静默切换镜像解决下载失败；重试后记录包名、镜像和实际错误。密钥只使用安全存储或环境变量引用，日志需脱敏。

## 外部运行时

Fiji、napari、R、远程 Biomni/R、GPU 驱动及系统 CLI 由对应探测器管理。外部工具可以使用其自己的系统或服务器运行时，但不能冒充 ZeroWall 的固定 Python，也不能写入其依赖根。

发布验收至少覆盖首次准备、已有环境复用、启动检查、逐包安装、网络中断恢复、独立依赖更新和同路径回滚。桌面、Python 插件和依赖资源分别发布；安装器验收不能代替在线依赖链路验收。
