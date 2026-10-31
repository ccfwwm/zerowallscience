import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, realpath } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
import { parse } from 'yaml'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolRunContext, type ToolDispatchExecution } from '@deepseek-ai/dsh-tools'
import { assetsForPage, assetsWithReferences, hash, pageStyle, readManifest, readSpecification, recordAssetReview, recordTemplateReview, recordVisualAssets, requireTemplateReview, saveJson, templateFailure, withPresentationLock, workspacePath, type AssetInput, type VisualAsset, type VisualManifest, type TemplateReview } from './visual-assets.js'
import { DEFAULT_IMAGE_CONCURRENCY, imageConcurrency } from './image-concurrency.js'

type Exec = ToolRunContext | ToolDispatchExecution
type OutputMode = 'image' | 'editable'
export interface PageSnapshot { page: number; id: string; fingerprint: string; data: Record<string, any> }
type Check = { fingerprint: string; findings: any[]; screenshot?: string; screenshotHash?: string }
export interface PresentationWorkflow {
  schemaVersion: 3; spec: string; manifest: string; mode: 'new' | 'edit'; outputMode: OutputMode; dir: string; journal: string
  changedPages: number[]; pages: Record<string, { id: string; fingerprint: string; checks: Record<string, Check>; review?: { fingerprint: string; observations: string; waivers: string[] } }>
  phase: string; templatePlans?: Record<string, EditablePagePlan>; reconstructionFailures?: Record<string, string[]>
  failure?: { stage: string; message: string; at: string }; exportReceipt?: { outputPath: string; bytes: number; sha256: string; revision: number }
  provenancePath?: string
  pageJobs?: Record<string, PageJob>
}
export interface PageJob {
  taskId: string; runId: string; page: number; status: 'queued' | 'generating' | 'building' | 'checking' | 'rendering' | 'awaiting-editable' | 'complete' | 'failed' | 'interrupted'
  input: { prompt: string; originalPrompt: string; stylePrompt: string; outputPath: string; assetId: string; references: { assetId: string; path: string; sha256: string }[]; parentAssetId?: string }
  concurrency: number; specFingerprint: string; updatedAt: string; asset?: VisualAsset; generated?: unknown; error?: string | undefined; revision?: number; builtFingerprint?: string
}
export interface EditablePagePlan { page: number; templateAssetId?: string; elements: Record<string, any>[]; createdAt: string }
export interface PresentationImageTask<T = unknown> { id: string; page: number; run: () => Promise<T> }
declare module '@deepseek-ai/dsh-session/types' { interface SessionEventMap { 'zerowall/presentation-workflow': Pick<PresentationWorkflow, 'schemaVersion' | 'journal' | 'dir' | 'phase'> } }

export async function runPresentationImageTasks<T>(tasks: PresentationImageTask<T>[], concurrency = DEFAULT_IMAGE_CONCURRENCY): Promise<T[]> {
  imageConcurrency(concurrency)
  if (new Set(tasks.map(task => task.id)).size !== tasks.length) throw new Error('Presentation image task IDs must be unique.')
  const results = new Array<T>(tasks.length), cursor = { value: 0 }
  async function worker(): Promise<void> { for (;;) { const index = cursor.value++; if (index >= tasks.length) return; try { results[index] = await tasks[index]!.run() } catch (error) { results[index] = { page: tasks[index]!.page, error: error instanceof Error ? error.message : String(error) } as T } } }
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
  state.changedPages = state.changedPages.filter(page => snapshots.some(snapshot => snapshot.page === page))
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
export function exportRequirements(state: PresentationWorkflow) {
  return exportBlockers(state).map(page => {
    const entry = state.pages[page], current = entry?.fingerprint
    return { page, missingChecks: !entry || entry.checks.ppt_check?.fingerprint !== current,
      missingRender: !entry || entry.checks.ppt_render?.fingerprint !== current || !entry.checks.ppt_render?.screenshot,
      missingReview: !entry || entry.review?.fingerprint !== current,
      blockers: (entry?.checks.ppt_check?.findings ?? []).filter(finding => finding.severity === 'blocker').length,
      unreviewedFindings: (entry?.checks.ppt_check?.findings ?? []).filter(finding => finding.severity !== 'blocker' && !entry?.review?.waivers.includes(hash(JSON.stringify(finding)))).length,
      reconstructionFailures: state.reconstructionFailures?.[page] ?? [] }
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
function workflowView(state: PresentationWorkflow) {
  return { schemaVersion: state.schemaVersion, spec: state.spec, manifest: state.manifest, dir: state.dir, journal: state.journal, mode: state.mode, outputMode: state.outputMode, phase: state.phase, changedPages: state.changedPages,
    pageJobs: state.pageJobs, failure: state.failure, exportReceipt: state.exportReceipt, provenancePath: state.provenancePath,
    pages: Object.fromEntries(Object.entries(state.pages).map(([page, entry]) => [page, { id: entry.id, fingerprint: entry.fingerprint,
      checkCurrent: entry.checks.ppt_check?.fingerprint === entry.fingerprint, renderCurrent: entry.checks.ppt_render?.fingerprint === entry.fingerprint,
      screenshot: entry.checks.ppt_render?.screenshot, reviewCurrent: entry.review?.fingerprint === entry.fingerprint, findingCount: entry.checks.ppt_check?.findings.length ?? 0 }])) }
}
function findingsView(state: PresentationWorkflow, pages: number[], offset = 0, limit = 100) {
  const all = findings(state, pages)
  return { presentationFindings: all.slice(offset, offset + limit), findingCount: all.length, findingOffset: offset, nextFindingOffset: offset + limit < all.length ? offset + limit : null }
}
function provenance(assets: VisualAsset[], page: number) { return assets.map(asset => ({ ...asset, targetPage: page })) }
function notes(userNotes: unknown, assets: VisualAsset[], page: number): string { return `${typeof userNotes === 'string' ? userNotes : ''}\n\n[ZeroWall provenance]\n${JSON.stringify(provenance(assets, page), null, 2)}` }
function pageTemplate(manifest: VisualManifest, page: number, mode: OutputMode, plannedId?: string): VisualAsset | undefined {
  return plannedId ? manifest.assets.find(asset => asset.assetId === plannedId && ['template', 'slide-image'].includes(asset.role))
    : manifest.assets.findLast(asset => asset.role === (mode === 'image' ? 'slide-image' : 'template') && (asset.slideNumber === page || asset.slideNumbers?.includes(page)))
}
function referencedPageAssets(spec: Parameters<typeof assetsForPage>[0], manifest: VisualManifest, state: PresentationWorkflow, page: number): VisualAsset[] {
  const assets = assetsForPage(spec, manifest, page), template = pageTemplate(manifest, page, state.outputMode, state.templatePlans?.[page]?.templateAssetId)
  return assetsWithReferences(manifest, template ? [...assets, template] : assets)
}
async function requirePageTemplateReview(root: string, specification: { slides: Record<string, any>[] }, manifest: VisualManifest, asset: VisualAsset, page: number): Promise<TemplateReview> {
  const review = await requireTemplateReview(root, manifest, asset)
  if (review.page !== page || review.specFingerprint !== hash(JSON.stringify(specification.slides[page - 1])) || JSON.stringify(review.textTranscription) !== JSON.stringify(specification.slides[page - 1]?.text)) throw new Error(`Page ${page}: template review does not match the current specification text; view and review the actual PNG again.`)
  return review
}
export function factualImagePlacements(slide: Record<string, any>, assets: VisualAsset[], width: number, height: number): { asset: VisualAsset; bounds: number[] }[] {
  if (slide.assetPlacements !== undefined && !Array.isArray(slide.assetPlacements)) throw new Error('assetPlacements must be an array of explicit assetId/bounds entries.')
  return assets.filter(asset => asset.sourceKind === 'literature' || asset.sourceKind === 'user').map(asset => {
    const matches = (slide.assetPlacements ?? []).filter((item: any) => item.assetId === asset.assetId)
    const bounds = matches[0]?.bounds
    if (matches.length !== 1 || !Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite) || bounds[0] < 0 || bounds[1] < 0 || bounds[2] <= 0 || bounds[3] <= 0 || bounds[0] + bounds[2] > width || bounds[1] + bounds[3] > height) throw new Error(`Fact image ${asset.assetId} requires one explicit in-bounds assetPlacements entry; original images cannot be redrawn or silently omitted.`)
    return { asset, bounds }
  })
}

export function installPresentationWorkflow(ctx: Context): void {
  const bypass = new Set<string>()
  const runId = randomUUID(), activePages = new Set<string>(), shutdown = new AbortController()
  ctx.effect(() => () => { shutdown.abort(new Error('Presentation host stopped. Resume selected interrupted pages manually.')); bypass.clear() })
  function cwd(exec: Exec): string { const value = exec.agent?.session.header.cwd; if (!value) throw new Error('Presentation requires an authorized workspace.'); return value }
  async function load(exec: Exec): Promise<PresentationWorkflow | undefined> {
    const events = exec.agent?.session.snapshotEvents() as readonly { type: string; data: any }[] | undefined, event = events?.filter(item => item.type === EVENT).at(-1)?.data
    if (event?.schemaVersion !== 3) return undefined
    const state = JSON.parse(await readFile(await workspacePath(cwd(exec), event.journal), 'utf8')) as PresentationWorkflow
    for (const job of Object.values(state.pageJobs ?? {})) if (!['complete', 'failed', 'interrupted', 'awaiting-editable'].includes(job.status) && job.runId !== runId) {
      job.status = 'interrupted'; job.error = 'Host restarted; select this page explicitly with presentation_resume_pages.'
    }
    return state
  }
  function bindingMatches(state: PresentationWorkflow | undefined, expected: PresentationWorkflow): state is PresentationWorkflow {
    // journal is derived from the spec, asset-manifest and project paths;
    // the lightweight session event intentionally carries only this identity.
    return state?.journal === expected.journal && state.dir === expected.dir
  }
  async function currentBinding(exec: Exec, expected: PresentationWorkflow): Promise<PresentationWorkflow> {
    const state = await load(exec)
    if (!bindingMatches(state, expected)) throw new Error('Presentation binding changed while the operation was running. Resume the current project with presentation_status.')
    return state
  }
  async function persist(exec: Exec, state: PresentationWorkflow, activate = false): Promise<void> {
    await saveJson(await workspacePath(cwd(exec), state.journal), state)
    // The journal is the durable authority. Repeating thousands of findings
    // and complete editable plans in every session event grows model context.
    // Only prepare intentionally changes the session binding. An older in-flight
    // operation can finish after prepare selected another journal; it must not
    // make that old project current again by appending a late pointer event.
    const latest = exec.agent?.session.snapshotEvents().filter(item => item.type === EVENT).at(-1)?.data as PresentationWorkflow | undefined
    if (activate || bindingMatches(latest, state)) exec.agent?.session.append(EVENT, { schemaVersion: state.schemaVersion, journal: state.journal, dir: state.dir, phase: state.phase }, { ignorable: true })
  }
  async function dispatch(exec: Exec, name: string, args: any, internal = false): Promise<any> {
    const callId = `presentation-${randomUUID()}` as any
    if (internal) bypass.add(String(callId))
    try {
      const result = await ctx.tools.execute({ callId, name, arguments: args, ...(exec.agent ? { agent: exec.agent } : {}), parent: exec.token, signal: exec.signal, rootCallId: exec.rootCallId })
      if (result.isError) throw new Error(`${name}: ${result.error.message}`)
      const value: any = result.value
      if (value?.ok === false) throw new Error(`${name}: ${value.error?.message ?? 'tool returned failure'}`)
      if ('deferContext' in exec && typeof exec.deferContext === 'function') for (const context of result.additionalContexts ?? []) exec.deferContext(context)
      return value
    } finally { bypass.delete(String(callId)) }
  }
  async function project(exec: Exec, state: PresentationWorkflow) {
    const root = cwd(exec), dir = await workspacePath(root, state.dir), deckPath = await workspacePath(root, join(dir, 'deck.pptd'))
    const raw = await readFile(deckPath, 'utf8'), deck = parse(raw), manifest = JSON.parse(await readFile(await workspacePath(root, join(dir, 'manifest.json')), 'utf8'))
    const snapshots: PageSnapshot[] = await Promise.all((deck.pages as string[]).map(async (path, index) => {
      const pageRaw = await readFile(await workspacePath(root, join(dir, path)), 'utf8')
      const { pages: _pages, ...settings } = deck
      return { page: index + 1, id: path, fingerprint: hash(JSON.stringify(settings) + pageRaw), data: parse(pageRaw) }
    }))
    return { dir, deck, manifest, snapshots }
  }
  async function sync(exec: Exec, state: PresentationWorkflow): Promise<PageSnapshot[]> {
    const current = await project(exec, state), spec = await readSpecification(cwd(exec), state.spec), manifest = await readManifest(cwd(exec), state.manifest), dependencies: Record<string, string> = {}
    for (const page of current.snapshots) dependencies[page.page] = JSON.stringify({ plan: spec.slides[page.page - 1], style: spec.slides[page.page - 1] ? pageStyle(spec, page.page) : undefined, editablePlan: state.templatePlans?.[page.page], assets: referencedPageAssets(spec, manifest, state, page.page).map(asset => ({ id: asset.assetId, sha256: asset.sha256, prompt: asset.prompt, source: asset.source })) })
    refreshPages(state, current.snapshots, dependencies)
    state.reconstructionFailures = Object.fromEntries(Object.values(state.templatePlans ?? {}).map(plan => [plan.page, current.snapshots[plan.page - 1] ? editableReconstructionFailures(current.snapshots[plan.page - 1]!, plan) : ['Planned page is missing.']]))
    return current.snapshots
  }
  async function bound(exec: Exec): Promise<PresentationWorkflow> { const state = await load(exec); if (!state) throw new Error('Call presentation_prepare with dir first.'); return state }
  async function updateJob(exec: Exec, initial: PresentationWorkflow, page: number, patch: Partial<PageJob>): Promise<PageJob> {
    return withPresentationLock(initial.dir, async () => {
      const state = await currentBinding(exec, initial), job = state.pageJobs?.[page]
      if (!job) throw new Error('Page task no longer exists.')
      Object.assign(job, patch, { updatedAt: new Date().toISOString() })
      await persist(exec, state); return structuredClone(job)
    })
  }
  function launchPages(exec: Exec, initial: PresentationWorkflow, jobs: PageJob[]) {
    const background = { ...exec, signal: shutdown.signal, token: undefined, rootCallId: undefined } as unknown as Exec
    if ('deferContext' in background) delete (background as any).deferContext
    const tasks = jobs.map(job => {
      const key = `${initial.journal}:${job.page}`
      activePages.add(key)
      return { id: job.input.assetId, page: job.page, run: async () => {
        try {
          const root = cwd(background), input = job.input
          const spec = await readSpecification(root, initial.spec)
          if (hash(JSON.stringify({ slide: spec.slides[job.page - 1], style: pageStyle(spec, job.page) })) !== job.specFingerprint) throw new Error('Page plan/style changed; queue a new selected-page task.')
          for (const reference of input.references) if (hash(await readFile(await workspacePath(root, reference.path))) !== reference.sha256) throw new Error(`Reference asset ${reference.assetId} changed.`)
          let generated: any = job.generated, asset = job.asset
          if (!asset) {
            await updateJob(background, initial, job.page, { status: 'generating', error: undefined })
            // A crash after the provider wrote its receipt must not charge for the same image again.
            try {
              const target = await workspacePath(root, input.outputPath)
              const receipt = JSON.parse(await readFile(target + '.generation.json', 'utf8'))
              if (receipt.prompt === input.prompt && receipt.sha256 === hash(await readFile(target)) && JSON.stringify(receipt.inputImageHashes ?? []) === JSON.stringify(input.references.map(reference => reference.sha256))) generated = { path: target, recovered: true }
            } catch { /* no completed generation to recover */ }
            generated ??= await dispatch(background, input.references.length ? 'edit_image' : 'generate_image', { prompt: input.prompt, output_path: input.outputPath, concurrency: job.concurrency, ...(input.references.length ? { input_paths: input.references.map(reference => reference.path) } : {}) })
            const generation = JSON.parse(await readFile(await workspacePath(root, generated.path + '.generation.json'), 'utf8'))
            if (JSON.stringify(generation.inputImageHashes ?? []) !== JSON.stringify(input.references.map(reference => reference.sha256))) throw new Error('Image receipt must bind the referenced original images.')
            if (input.parentAssetId && generation.sha256 === input.references.find(reference => reference.assetId === input.parentAssetId)?.sha256) throw new Error('Image repair must contain changed image bytes.')
            asset = (await recordVisualAssets(root, [{ manifest: initial.manifest, image: generated.path, assetId: input.assetId, role: initial.outputMode === 'image' ? 'slide-image' : 'template', sourceKind: 'generated', slideNumber: job.page,
              styleReferenceIds: input.references.map(reference => reference.assetId), originalPrompt: input.originalPrompt, combinedPrompt: input.prompt, stylePrompt: input.stylePrompt, referenceImageHashes: input.references.map(reference => reference.sha256), ...(input.parentAssetId ? { parentAssetId: input.parentAssetId } : {}) }])).assets[0]!
            await updateJob(background, initial, job.page, { asset, generated, status: 'building' })
          }
          if (hash(await readFile(asset.path)) !== asset.sha256) throw new Error('Completed page asset changed; select a new generation explicitly.')
          const state = await currentBinding(background, initial)
          if (state.outputMode === 'editable' && state.templatePlans?.[job.page]?.templateAssetId !== asset.assetId) {
            await updateJob(background, initial, job.page, { status: 'awaiting-editable' }); return
          }
          await updateJob(background, initial, job.page, { status: 'building' })
          const before = await project(background, state)
          if (job.builtFingerprint && before.snapshots[job.page - 1]?.fingerprint !== job.builtFingerprint) throw new Error('Page changed after this task wrote it; queue a new selected-page edit to preserve your version.')
          const built = job.builtFingerprint ? { revision: job.revision } : JSON.parse(await dispatch(background, 'presentation_build_pages', { pages: [job.page] }))
          const after = await project(background, state)
          await updateJob(background, initial, job.page, { status: 'checking', revision: built.revision, builtFingerprint: after.snapshots[job.page - 1]!.fingerprint })
          await dispatch(background, 'ppt_check', { dir: initial.dir, pages: [job.page] })
          await updateJob(background, initial, job.page, { status: 'rendering' })
          await dispatch(background, 'ppt_render', { dir: initial.dir, pages: [job.page] })
          await updateJob(background, initial, job.page, { status: 'complete' })
        } catch (error) {
          await updateJob(background, initial, job.page, { status: shutdown.signal.aborted ? 'interrupted' : 'failed', error: error instanceof Error ? error.message : String(error) }).catch(() => {})
        } finally { activePages.delete(key) }
      } }
    })
    void runPresentationImageTasks(tasks, jobs[0]?.concurrency).catch(() => {})
  }
  async function verifyAssets(exec: Exec, state: PresentationWorkflow, page?: number) {
    const root = cwd(exec), spec = await readSpecification(root, state.spec), manifest = await readManifest(root, state.manifest)
    const verified = new Map<string, string>()
    async function verify(path: string, expected: string | undefined, message: string) {
      const target = await workspacePath(root, path)
      let actual = verified.get(target)
      if (!actual) { actual = hash(await readFile(target)); verified.set(target, actual) }
      if (actual !== expected) throw new Error(message)
    }
    for (const number of page === undefined ? spec.slides.map((_, i) => i + 1) : [page]) for (const asset of referencedPageAssets(spec, manifest, state, number)) {
      await verify(asset.path, asset.sha256, `Asset ${asset.assetId} checksum changed.`)
      if (asset.source?.path) await verify(asset.source.path, asset.source.sha256, `Source for ${asset.assetId} checksum changed.`)
    }
  }
  async function currentScreenshot(exec: Exec, check: Check | undefined): Promise<boolean> {
    if (!check?.screenshot) return false
    try {
      const actual = hash(await readFile(await workspacePath(cwd(exec), check.screenshot)))
      return !check.screenshotHash || check.screenshotHash === actual
    } catch { return false }
  }
  // Observe page changes/checks without altering canonical tool results.
  ctx.on('tools/execute', async (exec, next) => {
    // Export never depends on source journals, reviews or a running page transaction.
    if (exec.name === 'ppt_export') return next()
    if (bypass.has(String(exec.callId)) || !exec.agent || !['ppt_edit', 'ppt_undo', 'ppt_redo', 'ppt_check', 'ppt_render'].includes(exec.name)) return next()
    const initial = await load(exec), args = exec.arguments as any
    if (!initial || typeof args.dir !== 'string' || resolve(cwd(exec), args.dir) !== resolve(cwd(exec), initial.dir)) return next()
    const lock = resolve(cwd(exec), initial.dir)
    if (exec.name === 'ppt_check' || exec.name === 'ppt_render') {
      // Converters run outside the journal lock. Commit only evidence for the
      // exact page snapshot that was checked, retaining simultaneous results.
      const fingerprints = await withPresentationLock(lock, async () => {
        const state = await load(exec)
        if (!bindingMatches(state, initial)) return null
        await sync(exec, state); await persist(exec, state)
        return Object.fromEntries(Object.entries(state.pages).map(([page, entry]) => [page, entry.fingerprint]))
      })
      if (!fingerprints) return next()
      try {
        const result = await next()
        return await withPresentationLock(lock, async () => {
          const state = await load(exec)
          if (!bindingMatches(state, initial)) return result
          await sync(exec, state)
          if (!result.isError && (result.value as any)?.ok !== false) {
            const value = result.value as any
            if (exec.name === 'ppt_check') {
              for (const page of args.pages ?? Object.keys(fingerprints).map(Number)) if (state.pages[page]?.fingerprint === fingerprints[page])
                state.pages[page]!.checks.ppt_check = { fingerprint: fingerprints[page]!, findings: (value.issues ?? []).filter((issue: any) => issue.page === page) }
            } else for (const image of value.images ?? []) if (state.pages[image.page]?.fingerprint === fingerprints[image.page]) {
              const screenshot = await workspacePath(cwd(exec), image.path)
              const entry = state.pages[image.page]!, screenshotHash = hash(await readFile(screenshot))
              if (entry.checks.ppt_render?.screenshotHash && entry.checks.ppt_render.screenshotHash !== screenshotHash) delete entry.review
              entry.checks.ppt_render = { fingerprint: fingerprints[image.page]!, findings: [], screenshot: image.path, screenshotHash }
            }
            delete state.failure
          }
          await persist(exec, state); return result
        })
      } catch (error) {
        await withPresentationLock(lock, async () => {
          const state = await load(exec)
          if (!bindingMatches(state, initial)) return
          state.failure = { stage: exec.name, message: error instanceof Error ? error.message.slice(0, 1000) : 'Presentation operation failed.', at: new Date().toISOString() }
          await persist(exec, state)
        })
        throw error
      }
    }
    return withPresentationLock(lock, async () => {
      const state = await load(exec)
      if (!bindingMatches(state, initial)) return next()
      try {
        await sync(exec, state)
        const result = await next()
        if (result.isError || (result.value as any)?.ok === false) { await persist(exec, state); return result }
        if (['ppt_edit', 'ppt_undo', 'ppt_redo'].includes(exec.name)) await sync(exec, state)
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
      const provenanceFile = await workspacePath(root, state.provenancePath ?? join(state.dir, 'presentation-provenance.json'))
      let prior: any = {}
      try { prior = JSON.parse(await readFile(provenanceFile, 'utf8')) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      await saveJson(provenanceFile, { ...prior, schemaVersion: 2, workspaceRoot: await realpath(root), specificationFingerprint: hash(JSON.stringify(specification)), spec: relative(root, spec), assetsManifest: relative(root, manifest), mode: state.mode, outputMode: state.outputMode,
        requiredTemplatePages: state.mode === 'new' ? specification.slides.map((_, index) => index + 1) : prior.requiredTemplatePages ?? [], templateReviews: prior.templateReviews ?? [], assets: visualManifest.assets })
      await persist(exec, state, true); return JSON.stringify(workflowView(state))
    })
  } }))
  const templateReviewParameters = {
    asset_id: { type: 'string' as const, required: true as const }, expected_sha256: { type: 'string' as const, required: true as const },
    status: { type: 'string' as const, enum: ['passed', 'repair-required'] as const, required: true as const },
    text_integrity: { type: 'string' as const, enum: ['pass', 'fail'] as const, required: true as const }, layout: { type: 'string' as const, enum: ['pass', 'fail'] as const, required: true as const },
    content_accuracy: { type: 'string' as const, enum: ['pass', 'fail'] as const, required: true as const }, observations: { type: 'string' as const, required: true as const }, issues: { type: 'array' as const, items: { type: 'string' as const }, required: true as const },
    text_transcription: { type: 'array' as const, items: { type: 'string' as const }, required: true as const, description: 'Transcribe the actual visible text after viewing PNG at full resolution. A text pass must match slides[page-1].text verbatim; do not copy expected text without viewing.' },
  }
  ctx.tools.register(defineTool({ name: 'presentation_review_templates', description: 'After viewing each actual full-slide image, record SHA-bound checks for garbled/missing text, layout and factual content. Any failing check requires image repair and a new review; generic asset/page reviews cannot pass this gate.', parameters: { reviews: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: templateReviewParameters } } }, output, execute: async (args, exec) => {
    const initial = await bound(exec)
    return withPresentationLock(initial.dir, async () => {
      const state = await currentBinding(exec, initial), spec = await readSpecification(cwd(exec), state.spec), manifest = await readManifest(cwd(exec), state.manifest)
      if (!args.reviews.length || args.reviews.length > 128) throw new Error('Review 1–128 full-slide images per batch.')
      const reviews = []
      const provenanceFile = await workspacePath(cwd(exec), state.provenancePath ?? join(state.dir, 'presentation-provenance.json'))
      const evidence = JSON.parse(await readFile(provenanceFile, 'utf8'))
      for (const item of args.reviews) {
        const asset = manifest.assets.find(asset => asset.assetId === item.asset_id), page = asset?.slideNumber ?? asset?.slideNumbers?.[0]
        const slide = page ? spec.slides[page - 1] : undefined
        if (!page || !slide || !Array.isArray(slide.text) || slide.text.some(text => typeof text !== 'string')) throw new Error('Full-slide review requires its page and verbatim slides[].text in the specification (use [] only for textless pages).')
        if (item.text_integrity === 'pass' && JSON.stringify(item.text_transcription) !== JSON.stringify(slide.text)) throw new Error('Transcribed image text differs from the specification; mark text_integrity=fail and repair the image.')
        const review = await recordTemplateReview(cwd(exec), state.manifest, item.asset_id, item.expected_sha256, { status: item.status, textIntegrity: item.text_integrity, layout: item.layout, contentAccuracy: item.content_accuracy, observations: item.observations, issues: item.issues, page, specFingerprint: hash(JSON.stringify(slide)), textTranscription: item.text_transcription })
        reviews.push(review)
        // The workbench HTTP export reads project-local evidence, so a new
        // failure must invalidate an older pass there as well as in the ledger.
        for (const receipt of evidence.templateReviews ?? []) if (receipt.assetSha256 === review.sha256 && (review.status === 'repair-required' || receipt.assetId === item.asset_id)) receipt.review = review
        await saveJson(provenanceFile, evidence)
      }
      return JSON.stringify({ reviews })
    })
  } }))
  ctx.tools.register(defineTool({ name: 'presentation_repair_templates', description: 'Modify one or more selected full-slide images using edit_image. Queue independent page tasks; preserve old images, prompts and PPT revisions. Works for normal edits and failed-image repair. Other pages are reused.', parameters: { repairs: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { asset_id: { type: 'string', required: true }, expected_sha256: { type: 'string', required: true }, prompt: { type: 'string', required: true }, output_path: { type: 'string', required: true }, new_asset_id: { type: 'string', required: true } } } }, concurrency: { type: 'integer' } }, output, execute: async (args, exec) => {
    const state = await bound(exec), manifest = await readManifest(cwd(exec), state.manifest)
    return queueTemplates(exec, args.repairs.map(item => {
      const asset = manifest.assets.find(asset => asset.assetId === item.asset_id)
      if (!asset || !['slide-image', 'template'].includes(asset.role) || asset.sha256 !== item.expected_sha256) throw new Error('Select a current full-slide image and its SHA-256.')
      return { page: asset.slideNumber ?? asset.slideNumbers?.[0] ?? 1, prompt: item.prompt, output_path: item.output_path, asset_id: item.new_asset_id, reference_asset_ids: [asset.assetId], parent_asset_id: asset.assetId }
    }), args.concurrency)
  } }))
  async function queueTemplates(exec: Exec, templates: { page: number; prompt: string; output_path: string; asset_id: string; reference_asset_ids?: string[]; parent_asset_id?: string }[], limit?: number) {
    const initial = await bound(exec), root = cwd(exec), concurrency = imageConcurrency(limit), taskId = randomUUID()
    const jobs = await withPresentationLock(initial.dir, async () => {
      const state = await currentBinding(exec, initial), spec = await readSpecification(root, state.spec), manifest = await readManifest(root, state.manifest)
      if (!templates.length || templates.length > 128) throw new Error('Select 1–128 pages.')
      const paths = new Set<string>(), ids = new Set<string>(), pages = new Set<number>(), jobs: PageJob[] = []
      for (const item of templates) {
        if (!Number.isInteger(item.page) || !spec.slides[item.page - 1] || pages.has(item.page)) throw new Error('Select distinct pages inside the presentation specification.')
        if (activePages.has(state.journal + ':' + item.page) ||
          (state.pageJobs?.[item.page]?.runId === runId && ['queued', 'generating', 'building', 'checking', 'rendering'].includes(state.pageJobs[item.page]!.status))) throw new Error('A selected page already has an active task.')
        const target = await workspacePath(root, item.output_path)
        if (!/^[a-zA-Z0-9][\w.-]{0,127}$/u.test(item.asset_id) || ids.has(item.asset_id) || paths.has(target) || manifest.assets.some(asset => asset.assetId === item.asset_id || asset.path === target)
          || Object.values(state.pageJobs ?? {}).some(job => job.input.assetId === item.asset_id || job.input.outputPath === target)) throw new Error('Use unique new asset IDs and paths to preserve earlier versions.')
        const style = pageStyle(spec, item.page), referenceIds = [...new Set([...(item.reference_asset_ids ?? []), ...style.styleReferenceAssetIds])]
        const references = referenceIds.map(id => { const asset = manifest.assets.find(asset => asset.assetId === id); if (!asset) throw new Error('Unknown reference asset ' + id); return { assetId: id, path: asset.path, sha256: asset.sha256 } })
        if (references.length > 16) throw new Error('At most 16 reference images per page.')
        const prompt = style.stylePrompt ? item.prompt + '\n\n[Style reference]\n' + style.stylePrompt : item.prompt
        jobs.push({ taskId, runId, page: item.page, status: 'queued', concurrency, updatedAt: new Date().toISOString(),
          specFingerprint: hash(JSON.stringify({ slide: spec.slides[item.page - 1], style })),
          input: { prompt, originalPrompt: item.prompt, stylePrompt: style.stylePrompt, outputPath: target, assetId: item.asset_id, references, ...(item.parent_asset_id ? { parentAssetId: item.parent_asset_id } : {}) } })
        paths.add(target); ids.add(item.asset_id); pages.add(item.page)
      }
      state.pageJobs ??= {}
      for (const job of jobs) state.pageJobs[job.page] = job
      state.phase = 'processing-pages'; await persist(exec, state); return jobs
    })
    launchPages(exec, initial, jobs)
    return JSON.stringify({ taskId, pages: jobs.map(job => ({ page: job.page, status: 'queued', assetId: job.input.assetId })), concurrency })
  }
  ctx.tools.register(defineTool({ name: 'presentation_generate_templates', description: 'Queue selected pages and return taskId immediately. Each page independently generates, saves, checks and renders. Global stylePrompt/styleReferenceAssetIds inherit with per-page overrides. References use edit_image. Read presentation_status for durable per-page results.', parameters: { templates: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { page: { type: 'integer', required: true }, prompt: { type: 'string', required: true }, output_path: { type: 'string', required: true }, asset_id: { type: 'string', required: true }, reference_asset_ids: { type: 'array', items: { type: 'string' } } } } }, concurrency: { type: 'integer', description: '1–10 concurrent pages; default 10.' } }, output, execute: async (args, exec) => queueTemplates(exec, args.templates, args.concurrency) }))
  ctx.tools.register(defineTool({ name: 'presentation_resume_pages', description: 'Manually resume only explicitly selected failed/interrupted pages. Reuse completed generation receipts without charging again. Never automatically retries on restart.', parameters: { pages: { type: 'array', required: true, items: { type: 'integer' } }, concurrency: { type: 'integer' } }, output, execute: async (args, exec) => {
    const initial = await bound(exec), concurrency = imageConcurrency(args.concurrency)
    const jobs = await withPresentationLock(initial.dir, async () => {
      const state = await currentBinding(exec, initial)
      if (!args.pages.length || new Set(args.pages).size !== args.pages.length) throw new Error('Explicitly select distinct interrupted pages.')
      const jobs = args.pages.map(page => {
        const job = state.pageJobs?.[page]
        if (!job || !['failed', 'interrupted', 'awaiting-editable'].includes(job.status) || activePages.has(state.journal + ':' + page)) throw new Error('Only selected failed, interrupted or awaiting-editable pages can resume.')
        return { ...job, runId, concurrency, status: 'queued' as const, error: undefined, updatedAt: new Date().toISOString() }
      })
      for (const job of jobs) state.pageJobs![job.page] = job
      await persist(exec, state); return jobs
    })
    launchPages(exec, initial, jobs)
    return JSON.stringify({ pages: jobs.map(job => ({ page: job.page, taskId: job.taskId, status: 'queued' })) })
  } }))
  ctx.tools.register(defineTool({ name: 'presentation_plan_editable_pages', description: 'Persist native PPTD element plans (elementId, elementType, bounds plus complete text/shape/line/image/table/chart fields). Images reference registered asset IDs using src. No whole-page bitmap can satisfy an editable page.', parameters: { plans: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { page: { type: 'integer', required: true }, template_asset_id: { type: 'string' }, elements: { type: 'array', required: true, items: { type: 'json' } } } } } }, output, execute: async (args, exec) => {
    const initial = await bound(exec)
    return withPresentationLock(initial.dir, async () => {
      const state = await currentBinding(exec, initial), spec = await readSpecification(cwd(exec), state.spec), manifest = await readManifest(cwd(exec), state.manifest)
      if (state.outputMode !== 'editable') throw new Error('Set output_mode=editable in presentation_prepare for an editable project.')
      state.templatePlans ??= {}
      for (const plan of args.plans) {
        if (!spec.slides[plan.page - 1]) throw new Error('Page is outside the specification.')
        const template = pageTemplate(manifest, plan.page, state.outputMode, plan.template_asset_id)
        if (!template) throw new Error(`Page ${plan.page}: generate and visually review a full-slide template before editable conversion.`)
        // Template review remains an advisory record; the selected page can be edited immediately.
        state.templatePlans[plan.page] = validateEditablePagePlan(plan.page, plan.elements as Record<string, any>[], template.assetId)
      }
      state.phase = 'planned-editable'; await persist(exec, state); return JSON.stringify(state.templatePlans)
    })
  } }))
  ctx.tools.register(defineTool({ name: 'presentation_record_asset', description: 'Register a generated, literature, project/user or derived image with exact source provenance and generation receipt.', parameters: { manifest_path: { type: 'string', required: true }, ...assetParameters }, output, execute: async (args, exec) => JSON.stringify(await recordVisualAssets(cwd(exec), [assetInput(args.manifest_path, args)])) }))
  ctx.tools.register(defineTool({ name: 'presentation_record_assets', description: 'Atomically register up to 128 images. Preserve source file/page/figure/citation/hash and target slides; generated images retain original prompt.', parameters: { manifest_path: { type: 'string', required: true }, assets: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: assetParameters } } }, output, isConcurrencySafe: () => true, execute: async (args, exec) => JSON.stringify(await recordVisualAssets(cwd(exec), args.assets.map(item => assetInput(args.manifest_path, item)))) }))
  ctx.tools.register(defineTool({ name: 'presentation_build_pages', description: 'Build selected PPTD pages through ppt_edit. Image mode uses one complete PNG per page; editable mode uses planned native objects. Copies original scientific images byte-for-byte into media, and writes prompt/source provenance to notes and PPTD manifest.', parameters: { pages: { type: 'array', items: { type: 'integer' } } }, output, execute: async (args, exec) => {
    const initial = await bound(exec)
    return withPresentationLock(initial.dir, async () => {
      const state = await currentBinding(exec, initial), root = cwd(exec), spec = await readSpecification(root, state.spec), assetsManifest = await readManifest(root, state.manifest), current = await project(exec, state)
      const pages = [...new Set(args.pages ?? spec.slides.map((_, i) => i + 1))].sort((a, b) => a - b), ops: any[] = [], receipts: any[] = [], templateReceipts: any[] = []
      await mkdir(join(current.dir, 'media'), { recursive: true })
      for (const page of pages) {
        const slide = spec.slides[page - 1]; if (!slide) throw new Error('Page is outside the specification.')
        await verifyAssets(exec, state, page)
        const assets = assetsForPage(spec, assetsManifest, page)
        const template = pageTemplate(assetsManifest, page, state.outputMode, state.pageJobs?.[page]?.asset?.assetId ?? state.templatePlans?.[page]?.templateAssetId)
        if (!template) throw new Error(`Page ${page}: generate a full-slide image first.`)
        const templateReview = assetsManifest.templateReviews?.[template.assetId]
        const allAssets = assetsWithReferences(assetsManifest, [...assets, template])
        // Only declared page content is embedded; style references stay generation inputs.
        const pageAssets = assets.filter(asset => asset.assetId !== template.assetId)
        const media = new Map<string, string>()
        for (const asset of [...pageAssets, template]) { const target = `media/${asset.assetId}-${asset.sha256.slice(0, 12)}${extname(asset.path)}`; await copyFile(await workspacePath(root, asset.path), await workspacePath(root, join(current.dir, target))); media.set(asset.assetId, target) }
        let elements: Record<string, any>[]
        if (state.outputMode === 'image') {
          elements = [{ elementId: `slide-image-${page}`, elementType: 'image', bounds: [0, 0, spec.width, spec.height], src: media.get(template.assetId), fit: { mode: 'contain' } },
            ...factualImagePlacements(slide, pageAssets, spec.width, spec.height).map(({ asset, bounds }) => ({ elementId: `fact-${asset.assetId}`, elementType: 'image', bounds, src: media.get(asset.assetId), fit: { mode: 'contain' } }))]
        } else {
          const plan = state.templatePlans?.[page]; if (!plan) throw new Error(`Page ${page}: save the native editable plan first.`)
          elements = structuredClone(plan.elements)
          if (!elements.some(element => ['text', 'shape', 'line', 'table', 'chart'].includes(element.elementType))) throw new Error('An editable page requires native editable objects, not only images.')
          for (const asset of pageAssets.filter(asset => asset.sourceKind === 'literature' || asset.sourceKind === 'user')) if (!elements.some(element => element.elementType === 'image' && [asset.assetId, asset.path].includes(element.src))) throw new Error(`Fact image ${asset.assetId} must be referenced by a native image object; copying unused media is not embedding.`)
          for (const element of elements) if (element.elementType === 'image') { const asset = pageAssets.find(asset => asset.assetId === element.src || asset.path === element.src); if (!asset) throw new Error(`Image ${element.elementId} must reference a registered page asset.`); element.src = media.get(asset.assetId) }
        }
        const content = { elements, notes: notes(slide.notes, allAssets, page), ...(slide.background === undefined ? {} : { background: slide.background }) }
        const existing = current.snapshots[page - 1]
        // Reserve still-generating pages so later pages can land immediately and keep their page numbers.
        for (let number = current.snapshots.length + ops.filter(op => op.op === 'add_page').length + 1; number < page; number++) {
          ops.push({ op: 'add_page', page: `pages/${String(number).padStart(2, '0')}.page`, content: { elements: [] } })
        }
        ops.push(existing ? { op: 'update_page', page: existing.id, patch: content } : { op: 'add_page', page: `pages/${String(page).padStart(2, '0')}.page`, content })
        receipts.push({ page, assets: provenance(allAssets, page) })
        templateReceipts.push({ page, assetId: template.assetId, assetSha256: template.sha256, sourcePath: template.path, mediaPath: media.get(template.assetId), review: templateReview })
      }
      const result = await dispatch(exec, 'ppt_edit', { dir: state.dir, baseRevision: current.manifest.revision, ops, newVersion: true }, true)
      const next = await sync(exec, state)
      const provenanceFile = await workspacePath(root, state.provenancePath ?? join(state.dir, 'presentation-provenance.json'))
      let previous: any = {}
      try { previous = JSON.parse(await readFile(provenanceFile, 'utf8')) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      const mergePages = (old: any[], batch: any[]) => [...(old ?? []).filter(item => !pages.includes(item.page) && next.some(page => page.page === item.page)), ...batch].sort((a,b) => a.page - b.page)
      await saveJson(provenanceFile, { schemaVersion: 2, workspaceRoot: await realpath(root), specificationFingerprint: hash(JSON.stringify(spec)), spec: relative(root, state.spec), assetsManifest: relative(root, state.manifest), mode: state.mode, outputMode: state.outputMode,
        requiredTemplatePages: state.mode === 'new' ? spec.slides.map((_, index) => index + 1) : [...new Set([...(previous.requiredTemplatePages ?? []), ...pages])].filter(page => next.some(snapshot => snapshot.page === page)).sort((a,b) => a - b),
        templateReviews: mergePages(previous.templateReviews, templateReceipts.map(receipt => ({ ...receipt, pageFingerprint: next.find(page => page.page === receipt.page)!.fingerprint }))),
        pages: mergePages(previous.pages, receipts), snapshots: next.map(page => ({ page: page.page, id: page.id, fingerprint: page.fingerprint })) })
      state.phase = 'built'; delete state.failure; await persist(exec, state); return JSON.stringify(result)
    })
  } }))
  ctx.tools.register(defineTool({ name: 'presentation_check_pages', description: 'Run ppt_check and ppt_render for selected pages. Returns actual final-PPTX PNGs; view them before recording reviews. Reuses accepted unchanged page renders.', parameters: { pages: { type: 'array', items: { type: 'integer' } } }, output, execute: async (args, exec) => {
    const initial = await bound(exec)
    const plan = await withPresentationLock(initial.dir, async () => {
      const state = await currentBinding(exec, initial), snapshots = await sync(exec, state), pages = [...new Set(args.pages ?? snapshots.map(page => page.page))]
      if (!pages.length || pages.some(page => !Number.isInteger(page) || !state.pages[page])) throw new Error('Select existing presentation pages.')
      const checkPages = pages.filter(page => state.pages[page]!.checks.ppt_check?.fingerprint !== state.pages[page]!.fingerprint), renderPages: number[] = []
      for (const page of pages) {
        const entry = state.pages[page]!
        if (entry.checks.ppt_render?.fingerprint !== entry.fingerprint || !await currentScreenshot(exec, entry.checks.ppt_render)) { delete entry.checks.ppt_render; delete entry.review; renderPages.push(page) }
      }
      await persist(exec, state); return { state, pages, checkPages, renderPages }
    })
    const check = plan.checkPages.length ? await dispatch(exec, 'ppt_check', { dir: plan.state.dir, pages: plan.checkPages }, false) : { ok: true, reused: true, issues: findings(plan.state, plan.pages).map(item => item.finding) }
    await currentBinding(exec, initial)
    const render = plan.renderPages.length ? await dispatch(exec, 'ppt_render', { dir: plan.state.dir, pages: plan.renderPages }, false) : { ok: true, reused: true, images: plan.pages.map(page => ({ page, path: plan.state.pages[page]!.checks.ppt_render!.screenshot })) }
    const latest = await currentBinding(exec, initial)
    return JSON.stringify({ check: { ok: check.ok, pass: check.pass, reused: check.reused, issueCount: check.issues?.length ?? 0 }, render, checkedPages: plan.checkPages, renderedPages: plan.renderPages, ...findingsView(latest, plan.pages), requirements: exportRequirements(latest), state: workflowView(latest) })
  } }))
  async function reviewMany(exec: Exec, reviews: { kind: string; target: string; observations: string; waivers?: string[] }[]) {
    const initial = await bound(exec)
    return withPresentationLock(initial.dir, async () => {
      const state = await currentBinding(exec, initial); await sync(exec, state)
      for (const review of reviews) {
        if (review.observations.trim().length < 20) throw new Error('Record concrete observations from the actual image.')
        if (review.kind === 'asset') await recordAssetReview(cwd(exec), state.manifest, 'asset', review.target, review.observations)
        else { const entry = state.pages[review.target]; if (!entry || !await currentScreenshot(exec, entry.checks.ppt_render) || ['ppt_check', 'ppt_render'].some(name => entry.checks[name]?.fingerprint !== entry.fingerprint)) throw new Error('Current checks and an actual returned PNG are required before page review.'); entry.review = { fingerprint: entry.fingerprint, observations: review.observations, waivers: review.waivers ?? [] } }
      }
      state.phase = 'reviewed'; await persist(exec, state)
    })
  }
  const reviewParameters = { kind: { type: 'string' as const, enum: ['asset', 'page'] as const, required: true as const }, target: { type: 'string' as const, required: true as const }, observations: { type: 'string' as const, required: true as const }, waivers: { type: 'array' as const, items: { type: 'string' as const } } }
  ctx.tools.register(defineTool({ name: 'presentation_record_review', description: 'Record concrete observations after viewing an actual image or final rendered page.', parameters: reviewParameters, output, execute: async (args, exec) => { await reviewMany(exec, [args as any]); return 'Visual observations recorded.' } }))
  ctx.tools.register(defineTool({ name: 'presentation_record_reviews', description: 'Record actual visual observations for several assets or page revisions.', parameters: { reviews: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: reviewParameters } } }, output, execute: async (args, exec) => { await reviewMany(exec, args.reviews as any); return 'Visual observations recorded.' } }))
  ctx.tools.register(defineTool({ name: 'presentation_status', description: 'Resume a saved PPTD workflow: show current checks, reviews, export requirements and paginated finding hashes. Complete plans/findings remain in state.journal.', parameters: { pages: { type: 'array', items: { type: 'integer' } }, finding_offset: { type: 'integer' }, finding_limit: { type: 'integer' } }, output, execute: async (args, exec) => {
    const initial = await load(exec)
    if (!initial) return JSON.stringify({ state: undefined, presentationFindings: [], blockedPages: [], requirements: [] })
    const offset = args.finding_offset ?? 0, limit = args.finding_limit ?? 100
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('Use finding_offset >= 0 and finding_limit 1–200.')
    return withPresentationLock(initial.dir, async () => {
      const state = await currentBinding(exec, initial); await sync(exec, state)
      const spec = await readSpecification(cwd(exec), state.spec), manifest = await readManifest(cwd(exec), state.manifest), templateRequirements = []
      for (const page of args.pages ?? spec.slides.map((_, index) => index + 1)) {
        const template = pageTemplate(manifest, page, state.outputMode, state.templatePlans?.[page]?.templateAssetId)
        if (!template) { if (state.mode === 'new') templateRequirements.push({ page, missingImage: true }); continue }
        try { await requirePageTemplateReview(cwd(exec), spec, manifest, template, page) }
        catch { const review = templateFailure(manifest, template.sha256) ?? manifest.templateReviews?.[template.assetId]; templateRequirements.push({ page, assetId: template.assetId, imagePath: template.path, expectedSha256: template.sha256, status: review?.status ?? 'unreviewed', issues: review?.issues ?? [] }) }
      }
      await persist(exec, state)
      return JSON.stringify({ state: workflowView(state), ...findingsView(state, args.pages ?? state.changedPages, offset, limit), exportBlocked: false, exportPolicy: 'immediate-current-canvas', blockedPages: exportBlockers(state), requirements: exportRequirements(state), templateRequirements })
    })
  } }))
}
