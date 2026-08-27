import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join, relative, resolve } from 'node:path'
import { ResearchStore } from '@zerowallscience/research-store'
import type { PresentationArtifact, PresentationGeneration, PresentationRecord, PresentationRevision } from '@zerowallscience/research-store/types'
import type { GenerateImageResult, ZeroWallImageGenerationService } from '@zerowallscience/plugin-images'
import { writePresentation } from './export.js'

export interface PresentationProgress {
  presentationId: string
  generationId: string
  slideId?: string
  slideIndex?: number
  status: 'generating' | 'ready' | 'failed' | 'assembling' | 'complete'
  visualAttempt?: number
  visualError?: string
  visualUri?: string
  attachment?: NonNullable<PresentationRecord['slides'][number]['visual']>['attachment']
  quality?: 'auto' | 'low' | 'medium' | 'high'
  updatedAt: string
}

interface PresentationWorkerOptions {
  visualConcurrency?: number
  onProgress?: (event: PresentationProgress) => void
}

/** Runs one persisted presentation generation without creating duplicate decks. */
export class PresentationWorker {
  private readonly pending = new Map<string, NodeJS.Timeout>()
  private readonly controllers = new Map<string, AbortController>()

  private readonly images: ZeroWallImageGenerationService
  private readonly stageDelayMs: number
  private readonly legacyMode: boolean
  private readonly visualConcurrency: number
  private readonly onProgress: ((event: PresentationProgress) => void) | undefined
  constructor(private readonly store: ResearchStore, imagesOrDelay: ZeroWallImageGenerationService | number, stageDelayMs = 25, options: PresentationWorkerOptions = {}) {
    this.legacyMode = typeof imagesOrDelay === 'number'
    if (typeof imagesOrDelay === 'number') { this.stageDelayMs = imagesOrDelay; this.images = legacyImageService() } else { this.stageDelayMs = stageDelayMs; this.images = imagesOrDelay }
    this.visualConcurrency = Math.max(1, Math.min(10, Math.trunc(options.visualConcurrency ?? 10)))
    this.onProgress = options.onProgress
  }

  recover(): PresentationRecord[] {
    const recovered: PresentationRecord[] = []
    for (const project of this.store.listProjects()) for (const presentation of this.store.listPresentations(project.id)) {
      if (presentation.generation && !['ready', 'failed', 'paused', 'cancelled'].includes(presentation.generation.stage)) {
        const now = new Date().toISOString()
        recovered.push(this.store.updatePresentation(presentation.id, { status: 'failed', error: '应用重启后生成未完成，可重新生成。', generation: { ...presentation.generation, stage: 'failed', error: '应用重启后生成未完成。', updatedAt: now, finishedAt: now } }))
      }
    }
    return recovered
  }

  generate(id: string): PresentationRecord {
    const current = this.required(id)
    const now = new Date().toISOString()
    const revision = (current.generation?.revision ?? latestRevision(current.revisions)) + 1
    const history: PresentationRevision[] = !this.legacyMode && current.artifacts.length > 0
      ? [...(current.revisions ?? []), { id: current.generation?.id ?? randomUUID(), revision: current.generation?.revision ?? revision - 1, createdAt: now, artifacts: current.artifacts, ...(current.quality === undefined ? {} : { quality: current.quality }) }]
      : current.revisions ?? []
    const generation: PresentationGeneration = { id: randomUUID(), revision, stage: 'outlining', progress: 0, startedAt: now, updatedAt: now }
    this.clear(id)
    this.controllers.set(id, new AbortController())
    const next = this.store.updatePresentation(id, { status: 'outlining', error: '', generation, revisions: history })
    this.schedule(id)
    return next
  }

  pause(id: string): PresentationRecord {
    this.clear(id)
    this.controllers.get(id)?.abort(new Error('paused'))
    this.controllers.delete(id)
    const current = this.required(id)
    const now = new Date().toISOString()
    return current.generation ? this.store.updatePresentation(id, { status: 'paused', generation: { ...current.generation, stage: 'paused', resumeStage: current.generation.stage, updatedAt: now } }) : this.store.pausePresentation(id)
  }

  resume(id: string): PresentationRecord {
    const current = this.required(id)
    if (current.status !== 'paused') throw new Error('Only a paused presentation can resume.')
    const now = new Date().toISOString()
    const stage = current.generation?.resumeStage ?? (current.slides.length > 0 ? 'pptx' : 'outlining')
    const generation = current.generation ? withoutResume(current.generation, stage, now) : undefined
    this.controllers.set(id, new AbortController())
    const status: PresentationRecord['status'] = ['pptx', 'rendering', 'quality'].includes(stage) ? 'generating' : stage === 'designing' ? 'designing' : 'outlining'
    const resumed = this.store.updatePresentation(id, { status, ...(generation ? { generation } : {}) })
    this.schedule(id)
    return resumed
  }

  cancel(id: string): PresentationRecord {
    this.clear(id)
    this.controllers.get(id)?.abort(new Error('cancelled'))
    this.controllers.delete(id)
    const current = this.required(id)
    void cleanupGenerationFiles(this.store, current)
    const now = new Date().toISOString()
    return this.store.updatePresentation(id, { status: 'cancelled', ...(current.generation ? { generation: { ...current.generation, stage: 'cancelled', updatedAt: now, finishedAt: now } } : {}) })
  }

  /** Re-run only one page and rebuild exports when every page is ready. */
  async retrySlide(id: string, slideId: string): Promise<PresentationRecord> {
    const current = this.required(id)
    const index = current.slides.findIndex(slide => slide.id === slideId)
    if (index < 0) throw new Error(`Slide was not found: ${slideId}`)
    this.clear(id)
    this.controllers.get(id)?.abort(new Error('superseded'))
    const controller = new AbortController()
    this.controllers.set(id, controller)
    const now = new Date().toISOString()
    const generation: PresentationGeneration = {
      id: randomUUID(),
      revision: (current.generation?.revision ?? latestRevision(current.revisions)) + 1,
      stage: 'visual',
      progress: 0.2,
      startedAt: now,
      updatedAt: now,
    }
    this.save(id, { status: 'generating', error: '', generation })
    try {
      try {
        await this.generateOne(id, generation.id, index, current.slides[index]!, controller.signal)
      } catch (error) {
        if (isAbort(error)) throw error
        this.markSlideFailed(id, generation.id, slideId, index, error)
        this.failGeneration(id, generation.id, error instanceof Error ? error.message : String(error))
        return this.required(id)
      }
      const latest = this.required(id)
      if (latest.generation?.id !== generation.id) return latest
      if (latest.slides.every(slide => slide.visualStatus === 'ready')) await this.assemble(id, generation.id, controller.signal)
      else this.failGeneration(id, generation.id, '仍有页面生成失败，请继续重试失败页面。')
    } catch (error) {
      if (!isAbort(error)) this.failGeneration(id, generation.id, error instanceof Error ? error.message : String(error))
    } finally {
      if (this.controllers.get(id) === controller) this.controllers.delete(id)
    }
    return this.required(id)
  }

  dispose(): void { for (const id of this.pending.keys()) this.clear(id); for (const controller of this.controllers.values()) controller.abort(); this.controllers.clear() }

  private schedule(id: string): void { this.clear(id); const timer = setTimeout(() => { void this.advance(id) }, this.stageDelayMs); timer.unref(); this.pending.set(id, timer) }

  private async advance(id: string): Promise<void> {
    this.pending.delete(id)
    const current = this.required(id)
    const generation = current.generation
    if (!generation || current.status === 'paused' || current.status === 'cancelled') return
    const signal = this.controllers.get(id)?.signal
    try {
      if (generation.stage === 'outlining') {
        const outline = current.outline.length >= 2 ? current.outline : defaultOutline(current.title)
        this.save(id, { status: 'designing', outline, generation: step(generation, 'designing', 0.12) }); this.schedule(id); return
      }
      if (generation.stage === 'designing') {
        const now = new Date().toISOString()
        const slides = current.outline.map((section, index) => {
          const previous = current.slides[index]
          return {
            id: previous?.id ?? randomUUID(),
            title: section.title,
            body: section.points.map(point => `- ${point}`).join('\n'),
            assetUris: [],
            ...(section.referenceUris === undefined ? {} : { referenceUris: section.referenceUris }),
            visualPrompt: slidePrompt(current.title, section.title, section.points),
            ...(previous?.visualUri === undefined ? {} : { visualUri: previous.visualUri }),
            ...(previous?.visual === undefined ? {} : { visual: previous.visual }),
            visualStatus: 'pending' as const,
            visualAttempt: previous?.visualAttempt ?? 0,
            visualUpdatedAt: now,
          }
        })
        this.save(id, { status: 'generating', generation: step(generation, 'visual', 0.2) }); await this.generateVisuals(id, slides, signal); return
      }
      if (generation.stage === 'visual') { await this.generateVisuals(id, current.slides, signal); return }
      const project = this.store.getProject(current.projectId)
      if (!project) throw new Error('Presentation project was not found.')
      if (generation.stage === 'pptx' || generation.stage === 'rendering') throw new Error('Presentation temporary generation state cannot be resumed; regenerate the same presentation.')
      if (generation.stage === 'quality') this.save(id, { status: 'ready', generation: finish(generation), quality: { structural: 'passed', render: 'unverified', automaticVisual: 'unverified', modelVisual: 'unverified', overall: 'unverified', warnings: ['已生成逐页视觉图片；未检测到本机 PPT 渲染器，渲染质量待人工确认。'] } })
    } catch (error) {
      const latest = this.required(id)
      if (isAbort(error) || latest.status === 'paused' || latest.status === 'cancelled') return
      if (latest.generation) { const message = error instanceof Error ? error.message : String(error); await cleanupGenerationFiles(this.store, latest); this.save(id, { status: 'failed', error: message, generation: { ...latest.generation, stage: 'failed', error: message, updatedAt: new Date().toISOString(), finishedAt: new Date().toISOString() } }) }
    }
  }

  private async generateVisuals(id: string, slides: PresentationRecord['slides'], signal?: AbortSignal): Promise<void> {
    const generation = this.required(id).generation
    if (!generation) throw new Error('Presentation generation context is unavailable.')
    this.save(id, { slides })
    let cursor = 0
    const run = async (): Promise<void> => {
      while (true) {
        const index = cursor++
        if (index >= slides.length) return
        try {
          await this.generateOne(id, generation.id, index, slides[index]!, signal)
        } catch (error) {
          if (isAbort(error)) throw error
          this.markSlideFailed(id, generation.id, slides[index]!.id, index, error)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(this.visualConcurrency, slides.length) }, () => run()))
    const latest = this.required(id)
    if (latest.generation?.id !== generation.id) return
    if (latest.slides.some(slide => slide.visualStatus === 'failed')) {
      const errors = latest.slides.filter(slide => slide.visualStatus === 'failed').map(slide => slide.visualError).filter((value): value is string => Boolean(value))
      this.failGeneration(id, generation.id, `部分幻灯片视觉生成失败，请重试失败页面。${errors.length > 0 ? ` ${errors.join('; ')}` : ''}`)
      return
    }
    await this.assemble(id, generation.id, signal)
  }

  private async generateOne(id: string, generationId: string, index: number, slide: PresentationRecord['slides'][number], signal?: AbortSignal): Promise<void> {
    const current = this.assertGeneration(id, generationId)
    const project = this.store.getProject(current.projectId)
    if (!project) throw new Error('Presentation project was not found.')
    const attempt = (slide.visualAttempt ?? 0) + 1
    const startedAt = new Date().toISOString()
    this.replaceSlide(id, generationId, slide.id, value => {
      const { visualError: _visualError, ...rest } = value
      return { ...rest, visualStatus: 'generating', visualAttempt: attempt, visualUpdatedAt: startedAt }
    })
    this.progress({ presentationId: id, generationId, slideId: slide.id, slideIndex: index, status: 'generating', visualAttempt: attempt, updatedAt: startedAt })
    const model = await this.images.resolveModel('gpt-image-2')
    const quality = await this.images.resolveQuality?.() ?? 'auto'
    const outDir = join(project.rootPath, '.zerowall', 'artifacts', 'presentations', id, 'visuals')
    await mkdir(outDir, { recursive: true })
    const stablePath = join(outDir, slideFileName(index))
    const temporaryPath = join(outDir, `.${slideFileName(index)}.${generationId}.tmp.png`)
    try {
      signal?.throwIfAborted()
      const references = (slide.referenceUris ?? []).map(localPath).filter((value): value is string => value !== undefined && isWithin(project.rootPath, value))
      const prompt = slide.visualPrompt ?? slidePrompt(current.title, slide.title, slide.body.split('\n'))
      const result: GenerateImageResult = references.length > 0
        ? await this.images.edit({ prompt, inputPaths: references.map(path => relative(project.rootPath, path)), outputPath: relative(project.rootPath, temporaryPath), size: '1536x1024', quality, overwrite: true }, project.rootPath, signal)
        : await this.images.generate({ prompt, outputPath: relative(project.rootPath, temporaryPath), size: '1536x1024', quality, overwrite: true }, project.rootPath, signal)
      const checksum = createHash('sha256').update(await readFile(temporaryPath)).digest('hex')
      this.assertGeneration(id, generationId)
      await rename(temporaryPath, stablePath)
      const updatedAt = new Date().toISOString()
      const next = this.replaceSlide(id, generationId, slide.id, value => {
        const { visualError: _visualError, ...rest } = value
        return {
          ...rest,
          visualStatus: 'ready',
          visualAttempt: attempt,
          visualUpdatedAt: updatedAt,
          visualUri: fileUri(stablePath),
          visual: {
          model: { providerId: result.providerId ?? model.providerId, groupId: result.groupId ?? model.groupId, modelId: result.model },
          promptStrategy: 'zerowall-full-slide-image',
          visualSource: references.length > 0 ? 'reference-edit' : 'generated',
          referenceUris: slide.referenceUris ?? [],
          generatedUri: fileUri(stablePath),
          checksum,
          requestedQuality: result.requestedQuality ?? quality,
          actualQuality: result.actualQuality ?? result.quality,
          ...(result.image === undefined ? {} : { attachment: result.image }),
          },
        }
      })
      this.progress({ presentationId: id, generationId, slideId: slide.id, slideIndex: index, status: 'ready', visualAttempt: attempt, ...(next.visualUri === undefined ? {} : { visualUri: next.visualUri }), ...(next.visual?.attachment === undefined ? {} : { attachment: next.visual.attachment }), ...(next.visual?.requestedQuality === undefined ? {} : { quality: next.visual.requestedQuality }), updatedAt })
    } finally {
      await rm(temporaryPath, { force: true })
    }
  }

  private async assemble(id: string, generationId: string, signal?: AbortSignal): Promise<void> {
    const current = this.assertGeneration(id, generationId)
    const project = this.store.getProject(current.projectId)
    if (!project) throw new Error('Presentation project was not found.')
    if (!current.slides.every(slide => slide.visualStatus === 'ready' && slide.visualUri)) return
    const pptxPath = presentationPath(current, project.rootPath, 'pptx')
    const pdfPath = presentationPath(current, project.rootPath, 'pdf')
    const pptxTemporary = generationTemporary(pptxPath, generationId, 'pptx')
    const pdfTemporary = generationTemporary(pdfPath, generationId, 'pdf')
    const updatedAt = new Date().toISOString()
    this.save(id, { status: 'generating', generation: step(current.generation!, 'pptx', 0.82) })
    this.progress({ presentationId: id, generationId, status: 'assembling', updatedAt })
    try {
      signal?.throwIfAborted()
      await mkdir(resolve(pptxPath, '..'), { recursive: true })
      await writePresentation(this.assertGeneration(id, generationId), 'pptx', fileUri(pptxTemporary))
      this.save(id, { generation: step(this.assertGeneration(id, generationId).generation!, 'rendering', 0.9) })
      await writePresentation(this.assertGeneration(id, generationId), 'pdf', fileUri(pdfTemporary))
      signal?.throwIfAborted()
      this.assertGeneration(id, generationId)
      await commitArtifacts([{ path: pptxPath, temporary: pptxTemporary }, { path: pdfPath, temporary: pdfTemporary }], generationId)
      const latest = this.assertGeneration(id, generationId)
      let artifacts = replaceArtifact(replaceArtifact(latest.artifacts, artifact('pptx', pptxPath, 'application/vnd.openxmlformats-officedocument.presentationml.presentation')), artifact('pdf', pdfPath, 'application/pdf'))
      const first = latest.slides[0]
      if (!this.legacyMode && first?.visualUri) artifacts = replaceArtifact(artifacts, { kind: 'preview', uri: first.visualUri, mediaType: 'image/png', ...(first.visual?.checksum ? { checksum: first.visual.checksum } : {}) })
      const finished = finish(latest.generation!)
      this.save(id, { status: 'ready', error: '', artifacts, generation: finished, quality: { structural: 'passed', render: 'unverified', automaticVisual: 'unverified', modelVisual: 'unverified', overall: 'unverified', warnings: ['已生成逐页视觉图片；未检测到本机 PPT 渲染器，渲染质量待人工确认。'] } })
      this.progress({ presentationId: id, generationId, status: 'complete', updatedAt: finished.updatedAt })
    } finally {
      await Promise.all([rm(pptxTemporary, { force: true }), rm(pdfTemporary, { force: true })])
    }
  }

  private replaceSlide(id: string, generationId: string, slideId: string, update: (slide: PresentationRecord['slides'][number]) => PresentationRecord['slides'][number]): PresentationRecord['slides'][number] {
    const current = this.assertGeneration(id, generationId)
    let nextSlide: PresentationRecord['slides'][number] | undefined
    const slides = current.slides.map(slide => {
      if (slide.id !== slideId) return slide
      nextSlide = update(slide)
      return nextSlide
    })
    if (!nextSlide) throw new Error(`Slide was not found: ${slideId}`)
    const complete = slides.filter(slide => slide.visualStatus === 'ready' || slide.visualStatus === 'failed').length
    this.save(id, { slides, generation: { ...current.generation!, progress: 0.2 + (0.6 * complete / Math.max(1, slides.length)), updatedAt: new Date().toISOString() } })
    return nextSlide
  }

  private markSlideFailed(id: string, generationId: string, slideId: string, index: number, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    const updatedAt = new Date().toISOString()
    const next = this.replaceSlide(id, generationId, slideId, slide => ({ ...slide, visualStatus: 'failed', visualError: message, visualUpdatedAt: updatedAt }))
    this.progress({ presentationId: id, generationId, slideId, slideIndex: index, status: 'failed', ...(next.visualAttempt === undefined ? {} : { visualAttempt: next.visualAttempt }), visualError: message, ...(next.visualUri === undefined ? {} : { visualUri: next.visualUri }), ...(next.visual?.attachment === undefined ? {} : { attachment: next.visual.attachment }), ...(next.visual?.requestedQuality === undefined ? {} : { quality: next.visual.requestedQuality }), updatedAt })
  }

  private failGeneration(id: string, generationId: string, message: string): void {
    const current = this.required(id)
    if (current.generation?.id !== generationId) return
    const now = new Date().toISOString()
    this.save(id, { status: 'failed', error: message, generation: { ...current.generation, stage: 'failed', error: message, updatedAt: now, finishedAt: now } })
  }

  private assertGeneration(id: string, generationId: string): PresentationRecord {
    const current = this.required(id)
    if (current.generation?.id !== generationId) throw new DOMException('Generation was superseded.', 'AbortError')
    return current
  }

  private progress(event: PresentationProgress): void { this.onProgress?.(event) }

  private save(id: string, changes: Parameters<ResearchStore['updatePresentation']>[1]): PresentationRecord { return this.store.updatePresentation(id, changes) }
  private clear(id: string): void { const timer = this.pending.get(id); if (timer) clearTimeout(timer); this.pending.delete(id) }
  private required(id: string): PresentationRecord { const value = this.store.getPresentation(id); if (!value) throw new Error(`Presentation was not found: ${id}`); return value }
}

function slideFileName(index: number): string { return `slide-${String(index + 1).padStart(2, '0')}.png` }
function generationTemporary(path: string, generationId: string, format: 'pptx' | 'pdf'): string { return `${path}.${generationId}.tmp.${format}` }
function presentationPath(presentation: PresentationRecord, root: string, format: 'pptx' | 'pdf'): string { return existingArtifactPath(presentation, format) ?? join(root, '.zerowall', 'artifacts', 'presentations', presentation.id, `${slug(presentation.title)}.${format}`) }

async function commitArtifacts(artifacts: Array<{ path: string; temporary: string }>, generationId: string): Promise<void> {
  const backups: Array<{ path: string; backup: string; existed: boolean }> = []
  const committed: string[] = []
  try {
    for (const artifact of artifacts) {
      const backup = `${artifact.path}.${generationId}.backup`
      let existed = true
      try { await rename(artifact.path, backup) } catch (error) { if (!isMissing(error)) throw error; existed = false }
      backups.push({ path: artifact.path, backup, existed })
    }
    for (const artifact of artifacts) { await rename(artifact.temporary, artifact.path); committed.push(artifact.path) }
    for (const backup of backups) if (backup.existed) await rm(backup.backup, { force: true })
  } catch (error) {
    for (const path of committed) await rm(path, { force: true })
    for (const backup of backups) if (backup.existed) {
      try { await rename(backup.backup, backup.path) } catch { /* best-effort rollback */ }
    }
    throw error
  }
}

async function cleanupGenerationFiles(store: ResearchStore, presentation: PresentationRecord): Promise<void> {
  const generation = presentation.generation
  const project = store.getProject(presentation.projectId)
  if (!generation || !project) return
  const pptxPath = presentationPath(presentation, project.rootPath, 'pptx')
  const pdfPath = presentationPath(presentation, project.rootPath, 'pdf')
  await Promise.all([
    rm(generationTemporary(pptxPath, generation.id, 'pptx'), { force: true }),
    rm(generationTemporary(pdfPath, generation.id, 'pdf'), { force: true }),
    rm(join(project.rootPath, '.zerowall', 'artifacts', 'presentations', presentation.id, 'visuals', `.staging-${generation.id}`), { recursive: true, force: true }),
  ])
}
function isMissing(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT' }
function slidePrompt(deck: string, title: string, points: string[]): string { return `Create a polished 16:9 full-slide scientific presentation image for ZeroWall Science. Deck: ${deck}. Slide: ${title}. Content to communicate: ${points.join('; ')}. Use clear visual hierarchy, generous whitespace, varied composition, restrained academic colors, high contrast, and legible Simplified Chinese text. Preserve factual meaning and do not invent numbers, charts, citations, logos, or labels. The image must be a complete slide, not a mockup, device frame, or collage.` }
function withoutResume(generation: PresentationGeneration, stage: PresentationGeneration['stage'], updatedAt: string): PresentationGeneration { const { resumeStage: _resumeStage, ...rest } = generation; return { ...rest, stage, updatedAt } }
function step(generation: PresentationGeneration, stage: PresentationGeneration['stage'], progress: number): PresentationGeneration { return withoutResume({ ...generation, progress }, stage, new Date().toISOString()) }
function finish(generation: PresentationGeneration): PresentationGeneration { const now = new Date().toISOString(); return { ...withoutResume(generation, 'ready', now), progress: 1, finishedAt: now } }
function latestRevision(revisions: PresentationRevision[] | undefined): number { return revisions?.reduce((max, item) => Math.max(max, item.revision), 0) ?? 0 }
function replaceArtifact(items: PresentationArtifact[], item: PresentationArtifact): PresentationArtifact[] { return [...items.filter(existing => existing.kind !== item.kind), item] }
function artifact(kind: PresentationArtifact['kind'], path: string, mediaType: string): PresentationArtifact { return { kind, uri: fileUri(path), mediaType, checksum: createHash('sha256').update(readFileSync(path)).digest('hex') } }
function existingArtifactPath(presentation: PresentationRecord, kind: PresentationArtifact['kind']): string | undefined { const uri = presentation.artifacts.find(item => item.kind === kind)?.uri; if (!uri) return undefined; try { return fileURLToPath(new URL(uri)) } catch { return undefined } }
function fileUri(path: string): string { return pathToFileURL(resolve(path)).href }
function localPath(uri: string): string | undefined { try { const parsed = new URL(uri); return parsed.protocol === 'file:' ? fileURLToPath(parsed) : undefined } catch { return undefined } }
function isWithin(root: string, target: string): boolean { const inside = relative(resolve(root), resolve(target)); return inside === '' || (!inside.startsWith('..') && !inside.startsWith('/') && !inside.startsWith('\\') && !/^[A-Za-z]:/u.test(inside)) }
function slug(value: string): string { return value.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 80) || 'presentation' }
function isAbort(error: unknown): boolean { return error instanceof Error && (error.name === 'AbortError' || error.message === 'paused' || error.message === 'cancelled') }
function legacyImageService(): ZeroWallImageGenerationService {
  const write = async (input: { outputPath: string; size?: string }, cwd: string): Promise<GenerateImageResult> => { const path = resolve(cwd, input.outputPath); await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')); return { path, model: 'legacy-test', providerId: 'test', groupId: 'test', bytes: 68, requestedSize: (input.size as GenerateImageResult['requestedSize']) ?? 'auto', actualWidth: 1, actualHeight: 1, quality: 'medium', requestedQuality: 'medium', actualQuality: 'medium' } }
  return { resolveModel: async () => ({ providerId: 'test', groupId: 'test', modelId: 'gpt-image-2' }), resolveQuality: async () => 'auto', generate: write as ZeroWallImageGenerationService['generate'], edit: write as ZeroWallImageGenerationService['edit'] }
}
function defaultOutline(title: string): PresentationRecord['outline'] { return [{ title, points: ['研究主题与核心问题', '本次汇报的目标与范围'] }, { title: '研究背景与问题', points: ['研究背景', '核心问题', '研究意义'] }, { title: '研究目标与方法', points: ['研究目标', '技术路线', '实验设计'] }, { title: '数据与证据', points: ['数据来源', '关键指标', '实验结果'] }, { title: '主要发现', points: ['核心发现', '对照分析', '结果解释'] }, { title: '结论与下一步', points: ['主要结论', '局限性', '后续工作'] }] }
