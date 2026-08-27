import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join, relative, resolve } from 'node:path'
import { ResearchStore } from '@zerowallscience/research-store'
import type { PresentationArtifact, PresentationGeneration, PresentationRecord, PresentationRevision } from '@zerowallscience/research-store/types'
import type { GenerateImageResult, ZeroWallImageGenerationService } from '@zerowallscience/plugin-images'
import { writePresentation } from './export.js'

/** Runs one persisted presentation generation without creating duplicate decks. */
export class PresentationWorker {
  private readonly pending = new Map<string, NodeJS.Timeout>()
  private readonly controllers = new Map<string, AbortController>()

  private readonly images: ZeroWallImageGenerationService
  private readonly stageDelayMs: number
  private readonly legacyMode: boolean
  constructor(private readonly store: ResearchStore, imagesOrDelay: ZeroWallImageGenerationService | number, stageDelayMs = 25) {
    this.legacyMode = typeof imagesOrDelay === 'number'
    if (typeof imagesOrDelay === 'number') { this.stageDelayMs = imagesOrDelay; this.images = legacyImageService() } else { this.stageDelayMs = stageDelayMs; this.images = imagesOrDelay }
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
        const slides = current.outline.map(section => ({ id: randomUUID(), title: section.title, body: section.points.map(point => `- ${point}`).join('\n'), assetUris: [], ...(section.referenceUris === undefined ? {} : { referenceUris: section.referenceUris }), visualPrompt: slidePrompt(current.title, section.title, section.points) }))
        this.save(id, { status: 'generating', generation: step(generation, 'visual', 0.2) }); await this.generateVisuals(id, slides, signal); return
      }
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
    const current = this.required(id); const generation = current.generation; const project = this.store.getProject(current.projectId)
    if (!generation || !project) throw new Error('Presentation generation context is unavailable.')
    const model = await this.images.resolveModel('gpt-image-2')
    const outDir = join(project.rootPath, '.zerowall', 'artifacts', 'presentations', current.id, 'visuals')
    const stagingDir = join(outDir, `.staging-${generation.id}`)
    await mkdir(stagingDir, { recursive: true })
    const generated: PresentationRecord['slides'] = []
    try {
      for (const [index, slide] of slides.entries()) {
        signal?.throwIfAborted()
        const name = slideFileName(index)
        const stagedPath = join(stagingDir, name)
        const stablePath = join(outDir, name)
        const references = (slide.referenceUris ?? []).map(localPath).filter((value): value is string => value !== undefined && isWithin(project.rootPath, value))
        const prompt = slide.visualPrompt ?? slidePrompt(current.title, slide.title, slide.body.split('\n'))
        const result: GenerateImageResult = references.length > 0
          ? await this.images.edit({ prompt, inputPaths: references.map(path => relative(project.rootPath, path)), outputPath: relative(project.rootPath, stagedPath), size: '1536x1024', overwrite: true }, project.rootPath, signal)
          : await this.images.generate({ prompt, outputPath: relative(project.rootPath, stagedPath), size: '1536x1024', overwrite: true }, project.rootPath, signal)
        const checksum = createHash('sha256').update(await readFile(stagedPath)).digest('hex')
        generated.push({ ...slide, visualUri: fileUri(stablePath), visual: { model: { providerId: result.providerId ?? model.providerId, groupId: result.groupId ?? model.groupId, modelId: result.model }, promptStrategy: 'zerowall-full-slide-image', visualSource: references.length > 0 ? 'reference-edit' : 'generated', referenceUris: slide.referenceUris ?? [], generatedUri: fileUri(stablePath), checksum, ...(result.image === undefined ? {} : { attachment: result.image }) } })
        const latest = this.required(id); if (latest.generation) this.save(id, { generation: step(latest.generation, 'visual', 0.2 + (0.6 * (index + 1) / slides.length)) })
      }
      const latest = this.required(id)
      const pptxPath = presentationPath(latest, project.rootPath, 'pptx')
      const pdfPath = presentationPath(latest, project.rootPath, 'pdf')
      const pptxTemporary = generationTemporary(pptxPath, generation.id, 'pptx')
      const pdfTemporary = generationTemporary(pdfPath, generation.id, 'pdf')
      const stagedSlides = generated.map((slide, index) => {
        const stagedUri = fileUri(join(stagingDir, slideFileName(index)))
        return { ...slide, visualUri: stagedUri, ...(slide.visual === undefined ? {} : { visual: { ...slide.visual, generatedUri: stagedUri } }) }
      })
      const stagedPresentation = { ...latest, slides: stagedSlides }
      this.save(id, { generation: step(this.required(id).generation ?? generation, 'pptx', 0.82) })
      await mkdir(resolve(pptxPath, '..'), { recursive: true })
      await writePresentation(stagedPresentation, 'pptx', fileUri(pptxTemporary))
      this.save(id, { generation: step(this.required(id).generation ?? generation, 'rendering', 0.88) })
      await writePresentation(stagedPresentation, 'pdf', fileUri(pdfTemporary))
      await commitGeneration(
        outDir,
        stagingDir,
        generated.length,
        [
          { path: pptxPath, temporary: pptxTemporary },
          { path: pdfPath, temporary: pdfTemporary },
        ],
        generation.id,
      )
      const artifacts = replaceArtifact(
        replaceArtifact(latest.artifacts, artifact('pptx', pptxPath, 'application/vnd.openxmlformats-officedocument.presentationml.presentation')),
        artifact('pdf', pdfPath, 'application/pdf'),
      )
      const preview = generated[0]?.visualUri
      const checksum = generated[0]?.visual?.checksum
      const previewArtifact = this.legacyMode || preview === undefined ? undefined : { kind: 'preview' as const, uri: preview, mediaType: 'image/png', ...(checksum === undefined ? {} : { checksum }) }
      this.save(id, { slides: generated, artifacts: previewArtifact === undefined ? artifacts : replaceArtifact(artifacts, previewArtifact), generation: step(this.required(id).generation ?? generation, 'quality', 0.94) })
      this.schedule(id)
    } catch (error) {
      await rm(stagingDir, { recursive: true, force: true })
      throw error
    }
  }

  private save(id: string, changes: Parameters<ResearchStore['updatePresentation']>[1]): PresentationRecord { return this.store.updatePresentation(id, changes) }
  private clear(id: string): void { const timer = this.pending.get(id); if (timer) clearTimeout(timer); this.pending.delete(id) }
  private required(id: string): PresentationRecord { const value = this.store.getPresentation(id); if (!value) throw new Error(`Presentation was not found: ${id}`); return value }
}

function slideFileName(index: number): string { return `slide-${String(index + 1).padStart(2, '0')}.png` }
function generationTemporary(path: string, generationId: string, format: 'pptx' | 'pdf'): string { return `${path}.${generationId}.tmp.${format}` }
function presentationPath(presentation: PresentationRecord, root: string, format: 'pptx' | 'pdf'): string { return existingArtifactPath(presentation, format) ?? join(root, '.zerowall', 'artifacts', 'presentations', presentation.id, `${slug(presentation.title)}.${format}`) }

async function commitGeneration(outDir: string, stagingDir: string, count: number, artifacts: Array<{ path: string; temporary: string }>, generationId: string): Promise<void> {
  const existing = await readdir(outDir, { withFileTypes: true })
  const stableNames = existing.filter(item => item.isFile() && /^slide-\d+\.png$/u.test(item.name)).map(item => item.name)
  const nextNames = Array.from({ length: count }, (_, index) => slideFileName(index))
  const backupDir = join(outDir, `.backup-${generationId}`)
  await mkdir(backupDir, { recursive: true })
  const committedImages: string[] = []
  const artifactBackups: Array<{ path: string; backup: string; existed: boolean }> = []
  const committedArtifacts: string[] = []
  try {
    for (const name of stableNames) await rename(join(outDir, name), join(backupDir, name))
    for (const artifact of artifacts) {
      const backup = `${artifact.path}.${generationId}.backup`
      let existed = true
      try { await rename(artifact.path, backup) } catch (error) { if (!isMissing(error)) throw error; existed = false }
      artifactBackups.push({ path: artifact.path, backup, existed })
    }
    for (const name of nextNames) { await rename(join(stagingDir, name), join(outDir, name)); committedImages.push(name) }
    for (const artifact of artifacts) { await rename(artifact.temporary, artifact.path); committedArtifacts.push(artifact.path) }
    await rm(backupDir, { recursive: true, force: true })
    for (const artifact of artifactBackups) if (artifact.existed) await rm(artifact.backup, { force: true })
    await rm(stagingDir, { recursive: true, force: true })
    await removeLegacyVisuals(outDir)
  } catch (error) {
    for (const name of committedImages) await rm(join(outDir, name), { force: true })
    for (const path of committedArtifacts) await rm(path, { force: true })
    for (const name of stableNames) {
      try { await rename(join(backupDir, name), join(outDir, name)) } catch { /* best-effort rollback */ }
    }
    for (const artifact of artifactBackups) if (artifact.existed) {
      try { await rename(artifact.backup, artifact.path) } catch { /* best-effort rollback */ }
    }
    await rm(stagingDir, { recursive: true, force: true })
    await rm(backupDir, { recursive: true, force: true })
    throw error
  } finally {
    for (const artifact of artifacts) await rm(artifact.temporary, { force: true })
  }
}

async function removeLegacyVisuals(outDir: string): Promise<void> {
  for (const item of await readdir(outDir, { withFileTypes: true })) {
    if (item.isFile() && /^[0-9a-f-]{36}-\d+(?:\.raw)?\.png$/iu.test(item.name)) await rm(join(outDir, item.name), { force: true })
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
  return { resolveModel: async () => ({ providerId: 'test', groupId: 'test', modelId: 'gpt-image-2' }), generate: write as ZeroWallImageGenerationService['generate'], edit: write as ZeroWallImageGenerationService['edit'] }
}
function defaultOutline(title: string): PresentationRecord['outline'] { return [{ title, points: ['研究主题与核心问题', '本次汇报的目标与范围'] }, { title: '研究背景与问题', points: ['研究背景', '核心问题', '研究意义'] }, { title: '研究目标与方法', points: ['研究目标', '技术路线', '实验设计'] }, { title: '数据与证据', points: ['数据来源', '关键指标', '实验结果'] }, { title: '主要发现', points: ['核心发现', '对照分析', '结果解释'] }, { title: '结论与下一步', points: ['主要结论', '局限性', '后续工作'] }] }
