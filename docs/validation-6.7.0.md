# 6.7.0 本地验证记录

## 构建来源

- 应用版本：6.7.0，Windows x64，Electron 43.4.0。
- DeepSeek Harness：0.1.5-rc.2，提交 `fcf35ae8707237f7d7963a8182652ef706f08fb5`，源码工作树干净。
- 已重新构建 Harness Host、Client、Web；运行时包含 1290 个生产依赖位置。
- 包内 `resources/licenses/build-receipt.json` 记录 Harness 提交、版本及构建时间。
- 本记录首先完成于本地构建阶段；后续发布记录见 `publication-6.7.0.md`。

## Ketcher 修复

1. 使用已注入的 `ctx.remote.zerowallMcp`，修复 dotted service lookup 返回空值的问题。
2. 编辑器能力地址只保存在内存；通过不含令牌的导航标识查找，兼容原生侧栏重新生成标签 ID。
3. 关闭重开使用侧栏会更新的导航字段，避免原生页面保留初始 meta 后继续显示关闭页面。
4. 打开失败不提前登记成功，后续轮询可重试。

## 已通过检查

- `pnpm build`：Harness、插件、运行时和桌面构建成功。
- MCP：12 个测试文件、44 项测试通过；Host/Client TypeScript 检查通过。
- 构建新鲜度回归：拒绝旧插件文件、错误 Harness 提交及未提交的 Harness 源码变更。
- 打包前核对 383 个插件文件；包后比较 MCP JS 字节、桌面主进程产物及 Harness 构建记录。
- profiles 检查与 Harness pin 检查通过。
- 桌面启动和设置页中英文切换通过。
- Ketcher 独立 MCP/浏览器测试通过；资源响应 211 字节。
- 真实桌面 Host 的 `tool_search → tool_dispatch → MCP` 调用通过。
- Ketcher：离线打开、初始手性读取、设置结构、原子高亮、鼠标绘制单键并读回 `CC`、MOL/V3000 导出、关闭后重开并读回 `CC`。
- BioGenie 0.6.36：`ATGGCCATTGTA` 翻译为 `MAIV`，执行解释器为托管 Python 3.12.10。

## 证据位置

- `test-results/ketcher-mcp-tests.log`
- `test-results/ketcher-typecheck.log`
- `test-results/ketcher-standalone-6.7.0.log`
- `test-results/package-dir-6.7.0.log`
- `test-results/package-final-6.7.0.log`
- `test-results/ketcher-desktop-final-6.7.0.log`
- `test-results/skills-mcp/packaged/result.json`
- `test-results/skills-mcp/packaged/ketcher-stereochemistry.png`
- `test-results/skills-mcp/packaged/ketcher-desktop.png`

桌面测试使用临时配置和工作区，未修改用户现有会话。测试结束恢复包内 fixture 配置。
皮肤插件输出了部分 CSS 类名漂移提示，属于外观修饰兼容提示；本次未扩展修改皮肤。

## 本地安装包

- 文件：`desktop/dist/zerowall-science-6.7.0-win-x64.exe`
- 大小：341453611 字节。
- SHA-256：`ae9b1974c102c6fb462f397f735fd9916b7eb166ca66dce629ddc05471f0c17b`。
- NSIS 构建与构建后的桌面启动验证成功；本地 release JSON 大小和哈希一致。
- 最终 NSIS 构建输出的目录包再次通过完整 Ketcher、BioGenie、Python 桌面测试；测试 fixture 已移除，包内配置与源码一致。
- 本地生成的更新元数据包含预设发布地址，不表示该地址已发布。
