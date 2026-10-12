// Real CLI smoke through DSH ToolRuntime and the pinned Univer tool definitions.
// Run check first, view the returned PNGs, save actual observations in reviews.json,
// then run export. This runner never invents reviews or bypasses export policy.
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { installPresentationWorkflow } from '../../plugins/images/src/host/presentation-workflow.ts'
import { verificationRoot } from '../build/paths.mjs'
const req = createRequire(resolve('plugins/images/package.json'))
const load = async (id: string) => import(pathToFileURL(req.resolve(id)).href)
const { Context } = await load('@deepseek-ai/cordis')
const { default: ToolRuntime, defineTool } = await load('@deepseek-ai/dsh-tools')
const { default: SystemPrompt } = await load('@deepseek-ai/dsh-system-prompt')
const univer = await import(pathToFileURL(createRequire(resolve('desktop/package.json')).resolve('dsh-univer-office')).href)
const root = resolve(process.argv[3] ?? resolve(verificationRoot, 'presentation-tool-smoke'))
const action = process.argv[2] ?? 'check'
if (!['check', 'export'].includes(action)) throw new Error('Usage: pnpm exec tsx tools/verification/presentation-tool-smoke.mts check|export [verification-directory]')
await mkdir(root, { recursive: true })
const ctx = new Context(), events: any[] = [], signal = AbortSignal.timeout(300000)
const agent = { session: { id: 'presentation-cli-smoke', header: { cwd: root }, snapshotEvents: () => events, append: (type: string, data: unknown) => events.push({ type, data: structuredClone(data) }) } }
let streamHook: any
async function call(name: string, args: any = {}) {
  const result = await ctx.tools.execute({ callId: randomUUID(), name, arguments: args, agent, signal })
  if (result.isError) throw new Error(`${name}: ${result.error.message}`)
  return typeof result.value === 'string' ? JSON.parse(result.value.startsWith('{') || result.value.startsWith('[') ? result.value : JSON.stringify(result.value)) : result.value
}
try {
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(univer, { telemetry: false, tools: true, skills: false, gatewayPort: 19091, gatewayStartupTimeoutMs: 60000, browserExecutablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
  const on = ctx.on.bind(ctx)
  installPresentationWorkflow(new Proxy(ctx, { get(target, key) {
    if (key === 'llm') return { resolveModelInfo: async () => ({ inputModalities: ['text', 'image'] }) }
    if (key === 'on') return (name: string, hook: any) => { if (name === 'llm/stream') streamHook = hook; return on(name, hook) }
    return Reflect.get(target, key)
  } }) as any)
  for await (const _ of streamHook({ sessionId: agent.session.id, provider: 'current-chat', model: 'selected' }, async function* () {})) { /* capability only; observations are supplied after viewing PNGs */ }
  // Headless CLI uses workspace PNGs instead of the desktop attachment service.
  // Its body still goes through the same closed schema and real dispatcher.
  ctx.tools.register(defineTool({ name: 'univer_screenshot', description: 'CLI smoke: capture actual Univer page PNGs', parameters: { file: { type: 'string', required: true }, unitId: { type: 'string', required: true }, worktreeId: { type: 'string', required: true }, pages: { type: 'array', items: { type: 'integer' } }, output: { type: 'string', required: true }, contactSheet: { type: 'boolean' } }, output: { schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true, const: true }, operation: { type: 'string', required: true, const: 'screenshot' }, file: { type: 'string', required: true }, result: { type: 'json', required: true } } }, render: (_args: any, value: any) => [{ type: 'text', text: JSON.stringify(value) }] }, execute: async (args: any, exec: any) => {
    const captured = await ctx.univer.screenshotUnit({ workspace: root, ...args, outputWorkspace: root, output: resolve(root, args.output), target: { kind: 'paged-unit', pages: args.pages, contactSheet: {} } }, exec.signal)
    for (const image of captured.result.images) delete image.data
    return captured
  } }))
  // The actual upstream lint/export declarations must stay closed.
  for (const name of ['univer_lint', 'univer_export']) if (ctx.tools.get(name)?.output.schema.additionalProperties !== false) throw new Error(`Missing closed upstream ${name} contract`)
  const runPath = resolve(root, 'run.json')
  let report: any
  try { report = JSON.parse(await readFile(runPath, 'utf8')) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    if (action !== 'check') throw new Error('Run check and review actual screenshots before export.')
    await writeFile(resolve(root, 'spec.json'), JSON.stringify({ width: 960, height: 540, fonts: {}, palette: {}, slides: [{ assetIds: [] }, { assetIds: [] }] }, null, 2))
    await writeFile(resolve(root, 'assets.json'), JSON.stringify({ schemaVersion: 2, assets: [] }))
    const file = resolve(root, `PPTX-命令行验证-${Date.now()}.univer`)
    await call('univer_new', { file })
    const draft = await call('univer_worktree', { file, action: 'create', name: 'CLI export validation' })
    const worktreeId = draft.result.worktreeId
    const unit = await call('univer_unit', { file, worktreeId, action: 'create', kind: 'slide', name: 'PPTX export validation' })
    report = { scope: { file, worktreeId, unitId: unit.result.unitId } }
    await writeFile(runPath, JSON.stringify(report, null, 2))
    await call('presentation_prepare', { ...report.scope, spec_path: 'spec.json', manifest_path: 'assets.json', mode: 'new' })
    const pages = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#F4F8FB"/><text x="64" y="115" font-family="Microsoft YaHei" font-size="42" fill="#173F46">PPTX 命令行导出验证</text><text x="64" y="220" font-family="Microsoft YaHei" font-size="26" fill="#287190">逐页审核 → 导出 → 备注与可编辑对象回读</text></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#F4F8FB"/><text x="64" y="115" font-family="Microsoft YaHei" font-size="42" fill="#173F46">审核信息与导出收据</text><text x="64" y="220" font-family="Microsoft YaHei" font-size="26" fill="#287190">检查信息由 ZeroWall 状态接口返回</text><text x="64" y="280" font-family="Microsoft YaHei" font-size="26" fill="#287190">Univer 返回值保持原有接口定义</text></svg>',
    ]
    for (let i = 0; i < pages.length; i++) await writeFile(resolve(root, `page-${i + 1}.svg`), pages[i]!)
    await call('univer_execute', { ...report.scope, code: 'presentation.setPageSize({width:960,height:540}); return presentation.getPageSize();' })
    await call('presentation_compile_pages', { pages: pages.map((_, i) => ({ page: i + 1, source: `page-${i + 1}.svg` })) })
    await call('univer_execute', { ...report.scope, code: "for(const [i,s] of presentation.getSlides().entries()) s.setSpeakerNotes('CLI export validation: speaker notes, page '+(i+1)); return presentation.getSlides().map(s=>s.getSpeakerNotes());" })
  }
  await call('presentation_prepare', { ...report.scope, spec_path: 'spec.json', manifest_path: 'assets.json', mode: 'new' })
  if (action === 'check') {
    report.checks = await call('presentation_check_pages', { pages: [1, 2], output: 'screenshots' })
    const status = await call('presentation_status')
    if (status.blockedPages.length) {
      const blocked = await ctx.tools.execute({ callId: randomUUID(), name: 'univer_export', arguments: { ...report.scope, output: 'must-be-blocked.pptx' }, agent, signal })
      if (!blocked.isError || !blocked.error.message.includes(`pages: ${status.blockedPages.join(', ')}`)) throw new Error('Export gate did not reject unreviewed pages.')
      report.unreviewedExport = blocked.error.message
    }
  } else {
    await call('presentation_record_reviews', { reviews: JSON.parse(await readFile(resolve(root, 'reviews.json'), 'utf8')) })
    report.export = await call('univer_export', { ...report.scope, output: 'PPTX-命令行验证.pptx' })
    report.status = await call('presentation_status')
    if (report.status.blockedPages.length || report.status.state.exportReceipt.notesWritten !== 2) throw new Error('Incomplete export receipt or remaining blockers.')
  }
  report.at = new Date().toISOString()
  await writeFile(runPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ action, root, images: report.checks?.screenshot.result.images.map((item: any) => item.path), findings: report.checks?.presentationFindings, export: report.status?.state.exportReceipt, unreviewedExport: report.unreviewedExport }))
} finally { await ctx.fiber.dispose() }
