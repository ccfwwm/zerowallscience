import { createHash, randomUUID } from 'node:crypto'
import { lstat, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import sharp from 'sharp'
import { installPresentationWorkflow } from './presentation-workflow.js'
import type { Context } from '@deepseek-ai/cordis'

export type SourceKind = 'generated' | 'literature' | 'user' | 'derived'
export interface SourceReference { path?: string; sha256?: string; page?: number; figure?: string; citation?: string; url?: string }
export interface VisualAsset {
  assetId: string; role: string; slideNumber?: number; slideNumbers?: number[]; path: string; sha256: string
  mediaType: string; width: number; height: number; sourceKind?: SourceKind; source?: SourceReference
  model?: string; providerId?: string; groupId?: string; requestedQuality?: string; actualQuality?: string
  requestedSize?: string; prompt?: string; promptHash?: string; inputImageHashes: string[]; styleReferenceIds: string[]
  sourceSeedPath?: string; revisedPrompt?: string; createdAt: string; parentAssetId?: string
  originalPrompt?: string; combinedPrompt?: string; stylePrompt?: string; referenceImageHashes?: string[]
}
export interface VisualManifest {
  schemaVersion: 1 | 2; assets: VisualAsset[]; selectedStyleAssetId?: string; styleReview?: string
  assetReviews?: Record<string, string | { sha256: string; observations: string; reviewedAt: string }>
  templateReviews?: Record<string, TemplateReview>
  // Failed bytes remain failed across asset aliases and metadata replacement.
  // Keep the page/spec evidence as well as the content hash for repair lineage.
  templateFailures?: Record<string, TemplateReview>
}
export interface TemplateReview {
  schemaVersion: 1; sha256: string; status: 'passed' | 'repair-required'
  textIntegrity: 'pass' | 'fail'; layout: 'pass' | 'fail'; contentAccuracy: 'pass' | 'fail'
  observations: string; issues: string[]; reviewedAt: string
  page: number; specFingerprint: string; textTranscription: string[]
}
export interface SlideSpecification {
  purpose?: string; text?: string[]; assetIds?: string[]; source?: string; notes?: string; svg?: string
  stylePrompt?: string; styleReferenceAssetIds?: string[]
  [key: string]: unknown
}
export interface PresentationSpecification { width: number; height: number; fonts: object; palette: object; slides: SlideSpecification[]; stylePrompt?: string; styleReferenceAssetIds?: string[]; [key: string]: unknown }
export interface AssetInput {
  manifest: string; image: string; assetId: string; role: string; slideNumber?: number; slideNumbers?: number[]
  styleReferenceIds?: string[]; sourceSeedPath?: string; sourceKind?: SourceKind; source?: SourceReference; parentAssetId?: string
  originalPrompt?: string; combinedPrompt?: string; stylePrompt?: string; referenceImageHashes?: string[]
}
export const hash = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex')
export async function workspacePath(cwd: string, path: string): Promise<string> {
  const root = await realpath(cwd), target = resolve(root, path), rel = relative(root, target)
  if (rel === '..' || rel.startsWith('..\\') || rel.startsWith('../') || isAbsolute(rel)) throw new Error('Visual artifacts must stay inside the current workspace.')
  const parentRel = relative(root, await realpath(dirname(target)))
  if (parentRel === '..' || parentRel.startsWith('..\\') || parentRel.startsWith('../') || isAbsolute(parentRel)) throw new Error('Visual artifact directory escapes the workspace.')
  const info = await lstat(target).catch(error => { if (error.code === 'ENOENT') return undefined; throw error })
  if (info?.isSymbolicLink()) throw new Error('Visual artifacts cannot be symbolic links.')
  return target
}
const locks = new Map<string, Promise<unknown>>()
export async function withPresentationLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  const operation = (locks.get(key) ?? Promise.resolve()).catch(() => undefined).then(action)
  locks.set(key, operation)
  try { return await operation } finally { if (locks.get(key) === operation) locks.delete(key) }
}
export async function saveJson(path: string, value: unknown): Promise<void> {
  const temporary = path + `.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(value, null, 2))
  try {
    for (let attempt = 0; ; attempt++) {
      try { await rename(temporary, path); return }
      catch (error) {
        if (attempt >= 6 || !['EPERM', 'EBUSY', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
        // Windows readers/antivirus can briefly hold the destination open.
        await delay(10 * (attempt + 1))
      }
    }
  } finally { await unlink(temporary).catch(() => {}) }
}
export async function readManifest(cwd: string, path: string): Promise<VisualManifest> {
  const value = await readFile(await workspacePath(cwd, path), 'utf8').then(raw => JSON.parse(raw)).catch(error => {
    if (error.code === 'ENOENT') return { schemaVersion: 2, assets: [] }; throw error
  })
  if (![1, 2].includes(value.schemaVersion ?? 1) || !Array.isArray(value.assets)) throw new Error('Invalid visual manifest schema.')
  const templateFailures = { ...value.templateFailures }
  for (const review of Object.values(value.templateReviews ?? {}) as TemplateReview[]) if (review.status === 'repair-required') templateFailures[templateFailureKey(review)] = review
  return { ...value, schemaVersion: value.schemaVersion ?? 1, templateFailures }
}
export async function readSpecification(cwd: string, path: string): Promise<PresentationSpecification> {
  const spec = JSON.parse(await readFile(await workspacePath(cwd, path), 'utf8'))
  if (!Array.isArray(spec.slides) || !spec.slides.length || !Number.isFinite(spec.width) || spec.width <= 0 || !Number.isFinite(spec.height) || spec.height <= 0 || !spec.fonts || !spec.palette) throw new Error('presentation-spec.json requires width, height, fonts, palette and slides.')
  for (const slide of spec.slides) if (slide.assetIds !== undefined && (!Array.isArray(slide.assetIds) || slide.assetIds.some((id: unknown) => typeof id !== 'string'))) throw new Error('Slide assetIds must be an array of registered asset IDs.')
  for (const item of [spec, ...spec.slides]) {
    if (item.stylePrompt !== undefined && typeof item.stylePrompt !== 'string') throw new Error('stylePrompt must be a string.')
    if (item.styleReferenceAssetIds !== undefined && (!Array.isArray(item.styleReferenceAssetIds) || item.styleReferenceAssetIds.some((id: unknown) => typeof id !== 'string'))) throw new Error('styleReferenceAssetIds must be an array of asset IDs.')
  }
  return spec
}
export function pageStyle(spec: PresentationSpecification, page: number) {
  const slide = spec.slides[page - 1]
  if (!slide) throw new Error('Page is outside the presentation specification.')
  return { stylePrompt: slide.stylePrompt ?? spec.stylePrompt ?? '', styleReferenceAssetIds: slide.styleReferenceAssetIds ?? spec.styleReferenceAssetIds ?? [] }
}
export function assetsForPage(spec: PresentationSpecification, manifest: VisualManifest, page: number): VisualAsset[] {
  const slide = spec.slides[page - 1]
  if (!slide) throw new Error('Page is outside the presentation specification.')
  if (slide.assetIds) return slide.assetIds.map(id => {
    const asset = manifest.assets.find(item => item.assetId === id)
    if (!asset) throw new Error(`Page ${page}: unknown asset ${id}. Register it before compilation.`)
    if (asset.role === 'template') throw new Error(`Page ${page}: template asset ${id} is reference-only; reconstruct editable slide elements instead.`)
    return asset
  })
  const styleIds = pageStyle(spec, page).styleReferenceAssetIds
  return manifest.assets.filter(asset => (asset.slideNumber === page || asset.slideNumbers?.includes(page)) && !styleIds.includes(asset.assetId) && !['style-reference', 'style-candidate', 'content-seed', 'template'].includes(asset.role))
}
export function pagesForAsset(spec: PresentationSpecification, manifest: VisualManifest, assetId: string): number[] {
  return spec.slides.flatMap((_, i) => assetsForPage(spec, manifest, i + 1).some(asset => asset.assetId === assetId) ? [i + 1] : [])
}
export function assetsWithReferences(manifest: VisualManifest, assets: VisualAsset[]): VisualAsset[] {
  const result = new Map<string, VisualAsset>()
  function visit(asset: VisualAsset): void {
    if (result.has(asset.assetId)) return
    result.set(asset.assetId, asset)
    for (const id of [...(asset.styleReferenceIds ?? []), ...(asset.parentAssetId ? [asset.parentAssetId] : [])]) {
      const reference = manifest.assets.find(item => item.assetId === id)
      if (!reference) throw new Error(`Unknown source/style asset ${id}.`)
      visit(reference)
    }
  }
  assets.forEach(visit)
  return [...result.values()]
}
export function templateFailure(manifest: VisualManifest, sha256: string): TemplateReview | undefined {
  return [...Object.values(manifest.templateFailures ?? {}), ...Object.values(manifest.templateReviews ?? {})].find(review => review.sha256 === sha256 && review.status === 'repair-required')
}
function templateFailureKey(review: TemplateReview): string { return `${review.sha256}:${review.page}:${review.specFingerprint}` }
function repairsTemplateFailure(manifest: VisualManifest, asset: VisualAsset, failedSha256: string, visited = new Set<string>()): boolean {
  if (visited.has(asset.assetId) || asset.sha256 === failedSha256 || asset.sourceKind !== 'generated' || !asset.parentAssetId) return false
  visited.add(asset.assetId)
  const parent = manifest.assets.find(item => item.assetId === asset.parentAssetId)
  if (!parent || !asset.inputImageHashes.includes(parent.sha256)) return false
  return parent.sha256 === failedSha256 || repairsTemplateFailure(manifest, parent, failedSha256, visited)
}
function hasRequiredRepairLineage(manifest: VisualManifest, asset: VisualAsset, page: number, specFingerprint: string): boolean {
  const failures = Object.values(manifest.templateFailures ?? {}).filter(review => review.page === page && review.specFingerprint === specFingerprint)
  return !failures.length || failures.some(review => repairsTemplateFailure(manifest, asset, review.sha256))
}
export function hasAssetReview(manifest: VisualManifest, asset: VisualAsset): boolean {
  const review = manifest.assetReviews?.[asset.assetId]
  return typeof review === 'string' ? review.length >= 20 : !!review && review.sha256 === asset.sha256 && review.observations.length >= 20
}
export function hasTemplateReview(manifest: VisualManifest, asset: VisualAsset): boolean {
  const review = manifest.templateReviews?.[asset.assetId]
  return !templateFailure(manifest, asset.sha256) && !!review && review.schemaVersion === 1 && review.sha256 === asset.sha256 && review.status === 'passed'
    && [review.textIntegrity, review.layout, review.contentAccuracy].every(value => value === 'pass')
    && Array.isArray(review.issues) && review.issues.length === 0 && review.observations.trim().length >= 20
    && Number.isFinite(Date.parse(review.reviewedAt))
    && hasRequiredRepairLineage(manifest, asset, review.page, review.specFingerprint)
}
export async function requireTemplateReview(cwd: string, manifest: VisualManifest, asset: VisualAsset): Promise<TemplateReview> {
  if (!['slide-image', 'template'].includes(asset.role) || !hasTemplateReview(manifest, asset)
    || hash(await readFile(await workspacePath(cwd, asset.path))) !== asset.sha256) throw new Error(`Template ${asset.assetId} requires current SHA-256-bound text, layout and content review. Repair failed images with presentation_repair_templates and review the new image before building or editable conversion.`)
  return manifest.templateReviews![asset.assetId]!
}
export async function recordTemplateReview(cwd: string, manifestPath: string, assetId: string, expectedSha256: string, input: Omit<TemplateReview, 'schemaVersion' | 'sha256' | 'reviewedAt'>): Promise<TemplateReview> {
  const path = await workspacePath(cwd, manifestPath)
  return withPresentationLock(path, async () => {
    const manifest = await readManifest(cwd, path), asset = manifest.assets.find(item => item.assetId === assetId)
    if (!asset || !['slide-image', 'template'].includes(asset.role) || !/^[a-f0-9]{64}$/u.test(expectedSha256) || asset.sha256 !== expectedSha256
      || hash(await readFile(await workspacePath(cwd, asset.path))) !== expectedSha256) throw new Error('Template review target is missing, changed or not a full-page image.')
    if (!['passed', 'repair-required'].includes(input.status) || ![input.textIntegrity, input.layout, input.contentAccuracy].every(value => ['pass', 'fail'].includes(value))
      || !Array.isArray(input.issues) || input.issues.some(issue => typeof issue !== 'string' || !issue.trim()) || input.observations.trim().length < 20
      || !Number.isInteger(input.page) || input.page < 1 || !/^[a-f0-9]{64}$/u.test(input.specFingerprint) || !Array.isArray(input.textTranscription) || input.textTranscription.some(text => typeof text !== 'string')) throw new Error('Record concrete text, layout and content observations and explicit issue descriptions.')
    const passed = [input.textIntegrity, input.layout, input.contentAccuracy].every(value => value === 'pass') && input.issues.length === 0
    if (passed !== (input.status === 'passed') || !passed && input.issues.length === 0) throw new Error('Only three passing checks with no issues may pass; failures must list issues and require repair.')
    if (input.status === 'passed') {
      if (templateFailure(manifest, expectedSha256)) throw new Error('A failed image must be repaired with edit_image and reviewed as a new image; the same failed bytes cannot be marked passed.')
      if (!hasRequiredRepairLineage(manifest, asset, input.page, input.specFingerprint)) throw new Error('A failed page requires changed image bytes from edit_image with a receipt bound to the failed original; registering a fresh ID or unrelated generation cannot replace repair.')
    }
    const review: TemplateReview = { ...input, schemaVersion: 1, sha256: expectedSha256, reviewedAt: new Date().toISOString() }
    if (review.status === 'repair-required') manifest.templateFailures = { ...manifest.templateFailures, [templateFailureKey(review)]: review }
    manifest.templateReviews = { ...manifest.templateReviews, [assetId]: review }; await saveJson(path, manifest)
    return review
  })
}
export async function validatePresentationAssets(cwd: string, workflow: { spec: string; manifest: string; mode: 'new' | 'edit' }, page?: number) {
  const spec = await readSpecification(cwd, workflow.spec), manifest = await readManifest(cwd, workflow.manifest)
  for (const number of page === undefined ? spec.slides.map((_, i) => i + 1) : [page]) {
    if (!Number.isInteger(number) || number < 1) throw new Error('Page is outside the presentation specification.')
    for (const asset of assetsForPage(spec, manifest, number)) {
      if (hash(await readFile(await workspacePath(cwd, asset.path))) !== asset.sha256) throw new Error(`Asset ${asset.assetId} changed after review; register and review only affected assets/pages.`)
      if (asset.source?.path && hash(await readFile(await workspacePath(cwd, asset.source.path))) !== asset.source.sha256) throw new Error(`Source for ${asset.assetId} changed; verify provenance again.`)
      const parent = asset.parentAssetId && manifest.assets.find(item => item.assetId === asset.parentAssetId)
      if (!hasAssetReview(manifest, asset) && !(parent && asset.inputImageHashes[0] === parent.sha256 && hasAssetReview(manifest, parent))) throw new Error(`Asset ${asset.assetId} still requires current-chat visual review.`)
      if (parent && hash(await readFile(await workspacePath(cwd, parent.path))) !== parent.sha256) throw new Error(`Source asset ${parent.assetId} changed after derivation.`)
    }
  }
}
async function inspectAsset(cwd: string, input: AssetInput): Promise<VisualAsset> {
  if (!/^[a-zA-Z0-9][\w.-]{0,127}$/u.test(input.assetId)) throw new Error('asset_id must be a stable identifier of at most 128 characters.')
  const path = await workspacePath(cwd, input.image), bytes = await readFile(path)
  if (bytes.length > 64 * 1024 * 1024) throw new Error('Visual asset exceeds 64 MiB.')
  const metadata = await sharp(bytes, { failOn: 'error' }).metadata()
  if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '') || !metadata.width || !metadata.height) throw new Error('Visual asset must be a readable PNG, JPEG or WebP image.')
  const sourceKind = input.sourceKind ?? 'generated'
  const asset: VisualAsset = { assetId: input.assetId, role: input.role, ...(input.slideNumber === undefined ? {} : { slideNumber: input.slideNumber }), ...(input.slideNumbers === undefined ? {} : { slideNumbers: input.slideNumbers }), path, sha256: hash(bytes), mediaType: `image/${metadata.format}`, width: metadata.width, height: metadata.height, sourceKind, inputImageHashes: [], styleReferenceIds: input.styleReferenceIds ?? [], createdAt: new Date().toISOString() }
  for (const key of ['originalPrompt', 'combinedPrompt', 'stylePrompt', 'referenceImageHashes'] as const) if (input[key] !== undefined) (asset as any)[key] = input[key]
  if (sourceKind === 'generated') {
    const receipt = JSON.parse(await readFile(await workspacePath(cwd, path + '.generation.json'), 'utf8'))
    if (asset.sha256 !== receipt.sha256) throw new Error('Visual asset generation checksum mismatch.')
    for (const key of ['model', 'providerId', 'groupId', 'requestedQuality', 'actualQuality', 'requestedSize', 'prompt', 'promptHash', 'revisedPrompt', 'createdAt'] as const) if (receipt[key] !== undefined) asset[key] = receipt[key]
    asset.inputImageHashes = receipt.inputImageHashes ?? []
    if (input.parentAssetId) asset.parentAssetId = input.parentAssetId
    if (input.sourceSeedPath) asset.sourceSeedPath = await workspacePath(cwd, input.sourceSeedPath)
  } else if (sourceKind === 'derived') {
    const receipt = JSON.parse(await readFile(await workspacePath(cwd, path + '.derivation.json'), 'utf8'))
    if (receipt.sha256 !== asset.sha256 || !input.parentAssetId || input.parentAssetId !== receipt.parentAssetId || hash(await readFile(await workspacePath(cwd, receipt.sourcePath))) !== receipt.sourceSha256) throw new Error('Derived asset provenance or checksum mismatch.')
    asset.parentAssetId = receipt.parentAssetId; asset.inputImageHashes = [receipt.sourceSha256]
  } else {
    if (sourceKind === 'literature' && (!input.source?.path || !Number.isInteger(input.source.page) || input.source.page! < 1 || !input.source.citation)) throw new Error('Literature assets require source_path, source_page and citation; use the real source file, not an attachment filename as an ID.')
    asset.source = { ...input.source }
    if (input.source?.path) {
      const sourcePath = await workspacePath(cwd, input.source.path)
      asset.source.path = sourcePath; asset.source.sha256 = hash(await readFile(sourcePath))
    }
  }
  if (asset.slideNumbers?.some(page => !Number.isInteger(page) || page < 1) || (asset.slideNumber !== undefined && (!Number.isInteger(asset.slideNumber) || asset.slideNumber < 1))) throw new Error('Slide numbers must be positive integers.')
  return asset
}
function assetIdentity(asset: VisualAsset): string {
  const { createdAt: _createdAt, ...identity } = asset
  return JSON.stringify(identity)
}
export async function recordVisualAssets(cwd: string, inputs: AssetInput[]): Promise<{ assets: VisualAsset[]; changedAssetIds: string[] }> {
  if (!inputs.length || inputs.length > 128 || inputs.some(input => input.manifest !== inputs[0]!.manifest)) throw new Error('Register 1–128 assets in one manifest per batch.')
  const path = await workspacePath(cwd, inputs[0]!.manifest)
  const assets = await Promise.all(inputs.map(input => inspectAsset(cwd, input)))
  if (new Set(assets.map(asset => asset.assetId)).size !== assets.length) throw new Error('Duplicate asset IDs in one batch.')
  return withPresentationLock(path, async () => {
    const manifest = await readManifest(cwd, path), changedAssetIds: string[] = []
    for (const asset of assets) {
      const previous = manifest.assets.find(item => item.assetId === asset.assetId)
      if (previous && assetIdentity(previous) === assetIdentity(asset)) continue
      changedAssetIds.push(asset.assetId)
      manifest.assets = [...manifest.assets.filter(item => item.assetId !== asset.assetId), asset]
      manifest.assetReviews = { ...manifest.assetReviews }; delete manifest.assetReviews[asset.assetId]
      manifest.templateReviews = { ...manifest.templateReviews }; delete manifest.templateReviews[asset.assetId]
      for (const dependent of manifest.assets) if (dependent.parentAssetId === asset.assetId || dependent.sourceSeedPath === asset.path || dependent.styleReferenceIds?.includes(asset.assetId)) { delete manifest.assetReviews[dependent.assetId]; delete manifest.templateReviews[dependent.assetId] }
      if (asset.assetId === manifest.selectedStyleAssetId) delete manifest.styleReview
    }
    for (const asset of assets) {
      for (const id of [...asset.styleReferenceIds, ...(asset.parentAssetId ? [asset.parentAssetId] : [])]) if (!manifest.assets.some(item => item.assetId === id)) throw new Error(`Unknown source/style asset ${id}.`)
      if (asset.parentAssetId) {
        const parent = manifest.assets.find(item => item.assetId === asset.parentAssetId)!
        if (!asset.inputImageHashes.includes(parent.sha256)) throw new Error('Child image generation receipt must bind the original parent SHA-256.')
      }
    }
    manifest.schemaVersion = 2
    if (changedAssetIds.length) await saveJson(path, manifest)
    return { assets, changedAssetIds }
  })
}
export async function recordVisualAsset(cwd: string, input: AssetInput): Promise<VisualAsset> { return (await recordVisualAssets(cwd, [input])).assets[0]! }
export async function recordAssetReview(cwd: string, manifestPath: string, kind: 'style' | 'asset', target: string, observations: string): Promise<void> {
  const path = await workspacePath(cwd, manifestPath)
  await withPresentationLock(path, async () => {
    const manifest = await readManifest(cwd, path), asset = manifest.assets.find(item => item.assetId === target)
    if (!asset || hash(await readFile(await workspacePath(cwd, asset.path))) !== asset.sha256) throw new Error('Visual review target is missing or changed.')
    if (observations.trim().length < 20) throw new Error('Record concrete observations after viewing the actual image.')
    manifest.assetReviews = { ...manifest.assetReviews, [target]: { sha256: asset.sha256, observations, reviewedAt: new Date().toISOString() } }
    if (kind === 'style') { manifest.selectedStyleAssetId = target; manifest.styleReview = observations }
    manifest.schemaVersion = 2; await saveJson(path, manifest)
  })
}
export function installVisualAssets(ctx: Context): void { installPresentationWorkflow(ctx) }
