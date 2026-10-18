/**
 * Export/render pipeline shared by ppt_export, ppt_render and ppt_check:
 * load project → build native deck → (save pptx | render PNG |
 * review). One path, three entry points — render and check never approximate
 * the final artifact, they always go through the same engine build.
 */
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { createConverter, type Converter, type RenderImagesResult } from '@deepseek-ai/libreoffice-kit'
import { loadProject, ProjectError, type LoadedProject } from './project/store.js'
import { createOfficeKitEngine } from './engine/officekit.js'
import type { BuildContext, DeckBuildResult } from './engine/types.js'
import { reviewDeck, type ReviewIssue } from './review/index.js'
import { aiIssuesAsReviewIssues, runAiReview, type AiReviewDeps, type AiReviewResult } from './review/ai.js'
import { getSlides, type PresentationData } from '@office-kit/pptx'
import { embedFontsForPptx, modeOfExportConfig, type FontEmbedSummary } from './fonts/embed-pipeline.js'
import type { Page, Presentation } from './pptd/schema.js'
import { reviewFontLicenses } from './review/fontLicense.js'
import { assertTemplateExportReady } from './template-review.js'

export interface PipelineResult {
  dir: string
  revision: number
  built: DeckBuildResult
  buildWarnings: string[]
  fontsUsed: string[]
  /** 供 saveProjectPptx 嵌字体用：deck + pages 再次递进来 */
  deck: Presentation
  pages: Page[]
}

const pipelineModels = new WeakMap<PipelineResult, LoadedProject>()
const pipelineMedia = new WeakMap<PipelineResult, Map<string, Promise<Uint8Array>>>()
const pipelineWorkspaces = new WeakMap<PipelineResult, string>()

/** Build the native deck for a project. Shared by all three tools. */
export async function buildProjectDeck(cwd: string, dir: string): Promise<PipelineResult> {
  const loaded = await loadProject(cwd, dir)
  const pipeline = await buildLoadedProject(loaded)
  pipelineWorkspaces.set(pipeline, cwd)
  return pipeline
}

async function buildLoadedProject(loaded: LoadedProject, media?: Map<string, Promise<Uint8Array>>): Promise<PipelineResult> {
  const blockers = loaded.issues.filter((i) => i.level === 'blocker')
  if (blockers.length > 0) {
    throw new ProjectError('SchemaBlockers', `工程存在 ${blockers.length} 个阻断级问题，先修复再导出/渲染`, {
      status: 409,
      detail: blockers.map((b) => `${b.code}: ${b.message}${b.path ? `（${b.path}）` : ''}`)
    })
  }

  const pages = loaded.deck.pages.map((rel) => {
    const key = rel.replace(/\\/g, '/')
    const page = loaded.pages.get(key)
    if (!page) throw new ProjectError('PageMissing', `页文件未加载：${key}`, { status: 409 })
    return page
  })

  const warnings: string[] = []
  const engine = createOfficeKitEngine()
  const mediaCache = media ?? new Map<string, Promise<Uint8Array>>()
  const loadMedia = (src: string): Promise<Uint8Array> => {
    let cached = mediaCache.get(src)
    if (!cached) { cached = loadMediaBytes(loaded.dir, src); mediaCache.set(src, cached) }
    return cached
  }
  // Fetch independent figures concurrently once, then build shapes serially
  // to preserve z-order and the engine's shared package mutation contract.
  await mapBounded([...mediaSources([loaded.deck, pages])], async (src) => { await loadMedia(src).catch(() => {}) })
  const ctx: BuildContext = {
    projectDir: loaded.dir,
    loadMedia,
    warnings
  }
  // The engine annotates image fills with private bytes. Keep the saved model
  // clean so content fingerprints and the next render describe PPTD, not that
  // implementation detail.
  const built = await engine.buildDeck(structuredClone({ deck: loaded.deck, pages }), ctx)
  const pipeline = {
    dir: loaded.dir,
    revision: loaded.manifest.revision,
    built,
    buildWarnings: warnings,
    fontsUsed: built.fontsUsed,
    deck: loaded.deck,
    pages
  }
  pipelineModels.set(pipeline, loaded)
  pipelineMedia.set(pipeline, mediaCache)
  return pipeline
}

/**
 * 不嵌字体的裸保存——供预览/质检渲染用。
 * 实测：LibreOffice 对嵌入的子集 EOT 字体会误用（字形张冠李戴），
 * 预览渲染必须走嵌字体之前的字节，由系统字体承担渲染。
 */
const rawSaves = new WeakMap<PipelineResult, Promise<Uint8Array>>()
export async function saveRawProjectPptx(pipeline: PipelineResult): Promise<Uint8Array> {
  let saved = rawSaves.get(pipeline)
  if (!saved) { saved = createOfficeKitEngine().saveDeck(pipeline.built.native); rawSaves.set(pipeline, saved) }
  return saved
}

/** Save the built deck to pptx bytes ( fonts embedded按 deck.export.fontEmbed 模式 ) */
export async function saveProjectPptx(pipeline: PipelineResult): Promise<{ bytes: Uint8Array; fontEmbed: FontEmbedSummary | null }> {
  const media = pipelineMedia.get(pipeline)
  await assertTemplateExportReady({
    dir: pipeline.dir, workspaceRoot: pipelineWorkspaces.get(pipeline), deck: pipeline.deck, pages: pipeline.pages,
    metadata: pipelineModels.get(pipeline)?.manifest.metadata,
    loadMedia: (src) => media?.get(src) ?? loadMediaBytes(pipeline.dir, src)
  })
  const rawBytes = await saveRawProjectPptx(pipeline)
  const mode = modeOfExportConfig(pipeline.deck)
  if (mode === 'off') {
    return { bytes: rawBytes, fontEmbed: null }
  }
  const { bytes, summary } = await embedFontsForPptx(rawBytes, pipeline.built, pipeline.deck, pipeline.pages, {
    projectDir: pipeline.dir,
    mode
  })
  return { bytes, fontEmbed: summary }
}

/** Media loader: project-relative path or http(s) URL → bytes. */
async function loadMediaBytes(projectDir: string, src: string): Promise<Uint8Array> {
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return new Uint8Array(await res.arrayBuffer())
  }
  const abs = path.resolve(projectDir, src)
  const rel = path.relative(projectDir, abs)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`素材路径越出工程目录：${src}`)
  }
  return new Uint8Array(await readFile(abs))
}

/* ------------------------------------------------------------------ *
 * LibreOffice rendering (ppt_render + missing-font diagnostics)
 * ------------------------------------------------------------------ */

export interface RenderedImages {
  result: RenderImagesResult
  outputDir: string
  /** Caller must dispose the converter + clean outputDir when done. */
  cleanup: () => Promise<void>
}

let activeRenders = 0
const renderWaiters: Array<() => void> = []
async function acquireRenderSlot(): Promise<() => void> {
  if (activeRenders < 2) activeRenders++
  else await new Promise<void>((resolve) => renderWaiters.push(resolve))
  return () => {
    const next = renderWaiters.shift()
    if (next) next()
    else activeRenders--
  }
}

export async function renderPptxImages(
  pptxBytes: Uint8Array,
  options: { pages?: number[]; dpi?: number } = {}
): Promise<RenderedImages> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'ppt-maker-render-'))
  const inputPath = path.join(tmp, 'deck.pptx')
  // libreoffice-kit owns outputDir: it creates the directory itself and
  // deletes it whole on failure — pre-creating it trips EEXIST.
  const outputDir = path.join(tmp, 'out')
  await writeFile(inputPath, pptxBytes)

  let conv: Converter | null = null
  const release = await acquireRenderSlot()
  try {
    conv = await createConverter()
    // libreoffice-kit 0.1.2's native Impress tile path clips enlarged/custom
    // slides even when the saved OOXML dimensions are correct. Export the
    // exact PPTX snapshot to PDF first, then rasterize its physical pages with
    // PDFium; never compensate by rescaling editable object coordinates.
    const pdfPath = path.join(tmp, 'deck.pdf')
    const converted = await conv.render({ inputPath, outputPath: pdfPath })
    const images = await conv.renderImages({
      inputPath: pdfPath,
      outputDir,
      pages: options.pages && options.pages.length > 0 ? options.pages : 'all',
      dpi: options.dpi ?? 96
    })
    const result = { ...images, missingFonts: [...new Set([...converted.missingFonts, ...images.missingFonts])] }
    // A completed render only needs its PNG files. Keeping 40 idle native
    // converters alive while callers inspect their images wastes resources.
    await conv.dispose().catch(() => {})
    conv = null
    return {
      result,
      outputDir,
      cleanup: async () => {
        try {
          await conv?.dispose()
        } catch {
          /* dispose must not throw */
        }
        await rm(tmp, { recursive: true, force: true })
      }
    }
  } catch (err) {
    await conv?.dispose().catch(() => {})
    await rm(tmp, { recursive: true, force: true }).catch(() => {})
    throw err
  } finally {
    release()
  }
}

/* ------------------------------------------------------------------ *
 * Check (rule layer over the built deck)
 * ------------------------------------------------------------------ */

export interface CheckResult {
  pass: boolean
  issues: ReviewIssue[]
  missingFonts: string[]
  buildWarnings: string[]
  /** ai:true 时携带 AI 层结果（performed:false 表示降级及原因）。 */
  ai?: AiReviewResult
}

export interface CheckOptions {
  pages?: number[]
  withMissingFonts?: boolean
 /** AI 按需深检：给了 deps 才跑，只出建议不阻断。 */
  ai?: { deps: AiReviewDeps; cwd: string }
}

export async function checkProject(cwd: string, dir: string, options: CheckOptions = {}): Promise<CheckResult> {
  const pipeline = await buildProjectDeck(cwd, dir)
  return checkBuiltProject(pipeline, options)
}

/** Check the exact built snapshot that will be exported; do not rebuild it. */
export async function checkBuiltProject(pipeline: PipelineResult, options: CheckOptions = {}): Promise<CheckResult> {
  const pres = pipeline.built.native as PresentationData
  const review = reviewDeck(pres, { pages: options.pages })

 // 字体许可预检（不动导出也可见）——收集 fsType 位与缺字体清单
  const fontLicenseIssues = await reviewFontLicenses(pipeline.deck, pipeline.pages, { projectDir: pipeline.dir })

  let missingFonts: string[] = []
  let ai: AiReviewResult | undefined

  const needsRender = options.withMissingFonts !== false || options.ai !== undefined
  let pptxBytes: Uint8Array | null = null
  if (needsRender) {
    try {
      // 预览/质检渲染用未嵌字体的裸字节：LibreOffice 会误用嵌入的子集
      // EOT（字形张冠李戴），系统字体渲染才是版面的诚实快照。
      pptxBytes = await saveRawProjectPptx(pipeline)
    } catch {
      pptxBytes = null
    }
  }

  // Font diagnostics are part of the same render result. AI review needs a
  // higher DPI, not a second document load and a second LibreOffice process.
  if (needsRender && pptxBytes !== null) {
    try {
      const pageNumbers = resolvedPageNumbers(pres, options.pages)
      const loaded = pipelineModels.get(pipeline)
      const cached = loaded
        ? await withPreviewLock(pipeline.dir, () => renderProjectPreviewsUnlocked(path.dirname(pipeline.dir), path.basename(pipeline.dir), { pages: pageNumbers, dpi: 96 }, { loaded, pipeline }))
        : null
      const rendered = cached ? null : await renderPptxImages(pptxBytes, { pages: pageNumbers, dpi: options.ai ? 96 : 24 })
      try {
        if (options.withMissingFonts !== false) missingFonts = cached?.missingFonts ?? rendered!.result.missingFonts
        if (options.ai !== undefined) {
          const images = cached
            ? cached.images.map((image) => ({ page: image.page, absPath: image.path }))
            : rendered!.result.images.map((img) => ({ page: img.page ?? img.index + 1, absPath: img.path }))
          ai = await runAiReview(
            { images, pres, pages: pageNumbers },
            { ...options.ai.deps, toDisplayPath: (abs) => path.relative(options.ai!.cwd, abs).replace(/\\/g, '/') }
          )
        }
      } finally {
        await rendered?.cleanup()
      }
    } catch (err) {
      // 渲染失败/调用失败一律降级成 performed:false + 原因，不炸规则层结果。
      if (options.ai !== undefined) ai = { performed: false, reason: `AI 质检未执行：${(err as Error).message}` }
    }
  }

  const issues: ReviewIssue[] = [...fontLicenseIssues, ...review.issues]
  for (const family of missingFonts) {
    issues.push({
      page: 0,
      severity: 'warning',
      category: 'structure',
      description: `目标环境缺少字体：${family}`,
      suggestion: '在导出时启用字体嵌入（export.fontEmbed），或在目标机安装该字体'
    })
  }
  if (ai !== undefined) {
    issues.push(...aiIssuesAsReviewIssues(ai))
  }

  return {
    pass: !issues.some((i) => i.severity === 'blocker'),
    issues,
    missingFonts,
    buildWarnings: pipeline.buildWarnings,
    ...(ai !== undefined ? { ai } : {})
  }
}

/** 质检页码：显式给了 pages 就用，否则全页（1..N，以 getSlides 的真实长度为准）。 */
function resolvedPageNumbers(pres: PresentationData, pages?: number[]): number[] {
  if (pages !== undefined && pages.length > 0) return [...pages].sort((a, b) => a - b)
  const count = getSlides(pres).length
  return Array.from({ length: count }, (_, i) => i + 1)
}

export interface ProjectPreviews {
  revision: number
  images: Array<{ page: number; path: string; width: number; height: number }>
  missingFonts: string[]
  warnings: string[]
}

interface PreviewEntry {
  fingerprint: string
  sha256: string
  width: number
  height: number
}
interface PreviewCache {
  version: 1
  pages: Record<string, PreviewEntry>
  missingFonts: string[]
  warnings: string[]
}

const previewLocks = new Map<string, Promise<unknown>>()
const digest = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex')

/** Keep media I/O bounded; page and shape mutation stays in document order. */
async function mapBounded<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency = 8): Promise<R[]> {
  const result = new Array<R>(items.length)
  let cursor = 0
  const workers = await Promise.allSettled(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; result[index] = await fn(items[index]) }
  }))
  const failure = workers.find((worker): worker is PromiseRejectedResult => worker.status === 'rejected')
  if (failure) throw failure.reason
  return result
}

function mediaSources(value: unknown, into = new Set<string>()): Set<string> {
  if (!value || typeof value !== 'object') return into
  for (const [key, child] of Object.entries(value)) {
    if (key === 'src' && typeof child === 'string') into.add(child)
    else if (child && typeof child === 'object') mediaSources(child, into)
  }
  return into
}

async function fontEnvironmentFingerprint(projectDir: string): Promise<string> {
  const roots = process.platform === 'win32'
    ? [path.join(process.env.SystemRoot ?? process.env.WINDIR ?? 'C:\\Windows', 'Fonts'), path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'Microsoft', 'Windows', 'Fonts')]
    : ['/usr/share/fonts', '/usr/local/share/fonts', path.join(os.homedir(), '.fonts'), path.join(os.homedir(), '.local/share/fonts'), '/Library/Fonts', '/System/Library/Fonts', path.join(os.homedir(), 'Library/Fonts')]
  roots.push(path.join(projectDir, 'assets', 'fonts'))
  const entries: string[] = []
  const files: string[] = []
  for (let index = 0; index < roots.length; index++) {
    let children
    try { children = await readdir(roots[index], { withFileTypes: true }) } catch { continue }
    for (const child of children) {
      const full = path.join(roots[index], child.name)
      if (child.isDirectory()) roots.push(full)
      else if (/\.(?:ttf|ttc|otf|otc)$/i.test(child.name)) files.push(full)
    }
  }
  await mapBounded(files, async (file) => {
    try { const info = await stat(file); entries.push(`${file}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`) }
    catch { entries.push(`${file}:unavailable`) }
  }, 16)
  return digest(entries.sort().join('\n'))
}

/**
 * Persist honest, unembedded final-deck previews. Cache keys include the global
 * deck settings, page content, page position and referenced media bytes, so
 * external edits and replaced figures invalidate the affected pages too.
 * Repeated/parallel requests share one project queue and reuse valid PNGs.
 */
export async function renderProjectPreviews(cwd: string, dir: string, options: { pages?: number[]; dpi?: number } = {}): Promise<ProjectPreviews> {
  return withPreviewLock(path.resolve(cwd, dir), () => renderProjectPreviewsUnlocked(cwd, dir, options))
}

async function withPreviewLock<T>(lockKey: string, task: () => Promise<T>): Promise<T> {
  const previous = previewLocks.get(lockKey) ?? Promise.resolve()
  const work = previous.catch(() => {}).then(task)
  previewLocks.set(lockKey, work)
  try { return await work } finally { if (previewLocks.get(lockKey) === work) previewLocks.delete(lockKey) }
}

async function renderProjectPreviewsUnlocked(cwd: string, dir: string, options: { pages?: number[]; dpi?: number }, prepared?: { loaded: LoadedProject; pipeline: PipelineResult }): Promise<ProjectPreviews> {
  const loaded = prepared?.loaded ?? await loadProject(cwd, dir)
  const dpi = options.dpi ?? 96
  if (!Number.isInteger(dpi) || dpi < 24 || dpi > 600) throw new ProjectError('InvalidDpi', 'dpi 必须为 24–600 的整数', { status: 400 })
  const pages = options.pages?.length ? [...new Set(options.pages)].sort((a, b) => a - b) : loaded.deck.pages.map((_, index) => index + 1)
  if (pages.some((page) => !Number.isInteger(page) || page < 1 || page > loaded.deck.pages.length)) {
    throw new ProjectError('InvalidPages', '预览页码超出演示文稿范围', { status: 400 })
  }
  // Validate the full project even on a cache hit; a cached PNG is not a way to
  // hide a newly introduced schema blocker in another page.
  const blockers = loaded.issues.filter((issue) => issue.level === 'blocker')
  if (blockers.length) throw new ProjectError('SchemaBlockers', `工程存在 ${blockers.length} 个阻断级问题，先修复再导出/渲染`, { status: 409, detail: blockers })
  const cacheDir = path.join(loaded.dir, '.previews', ...(dpi === 96 ? [] : [`dpi-${dpi}`]))
  await mkdir(cacheDir, { recursive: true })
  const cachePath = path.join(cacheDir, 'cache-v1.json')
  let cache: PreviewCache = { version: 1, pages: {}, missingFonts: [], warnings: [] }
  try {
    const saved = JSON.parse(await readFile(cachePath, 'utf8')) as PreviewCache
    if (saved.version === 1 && saved.pages && Array.isArray(saved.missingFonts) && Array.isArray(saved.warnings)) cache = saved
  } catch { /* absent, interrupted or obsolete cache is rebuilt */ }
  const media = prepared ? new Map(pipelineMedia.get(prepared.pipeline)) : new Map<string, Promise<Uint8Array>>()
  const mediaHashes = new Map<string, string>()
  const sourceSets = pages.map((page) => mediaSources([loaded.deck, loaded.pages.get(loaded.deck.pages[page - 1].replace(/\\/g, '/'))]))
  const sources = [...new Set(sourceSets.flatMap((set) => [...set]))]
  await mapBounded(sources, async (src) => {
    // A changed remote response is hashed again as well; URL equality alone
    // never establishes that a scientific figure is unchanged.
    const promise = media.get(src) ?? loadMediaBytes(loaded.dir, src)
    media.set(src, promise)
    try { mediaHashes.set(src, digest(await promise)) }
    catch (err) { mediaHashes.set(src, `unreadable:${(err as Error).message}`) }
  })
  const { pages: _pageList, ...global } = loaded.deck
  const fonts = await fontEnvironmentFingerprint(loaded.dir)
  const fingerprints = new Map<number, string>()
  const targets = new Map<number, string>()
  const pending: number[] = []
  await mapBounded(pages, async (page) => {
    const rel = loaded.deck.pages[page - 1].replace(/\\/g, '/')
    const fingerprint = digest(JSON.stringify({ renderer: 'officekit-0.24.0-libreoffice-0.1.2-pdfium-pptd-12700-v2', platform: `${process.platform}-${process.arch}`, fonts, dpi, global, page, rel, data: loaded.pages.get(rel), media: [...sourceSets[pages.indexOf(page)]].sort().map((src) => [src, mediaHashes.get(src)]) }))
    fingerprints.set(page, fingerprint)
    const target = path.join(cacheDir, `page-${String(page).padStart(2, '0')}.png`)
    targets.set(page, target)
    const entry = cache.pages[page]
    if (entry?.fingerprint === fingerprint) {
      try { if (digest(await readFile(target)) === entry.sha256) return } catch { /* missing image */ }
    }
    pending.push(page)
  })
  if (pending.length) {
    pending.sort((a, b) => a - b)
    const pipeline = prepared?.pipeline ?? await buildLoadedProject(loaded, media)
    const bytes = await saveRawProjectPptx(pipeline)
    const rendered = await renderPptxImages(bytes, { pages: pending, dpi })
    try {
      const images = new Map(rendered.result.images.map((image) => [image.page ?? image.index + 1, image]))
      for (const page of pending) if (!images.has(page)) throw new Error(`渲染器缺少第 ${page} 页，缓存未更新`)
      await mapBounded(pending, async (page) => {
        const image = images.get(page)!
        const imageBytes = await readFile(image.path)
        const target = targets.get(page)!
        const temp = `${target}.${randomUUID()}.tmp`
        try { await writeFile(temp, imageBytes); await rename(temp, target) }
        finally { await rm(temp, { force: true }).catch(() => {}) }
        cache.pages[page] = { fingerprint: fingerprints.get(page)!, sha256: digest(imageBytes), width: image.width, height: image.height }
      })
      cache.missingFonts = rendered.result.missingFonts
      cache.warnings = pipeline.buildWarnings
      const temp = `${cachePath}.${randomUUID()}.tmp`
      try { await writeFile(temp, JSON.stringify(cache)); await rename(temp, cachePath) }
      finally { await rm(temp, { force: true }).catch(() => {}) }
    } finally { await rendered.cleanup() }
  }
  return {
    revision: loaded.manifest.revision,
    images: pages.map((page) => ({ page, path: targets.get(page)!, width: cache.pages[page].width, height: cache.pages[page].height })),
    missingFonts: cache.missingFonts,
    warnings: cache.warnings
  }
}
