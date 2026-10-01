# ZeroWall Science 7.5.0 Office / GIS 修复验收

本报告对应用户反馈后的重新打包版本，已完成代码修复、行为测试、Windows 打包和真实安装后回归。最终产物和证据见 [安装包验收报告](package-verification-7.5.0.md)。旧安装包与旧报告保存在 desktop/dist/archive-7.5.0-before-office-gis-repair，旧 QA 文件保留。

## 修复内容与原因

- 通用查看器同时在 better-sidebar 和 DSH 原生侧栏认领了 Office。现两套注册均让出 DOC/DOCX、PPT/PPTX、XLS/XLSX、CSV/TSV；聊天与历史附件在有、无工作区时均验证、物化原文件后打开 DSH 原生文档容器。文本、Markdown、HTML 的原编辑入口继续保留。
- Office→PDF 适配层把客户端的 sessionId 参数直接传给 Host render，缺失 workspaceRoot 后触发 undefined.trim。现复用 DSH workspaceFileScope 查找器，包含历史会话和无 cwd 的默认根，再传入正确上下文；由原生服务保留文件授权、版本检查、队列、缓存与读取上限。附件转换另补取消、容量、大小及 SHA-256 检查。
- 融合代码漏掉 GIS 插件和格式表。现接入 SHP、GeoJSON、TopoJSON、KML、KMZ、GPX，使用 shpjs 的浏览器 ESM 避免引入 Node util/zlib；Leaflet CSS 与资源随包提供。安装后发现 Host 资源白名单漏掉 Leaflet，现补齐 CSS / PNG 白名单及正确媒体类型，保留目录边界检查。补齐 SVG 尺寸同步，修复地图边界裁切并在销毁时清理观察器。
- 单独 SHP 仅承载几何；缺少 DBF/PRJ 等时不宣称具备属性和投影。在线底图与本地几何渲染分离，断开底图仍可预览。

## 已完成检查

- 文件插件类型检查通过。
- 文件插件 37 项行为测试通过，覆盖默认路由、无工作区、授权拒绝、取消、有界读取、完整性与原有附件解析。
- 文件/视觉适配及科研引擎 11 项契约测试通过；配置检查通过。
- 使用 gadm41_CHN_0.shp（12,213,136 字节，SHA-256 f3c8bc3e0dadf3dd42f3a9beb226cd32aa6371b1ff094eb9e7dcff2fe9faffb3）完成开发界面回归：聊天、文件树、历史、无工作区四项通过；4 个几何要素，地图 SVG 尺寸与 Leaflet 分配一致，截图确认东北边界完整。该先导验证替换了旧包的客户端与地图 CSS，不能代替最终安装包验收。

## 最终安装验收

- 稳定 Windows 安装程序：desktop/dist/zerowall-science-7.5.0-win-x64.exe，397,467,215 字节，SHA-256 d9621384664b2572814cb73476848fdc32479e85daf399c2bbf55db42fd6a37f。
- 应用 ASAR：763,282,886 字节，SHA-256 d6730aa24bd93f60ce7c17417102dc4b926b31a6390189679999ba974cf8588d；中文目录隔离安装后哈希完全一致。
- pnpm verify:package 通过 Host / Desktop 运行与政策审计、About 7.5.0 和中英文切换；731 个 LibreOffice 物理资源文件可读取。最终查看器代码、PDF Worker、地图样式与图标均与源编译文件一致。
- 无客户端 / Excel 替换的安装后回归共 42 项通过：12 次附件预览、2 次原生 Excel 缩放检查、12 次转换 RPC、1 次实际转换按钮、5 次文件树打开、10 次历史附件重开；未捕获页面异常为 0。
- 原生 PPTX 显示 12 页，生成样本为 2 页；DOCX 显示 38 页，竖向页面和真实文字可见。原生 Excel 显示 Sheet3、13 行、14 列、173 个渲染记录，窗口变化正常。
- SHP 的工作区聊天、文件树、历史、无工作区聊天和无工作区历史五个入口全部进入通用 GIS 查看器；4 个几何要素，阻断底图后仍显示边界，截图确认东北边界无裁切。地图 CSS / PNG 本地 HTTP 返回 200 且媒体类型正确；未知和越界资源拒绝。
- 六份输入原文件哈希保持不变。所有 Office RPC 返回有效 PDF，missingFonts 为空；实际 Office→PDF 按钮正常显示转换 PDF，不再出现 undefined.trim。
- 最终证据：.build/qa/750-repair3-installed-routes/results.json、该目录截图和转换 PDF，以及 .build/qa/750-repair3-final-verification.json。

## 证据与边界

源代码保持 DSH 0.2.0-rc.2 / 93bacb7e30c888cc01a1322245a33ff3be9ff2b3，未修改子模块。此前完整实现与真实 PPT 生图/MinerU 会话证据见 file-preview-ppt-visual-verification-2026-10-01.md；本轮不重复收费服务调用。

旧版 Office 验收覆盖不足：单独引擎转换成功不代表插件 RPC / 按钮可用，认领到扩展名和存在 canvas 不代表版面正确。切换文件时上一标签的 canvas 会短暂保留，本轮按当前文件完整地址定位原生容器，等待加载结束，并检查页数、页面尺寸、非空像素和 DOCX 竖向页面；另外补充明确的 RPC / 按钮回归和地图资源 HTTP 检查。

未发布 GitHub、七牛或生产渠道；保留用户运行的应用、配置、凭据与原始附件。
