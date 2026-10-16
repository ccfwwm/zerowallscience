/** Render source documentation without depending on build outputs or catalogs. */
export function sourceRepositoryReadme({ version, sourceOnly, sourceCommit, dshCommit, integrations }) {
  const cell = value => String(value ?? '—').replaceAll('|', '\\|').replaceAll('\n', ' ')
  const upstreamRows = Object.entries(integrations)
    .filter(([, entry]) => entry && typeof entry === 'object' && entry.repository)
    .map(([name, entry]) => `| ${cell(entry.package ?? name)} | ${cell(entry.resourceVersion ?? entry.version ?? entry.coreVersion ?? entry.tag)} | [上游](${entry.repository}) | ${cell(entry.commit)} |`)
    .join('\n')
  return `# ZeroWall DSH Plugins — ${version}

ZeroWall Science ${version} 的插件与资源源码总仓库。各插件、Skills、MCP、Python 内容分别使用独立版本；桌面版本变化不会自动提升所有资源版本。

本次导出模式：**${sourceOnly ? 'source-only，仅源码快照' : '源码与资源快照'}**。源码导出或验证通过不代表 ${version} 已在线发布；七牛/GitHub 发布状态、资源签名与下载校验以独立发布收据为准。

## 当前源码目录

| 路径 | 内容 |
| --- | --- |
| \`plugins/\` | 自有领域插件、第三方适配、composition bundles、Research Store 与支持包的 canonical 源码 |
| \`resources/extensions/skills/\` | Skills 源码 |
| \`resources/extensions/mcp/\` | MCP Server 资源源码；SciMaster launcher 位于 \`plugins/mcp/src/scimaster/\` |
| \`resources/extensions/python/\` | Python 签名依赖清单与内容合同 |
| \`resources/extensions/runtimes/\` | 独立运行时资源 |
| \`resources/extensions/engines/r/\`、\`resources/extensions/capabilities/biogenie/\` | R 环境与 BioGenie 能力资源 |
| \`config/\`、\`schemas/\`、\`tools/\`、\`tests/\` | 版本、来源、构建、签名与验收合同 |
| \`desktop/src/shared/\` | 插件所需的桌面共享接口 |
| \`deepseek-harness/\` | 固定 DSH 接口与构建依赖（Git 子模块） |

当前源码以以上 canonical 路径为准，不从旧 \`packages/\`、\`store/\` 布局读取。顶层 \`catalogs/\`、\`skills/\`、\`mcp/\` 保留既有历史发布/导出快照，包括独立发布收据；它们不代表当前源码或 ${version} 的线上状态。source-only 导出不会刷新或删除这些历史目录。

Electron 桌面壳与其打包实现位于 [ZeroWall Science 主仓库](https://github.com/ccfwwm/zerowallscience)；本源码仓库不打包 Electron。桌面交付壳与已验证的 DSH 离线运行时闭包，插件/Skills/MCP/Python 资源仍独立版本化。

## 独立包与上游来源

每个包的名称、semver、能力、权限和兼容范围以对应 \`package.json\`、\`zerowall.plugin.json\` 为准。组合 bundle 只声明组合关系，不静态聚合全部领域插件。上游来源及 commit 固定在 \`config/integrations/upstream-sources.json\`，DSH 合同位于 \`config/deepseek-harness/upstream.json\`。\`resourceVersion\` 表示 ZeroWall 适配后的独立资源版本，可能不同于上游版本；保留各自许可证、NOTICE 和本地适配说明。

| 集成/包 | 资源或上游版本 | 仓库 | 固定 commit |
| --- | --- | --- | --- |
${upstreamRows}

完整来源（含嵌套集成、adapter commit 与本地适配说明）以机器可读配置为准。

## 开发、构建与复用

使用根 \`package.json\` 声明的 Node/pnpm 版本，并准备固定 DSH 子模块与其 generator。可先运行 \`pnpm source:verify\`，再按目标运行类型检查和测试。定向命令示例：

\`\`\`powershell
pnpm plugin:build images
pnpm plugin:pack images
pnpm package:build dsh-archive-manager
pnpm plugins:typecheck
pnpm plugins:test
\`\`\`

构建图按源码、依赖与工具合同判断变化，复用已验证且未变化的组件输出。插件归档保存在独立共享存储与快照中；桌面打包消费成功收据绑定的插件快照，校验大小与 SHA-256，不因桌面版本变化重建或重新归档全部插件。不要复用同一已发布 ID/版本承载不同字节，也不要绕过不可变归档与签名检查。正式生成物只写入 \`artifacts/\`，不提交 \`lib/\`、依赖环境、凭据、密钥、用户数据或本地状态。

## 运行与资源更新

安装、单独更新和回滚见 [扩展更新指南](docs/extensions-update-guide.md)。插件、Skills、MCP 的启动及日常 catalog 检查只读，安装或变更由用户明确触发，并保留禁用、移除、固定版本和自定义配置。

${version} 桌面在可用后后台安装/同步签名 Python core 与 science 依赖，逐包核对版本、哈希与导入结果；自动任务可恢复，失败还原同一路径中的文件。capability 可选依赖仍由用户手动选择。Python 始终使用真实安装目录下的固定根或用户明确选择的固定根，不激活旧 slots，也不迁移/删除旧环境。后台安装不阻塞界面。

## 验证与发布边界

\`source-provenance.json\` 记录 applicationVersion、sourceCommit、dshCommit 与导出模式；本次源提交为 \`${sourceCommit}\`，DSH 为 \`${dshCommit}\`。工作区未提交的允许源码也会导出，因此 sourceCommit 本身不构成完整字节收据。

当 \`sourceOnly: true\` 时，\`pnpm source:verify\` 仅检查插件源码路径/链接与必要源码文件，不验证历史 catalog 的签名、线上资源版本、构建包或发布状态。完整导出模式会核对其资源快照的签名和版本，但仍不能代替类型检查、插件测试、真实安装/运行与公网下载验证。发布另需明确授权和独立收据。
`
}
