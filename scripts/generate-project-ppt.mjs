// ZeroWall Science 项目汇报 PPT 生成脚本
// 基于 workspace 真实勘察（README / BUILD.md / docs/architecture.zh-CN.md / package.json /
// pnpm-workspace.yaml / git log / plugins 清单）生成 16:9 成品 PPTX。
// 渲染引擎：项目内置 pptxgenjs 4.0.1（.build/runtime/node_modules/pptxgenjs）
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync, mkdirSync, statSync } from 'node:fs'

const require = createRequire(import.meta.url)
const PptxGenJS = require(resolve(dirname(fileURLToPath(import.meta.url)), '../.build/runtime/node_modules/pptxgenjs'))

// ---------- 主题 ----------
const C = {
  navy: '0F2A4A',
  blue: '1B4F8A',
  teal: '14B8A6',
  light: 'F2F6FB',
  ink: '1F2937',
  gray: '64748B',
  white: 'FFFFFF',
  line: 'D7E0EC',
  amber: 'F59E0B',
}
const FONT = 'Microsoft YaHei'

const pptx = new PptxGenJS()
const ShapeType = pptx.ShapeType
pptx.layout = 'LAYOUT_16x9' // 13.333 x 7.5 in
pptx.author = 'ZeroWall Science'
pptx.title = 'ZeroWall Science 科研工作台项目汇报'
pptx.subject = '项目汇报 v4.3.5'

const W = 13.333
const H = 7.5

// ---------- 通用辅助 ----------
let pageNo = 0
function header(slide, kicker, title) {
  slide.addText(kicker, { x: 0.55, y: 0.32, w: 9, h: 0.3, fontSize: 11, fontFace: FONT, color: C.teal, bold: true, charSpacing: 2 })
  slide.addText(title, { x: 0.55, y: 0.6, w: 11.5, h: 0.55, fontSize: 24, fontFace: FONT, color: C.navy, bold: true })
  slide.addShape(ShapeType.rect, { x: 0.58, y: 1.18, w: 1.4, h: 0.045, fill: { color: C.teal } })
}
function footer(slide) {
  pageNo += 1
  slide.addText('ZeroWall Science · 项目汇报', { x: 0.55, y: 7.05, w: 4, h: 0.3, fontSize: 9, fontFace: FONT, color: C.gray })
  slide.addText(String(pageNo).padStart(2, '0'), { x: 12.45, y: 7.05, w: 0.45, h: 0.3, fontSize: 9, fontFace: FONT, color: C.gray, align: 'right' })
}
function bullets(slide, items, x, y, w, h, opts = {}) {
  const fontSize = opts.fontSize ?? 13
  slide.addText(
    items.map((it) => (typeof it === 'string' ? { text: it, options: { bullet: { code: '2022', indent: 12 }, breakLine: true, paraSpaceAfter: 7, color: C.ink, fontSize, fontFace: FONT } } : it)),
    { x, y, w, h, valign: 'top', lineSpacingMultiple: 1.12 }
  )
}
function card(slide, x, y, w, h, title, body, accent = C.teal) {
  slide.addShape(ShapeType.roundRect, { x, y, w, h, rectRadius: 0.06, fill: { color: C.white }, line: { color: C.line, width: 1 } })
  slide.addShape(ShapeType.rect, { x, y, w: 0.07, h, fill: { color: accent } })
  slide.addText(title, { x: x + 0.22, y: y + 0.14, w: w - 0.36, h: 0.4, fontSize: 13.5, fontFace: FONT, color: C.navy, bold: true })
  slide.addText(body, { x: x + 0.22, y: y + 0.55, w: w - 0.36, h: h - 0.68, fontSize: 11, fontFace: FONT, color: C.ink, valign: 'top', lineSpacingMultiple: 1.15 })
}

// ============ 1. 封面 ============
{
  const s = pptx.addSlide()
  s.background = { color: C.navy }
  s.addShape(ShapeType.rect, { x: 0, y: 0, w: W, h: 0.12, fill: { color: C.teal } })
  s.addText('PROJECT REPORT · v4.3.5', { x: 0.9, y: 1.5, w: 6, h: 0.35, fontSize: 12, fontFace: FONT, color: C.teal, bold: true, charSpacing: 3 })
  s.addText('ZeroWall Science', { x: 0.9, y: 1.95, w: 11.5, h: 0.9, fontSize: 44, fontFace: FONT, color: C.white, bold: true })
  s.addText('科研工作台项目汇报', { x: 0.9, y: 2.85, w: 11.5, h: 0.8, fontSize: 30, fontFace: FONT, color: C.white })
  s.addShape(ShapeType.rect, { x: 0.95, y: 3.9, w: 2.2, h: 0.05, fill: { color: C.teal } })
  s.addText('本地优先 · 模型无关 · 一体化 Agent 科研工作空间', { x: 0.9, y: 4.15, w: 11.5, h: 0.5, fontSize: 16, fontFace: FONT, color: 'A9C4E4' })
  const stats = [
    ['v4.3.5', '当前版本'],
    ['383', '累计提交'],
    ['23', '首方插件'],
  ]
  let sx = 0.9
  for (const [num, label] of stats) {
    s.addText(num, { x: sx, y: 5.15, w: 2.4, h: 0.55, fontSize: 26, fontFace: FONT, color: C.teal, bold: true })
    s.addText(label, { x: sx, y: 5.72, w: 2.4, h: 0.35, fontSize: 11, fontFace: FONT, color: 'A9C4E4' })
    sx += 3.0
  }
  s.addText('github.com/ccfwwm/zerowallscience · 2026', { x: 0.9, y: 6.7, w: 8, h: 0.35, fontSize: 11, fontFace: FONT, color: '7E9CC2' })
  pageNo = 0
}

// ============ 2. 目录 ============
{
  const s = pptx.addSlide()
  s.background = { color: C.white }
  header(s, 'CONTENTS', '汇报框架')
  const items = [
    ['01', '项目概述', '定位与核心能力'],
    ['02', '系统架构', 'Electron · DSH Host · Renderer'],
    ['03', '领域服务', '七大科研服务域'],
    ['04', '安全设计', '回环边界与凭据保险库'],
    ['05', '插件体系', '23 个首方插件'],
    ['06', '工程质量', '固定基线 · 四重验证 · 双通道'],
    ['07', '版本亮点', '4.3.5 新能力与里程碑'],
    ['08', '总结与展望', '成果与后续方向'],
  ]
  items.forEach(([no, t, d], i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = 0.7 + col * 6.1
    const y = 1.55 + row * 1.28
    s.addText(no, { x, y, w: 0.85, h: 0.6, fontSize: 22, fontFace: FONT, color: C.teal, bold: true })
    s.addText(t, { x: x + 0.95, y, w: 4.6, h: 0.42, fontSize: 16, fontFace: FONT, color: C.navy, bold: true })
    s.addText(d, { x: x + 0.95, y: y + 0.4, w: 4.6, h: 0.35, fontSize: 11, fontFace: FONT, color: C.gray })
  })
  footer(s)
}

// ============ 3. 项目概述 ============
{
  const s = pptx.addSlide()
  s.background = { color: C.white }
  header(s, 'OVERVIEW', '项目概述：本地优先的科研工作台')
  card(s, 0.55, 1.45, 6.0, 2.2, '定位', '基于 Electron + React + TypeScript + 固定 DSH Host 构建的本地优先、模型无关科研工作台。通过明确的本地安全边界管理项目、科研记录与凭据，为科研执行、成果发表与演示文稿提供一体化 Agent 工作空间。', C.blue)
  card(s, 6.75, 1.45, 6.0, 2.2, '核心能力', 'DSH Agent / 会话 / 工具 / Skills / MCP / 子 Agent / 审批；持久化 Project、ExecutionContext、DataAsset、Run、Artifact、Paper、Decision 科研记录；Local / WSL / SSH 多执行环境与跨重启 Run Manager。', C.teal)
  bullets(s, [
    '科学文件预览、发表证据、研究图谱、可恢复演示文稿工作流',
    '本地优先存储：科研 SQLite 数据库与 OS 凭据保险库相互独立',
    'Electron Renderer 沙箱 + context isolation，仅访问回环地址 Host',
    'DSH 为唯一 Agent/会话/工具/Skills/MCP/审批/React UI 内核',
  ], 0.55, 3.9, 12.2, 1.7, { fontSize: 12.5 })
  const stats = [
    ['4.1.3 → 4.3.5', '连续发布迭代'],
    ['383', '仓库提交（单作者）'],
    ['23', '首方 Host/Client 插件'],
    ['3.x', '全新独立数据根'],
  ]
  stats.forEach(([num, label], i) => {
    const x = 0.55 + i * 3.12
    s.addShape(ShapeType.roundRect, { x, y: 5.85, w: 2.85, h: 0.95, rectRadius: 0.08, fill: { color: C.light }, line: { color: C.line, width: 1 } })
    s.addText(num, { x, y: 5.98, w: 2.85, h: 0.42, fontSize: 17, fontFace: FONT, color: C.blue, bold: true, align: 'center' })
    s.addText(label, { x, y: 6.38, w: 2.85, h: 0.3, fontSize: 10.5, fontFace: FONT, color: C.gray, align: 'center' })
  })
  footer(s)
}

// ============ 4. 系统架构 ============
{
  const s = pptx.addSlide()
  s.background = { color: C.white }
  header(s, 'ARCHITECTURE', '系统架构：三层结构')
  const layers = [
    { title: 'Electron Main', body: '窗口 · 更新 · 日志 · 目录选择\nsafeStorage 凭据保险库\n私有子进程 IPC（凭据解析）', color: C.blue },
    { title: 'DSH Host · 127.0.0.1 随机端口', body: 'Agent / Session / Tools / Skills\nMCP / 审批 / 子 Agent\nZeroWall Host 插件 + Typert codecs\nzerowall-research.sqlite', color: C.navy },
    { title: 'React Renderer', body: 'DSH 对话壳 + 账户/科研工作台\n无 Node integration\n无 secret API · 无 iframe', color: C.teal },
  ]
  const bw = 3.7
  let bx = 0.55
  layers.forEach((ly, i) => {
    s.addShape(ShapeType.roundRect, { x: bx, y: 1.55, w: bw, h: 3.1, rectRadius: 0.09, fill: { color: ly.color } })
    s.addText(ly.title, { x: bx + 0.2, y: 1.75, w: bw - 0.4, h: 0.55, fontSize: 14.5, fontFace: FONT, color: C.white, bold: true })
    s.addShape(ShapeType.rect, { x: bx + 0.22, y: 2.35, w: 0.8, h: 0.035, fill: { color: i === 1 ? C.teal : C.white } })
    s.addText(ly.body, { x: bx + 0.2, y: 2.5, w: bw - 0.4, h: 2.0, fontSize: 11, fontFace: FONT, color: 'E8F0FA', lineSpacingMultiple: 1.25 })
    if (i < 2) {
      s.addText('▶', { x: bx + bw + 0.06, y: 2.95, w: 0.6, h: 0.4, fontSize: 16, fontFace: FONT, color: C.amber, bold: true, align: 'center' })
    }
    bx += bw + 0.66
  })
  const notes = [
    ['会话持久化', 'DSH 会话持久化 + zerowall-research.sqlite 双库分离'],
    ['凭据链路', '凭据仅在 Electron 内解密，经私有 IPC 解析后注入 Host'],
    ['模型路由', 'AI Cloud 托管路由 + 用户可编辑模型设置并存，可用性检查兜底'],
  ]
  notes.forEach(([t, d], i) => {
    const x = 0.55 + i * 4.16
    s.addShape(ShapeType.roundRect, { x, y: 5.0, w: 3.9, h: 1.25, rectRadius: 0.08, fill: { color: C.light }, line: { color: C.line, width: 1 } })
    s.addText(t, { x: x + 0.18, y: 5.12, w: 3.55, h: 0.35, fontSize: 12, fontFace: FONT, color: C.navy, bold: true })
    s.addText(d, { x: x + 0.18, y: 5.47, w: 3.55, h: 0.7, fontSize: 10.5, fontFace: FONT, color: C.ink, lineSpacingMultiple: 1.1 })
  })
  footer(s)
}

// ============ 5. 领域服务 ============
{
  const s = pptx.addSlide()
  s.background = { color: C.white }
  header(s, 'DOMAIN SERVICES', '七大领域服务域')
  const services = [
    ['zerowall.account', '账户生命周期、余额、订单、充值、托管模型'],
    ['zerowall.projects', '科研项目与 3.x 导入导出'],
    ['zerowall.execution', 'Local / WSL / SSH 执行上下文与探测'],
    ['zerowall.runs', '持久化运行生命周期、日志、取消、断点恢复'],
    ['zerowall.research', '资产、产物、论文、决策、图谱、预览'],
    ['zerowall.publication', '发表冻结、验证、复现元数据、导出状态'],
    ['zerowall.presentation', '大纲、视觉规划、持久化生成与导出状态'],
  ]
  const colW = 6.0
  const rowH = 1.18
  services.forEach(([name, desc], i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = 0.55 + col * (colW + 0.2)
    const y = 1.45 + row * (rowH + 0.16)
    s.addShape(ShapeType.roundRect, { x, y, w: colW, h: rowH - 0.1, rectRadius: 0.07, fill: { color: i % 2 === 0 ? C.light : C.white }, line: { color: C.line, width: 1 } })
    s.addText(name, { x: x + 0.22, y: y + 0.13, w: colW - 0.4, h: 0.35, fontSize: 13, fontFace: FONT, color: C.blue, bold: true })
    s.addText(desc, { x: x + 0.22, y: y + 0.5, w: colW - 0.4, h: 0.45, fontSize: 10.5, fontFace: FONT, color: C.ink })
  })
  s.addShape(ShapeType.roundRect, { x: 0.55, y: 5.35, w: 12.23, h: 1.0, rectRadius: 0.07, fill: { color: C.navy } })
  s.addText('科研记录与 DSH 会话持久化相互独立；凭据经 Electron safeStorage 保存，不进入 Renderer 状态、SQLite、日志或导出文件。', { x: 0.8, y: 5.55, w: 11.7, h: 0.6, fontSize: 12.5, fontFace: FONT, color: C.white, valign: 'middle' })
  footer(s)
}

// ============ 6. 安全设计 ============
{
  const s = pptx.addSlide()
  s.background = { color: C.navy }
  s.addText('SECURITY', { x: 0.55, y: 0.32, w: 9, h: 0.3, fontSize: 11, fontFace: FONT, color: C.teal, bold: true, charSpacing: 2 })
  s.addText('安全设计：纵深防御的本地边界', { x: 0.55, y: 0.6, w: 11.5, h: 0.55, fontSize: 24, fontFace: FONT, color: C.white, bold: true })
  s.addShape(ShapeType.rect, { x: 0.58, y: 1.18, w: 1.4, h: 0.045, fill: { color: C.teal } })
  const sec = [
    ['01', '回环边界', 'Host 仅监听 127.0.0.1 随机端口；Renderer 请求 codec 校验 + 脱敏 DTO'],
    ['02', '凭据保险库', '登录凭据仅存 Electron safeStorage 保险库，不与 SQLite / 日志 / 导出文件同库'],
    ['03', '私有 IPC', '凭据只在 Electron 内解密，经私有子进程 IPC 通道解析，不进入 Renderer'],
    ['04', '沙箱渲染器', 'sandbox + context isolation + 无 Node integration；外链一律交系统浏览器'],
    ['05', '独立数据根', '3.0 全新数据根，不读取、不迁移、不触碰 2.x SQLite / 会话 / 凭据'],
  ]
  sec.forEach(([no, t, d], i) => {
    const y = 1.55 + i * 1.02
    s.addText(no, { x: 0.6, y: y + 0.05, w: 0.7, h: 0.4, fontSize: 16, fontFace: FONT, color: C.teal, bold: true })
    s.addText(t, { x: 1.45, y, w: 3.1, h: 0.4, fontSize: 14, fontFace: FONT, color: C.white, bold: true })
    s.addText(d, { x: 4.7, y: y + 0.02, w: 8.1, h: 0.85, fontSize: 11.5, fontFace: FONT, color: 'C9DAF0', valign: 'top', lineSpacingMultiple: 1.12 })
    if (i < 4) s.addShape(ShapeType.rect, { x: 0.6, y: y + 0.94, w: 12.1, h: 0.012, fill: { color: '27466F' } })
  })
  footer(s)
}

// ============ 7. 插件体系 ============
{
  const s = pptx.addSlide()
  s.background = { color: C.white }
  header(s, 'PLUGINS', '插件体系：23 个首方 Host/Client 插件')
  const groups = [
    ['核心平台', ['account 账户/托管模型', 'base 基础', 'secrets 凭据', 'mcp 管理', 'skills 技能', 'web-search 检索']],
    ['科研能力', ['research 科研记录', 'projects 项目', 'publications 发表', 'reviewer 审阅', 'image-dup 图片查重', 'presentations 演示文稿']],
    ['执行与运行', ['environment 环境', 'execution 执行', 'runs 运行管理', 'python 运行时', 'desktop-compat 桌面兼容']],
    ['文件与集成', ['files 文件', 'images 图片', 'ai-cloud AI 云', 'opencode 编码', 'wechat 微信', 'presentations-runtime 运行时']],
  ]
  const colW = 6.0
  groups.forEach(([gname, plugs], gi) => {
    const col = gi % 2
    const row = Math.floor(gi / 2)
    const x = 0.55 + col * (colW + 0.23)
    const y = 1.5 + row * 2.62
    s.addShape(ShapeType.roundRect, { x, y, w: colW, h: 2.42, rectRadius: 0.08, fill: { color: C.light }, line: { color: C.line, width: 1 } })
    s.addText(gname, { x: x + 0.2, y: y + 0.14, w: colW - 0.4, h: 0.4, fontSize: 13.5, fontFace: FONT, color: C.blue, bold: true })
    s.addShape(ShapeType.rect, { x: x + 0.22, y: y + 0.55, w: 0.7, h: 0.03, fill: { color: C.teal } })
    s.addText(plugs.map(p => ({ text: p, options: { bullet: { code: '2022', indent: 10 }, breakLine: true, paraSpaceAfter: 3, fontSize: 10.5, fontFace: FONT, color: C.ink } })), { x: x + 0.2, y: y + 0.68, w: colW - 0.42, h: 1.6, valign: 'top' })
  })
  s.addText('插件通过 Typert 生成 codecs 与 DSH Host 契约连接；演示文稿工作台插件即本次汇报所依托的生成管线。', { x: 0.55, y: 6.62, w: 12.2, h: 0.35, fontSize: 10.5, fontFace: FONT, color: C.gray, italic: true })
  footer(s)
}

// ============ 8. 工程质量 ============
{
  const s = pptx.addSlide()
  s.background = { color: C.white }
  header(s, 'ENGINEERING', '工程质量：固定基线 · 四重验证 · 双通道')
  s.addText('固定基线', { x: 0.55, y: 1.42, w: 3, h: 0.35, fontSize: 13, fontFace: FONT, color: C.blue, bold: true })
  const base = [
    ['Node.js', '24.9.0'], ['pnpm', '11.7.0'], ['Electron', '43.4.0'], ['DSH', '0.1.1-rc.2'],
  ]
  base.forEach(([k, v], i) => {
    const x = 0.55 + i * 3.12
    s.addShape(ShapeType.roundRect, { x, y: 1.82, w: 2.85, h: 0.78, rectRadius: 0.07, fill: { color: C.light }, line: { color: C.line, width: 1 } })
    s.addText(k, { x, y: 1.92, w: 2.85, h: 0.3, fontSize: 10, fontFace: FONT, color: C.gray, align: 'center' })
    s.addText(v, { x, y: 2.2, w: 2.85, h: 0.34, fontSize: 13.5, fontFace: FONT, color: C.navy, bold: true, align: 'center' })
  })
  s.addText('DSH 以 Git 子模块直接改源码（无补丁），pnpm dsh:verify 强校验提交与锁文件一致', { x: 0.55, y: 2.72, w: 12.2, h: 0.32, fontSize: 10.5, fontFace: FONT, color: C.gray })

  s.addText('四重验证链', { x: 0.55, y: 3.2, w: 3, h: 0.35, fontSize: 13, fontFace: FONT, color: C.blue, bold: true })
  const steps = [
    ['typecheck', '契约检查：DSH 校验 + 插件/桌面类型 + 科研库 bundle'],
    ['test', '单元测试：契约、安全、科研库迁移、插件、桌面'],
    ['build + package:dir', '真实 Host 启动、运行时闭包、Skills、回环 HTTP 检查'],
    ['test:dsh:rc2', 'Agent 组合端到端：会话/审批/MCP/子 Agent'],
  ]
  steps.forEach(([t, d], i) => {
    const x = 0.55 + i * 3.12
    s.addShape(ShapeType.roundRect, { x, y: 3.6, w: 2.85, h: 1.5, rectRadius: 0.08, fill: { color: C.white }, line: { color: i === 3 ? C.teal : C.line, width: i === 3 ? 1.5 : 1 } })
    s.addText(String(i + 1), { x: x + 0.16, y: 3.72, w: 0.5, h: 0.34, fontSize: 13, fontFace: FONT, color: C.teal, bold: true })
    s.addText(t, { x: x + 0.16, y: 4.08, w: 2.55, h: 0.5, fontSize: 11, fontFace: FONT, color: C.navy, bold: true })
    s.addText(d, { x: x + 0.16, y: 4.58, w: 2.55, h: 0.45, fontSize: 9, fontFace: FONT, color: C.gray, lineSpacingMultiple: 1.05 })
  })

  s.addText('发布与合规', { x: 0.55, y: 5.35, w: 3, h: 0.35, fontSize: 13, fontFace: FONT, color: C.blue, bold: true })
  bullets(s, [
    'Preview / Stable 双更新通道，独立更新元数据，发布前核对 SHA-256、签名与安装 smoke',
    'macOS 签名/公证仅在匹配架构 runner 执行；无凭据只允许未签名 smoke，不宣称完成',
    '包内无 Rust 二进制 / Tauri command / Leptos WASM UI / 2.x 数据初始化路径',
  ], 0.55, 5.75, 12.2, 1.15, { fontSize: 11 })
  footer(s)
}

// ============ 9. 版本亮点与里程碑 ============
{
  const s = pptx.addSlide()
  s.background = { color: C.white }
  header(s, 'HIGHLIGHTS', '版本亮点与迭代里程碑')
  card(s, 0.55, 1.45, 6.0, 2.35, 'v4.3.5 亮点', '科研图片查重工作台与演示文稿工作台成为右侧边栏页签；演示文稿支持「选择科研项目 / 当前工作区自动关联」双创建路径；新增 zerowall-ppt 默认 Skill 路由 PPT 请求；重建 Windows Stable 包并纳入查重与演示文稿插件。', C.teal)
  card(s, 6.75, 1.45, 6.0, 2.35, '核心里程碑', '4.1.x：基础与科学 MCP Skills、web search、权限稳定；4.2.x：动态 DeepSeek 检索、本地子 Agent、托管 MCP 修复；4.3.x：图片查重 + 演示文稿工作流、质量门禁、产物持久化。', C.blue)
  s.addText('发布节奏', { x: 0.55, y: 4.05, w: 3, h: 0.35, fontSize: 13, fontFace: FONT, color: C.blue, bold: true })
  const mile = [
    ['4.1.3', '基础架构'], ['4.1.8', '科学 MCP + web search'], ['4.2.1', '动态检索 + 子 Agent'], ['4.3.0', '查重 + 演示文稿'], ['4.3.5', '当前版本'],
  ]
  let mx = 0.55
  mile.forEach(([v, d], i) => {
    const w = 2.35
    s.addText('●', { x: mx + w / 2 - 0.09, y: 4.62, w: 0.18, h: 0.18, fontSize: 12, fontFace: FONT, color: i === mile.length - 1 ? C.amber : C.teal, align: 'center' })
    s.addText(v, { x: mx, y: 4.85, w, h: 0.34, fontSize: 12.5, fontFace: FONT, color: C.navy, bold: true, align: 'center' })
    s.addText(d, { x: mx, y: 5.18, w, h: 0.5, fontSize: 9.5, fontFace: FONT, color: C.gray, align: 'center' })
    if (i < mile.length - 1) s.addShape(ShapeType.rect, { x: mx + w / 2, y: 4.68, w: w, h: 0.028, fill: { color: C.line } })
    mx += w + 0.06
  })
  bullets(s, [
    '演示文稿工作台保留双创建路径：选择已有科研项目 + 手动标题，或当前工作区自动关联',
    '科研图片查重与演示文稿产物持久化到 research SQLite，跨重启可恢复',
  ], 0.55, 5.85, 12.2, 1.0, { fontSize: 11.5 })
  footer(s)
}

// ============ 10. 总结与展望 ============
{
  const s = pptx.addSlide()
  s.background = { color: C.navy }
  s.addText('SUMMARY', { x: 0.55, y: 0.32, w: 9, h: 0.3, fontSize: 11, fontFace: FONT, color: C.teal, bold: true, charSpacing: 2 })
  s.addText('总结与展望', { x: 0.55, y: 0.6, w: 11.5, h: 0.55, fontSize: 24, fontFace: FONT, color: C.white, bold: true })
  s.addShape(ShapeType.rect, { x: 0.58, y: 1.18, w: 1.4, h: 0.045, fill: { color: C.teal } })
  s.addText('ZeroWall Science 以「本地优先、模型无关」为基石，将 Agent 科研执行、持久化记录、发表验证与演示文稿产出收敛为一个可审计、可复现、安全边界清晰的一体化工作台。', { x: 0.7, y: 1.55, w: 11.9, h: 0.95, fontSize: 15, fontFace: FONT, color: 'D8E6F7', lineSpacingMultiple: 1.25 })
  const fut = [
    ['执行生态', '深化 Local / WSL / SSH 执行上下文，增强跨重启 Run 恢复与远程计算'],
    ['证据闭环', '完善研究图谱、发表证据与复现元数据，支撑可审计科研产出'],
    ['创作工作流', '迭代演示文稿 / 图片查重 / 审阅工作台，降低科研表达与质检成本'],
  ]
  fut.forEach(([t, d], i) => {
    const x = 0.7 + i * 4.1
    s.addShape(ShapeType.roundRect, { x, y: 2.85, w: 3.85, h: 2.2, rectRadius: 0.09, fill: { color: '16395F' }, line: { color: '27466F', width: 1 } })
    s.addText(String(i + 1).padStart(2, '0'), { x: x + 0.2, y: 3.05, w: 1, h: 0.4, fontSize: 20, fontFace: FONT, color: C.teal, bold: true })
    s.addText(t, { x: x + 0.2, y: 3.5, w: 3.45, h: 0.4, fontSize: 14, fontFace: FONT, color: C.white, bold: true })
    s.addText(d, { x: x + 0.2, y: 3.95, w: 3.45, h: 1.0, fontSize: 10.5, fontFace: FONT, color: 'B9CFE9', lineSpacingMultiple: 1.2 })
  })
  s.addText('谢谢 · 欢迎交流', { x: 0.7, y: 5.6, w: 11.9, h: 0.6, fontSize: 20, fontFace: FONT, color: C.white, bold: true, align: 'center' })
  s.addText('zerowallscience.org · github.com/ccfwwm/zerowallscience', { x: 0.7, y: 6.3, w: 11.9, h: 0.4, fontSize: 11, fontFace: FONT, color: '7E9CC2', align: 'center' })
  footer(s)
}

// ---------- 输出 ----------
const outPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'ZeroWall-Science-项目汇报-v4.3.5.pptx')
pptx.writeFile({ fileName: outPath }).then(() => {
  const size = statSync(outPath).size
  console.log(`OK: ${outPath}`)
  console.log(`Slides: ${pptx.slides.length}`)
  console.log(`Size: ${(size / 1024).toFixed(1)} KB`)
}).catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})