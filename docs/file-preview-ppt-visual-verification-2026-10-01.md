# 文件预览、附件解析与科研 PPT 视觉流程实现及验收

版本：7.4.0。分支：`codex/dsh-file-preview-ppt-visual`。本轮仅构建与验证，不发布 GitHub、Qiniu 或生产渠道。

后续 7.5.0 修复已将 Office / Excel 默认入口改为 DSH 原生查看器，并补充 SHP / GIS 接管。本报告保留原实现和真实生图、MinerU 证据；当前预览行为和安装包结论以 [Office / GIS 修复报告](office-gis-repair-7.5.0.md) 及 [7.5.0 安装包验收](package-verification-7.5.0.md) 为准。

## 实现

| 链路 | 最终行为 |
| --- | --- |
| 文件预览 | 内置固定提交 `20aecc32cc597f6de094d2c7febddfb60f3ae1ef` 的查看器适配、固定 `@open-file-viewer/core@0.1.49`，通过公开插件接口接管支持格式。文本、代码、Markdown、HTML 和科研工作台保持各自入口。 |
| 附件解析 | Host 自动排队；DOCX、PPTX、Excel/CSV/TSV 本地结构化提取，PDF/OCR 使用 MinerU，缺配置与降级原因可见。摘要、完整产物和原件分别保存。 |
| PPT 生成 | 新建科研 PPT 默认三张风格样张、自动选择、内容种子和参考样张编辑。文字、图表、数据、连接线与布局仍由 Univer 原生对象生成。 |
| 提示词 | 被动识别、阅读、总结和比较附件走解析链路。制作或改版 PPT 加载 `zerowall-presentation`、`univer`、`univer-slide`；编辑已有草稿保留原图。 |

LibreOffice 完整引擎目录解包，运行时解析真实物理路径。原生 Excel 增加懒加载、Worker、初始化和渲染错误边界、重试、哈希诊断与备用入口；稳定 FortuneSheet 菜单数组的引用，ResizeObserver 忽略重复尺寸并通过动画帧通知。根据实际安装应用的错误栈，进一步将只读公式引用高亮改为仅在工作表、选中单元格或公式变化时更新，消除布局效果重复写入状态造成的 React 更新深度超限。通用查看器提供独立的“原生查看器”和“Office→PDF”按钮。

附件 `sha256:` 和 `file-sha256:` 统一会话授权与完整性校验，包括 Host 已接纳、尚未写入 user/message 的短暂阶段。仅知道哈希不能跨会话读取。解析内容以不可信数据进入会话日志，模型错误不删除解析结果。

附件元数据按路径串行更新，读取最新版本后只合并本次变更；保留并发会话授权及本地/MinerU 两套解析记录。临时文件使用独立 UUID，Windows 临时文件锁导致的 EPERM/EACCES/EBUSY 使用有界重试，避免并发导入和自动解析时的文件替换冲突。

原件按 512 KiB 分段读取，每段检查版本，支持取消，预览累计上限 50 MiB；超过上限明确拒绝。PDF Worker、CMap、字体和 WASM 随包提供。Office 压缩包解析另有条目数和解压大小上限，完整提取产物通过分页读取使用。

MinerU 任务提交后持久化 taskId 与上传阶段；上传中断时恢复同一任务、校验并补传原件，不重复提交新任务。图片生成失败保存无凭据的失败记录；成功资产记录模型、来源路由、尺寸、提示词和输入图片哈希。

当前聊天模型必须支持图像输入；资产或页面改变会使旧审查失效，导出门控要求重新检查。上游 Univer 和 DSH 的适配只作用于受版本、提交、技能哈希和锚点约束的随包副本，未修改 DSH 子模块。

## 已完成的行为证据

- 相关测试：12 个测试文件、97 个测试通过；含附件授权、结构化解析、分页、取消、完整性、视觉门控、并发清单更新、审查失效、MinerU 上传中断恢复及公开侧栏 hook 接入。新增回归验证同一时间戳下 12 次并发导入仍保留全部授权，本地与 MinerU 并发解析及再次导入不会丢失记录。文件模块 27 项测试和类型检查通过，图片模块 23 项测试和类型检查再次通过。
- 适配契约：3 项通过。DSH 定制检查、配置检查和运行依赖闭包通过；闭包包含 291 个工作区包。
- 实际应用点击验证：聊天附件中的 PPTX、DOCX、Excel，文件树 PPTX，历史附件重开和无工作区的三个附件均打开通用预览；无工作区会话通过会话搜索导航。最终安装目录结果见下方安装验收记录。
- 原生 Excel 显示 Sheet3、13 行、14 列、173 个渲染单元格记录；本地结构解析返回 50 个单元格记录。两种解析器对空白及格式单元格的计数口径不同，不能混称 173 个非空值。
- 离线查看器测试覆盖原 PPTX、DOCX、Excel，以及 PDF、PNG、ZIP、EML、WAV 和新的可编辑 PPTX：无页面异常、无外部 CDN 请求；Excel 通用预览有 13×14 表格，PPTX 使用图文渲染。
- 使用 ZeroWall 当前云配置真实生成三张样张、种子和最终插图，并以种子第一、选定样张第二执行 edit_image。实际模型 `gpt-image-2`，请求质量 `medium`，1536×1024；provider 未返回实际质量，因此记录 `unreported`，不将请求质量冒充实际质量。首次网络中断后一次有界重试成功。
- 使用当前配置聊天模型 `gpt-6.1-sol` 审查样张、插图和 Univer 页面截图，审查通过。
- 通过真实固定版本 Univer Gateway 完成一页可编辑小样：7 个 shape、5 个原生文本对象和 1 个独立图片；inspect/lint/screenshot、文字修改、图片移动和裁剪、保存重开和 PPTX 导出成功。单图替换只有目标图片对象改变，其他对象保持一致，随后恢复原图。PPTX ZIP 只读检查确认原生文本和图片分离，通用查看器也能打开。
- MinerU Precision 真实中断恢复：同一 taskId `3f0b16b8-62ff-40ec-b834-25ce11baa5a6` 补传并完成，完整产物保留。
- 当前聊天模型的九个中文问法路由探针通过：识别和阅读不加载 Univer；扫描 PDF 选择 MinerU；新建或统一风格加载演示文稿技能；修改 Univer 草稿加载 Univer 编辑技能。该探针验证工具和技能选择，完整多页生成由下面的真实会话单独验收。
- 真实应用会话 `session-d8d2e5ed-3292-4777-bbb4-e6407f2d14c3` 使用当前 `gpt-6.1-sol` 自动完成两页科研 PPT：三张风格样张自动选择、两张内容种子、以样张为第二输入的两次 edit_image、Univer 原生编译、逐页 inspect/lint/screenshot 和视觉审查、保存重开、导出及重新导入；全程未逐页请求用户确认。独立 ZIP 检查确认第 1 页有 17 个 shape、10 个原生文字 run、1 个图片和 1 个连接线，第 2 页有 23 个 shape、15 个文字 run、1 个图片和 1 个连接线。通用查看器渲染成功，无页面错误及外部请求。

## 安装包验收

最终稳定安装程序：`desktop/dist/zerowall-science-7.4.0-win-x64.exe`，397,040,628 字节。SHA-256：`3c19f20f907085e644b053497d837289f0c7ceca5033a041d3034a6f11b60a5b`。

ASAR：761,741,635 字节，SHA-256：`5876847c965a4e86c5cdc84df436f858d90060a31e57adf343f53d1a0e38fc60`。

基于同一 win-unpacked 载荷构建独立 appId 安装器，实际安装到中文目录 `C:\softworks\gpt-tools\zerowallscience\.build\installer-test-740\科研应用 中文目录`。安装后 ASAR 与稳定包完全一致。

最终安装目录使用原始随包代码测试，clientOverride=false、excelOverride=false：13 项全部通过。工作区与无工作区的 PPTX、DOCX、Excel、离线 PDF、新生成的两页 PPTX 均可点击聊天附件打开；原生 Excel、文件树和历史附件重开通过，无页面异常。

安装目录 Office→PDF：sample.pptx 670,944 字节；sample.docx 530,932 字节；sample.xlsx 94,943 字节。729 个物理引擎资源齐全，PDF 文件头正确，missingFonts 为空，原文件 SHA-256 未变。

最终 pnpm verify:package 通过，包含 Host、Desktop、Settings 和中英文界面检查。测试仅使用隔离数据目录和独立安装注册项，未修改生产应用或发布渠道。

## 验证边界

- 上游 `test:dsh:composition` 仍有 4 个失败、3 个通过：测试预期 `deepseek-flash`，当前定制默认为 `deepseek-v4-flash`；Windows 环境没有 Bash，关联请求计数与子代理拒绝断言也失败。未修改上游或削弱断言掩盖；本项目真实 Host/Viewer 入口证据单独记录。
- 一次并行验收中，ELECTRON_RUN_AS_NODE 的 Office 测试进程在三次转换成功后的关闭阶段发生 PostQueuedCompletionStatus 异常，以 0x80000003 退出。相同安装载荷随后独立重跑，三次转换、资源检查及进程退出均通过（exit 0）。该并行关闭异常原因尚未进一步定位，日志保留于 `.build/qa/final-installed-office.log`；未将转换产物成功等同于该次进程测试通过。
- 真实自动生成会话覆盖两页概念演示稿；对象级文字修改、移动、裁剪和独立换图由另一份一页 Gateway 小样验证。未将该验收扩展为大量页数、所有科研主题或正式实验数据的质量保证。
- 查看器逐类提供基础预览或元数据预览，复杂 Office 版面有原生与 PDF 备用入口。未声称所有认领扩展名均已逐个文件验证或与 Office 完全一致。
- 安装测试使用独立 appId 和当前用户安装，不覆盖正在使用的生产注册项；不验证管理员级全机安装与 UAC。

## 证据位置

- `.build/qa/final-97-tests.log`
- `.build/qa/final-adapter-contracts.log`
- `.build/qa/final-dsh-verify.log`、`final-profiles.log`、`final-closure.log`
- `.build/qa/viewer-categories/results.json`
- `.build/qa/prompt-routing-live/results.json`
- `.build/qa/ppt-cloud-pilot/result.json`、`univer-result.json`、`image-replacement.json`、`pptx-structure.json`、`page-review.json`
- `.build/qa/ppt-live-session/result.json`、`pptx-structure.json`；该目录的隔离 profile 保存真实会话日志，workspace 保存草稿、导出、清单、图片和页面截图。
- `.build/qa/live-pptx-viewer/results.json`
- `.build/qa/final-images-tests.log`、`final-images-typecheck.log`
- `.build/qa/final-packaged-routes-v2/results.json`、`final-installed-routes/results.json`
- `.build/qa/final-installed-office-v3/office-conversion.json`、`final-installed-office-v3.log`
- `.build/qa/isolated-installation.json`、`final-artifacts.json`、`final-verified-package.log`
- `.build/qa/final-files-tests.log`、`final-files-typecheck.log`
- `.build/qa/mineru-live-pilot-upload/result.json`

所有原件保持原始 SHA-256；测试使用隔离数据目录，云凭据只读使用且未写入日志或报告。
