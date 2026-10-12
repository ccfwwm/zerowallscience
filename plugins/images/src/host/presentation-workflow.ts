import { randomUUID } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolRunContext, type ToolDispatchExecution } from '@deepseek-ai/dsh-tools'
import { assetsForPage, hash, readManifest, readSpecification, recordAssetReview, recordVisualAssets, saveJson, validatePresentationAssets, withPresentationLock, workspacePath, type AssetInput } from './visual-assets.js'
import { lintImageOcclusion, prepareSvg, type PageSnapshot } from './presentation-layout.js'
import { preservePptxNotes } from './presentation-export.js'
import { chartAxisCode } from './presentation-chart.js'

type Scope = { file: string; unitId: string; worktreeId: string }
type Check = { fingerprint: string; findings: unknown[]; screenshot?: string }
export interface PresentationWorkflow {
  schemaVersion: 2; spec: string; manifest: string; mode: 'new' | 'edit'; scope?: Scope; journal?: string
  changedPages: number[]; pages: Record<string, { fingerprint: string; id: string; checks: Record<string, Check>; review?: { fingerprint: string; observations: string; waivers: string[] } }>
  phase: string; failure?: { stage: string; message: string; at: string }
}
const EVENT = 'zerowall/presentation-workflow'
// Return compact facts, not multi-megabyte image data in the conversation. Two
// independent rolling digests detect page mutations; assets use SHA-256 separately.
export const SNAPSHOT_CODE = `return presentation.getSlides().map((slide,index)=>{const data={...slide.getData(),chartResources:slide.getCharts().map(c=>c.getChartData()),speakerNotes:slide.getSpeakerNotes()}, raw=JSON.stringify(data);let a=2166136261,b=5381;for(let i=0;i<raw.length;i++){a=Math.imul(a^raw.charCodeAt(i),16777619);b=Math.imul(b,33)^raw.charCodeAt(i);} const clean=JSON.parse(raw,(_,v)=>typeof v==='string'&&v.length>2048?'[binary:'+v.length+']':v);return {page:index+1,id:slide.getId(),fingerprint:(a>>>0).toString(16)+':'+(b>>>0).toString(16)+':'+raw.length,data:clean};});`
const output = { schema: { type: 'string' as const }, render: (_args: unknown, value: any) => [{ type: 'text' as const, text: value }] }
const assetParameters = {
  image_path: { type: 'string' as const, required: true }, asset_id: { type: 'string' as const, required: true }, role: { type: 'string' as const, required: true },
  source_kind: { type: 'string' as const, enum: ['generated', 'literature', 'user', 'derived'] as const }, slide_number: { type: 'integer' as const }, slide_numbers: { type: 'array' as const, items: { type: 'integer' as const } },
  source_path: { type: 'string' as const }, source_page: { type: 'integer' as const }, source_figure: { type: 'string' as const }, citation: { type: 'string' as const }, source_url: { type: 'string' as const }, parent_asset_id: { type: 'string' as const },
  style_reference_ids: { type: 'array' as const, items: { type: 'string' as const } }, source_seed_path: { type: 'string' as const },
} as const
function assetInput(manifest: string, args: any): AssetInput { return { manifest, image: args.image_path, assetId: args.asset_id, role: args.role, sourceKind: args.source_kind, slideNumber: args.slide_number, slideNumbers: args.slide_numbers, styleReferenceIds: args.style_reference_ids, sourceSeedPath: args.source_seed_path, parentAssetId: args.parent_asset_id, ...(args.source_path || args.citation ? { source: { path: args.source_path, page: args.source_page, figure: args.source_figure, citation: args.citation, url: args.source_url } } : {}) } }
function payload(value: any): any { return value?.result ?? value }
function pageNumber(value: any, snapshots: PageSnapshot[]): number | undefined {
  if (value && typeof value === 'object' && (value.id || value.pageId)) return snapshots.find(page => page.id === (value.id ?? value.pageId))?.page
  const selector = value?.index ?? value?.page ?? value?.pageNumber ?? value
  if (typeof selector === 'number') return selector
  return snapshots.find(page => page.id === selector || page.id === value?.id)?.page
}
export function actualCoverage(name: string, value: any, snapshots: PageSnapshot[]): number[] {
  const result = payload(value)
  const selectors = name === 'univer_inspect' ? result?.slides : name === 'univer_lint' ? result?.coverage?.pages : result?.images?.map((image: any) => image.metadata?.page)
  return [...new Set((Array.isArray(selectors) ? selectors : []).map(selector => pageNumber(selector, snapshots)).filter((page): page is number => Number.isInteger(page) && page! > 0))]
}
export function refreshPages(state: PresentationWorkflow, snapshots: PageSnapshot[], dependencies: Record<string, string>): void {
  const ids = new Set(snapshots.map(page => String(page.page)))
  for (const key of Object.keys(state.pages)) if (!ids.has(key)) delete state.pages[key]
  for (const page of snapshots) {
    const fingerprint = hash(page.fingerprint + (dependencies[page.page] ?? ''))
    if (state.pages[page.page]?.fingerprint !== fingerprint) {
      state.pages[page.page] = { id: page.id, fingerprint, checks: {} }
      state.changedPages = [...new Set([...state.changedPages, page.page])]
    }
  }
}
export function exportBlockers(state: PresentationWorkflow): number[] {
  return state.changedPages.filter(page => {
    const entry = state.pages[page]
    if (!entry || entry.review?.fingerprint !== entry.fingerprint) return true
    return ['univer_inspect', 'univer_lint', 'univer_screenshot'].some(name => entry.checks[name]?.fingerprint !== entry.fingerprint)
      || Object.values(entry.checks).some(check => check.findings.some(finding => !entry.review?.waivers.includes(hash(JSON.stringify(finding)))))
  })
}
export function installPresentationWorkflow(ctx: Context): void {
  const routes = new Map<string, { provider: string; model: string; imageInput: boolean }>(), bypass = new Set<string>()
  ctx.effect(() => () => { routes.clear(); bypass.clear() })
  ctx.on('llm/stream', async function* (options, next) {
    if (options.sessionId && options.purpose === undefined) {
      const model = await ctx.llm.resolveModelInfo(options.provider, options.model).catch(() => undefined)
      routes.set(String(options.sessionId), { provider: options.provider, model: options.model, imageInput: model?.inputModalities?.includes('image') === true })
    }
    yield* next()
  })
  function cwd(exec: ToolRunContext | ToolDispatchExecution): string { const value = exec.agent?.session.header.cwd; if (!value) throw new Error('Presentation requires an authorized workspace.'); return value }
  function eventState(exec: ToolRunContext | ToolDispatchExecution): PresentationWorkflow | undefined {
    const value: any = (exec.agent?.session.snapshotEvents() as readonly { type: string; data: unknown }[] | undefined)?.filter(event => event.type === EVENT).at(-1)?.data
    return value?.schemaVersion === 2 ? structuredClone(value) : undefined
  }
  async function load(exec: ToolRunContext | ToolDispatchExecution): Promise<PresentationWorkflow | undefined> {
    const event = eventState(exec)
    if (!event?.journal) return event
    return JSON.parse(await readFile(await workspacePath(cwd(exec), event.journal), 'utf8'))
  }
  async function persist(exec: ToolRunContext | ToolDispatchExecution, state: PresentationWorkflow): Promise<void> {
    if (state.journal) await saveJson(await workspacePath(cwd(exec), state.journal), state)
    exec.agent?.session.append(EVENT as any, state as any)
  }
  async function dispatch(exec: ToolRunContext | ToolDispatchExecution, name: string, args: any, internal = false): Promise<any> {
    const callId = `presentation-${randomUUID()}` as any
    if (internal) bypass.add(String(callId))
    try {
      const result = await ctx.tools.execute({ callId, name, arguments: args, ...(exec.agent ? { agent: exec.agent } : {}), parent: exec.token, signal: exec.signal, rootCallId: exec.rootCallId })
      if (result.isError) throw new Error(`${name}: ${result.error.message}`)
      if (result.value && typeof result.value === 'object' && 'ok' in result.value && result.value.ok === false) throw new Error(`${name} returned failure; inspect its structured result.`)
      if ('deferContext' in exec) for (const context of result.additionalContexts ?? []) exec.deferContext(context)
      return result.value
    } finally { bypass.delete(String(callId)) }
  }
  async function sync(exec: ToolRunContext | ToolDispatchExecution, state: PresentationWorkflow): Promise<PageSnapshot[]> {
    if (!state.scope) return []
    const captured = payload(await dispatch(exec, 'univer_execute', { ...state.scope, code: SNAPSHOT_CODE }, true))
    const snapshots: PageSnapshot[] = captured?.value ?? captured?.execution?.value ?? captured
    if (!Array.isArray(snapshots)) throw new Error('Cannot capture Slide page revisions. Keep draft and inspect the execution result before retrying.')
    const spec = await readSpecification(cwd(exec), state.spec), manifest = await readManifest(cwd(exec), state.manifest), deps: Record<string, string> = {}
    for (const page of snapshots) {
      if (!spec.slides[page.page - 1]) throw new Error(`Page ${page.page} is missing its content plan.`)
      deps[page.page] = JSON.stringify({ plan: spec.slides[page.page - 1], assets: assetsForPage(spec, manifest, page.page).map(asset => ({ id: asset.assetId, sha256: asset.sha256, source: asset.source, parent: asset.parentAssetId })) })
    }
    refreshPages(state, snapshots, deps); return snapshots
  }
  async function bound(exec: ToolRunContext | ToolDispatchExecution): Promise<PresentationWorkflow> { const state = await load(exec); if (!state?.scope) throw new Error('Call presentation_prepare with file, unitId and worktreeId first.'); return state }
  // Serialize the complete read/check/write against one .univer file. Nested
  // snapshot calls bypass this wrapper to avoid reentrant locks.
  ctx.on('tools/execute', async (exec, next) => {
    if (bypass.has(String(exec.callId)) || !exec.name.startsWith('univer_') || !exec.agent) return next()
    const args = exec.arguments as any, initial = await load(exec)
    if (!initial || !args.file || !args.unitId || !args.worktreeId) return next()
    const file = await workspacePath(cwd(exec), args.file)
    if (initial.scope && (initial.scope.file !== file || initial.scope.unitId !== args.unitId || initial.scope.worktreeId !== args.worktreeId)) return next()
    if (!['univer_compile_svg', 'univer_execute', 'univer_export', 'univer_inspect', 'univer_lint', 'univer_screenshot'].includes(exec.name)) return next()
    return withPresentationLock(file, async () => {
      const state = (await load(exec))!
      state.scope ??= { file, unitId: args.unitId, worktreeId: args.worktreeId }
      try {
        if (exec.name === 'univer_compile_svg') {
          await validatePresentationAssets(cwd(exec), state, args.page)
          const source = await prepareSvg(cwd(exec), args.source, state.spec, state.manifest, args.page)
          const value = await dispatch(exec, exec.name, { ...args, source }, true)
          await sync(exec, state); state.phase = 'building'; delete state.failure; await persist(exec, state)
          return { isError: false as const, value, content: [{ type: 'text' as const, text: JSON.stringify(value) }] }
        }
        const before = await sync(exec, state)
        if (exec.name === 'univer_export') {
          await validatePresentationAssets(cwd(exec), state)
          const blocked = exportBlockers(state)
          if (blocked.length) throw new Error(`Export requires current inspect/lint/screenshots and actual visual reviews for pages: ${blocked.join(', ')}. Use presentation_check_pages, fix only these pages, then presentation_record_reviews.`)
        }
        const result = await next()
        if (result.isError) { await persist(exec, state); return result }
        if (exec.name === 'univer_execute') await sync(exec, state)
        else if (['univer_inspect', 'univer_lint', 'univer_screenshot'].includes(exec.name)) {
          const data = payload(result.value), covered = actualCoverage(exec.name, result.value, before)
          for (const page of covered) {
            const entry = state.pages[page]; if (!entry) continue
            const findings = exec.name === 'univer_lint' ? (data.findings ?? []).filter((finding: any) => pageNumber(finding.page ?? finding.pageId, before) === page) : []
            const occlusion = exec.name === 'univer_lint' ? lintImageOcclusion(before.find(item => item.page === page)!) : []
            const screenshot = data.images?.find((image: any) => pageNumber(image.metadata?.page, before) === page)?.path
            entry.checks[exec.name] = { fingerprint: entry.fingerprint, findings: [...findings, ...occlusion], ...(screenshot ? { screenshot } : {}) }
            if (findings.length || occlusion.length) delete entry.review
          }
          state.phase = 'checking'
        } else if (exec.name === 'univer_export') {
          const outputPath = payload(result.value)?.outputPath
          if (typeof outputPath === 'string' && outputPath.toLowerCase().endsWith('.pptx')) {
            const captured = payload(await dispatch(exec, 'univer_execute', { ...state.scope, code: 'return presentation.getSlides().map(slide=>slide.getSpeakerNotes());' }, true))
            const notes = captured?.value ?? captured?.execution?.value ?? captured
            if (!Array.isArray(notes) || notes.some(note => typeof note !== 'string')) throw new Error('Cannot read current speaker notes for PPTX export.')
            const preserved = await preservePptxNotes(cwd(exec), outputPath, notes, exec.signal)
            Object.assign(result.value as object, { presentationExport: preserved })
          }
          state.phase = 'exported-awaiting-readback'
        }
        delete state.failure; await persist(exec, state)
        if (exec.name === 'univer_lint') {
          const covered = actualCoverage(exec.name, result.value, before)
          const presentationFindings = covered.flatMap(page => (state.pages[page]?.checks.univer_lint?.findings ?? []).map(finding => ({ sha256: hash(JSON.stringify(finding)), finding })))
          return { ...result, value: { ...(result.value as any), presentationFindings }, content: [...result.content, { type: 'text' as const, text: JSON.stringify({ presentationFindings }) }] }
        }
        return result
      } catch (error) {
        state.failure = { stage: exec.name, message: error instanceof Error ? error.message.slice(0, 1000) : 'Presentation operation failed.', at: new Date().toISOString() }
        await persist(exec, state); throw error
      }
    })
  })
  ctx.tools.register(defineTool({ name: 'presentation_prepare', description: 'Bind a saved rich content plan and asset manifest to one Slide file/Unit/draft. Resume journaled page checks; no mandatory style samples or per-page image generation.', parameters: { spec_path: { type: 'string', required: true }, manifest_path: { type: 'string', required: true }, mode: { type: 'string', enum: ['new', 'edit'], required: true }, file: { type: 'string' }, unitId: { type: 'string' }, worktreeId: { type: 'string' }, changed_pages: { type: 'array', items: { type: 'integer' } } }, output, execute: async (args, exec) => {
    const root = cwd(exec), spec = await workspacePath(root, args.spec_path), manifest = await workspacePath(root, args.manifest_path)
    await readSpecification(root, spec); await readManifest(root, manifest)
    if ([args.file, args.unitId, args.worktreeId].some(Boolean) && ![args.file, args.unitId, args.worktreeId].every(Boolean)) throw new Error('Provide file, unitId and worktreeId together.')
    const scope = args.file ? { file: await workspacePath(root, args.file), unitId: args.unitId!, worktreeId: args.worktreeId! } : undefined
    const directory = resolve(root, '.zerowall', 'presentation-state'); await mkdir(directory, { recursive: true })
    const journal = await workspacePath(root, resolve(directory, hash(JSON.stringify({ spec, manifest, scope })) + '.json'))
    return withPresentationLock(scope?.file ?? journal, async () => {
      let state: PresentationWorkflow = { schemaVersion: 2, spec, manifest, ...(scope ? { scope } : {}), journal, mode: args.mode, changedPages: args.changed_pages ?? [], pages: {}, phase: 'planned' }
      try { const previous = JSON.parse(await readFile(journal, 'utf8')); if (previous.schemaVersion === 2) state = previous } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      state.changedPages = [...new Set([...state.changedPages, ...(args.changed_pages ?? [])])]
      await persist(exec, state); return JSON.stringify(state)
    })
  } }))
  ctx.tools.register(defineTool({ name: 'presentation_visual_status', description: 'Report the current chat route image capability. Keep the selected model. Actual screenshots must be viewed before recording visual reviews.', parameters: {}, output, execute: async (_, exec) => JSON.stringify(routes.get(String(exec.agent?.session.id)) ?? { imageInput: false, guidance: 'Current chat image support has not been confirmed. Continue planning; visual review needs image input.' }) }))
  ctx.tools.register(defineTool({ name: 'presentation_record_asset', description: 'Register one generated, literature, user or derived asset with source-specific provenance. Literature figures do not need image generation receipts.', parameters: { manifest_path: { type: 'string', required: true }, ...assetParameters }, output, execute: async (args, exec) => JSON.stringify(await recordVisualAssets(cwd(exec), [assetInput(args.manifest_path, args)])) }))
  ctx.tools.register(defineTool({ name: 'presentation_record_assets', description: 'Atomically register up to 128 independent assets. Repeating identical registrations preserves reviews; unused assets do not block compilation.', parameters: { manifest_path: { type: 'string', required: true }, assets: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: assetParameters } } }, output, isConcurrencySafe: () => true, execute: async (args, exec) => JSON.stringify(await recordVisualAssets(cwd(exec), args.assets.map(item => assetInput(args.manifest_path, item)))) }))
  async function reviewMany(exec: ToolRunContext, reviews: { kind: string; target: string; observations: string; waivers?: string[] }[]): Promise<void> {
    const initial = await load(exec); if (!initial) throw new Error('Call presentation_prepare before recording reviews.')
    if (!routes.get(String(exec.agent?.session.id))?.imageInput) throw new Error('当前聊天模型未确认支持图像输入；保留草稿，使用当前选定模型查看实际图片后记录审查。')
    for (const args of reviews.filter(item => item.kind !== 'page')) await recordAssetReview(cwd(exec), initial.manifest, args.kind as 'asset' | 'style', args.target, args.observations)
    const pages = reviews.filter(item => item.kind === 'page')
    if (!pages.length) return
    await withPresentationLock(initial.scope?.file ?? initial.journal!, async () => {
      const state = (await load(exec))!; await sync(exec, state)
      // Capture one revision set for the batch. Preserve successful reviews if a
      // later entry fails without repeating a full snapshot for every page.
      try {
        for (const args of pages) {
          if (args.observations.trim().length < 20) throw new Error('Record concrete observations from the actual screenshot.')
          const page = state.pages[args.target]
          if (!page || ['univer_inspect', 'univer_lint', 'univer_screenshot'].some(name => page.checks[name]?.fingerprint !== page.fingerprint) || !page.checks.univer_screenshot?.screenshot) throw new Error('Current page inspect, lint and a returned screenshot are required before visual review.')
          page.review = { fingerprint: page.fingerprint, observations: args.observations, waivers: args.waivers ?? [] }; state.phase = 'reviewed'
        }
      } finally { await persist(exec, state) }
    })
  }
  const reviewParameters = { kind: { type: 'string' as const, enum: ['style', 'asset', 'page'] as const, required: true }, target: { type: 'string' as const, required: true }, observations: { type: 'string' as const, required: true }, waivers: { type: 'array' as const, items: { type: 'string' as const }, description: 'Finding SHA-256 values explicitly justified by observations from the screenshot.' } } as const
  ctx.tools.register(defineTool({ name: 'presentation_record_review', description: 'Record actual current-model visual observations for an asset or a checked page revision. Asset review does not erase page checks.', parameters: reviewParameters, output, execute: async (args, exec) => { await reviewMany(exec, [args]); return 'Visual observations recorded for the current revision.' } }))
  ctx.tools.register(defineTool({ name: 'presentation_record_reviews', description: 'Record several actual visual reviews with one page snapshot. View every image first; tool success is not visual evidence.', parameters: { reviews: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: reviewParameters } } }, output, execute: async (args, exec) => { await reviewMany(exec, args.reviews); return 'Visual observations recorded.' } }))
  ctx.tools.register(defineTool({ name: 'presentation_compile_pages', description: 'Compile complete SVG pages serially into the bound draft. Successful earlier pages survive interruption. Add native charts/tables/notes after the final SVG replacement.', parameters: { pages: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { page: { type: 'integer', required: true }, source: { type: 'string', required: true } } } } }, output, execute: async (args, exec) => {
    const state = await bound(exec), results: any[] = []
    try {
      for (const page of args.pages) { exec.signal?.throwIfAborted(); results.push(await dispatch(exec, 'univer_compile_svg', { ...state.scope, ...page, mode: 'replace' })) }
    } catch (error) {
      if (exec.signal?.aborted) {
        const latest = (await load(exec))!;latest.phase = 'interrupted'
        latest.failure = { stage: 'presentation_compile_pages', message: `Batch cancelled after ${results.length} successful page(s). Resume remaining pages in the same draft.`, at: new Date().toISOString() }
        await persist(exec, latest)
      }
      throw error
    }
    return JSON.stringify(results)
  } }))
  ctx.tools.register(defineTool({ name: 'presentation_set_chart_ticks', description: 'Set fixed numeric tick spacing or restore automatic ticks on an actual native Slide chart. The pinned setYAxis facade does not support interval. Keeps data, style, placement and editability; invalidates only affected page checks.', parameters: { page: { type: 'integer', required: true }, chart_id: { type: 'string', required: true }, axis: { type: 'string', enum: ['x', 'y', 'rightY'], required: true }, mode: { type: 'string', enum: ['fixed', 'automatic'], required: true }, major_unit: { type: 'number' } }, output, execute: async (args, exec) => {
    const state = await bound(exec)
    const code = chartAxisCode({ page: args.page, chartId: args.chart_id, axis: args.axis, mode: args.mode, ...(args.major_unit === undefined ? {} : { majorUnit: args.major_unit }) })
    return JSON.stringify(await dispatch(exec, 'univer_execute', { ...state.scope, code }))
  } }))
  ctx.tools.register(defineTool({ name: 'presentation_check_pages', description: 'Inspect, lint including image occlusion, and screenshot selected pages in batches. Only actual returned coverage counts. Review every PNG before export.', parameters: { pages: { type: 'array', items: { type: 'integer' } }, output: { type: 'string', required: true } }, output, execute: async (args, exec) => {
    const state = await bound(exec)
    const inspect = await dispatch(exec, 'univer_inspect', state.scope)
    const pages = [...new Set(args.pages ?? (await load(exec))!.changedPages)]
    if (!pages.length || pages.some(page => !Number.isInteger(page) || page < 1)) throw new Error('Select at least one existing page to check.')
    const lint = await dispatch(exec, 'univer_lint', { ...state.scope, pages })
    const batches: any[] = []
    for (let offset = 0; offset < pages.length; offset += 5) batches.push(await dispatch(exec, 'univer_screenshot', { ...state.scope, pages: pages.slice(offset, offset + 5), output: `${args.output}/batch-${offset / 5 + 1}`, contactSheet: true }))
    const screenshot = { ...batches[0], result: { ...payload(batches[0]), images: batches.flatMap(batch => payload(batch).images ?? []) } }
    return JSON.stringify({ inspect, lint, screenshot, state: await load(exec) })
  } }))
  ctx.tools.register(defineTool({ name: 'presentation_status', description: 'Read persisted phase, current page checks/reviews, specific failures and export blockers. Does not mutate the deck.', parameters: {}, output, execute: async (_, exec) => { const state = await load(exec); return JSON.stringify({ state, blockedPages: state ? exportBlockers(state) : [] }) } }))
}
