import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
import { parse } from 'yaml'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolRunContext, type ToolDispatchExecution } from '@deepseek-ai/dsh-tools'
import { assetsForPage, hash, readManifest, readSpecification, recordAssetReview, recordVisualAssets, saveJson, withPresentationLock, workspacePath, type AssetInput, type VisualAsset } from './visual-assets.js'
import { DEFAULT_IMAGE_CONCURRENCY, imageConcurrency } from './image-concurrency.js'

type Exec = ToolRunContext | ToolDispatchExecution
type OutputMode = 'image' | 'editable'
export interface PageSnapshot { page: number; id: string; fingerprint: string; data: Record<string, any> }
type Check = { fingerprint: string; findings: any[]; screenshot?: string }
export interface PresentationWorkflow {
  schemaVersion: 3; spec: string; manifest: string; mode: 'new' | 'edit'; outputMode: OutputMode; dir: string; journal: string
  changedPages: number[]; pages: Record<string, { id: string; fingerprint: string; checks: Record<string, Check>; review?: { fingerprint: string; observations: string; waivers: string[] } }>
  phase: string; templatePlans?: Record<string, EditablePagePlan>; reconstructionFailures?: Record<string, string[]>
  failure?: { stage: string; message: string; at: string }; exportReceipt?: { outputPath: string; bytes: number; sha256: string; revision: number }
  provenancePath?: string
}
export interface EditablePagePlan { page: number; templateAssetId?: string; elements: Record<string, any>[]; createdAt: string }
export interface PresentationImageTask<T = unknown> { id: string; page: number; run: () => Promise<T> }
declare module '@deepseek-ai/dsh-session/types' { interface SessionEventMap { 'zerowall/presentation-workflow': PresentationWorkflow } }

export async function runPresentationImageTasks<T>(tasks: PresentationImageTask<T>[], concurrency = DEFAULT_IMAGE_CONCURRENCY): Promise<T[]> {
  imageConcurrency(concurrency)
  if (new Set(tasks.map(task => task.id)).size !== tasks.length) throw new Error('Presentation image task IDs must be unique.')
  const results = new Array<T>(tasks.length), cursor = { value: 0 }
  async function worker(): Promise<void> { for (;;) { const index = cursor.value++; if (index >= tasks.length) return; results[index] = await tasks[index]!.run() } }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(tasks.length, 1)) }, () => worker()))
  return results
}
export function validateEditablePagePlan(page: number, elements: Record<string, any>[], templateAssetId?: string): EditablePagePlan {
  if (!Number.isInteger(page) || page < 1) throw new Error('Editable page must be a positive integer.')
  if (!Array.isArray(elements) || !elements.length || elements.length > 512) throw new Error('Editable pages require 1–512 PPTD elements.')
  const ids = new Set<string>()
  for (const element of elements) {
    if (!element || typeof element.elementId !== 'string' || !/^[a-zA-Z0-9][\w.-]{0,127}$/u.test(element.elementId) || ids.has(element.elementId)) throw new Error('PPTD element IDs must be unique stable identifiers.')
    ids.add(element.elementId)
    if (!['text', 'shape', 'line', 'image', 'icon', 'table', 'chart'].includes(element.elementType)) throw new Error('Unsupported PPTD elementType.')
    if (!Array.isArray(element.bounds) || element.bounds.length !== 4 || !element.bounds.every(Number.isFinite) || element.bounds[2] <= 0 || element.bounds[3] <= 0) throw new Error('PPTD elements require positive bounds [x,y,width,height].')
    if (element.elementType === 'text' && typeof element.content?.text !== 'string') throw new Error('Editable text requires content.text.')
    if (element.elementType === 'table' && (!Array.isArray(element.rows) || !element.rows.length)) throw new Error('Native tables require rows.')
    if (element.elementType === 'chart' && (!element.data || !Array.isArray(element.series) || !element.series.length)) throw new Error('Native charts require data and series.')
  }
  return { page, elements, ...(templateAssetId ? { templateAssetId } : {}), createdAt: new Date().toISOString() }
}
export function refreshPages(state: PresentationWorkflow, snapshots: PageSnapshot[], dependencies: Record<string, string>): void {
  for (const key of Object.keys(state.pages)) if (!snapshots.some(page => String(page.page) === key)) { delete state.pages[key]; delete state.exportReceipt }
  for (const page of snapshots) {
    const fingerprint = hash(page.fingerprint + (dependencies[page.page] ?? ''))
    if (state.pages[page.page]?.fingerprint !== fingerprint) { delete state.exportReceipt; state.pages[page.page] = { id: page.id, fingerprint, checks: {} }; state.changedPages = [...new Set([...state.changedPages, page.page])] }
  }
}
export function editableReconstructionFailures(snapshot: PageSnapshot, plan: EditablePagePlan): string[] {
  return plan.elements.flatMap(planned => {
    const actual = snapshot.data.elements?.find((element: any) => element.elementId === planned.elementId)
    if (!actual || actual.elementType !== planned.elementType || JSON.stringify(actual.bounds) !== JSON.stringify(planned.bounds)) return [`Missing or changed editable PPTD object ${planned.elementId}.`]
    if (planned.elementType === 'text' && actual.content?.text !== planned.content.text) return [`Changed editable text ${planned.elementId}.`]
    if (planned.elementType === 'table' && !actual.rows?.length || planned.elementType === 'chart' && (!actual.data || !actual.series?.length)) return [`Missing native data in ${planned.elementId}.`]
    return []
  })
}
export function exportBlockers(state: PresentationWorkflow): number[] {
  return state.changedPages.filter(page => {
    const entry = state.pages[page]
    return !entry || state.reconstructionFailures?.[page]?.length || ['ppt_check', 'ppt_render'].some(name => entry.checks[name]?.fingerprint !== entry.fingerprint)
      || !entry.checks.ppt_render?.screenshot || entry.review?.fingerprint !== entry.fingerprint
      || (entry.checks.ppt_check?.findings ?? []).some(finding => finding.severity === 'blocker' || !entry.review?.waivers.includes(hash(JSON.stringify(finding))))
  })
}
const EVENT = 'zerowall/presentation-workflow'
const output = { schema: { type: 'string' as const }, render: (_args: unknown, value: any) => [{ type: 'text' as const, text: value }] }
const assetParameters = {
  image_path: { type: 'string' as const, required: true }, asset_id: { type: 'string' as const, required: true }, role: { type: 'string' as const, required: true },
  source_kind: { type: 'string' as const, enum: ['generated', 'literature', 'user', 'derived'] as const }, slide_number: { type: 'integer' as const }, slide_numbers: { type: 'array' as const, items: { type: 'integer' as const } },
  source_path: { type: 'string' as const }, source_page: { type: 'integer' as const }, source_figure: { type: 'string' as const }, citation: { type: 'string' as const }, source_url: { type: 'string' as const }, parent_asset_id: { type: 'string' as const },
  style_reference_ids: { type: 'array' as const, items: { type: 'string' as const } }, source_seed_path: { type: 'string' as const },
} as const
function assetInput(manifest: string, args: any): AssetInput {
  return {
    manifest,
    image: args.image_path,
    assetId: args.asset_id,
    role: args.role,
    ...(args.source_kind === undefined ? {} : { sourceKind: args.source_kind }),
    ...(args.slide_number === undefined ? {} : { slideNumber: args.slide_number }),
    ...(args.slide_numbers === undefined ? {} : { slideNumbers: args.slide_numbers }),
    ...(args.style_reference_ids === undefined ? {} : { styleReferenceIds: args.style_reference_ids }),
    ...(args.source_seed_path === undefined ? {} : { sourceSeedPath: args.source_seed_path }),
    ...(args.parent_asset_id === undefined ? {} : { parentAssetId: args.parent_asset_id }),
    ...(args.source_path || args.citation ? { source: { path: args.source_path, page: args.source_page, figure: args.source_figure, citation: args.citation, url: args.source_url } } : {})
  }
}
function findings(state: PresentationWorkflow, pages = state.changedPages) { return pages.flatMap(page => (state.pages[page]?.checks.ppt_check?.findings ?? []).map(finding => ({ page, sha256: hash(JSON.stringify(finding)), finding }))) }
function provenance(assets: VisualAsset[], page: number) { return assets.map(asset => ({ ...asset, targetPage: page })) }
function notes(userNotes: unknown, assets: VisualAsset[], page: number): string { return `${typeof userNotes === 'string' ? userNotes : ''}\n\n[ZeroWall provenance]\n${JSON.stringify(provenance(assets, page), null, 2)}` }

export function installPresentationWorkflow(ctx: Context): void {
  const bypass = new Set<string>()
  ctx.effect(() => () => bypass.clear())
  function cwd(exec: Exec): string { const value = exec.agent?.session.header.cwd; if (!value) throw new Error('Presentation requires an authorized workspace.'); return value }
  async function load(exec: Exec): Promise<PresentationWorkflow | undefined> {
    const events = exec.agent?.session.snapshotEvents() as readonly { type: string; data: any }[] | undefined, event = events?.filter(item => item.type === EVENT).at(-1)?.data
    if (event?.schemaVersion !== 3) return undefined
    return JSON.parse(await readFile(await workspacePath(cwd(exec), event.journal), 'utf8'))
  }
  async function persist(exec: Exec, state: PresentationWorkflow): Promise<void> { await saveJson(await workspacePath(cwd(exec), state.journal), state); exec.agent?.session.append(EVENT, state, { ignorable: true }) }
  async function dispatch(exec: Exec, name: string, args: any, internal = false): Promise<any> {
    const callId = `presentation-${randomUUID()}` as any
    if (internal) bypass.add(String(callId))
    try {
      const result = await ctx.tools.execute({ callId, name, arguments: args, ...(exec.agent ? { agent: exec.agent } : {}), parent: exec.token, signal: exec.signal, rootCallId: exec.rootCallId })
      if (result.isError) throw new Error(`${name}: ${result.error.message}`)
      const value: any = result.value
      if (value?.ok === false) throw new Error(`${name}: ${value.error?.message ?? 'tool returned failure'}`)
      if ('deferContext' in exec) for (const context of result.additionalContexts ?? []) exec.deferContext(context)
      return value
    } finally { bypass.delete(String(callId)) }
  }
  async function project(exec: Exec, state: PresentationWorkflow) {
    const root = cwd(exec), dir = await workspacePath(root, state.dir), deckPath = await workspacePath(root, join(dir, 'deck.pptd'))
    const raw = await readFile(deckPath, 'utf8'), deck = parse(raw), manifest = JSON.parse(await readFile(await workspacePath(root, join(dir, 'manifest.json')), 'utf8'))
    const snapshots: PageSnapshot[] = []
    for (const [index, path] of (deck.pages as string[]).entries()) {
      const pageRaw = await readFile(await workspacePath(root, join(dir, path)), 'utf8')
      snapshots.push({ page: index + 1, id: path, fingerprint: hash(raw.replace(/pages:[\s\S]*$/u, '') + pageRaw), data: parse(pageRaw) })
    }
    return { dir, deck, manifest, snapshots }
  }
  async function sync(exec: Exec, state: PresentationWorkflow): Promise<PageSnapshot[]> {
    const current = await project(exec, state), spec = await readSpecification(cwd(exec), state.spec), manifest = await readManifest(cwd(exec), state.manifest), dependencies: Record<string, string> = {}
    for (const page of current.snapshots) dependencies[page.page] = JSON.stringify({ plan: spec.slides[page.page - 1], editablePlan: state.templatePlans?.[page.page], assets: assetsForPage(spec, manifest, page.page).map(asset => ({ id: asset.assetId, sha256: asset.sha256, prompt: asset.prompt, source: asset.source })) })
    refreshPages(state, current.snapshots, dependencies)
    state.reconstructionFailures = Object.fromEntries(Object.values(state.templatePlans ?? {}).map(plan => [plan.page, current.snapshots[plan.page - 1] ? editableReconstructionFailures(current.snapshots[plan.page - 1]!, plan) : ['Planned page is missing.']]))
    return current.snapshots
  }
  async function bound(exec: Exec): Promise<PresentationWorkflow> { const state = await load(exec); if (!state) throw new Error('Call presentation_prepare with dir first.'); return state }
  async function verifyAssets(exec: Exec, state: PresentationWorkflow, page?: number) {
    const root = cwd(exec), spec = await readSpecification(root, state.spec), manifest = await readManifest(root, state.manifest)
    for (const number of page === undefined ? spec.slides.map((_, i) => i + 1) : [page]) for (const asset of assetsForPage(spec, manifest, number)) {
      if (hash(await readFile(await workspacePath(root, asset.path))) !== asset.sha256) throw new Error(`Asset ${asset.assetId} checksum changed.`)
      if (asset.source?.path && hash(await readFile(await workspacePath(root, asset.source.path))) !== asset.source.sha256) throw new Error(`Source for ${asset.assetId} checksum changed.`)
    }
  }
  // Observe canonical tools without changing their result schema. A bound deck
  // export is gated by actual PNG review and current page/asset fingerprints.
  ctx.on('tools/execute', async (exec, next) => {
    if (bypass.has(String(exec.callId)) || !exec.agent || !['ppt_edit', 'ppt_undo', 'ppt_redo', 'ppt_check', 'ppt_render', 'ppt_export'].includes(exec.name)) return next()
    const initial = await load(exec), args = exec.arguments as any
    if (!initial || typeof args.dir !== 'string' || resolve(cwd(exec), args.dir) !== resolve(cwd(exec), initial.dir)) return next()
    return withPresentationLock(resolve(cwd(exec), initial.dir), async () => {
      const state = (await load(exec))!
      try {
        const snapshots = await sync(exec, state)
        if (exec.name === 'ppt_export') { await verifyAssets(exec, state); const blocked = exportBlockers(state); if (blocked.length) throw new Error(`Export requires current checks, rendered PNG review and matching editable objects for pages: ${blocked.join(', ')}.`) }
        const result = await next()
        if (result.isError || (result.value as any)?.ok === false) { await persist(exec, state); return result }
        const value = result.value as any
        if (['ppt_edit', 'ppt_undo', 'ppt_redo'].includes(exec.name)) await sync(exec, state)
        else if (exec.name === 'ppt_check') {
          const pages = args.pages ?? snapshots.map(page => page.page)
          for (const page of pages) if (state.pages[page]) state.pages[page]!.checks.ppt_check = { fingerprint: state.pages[page]!.fingerprint, findings: (value.issues ?? []).filter((issue: any) => issue.page === page) }
        } else if (exec.name === 'ppt_render') {
          for (const image of value.images ?? []) if (state.pages[image.page]) {
            await workspacePath(cwd(exec), image.path)
            state.pages[image.page]!.checks.ppt_render = { fingerprint: state.pages[image.page]!.fingerprint, findings: [], screenshot: image.path }
          }
        } else if (exec.name === 'ppt_export') {
          const bytes = await readFile(await workspacePath(cwd(exec), value.path))
          state.exportReceipt = { outputPath: value.path, bytes: bytes.length, sha256: hash(bytes), revision: value.revision }; state.phase = 'exported-awaiting-readback'
        }
        delete state.failure; await persist(exec, state); return result
      } catch (error) { state.failure = { stage: exec.name, message: error instanceof Error ? error.message.slice(0, 1000) : 'Presentation operation failed.', at: new Date().toISOString() }; await persist(exec, state); throw error }
    })
  })
  ctx.tools.register(defineTool({ name: 'presentation_prepare', description: 'Bind a rich content plan and asset manifest to a PPTD project. For mode=new, create the project automatically when dir does not exist. output_mode defaults to image (fast whole-page PNG PPTX); use editable only when requested.', parameters: { spec_path: { type: 'string', required: true }, manifest_path: { type: 'string', required: true }, dir: { type: 'string', required: true }, mode: { type: 'string', enum: ['new', 'edit'], required: true }, output_mode: { type: 'string', enum: ['image', 'editable'] }, changed_pages: { type: 'array', items: { type: 'integer' } } }, output, execute: async (args, exec) => {
    const root = cwd(exec), specPath = args.spec_path as string, manifestPath = args.manifest_path as string, spec = await workspacePath(root, specPath), manifest = await workspacePath(root, manifestPath), dir = await workspacePath(root, args.dir)
    const specification = await readSpecification(root, spec), visualManifest = await readManifest(root, manifest)
    const directory = resolve(root, '.zerowall', 'presentation-state'); await mkdir(directory, { recursive: true })
    const journal = await workspacePath(root, join(directory, hash(JSON.stringify({ spec, manifest, dir })) + '.json'))
    return withPresentationLock(dir, async () => {
      const outputMode = (args.output_mode ?? 'image') as OutputMode
      let state: PresentationWorkflow = { schemaVersion: 3, spec, manifest, dir, journal, mode: args.mode, outputMode, changedPages: args.changed_pages ?? [], pages: {}, phase: 'planned', provenancePath: join(dir, 'presentation-provenance.json') }
      try { const previous = JSON.parse(await readFile(journal, 'utf8')); if (previous.schemaVersion === 3) { if (args.output_mode && previous.outputMode !== args.output_mode) throw new Error('Use a separate PPTD project when changing output_mode.'); state = previous } } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      const deckPath = join(dir, 'deck.pptd')
      try { await readFile(deckPath, 'utf8') } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || args.mode !== 'new') throw error
        const created = await dispatch(exec, 'ppt_create', { dir, title: (specification as any).title ?? 'ZeroWall presentation', size: [specification.width, specification.height], metadata: { zeroWall: { spec: relative(root, spec), assetsManifest: relative(root, manifest), mode: args.mode, outputMode } } }, true)
        if (created?.ok === false) throw new Error(created.error?.message ?? 'ppt_create failed')
      }
      await project(exec, state); state.changedPages = [...new Set([...state.changedPages, ...(args.changed_pages ?? [])])]; await sync(exec, state)
      await saveJson(await workspacePath(root, state.provenancePath ?? join(state.dir, 'presentation-provenance.json')), { schemaVersion: 1, spec: relative(root, spec), assetsManifest: relative(root, manifest), mode: state.mode, outputMode: state.outputMode, assets: visualManifest.assets, pages: state.pages })
      await persist(exec, state); return JSON.stringify(state)
    })
  } }))
  ctx.tools.register(defineTool({ name: 'presentation_generate_templates', description: 'Generate complete slide PNGs concurrently using the environment image settings. Reference assets are passed to edit_image; preserve exact prompt and source hashes. Image mode uses the PNG in the final PPTX; editable mode keeps it reference-only.', parameters: { templates: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { page: { type: 'integer', required: true }, prompt: { type: 'string', required: true }, output_path: { type: 'string', required: true }, asset_id: { type: 'string', required: true }, reference_asset_ids: { type: 'array', items: { type: 'string' } } } } }, concurrency: { type: 'integer', description: 'User-selected batch limit; default 10.' } }, output, execute: async (args, exec) => {
    const state = await bound(exec), root = cwd(exec), spec = await readSpecification(root, state.spec), manifest = await readManifest(root, state.manifest)
    if (!args.templates.length || args.templates.length > 128) throw new Error('Generate 1–128 page images per batch.')
    const paths = new Set<string>(), ids = new Set<string>()
    const tasks = args.templates.map(item => {
      if (!Number.isInteger(item.page) || !spec.slides[item.page - 1]) throw new Error('Template page is outside the presentation specification.')
      if (!/^[a-zA-Z0-9][\w.-]{0,127}$/u.test(item.asset_id) || ids.has(item.asset_id)) throw new Error('Template IDs must be unique stable identifiers.')
      const path = resolve(root, item.output_path); if (paths.has(path)) throw new Error('Template output paths must be unique.'); paths.add(path); ids.add(item.asset_id)
      const references = (item.reference_asset_ids ?? []).map(id => { const asset = manifest.assets.find(asset => asset.assetId === id); if (!asset) throw new Error(`Unknown reference asset ${id}.`); return asset })
      if (references.length > 16) throw new Error('At most 16 reference assets per image request.')
      return { id: item.asset_id, page: item.page, run: async () => {
        for (const asset of references) if (hash(await readFile(await workspacePath(root, asset.path))) !== asset.sha256) throw new Error(`Reference asset ${asset.assetId} changed.`)
        const value = await dispatch(exec, references.length ? 'edit_image' : 'generate_image', { prompt: item.prompt, output_path: item.output_path, concurrency: imageConcurrency(args.concurrency), ...(references.length ? { input_paths: references.map(asset => asset.path) } : {}) })
        const registered = await recordVisualAssets(root, [{ manifest: state.manifest, image: value.path, assetId: item.asset_id, role: state.outputMode === 'image' ? 'slide-image' : 'template', sourceKind: 'generated', slideNumber: item.page, ...(item.reference_asset_ids === undefined ? {} : { styleReferenceIds: item.reference_asset_ids }) }])
        return { page: item.page, asset: registered.assets[0], generated: value }
      } }
    })
    return JSON.stringify({ templates: await runPresentationImageTasks(tasks, imageConcurrency(args.concurrency)) })
  } }))
  ctx.tools.register(defineTool({ name: 'presentation_plan_editable_pages', description: 'Persist native PPTD element plans (elementId, elementType, bounds plus complete text/shape/line/image/table/chart fields). Images reference registered asset IDs using src. No whole-page bitmap can satisfy an editable page.', parameters: { plans: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { page: { type: 'integer', required: true }, template_asset_id: { type: 'string' }, elements: { type: 'array', required: true, items: { type: 'json' } } } } } }, output, execute: async (args, exec) => {
    const initial = await bound(exec)
    return withPresentationLock(initial.dir, async () => {
      const state = (await load(exec))!, spec = await readSpecification(cwd(exec), state.spec)
      if (state.outputMode !== 'editable') throw new Error('Set output_mode=editable in presentation_prepare for an editable project.')
      state.templatePlans ??= {}
      for (const plan of args.plans) { if (!spec.slides[plan.page - 1]) throw new Error('Page is outside the specification.'); state.templatePlans[plan.page] = validateEditablePagePlan(plan.page, plan.elements as Record<string, any>[], plan.template_asset_id) }
      state.phase = 'planned-editable'; await persist(exec, state); return JSON.stringify(state.templatePlans)
    })
  } }))
  ctx.tools.register(defineTool({ name: 'presentation_record_asset', description: 'Register a generated, literature, project/user or derived image with exact source provenance and generation receipt.', parameters: { manifest_path: { type: 'string', required: true }, ...assetParameters }, output, execute: async (args, exec) => JSON.stringify(await recordVisualAssets(cwd(exec), [assetInput(args.manifest_path, args)])) }))
  ctx.tools.register(defineTool({ name: 'presentation_record_assets', description: 'Atomically register up to 128 images. Preserve source file/page/figure/citation/hash and target slides; generated images retain original prompt.', parameters: { manifest_path: { type: 'string', required: true }, assets: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: assetParameters } } }, output, isConcurrencySafe: () => true, execute: async (args, exec) => JSON.stringify(await recordVisualAssets(cwd(exec), args.assets.map(item => assetInput(args.manifest_path, item)))) }))
  ctx.tools.register(defineTool({ name: 'presentation_build_pages', description: 'Build selected PPTD pages through ppt_edit. Image mode uses one complete PNG per page; editable mode uses planned native objects. Copies original scientific images byte-for-byte into media, and writes prompt/source provenance to notes and PPTD manifest.', parameters: { pages: { type: 'array', items: { type: 'integer' } } }, output, execute: async (args, exec) => {
    const initial = await bound(exec)
    return withPresentationLock(initial.dir, async () => {
      const state = (await load(exec))!, root = cwd(exec), spec = await readSpecification(root, state.spec), assetsManifest = await readManifest(root, state.manifest), current = await project(exec, state)
      const pages = [...new Set(args.pages ?? spec.slides.map((_, i) => i + 1))].sort((a, b) => a - b), ops: any[] = [], receipts: any[] = []
      await mkdir(join(current.dir, 'media'), { recursive: true })
      for (const page of pages) {
        const slide = spec.slides[page - 1]; if (!slide) throw new Error('Page is outside the specification.')
        await verifyAssets(exec, state, page)
        const assets = assetsForPage(spec, assetsManifest, page), allAssets = [...assets]
        // A generated whole-page image is bound to its target page in the
        // manifest. Keep image mode resilient when a caller wrote the spec
        // before the generation receipt was registered and forgot to append
        // the new assetId to slide.assetIds.
        if (state.outputMode === 'image' && !allAssets.some(asset => asset.role === 'slide-image')) {
          const fallback = assetsManifest.assets.find(asset => asset.role === 'slide-image'
            && (asset.slideNumber === page || asset.slideNumbers?.includes(page)))
          if (fallback) {
            if (hash(await readFile(await workspacePath(root, fallback.path))) !== fallback.sha256) {
              throw new Error(`Asset ${fallback.assetId} checksum changed.`)
            }
            allAssets.push(fallback)
          }
        }
        for (const asset of assets) for (const id of asset.styleReferenceIds) { const ref = assetsManifest.assets.find(item => item.assetId === id); if (ref && !allAssets.includes(ref)) allAssets.push(ref) }
        const media = new Map<string, string>()
        for (const asset of allAssets) { const target = `media/${asset.assetId}-${asset.sha256.slice(0, 12)}${extname(asset.path)}`; await copyFile(await workspacePath(root, asset.path), await workspacePath(root, join(current.dir, target))); media.set(asset.assetId, target) }
        let elements: Record<string, any>[]
        if (state.outputMode === 'image') {
          const image = allAssets.find(asset => asset.role === 'slide-image')
          if (!image) throw new Error(`Page ${page}: generate and reference a slide-image asset first.`)
          elements = [{ elementId: `slide-image-${page}`, elementType: 'image', bounds: [0, 0, spec.width, spec.height], src: media.get(image.assetId), fit: { mode: 'contain' } }]
        } else {
          const plan = state.templatePlans?.[page]; if (!plan) throw new Error(`Page ${page}: save the native editable plan first.`)
          elements = structuredClone(plan.elements)
          if (!elements.some(element => ['text', 'shape', 'line', 'table', 'chart'].includes(element.elementType))) throw new Error('An editable page requires native editable objects, not only images.')
          for (const element of elements) if (element.elementType === 'image') { const asset = assets.find(asset => asset.assetId === element.src || asset.path === element.src); if (!asset) throw new Error(`Image ${element.elementId} must reference a registered page asset.`); element.src = media.get(asset.assetId) }
        }
        const content = { elements, notes: notes(slide.notes, allAssets, page), ...(slide.background === undefined ? {} : { background: slide.background }) }
        const existing = current.snapshots[page - 1]
        if (!existing && page > current.snapshots.length + ops.filter(op => op.op === 'add_page').length + 1) throw new Error('Build new pages in contiguous order.')
        ops.push(existing ? { op: 'update_page', page: existing.id, patch: content } : { op: 'add_page', page: `pages/${String(page).padStart(2, '0')}.page`, content })
        receipts.push({ page, assets: provenance(allAssets, page) })
      }
      const result = await dispatch(exec, 'ppt_edit', { dir: state.dir, baseRevision: current.manifest.revision, ops }, true)
      const next = await sync(exec, state)
      await saveJson(await workspacePath(root, state.provenancePath ?? join(state.dir, 'presentation-provenance.json')), { schemaVersion: 1, spec: relative(root, state.spec), assetsManifest: relative(root, state.manifest), mode: state.mode, outputMode: state.outputMode, pages: receipts, snapshots: next.map(page => ({ page: page.page, id: page.id, fingerprint: page.fingerprint })) })
      state.phase = 'built'; delete state.failure; await persist(exec, state); return JSON.stringify(result)
    })
  } }))
  ctx.tools.register(defineTool({ name: 'presentation_check_pages', description: 'Run ppt_check and ppt_render for selected pages. Returns actual final-PPTX PNGs; view them before recording reviews. Reuses accepted unchanged page renders.', parameters: { pages: { type: 'array', items: { type: 'integer' } } }, output, execute: async (args, exec) => {
    const state = await bound(exec), snapshots = await sync(exec, state), pages = args.pages ?? snapshots.map(page => page.page)
    const check = await dispatch(exec, 'ppt_check', { dir: state.dir, pages }), render = await dispatch(exec, 'ppt_render', { dir: state.dir, pages }), latest = (await load(exec))!
    return JSON.stringify({ check, render, presentationFindings: findings(latest, pages), state: latest })
  } }))
  async function reviewMany(exec: Exec, reviews: { kind: string; target: string; observations: string; waivers?: string[] }[]) {
    const initial = await bound(exec)
    return withPresentationLock(initial.dir, async () => {
      const state = (await load(exec))!; await sync(exec, state)
      for (const review of reviews) {
        if (review.observations.trim().length < 20) throw new Error('Record concrete observations from the actual image.')
        if (review.kind === 'asset') await recordAssetReview(cwd(exec), state.manifest, 'asset', review.target, review.observations)
        else { const entry = state.pages[review.target]; if (!entry || !entry.checks.ppt_render?.screenshot || ['ppt_check', 'ppt_render'].some(name => entry.checks[name]?.fingerprint !== entry.fingerprint)) throw new Error('Current checks and an actual returned PNG are required before page review.'); entry.review = { fingerprint: entry.fingerprint, observations: review.observations, waivers: review.waivers ?? [] } }
      }
      state.phase = 'reviewed'; await persist(exec, state)
    })
  }
  const reviewParameters = { kind: { type: 'string' as const, enum: ['asset', 'page'] as const, required: true as const }, target: { type: 'string' as const, required: true as const }, observations: { type: 'string' as const, required: true as const }, waivers: { type: 'array' as const, items: { type: 'string' as const } } }
  ctx.tools.register(defineTool({ name: 'presentation_record_review', description: 'Record concrete observations after viewing an actual image or final rendered page.', parameters: reviewParameters, output, execute: async (args, exec) => { await reviewMany(exec, [args as any]); return 'Visual observations recorded.' } }))
  ctx.tools.register(defineTool({ name: 'presentation_record_reviews', description: 'Record actual visual observations for several assets or page revisions.', parameters: { reviews: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: reviewParameters } } }, output, execute: async (args, exec) => { await reviewMany(exec, args.reviews as any); return 'Visual observations recorded.' } }))
  ctx.tools.register(defineTool({ name: 'presentation_status', description: 'Resume a saved PPTD workflow: show current checks, reviews, findings, export receipt, reconstruction failures and blocked pages.', parameters: {}, output, execute: async (_, exec) => { const state = await load(exec); if (state) { await sync(exec, state); await persist(exec, state) } return JSON.stringify({ state, presentationFindings: state ? findings(state) : [], blockedPages: state ? exportBlockers(state) : [] }) } }))
}
