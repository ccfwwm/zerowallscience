# ZeroWall Science 7.5.0 修复安装包验收

验收时间：2026/10/1 09:57:31（北京时间）。分支：codex/dsh-file-preview-ppt-visual。仅构建与验证，未发布 GitHub、七牛或生产渠道。

后续已按用户要求发布七牛云与 GitHub，并合并到 main；公开下载、资产哈希及发布边界见 [发布验收](release-publication-7.5.0.md)。本报告保留安装验收时的原始记录。

## 交付物

- 安装程序：desktop/dist/zerowall-science-7.5.0-win-x64.exe。
- 安装程序大小：397,467,215 字节。
- 安装程序 SHA-256：d9621384664b2572814cb73476848fdc32479e85daf399c2bbf55db42fd6a37f。
- 应用 ASAR 大小：763,282,886 字节。
- 应用 ASAR SHA-256：d6730aa24bd93f60ce7c17417102dc4b926b31a6390189679999ba974cf8588d。
- 根、桌面、20 个 ZeroWall 插件、更新元数据与 build receipt 均为 7.5.0；上一版 7.4.0 安装程序哈希保持不变。

## 本轮修复

Office 和 Excel 默认使用 DSH 原生查看器，两套侧栏注册均让出 DOC/DOCX、PPT/PPTX、XLS/XLSX、CSV/TSV。聊天与历史附件在有、无工作区时均先授权和物化原件，再打开原生文档容器。

Office→PDF 适配层复用 DSH 的 workspaceFileScope 查找器，传入正确会话上下文，修复 undefined.trim；保留取消、版本与完整性校验及读取上限。

SHP、GeoJSON、TopoJSON、KML、KMZ、GPX 接入通用查看器。SHP 解析使用 shpjs 浏览器构建；Leaflet CSS / PNG 随包提供，Host 资源白名单和媒体类型正确；同步地图 SVG 实际尺寸以避免边界裁切。

既有附件自动解析、PPT 提示词分流和科研 PPT 生图流程继续保留；原实现和真实模型测试见 [实现报告](file-preview-ppt-visual-verification-2026-10-01.md)。本轮没有重复调用收费生图和 MinerU 服务。

## 验证结果

| 验证 | 结果 |
| --- | --- |
| 文件插件类型检查及行为测试 | 通过，37 项测试 |
| 文件/视觉适配及科研引擎契约 | 11 项通过 |
| 配置检查、运行文件新鲜度、git diff --check | 通过；新鲜度核对 202 项 |
| DSH / 插件 / 资源 / 桌面构建与稳定 Windows 打包 | 通过；最终修复插件重新编译并同步到受审计运行目录 |
| pnpm verify:package | 通过，Host、Desktop、Settings / About 7.5.0、中英文切换 |
| 安装版 LibreOffice 物理资源 | 731 个文件全部解包并可读取 |
| 最终插件、PDF Worker、地图样式及图标 | 与源编译文件逐字节一致 |
| 独立中文目录安装 | 通过，安装后 ASAR 与正式载荷哈希一致 |
| 真实安装后预览回归 | 42 项通过，无客户端 / Excel 替换，无未捕获页面异常 |
| 地图资源 HTTP / MIME / 路径边界 | CSS 和 PNG 返回 200，未知与越界资源拒绝 |
| 原始附件哈希 | 六份输入文件保持不变 |

隔离安装目录：C:\softworks\gpt-tools\zerowallscience\.build\installer-test-750-office-gis-repair2\科研应用 中文目录。独立 appId：com.zerowall.science.installer-test-750-office-gis-repair2。当前用户安装，保留用户生产应用、配置和凭据。

42 项回归包括：两种会话模式下 12 次附件打开、2 次原生 Excel 诊断与窗口缩放、12 次 Office RPC 转换、1 次实际 Office→PDF 按钮、5 次文件树打开、10 次历史附件重开。

原生 PPTX 为 12 页，真实生成的两页演示稿为 2 页；DOCX 为 38 页，第一页面竖版布局和文字可见。按当前文件地址检查原生容器、加载结束、页数、尺寸与非空画布像素；截图经人工核对。Excel 显示 Sheet3、13 行、14 列、173 个渲染记录，表头、说明区、数据行与 Sheet3 标签可见；渲染记录不等同于非空单元格计数。

SHP 使用原始 gadm41_CHN_0.shp，12,213,136 字节，SHA-256 f3c8bc3e0dadf3dd42f3a9beb226cd32aa6371b1ff094eb9e7dcff2fe9faffb3。5 个入口通过，4 个几何要素；阻断在线底图后仍渲染边界，SVG 尺寸无裁切。

两种会话模式、两种 RPC 的 Office 转换均生成有效 PDF，缺失字体列表为空；实际转换按钮也显示 PDF。

| 原件 | PDF 字节数（工作区 RPC） |
| --- | ---: |
| sample.pptx | 699,617 |
| sample.docx | 530,932 |
| sample.xlsx | 94,943 |

## 证据和边界

- .build/qa/750-repair3-package.log、750-repair3-verify-package.log、750-repair3-artifacts.json。
- .build/qa/750-repair3-installed-routes/results.json、该目录的入口截图与转换 PDF。
- .build/qa/750-repair2-isolated-installation.json、750-repair2-payload-check.json、750-repair3-final-verification.json。
- .build/qa/750-repair2-contracts.log、750-repair2-profiles.log、750-repair3-runtime-freshness.log。

旧安装包与报告已归档；第一候选版因地图 CSS 路由漏项未通过最终回归，第二次打包因同步时混入六个开发文件被运行政策审计拒绝。已清理这些明确文件，第三次打包和最终验收通过。所有失败日志保留，不作为成功证据。

模型凭据未配置的隔离 profile 中，聊天模型显示 MISSING_CREDENTIAL；该状态与附件解析、预览和转换分开，测试没有使用用户凭据。

仅有 SHP 时预览几何；DBF 属性和 PRJ 投影需要配套文件。本轮 GIS 实测覆盖该 SHP，未逐类验证全部 GIS 格式。预览累计上限 50 MiB，其他未逐类验证格式仍受解析器能力限制。

当前用户隔离安装未覆盖管理员全机安装与 UAC；安装体积超过建议预算但运行审计通过。本轮未重复全仓上游组合测试；此前定制预期与 Windows 无 Bash 的失败边界见实现报告，不声称全仓测试全部通过。
