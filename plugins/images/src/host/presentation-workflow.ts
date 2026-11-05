import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
import { parse } from 'yaml'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolRunContext, type ToolDispatchExecution } from '@deepseek-ai/dsh-tools'
import { assetsForPage, assetsWithReferences, hash, pageStyle, readManifest, readSpecification, recordAssetReview, recordTemplateReview, recordVisualAssets, requireTemplateReview, saveJson, templateFailure, withPresentationLock, workspacePath, type AssetInput, type VisualAsset, type VisualManifest, type TemplateReview } from './visual-assets.js'
import { DEFAULT_IMAGE_CONCURRENCY, imageConcurrency } from './image-concurrency.js'
import { installReconstructionWorkflow, invalidateReconstructionEvidence } from './presentation-reconstruction.js'
import { compilePresentationPrompts } from './presentation-prompts.js'
import { PRESENTATION_STYLE_CANDIDATES, presentationAspectRatio, presentationStylePrompt, representativeSlidePrompt, validateStyleCandidateSet, type PresentationStyleCandidate } from './presentation-style-candidates.js'
import { inspectPresentationTemplate, presentationTemplateStylePrompt } from './presentation-template-analysis.js'

type Exec = ToolRunContext | ToolDispatchExecution
type OutputMode = 'image' | 'editable'
const mediaHashes = new Map<string,{signature:string;hash:string}>()
function pageMedia(value:unknown, found=new Set<string>()): Set<string> {
  if(typeof value==='string'&&/^media[\\/]/u.test(value))found.add(value.replaceAll('\\','/'))
  else if(Array.isArray(value))value.forEach(item=>pageMedia(item,found))
  else if(value&&typeof value==='object')Object.values(value).forEach(item=>pageMedia(item,found))
  return found
}
async function mediaHash(file:string):Promise<string>{
  const info=await stat(file,{bigint:true}),signature=`${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`
  const cached=mediaHashes.get(file);if(cached?.signature===signature)return cached.hash
  const digest=hash(await readFile(file));if(mediaHashes.size>4096)mediaHashes.clear();mediaHashes.set(file,{signature,hash:digest});return digest
}
export interface PageSnapshot { page: number; id: string; fingerprint: string; visualFingerprint?: string; data: Record<string, any> }
type Check = { fingerprint: string; findings: any[]; screenshot?: string; screenshotHash?: string }
export interface PresentationWorkflow {
  schemaVersion: 3; spec: string; manifest: string; mode: 'new' | 'edit'; outputMode: OutputMode; dir: string; journal: string
  changedPages: number[]; pages: Record<string, { id: string; fingerprint: string; checks: Record<string, Check>; review?: { fingerprint: string; observations: string; waivers: string[] } }>
  phase: string; templatePlans?: Record<string, EditablePagePlan>; reconstructionFailures?: Record<string, string[]>
  failure?: { stage: string; message: string; at: string }; exportReceipt?: { outputPath: string; bytes: number; sha256: string; revision: number; stage?: 'partial' | 'final'; completedPages?: number[]; pendingPages?: number[]; failedPages?: number[]; exportedAt?: string }
  provenancePath?: string
  pageJobs?: Record<string, PageJob>
  editableRepresentativePages?: number[]
  editableApproval?: { pages: Record<string, string>; observations: string; confirmedAt: string }
  reconstruction?: { jobs: Record<string, import('./presentation-reconstruction.js').ReconstructionJob>; representativePages: number[]; concurrency?: number; approval?: { pages: Record<string, string>; sourceSha256?: string; observations: string; confirmedAt: string; acceptedLimitations?: boolean; editBoundaries?: Record<string, unknown> } }
  promptApproval?: PromptApproval
  styleSelectionRequired?: boolean
  promptCompilationRequired?: boolean
  componentManifestPath?: string
  fastExportPath?: string
  fastExportSha256?: string
  fastExportRunId?: string
}
export interface PromptApproval { specificationSha256: string; promptDocumentSha256: string; sourceManifestSha256: string; sourceAssetIds: string[]; researchManifestSha256?: string; styleId?: string; confirmedAt: string }
const RESEARCH_VERIFICATIONS = ['full-text-checked', 'abstract-checked', 'metadata-only', 'official-source', 'user-provided', 'unverified'] as const
const RESEARCH_SOURCE_TYPES = ['guideline', 'primary-study', 'review', 'database', 'software', 'dataset', 'other'] as const
export type ResearchVerification = typeof RESEARCH_VERIFICATIONS[number]
export type ResearchSourceType = typeof RESEARCH_SOURCE_TYPES[number]
const researchSourceParameters = {
  id: { type: 'string', required: true, description: 'Unique stable source identifier, for example S01. Refer to this ID from claims and slides.' },
  title: { type: 'string', required: true, description: 'Source title, up to 1000 characters.' },
  citation: { type: 'string', required: true, description: 'Human-readable citation, up to 2000 characters.' },
  sourceType: { type: 'string', required: true, enum: RESEARCH_SOURCE_TYPES, description: 'Required source category. Use database for a resource portal, dataset for an accession, primary-study for original research, and other when the category is unknown.' },
  verification: { type: 'string', required: true, enum: RESEARCH_VERIFICATIONS, description: 'Required actual evidence level. full-text-checked: relevant full text read; abstract-checked: abstract read; metadata-only: record/search metadata only; official-source: relevant official record checked; user-provided: supplied by user; unverified: not checked. Never infer verification from a DOI, URL or citation.' },
  doi: { type: 'string', description: 'Optional DOI, up to 300 characters.' },
  url: { type: 'string', description: 'Optional HTTP(S) source URL without credentials.' },
  publicationYear: { type: 'integer', description: 'Optional publication year.' },
  claims: { type: 'array', required: true, description: 'Up to 30 claims mapped to this source. Use [] for bibliography-only sources; do not invent a claim.', items: { type: 'object', additionalProperties: true, properties: {
    text: { type: 'string', required: true, description: 'Claim supported by this source, up to 2000 characters.' },
    slideNumbers: { type: 'array', required: true, items: { type: 'integer' }, description: 'One-based slide numbers within this deck; [] means not assigned to a slide yet.' },
    evidenceNote: { type: 'string', description: 'What was actually checked and any limitations, up to 2000 characters.' },
  } } },
  notes: { type: 'string', description: 'Source limitations and other notes.' },
} as const
export interface ResearchClaim { text: string; slideNumbers: number[]; evidenceNote?: string }
export interface ResearchSource { id: string; title: string; citation: string; sourceType: ResearchSourceType; verification: ResearchVerification; doi?: string; url?: string; publicationYear?: number; claims: ResearchClaim[]; notes?: string }
export interface PresentationSources { schemaVersion: 1; topic: string; queries: string[]; timeBudgetSeconds: number; sources: ResearchSource[]; createdAt: string; updatedAt: string }
export type PresentationComponentType = 'text' | 'title' | 'body' | 'label' | 'shape' | 'line' | 'image' | 'table' | 'chart' | 'group' | 'complex-raster' | 'background'
export interface PresentationComponent {
  id: string
  page: number
  type: PresentationComponentType
  bbox: [number, number, number, number]
  zIndex: number
  sourceRegion?: [number, number, number, number]
  text?: string
  style?: Record<string, unknown>
  confidence: number
  fallback: 'native' | 'image' | 'complex-raster'
  sourceAssetId?: string
  ocr?: { text?: string; confidence?: number; language?: string; differences?: string[] }
}
export interface PresentationComponentManifest { schemaVersion: 1; width: number; height: number; source?: string; sourceSha256?: string; pages: Record<string, PresentationComponent[]>; createdAt: string; updatedAt: string }
export interface PageJob {
  taskId: string; runId: string; page: number; status: 'queued' | 'generating' | 'building' | 'checking' | 'rendering' | 'awaiting-editable' | 'complete' | 'failed' | 'interrupted'
  input: { prompt: string; originalPrompt: string; analysisPrompt?: string; editablePlanPrompt?: string; stylePrompt: string; outputPath: string; assetId: string; references: { assetId: string; path: string; sha256: string }[]; parentAssetId?: string; promptBinding?: { source: 'confirmed-document' | 'explicit'; sha256: string; promptDocumentSha256?: string } }
  concurrency: number; specFingerprint: string; updatedAt: string; asset?: VisualAsset; generated?: unknown; error?: string | undefined; revision?: number; builtFingerprint?: string
}
export interface EditablePagePlan { page: number; templateAssetId?: string; elements: Record<string, any>[]; createdAt: string }
export interface PresentationImageTask<T = unknown> { id: string; page: number; run: () => Promise<T> }
interface PptMakerToolsService { ensureRegistered(): void }
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
  invalidateReconstructionEvidence(state,snapshots)
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
  return { schemaVersion: state.schemaVersion, spec: state.spec, manifest: state.manifest, dir: state.dir, journal: state.journal, mode: state.mode, outputMode: state.outputMode, phase: state.phase, changedPages: state.changedPages, reconstruction: state.reconstruction,
    pageJobs: state.pageJobs, promptApproval: state.promptApproval, editableRepresentativePages: state.editableRepresentativePages, editableApproval: state.editableApproval, componentManifestPath: state.componentManifestPath, fastExportPath: state.fastExportPath, failure: state.failure, exportReceipt: state.exportReceipt, provenancePath: state.provenancePath,
    pages: Object.fromEntries(Object.entries(state.pages).map(([page, entry]) => [page, { id: entry.id, fingerprint: entry.fingerprint,
      checkCurrent: entry.checks.ppt_check?.fingerprint === entry.fingerprint, renderCurrent: entry.checks.ppt_render?.fingerprint === entry.fingerprint,
      screenshot: entry.checks.ppt_render?.screenshot, reviewCurrent: entry.review?.fingerprint === entry.fingerprint, findingCount: entry.checks.ppt_check?.findings.length ?? 0 }])) }
}
function componentTypeForElement(element: Record<string, any>): PresentationComponentType {
  if (element.elementType === 'text') {
    const role = String(element.content?.role ?? element.role ?? '').toLowerCase()
    return role === 'title' || role === 'heading' ? 'title' : role === 'label' ? 'label' : 'text'
  }
  if (element.elementType === 'icon') return 'shape'
  if (['shape', 'line', 'image', 'table', 'chart'].includes(element.elementType)) return element.elementType
  return 'complex-raster'
}
function componentFromElement(page: number, element: Record<string, any>, index: number): PresentationComponent {
  const bounds = element.bounds as [number, number, number, number]
  const type = componentTypeForElement(element)
  const text = typeof element.content?.text === 'string' ? element.content.text : undefined
  return {
    id: String(element.elementId), page, type, bbox: [...bounds] as [number, number, number, number], zIndex: Number.isFinite(element.zIndex) ? element.zIndex : index,
    sourceRegion: Array.isArray(element.sourceRegion) && element.sourceRegion.length === 4 ? [...element.sourceRegion] as [number, number, number, number] : [...bounds] as [number, number, number, number],
    ...(text === undefined ? {} : { text }), ...(element.style && typeof element.style === 'object' ? { style: structuredClone(element.style) } : {}), confidence: Number.isFinite(element.confidence) ? Math.max(0, Math.min(1, element.confidence)) : 1,
    fallback: type === 'complex-raster' ? 'complex-raster' : element.elementType === 'image' ? 'image' : 'native', ...(typeof element.src === 'string' ? { sourceAssetId: element.src } : {}),
  }
}
function validateComponent(component: any, width: number, height: number): PresentationComponent {
  if (!component || typeof component.id !== 'string' || !/^[a-zA-Z0-9][\w.-]{0,127}$/u.test(component.id)) throw new Error('Component IDs must be stable identifiers of at most 128 characters.')
  if (!['text', 'title', 'body', 'label', 'shape', 'line', 'image', 'table', 'chart', 'group', 'complex-raster', 'background'].includes(component.type)) throw new Error(`Unsupported component type for ${component.id}.`)
  const bounds = component.bbox
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite) || bounds[2] <= 0 || bounds[3] <= 0 || bounds[0] < 0 || bounds[1] < 0 || bounds[0] + bounds[2] > width || bounds[1] + bounds[3] > height) throw new Error(`Component ${component.id} requires an in-bounds bbox.`)
  if (!Number.isInteger(component.zIndex) || component.zIndex < 0 || !Number.isFinite(component.confidence) || component.confidence < 0 || component.confidence > 1) throw new Error(`Component ${component.id} requires zIndex and confidence in valid ranges.`)
  if (!['native', 'image', 'complex-raster'].includes(component.fallback)) throw new Error(`Component ${component.id} has an invalid fallback.`)
  return structuredClone(component)
}
function sourceManifestFingerprint(manifest: VisualManifest, confirmedAssetIds?: string[]): string {
  const known = confirmedAssetIds ? new Set(confirmedAssetIds) : undefined
  const assets = manifest.assets.filter(asset => asset.sourceKind !== 'generated' || known?.has(asset.assetId))
  return hash(JSON.stringify({ schemaVersion: manifest.schemaVersion, assets, selectedStyleAssetId: manifest.selectedStyleAssetId }))
}
function validateResearchSources(input: any, slideCount: number): PresentationSources {
  if (!input || typeof input.topic !== 'string' || !input.topic.trim() || input.topic.length > 2000) throw new Error('Research source manifest requires a topic.')
  if (!Array.isArray(input.queries) || input.queries.length > 20 || input.queries.some((query: unknown) => typeof query !== 'string' || !query.trim() || query.length > 1000)) throw new Error('Research manifest queries must contain up to 20 non-empty search strings.')
  if (!Array.isArray(input.sources) || input.sources.length > 100) throw new Error('Research source manifest accepts up to 100 sources.')
  const ids = new Set<string>()
  const sources = input.sources.map((source: any): ResearchSource => {
    if (!source || typeof source.id !== 'string' || !/^[a-zA-Z0-9][\w.-]{0,127}$/u.test(source.id) || ids.has(source.id)) throw new Error('Research source IDs must be unique stable identifiers.')
    ids.add(source.id)
    if (typeof source.title !== 'string' || !source.title.trim() || source.title.length > 1000 || typeof source.citation !== 'string' || !source.citation.trim() || source.citation.length > 2000) throw new Error(`Research source ${source.id} requires title and citation.`)
    if (!RESEARCH_SOURCE_TYPES.includes(source.sourceType)) throw new Error(`Research source ${source.id}: sourceType is required and must be one of ${RESEARCH_SOURCE_TYPES.join(', ')}. Use other if the category is unknown; preserve the source content.`)
    if (!RESEARCH_VERIFICATIONS.includes(source.verification)) throw new Error(`Research source ${source.id}: verification is required and must be one of ${RESEARCH_VERIFICATIONS.join(', ')}. Use unverified when not checked; never infer verification from a DOI or URL.`)
    if (source.doi !== undefined && (typeof source.doi !== 'string' || source.doi.length > 300)) throw new Error(`Research source ${source.id} has an invalid DOI.`)
    if (source.url !== undefined) {
      if (typeof source.url !== 'string' || source.url.length > 2048) throw new Error(`Research source ${source.id} has an invalid URL.`)
      const url = new URL(source.url)
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error(`Research source ${source.id} URL must be a public HTTP(S) address without credentials.`)
    }
    if (source.publicationYear !== undefined && (!Number.isInteger(source.publicationYear) || source.publicationYear < 1600 || source.publicationYear > new Date().getUTCFullYear() + 1)) throw new Error(`Research source ${source.id} has an invalid publication year.`)
    if (!Array.isArray(source.claims) || source.claims.length > 30) throw new Error(`Research source ${source.id} claims must be an array with up to 30 entries.`)
    const claims = source.claims.map((claim: any) => {
      if (!claim || typeof claim.text !== 'string' || !claim.text.trim() || claim.text.length > 2000 || !Array.isArray(claim.slideNumbers) || claim.slideNumbers.some((page: unknown) => !Number.isInteger(page) || Number(page) < 1 || Number(page) > slideCount)) throw new Error(`Research source ${source.id} contains an invalid claim or slide mapping.`)
      if (claim.evidenceNote !== undefined && (typeof claim.evidenceNote !== 'string' || claim.evidenceNote.length > 2000)) throw new Error(`Research source ${source.id} evidence note is too long.`)
      return { text: claim.text.trim(), slideNumbers: [...new Set(claim.slideNumbers as number[])].sort((a, b) => a - b), ...(claim.evidenceNote ? { evidenceNote: claim.evidenceNote.trim() } : {}) }
    })
    return { id: source.id, title: source.title.trim(), citation: source.citation.trim(), sourceType: source.sourceType, verification: source.verification, ...(source.doi ? { doi: source.doi.trim() } : {}), ...(source.url ? { url: source.url.trim() } : {}), ...(source.publicationYear ? { publicationYear: source.publicationYear } : {}), claims, ...(typeof source.notes === 'string' && source.notes.trim() ? { notes: source.notes.trim().slice(0, 3000) } : {}) }
  })
  const timeBudgetSeconds = input.timeBudgetSeconds ?? 180
  if (!Number.isInteger(timeBudgetSeconds) || timeBudgetSeconds < 30 || timeBudgetSeconds > 1800) throw new Error('Research time budget must be between 30 and 1800 seconds.')
  const now = new Date().toISOString()
  return { schemaVersion: 1, topic: input.topic.trim(), queries: input.queries.map((query: string) => query.trim()), timeBudgetSeconds, sources, createdAt: typeof input.createdAt === 'string' ? input.createdAt : now, updatedAt: now }
}
function findingsView(state: PresentationWorkflow, pages: number[], offset = 0, limit = 100) {
  const all = findings(state, pages)
  return { presentationFindings: all.slice(offset, offset + limit), findingCount: all.length, findingOffset: offset, nextFindingOffset: offset + limit < all.length ? offset + limit : null }
}
function provenance(assets: VisualAsset[], page: number) { return assets.map(asset => ({ ...asset, targetPage: page })) }
function notes(userNotes: unknown, assets: VisualAsset[], page: number, research?: PresentationSources): string {
  const evidence = research?.sources.flatMap(source => source.claims.filter(claim => claim.slideNumbers.includes(page)).map(claim => ({ sourceId: source.id, citation: source.citation, verification: source.verification, doi: source.doi, url: source.url, claim: claim.text, evidenceNote: claim.evidenceNote }))) ?? []
  return [typeof userNotes === 'string' ? userNotes : '', '[ZeroWall provenance]', JSON.stringify(provenance(assets, page), null, 2), ...(evidence.length ? ['[Research sources]', JSON.stringify(evidence, null, 2)] : [])].join('\n\n')
}
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
      const data=parse(pageRaw),refs=[...pageMedia([settings,data])].sort()
      const dependencies=await Promise.all(refs.map(async ref=>[ref,await workspacePath(root,join(dir,ref)).then(mediaHash).catch(()=>'missing')]))
      return { page: index + 1, id: path, fingerprint: hash(JSON.stringify(settings) + pageRaw), visualFingerprint: hash(JSON.stringify(settings) + pageRaw + JSON.stringify(dependencies)), data }
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
  function requireSelectedStyle(state: PresentationWorkflow, specification: Awaited<ReturnType<typeof readSpecification>>) {
    if (!state.styleSelectionRequired && !specification.styleCandidates) return
    if (!specification.styleCandidates) throw new Error('PRESENTATION_STYLE_CANDIDATES_REQUIRED: 新建 PPT 请先调用 presentation_generate_style_candidates，展示同一代表页的四张风格图供用户选择。')
    validateStyleCandidateSet(specification.styleCandidates)
    if (!specification.selectedStyleId || !specification.styleCandidates.some(candidate => candidate.id === specification.selectedStyleId)) throw new Error('PRESENTATION_STYLE_SELECTION_REQUIRED: 请展示四张代表图，按用户选择调用 presentation_select_style，再编译和确认逐页提示词。')
  }
  async function requireCurrentPromptApproval(exec: Exec, state: PresentationWorkflow): Promise<void> {
    const root = cwd(exec), specification = await readSpecification(root, state.spec)
    requireSelectedStyle(state, specification)
    if (!state.styleSelectionRequired && specification.promptApprovalRequired !== true && specification.promptDocumentFormat !== 'structured-v1') return
    if (specification.templateSource && hash(await readFile(await workspacePath(root, specification.templateSource.path))) !== specification.templateSource.sha256) throw new Error('PRESENTATION_TEMPLATE_CHANGED: 客户 PPTX 母版已变化，请重新运行 presentation_prepare 分析母版并确认提示词。')
    const approval = state.promptApproval
    if (!approval) throw new Error('PRESENTATION_PLAN_CONFIRMATION_REQUIRED: 请先确认 presentation-prompts.md、选定风格和来源清单，再开始正式页面生成。')
    if (!specification.promptDocumentPath) throw new Error('PRESENTATION_PROMPT_DOCUMENT_MISSING: 当前规格要求确认，但没有 promptDocumentPath，请重新写入提示词文档。')
    const promptPath = await workspacePath(root, specification.promptDocumentPath)
    const [specBytes, promptBytes] = await Promise.all([
      readFile(await workspacePath(root, state.spec)),
      readFile(promptPath),
    ])
    const manifest = await readManifest(root, state.manifest)
    const mismatches: string[] = []
    if (approval.specificationSha256 !== hash(specBytes)) mismatches.push('presentation specification')
    if (approval.promptDocumentSha256 !== hash(promptBytes)) mismatches.push('prompt document')
    if (approval.sourceManifestSha256 !== sourceManifestFingerprint(manifest, approval.sourceAssetIds)) mismatches.push('source manifest')
    if (specification.researchSourcesRequired && !specification.sourceManifestPath) throw new Error('PRESENTATION_RESEARCH_MANIFEST_MISSING: 请先登记检索来源。')
    if (specification.sourceManifestPath) {
      const researchPath = await workspacePath(root, specification.sourceManifestPath)
      if (approval.researchManifestSha256 !== hash(await readFile(researchPath))) mismatches.push('research source manifest')
    }
    if (specification.selectedStyleId && approval.styleId !== specification.selectedStyleId) mismatches.push('selected style')
    if (mismatches.length) throw new Error(`PRESENTATION_PLAN_CONFIRMATION_STALE: ${mismatches.join(', ')} 已变化，请重新生成或确认提示词文档后再生成页面。`)
  }
  function requireEditableSampleApproval(state: PresentationWorkflow, specification: Awaited<ReturnType<typeof readSpecification>>, snapshots: PageSnapshot[], pages: number[]): void {
    if (state.mode !== 'new' || state.outputMode !== 'editable') return
    const samples = state.editableRepresentativePages ?? [1]
    if (!state.editableApproval) {
      if (pages.some(page => !samples.includes(page))) throw new Error(`PRESENTATION_EDITABLE_SAMPLE_CONFIRMATION_REQUIRED: 先完成代表页 ${samples.join(', ')} 的原生对象计划和渲染，展示结果并调用 presentation_confirm_editable_samples，再并发处理其余页面。`)
      return
    }
    for (const page of samples) {
      const snapshot = snapshots[page - 1]
      if (!specification.slides[page - 1] || !snapshot || state.editableApproval.pages[page] !== snapshot.fingerprint) throw new Error(`PRESENTATION_EDITABLE_SAMPLE_CONFIRMATION_STALE: 代表页 ${page} 在确认后发生变化，请重新展示样页并调用 presentation_confirm_editable_samples。`)
    }
  }
  async function updateJob(exec: Exec, initial: PresentationWorkflow, page: number, patch: Partial<PageJob>): Promise<PageJob> {
    return withPresentationLock(initial.dir, async () => {
      const state = await currentBinding(exec, initial), job = state.pageJobs?.[page]
      if (!job) throw new Error('Page task no longer exists.')
      Object.assign(job, patch, { updatedAt: new Date().toISOString() })
      await persist(exec, state); return structuredClone(job)
    })
  }
  async function assertFastExportTarget(root: string, state: PresentationWorkflow, outputPath: string): Promise<void> {
    await workspacePath(root, outputPath)
    try {
      const bytes = await readFile(outputPath)
      if (state.fastExportPath !== outputPath || !state.fastExportSha256 || hash(bytes) !== state.fastExportSha256) throw new Error('PRESENTATION_OUTPUT_EXISTS: 自动导出不能覆盖已有或已被用户修改的文件，请选择新的 PPTX 路径。')
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  async function exportFastImageDeck(exec: Exec, initial: PresentationWorkflow, outputPath: string, stage: 'partial' | 'final'): Promise<void> {
    const root = cwd(exec)
    await withPresentationLock(initial.dir, async () => {
      exec.signal?.throwIfAborted()
      const state = await currentBinding(exec, initial)
      if (state.fastExportPath !== outputPath) throw new Error('Fast export destination changed; inspect the current presentation status.')
      const spec = await readSpecification(root, state.spec)
      const snapshots = (await project(exec, state)).snapshots
      const completedPages = snapshots.filter(page => page.data.elements?.length && (!state.pageJobs?.[page.page] || state.pageJobs[page.page]!.status === 'complete')).map(page => page.page)
      if (!completedPages.length) { if (stage === 'final') throw new Error('PRESENTATION_NO_COMPLETED_PAGES: 未生成任何可导出页面，已保留失败记录。'); return }
      const failedPages = Object.values(state.pageJobs ?? {}).filter(job => ['failed', 'interrupted'].includes(job.status)).map(job => job.page).sort((a, b) => a - b)
      const pendingPages = spec.slides.flatMap((_, index) => completedPages.includes(index + 1) || failedPages.includes(index + 1) ? [] : [index + 1])
      await assertFastExportTarget(root, state, outputPath)
      // Export to a new candidate so a failed export never damages the last
      // downloadable PPTX. Recheck ownership immediately before activation.
      const candidate = outputPath + '.' + randomUUID() + '.pptx'
      let result: any, bytes: Buffer
      try {
        const exported = await dispatch(exec, 'ppt_export', { dir: state.dir, out: relative(root, candidate).replaceAll('\\', '/') }, true)
        result = typeof exported === 'string' ? JSON.parse(exported) : exported
        if (result?.ok === false || typeof result?.path !== 'string' || resolve(root, result.path) !== candidate) throw new Error('Fast PPTX export did not return the requested file.')
        bytes = await readFile(await workspacePath(root, result.path))
        if (!bytes.length) throw new Error('Fast PPTX export returned an empty file.')
        exec.signal?.throwIfAborted()
        await assertFastExportTarget(root, state, outputPath)
        await rename(candidate, outputPath)

      } finally { await unlink(candidate).catch(() => {}) }
      const finalStage = stage === 'final' && !pendingPages.length && !failedPages.length ? 'final' : 'partial'
      state.fastExportSha256 = hash(bytes)
      state.exportReceipt = { outputPath: relative(root, outputPath).replaceAll('\\', '/'), bytes: bytes.byteLength, sha256: state.fastExportSha256, revision: Number.isInteger(result.revision) ? result.revision : 0, stage: finalStage, completedPages, pendingPages, failedPages, exportedAt: new Date().toISOString() }
      state.phase = finalStage === 'final' ? 'image-exported' : 'image-exported-partial'
      delete state.failure
      await persist(exec, state)
    })
  }
  function launchPages(exec: Exec, initial: PresentationWorkflow, jobs: PageJob[], fastExportPath?: string) {
    const background = { ...exec, signal: shutdown.signal, token: undefined, rootCallId: undefined } as unknown as Exec
    if ('deferContext' in background) delete (background as any).deferContext
    const firstPageReady = Promise.withResolvers<boolean>()
    let signalledReady = false
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
            generated ??= await dispatch(background, input.references.length ? 'edit_image' : 'generate_image', { prompt: input.prompt, output_path: input.outputPath, aspect_ratio: presentationAspectRatio(spec.width, spec.height), concurrency: job.concurrency, ...(input.references.length ? { input_paths: input.references.map(reference => reference.path) } : {}) })
            const generation = JSON.parse(await readFile(await workspacePath(root, generated.path + '.generation.json'), 'utf8'))
            if (JSON.stringify(generation.inputImageHashes ?? []) !== JSON.stringify(input.references.map(reference => reference.sha256))) throw new Error('Image receipt must bind the referenced original images.')
            if (input.parentAssetId && generation.sha256 === input.references.find(reference => reference.assetId === input.parentAssetId)?.sha256) throw new Error('Image repair must contain changed image bytes.')
            asset = (await recordVisualAssets(root, [{ manifest: initial.manifest, image: generated.path, assetId: input.assetId, role: initial.outputMode === 'image' ? 'slide-image' : 'template', sourceKind: 'generated', slideNumber: job.page,
              styleReferenceIds: input.references.map(reference => reference.assetId), originalPrompt: input.originalPrompt, ...(input.analysisPrompt !== undefined ? { analysisPrompt: input.analysisPrompt } : {}), ...(input.editablePlanPrompt !== undefined ? { editablePlanPrompt: input.editablePlanPrompt } : {}), combinedPrompt: input.prompt, stylePrompt: input.stylePrompt, referenceImageHashes: input.references.map(reference => reference.sha256), ...(input.parentAssetId ? { parentAssetId: input.parentAssetId } : {}) }])).assets[0]!
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
          if (fastExportPath && state.outputMode === 'image') {
            await updateJob(background, initial, job.page, { status: 'complete', revision: built.revision, builtFingerprint: after.snapshots[job.page - 1]!.fingerprint })
            if (!signalledReady) { signalledReady = true; firstPageReady.resolve(true) }
            return
          }
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
    const run = runPresentationImageTasks(tasks, jobs[0]?.concurrency)
    if (fastExportPath) {
      const reportFailure = async (error: unknown) => {
        await withPresentationLock(initial.dir, async () => {
          const state = await currentBinding(background, initial).catch(() => undefined)
          if (state) { state.failure = { stage: 'ppt_export', message: (error instanceof Error ? error.message : String(error)).slice(0, 1000), at: new Date().toISOString() }; await persist(background, state) }
        }).catch(() => {})
      }
      // Chain the final export behind the provisional one: a slow provisional
      // export must never overwrite the later final receipt or file.
      const partial = firstPageReady.promise.then(ready => ready ? exportFastImageDeck(background, initial, fastExportPath, 'partial') : undefined).catch(reportFailure)
      void run.then(async () => {
        if (!signalledReady) firstPageReady.resolve(false)
        await partial
        await exportFastImageDeck(background, initial, fastExportPath, 'final')
      }).catch(reportFailure).finally(async () => {
        await withPresentationLock(initial.dir, async () => {
          const state = await currentBinding(background, initial).catch(() => undefined)
          if (state?.fastExportRunId === runId) { delete state.fastExportRunId; await persist(background, state) }
        }).catch(() => {})
      })
    } else void run.catch(() => {})
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
  ctx.tools.register(defineTool({ name: 'presentation_prepare', description: 'Bind a rich content plan and asset manifest to a PPTD project. Optionally pass template_path to analyze a customer PPTX master before style selection; its slide size, theme colors, fonts and layouts become visual guidance without modifying the source. For mode=new, create the project automatically when dir does not exist. output_mode defaults to editable; generate and confirm representative page(s) before processing the rest. Choose image explicitly for a fast whole-page PNG PPTX.', parameters: { spec_path: { type: 'string', required: true }, manifest_path: { type: 'string', required: true }, dir: { type: 'string', required: true }, mode: { type: 'string', enum: ['new', 'edit'], required: true }, template_path: { type: 'string', description: 'Optional workspace-relative customer PPTX master. Analyzed read-only before generating style candidates.' }, output_mode: { type: 'string', enum: ['image', 'editable'] }, representative_pages: { type: 'array', items: { type: 'integer' }, description: 'Pages that must be built, rendered and explicitly confirmed before other pages are queued in a new editable deck. Defaults to page 1.' }, changed_pages: { type: 'array', items: { type: 'integer' } } }, output, execute: async (args, exec) => {
    const root = cwd(exec), specPath = args.spec_path as string, manifestPath = args.manifest_path as string, spec = await workspacePath(root, specPath), manifest = await workspacePath(root, manifestPath), dir = await workspacePath(root, args.dir)
    const specification = await readSpecification(root, spec), visualManifest = await readManifest(root, manifest)
    let templateSource: { path: string; sha256: string } | undefined
    const templateInput = args.template_path ?? specification.templateSource?.path
    if (typeof templateInput === 'string' && templateInput.trim()) {
      const templatePath = await workspacePath(root, templateInput.trim())
      if (extname(templatePath).toLowerCase() !== '.pptx') throw new Error('template_path must point to a .pptx file.')
      const bytes = await readFile(templatePath), analysis = inspectPresentationTemplate(bytes), relativeTemplatePath = relative(root, templatePath).replace(/\\/gu, '/')
      try {
        const existing = parse(await readFile(await workspacePath(root, join(dir, 'deck.pptd')), 'utf8'))
        if (existing.size?.[0] !== analysis.width || existing.size?.[1] !== analysis.height) throw new Error('PRESENTATION_TEMPLATE_CANVAS_MISMATCH: 客户母版画布与已有工程不同，请使用独立 PPTD 工程应用此母版。')
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      templateSource = { path: relativeTemplatePath, sha256: hash(bytes) }
      if (specification.templateSource?.sha256 !== templateSource.sha256) {
        delete specification.styleCandidates; delete specification.selectedStyleId; delete specification.selectedStylePrompt
      }
      specification.width = analysis.width
      specification.height = analysis.height
      specification.templateAnalysis = { ...analysis, sourcePath: relativeTemplatePath, sourceSha256: templateSource.sha256 }
      specification.templateSource = templateSource
      specification.templateStylePrompt = presentationTemplateStylePrompt(analysis)
      await saveJson(spec, specification)
    }
    const directory = resolve(root, '.zerowall', 'presentation-state'); await mkdir(directory, { recursive: true })
    const journal = await workspacePath(root, join(directory, hash(JSON.stringify({ spec, manifest, dir })) + '.json'))
    return withPresentationLock(dir, async () => {
      const outputMode = (args.output_mode ?? 'editable') as OutputMode
      const requestedSamples = args.representative_pages ?? [1]
      if (!Array.isArray(requestedSamples) || !requestedSamples.length || new Set(requestedSamples).size !== requestedSamples.length || requestedSamples.some((page: number) => !Number.isInteger(page) || page < 1 || page > specification.slides.length)) throw new Error('representative_pages must contain distinct pages inside the presentation specification.')
      let state: PresentationWorkflow = { schemaVersion: 3, spec, manifest, dir, journal, mode: args.mode, outputMode, ...(args.mode === 'new' && outputMode === 'editable' ? { editableRepresentativePages: requestedSamples } : {}), changedPages: args.changed_pages ?? [], pages: {}, phase: 'planned', styleSelectionRequired: args.mode === 'new', provenancePath: join(dir, 'presentation-provenance.json') }
      try { const previous = JSON.parse(await readFile(journal, 'utf8')); if (previous.schemaVersion === 3) { if (args.output_mode && previous.outputMode !== args.output_mode) throw new Error('Use a separate PPTD project when changing output_mode.'); state = previous } } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      if (args.mode === 'new' && outputMode === 'editable') {
        state.editableRepresentativePages ??= requestedSamples
        const samples = state.editableRepresentativePages
        if (!Array.isArray(samples) || !samples.length || new Set(samples).size !== samples.length || samples.some((page: number) => !Number.isInteger(page) || page < 1 || page > specification.slides.length)) throw new Error('Saved editable representative pages are invalid for the current specification.')
      }
      const deckPath = join(dir, 'deck.pptd')
      try { await readFile(deckPath, 'utf8') } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || args.mode !== 'new') throw error
        const pptTools = ctx.get('dshPptMakerTools') as PptMakerToolsService | undefined
        if (!pptTools || typeof pptTools.ensureRegistered !== 'function') throw new Error('PPT 工具尚未就绪。请确认 dsh-ppt-maker 插件已加载后重试 presentation_prepare。')
        pptTools.ensureRegistered()
        const created = await dispatch(exec, 'ppt_create', { dir, title: (specification as any).title ?? 'ZeroWall presentation', size: [specification.width, specification.height], metadata: { zeroWall: { spec: relative(root, spec), assetsManifest: relative(root, manifest), mode: args.mode, outputMode } } }, true)
        if (created?.ok === false) throw new Error(created.error?.message ?? 'ppt_create failed')
      }
      await project(exec, state); state.changedPages = [...new Set([...state.changedPages, ...(args.changed_pages ?? [])])]; await sync(exec, state)
      const provenanceFile = await workspacePath(root, state.provenancePath ?? join(state.dir, 'presentation-provenance.json'))
      let prior: any = {}
      try { prior = JSON.parse(await readFile(provenanceFile, 'utf8')) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      await saveJson(provenanceFile, { ...prior, schemaVersion: 2, workspaceRoot: await realpath(root), specificationFingerprint: hash(JSON.stringify(specification)), spec: relative(root, spec), assetsManifest: relative(root, manifest), mode: state.mode, outputMode: state.outputMode, ...(templateSource ? { templateSource } : specification.templateSource ? { templateSource: specification.templateSource } : {}), ...(specification.templateAnalysis ? { templateAnalysis: specification.templateAnalysis } : {}), ...(state.componentManifestPath ? { componentManifest: relative(root, state.componentManifestPath) } : {}),
        requiredTemplatePages: state.mode === 'new' ? specification.slides.map((_, index) => index + 1) : prior.requiredTemplatePages ?? [], templateReviews: prior.templateReviews ?? [], assets: visualManifest.assets })
      await persist(exec, state, true); return JSON.stringify({ ...workflowView(state), ...(state.styleSelectionRequired ? { nextStep: specification.selectedStyleId && specification.styleCandidates ? 'presentation_write_prompt_document' : 'presentation_generate_style_candidates', styleOptions: PRESENTATION_STYLE_CANDIDATES.map(({ id, label }) => ({ id, label })) } : {}), ...(specification.templateAnalysis ? { templateAnalysis: specification.templateAnalysis } : {}) })
    })
  } }))
  ctx.tools.register(defineTool({
    name: 'presentation_generate_style_candidates',
    description: 'Generate exactly four style-candidate images from the same representative page and content, save and register each with its generation receipt, and bind the complete candidate set to the current presentation specification. Select one with presentation_select_style before compiling the formal prompt document.',
    parameters: { representative_page: { type: 'integer', description: 'One-based representative page; defaults to page 1.' }, output_dir: { type: 'string', description: 'Optional workspace-relative destination directory; defaults to <presentation>/style-candidates.' }, concurrency: { type: 'integer', description: '1–10 concurrent requests; defaults to 10.' } },
    output: { schema: output.schema, render: (_args: unknown, value: string) => {
      const result = JSON.parse(value)
      return [{ type: 'text' as const, text: value + '\n\n展示以下四张图，等待用户选择后调用 presentation_select_style：\n' + result.candidates.map((candidate: any) => candidate.previewMarkdown).join('\n\n') },
        ...result.candidates.flatMap((candidate: any) => candidate.attachment ? [{ type: 'image' as const, attachment: candidate.attachment }] : [])]
    } },
    execute: async (args, exec) => {
      const initial = await bound(exec), root = cwd(exec), state = await currentBinding(exec, initial)
      const specPath = await workspacePath(root, state.spec), specification = await readSpecification(root, state.spec), manifestPath = await workspacePath(root, state.manifest)
      const specBytesBefore = await readFile(specPath), representativePage = args.representative_page ?? 1
      if (!Number.isInteger(representativePage) || representativePage < 1 || !specification.slides[representativePage - 1]) throw new Error('representative_page must be a page in the current presentation specification.')
      if (specification.templateSource && hash(await readFile(await workspacePath(root, specification.templateSource.path))) !== specification.templateSource.sha256) throw new Error('PRESENTATION_TEMPLATE_CHANGED: 客户 PPTX 母版已变化，请重新运行 presentation_prepare。')
      const limit = imageConcurrency(args.concurrency), slide = specification.slides[representativePage - 1]!
      const manifest = await readManifest(root, state.manifest)
      const referenceIds = [...new Set(slide.styleReferenceAssetIds ?? specification.styleReferenceAssetIds ?? [])]
      const references = referenceIds.map(id => {
        const asset = manifest.assets.find(item => item.assetId === id)
        if (!asset) throw new Error(`Unknown style reference asset ${id}.`)
        return asset
      })
      if (references.length > 16) throw new Error('At most 16 style references per candidate.')
      for (const reference of references) if (hash(await readFile(await workspacePath(root, reference.path))) !== reference.sha256) throw new Error(`Style reference asset ${reference.assetId} changed.`)
      const contentPrompt = [
        typeof slide.originalPrompt === 'string' ? slide.originalPrompt : typeof specification.originalPrompt === 'string' ? specification.originalPrompt : '',
        typeof slide.analysisPrompt === 'string' ? slide.analysisPrompt : '',
        typeof slide.purpose === 'string' ? `Page purpose: ${slide.purpose}` : '',
        typeof slide.takeaway === 'string' ? `Key takeaway: ${slide.takeaway}` : '',
        typeof slide.visualBrief === 'string' ? `Visual direction: ${slide.visualBrief}` : '',
        specification.stylePrompt ? `User visual requirements (apply to every option): ${specification.stylePrompt}` : '',
        `User typography and palette (preserve explicit choices): ${JSON.stringify({ fonts: specification.fonts, palette: specification.palette })}`,
        specification.templateStylePrompt ? `Customer master visual guidance:\n${specification.templateStylePrompt}` : '',
      ].filter(value => value.trim()).join('\n\n')
      const sharedPrompt = representativeSlidePrompt({ page: representativePage, width: specification.width, height: specification.height, slide, ...(contentPrompt ? { prompt: contentPrompt } : {}) })
      const candidateSetId = randomUUID(), outputDir = args.output_dir ?? join(state.dir, 'style-candidates')
      const candidateDirectory = await workspacePath(root, outputDir)
      await mkdir(candidateDirectory, { recursive: true })
      const setDirectory = join(candidateDirectory, candidateSetId)
      await mkdir(setDirectory, { recursive: true })
      const generated = await Promise.allSettled(PRESENTATION_STYLE_CANDIDATES.map(async style => {
        const prompt = `${sharedPrompt}\n\nStyle option ${style.label}: ${presentationStylePrompt(style.id)}\n\nExplicit user requirements and the supplied master take precedence over this option's suggested palette and typography. Vary the visual treatment within those constraints.`
        const outputPath = join(setDirectory, `${style.id}.png`)
        const result = await dispatch(exec, references.length ? 'edit_image' : 'generate_image', { prompt, output_path: outputPath, aspect_ratio: presentationAspectRatio(specification.width, specification.height), concurrency: limit, ...(references.length ? { input_paths: references.map(reference => reference.path) } : {}) })
        const imagePath = await workspacePath(root, result.path)
        const imageHash = hash(await readFile(imagePath))
        const receipt = JSON.parse(await readFile(await workspacePath(root, imagePath + '.generation.json'), 'utf8'))
        if (receipt.sha256 !== imageHash || result.sha256 && result.sha256 !== imageHash || receipt.prompt !== prompt || JSON.stringify(receipt.inputImageHashes ?? []) !== JSON.stringify(references.map(reference => reference.sha256))) throw new Error(`${style.label} candidate generation receipt does not match its image, prompt or references.`)
        return { style, prompt, imagePath, imageHash, attachment: result.attachment ?? result.image, previewWarning: result.previewWarning }
      }))
      const completed = generated.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
      if (completed.length) await recordVisualAssets(root, completed.map(item => ({
        manifest: manifestPath, image: item.imagePath, assetId: `style-${item.style.id}-${candidateSetId.slice(0, 8)}`, role: 'style-candidate',
        slideNumber: representativePage, sourceKind: 'generated', styleReferenceIds: referenceIds, styleId: item.style.id, candidateSetId,
        originalPrompt: contentPrompt, combinedPrompt: item.prompt, stylePrompt: presentationStylePrompt(item.style.id),
      })))
      const failed = generated.flatMap((result, index) => result.status === 'rejected' ? [`${PRESENTATION_STYLE_CANDIDATES[index]!.label}: ${result.reason instanceof Error ? result.reason.message : 'generation failed'}`] : [])
      if (failed.length) throw new Error(`Style candidate set ${candidateSetId} is incomplete (${completed.length}/4 images registered). ${failed.join('; ')}`)
      if (hash(await readFile(specPath)) !== hash(specBytesBefore)) throw new Error('The presentation specification changed while style candidates were generating; review the registered candidate images and rerun this tool.')
      return withPresentationLock(state.dir, async () => {
        const current = await currentBinding(exec, initial), currentSpec = await readSpecification(root, current.spec), currentManifest = await readManifest(root, current.manifest)
        const candidates: PresentationStyleCandidate[] = completed.map(item => {
          const assetId = `style-${item.style.id}-${candidateSetId.slice(0, 8)}`
          const asset = currentManifest.assets.find(entry => entry.assetId === assetId)
          if (!asset || asset.sha256 !== item.imageHash) throw new Error(`Registered style candidate ${assetId} is missing or changed.`)
          return { id: item.style.id, label: item.style.label, assetId, candidateSetId, sha256: asset.sha256 }
        })
        validateStyleCandidateSet(candidates)
        delete currentSpec.selectedStyleId; delete currentSpec.selectedStylePrompt
        currentSpec.styleCandidates = candidates
        currentSpec.promptApprovalRequired = true
        delete currentManifest.selectedStyleAssetId; delete currentManifest.styleReview
        await saveJson(current.manifest, currentManifest)
        await saveJson(current.spec, currentSpec)
        delete current.promptApproval
        current.promptCompilationRequired = true
        await persist(exec, current)
        return JSON.stringify({ candidateSetId, representativePage, aspectRatio: presentationAspectRatio(currentSpec.width, currentSpec.height), nextStep: 'Show all four preview images and wait for the user to select one; then call presentation_select_style.', candidates: candidates.map((candidate, index) => {
          const generated = completed[index]!, destination = generated.imagePath.replace(/\\/gu, '/').replace(/[%<>\r\n]/gu, character => encodeURIComponent(character))
          return { ...candidate, path: generated.imagePath, receiptPath: generated.imagePath + '.generation.json', previewMarkdown: `![${candidate.label}](<${destination}>)`, ...(generated.attachment ? { attachment: generated.attachment } : {}), ...(generated.previewWarning ? { previewWarning: generated.previewWarning } : {}) }
        }) })
      })
    },
  }))
  ctx.tools.register(defineTool({
    name: 'presentation_write_prompt_document',
    description: 'Compile a rich per-page prompt Markdown document from the specification and research source manifest without another model call. Each slides[] may include originalPrompt, analysisPrompt, purpose, takeaway, layout, visualBrief, chartBrief, typography, immutableFacts, negativeConstraints, speakerNotes, confidence, reviewItems and editablePlanPrompt. Omit markdown to compile and bind exact combinedPrompt values used by presentation_generate_fast. Explicit markdown remains supported for existing workflows.',
    parameters: { spec_path: { type: 'string', required: true }, output_path: { type: 'string', required: true }, markdown: { type: 'string' }, style_id: { type: 'string' } },
    output,
    execute: async (args, exec) => {
      const root = cwd(exec), specPath = await workspacePath(root, args.spec_path), outputPath = await workspacePath(root, args.output_path)
      const specification = await readSpecification(root, args.spec_path)
      const binding = await load(exec)
      if (binding && resolve(root, binding.spec) === specPath) requireSelectedStyle(binding, specification)
      if (specPath === outputPath || outputPath === resolve(root, specification.sourceManifestPath ?? args.spec_path)) throw new Error('Prompt output must be separate from specification and source manifest.')
      if (typeof args.style_id === 'string' && args.style_id.trim()) {
        const requestedStyle = args.style_id.trim()
        if (specification.styleCandidates && requestedStyle !== specification.selectedStyleId) throw new Error('Call presentation_select_style before compiling prompts for a generated style-candidate set.')
        specification.selectedStyleId = requestedStyle
      }
      let markdown: string
      let promptSummary: Array<{ page: number; characters: number; missing: string[] }> = []
      if (typeof args.markdown !== 'string' || !args.markdown.trim()) {
        const state = await load(exec)
        if (!state || resolve(root, state.spec) !== specPath) throw new Error('Bind the specification using presentation_prepare before compiling its prompt document.')
        const visualManifest = await readManifest(root, state.manifest)
        const research = specification.sourceManifestPath ? validateResearchSources(JSON.parse(await readFile(await workspacePath(root, specification.sourceManifestPath), 'utf8')), specification.slides.length) : undefined
        const compiled = compilePresentationPrompts(specification, visualManifest, research)
        for (const item of compiled.slides) Object.assign(specification.slides[item.page - 1]!, { originalPrompt: item.originalPrompt, analysisPrompt: item.analysisPrompt, combinedPrompt: item.combinedPrompt, editablePlanPrompt: item.editablePlanPrompt })
        specification.promptDocumentFormat = 'structured-v1'
        markdown = compiled.markdown
        promptSummary = compiled.slides.map(item => ({ page: item.page, characters: item.combinedPrompt.length, missing: item.missing }))
      } else {
        markdown = args.markdown
        delete specification.promptDocumentFormat
      }
      await writeFile(outputPath, markdown, 'utf8')
      specification.promptApprovalRequired = true
      specification.promptDocumentPath = relative(root, outputPath).replace(/\\/gu, '/')
      await saveJson(specPath, specification)
      const state = await load(exec)
      if (state && resolve(root, state.spec) === specPath) await withPresentationLock(state.dir, async () => { const current = await currentBinding(exec, state); delete current.promptApproval; delete current.promptCompilationRequired; await persist(exec, current) })
      return JSON.stringify({ specPath, promptDocumentPath: outputPath, specificationSha256: hash(await readFile(specPath)), promptDocumentSha256: hash(await readFile(outputPath)), styleId: specification.selectedStyleId, promptSummary })
    },
  }))
  ctx.tools.register(defineTool({ name: 'presentation_write_source_manifest', description: 'Save literature and web research provenance for a deck. Each source requires id, title, citation, sourceType, verification and claims (bibliography-only: []). Use only the published enum values and actual evidence level; never upgrade an unverified source to bypass validation. Map claims to one-based slideNumbers. This file is included in the prompt confirmation hash. Correct only invalid source fields and retry; keep the selected style, content and existing assets.', parameters: { spec_path: { type: 'string', required: true }, output_path: { type: 'string', required: true, description: 'Workspace-relative JSON destination, separate from the specification, visual manifest, prompt document and workflow journal.' }, topic: { type: 'string', required: true }, queries: { type: 'array', items: { type: 'string' }, required: true }, time_budget_seconds: { type: 'integer' }, sources: { type: 'array', required: true, items: { type: 'object', additionalProperties: true, properties: researchSourceParameters } } }, output, execute: async (args, exec) => {
    const root = cwd(exec), specPath = await workspacePath(root, args.spec_path), outputPath = await workspacePath(root, args.output_path)
    const specification = await readSpecification(root, args.spec_path)
    const state = await load(exec)
    const protectedPaths = [specPath, ...(specification.promptDocumentPath ? [await workspacePath(root, specification.promptDocumentPath)] : []), ...(state ? [await workspacePath(root, state.manifest), await workspacePath(root, state.journal)] : [])]
    if (protectedPaths.includes(outputPath)) throw new Error('Research source output must be separate from the specification, visual manifest, prompt document and workflow journal.')
    const manifest = validateResearchSources({ topic: args.topic, queries: args.queries, timeBudgetSeconds: args.time_budget_seconds, sources: args.sources }, specification.slides.length)
    await saveJson(outputPath, manifest)
    specification.sourceManifestPath = args.output_path
    specification.researchSourcesRequired = true
    specification.promptApprovalRequired = true
    await saveJson(specPath, specification)
    return JSON.stringify({ path: outputPath, sha256: hash(await readFile(outputPath)), queryCount: manifest.queries.length, sourceCount: manifest.sources.length, checkedSourceCount: manifest.sources.filter(source => ['full-text-checked', 'abstract-checked', 'official-source'].includes(source.verification)).length, timeBudgetSeconds: manifest.timeBudgetSeconds })
  } }))
  ctx.tools.register(defineTool({ name: 'presentation_select_style', description: 'Select a reviewed style candidate and invalidate any prior prompt approval until the prompt document is confirmed again.', parameters: { style_id: { type: 'string', required: true }, spec_path: { type: 'string' } }, output, execute: async (args, exec) => {
    const root = cwd(exec), state = await bound(exec), specPath = await workspacePath(root, args.spec_path ?? state.spec), selectedStyleId = String(args.style_id).trim()
    if (resolve(root, specPath) !== resolve(root, state.spec)) throw new Error('Select a style only for the presentation currently bound by presentation_prepare.')
    return withPresentationLock(state.dir, async () => {
      const current = await currentBinding(exec, state), specification = await readSpecification(root, current.spec), manifest = await readManifest(root, current.manifest)
      let selected: PresentationStyleCandidate | undefined
      if (current.styleSelectionRequired && !specification.styleCandidates) throw new Error('PRESENTATION_STYLE_CANDIDATES_REQUIRED: Generate and show all four representative images before selecting a style.')
      if (specification.styleCandidates) {
        validateStyleCandidateSet(specification.styleCandidates)
        selected = specification.styleCandidates.find(candidate => candidate.id === selectedStyleId)
        if (!selected) throw new Error(`Unknown style candidate ${selectedStyleId}.`)
        for (const candidate of specification.styleCandidates) {
          const asset = manifest.assets.find(entry => entry.assetId === candidate.assetId)
          if (!asset || asset.role !== 'style-candidate' || asset.sourceKind !== 'generated' || asset.styleId !== candidate.id || asset.candidateSetId !== candidate.candidateSetId || asset.sha256 !== candidate.sha256) throw new Error(`Style candidate ${candidate.id} is missing or no longer matches the registered asset.`)
          const imagePath = await workspacePath(root, asset.path), imageHash = hash(await readFile(imagePath))
          const receipt = JSON.parse(await readFile(await workspacePath(root, imagePath + '.generation.json'), 'utf8'))
          if (imageHash !== candidate.sha256 || receipt.sha256 !== candidate.sha256) throw new Error(`Style candidate ${candidate.id} changed after generation; generate a new candidate set.`)
        }
        specification.selectedStylePrompt = presentationStylePrompt(selectedStyleId)
        manifest.selectedStyleAssetId = selected.assetId
        delete manifest.styleReview
      }
      specification.selectedStyleId = selectedStyleId
      specification.promptApprovalRequired = true
      await saveJson(current.spec, specification)
      if (selected) await saveJson(current.manifest, manifest)
      delete current.promptApproval
      current.promptCompilationRequired = true
      await persist(exec, current)
      return JSON.stringify({ selectedStyleId, ...(selected ? { selectedCandidate: selected, selectedStylePrompt: specification.selectedStylePrompt } : {}), approvalInvalidated: true })
    })
  } }))
  ctx.tools.register(defineTool({ name: 'presentation_confirm_plan', description: 'Confirm the prompt document, selected style and source manifest by SHA-256 before formal page generation.', parameters: { prompt_document_path: { type: 'string', required: true }, style_id: { type: 'string' } }, output, execute: async (args, exec) => {
    const initial = await bound(exec), root = cwd(exec), promptPath = await workspacePath(root, args.prompt_document_path)
    return withPresentationLock(initial.dir, async () => {
      const state = await currentBinding(exec, initial), specification = await readSpecification(root, state.spec), promptBytes = await readFile(promptPath)
      if (!promptBytes.toString('utf8').trim()) throw new Error('PRESENTATION_PROMPT_DOCUMENT_EMPTY: Write a non-empty prompt document before confirming the plan.')
      if (specification.promptDocumentPath && resolve(root, specification.promptDocumentPath) !== promptPath) throw new Error('The confirmed prompt document does not match specification.promptDocumentPath.')
      if (specification.templateSource && hash(await readFile(await workspacePath(root, specification.templateSource.path))) !== specification.templateSource.sha256) throw new Error('PRESENTATION_TEMPLATE_CHANGED: 客户 PPTX 母版已变化，请重新运行 presentation_prepare 分析母版并确认提示词。')
      if (specification.researchSourcesRequired && !specification.sourceManifestPath) throw new Error('Write presentation-sources.json before confirming the research-backed prompt plan.')
      requireSelectedStyle(state, specification)
      if (state.promptCompilationRequired) throw new Error('PRESENTATION_PROMPT_RECOMPILE_REQUIRED: 风格已变化，请调用 presentation_write_prompt_document 更新逐页提示词，再确认计划。')
      if (specification.styleCandidates) {
        validateStyleCandidateSet(specification.styleCandidates)
        if (!specification.selectedStyleId || !specification.styleCandidates.some(candidate => candidate.id === specification.selectedStyleId)) throw new Error('Select one of the four generated style candidates before confirming the plan.')
      }
      const styleId = typeof args.style_id === 'string' && args.style_id.trim() ? args.style_id.trim() : specification.selectedStyleId
      if (specification.selectedStyleId && styleId !== specification.selectedStyleId) throw new Error('The confirmed style does not match specification.selectedStyleId.')
      const generationPlan = specification.promptDocumentFormat === 'structured-v1' ? {
        promptMode: 'confirmed-document',
        instruction: 'After user confirmation, call presentation_generate_templates or presentation_generate_fast with page, output_path and asset_id. Omit prompt: the server binds each page to this confirmed document. Never compose a replacement prompt or use an empty prompt as page content.',
        pages: specification.slides.map((slide, index) => {
          if (typeof slide.combinedPrompt !== 'string' || !slide.combinedPrompt.trim()) throw new Error(`PRESENTATION_PROMPT_MISSING: Page ${index + 1} has no compiled prompt. Run presentation_write_prompt_document before confirming.`)
          return { page: index + 1, promptSha256: hash(slide.combinedPrompt) }
        }),
      } : undefined
      specification.promptApprovalRequired = true
      specification.promptDocumentPath = relative(root, promptPath).replace(/\\/gu, '/')
      await saveJson(state.spec, specification)
      const specBytes = await readFile(await workspacePath(root, state.spec)), manifest = await readManifest(root, state.manifest)
      const researchManifestSha256 = specification.sourceManifestPath ? hash(await readFile(await workspacePath(root, specification.sourceManifestPath))) : undefined
      state.promptApproval = { specificationSha256: hash(specBytes), promptDocumentSha256: hash(promptBytes), sourceManifestSha256: sourceManifestFingerprint(manifest, manifest.assets.map(asset => asset.assetId)), sourceAssetIds: manifest.assets.map(asset => asset.assetId), ...(researchManifestSha256 ? { researchManifestSha256 } : {}), ...(styleId ? { styleId } : {}), confirmedAt: new Date().toISOString() }
      await persist(exec, state)
      return JSON.stringify({ confirmed: true, ...state.promptApproval, ...(generationPlan ? { generationPlan } : {}) })
    })
  } }))
  ctx.tools.register(defineTool({
    name: 'presentation_confirm_editable_samples',
    description: 'Confirm the rendered representative page(s) of a new editable deck after the user has inspected native text, layout, fonts and raster edit boundaries. Required before generating, planning or building other pages.',
    parameters: { confirmed: { type: 'boolean', required: true }, observations: { type: 'string', required: true } },
    output,
    execute: async (args, exec) => {
      if (!args.confirmed || args.observations.trim().length < 20) throw new Error('Record explicit user confirmation and concrete observations for the rendered representative pages.')
      const initial = await bound(exec)
      return withPresentationLock(initial.dir, async () => {
        const state = await currentBinding(exec, initial), specification = await readSpecification(cwd(exec), state.spec), current = await project(exec, state)
        if (state.mode !== 'new' || state.outputMode !== 'editable') throw new Error('Representative-page confirmation applies only to new editable presentations.')
        await sync(exec, state)
        const pages: Record<string, string> = {}
        for (const page of state.editableRepresentativePages ?? [1]) {
          const job = state.pageJobs?.[page], plan = state.templatePlans?.[page], snapshot = current.snapshots[page - 1], entry = state.pages[page]
          if (!specification.slides[page - 1] || !job || job.status !== 'complete' || !job.asset || !plan || plan.templateAssetId !== job.asset.assetId || !snapshot || job.builtFingerprint !== snapshot.fingerprint) throw new Error(`Representative page ${page} must have a completed native editable build before confirmation.`)
          if (!entry || entry.checks.ppt_check?.fingerprint !== entry.fingerprint || entry.checks.ppt_render?.fingerprint !== entry.fingerprint || !await currentScreenshot(exec, entry.checks.ppt_render)) throw new Error(`Representative page ${page} must have current PPT check and rendered preview evidence before confirmation.`)
          pages[page] = snapshot.fingerprint
        }
        state.editableApproval = { pages, observations: args.observations.trim(), confirmedAt: new Date().toISOString() }
        state.phase = 'editable-samples-approved'; await persist(exec, state)
        return JSON.stringify({ confirmed: true, representativePages: Object.keys(pages).map(Number), observations: state.editableApproval.observations })
      })
    },
  }))
  ctx.tools.register(defineTool({
    name: 'presentation_write_component_manifest',
    description: 'Write the page component manifest used by high-fidelity editable reconstruction. Keep text, shapes, tables, charts, images and complex-raster fallbacks with bbox, sourceRegion, z-order, confidence and OCR evidence.',
    parameters: {
      output_path: { type: 'string' }, source: { type: 'string' }, source_sha256: { type: 'string' },
      pages: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        page: { type: 'integer', required: true }, components: { type: 'array', required: true, items: { type: 'json' } },
      } } },
    },
    output,
    execute: async (args, exec) => {
    const initial = await bound(exec), root = cwd(exec), specification = await readSpecification(root, initial.spec), outputPath = await workspacePath(root, args.output_path ?? join(initial.dir, 'component-manifest.json'))
    const pages: Record<string, PresentationComponent[]> = {}, ids = new Set<string>()
    for (const page of args.pages) {
      if (!Number.isInteger(page.page) || !specification.slides[page.page - 1]) throw new Error('Component manifest page is outside the presentation specification.')
      if (!Array.isArray(page.components) || page.components.length > 512) throw new Error('Each page accepts 1–512 components.')
      const components = page.components.map((component: any) => {
        const normalized = validateComponent(component, specification.width, specification.height)
        if (ids.has(`${page.page}:${normalized.id}`)) throw new Error(`Duplicate component ID ${normalized.id} on page ${page.page}.`)
        ids.add(`${page.page}:${normalized.id}`); return { ...normalized, page: page.page }
      })
      pages[String(page.page)] = components
    }
    let sourceSha256: string | undefined
    if (typeof args.source === 'string' && args.source.trim()) {
      const sourcePath = await workspacePath(root, args.source)
      sourceSha256 = hash(await readFile(sourcePath))
      if (args.source_sha256 && args.source_sha256 !== sourceSha256) throw new Error('Component manifest source checksum changed.')
    } else if (args.source_sha256 !== undefined) throw new Error('source_sha256 requires source.')
    const now = new Date().toISOString(), manifest: PresentationComponentManifest = { schemaVersion: 1, width: specification.width, height: specification.height, ...(args.source ? { source: args.source } : {}), ...(sourceSha256 ? { sourceSha256 } : {}), pages, createdAt: now, updatedAt: now }
    return withPresentationLock(initial.dir, async () => { const state = await currentBinding(exec, initial); await saveJson(outputPath, manifest); state.componentManifestPath = outputPath; await persist(exec, state); return JSON.stringify({ path: outputPath, sha256: hash(JSON.stringify(manifest)), pages: Object.keys(pages).map(Number) }) })
    },
  }))
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
  async function queueTemplates(exec: Exec, templates: { page: number; prompt?: string; output_path: string; asset_id: string; reference_asset_ids?: string[]; parent_asset_id?: string }[], limit?: number, fastOutputPath?: string) {
    const initial = await bound(exec), root = cwd(exec), concurrency = imageConcurrency(limit), taskId = randomUUID()
    const fastExportPath = fastOutputPath ? await workspacePath(root, fastOutputPath) : undefined
    if (fastExportPath && !fastExportPath.toLowerCase().endsWith('.pptx')) throw new Error('Fast image export path must end with .pptx.')
    const jobs = await withPresentationLock(initial.dir, async () => {
      const state = await currentBinding(exec, initial), spec = await readSpecification(root, state.spec), manifest = await readManifest(root, state.manifest)
      await requireCurrentPromptApproval(exec, state)
      requireEditableSampleApproval(state, spec, (await project(exec, state)).snapshots, templates.map(item => item.page))
      if (state.fastExportRunId === runId) throw new Error('A fast generation/export batch is already active. Read presentation_status or resume after it settles.')
      if (fastExportPath) await assertFastExportTarget(root, state, fastExportPath)
      if (fastExportPath && Object.values(state.pageJobs ?? {}).some(job => job.runId === runId && ['queued', 'generating', 'building', 'checking', 'rendering'].includes(job.status))) throw new Error('Wait for the current page batch before starting fast export.')
      if (fastExportPath && state.outputMode !== 'image') throw new Error('Fast progressive PPTX export is available for image-mode projects only.')
      if (!templates.length || templates.length > 128) throw new Error('Select 1–128 pages.')
      const paths = new Set<string>(), ids = new Set<string>(), pages = new Set<number>(), jobs: PageJob[] = []
      for (const item of templates) {
        if (!Number.isInteger(item.page) || !spec.slides[item.page - 1] || pages.has(item.page)) throw new Error('Select distinct pages inside the presentation specification.')
        if (activePages.has(state.journal + ':' + item.page) ||
          (state.pageJobs?.[item.page]?.runId === runId && ['queued', 'generating', 'building', 'checking', 'rendering'].includes(state.pageJobs[item.page]!.status))) throw new Error('A selected page already has an active task.')
        const target = await workspacePath(root, item.output_path)
        if (!/^[a-zA-Z0-9][\w.-]{0,127}$/u.test(item.asset_id) || ids.has(item.asset_id) || paths.has(target) || manifest.assets.some(asset => asset.assetId === item.asset_id || asset.path === target)
          || Object.values(state.pageJobs ?? {}).some(job => job.input.assetId === item.asset_id || job.input.outputPath === target)) throw new Error('Use unique new asset IDs and paths to preserve earlier versions.')
        const slide = spec.slides[item.page - 1]!
        const style = pageStyle(spec, item.page), referenceIds = [...new Set([...(item.reference_asset_ids ?? []), ...style.styleReferenceAssetIds, ...(spec.promptDocumentFormat === 'structured-v1' ? slide.assetIds ?? [] : [])])]
        const references = referenceIds.map(id => { const asset = manifest.assets.find(asset => asset.assetId === id); if (!asset) throw new Error('Unknown reference asset ' + id); return { assetId: id, path: asset.path, sha256: asset.sha256 } })
        if (references.length > 16) throw new Error('At most 16 reference images per page.')
        const useConfirmedPrompt = spec.promptDocumentFormat === 'structured-v1' && !item.parent_asset_id
        const compiledPrompt = useConfirmedPrompt && typeof slide.combinedPrompt === 'string' ? slide.combinedPrompt : undefined
        if (useConfirmedPrompt && (typeof compiledPrompt !== 'string' || !compiledPrompt.trim())) throw new Error(`PRESENTATION_PROMPT_MISSING: Page ${item.page} has no compiled prompt. Run presentation_write_prompt_document and confirm it before generation.`)
        // Some tool clients fill optional string fields with "". That is no
        // override: resolve the confirmed page prompt without changing its bytes.
        const suppliedPrompt = typeof item.prompt === 'string' && item.prompt.trim() ? item.prompt : undefined
        if (compiledPrompt !== undefined && suppliedPrompt !== undefined && suppliedPrompt !== compiledPrompt) throw new Error(`PRESENTATION_PROMPT_MISMATCH: Page ${item.page}: omit prompt to use the confirmed document; to change content, update presentation_write_prompt_document and ask the user to reconfirm before generating. No pages were queued.`)
        const rawPrompt = compiledPrompt ?? suppliedPrompt
        if (typeof rawPrompt !== 'string' || !rawPrompt.trim()) throw new Error(`PRESENTATION_PROMPT_MISSING: Page ${item.page}: provide a non-empty page prompt or compile and confirm presentation-prompts.md first.`)
        const prompt = compiledPrompt ?? (style.stylePrompt ? rawPrompt + '\n\n[Style reference]\n' + style.stylePrompt : rawPrompt)
        jobs.push({ taskId, runId, page: item.page, status: 'queued', concurrency, updatedAt: new Date().toISOString(),
          specFingerprint: hash(JSON.stringify({ slide: spec.slides[item.page - 1], style })),
          input: { prompt, promptBinding: { source: useConfirmedPrompt ? 'confirmed-document' : 'explicit', sha256: hash(prompt), ...(useConfirmedPrompt ? { promptDocumentSha256: state.promptApproval!.promptDocumentSha256 } : {}) }, originalPrompt: typeof slide.originalPrompt === 'string' && compiledPrompt ? slide.originalPrompt : rawPrompt, ...(typeof slide.analysisPrompt === 'string' ? { analysisPrompt: slide.analysisPrompt } : {}), ...(typeof slide.editablePlanPrompt === 'string' ? { editablePlanPrompt: slide.editablePlanPrompt } : {}), stylePrompt: style.stylePrompt ?? '', outputPath: target, assetId: item.asset_id, references, ...(item.parent_asset_id ? { parentAssetId: item.parent_asset_id } : {}) } })
        paths.add(target); ids.add(item.asset_id); pages.add(item.page)
      }
      state.pageJobs ??= {}
      for (const job of jobs) state.pageJobs[job.page] = job
      if (fastExportPath) { if (state.fastExportPath !== fastExportPath) delete state.fastExportSha256; state.fastExportPath = fastExportPath; state.fastExportRunId = runId; delete state.exportReceipt }
      state.phase = 'processing-pages'; await persist(exec, state); return jobs
    })
    launchPages(exec, initial, jobs, fastExportPath)
    return JSON.stringify({ taskId, pages: jobs.map(job => ({ page: job.page, status: 'queued', assetId: job.input.assetId, promptBinding: job.input.promptBinding })), concurrency, ...(fastExportPath ? { outputPath: fastExportPath, exportMode: 'progressive' } : {}) })
  }
  ctx.tools.register(defineTool({ name: 'presentation_generate_templates', description: 'Queue selected pages and return taskId immediately. Each page independently generates, saves, checks and renders. After the user confirms presentation_confirm_plan, pass only page, output_path and asset_id; the server loads the exact approved prompt for that page. Do not copy or rewrite prompt. New editable decks require representative-page confirmation before other pages can be queued. Global stylePrompt/styleReferenceAssetIds inherit with per-page overrides. References use edit_image. Read presentation_status for durable per-page results.', parameters: { templates: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { page: { type: 'integer', required: true }, prompt: { type: 'string', description: 'Legacy explicit prompt only. For a confirmed structured plan, OMIT this field; page selects the exact approved prompt. Empty/whitespace values also resolve to the approved prompt, never to empty content. A non-empty override must match exactly; content changes require document update and user reconfirmation.' }, output_path: { type: 'string', required: true }, asset_id: { type: 'string', required: true }, reference_asset_ids: { type: 'array', items: { type: 'string' } } } } }, concurrency: { type: 'integer', description: '1–10 concurrent pages; default 10.' } }, output, execute: async (args, exec) => queueTemplates(exec, args.templates, args.concurrency) }))
  ctx.tools.register(defineTool({ name: 'presentation_generate_fast', description: 'After user confirmation, omit templates[].prompt: each page is bound to the exact approved prompt on the server. Fast image-first workflow: queue up to 128 pages with up to 10 image requests in parallel, build each successful page, export a provisional PPTX after the first completed page, then refresh the same PPTX when the batch finishes. Automatic page QA/render is deferred; use presentation_check_pages later for selected pages. Read presentation_status for partial/final export receipts and failures.', parameters: { templates: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { page: { type: 'integer', required: true }, prompt: { type: 'string', description: 'Legacy explicit prompt only. For a confirmed structured plan, OMIT this field; page selects the exact approved prompt. Empty/whitespace values also resolve to the approved prompt, never to empty content. A non-empty override must match exactly; content changes require document update and user reconfirmation.' }, output_path: { type: 'string', required: true }, asset_id: { type: 'string', required: true }, reference_asset_ids: { type: 'array', items: { type: 'string' } } } } }, output_path: { type: 'string', description: 'Workspace-relative PPTX destination; default is <project>/presentation.pptx.' }, concurrency: { type: 'integer', description: '1–10 parallel image requests; default 10.' } }, output, execute: async (args, exec) => { const state = await bound(exec); return queueTemplates(exec, args.templates, args.concurrency, args.output_path ?? join(state.dir, 'presentation.pptx')) } }))
  ctx.tools.register(defineTool({ name: 'presentation_resume_pages', description: 'Manually resume only explicitly selected failed/interrupted pages. Reuse completed generation receipts without charging again. Never automatically retries on restart.', parameters: { pages: { type: 'array', required: true, items: { type: 'integer' } }, concurrency: { type: 'integer' } }, output, execute: async (args, exec) => {
    const initial = await bound(exec), concurrency = imageConcurrency(args.concurrency)
    const jobs = await withPresentationLock(initial.dir, async () => {
      const state = await currentBinding(exec, initial)
      await requireCurrentPromptApproval(exec, state)
      if (state.fastExportRunId === runId) throw new Error('Fast generation/export is still active; wait before resuming failed pages.')
      if (!args.pages.length || new Set(args.pages).size !== args.pages.length) throw new Error('Explicitly select distinct interrupted pages.')
      const specification = await readSpecification(cwd(exec), state.spec)
      requireEditableSampleApproval(state, specification, (await project(exec, state)).snapshots, args.pages)
      const jobs = args.pages.map(page => {
        const job = state.pageJobs?.[page]
        if (!job || !['failed', 'interrupted', 'awaiting-editable'].includes(job.status) || activePages.has(state.journal + ':' + page)) throw new Error('Only selected failed, interrupted or awaiting-editable pages can resume.')
        return { ...job, runId, concurrency, status: 'queued' as const, error: undefined, updatedAt: new Date().toISOString() }
      })
      if (state.fastExportPath) { await assertFastExportTarget(cwd(exec), state, state.fastExportPath); state.fastExportRunId = runId }
      for (const job of jobs) state.pageJobs![job.page] = job
      await persist(exec, state); return jobs
    })
    launchPages(exec, initial, jobs, initial.fastExportPath)
    return JSON.stringify({ pages: jobs.map(job => ({ page: job.page, taskId: job.taskId, status: 'queued' })) })
  } }))
  ctx.tools.register(defineTool({ name: 'presentation_plan_editable_pages', description: 'Persist native PPTD element plans (elementId, elementType, bounds plus complete text/shape/line/image/table/chart fields). Images reference registered asset IDs using src. No whole-page bitmap can satisfy an editable page.', parameters: { plans: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { page: { type: 'integer', required: true }, template_asset_id: { type: 'string' }, elements: { type: 'array', required: true, items: { type: 'json' } } } } } }, output, execute: async (args, exec) => {
    const initial = await bound(exec)
    return withPresentationLock(initial.dir, async () => {
      const state = await currentBinding(exec, initial), spec = await readSpecification(cwd(exec), state.spec), manifest = await readManifest(cwd(exec), state.manifest)
      await requireCurrentPromptApproval(exec, state)
      if (state.outputMode !== 'editable') throw new Error('Set output_mode=editable in presentation_prepare for an editable project.')
      requireEditableSampleApproval(state, spec, (await project(exec, state)).snapshots, args.plans.map((plan: any) => plan.page))
      state.templatePlans ??= {}
      for (const plan of args.plans) {
        if (!spec.slides[plan.page - 1]) throw new Error('Page is outside the specification.')
        const template = pageTemplate(manifest, plan.page, state.outputMode, plan.template_asset_id)
        if (!template) throw new Error(`Page ${plan.page}: generate and visually review a full-slide template before editable conversion.`)
        // Template review remains an advisory record; the selected page can be edited immediately.
        state.templatePlans[plan.page] = validateEditablePagePlan(plan.page, plan.elements as Record<string, any>[], template.assetId)
      }
      const componentPath = await workspacePath(cwd(exec), state.componentManifestPath ?? join(state.dir, 'component-manifest.json'))
      let componentManifest: PresentationComponentManifest
      try { componentManifest = JSON.parse(await readFile(componentPath, 'utf8')) as PresentationComponentManifest } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        const now = new Date().toISOString(); componentManifest = { schemaVersion: 1, width: spec.width, height: spec.height, pages: {}, createdAt: now, updatedAt: now }
      }
      for (const plan of args.plans) {
        const existing = new Map((componentManifest.pages[String(plan.page)] ?? []).map(component => [component.id, component]))
        componentManifest.pages[String(plan.page)] = (plan.elements as Record<string, any>[]).map((element, index) => validateComponent({ ...componentFromElement(plan.page, element, index), ...(existing.get(String(element.elementId)) ?? {}) }, spec.width, spec.height))
      }
      componentManifest.updatedAt = new Date().toISOString(); await saveJson(componentPath, componentManifest); state.componentManifestPath = componentPath
      state.phase = 'planned-editable'; await persist(exec, state); return JSON.stringify(state.templatePlans)
    })
  } }))
  ctx.tools.register(defineTool({ name: 'presentation_record_asset', description: 'Register a generated, literature, project/user or derived image with exact source provenance and generation receipt.', parameters: { manifest_path: { type: 'string', required: true }, ...assetParameters }, output, execute: async (args, exec) => JSON.stringify(await recordVisualAssets(cwd(exec), [assetInput(args.manifest_path, args)])) }))
  ctx.tools.register(defineTool({ name: 'presentation_record_assets', description: 'Atomically register up to 128 images. Preserve source file/page/figure/citation/hash and target slides; generated images retain original prompt.', parameters: { manifest_path: { type: 'string', required: true }, assets: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: assetParameters } } }, output, isConcurrencySafe: () => true, execute: async (args, exec) => JSON.stringify(await recordVisualAssets(cwd(exec), args.assets.map(item => assetInput(args.manifest_path, item)))) }))
  ctx.tools.register(defineTool({ name: 'presentation_build_pages', description: 'Build selected PPTD pages through ppt_edit. Image mode uses one complete PNG per page; editable mode uses planned native objects. Copies original scientific images byte-for-byte into media, and writes prompt/source provenance to notes and PPTD manifest.', parameters: { pages: { type: 'array', items: { type: 'integer' } } }, output, execute: async (args, exec) => {
    const initial = await bound(exec)
    return withPresentationLock(initial.dir, async () => {
      const state = await currentBinding(exec, initial), root = cwd(exec), spec = await readSpecification(root, state.spec), assetsManifest = await readManifest(root, state.manifest), current = await project(exec, state)
      await requireCurrentPromptApproval(exec, state)
      const research = spec.sourceManifestPath ? validateResearchSources(JSON.parse(await readFile(await workspacePath(root, spec.sourceManifestPath), 'utf8')), spec.slides.length) : undefined
      const pages = [...new Set(args.pages ?? spec.slides.map((_, i) => i + 1))].sort((a, b) => a - b), ops: any[] = [], receipts: any[] = [], templateReceipts: any[] = []
      requireEditableSampleApproval(state, spec, current.snapshots, pages)
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
          for (const element of elements) if (element.elementType === 'image') { const asset = [...pageAssets, template].find(asset => asset.assetId === element.src || asset.path === element.src); if (!asset) throw new Error(`Image ${element.elementId} must reference a registered page asset or the reviewed page template.`); element.src = media.get(asset.assetId) }
        }
        const content = { elements, notes: notes(slide.speakerNotes ?? slide.notes, allAssets, page, research), ...(slide.background === undefined ? {} : { background: slide.background }) }
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
      await saveJson(provenanceFile, { schemaVersion: 2, workspaceRoot: await realpath(root), specificationFingerprint: hash(JSON.stringify(spec)), spec: relative(root, state.spec), assetsManifest: relative(root, state.manifest), mode: state.mode, outputMode: state.outputMode, ...(state.componentManifestPath ? { componentManifest: relative(root, state.componentManifestPath) } : {}),
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
  installReconstructionWorkflow(ctx, { cwd, bound, currentBinding, persist, project, dispatch, sync })
}
