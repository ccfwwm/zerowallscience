/** Public product identity and localized About content; excludes account and filesystem diagnostics. */
export const PRODUCT_LINKS = {
  website: 'https://zerowallscience.org/', docs: 'https://zerowallscience.org/docs/',
  github: 'https://github.com/ccfwwm/zerowallscience', releases: 'https://github.com/ccfwwm/zerowallscience/releases',
  issues: 'https://github.com/ccfwwm/zerowallscience/issues',
} as const

const en = {
  description: 'An extensible research workspace for models, literature, scientific tools and reproducible work.\n\nConnect cloud models, use native Gemini, organize conversations, and connect Skills and MCP tools to your workflow.',
  versions: 'Desktop {product} · DSH core {core}\nChannel: {channel}\nElectron {electron} · Node {node}',
  attribution: 'Built on DeepSeek Harness and Cordis. Core components retain their upstream licenses. ZeroWall plugins carry their own licenses. See the repository for source and notices.',
  website: 'Official website', docs: 'Documentation', github: 'GitHub source', releases: 'Release notes', issues: 'Report an issue', copy: 'Copy version information',
  migration: 'Imported {files} files · {conflicts} conflicts retained · {credentials} encrypted credentials · {failures} credentials need a new sign-in',
  migrationPartial: 'Migration partly completed. You can use the workspace.',
  migrationComplete: 'Your data has been imported',
  migrationRetry: '{failures} import operations could not finish. Source data is retained. Unfinished items retry on the next launch. You can sign in again if credentials could not be recovered.',
  migrationReport: 'Open migration records',
}
const zh = {
  description: '面向科研工作的可扩展智能工作空间，连接模型、文献、科学工具与可复现的工作流程。\n\n支持云端模型与原生 Gemini、多会话管理，以及按需连接的 Skills 和 MCP 工具。',
  versions: '桌面版本 {product} · DSH 核心 {core}\n更新通道：{channel}\nElectron {electron} · Node {node}',
  attribution: '基于 DeepSeek Harness 与 Cordis 构建。核心组件保留上游许可证，ZeroWall 插件使用各自许可证。源代码及许可说明见 GitHub 仓库。',
  website: '官方网站', docs: '使用文档', github: 'GitHub 源代码', releases: '更新说明', issues: '反馈问题', copy: '复制版本信息',
  migration: '已导入 {files} 个文件 · 保留 {conflicts} 项冲突 · {credentials} 项凭据已加密迁移 · {failures} 项凭据需重新登录',
  migrationPartial: '部分数据已迁移，可以继续使用工作台',
  migrationComplete: '数据迁移完成',
  migrationRetry: '有 {failures} 项迁移操作未完成。旧数据已保留，未完成项将在下次启动重试。凭据无法恢复时可以重新登录。',
  migrationReport: '打开迁移记录',
}
/** @param locale - Active shell locale. @returns Complete About labels. */
export function aboutCopy(locale: string): typeof en { return locale.startsWith('zh') ? zh : en }
