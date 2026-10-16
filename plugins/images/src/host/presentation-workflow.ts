import { randomUUID } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolRunContext, type ToolDispatchExecution } from '@deepseek-ai/dsh-tools'
import { assetsForPage, hash, readManifest, readSpecification, recordAssetReview, recordVisualAssets, saveJson, validatePresentationAssets, withPresentationLock, workspacePath, type AssetInput } from './visual-assets.js'
import { lintImageOcclusion, prepareSvg, validateEditableSvgPlan, type PageSnapshot } from './presentation-layout.js'
import { preservePptxNotes } from './presentation-export.js'
import { chartAxisCode } from './presentation-chart.js'

type Scope = { file: string; unitId: string; worktreeId: string }
type Check = { fingerprint: string; findings: unknown[]; screenshot?: string }
export interface PresentationWorkflow {
  schemaVersion: 2; spec: string; manifest: string; mode: 'new' | 'edit'; scope?: Scope; journal?: string
  changedPages: number[]; pages: Record<string, { fingerprint: string; id: string; checks: Record<string, Check>; review?: { fingerprint: string; observations: string; waivers: string[] } }>
  phase: string; templatePlans?: Record<string, EditablePagePlan>; reconstructionFailures?: Record<string, string[]>; failure?: { stage: string; message: string; at: string }
  exportReceipt?: { outputPath: string; notesWritten: number; bytes: number; sha256: string }
}
export type EditableElementType = 'text' | 'shape' | 'image' | 'table' | 'chart' | 'connector'
export interface EditableElementPlan {
  id: string; type: EditableElementType; x: number; y: number; width: number; height: number
  content?: string; role?: string; zIndex?: number; editable?: boolean
}
export interface EditablePagePlan {
  page: number; templateAssetId: string; elements: EditableElementPlan[]; density?: 'sparse' | 'balanced' | 'dense'
  createdAt: string
}
export interface PresentationImageTask<T = unknown> { id: string; page: number; run: () => Promise<T> }

/** Run independent image/template tasks concurrently while retaining stable output order. */
export async function runPresentationImageTasks<T>(tasks: PresentationImageTask<T>[], concurrency = 2): Promise<T[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Presentation task concurrency must be a positive integer.')
  if (new Set(tasks.map(task => task.id)).size !== tasks.length) throw new Error('Presentation image task IDs must be unique.')
  const results = new Array<T>(tasks.length), next = { value: 0 }
  async function worker(): Promise<void> {
    for (;;) {
      const index = next.value++
      if (index >= tasks.length) return
      results[index] = await tasks[index]!.run()
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(tasks.length, 1)) }, () => worker()))
  return results
}

export function validateEditablePagePlan(page: number, templateAssetId: string, elements: EditableElementPlan[], density?: EditablePagePlan['density']): EditablePagePlan {
  if (!Number.isInteger(page) || page < 1) throw new Error('Editable template page must be a positive integer.')
  if (!/^[a-zA-Z0-9][\w.-]{0,127}$/u.test(templateAssetId)) throw new Error('template_asset_id must be a stable registered asset ID.')
  if (!Array.isArray(elements) || !elements.length || elements.length > 256) throw new Error('Editable template plans require 1–256 elements.')
  const ids = new Set<string>()
  for (const element of elements) {
    if (!element || !/^[a-zA-Z0-9][\w.-]{0,127}$/u.test(element.id) || ids.has(element.id)) throw new Error('Editable element IDs must be unique stable identifiers.')
    ids.add(element.id)
    if (!['text', 'shape', 'image', 'table', 'chart', 'connector'].includes(element.type)) throw new Error(`Unsupported editable element type: ${String(element.type)}`)
    if (element.editable === false) throw new Error(`Planned element ${element.id} must remain editable.`)
    if (![element.x, element.y, element.width, element.height].every(value => Number.isFinite(value)) || element.width <= 0 || element.height <= 0) throw new Error(`Editable element ${element.id} must have positive bounds.`)
    if (element.type === 'text' && (!element.content || !element.content.trim())) throw new Error(`Editable text element ${element.id} requires content.`)
  }
  return { page, templateAssetId, elements, ...(density === undefined ? {} : { density }), createdAt: new Date().toISOString() }
}
const EVENT = 'zerowall/presentation-workflow'
// Return compact facts, not multi-megabyte image data in the conversation. Two
// independent rolling digests detect page mutations; assets use SHA-256 separately.
export const SNAPSHOT_CODE = `return presentation.getSlides().map((slide,index)=>{const data={...slide.getData(),chartResources:slide.getCharts().map(c=>c.getChartData()),speakerNotes:slide.getSpeakerNotes()}, raw=JSON.stringify(data);let a=2166136261,b=5381;for(let i=0;i<raw.length;i++){a=Math.imul(a^raw.charCodeAt(i),16777619);b=Math.imul(b,33)^raw.charCodeAt(i);} const clean=JSON.parse(raw,(_,v)=>typeof v==='string'&&v.length>2048?'[binary:'+v.length+']':v);return {page:index+1,id:slide.getId(),fingerprint:(a>>>0).toString(16)+':'+(b>>>0).toString(16)+':'+raw.length,data:clean};});`

/**
 * Normalize the execution-source sentinel emitted by some callers.  The
 * Univer tool contract is exactly one of `code` or `codeFile`; `/none` is a
 * transport placeholder and must not be forwarded as a second source.  A
 * real pair is rejected before dispatch so an input error is not retried.
 */
export function normalizeUniverExecutionSource(args: unknown): unknown {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return args
  const value = args as Record<string, unknown>
  const codeFile = value.codeFile
  const sentinel = typeof codeFile === 'string' && ['/none', 'none', ''].includes(codeFile.trim().toLowerCase())
  if (sentinel) {
    const { codeFile: _omitted, ...rest } = value
    return rest
  }
  if (typeof value.code === 'string' && value.code.trim() && codeFile !== undefined && codeFile !== null) {
    const error = new Error('INVALID_EXECUTION_SOURCE: provide exactly one of code or codeFile; remove codeFile when sending inline code.')
    ;(error as Error & { code?: string }).code = 'INVALID_EXECUTION_SOURCE'
    throw error
  }
  return args
}
const output = { schema: { type: 'string' as const }, render: (_args: unknown, value: any) => [{ type: 'text' as const, text: value }] }
const assetParameters = {
  image_path: { type: 'string' as const, required: true }, asset_id: { type: 'string' as const, required: true }, role: { type: 'string' as const, required: true },
  source_kind: { type: 'string' as const, enum: ['generated', 'literature', 'user', 'derived'] as const }, slide_number: { type: 'integer' as const }, slide_numbers: { type: 'array' as const, items: { type: 'integer' as const } },
  source_path: { type: 'string' as const }, source_page: { type: 'integer' as const }, source_figure: { type: 'string' as const }, citation: { type: 'string' as const }, source_url: { type: 'string' as const }, parent_asset_id: { type: 'string' as const },
  style_reference_ids: { type: 'array' as const, items: { type: 'string' as const } }, source_seed_path: { type: 'string' as const },
} as const
const editablePlanParameters = {
  plans: { type: 'array' as const, required: true, items: { type: 'object' as const, additionalProperties: false, properties: {
    page: { type: 'integer' as const, required: true }, template_asset_id: { type: 'string' as const, required: true }, density: { type: 'string' as const, enum: ['sparse', 'balanced', 'dense'] as const },
    elements: { type: 'array' as const, required: true, items: { type: 'object' as const, additionalProperties: false, properties: {
      id: { type: 'string' as const, required: true }, type: { type: 'string' as const, enum: ['text', 'shape', 'image', 'table', 'chart', 'connector'] as const, required: true },
      x: { type: 'number' as const, required: true }, y: { type: 'number' as const, required: true }, width: { type: 'number' as const, required: true }, height: { type: 'number' as const, required: true },
      content: { type: 'string' as const }, role: { type: 'string' as const }, zIndex: { type: 'number' as const }, editable: { type: 'boolean' as const },
    } } },
  } } },
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
  for (const key of Object.keys(state.pages)) if (!ids.has(key)) { delete state.pages[key]; delete state.exportReceipt }
  for (const page of snapshots) {
    const fingerprint = hash(page.fingerprint + (dependencies[page.page] ?? ''))
    if (state.pages[page.page]?.fingerprint !== fingerprint) {
      delete state.exportReceipt
      state.pages[page.page] = { id: page.id, fingerprint, checks: {} }
      state.changedPages = [...new Set([...state.changedPages, page.page])]
    }
  }
}
export function exportBlockers(state: PresentationWorkflow): number[] {
  return state.changedPages.filter(page => {
    if (state.reconstructionFailures?.[page]?.length) return true
    const entry = state.pages[page]
    if (!entry || entry.review?.fingerprint !== entry.fingerprint) return true
    return ['univer_inspect', 'univer_lint', 'univer_screenshot'].some(name => entry.checks[name]?.fingerprint !== entry.fingerprint)
      || Object.values(entry.checks).some(check => check.findings.some(finding => !entry.review?.waivers.includes(hash(JSON.stringify(finding)))))
  })
}
/** Verify the persisted Univer page, not author-supplied SVG labels. Native
 * chart/table requirements cannot be satisfied by rectangles or bitmap text. */
export function editableReconstructionFailures(snapshot: PageSnapshot, plan: EditablePagePlan): string[] {
  const remaining = Object.values(snapshot.data.elements ?? {}) as any[]
  const normalized = (text: string) => text.replace(/\s+/gu, '')
  return plan.elements.flatMap(planned => {
    const index = remaining.findIndex(element => {
      const text = element.text ?? element.shapeData?.shapeText?.text ?? element.textData?.body?.dataStream ?? element.shapeData?.shapeText?.textData?.body?.dataStream ?? ''
      const actualType = element.type === 'shape' && String(text).trim() ? 'text' : element.type
      const image = element.type === 'image' || !!element.shapeData?.fill?.fillImageSource
      if (planned.type === 'image' ? !image : actualType !== planned.type) return false
      if ((planned.type === 'chart' && !element.chartId) || (planned.type === 'table' && !element.tableId)) return false
      if (planned.type === 'text' && !normalized(String(text)).includes(normalized(planned.content ?? ''))) return false
      const box = element.transform
      if (!box || ![box.left, box.top, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) return false
      // Font measurement may change a text run's precise box. Require each
      // object to remain within its planned region with a small metric margin.
      const margin = 8
      return box.left >= planned.x - margin && box.top >= planned.y - margin && box.left + box.width <= planned.x + planned.width + margin && box.top + box.height <= planned.y + planned.height + margin
    })
    if (index < 0) return [`Planned ${planned.type} ${planned.id} has no matching editable Univer object/content within its bounds.`]
    remaining.splice(index, 1)
    return []
  })
}
function presentationFindings(state: PresentationWorkflow, pages = state.changedPages) {
  return pages.flatMap(page => (state.pages[page]?.checks.univer_lint?.findings ?? []).map(finding => ({ page, sha256: hash(JSON.stringify(finding)), finding })))
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
      deps[page.page] = JSON.stringify({ plan: spec.slides[page.page - 1], template: state.templatePlans?.[page.page], assets: assetsForPage(spec, manifest, page.page).map(asset => ({ id: asset.assetId, sha256: asset.sha256, source: asset.source, parent: asset.parentAssetId })) })
    }
    refreshPages(state, snapshots, deps)
    state.reconstructionFailures = Object.fromEntries(Object.values(state.templatePlans ?? {}).map(plan => {
      const snapshot = snapshots.find(page => page.page === plan.page)
      return [plan.page, snapshot ? editableReconstructionFailures(snapshot, plan) : ['Planned page has not been compiled into the bound Univer draft.']]
    }))
    return snapshots
  }
  async function bound(exec: ToolRunContext | ToolDispatchExecution): Promise<PresentationWorkflow> { const state = await load(exec); if (!state?.scope) throw new Error('Call presentation_prepare with file, unitId and worktreeId first.'); return state }
  // Serialize the complete read/check/write against one .univer file. Nested
  // snapshot calls bypass this wrapper to avoid reentrant locks.
  ctx.on('tools/execute', async (exec, next) => {
    if (bypass.has(String(exec.callId)) || !exec.name.startsWith('univer_') || !exec.agent) return next()
    const args = exec.name === 'univer_execute' ? normalizeUniverExecutionSource(exec.arguments) as any : exec.arguments as any
    if (exec.name === 'univer_execute' && args !== exec.arguments) (exec as any).arguments = args
    const initial = await load(exec)
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
          const plan = state.templatePlans?.[args.page]
          if (plan) await validateEditableSvgPlan(cwd(exec), args.source, plan)
          const source = await prepareSvg(cwd(exec), args.source, state.spec, state.manifest, args.page)
          const value = await dispatch(exec, exec.name, { ...args, source }, true)
          await sync(exec, state); state.phase = 'building'; delete state.failure; await persist(exec, state)
          return { isError: false as const, value, content: [{ type: 'text' as const, text: JSON.stringify(value) }] }
        }
        const before = await sync(exec, state)
        if (exec.name === 'univer_export') {
          delete state.exportReceipt
          await validatePresentationAssets(cwd(exec), state)
          const blocked = exportBlockers(state)
          if (blocked.length) throw new Error(`Export requires current inspect/lint/screenshots, actual visual reviews and matching editable reconstruction objects for pages: ${blocked.join(', ')}. Use presentation_status to inspect reconstructionFailures, fix native objects/content, then presentation_check_pages and presentation_record_reviews.`)
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
            if (preserved) state.exportReceipt = { outputPath, ...preserved }
          }
          state.phase = 'exported-awaiting-readback'
        }
        delete state.failure; await persist(exec, state)
        // Univer owns a closed, frozen output contract. Keep its canonical
        // result intact; expose ZeroWall findings/receipts through our tools.
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
  ctx.tools.register(defineTool({ name: 'presentation_generate_templates', description: 'Generate whole-page raster template references in parallel with gpt-image-generator generate_image and the environment image configuration. Templates are registered as reference-only assets and never become the editable slide; use presentation_plan_editable_pages to rebuild text, shapes, tables, charts and connectors over the reference. Independent non-presentation tasks may run concurrently through their own tools.', parameters: { templates: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { page: { type: 'integer', required: true }, prompt: { type: 'string', required: true }, output_path: { type: 'string', required: true }, asset_id: { type: 'string', required: true } } } }, concurrency: { type: 'integer', description: 'Maximum concurrent image generations. Defaults to 2.' } }, output, execute: async (args, exec) => {
    const state = await bound(exec)
    const spec = await readSpecification(cwd(exec), state.spec)
    if (!args.templates.length || args.templates.length > 128) throw new Error('Generate 1–128 page templates per batch.')
    const paths = new Set<string>()
    for (const item of args.templates) {
      if (!Number.isInteger(item.page) || item.page < 1 || item.page > spec.slides.length) throw new Error('Template page is outside the presentation specification.')
      if (!/^[a-zA-Z0-9][\w.-]{0,127}$/u.test(item.asset_id)) throw new Error('Template asset IDs must be stable identifiers.')
      const path = resolve(cwd(exec), item.output_path)
      if (paths.has(path)) throw new Error('Template output paths must be unique within a batch.')
      paths.add(path)
    }
    const tasks = args.templates.map(item => ({ id: item.asset_id, page: item.page, run: async () => {
      const result = await dispatch(exec, 'generate_image', { prompt: item.prompt, output_path: item.output_path })
      const value = payload(result)
      if (!value || typeof value !== 'object' || typeof value.path !== 'string') throw new Error(`Template ${item.asset_id} generation returned no verified output path.`)
      return value
    } }))
    const generated = await runPresentationImageTasks(tasks, args.concurrency ?? 2)
    const assets = await recordVisualAssets(cwd(exec), args.templates.map(item => ({ manifest: state.manifest, image: item.output_path, assetId: item.asset_id, role: 'template', sourceKind: 'generated', slideNumber: item.page })))
    return JSON.stringify({ templates: assets.assets.map((asset, index) => ({ page: args.templates[index]!.page, assetId: asset.assetId, path: asset.path, sha256: asset.sha256, generated: generated[index] })) })
  } }))
  ctx.tools.register(defineTool({ name: 'presentation_plan_editable_pages', description: 'Persist the editable reconstruction plan for generated whole-page templates. The plan is the implementation contract for the next SVG/Univer pass: content, bounds, density and native object types remain editable while the template image stays reference-only.', parameters: editablePlanParameters, output, execute: async (args, exec) => {
    const state = await bound(exec), manifest = await readManifest(cwd(exec), state.manifest), plans: Record<string, EditablePagePlan> = { ...(state.templatePlans ?? {}) }
    for (const input of args.plans) {
      const template = manifest.assets.find(asset => asset.assetId === input.template_asset_id && asset.role === 'template' && asset.sourceKind === 'generated' && asset.slideNumber === input.page)
      if (!template) throw new Error(`Page ${input.page}: template_asset_id must reference a generated template asset for that page.`)
      plans[input.page] = validateEditablePagePlan(input.page, input.template_asset_id, input.elements, input.density)
    }
    state.templatePlans = plans; state.changedPages = [...new Set([...state.changedPages, ...args.plans.map(item => item.page)])]; state.phase = 'planned-editable-reconstruction'; delete state.exportReceipt
    await persist(exec, state)
    return JSON.stringify({ plans: Object.values(plans), next: 'Author complete page-NN.svg using these editable bounds, then call presentation_compile_pages.' })
  } }))
  ctx.tools.register(defineTool({ name: 'presentation_record_asset', description: 'Register one generated, literature, user or derived deck image. Generated assets use gpt-image-generator generate_image/edit_image and their real .generation.json receipt; no media project/job. Literature figures do not need generation receipts.', parameters: { manifest_path: { type: 'string', required: true }, ...assetParameters }, output, execute: async (args, exec) => JSON.stringify(await recordVisualAssets(cwd(exec), [assetInput(args.manifest_path, args)])) }))
  ctx.tools.register(defineTool({ name: 'presentation_record_assets', description: 'Atomically register up to 128 independent deck images. Generate with gpt-image-generator generate_image/edit_image using environment image settings; retain real PNG/.generation.json, without media projects/jobs. Identical registration preserves reviews; unused assets do not block compilation.', parameters: { manifest_path: { type: 'string', required: true }, assets: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: assetParameters } } }, output, isConcurrencySafe: () => true, execute: async (args, exec) => JSON.stringify(await recordVisualAssets(cwd(exec), args.assets.map(item => assetInput(args.manifest_path, item)))) }))
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
      for (const page of args.pages) {
        exec.signal?.throwIfAborted()
        results.push(await dispatch(exec, 'univer_compile_svg', { ...state.scope, ...page, mode: 'replace' }))
      }
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
    const latest = (await load(exec))!
    return JSON.stringify({ inspect, lint, screenshot, presentationFindings: presentationFindings(latest, pages), state: latest })
  } }))
  ctx.tools.register(defineTool({ name: 'presentation_status', description: 'Read persisted phase, current page checks/reviews, finding hashes, export receipt, specific failures and export blockers. Does not mutate the deck.', parameters: {}, output, execute: async (_, exec) => { const state = await load(exec); return JSON.stringify({ state, presentationFindings: state ? presentationFindings(state) : [], blockedPages: state ? exportBlockers(state) : [] }) } }))
}
