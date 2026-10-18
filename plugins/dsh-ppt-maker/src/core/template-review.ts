import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { parse } from 'yaml'
import type { Page, Presentation } from './pptd/schema.js'
import { ProjectError } from './project/store.js'

export interface TemplateVisualReview {
  schemaVersion: 1
  sha256: string
  status: 'passed' | 'repair-required'
  textIntegrity: 'pass' | 'fail'
  layout: 'pass' | 'fail'
  contentAccuracy: 'pass' | 'fail'
  observations: string
  issues: string[]
  reviewedAt: string
  page?: number
  specFingerprint?: string
  textTranscription?: string[]
}

export interface PageTemplateEvidence {
  page: number
  assetId: string
  assetSha256: string
  mediaPath: string
  pageFingerprint: string
  review: TemplateVisualReview
}

const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex')

function within(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

/** Resolve against the caller's authorized workspace, never a receipt's root. */
async function sourceFile(root: string, source: unknown): Promise<string> {
  if (typeof source !== 'string' || !source.trim()) throw new Error('missing source path')
  const target = path.resolve(root, source)
  if (!within(root, target) || !within(root, await realpath(path.dirname(target))) || (await lstat(target)).isSymbolicLink()) throw new Error('source path escapes workspace')
  return target
}

interface SourceAuthority {
  root: string
  spec: { width: number; height: number; slides: Array<{ text: string[] }> }
  manifest: { assets: any[]; templateReviews: Record<string, TemplateVisualReview>; templateFailures: Record<string, TemplateVisualReview> }
}

async function loadSourceAuthority(input: { dir: string; workspaceRoot?: string }, provenance: any): Promise<SourceAuthority> {
  try {
    if (!input.workspaceRoot || typeof provenance.workspaceRoot !== 'string') throw new Error('missing authorized workspace')
    const root = await realpath(input.workspaceRoot)
    if (await realpath(provenance.workspaceRoot) !== root || !within(root, await realpath(input.dir))) throw new Error('workspace binding changed')
    const [spec, manifest] = await Promise.all([provenance.spec, provenance.assetsManifest].map(async source => JSON.parse(await readFile(await sourceFile(root, source), 'utf8'))))
    if (provenance.specificationFingerprint !== sha256(JSON.stringify(spec)) || !Array.isArray(spec.slides) || !spec.slides.length
      || !Number.isFinite(spec.width) || !Number.isFinite(spec.height)
      || ![1, 2].includes(manifest.schemaVersion) || !Array.isArray(manifest.assets)
      || !manifest.templateReviews || typeof manifest.templateReviews !== 'object' || Array.isArray(manifest.templateReviews)
      || (manifest.templateFailures !== undefined && (!manifest.templateFailures || typeof manifest.templateFailures !== 'object' || Array.isArray(manifest.templateFailures)))) throw new Error('source specification or ledger changed')
    manifest.templateFailures ??= {}
    for (const review of [...Object.values(manifest.templateReviews), ...Object.values(manifest.templateFailures)] as TemplateVisualReview[]) {
      if (!review || !/^[a-f0-9]{64}$/i.test(review.sha256) || !['passed', 'repair-required'].includes(review.status)
        || !Number.isInteger(review.page) || !/^[a-f0-9]{64}$/i.test(review.specFingerprint ?? '') || !Array.isArray(review.textTranscription)) throw new Error('source review ledger is corrupt')
    }
    return { root, spec, manifest }
  } catch {
    throw new ProjectError('TemplateReviewStale', '整页图片的来源规范或审阅账本缺失、损坏或已变化；请重新 presentation_prepare/build 并核验当前图片', { status: 409 })
  }
}

async function assertSourceReview(authority: SourceAuthority, receipt: PageTemplateEvidence): Promise<void> {
  const { root, spec, manifest } = authority
  const asset = manifest.assets.filter(item => item?.assetId === receipt.assetId)
  const review = manifest.templateReviews[receipt.assetId]
  const slide = spec.slides[receipt.page - 1]
  const fingerprint = slide ? sha256(JSON.stringify(slide)) : ''
  const failures = [...Object.values(manifest.templateFailures), ...Object.values(manifest.templateReviews)].filter(item => item.status === 'repair-required')
  try {
    if (asset.length !== 1 || asset[0].sha256 !== receipt.assetSha256 || !['slide-image', 'template'].includes(asset[0].role)
      || !(asset[0].slideNumber === receipt.page || asset[0].slideNumbers?.includes(receipt.page))
      || !hasPassedTemplateReview(review, receipt.assetSha256) || !isDeepStrictEqual(review, receipt.review)
      || review.page !== receipt.page || review.specFingerprint !== fingerprint || !Array.isArray(slide?.text)
      || slide.text.some(text => typeof text !== 'string') || !isDeepStrictEqual(review.textTranscription, slide.text)
      || failures.some(item => item.sha256 === receipt.assetSha256)) throw new Error('current source review does not authorize this page')
    const checked = new Map<string, Promise<void>>()
    const verifyAsset = (item: any): Promise<void> => {
      let check = checked.get(item.assetId)
      if (!check) {
        check = (async () => {
          if (sha256(await readFile(await sourceFile(root, item.path))) !== item.sha256) throw new Error('source image changed')
        })()
        checked.set(item.assetId, check)
      }
      return check
    }
    await verifyAsset(asset[0])
    const relevantFailures = failures.filter(item => item.page === receipt.page && item.specFingerprint === fingerprint)
    if (relevantFailures.length) {
      const seen = new Set<string>(), ancestors = new Set<string>()
      let child = asset[0]
      while (child?.parentAssetId && !seen.has(child.assetId)) {
        seen.add(child.assetId)
        const parent = manifest.assets.find(item => item.assetId === child.parentAssetId)
        if (!parent || child.sourceKind !== 'generated' || child.sha256 === parent.sha256 || !Array.isArray(child.inputImageHashes) || !child.inputImageHashes.includes(parent.sha256)) break
        await verifyAsset(parent)
        ancestors.add(parent.sha256); child = parent
      }
      if (!relevantFailures.some(item => ancestors.has(item.sha256))) throw new Error('missing failed-image repair lineage')
    }
  } catch {
    throw new ProjectError('TemplateReviewStale', `第 ${receipt.page} 页来源图片或审阅已失效；失败图片必须修复并重新核验，不能复用旧收据`, { status: 409 })
  }
}

/** Shared receipt contract: exact deck globals and serialized page snapshot. */
export function templatePageFingerprint(deck: Record<string, unknown>, pageRaw: string): string {
  const { pages: _pages, ...settings } = deck
  return sha256(JSON.stringify(settings) + pageRaw)
}

export function hasPassedTemplateReview(review: unknown, expectedSha256: string): review is TemplateVisualReview {
  const value = review as TemplateVisualReview | null | undefined
  return !!value && value.schemaVersion === 1 && /^[a-f0-9]{64}$/i.test(expectedSha256)
    && value.sha256 === expectedSha256 && value.status === 'passed'
    && value.textIntegrity === 'pass' && value.layout === 'pass' && value.contentAccuracy === 'pass'
    && typeof value.observations === 'string' && value.observations.trim().length >= 20
    && Array.isArray(value.issues) && value.issues.length === 0
    && typeof value.reviewedAt === 'string' && Number.isFinite(Date.parse(value.reviewedAt))
}

/**
 * Managed presentations cannot export a generated image or its editable
 * reconstruction before the actual image passes text/layout/content review.
 * This lives below both tool and HTTP exports; skipCheck only skips rule QA.
 * Raw serialization for previews intentionally remains available for repair.
 */
export async function assertTemplateExportReady(input: {
  dir: string
  workspaceRoot?: string
  deck: Presentation
  pages: Page[]
  metadata?: Record<string, unknown>
  loadMedia: (src: string) => Promise<Uint8Array>
}): Promise<void> {
  const zeroWall = input.metadata?.zeroWall as { outputMode?: unknown } | undefined
  let provenance: any
  try { provenance = JSON.parse(await readFile(path.join(input.dir, 'presentation-provenance.json'), 'utf8')) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && !zeroWall?.outputMode) return
    throw new ProjectError('TemplateReviewRequired', '整页图片必须先通过文字、版式和内容核验；请恢复或补齐 presentation-provenance.json 后再导出', { status: 409 })
  }
  if (provenance.schemaVersion !== 2 || !['image', 'editable'].includes(provenance.outputMode)
    || !Array.isArray(provenance.templateReviews) || !Array.isArray(provenance.requiredTemplatePages)) {
    throw new ProjectError('TemplateReviewRequired', '整页图片审阅收据缺失或过期；先核验原图、修复问题并重新构建页面', { status: 409 })
  }
  if (zeroWall?.outputMode && provenance.outputMode !== zeroWall.outputMode) {
    throw new ProjectError('TemplateReviewRequired', '整页图片审阅模式与工程输出模式不一致', { status: 409 })
  }
  const authority = await loadSourceAuthority(input, provenance)
  if (provenance.mode === 'new' && authority.spec.slides.length !== input.pages.length) {
    throw new ProjectError('TemplateReviewStale', '来源规范页数与当前演示文稿不一致，请重新构建', { status: 409 })
  }
  const rawDeck = parse(await readFile(path.join(input.dir, 'deck.pptd'), 'utf8'))
  if (JSON.stringify(rawDeck) !== JSON.stringify(input.deck)) {
    throw new ProjectError('TemplateReviewStale', '构建期间演示文稿设置已变化，请重新检查后导出', { status: 409 })
  }
  const required = provenance.mode === 'new' ? input.deck.pages.map((_, index) => index + 1) : provenance.requiredTemplatePages
  if (!required.every((page: unknown) => Number.isInteger(page) && Number(page) >= 1 && Number(page) <= input.pages.length)) {
    throw new ProjectError('TemplateReviewRequired', '整页图片审阅页码无效', { status: 409 })
  }
  for (const page of new Set<number>(required)) {
    const matches = provenance.templateReviews.filter((entry: PageTemplateEvidence) => entry.page === page)
    const receipt = matches[0] as PageTemplateEvidence | undefined
    if (matches.length !== 1 || !receipt || !hasPassedTemplateReview(receipt.review, receipt.assetSha256)) {
      throw new ProjectError('TemplateReviewRequired', `第 ${page} 页整页图片尚未通过文字、版式和内容核验；修复后必须复核当前图片`, { status: 409 })
    }
    await assertSourceReview(authority, receipt)
    const raw = await readFile(path.join(input.dir, input.deck.pages[page - 1]), 'utf8')
    if ((provenance.outputMode === 'image' && receipt.pageFingerprint !== templatePageFingerprint(rawDeck, raw))
      || JSON.stringify(parse(raw)) !== JSON.stringify(input.pages[page - 1])) {
      throw new ProjectError('TemplateReviewStale', `第 ${page} 页已变化，请重新构建并核验`, { status: 409 })
    }
    const mediaPath = path.resolve(input.dir, receipt.mediaPath ?? '')
    const rel = path.relative(input.dir, mediaPath)
    if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
      throw new ProjectError('TemplateReviewRequired', `第 ${page} 页核验图片必须保存在工程内`, { status: 409 })
    }
    let media: Uint8Array
    try { media = await input.loadMedia(receipt.mediaPath) }
    catch { throw new ProjectError('TemplateReviewStale', `第 ${page} 页核验图片已丢失，请重新构建`, { status: 409 }) }
    if (sha256(media) !== receipt.assetSha256) {
      throw new ProjectError('TemplateReviewStale', `第 ${page} 页图片已变化，旧审阅不能用于新图片`, { status: 409 })
    }
    if (provenance.outputMode === 'image' && !input.pages[page - 1].elements.some(element => element.elementType === 'image'
      && path.resolve(input.dir, String(element.src ?? '')) === mediaPath
      && JSON.stringify(element.bounds) === JSON.stringify([0, 0, ...input.deck.size]))) {
      throw new ProjectError('TemplateReviewStale', `第 ${page} 页导出的整页图片与已核验图片不一致`, { status: 409 })
    }
  }
}
