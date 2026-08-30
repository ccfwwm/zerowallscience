import type { Context } from '@deepseek-ai/cordis'
import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { apply as applyPptRuntime, inject as pptRuntimeInject } from '@zerowallscience/dsh-ppt-runtime'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { defineTool, type JsonValue } from '@deepseek-ai/dsh-tools'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import { ResearchStore } from '@zerowallscience/research-store'
import type { CreatePresentationInput, PresentationRecord, ProjectRecord, UpdatePresentationChanges } from '@zerowallscience/research-store/types'
import type { ZeroWallImageGenerationService } from '@zerowallscience/plugin-images'
import type { PresentationSlidePatch, PresentationSlidePreview } from '@zerowallscience/plugin-presentations/types'
import { PresentationWorker, type EditableSourcePage, type PresentationProgress } from './worker.js'
import { writePresentation } from './export.js'
import type {} from 'zod'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'

declare module '@deepseek-ai/cordis' { interface Context { zerowallPresentation: ZeroWallPresentationService } }
export class ZeroWallPresentationService extends TypertRemoteService {
  static inject = ['tools', 'sessions', 'zerowallImageGeneration']
  private readonly store: ResearchStore
  private readonly worker: PresentationWorker
  constructor(ctx: Context) { super(ctx, 'zerowallPresentation'); const path = process.env.ZEROWALL_RESEARCH_DB?.trim(); if (!path) throw new Error('ZEROWALL_RESEARCH_DB is required.'); this.store = new ResearchStore(path); this.worker = new PresentationWorker(this.store, ctx.get('zerowallImageGeneration') as ZeroWallImageGenerationService, 25, { visualConcurrency: 10, onProgress: event => this.progressEvent(event) }); this.worker.recover(); ctx.tools.register(defineTool({
    name: 'create_presentation',
    description: 'Create and start a new presentation from research material. For image or PPTX conversion requests, use rebuild_presentation instead; this tool does not convert attachments.',
      parameters: {
        title: { type: 'string', description: 'Presentation title.' },
        project_id: { type: 'string', description: 'Optional project id. Defaults to the project linked to the active session.' },
        sections: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { title: { type: 'string' }, points: { type: 'array', items: { type: 'string' } } } }, description: 'Optional slide sections. Each section becomes one slide.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: `已创建演示文稿“${String(value.title ?? '')}”，正在生成（presentationId: ${String(value.presentationId ?? '')}）。` }],
      presentationMeta: (_args, value) => value,
    },
    async execute(args, exec) {
      const sessionId = exec.agent?.session.id ? String(exec.agent.session.id) : undefined
      const title = typeof args.title === 'string' && args.title.trim() ? args.title.trim() : '科研项目汇报'
      const service = ctx.get('zerowallPresentation') as ZeroWallPresentationService
      const projectId = typeof args.project_id === 'string' && args.project_id.trim()
        ? args.project_id.trim()
        : sessionId ? service.ensureProjectForSession(sessionId).id : undefined
      if (!projectId) throw new Error('当前对话没有工作区，请先从左侧工作区中新建或打开一个对话。')
      const sections = Array.isArray(args.sections) ? args.sections.filter(value => typeof value === 'object' && value !== null).map(value => {
        const item = value as { title?: unknown; points?: unknown }
        return { title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : title, points: Array.isArray(item.points) ? item.points.filter(point => typeof point === 'string').map(point => point.trim()).filter(Boolean) : [] }
      }) : undefined
      const record = service.create({ projectId, title, ...(sections && sections.length > 0 ? { outline: sections } : {}) })
      const started = service.generate(record.id)
      service.openEvent(started, sessionId)
      return JSON.parse(JSON.stringify({ presentationId: started.id, generationId: started.generation?.id, title: started.title, status: started.status, projectId, openWorkbench: true, ...(sessionId ? { sessionId } : {}) })) as JsonValue as Record<string, JsonValue>
    },
  }));
    ctx.tools.register(defineTool({
      name: 'update_presentation',
      description: 'Update the existing ZeroWall presentation in place. Use this when the user asks to revise the currently open deck; never create a second same-named file.',
      parameters: {
        presentation_id: { type: 'string', description: 'Existing presentation id from the ZeroWall PPT card.' },
        slide_id: { type: 'string', description: 'Target slide id. Use this for normal page revisions so other pages remain unchanged.' },
        page: { type: 'object', additionalProperties: false, properties: { title: { type: 'string' }, body: { type: 'string' }, notes: { type: 'string' }, visual_prompt: { type: 'string' }, instruction: { type: 'string', description: 'Instruction for editable rebuild of this page.' } }, description: 'Fields to replace on one slide.' },
        rebuild_editable: { type: 'boolean', description: 'When true with slide_id, rebuild only that referenced page as editable PowerPoint objects. Do not generate a new visual image.' },
        regenerate_all: { type: 'boolean', description: 'Must be true only when the user explicitly requests a complete deck regeneration.' },
        title: { type: 'string', description: 'Optional replacement deck title for a complete regeneration.' },
        sections: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { title: { type: 'string' }, points: { type: 'array', items: { type: 'string' } } } }, description: 'Optional replacement slide sections.' },
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{ type: 'text', text: value.editableStatus
          ? `已将演示文稿“${String(value.title ?? '')}”的指定页转换为可编辑 PPTX。`
          : value.slideId
          ? `已更新演示文稿“${String(value.title ?? '')}”的指定页，正在替换该页图片。`
          : `已确认重新生成整套演示文稿“${String(value.title ?? '')}”。` }],
        presentationMeta: (_args, value) => value,
      },
      async execute(args) {
        const id = typeof args.presentation_id === 'string' ? args.presentation_id : ''
        if (!id) throw new Error('presentation_id is required.')
        const service = ctx.get('zerowallPresentation') as ZeroWallPresentationService
        const current = serviceRecord(id)
        const slideId = typeof args.slide_id === 'string' ? args.slide_id.trim() : ''
        if (slideId) {
          if (Array.isArray(args.sections) || args.regenerate_all === true) throw new Error('slide_id cannot be combined with sections or regenerate_all.')
          const page = typeof args.page === 'object' && args.page !== null ? args.page as Record<string, unknown> : undefined
          const rebuildEditable = args.rebuild_editable === true
          if (rebuildEditable) {
            const instruction = page && typeof page.instruction === 'string' ? page.instruction.trim() : undefined
            const updated = await service.rebuildEditable({ presentationId: id, sourceSlideIds: [slideId], ...(instruction ? { instruction } : {}), concurrency: 1 })
            return JSON.parse(JSON.stringify({ presentationId: updated.id, generationId: updated.rebuildJob?.generationId, slideId, title: updated.title, status: updated.status, sourceMode: updated.sourceMode, editableStatus: updated.slides.find(item => item.id === slideId)?.editableStatus, projectId: updated.projectId, openWorkbench: true })) as JsonValue as Record<string, JsonValue>
          }
          if (!page) throw new Error('page is required when slide_id is provided.')
          const patch: PresentationSlidePatch = {
            ...(typeof page.title === 'string' ? { title: page.title.trim() } : {}),
            ...(typeof page.body === 'string' ? { body: page.body.trim() } : {}),
            ...(typeof page.notes === 'string' ? { notes: page.notes.trim() } : {}),
            ...(typeof page.visual_prompt === 'string' ? { visualPrompt: page.visual_prompt.trim() } : {}),
          }
          if (Object.keys(patch).length === 0) throw new Error('At least one page field is required.')
          const updated = await service.updateSlide({ id, slideId, patch })
          return JSON.parse(JSON.stringify({ presentationId: updated.id, generationId: updated.generation?.id, slideId, title: updated.title, status: updated.status, projectId: updated.projectId, openWorkbench: true })) as JsonValue as Record<string, JsonValue>
        }
        if (args.regenerate_all !== true) throw new Error('Normal revisions require slide_id. Set regenerate_all=true only after the user explicitly requests a complete deck regeneration.')
        const sections = Array.isArray(args.sections) ? args.sections.filter(value => typeof value === 'object' && value !== null).map(value => {
          const item = value as { title?: unknown; points?: unknown }
          return { title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : current.title, points: Array.isArray(item.points) ? item.points.filter(point => typeof point === 'string').map(point => point.trim()).filter(Boolean) : [] }
        }) : undefined
        const changes: UpdatePresentationChanges = { ...(typeof args.title === 'string' && args.title.trim() ? { title: args.title.trim() } : {}), ...(sections && sections.length > 0 ? { outline: sections } : {}) }
        const updated = service.updateAndGenerate({ id, changes })
        return JSON.parse(JSON.stringify({ presentationId: updated.id, generationId: updated.generation?.id, title: updated.title, status: updated.status, projectId: updated.projectId, openWorkbench: true })) as JsonValue as Record<string, JsonValue>
      },
    }))
    ctx.tools.register(defineTool({
      name: 'edit_presentation_objects',
      description: 'Apply validated object-level edits to an editable ZeroWall PPTX and create a new revision.',
      parameters: { presentation_id: { type: 'string', required: true }, patches: { type: 'array', items: { type: 'object', additionalProperties: true }, required: true } },
      output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: `已更新可编辑 PPTX（presentationId: ${String(value.presentationId ?? '')}）。` }], presentationMeta: (_args, value) => value },
      async execute(args) {
        const service = ctx.get('zerowallPresentation') as ZeroWallPresentationService
        const id = typeof args.presentation_id === 'string' ? args.presentation_id : ''
        const patches = Array.isArray(args.patches) ? args.patches.filter(value => typeof value === 'object' && value !== null).map(value => value as Record<string, unknown>).map(value => ({ objectId: String(value.object_id ?? value.objectId ?? ''), ...(typeof value.text === 'string' ? { text: value.text } : {}), ...(typeof value.fill === 'string' ? { fill: value.fill } : {}), ...(typeof value.line === 'string' ? { line: value.line } : {}), ...(typeof value.font_size === 'number' ? { fontSize: value.font_size } : {}), ...(typeof value.x === 'number' ? { x: value.x } : {}), ...(typeof value.y === 'number' ? { y: value.y } : {}), ...(typeof value.width === 'number' ? { width: value.width } : {}), ...(typeof value.height === 'number' ? { height: value.height } : {}), ...(typeof value.visible === 'boolean' ? { visible: value.visible } : {}), ...(typeof value.asset_uri === 'string' ? { assetUri: value.asset_uri } : {}) })).filter(value => value.objectId) : []
        if (!id || patches.length === 0) throw new Error('presentation_id and patches are required.')
        const updated = await service.editPresentationObjects({ id, patches })
        return JSON.parse(JSON.stringify({ presentationId: updated.id, projectId: updated.projectId, status: updated.status, rebuildJob: updated.rebuildJob, openWorkbench: true })) as JsonValue as Record<string, JsonValue>
      },
    }))
    ctx.tools.register(defineTool({
      name: 'rebuild_presentation',
      description: 'Convert image pages, an uploaded PPTX, or an existing ZeroWall visual presentation into a native-object-first editable PPTX. Pages are processed concurrently and the original source is preserved.',
      parameters: {
        presentation_id: { type: 'string', description: 'Existing presentation to rebuild in a new revision.' },
        project_id: { type: 'string', description: 'Project id used when creating a presentation from attachments.' },
        source_attachment_ids: { type: 'array', items: { type: 'string' }, description: 'Authorized uploaded image or PPTX attachment ids.' },
        source_image_path: { type: 'string', description: 'Local image path or file URI. The file is copied into the project artifact area before rebuilding.' },
        source_image_data: { type: 'string', description: 'Base64 image bytes or a data:image/*;base64,... URL.' },
        source_image_name: { type: 'string', description: 'Optional filename used when source_image_data is supplied.' },
        source_image_media_type: { type: 'string', description: 'Optional image MIME type for source_image_data.' },
        source_presentation_id: { type: 'string', description: 'Existing ZeroWall presentation whose visual pages should be rebuilt.' },
        source_slide_ids: { type: 'array', items: { type: 'string' }, description: 'Optional page ids to rebuild.' },
        instruction: { type: 'string', description: 'Natural-language page editing instruction.' },
        concurrency: { type: 'integer', description: 'Page concurrency, clamped to 1..10 (default 4).' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: `正在生成可编辑 PPTX（presentationId: ${String(value.presentationId ?? '')}）。` }], presentationMeta: (_args, value) => value },
      async execute(args, exec) {
        const service = ctx.get('zerowallPresentation') as ZeroWallPresentationService
        const sessionId = exec.agent?.session.id ? String(exec.agent.session.id) : undefined
        const sourcePresentationId = typeof args.source_presentation_id === 'string' && args.source_presentation_id.trim() ? args.source_presentation_id.trim() : undefined
        const presentationId = typeof args.presentation_id === 'string' && args.presentation_id.trim() ? args.presentation_id.trim() : sourcePresentationId
        const projectId = typeof args.project_id === 'string' && args.project_id.trim() ? args.project_id.trim() : sessionId ? service.ensureProjectForSession(sessionId).id : undefined
        const requestedAttachmentIds = Array.isArray(args.source_attachment_ids) ? args.source_attachment_ids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) : []
        const sourceImagePath = typeof args.source_image_path === 'string' && args.source_image_path.trim() ? args.source_image_path.trim() : undefined
        const sourceImageData = typeof args.source_image_data === 'string' && args.source_image_data.trim() ? args.source_image_data.trim() : undefined
        const sourceImageName = typeof args.source_image_name === 'string' && args.source_image_name.trim() ? args.source_image_name.trim() : undefined
        const sourceImageMediaType = typeof args.source_image_media_type === 'string' && args.source_image_media_type.trim() ? args.source_image_media_type.trim() : undefined
        // The composer already admitted the files into the current session.
        // Models often omit opaque ids when invoking a tool after seeing an
        // image, so recover the latest user attachment batch at the tool
        // boundary instead of asking the user to upload the same file again.
        const validAttachmentIds = requestedAttachmentIds.filter(isRecognizedAttachmentId)
        // Models sometimes copy the display filename (for example
        // `image.png`) instead of the opaque attachment reference. Never send
        // that filename to the file service; recover the authorized image/file
        // refs from the current user message instead.
        const recoveredAttachmentIds = sessionId === undefined ? [] : latestSessionAttachmentIds(ctx, sessionId)
        const attachmentIds = [...new Set([
          ...validAttachmentIds,
          ...(validAttachmentIds.length === requestedAttachmentIds.length ? [] : recoveredAttachmentIds),
        ])]
        if (!presentationId && attachmentIds.length === 0 && sourceImagePath === undefined && sourceImageData === undefined) throw new Error('presentation_id, source_presentation_id, source_attachment_ids, source_image_path, or source_image_data is required.')
        const result = await service.rebuildEditable({ ...(presentationId ? { presentationId } : {}), ...(projectId ? { projectId } : {}), ...(sessionId ? { sessionId } : {}), attachmentIds, ...(sourceImagePath ? { imagePath: sourceImagePath } : {}), ...(sourceImageData ? { imageData: sourceImageData } : {}), ...(sourceImageName ? { imageName: sourceImageName } : {}), ...(sourceImageMediaType ? { imageMediaType: sourceImageMediaType } : {}), ...(Array.isArray(args.source_slide_ids) ? { sourceSlideIds: args.source_slide_ids.filter((value): value is string => typeof value === 'string') } : {}), ...(typeof args.instruction === 'string' && args.instruction.trim() ? { instruction: args.instruction.trim() } : {}), concurrency: typeof args.concurrency === 'number' ? args.concurrency : 4 })
        return JSON.parse(JSON.stringify({ presentationId: result.id, projectId: result.projectId, status: result.status, sourceMode: result.sourceMode, rebuildJob: result.rebuildJob, openWorkbench: true })) as JsonValue as Record<string, JsonValue>
      },
    }))
    ctx.effect(() => () => { this.worker.dispose(); this.store.close() }, 'zerowall-presentation: close research store')
    function serviceRecord(id: string): PresentationRecord {
      const value = (ctx.get('zerowallPresentation') as ZeroWallPresentationService).store.getPresentation(id)
      if (!value) throw new Error(`Presentation was not found: ${id}`)
      return value
    }
  }
  @Remote('create') create(input: CreatePresentationInput): PresentationRecord {
    this.requireProject(input.projectId)
    const title = input.title.trim().toLocaleLowerCase()
    const existing = this.store.listPresentations(input.projectId).find(item => item.title.trim().toLocaleLowerCase() === title)
    const record = existing
      ? input.outline && input.outline.length > 0 ? this.store.updatePresentation(existing.id, { outline: input.outline }) : existing
      : this.store.createPresentation(input)
    this.openEvent(record)
    return record
  }
  @Remote('ensureProjectForSession') ensureProjectForSession(sessionId: string): ProjectRecord {
    const session = this.ctx.get('sessions')?.get(SessionId(sessionId))
    const cwd = session?.header.cwd?.trim()
    if (!cwd) throw new Error('当前会话没有工作区目录，请先从左侧打开一个工作区。')
    const existing = this.store.listProjects().find(project => isWithin(cwd, project.rootPath))
    if (existing) return existing
    return this.store.createProject({
      name: basename(resolve(cwd)) || '当前工作区',
      rootPath: resolve(cwd),
      description: '由演示文稿工作台自动创建。',
    })
  }
  @Remote('list') list(projectId: string): PresentationRecord[] { this.requireProject(projectId); return this.store.listPresentations(projectId) }
  @Remote('get') get(id: string): PresentationRecord {
    const presentation = this.store.getPresentation(id)
    if (presentation === undefined) throw new Error(`Presentation was not found: ${id}`)
    this.requireProject(presentation.projectId)
    return presentation
  }
  @Remote('update') update(input: { id: string; changes: UpdatePresentationChanges }): PresentationRecord { return this.store.updatePresentation(input.id, input.changes) }
  @Remote('delete') delete(id: string): void { this.requirePresentationProject(id); this.store.deletePresentation(id) }
  @Remote('updateAndGenerate') updateAndGenerate(input: { id: string; changes: UpdatePresentationChanges }): PresentationRecord { this.requirePresentationProject(input.id); this.store.updatePresentation(input.id, input.changes); const record = this.worker.generate(input.id); this.openEvent(record); return record }
  @Remote('generate') generate(id: string): PresentationRecord { const record = this.worker.generate(id); this.openEvent(record); return record }
  @Remote('pause') pause(id: string): PresentationRecord { return this.worker.pause(id) }
  @Remote('resume') resume(id: string): PresentationRecord { const record = this.worker.resume(id); this.openEvent(record); return record }
  @Remote('cancel') cancel(id: string): PresentationRecord { return this.worker.cancel(id) }
  @Remote('previewSlide') previewSlide(input: { presentationId: string; slideId: string }): Promise<PresentationSlidePreview> {
    this.requirePresentationProject(input.presentationId)
    return readPresentationSlidePreview(this.store, input.presentationId, input.slideId)
  }
  @Remote('updateSlide') updateSlide(input: { id: string; slideId: string; patch: PresentationSlidePatch }): Promise<PresentationRecord> {
    this.requirePresentationProject(input.id)
    return this.worker.updateSlide(input.id, input.slideId, input.patch)
  }
  @Remote('retrySlide') retrySlide(input: { presentationId: string; slideId: string }): Promise<PresentationRecord> {
    const presentation = this.requirePresentationProject(input.presentationId)
    const slide = presentation.slides.find(item => item.id === input.slideId)
    if (!slide) throw new Error(`Slide was not found: ${input.slideId}`)
    return this.worker.retrySlide(input.presentationId, input.slideId)
  }
  @Remote('rebuildEditable') async rebuildEditable(input: { presentationId?: string; projectId?: string; sessionId?: string; attachmentIds?: string[]; imagePath?: string; imageData?: string; imageName?: string; imageMediaType?: string; sourcePresentationId?: string; sourceSlideIds?: string[]; instruction?: string; concurrency?: number }): Promise<PresentationRecord> {
    const id = input.presentationId ?? input.sourcePresentationId
    let presentation = id ? this.requirePresentationProject(id) : undefined
    const projectId = presentation?.projectId ?? input.projectId
    if (!projectId) throw new Error('A project is required for editable rebuild.')
    this.requireProject(projectId)
    const project = this.store.getProject(projectId)!
    const sourcePages: EditableSourcePage[] = []
    if (input.imagePath !== undefined || input.imageData !== undefined) {
      if (!projectId) throw new Error('A project is required for image rebuild.')
      sourcePages.push(await materializeDirectImage(project.rootPath, input.imagePath, input.imageData, input.imageName, input.imageMediaType))
    }
    if (input.attachmentIds && input.attachmentIds.length > 0) {
      if (!input.sessionId) throw new Error('sessionId is required for attachment rebuild.')
      const files = this.ctx.get('zerowallFiles') as { materialize(input: { sessionId: string; attachmentId: string }): Promise<{ path: string; name: string; sha256: string }> } | undefined
      const images = this.ctx.get('attachments') as { imageHostPath?(ref: unknown): string | undefined; readImage?(ref: unknown): Promise<{ data: Uint8Array }> } | undefined
      for (const attachmentId of input.attachmentIds.slice(0, 50)) {
        const imageRef = findSessionImageAttachment(this.ctx, input.sessionId, attachmentId)
        const file = imageRef !== undefined
          ? await materializeSessionImage(images, imageRef, project.rootPath, input.sessionId)
          : files
            ? await files.materialize({ sessionId: input.sessionId, attachmentId })
            : undefined
        if (!file) throw new Error('File attachment service is unavailable.')
        const ext = extname(file.name).toLocaleLowerCase()
        if (ext === '.pptx') {
          const runtime = this.ctx.get('pptRuntime') as { pptImage?: { render(owner: { agentId: string; sessionId: string }, workspace: string, input: string, options?: Record<string, unknown>): Promise<{ image_paths: string[] }> } } | undefined
          if (!runtime?.pptImage) throw new Error('PowerPoint rendering runtime is unavailable.')
          const rendered = await runtime.pptImage.render({ agentId: 'zerowall-presentation', sessionId: input.sessionId }, project.rootPath, file.path, { backend: 'auto', outputDirectory: join(project.rootPath, '.zerowall', 'artifacts', 'presentations', id ?? 'pending', 'rebuild-source', file.name) })
          for (const [index, image] of rendered.image_paths.entries()) {
            const path = isAbsolute(image) ? image : join(project.rootPath, image)
            sourcePages.push({ path, kind: 'pptx-page', checksum: createHash('sha256').update(await readFile(path)).digest('hex'), page: index + 1 })
          }
        } else if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
          sourcePages.push({ path: file.path, kind: 'image', checksum: file.sha256, page: sourcePages.length + 1 })
        } else throw new Error(`Unsupported rebuild attachment type: ${file.name}`)
      }
    }
    if (!presentation) {
      const title = sourcePages.length === 1 ? '图片重建演示文稿' : '图片重建演示文稿'
      presentation = this.store.createPresentation({ projectId, title, outline: sourcePages.map((_, index) => ({ title: `第 ${index + 1} 页`, points: [] })) })
    }
    if (sourcePages.length > 0) {
      this.store.updatePresentation(presentation.id, { sourceAttachments: sourcePages.map((page, index) => ({ id: `source-${String(index + 1).padStart(2, '0')}`, kind: page.kind, uri: pathToFileURL(resolve(page.path)).href, checksum: page.checksum, page: page.page ?? index + 1 })) })
    }
    const rebuilt = await this.worker.rebuildEditable(presentation.id, input.sourceSlideIds, input.instruction, input.concurrency ?? 4, sourcePages.length > 0 ? sourcePages : undefined)
    this.openEvent(rebuilt, input.sessionId)
    return rebuilt
  }
  @Remote('editPresentationObjects') async editPresentationObjects(input: { id: string; patches: Array<{ objectId: string; text?: string; fill?: string; line?: string; fontSize?: number; x?: number; y?: number; width?: number; height?: number; visible?: boolean; assetUri?: string }> }): Promise<PresentationRecord> {
    this.requirePresentationProject(input.id)
    return this.worker.editEditableObjects(input.id, input.patches)
  }
  openEvent(record: PresentationRecord, sessionId?: string): void {
    ;(this.ctx as unknown as { emit(event: string, ...args: unknown[]): void }).emit('zerowall/presentation-open', [{ presentationId: record.id, projectId: record.projectId, title: record.title, ...(sessionId ? { sessionId } : {}) }])
  }
  private progressEvent(event: PresentationProgress): void {
    ;(this.ctx as unknown as { emit(event: string, ...args: unknown[]): void }).emit('zerowall/presentation-progress', [event])
  }
  private requireProject(projectId: string): void {
    if (this.store.getProject(projectId) === undefined) throw new Error(`Project was not found: ${projectId}`)
  }
  private requirePresentationProject(id: string): PresentationRecord {
    const presentation = this.store.getPresentation(id)
    if (presentation === undefined) throw new Error(`Presentation was not found: ${id}`)
    this.requireProject(presentation.projectId)
    return presentation
  }
  @Remote('export') async export(input: { id: string; uri: string }): Promise<PresentationRecord> {
    const presentation = this.store.getPresentation(input.id)
    if (presentation === undefined) throw new Error(`Presentation was not found: ${input.id}`)
    if (presentation.status !== 'ready') throw new Error('Only a ready presentation can be exported.')
    await writePresentation(presentation, input.uri)
    const bytes = await readFile(filePath(input.uri))
    const kind = 'pptx'
    const artifact = {
      kind,
      uri: input.uri,
      mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      checksum: createHash('sha256').update(bytes).digest('hex'),
    } as const
    return this.store.updatePresentation(input.id, {
      exportUris: { ...presentation.exportUris, pptx: input.uri },
      artifacts: [...presentation.artifacts.filter(existing => existing.kind !== kind), artifact],
    })
  }
}

function isRecognizedAttachmentId(value: string): boolean {
  return /^(?:file-sha256|sha256):[a-f0-9]{64}$/u.test(value.trim())
}

interface SessionAttachmentCandidate { id: string; kind: 'image' | 'file'; ref?: unknown }

/** Recover the most recent user attachment batch when a tool call omitted ids. */
function latestSessionAttachmentIds(ctx: Context, sessionId: string): string[] {
  const session = ctx.get('sessions')?.get(SessionId(sessionId))
  const agent = ctx.get('agents')?.get(SessionId(sessionId)) as { inbox?: { nextTurn?: readonly unknown[]; nextStep?: readonly unknown[] } } | undefined
  const pending = agent?.inbox === undefined ? [] : [...(agent.inbox.nextTurn ?? []), ...(agent.inbox.nextStep ?? [])]
  if (!session && pending.length === 0) return []
  for (const event of [...(session?.events ?? [])].reverse()) {
    if (event.type !== 'user/message') continue
    const data = event.data as { source?: { kind?: string }; content?: unknown; message?: { content?: unknown }; inserted?: unknown; meta?: { image?: unknown } }
    if (data.source?.kind !== 'user') continue
    const found: SessionAttachmentCandidate[] = []
    collectSessionAttachments(data.content, found)
    collectSessionAttachments(data.message?.content, found)
    collectSessionAttachments(data.inserted, found)
    collectSessionAttachments(data.meta?.image, found)
    if (found.length > 0) return [...new Set(found.map(item => item.id))]
  }
  const found: SessionAttachmentCandidate[] = []
  for (const message of pending) collectSessionAttachments(message, found)
  if (found.length > 0) return [...new Set(found.map(item => item.id))]
  return []
}

function collectSessionAttachments(value: unknown, output: SessionAttachmentCandidate[]): void {
  if (Array.isArray(value)) { for (const item of value) collectSessionAttachments(item, output); return }
  if (value === null || typeof value !== 'object') return
  const record = value as { type?: unknown; attachment?: unknown; content?: unknown; attachmentId?: unknown; name?: unknown; mediaType?: unknown }
  if ((record.type === 'image' || record.type === 'file') && record.attachment && typeof record.attachment === 'object') {
    const id = (record.attachment as { attachmentId?: unknown }).attachmentId
      if (typeof id === 'string' && id.length > 0) output.push({ id, kind: record.type, ...(record.type === 'image' ? { ref: record.attachment } : {}) })
  }
  // Some session metadata stores the admitted image reference directly,
  // without the surrounding `{ type: 'image', attachment: ... }` block.
  if (typeof record.attachmentId === 'string' && record.attachmentId.length > 0) {
    output.push({ id: record.attachmentId, kind: 'image', ref: value })
  }
  if (record.type === 'tool-result') collectSessionAttachments(record.content, output)
}

function findSessionImageAttachment(ctx: Context, sessionId: string, attachmentId: string): unknown | undefined {
  const session = ctx.get('sessions')?.get(SessionId(sessionId))
  const agent = ctx.get('agents')?.get(SessionId(sessionId)) as { inbox?: { nextTurn?: readonly unknown[]; nextStep?: readonly unknown[] } } | undefined
  const events = session?.events ?? []
  for (const event of events) {
    if (event.type !== 'user/message') continue
    const found: SessionAttachmentCandidate[] = []
    const data = event.data as { content?: unknown; message?: { content?: unknown }; inserted?: unknown; meta?: { image?: unknown } }
    collectSessionAttachments(data.content, found)
    collectSessionAttachments(data.message?.content, found)
    collectSessionAttachments(data.inserted, found)
    collectSessionAttachments(data.meta?.image, found)
    const match = found.find(item => item.kind === 'image' && item.id === attachmentId)
    if (match?.ref !== undefined) return match.ref
  }
  const pending: SessionAttachmentCandidate[] = []
  for (const message of [...(agent?.inbox?.nextTurn ?? []), ...(agent?.inbox?.nextStep ?? [])]) collectSessionAttachments(message, pending)
  return pending.find(item => item.kind === 'image' && item.id === attachmentId)?.ref
}

/** Copy a direct path or decode direct bytes into the project-owned source area. */
export async function materializeDirectImage(projectRoot: string, imagePath?: string, imageData?: string, imageName?: string, imageMediaType?: string): Promise<EditableSourcePage> {
  let bytes: Buffer
  let name = imageName?.trim() || 'source-image.png'
  if (imagePath !== undefined) {
    const resolved = imagePath.startsWith('file:') ? fileURLToPath(new URL(imagePath)) : resolve(imagePath)
    const info = await stat(resolved)
    if (!info.isFile() || info.size > 64 * 1024 * 1024) throw new Error('source_image_path must point to an image file no larger than 64 MiB.')
    bytes = await readFile(resolved)
    name = basename(resolved)
  } else if (imageData !== undefined) {
    const match = imageData.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([\s\S]+)$/iu)
    const mediaType = (match?.[1] ?? imageMediaType ?? 'image/png').toLowerCase()
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mediaType)) throw new Error(`Unsupported source image media type: ${mediaType}`)
    const encoded = (match?.[2] ?? imageData).replace(/\s+/gu, '')
    if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded) || encoded.length % 4 === 1) throw new Error('source_image_data must be valid Base64 image data.')
    bytes = Buffer.from(encoded, 'base64')
    if (bytes.length === 0 || bytes.length > 64 * 1024 * 1024) throw new Error('source_image_data must contain non-empty image bytes no larger than 64 MiB.')
    const extension = mediaType === 'image/jpeg' ? '.jpg' : mediaType === 'image/webp' ? '.webp' : mediaType === 'image/gif' ? '.gif' : '.png'
    if (!/\.[A-Za-z0-9]+$/u.test(name)) name += extension
  } else throw new Error('Either source_image_path or source_image_data is required.')
  const detected = detectImageExtension(bytes)
  if (detected === undefined) throw new Error('The supplied source is not a supported PNG, JPEG, WebP, or GIF image.')
  const checksum = createHash('sha256').update(bytes).digest('hex')
  const extension = detected
  if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(extension)) throw new Error(`Unsupported source image extension: ${extension}`)
  const target = join(projectRoot, '.zerowall', 'artifacts', 'presentations', 'rebuild-source', `${checksum}${extension}`)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, bytes, { flag: 'wx' }).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error })
  return { path: target, kind: 'image', checksum, page: 1 }
}

function detectImageExtension(bytes: Uint8Array): '.png' | '.jpg' | '.webp' | '.gif' | undefined {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return '.png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return '.jpg'
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return '.gif'
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return '.webp'
  return undefined
}

async function materializeSessionImage(
  store: { imageHostPath?(ref: unknown): string | undefined; readImage?(ref: unknown): Promise<{ data: Uint8Array }> } | undefined,
  ref: unknown,
  projectRoot: string,
  sessionId: string,
): Promise<{ path: string; name: string; sha256: string }> {
  const typed = ref as { attachmentId?: unknown; name?: unknown; mediaType?: unknown }
  const id = typeof typed.attachmentId === 'string' ? typed.attachmentId : ''
  const name = typeof typed.name === 'string' && typed.name.trim() ? typed.name : `${id || sessionId}.png`
  const hostPath = store?.imageHostPath?.(ref)
  if (hostPath) {
    try {
      return { path: hostPath, name, sha256: createHash('sha256').update(await readFile(hostPath)).digest('hex') }
    } catch {
      // A stale host path can occur after an attachment-store migration; the
      // verified read API remains the authoritative fallback.
    }
  }
  if (!store?.readImage) throw new Error(`图片附件 ${id} 无法读取。`)
  const stored = await store.readImage(ref)
  const sha256 = createHash('sha256').update(stored.data).digest('hex')
  const extension = typed.mediaType === 'image/jpeg' ? '.jpg' : typed.mediaType === 'image/webp' ? '.webp' : typed.mediaType === 'image/gif' ? '.gif' : '.png'
  const path = join(projectRoot, '.zerowall', 'artifacts', 'presentations', 'rebuild-source', `${sha256}${extension}`)
  await mkdir(resolve(path, '..'), { recursive: true })
  await writeFile(path, stored.data, { flag: 'wx' }).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error })
  return { path, name: name.toLowerCase().endsWith(extension) ? name : `${name}${extension}`, sha256 }
}

export async function readPresentationSlidePreview(store: ResearchStore, presentationId: string, slideId: string): Promise<PresentationSlidePreview> {
  const presentation = store.getPresentation(presentationId)
  if (presentation === undefined) throw new Error(`Presentation was not found: ${presentationId}`)
  const project = store.getProject(presentation.projectId)
  if (project === undefined) throw new Error(`Project was not found: ${presentation.projectId}`)
  const slideIndex = presentation.slides.findIndex(slide => slide.id === slideId)
  if (slideIndex < 0) throw new Error(`Slide was not found: ${slideId}`)
  const slide = presentation.slides[slideIndex]!
  const generatedPath = join(project.rootPath, '.zerowall', 'artifacts', 'presentations', presentation.id, 'visuals', `slide-${String(slideIndex + 1).padStart(2, '0')}.png`)
  const candidates = [slide.visualUri, slide.visual?.generatedUri]
    .map(value => value === undefined ? undefined : localFilePath(value))
    .filter((value): value is string => value !== undefined)
  candidates.push(generatedPath)
  const projectRoot = await realpath(resolve(project.rootPath))
  for (const candidate of [...new Set(candidates.map(value => resolve(value)))]) {
    try {
      const target = await realpath(candidate)
      if (!isWithin(target, projectRoot)) continue
      const info = await stat(target)
      if (!info.isFile() || info.size > 64 * 1024 * 1024) continue
      const mediaType = previewMediaType(target)
      if (mediaType === undefined) continue
      return { presentationId, slideId, slideIndex, name: basename(target), uri: pathToFileURL(target).href, mediaType, byteSize: info.size, base64: (await readFile(target)).toString('base64') }
    } catch {
      // A stale URI must not prevent the stable slide-NN path fallback.
    }
  }
  throw new Error('The slide preview image is missing or unavailable.')
}

function filePath(uri: string): string {
  const parsed = new URL(uri)
  if (parsed.protocol !== 'file:') throw new Error('Presentation export URI must use the file: protocol.')
  return fileURLToPath(parsed)
}

function localFilePath(value: string): string | undefined {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'file:' ? fileURLToPath(parsed) : undefined
  } catch {
    return isAbsolute(value) ? value : undefined
  }
}

function previewMediaType(path: string): PresentationSlidePreview['mediaType'] | undefined {
  const types: Readonly<Record<string, PresentationSlidePreview['mediaType']>> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  }
  return types[extname(path).toLocaleLowerCase()]
}

function isWithin(path: string, root: string): boolean {
  const inside = relative(resolve(root), resolve(path))
  return inside === '' || (!inside.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && inside !== '..' && !isAbsolute(inside))
}
export function apply(ctx: Context): void {
  ctx.plugin({ name: 'zerowall-ppt-runtime', inject: pptRuntimeInject, apply: applyPptRuntime }, {
    presetId: 'ppt',
    installPreset: true,
    pythonExecutable: process.platform === 'win32' ? 'python' : 'python3',
    browserExecutable: '',
    fontDirs: [],
    outputRoot: '.zerowall/artifacts/presentations',
  })
  ctx.plugin(ZeroWallPresentationService)
}
