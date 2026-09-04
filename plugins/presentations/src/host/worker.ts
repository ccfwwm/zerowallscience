import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join, relative, resolve } from 'node:path'
import { ResearchStore } from '@zerowallscience/research-store'
import type { PresentationArtifact, PresentationGeneration, PresentationRecord, PresentationRevision } from '@zerowallscience/research-store/types'
import type { GenerateImageResult, ZeroWallImageGenerationService } from '@zerowallscience/plugin-images'
import type { PresentationSlidePatch } from '@zerowallscience/plugin-presentations/types'
import { writeEditablePresentation, writePresentation } from './export.js'
import type { EditableSlideManifest } from '../shared/types.js'
import { analyzeScene } from './scene-analyzer.js'

export interface EditableSourcePage {
  path: string
  kind: 'image' | 'pptx-page' | 'zerowall-visual'
  checksum: string
  widthPx?: number
  heightPx?: number
  page?: number
}

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
      if (presentation.rebuildJob && !['ready', 'partial', 'failed', 'cancelled'].includes(presentation.rebuildJob.stage)) {
        const now = new Date().toISOString()
        recovered.push(this.store.updatePresentation(presentation.id, { status: 'failed', error: '应用重启后可编辑转换未完成，可重新转换。', rebuildJob: { ...presentation.rebuildJob, stage: 'failed', error: '应用重启后可编辑转换未完成。', updatedAt: now, finishedAt: now } }))
        continue
      }
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

  /** Persist one page patch, regenerate only that page, and rebuild the current PPTX. */
  async updateSlide(id: string, slideId: string, patch: PresentationSlidePatch): Promise<PresentationRecord> {
    const current = this.required(id)
    const index = current.slides.findIndex(slide => slide.id === slideId)
    if (index < 0) throw new Error(`Slide was not found: ${slideId}`)
    const slides = current.slides.map((slide, slideIndex) => slideIndex === index ? applySlidePatch(slide, patch) : slide)
    const updatedSlide = slides[index]!
    const outline = current.outline.map((section, sectionIndex) => sectionIndex === index
      ? { ...section, title: updatedSlide.title, points: bodyPoints(updatedSlide.body) }
      : section)
    this.save(id, { slides, outline })
    return this.retrySlide(id, slideId)
  }

  /** Rebuild current visual pages into a native-object-first PPTX revision. */
  async rebuildEditable(id: string, slideIds?: string[], instruction?: string, concurrency = 4, sourcePages?: EditableSourcePage[]): Promise<PresentationRecord> {
    const current = this.required(id)
    const project = this.store.getProject(current.projectId)
    if (!project) throw new Error('Presentation project was not found.')
    const generationId = randomUUID()
    const selected = new Set(slideIds && slideIds.length > 0 ? slideIds : sourcePages ? sourcePages.map((_, index) => `slide-${String(index + 1).padStart(2, '0')}`) : current.slides.map(slide => slide.id))
    const now = new Date().toISOString()
    const root = join(project.rootPath, '.zerowall', 'artifacts', 'presentations', id, 'rebuild', generationId)
    const rebuildJob = { id: randomUUID(), generationId, stage: 'queued' as const, progress: 0, concurrency: Math.max(1, Math.min(10, Math.trunc(concurrency))), startedAt: now, updatedAt: now }
    const sourceSlides: PresentationRecord['slides'] | undefined = sourcePages
      ? sourcePages.map((source, index) => ({ id: `slide-${String(index + 1).padStart(2, '0')}`, title: `第 ${index + 1} 页`, body: instruction ?? '', assetUris: [], visualUri: fileUri(source.path), visualStatus: 'ready' as const, sourcePage: { id: `source-${String(index + 1).padStart(2, '0')}`, kind: source.kind, uri: fileUri(source.path), checksum: source.checksum, ...(source.page === undefined ? {} : { page: source.page }), name: `source-${String(index + 1).padStart(2, '0')}` } }))
      : undefined
    const working = sourceSlides ?? current.slides
    const sourceMode = sourcePages?.some(page => page.kind === 'pptx-page') ? 'pptx-rebuild' : sourcePages ? 'image-rebuild' : 'zerowall-visual-rebuild'
    this.save(id, { sourceMode, rebuildJob, status: 'generating', error: '', ...(sourceSlides ? { slides: sourceSlides } : {}) })
    await mkdir(root, { recursive: true })
    this.save(id, { rebuildJob: { ...rebuildJob, stage: 'source-prepared', progress: 0.1, updatedAt: new Date().toISOString() } })
    let cursor = 0
    const slides = working.map(slide => ({ ...slide }))
    const run = async (): Promise<void> => {
      while (true) {
        const index = cursor++
        if (index >= slides.length) return
        const slide = slides[index]!
        if (!selected.has(slide.id)) continue
        try {
          const imagePath = localPath(slide.visualUri ?? '')
          if (!imagePath) throw new Error(`第 ${index + 1} 页没有可用的视觉图片。`)
          const manifestPath = join(root, 'slides', slide.id, 'editable-manifest.json')
          await mkdir(join(root, 'slides', slide.id), { recursive: true })
          const source = sourcePages?.[index]
          const sourceBytes = await readFile(imagePath)
          const sourceChecksum = createHash('sha256').update(sourceBytes).digest('hex')
          if (source?.checksum && source.checksum !== sourceChecksum) throw new Error(`输入素材校验失败：第 ${index + 1} 页 checksum 不匹配。`)
          const analysis = await analyzeScene({ slideId: slide.id, title: slide.title, body: slide.body, sourcePath: imagePath, checksum: sourceChecksum, ...(source?.widthPx === undefined ? {} : { widthPx: source.widthPx }), ...(source?.heightPx === undefined ? {} : { heightPx: source.heightPx }), ...(instruction === undefined ? {} : { instruction }) })
          const sceneMapPath = join(root, 'slides', slide.id, 'scene-map.json')
          const drawLogPath = join(root, 'slides', slide.id, 'draw-log.json')
          const qaPath = join(root, 'slides', slide.id, 'qa-report.json')
          await writeFile(sceneMapPath, JSON.stringify(analysis.sceneMap, null, 2), 'utf8')
          await writeFile(drawLogPath, JSON.stringify({ version: 1, slideId: slide.id, objects: analysis.manifestObjects.map(object => ({ objectId: object.objectId, kind: object.kind, z: object.z ?? 0 })) }, null, 2), 'utf8')
          const nativeObjectCount = analysis.manifestObjects.filter(object => object.editability !== 'atomic-raster').length
          const rasterizedObjectCount = analysis.manifestObjects.filter(object => object.editability === 'atomic-raster').length
          const manifest: EditableSlideManifest = {
            version: 1,
            slideId: slide.id,
            source: { kind: source?.kind ?? 'zerowall-visual', uri: fileUri(imagePath), checksum: sourceChecksum, widthPx: analysis.sceneMap.source.width_px, heightPx: analysis.sceneMap.source.height_px, page: source?.page ?? index + 1 },
            canvas: { widthPt: 960, heightPt: 540 },
            objects: analysis.manifestObjects,
            requiredIds: analysis.sceneMap.reference_inventory.required_ids,
            unresolvedAmbiguities: [],
            authorizedOmissions: [],
            nativeObjectCount,
            rasterizedObjectCount,
            fidelityProfile: 'reference_lock',
            mode: 'hybrid',
            sceneMapUri: fileUri(sceneMapPath),
            drawLogUri: fileUri(drawLogPath),
            qaReportUri: fileUri(qaPath),
          }
          await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
          await writeFile(qaPath, JSON.stringify({ version: 1, status: 'pending-render-review', slideId: slide.id, nativeObjectCount, rasterizedObjectCount, fullSlideRasterForbidden: true }, null, 2), 'utf8')
          slides[index] = { ...slide, editableManifestUri: fileUri(manifestPath), editableStatus: 'ready', nativeObjectCount, rasterizedObjectCount, sceneMapUri: fileUri(sceneMapPath) }
        } catch (error) {
          slides[index] = { ...slide, editableStatus: 'failed', rebuildError: error instanceof Error ? error.message : String(error) }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(rebuildJob.concurrency, Math.max(1, slides.length)) }, () => run()))
    const failed = slides.some(slide => selected.has(slide.id) && slide.editableStatus === 'failed')
    const updated = this.store.updatePresentation(id, { slides, sourceMode, status: failed ? 'failed' : 'generating', error: failed ? '部分页面可编辑转换失败。' : '', rebuildJob: { ...rebuildJob, stage: failed ? 'partial' : 'reviewed', progress: 0.8, updatedAt: new Date().toISOString(), ...(failed ? { error: '部分页面可编辑转换失败。' } : {}) } })
    if (failed) return updated
    const pptxPath = presentationPath(updated, project.rootPath, 'pptx')
    const temporary = generationTemporary(pptxPath, generationId, 'pptx')
    const counts = await writeEditablePresentation(updated, fileUri(temporary))
    await commitArtifacts([{ path: pptxPath, temporary }], generationId)
    const artifact = { kind: 'editable-pptx' as const, uri: fileUri(pptxPath), mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', checksum: createHash('sha256').update(readFileSync(pptxPath)).digest('hex') }
    const sceneMapPath = join(root, 'scene-map.json')
    const manifestPath = join(root, 'editable-manifest.json')
    const assetsPath = join(root, 'assets', 'manifest.json')
    const qaPath = join(root, 'qa-report.json')
    await writeFile(sceneMapPath, JSON.stringify({ version: 1, presentationId: id, generationId, slides: slides.filter(slide => slide.editableManifestUri).map(slide => ({ slideId: slide.id, sceneMapUri: slide.sceneMapUri, editableManifestUri: slide.editableManifestUri })) }, null, 2), 'utf8')
    await writeFile(manifestPath, JSON.stringify({ version: 1, presentationId: id, generationId, slides: slides.filter(slide => slide.editableManifestUri).map(slide => ({ slideId: slide.id, manifestUri: slide.editableManifestUri, nativeObjectCount: slide.nativeObjectCount ?? 0, rasterizedObjectCount: slide.rasterizedObjectCount ?? 0 })) }, null, 2), 'utf8')
    await mkdir(join(root, 'assets'), { recursive: true })
    await writeFile(assetsPath, JSON.stringify({ version: 1, presentationId: id, generationId, slides: slides.filter(slide => slide.editableManifestUri).map(slide => ({ slideId: slide.id, rasterizedObjectCount: slide.rasterizedObjectCount ?? 0, policy: 'local visual-core only; full-slide raster forbidden' })) }, null, 2), 'utf8')
    await writeFile(qaPath, JSON.stringify({ version: 1, presentationId: id, generationId, status: 'pending-render-review', fullSlideRasterForbidden: true, nativeObjectCount: slides.reduce((sum, slide) => sum + (slide.nativeObjectCount ?? 0), 0), rasterizedObjectCount: slides.reduce((sum, slide) => sum + (slide.rasterizedObjectCount ?? 0), 0), slides: slides.filter(slide => slide.editableManifestUri).map(slide => ({ slideId: slide.id, sceneMapUri: slide.sceneMapUri, editableManifestUri: slide.editableManifestUri })) }, null, 2), 'utf8')
    let artifacts = replaceArtifact(updated.artifacts, artifact)
    artifacts = replaceArtifact(artifacts, { kind: 'scene-map', uri: fileUri(sceneMapPath), mediaType: 'application/json', checksum: createHash('sha256').update(readFileSync(sceneMapPath)).digest('hex') })
    artifacts = replaceArtifact(artifacts, { kind: 'editable-manifest', uri: fileUri(manifestPath), mediaType: 'application/json', checksum: createHash('sha256').update(readFileSync(manifestPath)).digest('hex') })
    artifacts = replaceArtifact(artifacts, { kind: 'rebuild-qa-report', uri: fileUri(qaPath), mediaType: 'application/json', checksum: createHash('sha256').update(readFileSync(qaPath)).digest('hex') })
    return this.store.updatePresentation(id, { status: 'ready', artifacts, rebuildJob: { ...rebuildJob, stage: 'ready', progress: 1, updatedAt: new Date().toISOString(), finishedAt: new Date().toISOString() }, slides, style: { ...updated.style, editableNativeObjectCount: counts.nativeObjectCount, editableRasterizedObjectCount: counts.rasterizedObjectCount } })
  }

  async editEditableObjects(id: string, patches: Array<{ objectId: string; text?: string; fill?: string; line?: string; fontSize?: number; x?: number; y?: number; width?: number; height?: number; visible?: boolean; assetUri?: string }>): Promise<PresentationRecord> {
    const current = this.required(id)
    const project = this.store.getProject(current.projectId)
    if (!project) throw new Error('Presentation project was not found.')
    if (patches.length === 0) throw new Error('At least one object patch is required.')
    const generationId = randomUUID()
    const root = join(project.rootPath, '.zerowall', 'artifacts', 'presentations', id, 'rebuild', generationId)
    const slides = current.slides.map(slide => ({ ...slide }))
    for (const patch of patches) {
      const slide = slides.find(item => item.editableManifestUri && patch.objectId.startsWith(`${item.id}.`))
      if (!slide?.editableManifestUri) throw new Error(`Editable object was not found: ${patch.objectId}`)
      const oldPath = localPath(slide.editableManifestUri)
      if (!oldPath) throw new Error(`Editable manifest is unavailable for slide ${slide.id}.`)
      const manifest = JSON.parse(await readFile(oldPath, 'utf8')) as EditableSlideManifest
      const object = manifest.objects.find(item => item.objectId === patch.objectId)
      if (!object) throw new Error(`Editable object was not found: ${patch.objectId}`)
      if (patch.text !== undefined) object.text = patch.text
      if (patch.fill !== undefined) object.fill = patch.fill
      if (patch.line !== undefined) object.line = patch.line
      if (patch.fontSize !== undefined) object.fontSize = patch.fontSize
      if (patch.x !== undefined) object.x = patch.x
      if (patch.y !== undefined) object.y = patch.y
      if (patch.width !== undefined) object.w = patch.width
      if (patch.height !== undefined) object.h = patch.height
      if (patch.visible !== undefined) object.visible = patch.visible
      if (patch.assetUri !== undefined) object.imageUri = patch.assetUri
      const target = join(root, 'slides', slide.id, 'editable-manifest.json')
      await mkdir(join(root, 'slides', slide.id), { recursive: true })
      await writeFile(target, JSON.stringify(manifest, null, 2), 'utf8')
      // Keep the scene-map contract separate from its editable manifest. The
      // edited manifest is a new revision, while the scene map remains the
      // source-of-truth inventory for the slide.
      slides[slides.indexOf(slide)] = { ...slide, editableManifestUri: fileUri(target), editableStatus: 'ready' }
    }
    const updated = this.store.updatePresentation(id, { status: 'generating', error: '', slides, rebuildJob: { id: randomUUID(), generationId, stage: 'reviewed', progress: 0.8, concurrency: 1, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } })
    const pptxPath = presentationPath(updated, project.rootPath, 'pptx')
    const temporary = generationTemporary(pptxPath, generationId, 'pptx')
    const counts = await writeEditablePresentation(updated, fileUri(temporary))
    await commitArtifacts([{ path: pptxPath, temporary }], generationId)
    const editable = artifact('editable-pptx', pptxPath, 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    const finished = { ...updated.rebuildJob!, stage: 'ready' as const, progress: 1, updatedAt: new Date().toISOString(), finishedAt: new Date().toISOString() }
    return this.store.updatePresentation(id, { status: 'ready', artifacts: replaceArtifact(updated.artifacts, editable), rebuildJob: finished, style: { ...updated.style, editableNativeObjectCount: counts.nativeObjectCount, editableRasterizedObjectCount: counts.rasterizedObjectCount } })
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
      if (generation.stage === 'quality') this.save(id, { status: 'ready', generation: finish(generation), quality: null })
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
    const pptxTemporary = generationTemporary(pptxPath, generationId, 'pptx')
    const updatedAt = new Date().toISOString()
    this.save(id, { status: 'generating', generation: step(current.generation!, 'pptx', 0.82) })
    this.progress({ presentationId: id, generationId, status: 'assembling', updatedAt })
    try {
      signal?.throwIfAborted()
      await mkdir(resolve(pptxPath, '..'), { recursive: true })
      await writePresentation(this.assertGeneration(id, generationId), fileUri(pptxTemporary))
      signal?.throwIfAborted()
      this.assertGeneration(id, generationId)
      await commitArtifacts([{ path: pptxPath, temporary: pptxTemporary }], generationId)
      const latest = this.assertGeneration(id, generationId)
      let artifacts = replaceArtifact(latest.artifacts, artifact('pptx', pptxPath, 'application/vnd.openxmlformats-officedocument.presentationml.presentation'))
      const first = latest.slides[0]
      if (!this.legacyMode && first?.visualUri) artifacts = replaceArtifact(artifacts, { kind: 'preview', uri: first.visualUri, mediaType: 'image/png', ...(first.visual?.checksum ? { checksum: first.visual.checksum } : {}) })
      const finished = finish(latest.generation!)
      this.save(id, { status: 'ready', error: '', artifacts, generation: finished, quality: null })
      this.progress({ presentationId: id, generationId, status: 'complete', updatedAt: finished.updatedAt })
    } finally {
      await rm(pptxTemporary, { force: true })
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
function generationTemporary(path: string, generationId: string, format: 'pptx'): string { return `${path}.${generationId}.tmp.${format}` }
function presentationPath(presentation: PresentationRecord, root: string, format: 'pptx'): string {
  return existingArtifactPath(presentation, format) ?? existingArtifactPath(presentation, 'editable-pptx') ?? join(root, '.zerowall', 'artifacts', 'presentations', presentation.id, `${slug(presentation.title)}.${format}`)
}

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
  await Promise.all([
    rm(generationTemporary(pptxPath, generation.id, 'pptx'), { force: true }),
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
function applySlidePatch(slide: PresentationRecord['slides'][number], patch: PresentationSlidePatch): PresentationRecord['slides'][number] {
  const next = { ...slide, ...(patch.title === undefined ? {} : { title: patch.title }), ...(patch.body === undefined ? {} : { body: patch.body }) }
  if (patch.notes !== undefined) { if (patch.notes) next.notes = patch.notes; else delete next.notes }
  if (patch.visualPrompt !== undefined) { if (patch.visualPrompt) next.visualPrompt = patch.visualPrompt; else delete next.visualPrompt }
  return next
}
function bodyPoints(body: string): string[] { return body.split(/\r?\n/u).map(line => line.replace(/^\s*[-*•]\s*/u, '').trim()).filter(Boolean) }
function legacyImageService(): ZeroWallImageGenerationService {
  const write = async (input: { outputPath: string; size?: string }, cwd: string): Promise<GenerateImageResult> => { const path = resolve(cwd, input.outputPath); await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')); return { path, model: 'legacy-test', providerId: 'test', groupId: 'test', bytes: 68, requestedSize: (input.size as GenerateImageResult['requestedSize']) ?? 'auto', actualWidth: 1, actualHeight: 1, quality: 'medium', requestedQuality: 'medium', actualQuality: 'medium' } }
  return { resolveModel: async () => ({ providerId: 'test', groupId: 'test', modelId: 'gpt-image-2' }), resolveQuality: async () => 'auto', generate: write as ZeroWallImageGenerationService['generate'], edit: write as ZeroWallImageGenerationService['edit'] }
}
function defaultOutline(title: string): PresentationRecord['outline'] { return [{ title, points: ['研究主题与核心问题', '本次汇报的目标与范围'] }, { title: '研究背景与问题', points: ['研究背景', '核心问题', '研究意义'] }, { title: '研究目标与方法', points: ['研究目标', '技术路线', '实验设计'] }, { title: '数据与证据', points: ['数据来源', '关键指标', '实验结果'] }, { title: '主要发现', points: ['核心发现', '对照分析', '结果解释'] }, { title: '结论与下一步', points: ['主要结论', '局限性', '后续工作'] }] }
