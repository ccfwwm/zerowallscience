import type { Context } from '@deepseek-ai/cordis'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { apply as applyPptRuntime, inject as pptRuntimeInject } from '@zerowallscience/dsh-ppt-runtime'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { defineTool, type JsonValue } from '@deepseek-ai/dsh-tools'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ResearchStore } from '@zerowallscience/research-store'
import type { CreatePresentationInput, PresentationRecord, ProjectRecord, UpdatePresentationChanges } from '@zerowallscience/research-store/types'
import type { ZeroWallImageGenerationService } from '@zerowallscience/plugin-images'
import { PresentationWorker } from './worker.js'
import { writePresentation } from './export.js'
import type {} from 'zod'
import { basename, isAbsolute, relative, resolve } from 'node:path'

declare module '@deepseek-ai/cordis' { interface Context { zerowallPresentation: ZeroWallPresentationService } }
export class ZeroWallPresentationService extends TypertRemoteService {
  static inject = ['tools', 'sessions', 'zerowallImageGeneration']
  private readonly store: ResearchStore
  private readonly worker: PresentationWorker
  constructor(ctx: Context) { super(ctx, 'zerowallPresentation'); const path = process.env.ZEROWALL_RESEARCH_DB?.trim(); if (!path) throw new Error('ZEROWALL_RESEARCH_DB is required.'); this.store = new ResearchStore(path); this.worker = new PresentationWorker(this.store, ctx.get('zerowallImageGeneration') as ZeroWallImageGenerationService); this.worker.recover(); ctx.tools.register(defineTool({
    name: 'create_presentation',
    description: 'Create and start a presentation with the ZeroWall Science PPT workflow. This is the default tool for PPT, slides, decks, research reports, thesis defenses, and project presentations. It automatically associates the active session workspace with a research project.',
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
        title: { type: 'string', description: 'Optional replacement title.' },
        sections: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { title: { type: 'string' }, points: { type: 'array', items: { type: 'string' } } } }, description: 'Optional replacement slide sections.' },
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{ type: 'text', text: `已更新演示文稿“${String(value.title ?? '')}”，正在重新生成同一文件。` }],
        presentationMeta: (_args, value) => value,
      },
      async execute(args) {
        const id = typeof args.presentation_id === 'string' ? args.presentation_id : ''
        if (!id) throw new Error('presentation_id is required.')
        const service = ctx.get('zerowallPresentation') as ZeroWallPresentationService
        const current = serviceRecord(id)
        const sections = Array.isArray(args.sections) ? args.sections.filter(value => typeof value === 'object' && value !== null).map(value => {
          const item = value as { title?: unknown; points?: unknown }
          return { title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : current.title, points: Array.isArray(item.points) ? item.points.filter(point => typeof point === 'string').map(point => point.trim()).filter(Boolean) : [] }
        }) : undefined
        const changes: UpdatePresentationChanges = { ...(typeof args.title === 'string' && args.title.trim() ? { title: args.title.trim() } : {}), ...(sections && sections.length > 0 ? { outline: sections } : {}) }
        const updated = service.updateAndGenerate({ id, changes })
        return JSON.parse(JSON.stringify({ presentationId: updated.id, generationId: updated.generation?.id, title: updated.title, status: updated.status, projectId: updated.projectId, openWorkbench: true })) as JsonValue as Record<string, JsonValue>
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
  openEvent(record: PresentationRecord, sessionId?: string): void {
    ;(this.ctx as unknown as { emit(event: string, ...args: unknown[]): void }).emit('zerowall/presentation-open', [{ presentationId: record.id, projectId: record.projectId, title: record.title, ...(sessionId ? { sessionId } : {}) }])
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
  @Remote('export') async export(input: { id: string; format: 'pptx' | 'pdf'; uri: string }): Promise<PresentationRecord> {
    const presentation = this.store.getPresentation(input.id)
    if (presentation === undefined) throw new Error(`Presentation was not found: ${input.id}`)
    if (presentation.status !== 'ready') throw new Error('Only a ready presentation can be exported.')
    await writePresentation(presentation, input.format, input.uri)
    const bytes = await readFile(filePath(input.uri))
    const kind = input.format
    const artifact = {
      kind,
      uri: input.uri,
      mediaType: input.format === 'pptx'
        ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        : 'application/pdf',
      checksum: createHash('sha256').update(bytes).digest('hex'),
    } as const
    return this.store.updatePresentation(input.id, {
      exportUris: { ...presentation.exportUris, [input.format]: input.uri },
      artifacts: [...presentation.artifacts.filter(existing => existing.kind !== kind), artifact],
    })
  }
}

function filePath(uri: string): string {
  const parsed = new URL(uri)
  if (parsed.protocol !== 'file:') throw new Error('Presentation export URI must use the file: protocol.')
  return fileURLToPath(parsed)
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
