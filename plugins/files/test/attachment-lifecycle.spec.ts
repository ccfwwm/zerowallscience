import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { prepareUploadedFile, ZeroWallFilesService, installAttachmentParsing } from '../src/host/index.js'

const roots: string[] = []
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'zerowall-attachment-lifecycle-')); roots.push(root); vi.stubEnv('DSH_HOME', root)
  const service = Object.create(ZeroWallFilesService.prototype) as ZeroWallFilesService
  const events: any[] = []
  const session = { id: 'session', header: { cwd: root }, snapshotEvents: () => events, append: (type: string, data: unknown) => events.push({ type, data }) }
  const services: Record<string, any> = {}
  const ctx: any = { logger: { warn: vi.fn() }, sessions: { get: (id: string) => id === 'session' ? session : undefined }, get: (key: string) => services[key] }
  Object.defineProperty(service, 'ctx', { value: ctx }); services.zerowallFiles = service
  return { root, service, events, session, services, ctx }
}
it('uses the resolved workspace scope and caller cancellation for Office rendering', async () => {
  const f = await fixture()
  const signal = new AbortController().signal
  // The real Office service reads scope.workspaceRoot; passing a session ID
  // string here reproduced the installed application's undefined.trim error.
  const scope = { sessionId: 'session' as any, workspaceRoot: f.root }
  f.services.typert = { lookups: { get: () => ({ resolve: async id => id === 'session' ? scope : undefined }) } }
  f.services.officeToPdf = { render: vi.fn(async (resolvedScope, path, priority, passedSignal) => {
    expect(resolvedScope.workspaceRoot.trim()).toBe(f.root)
    expect(resolvedScope.sessionId).toBe('session')
    expect(path).toBe('科研报告.docx')
    expect(priority).toBe('foreground')
    expect(passedSignal).toBe(signal)
    return { data: Buffer.from('%PDF-1.7'), missingFonts: ['Absent font'] }
  }) }
  expect(await f.service.renderWorkspaceOffice({ sessionId: 'session', path: '科研报告.docx' }, signal)).toEqual({ data: Buffer.from('%PDF-1.7').toString('base64'), missingFonts: ['Absent font'] })
  await expect(f.service.renderWorkspaceOffice({ sessionId: 'unknown', path: '科研报告.docx' }, signal)).rejects.toThrow('session was not found')
  const cancelled = AbortSignal.abort(new Error('preview closed'))
  await expect(f.service.renderWorkspaceOffice({ sessionId: 'session', path: '科研报告.docx' }, cancelled)).rejects.toThrow('preview closed')
  expect(f.services.officeToPdf.render).toHaveBeenCalledOnce()
})

it('defers attachment Office reads until admission and enforces capacity, cancellation and integrity', async () => {
  const f = await fixture()
  const bytes = Buffer.from('Office content fixture')
  const ref = await prepareUploadedFile({ sessionId: 'session', name: 'report.pptx', data: bytes.toString('base64') })
  const signal = new AbortController().signal
  f.services.officeToPdf = { convert: vi.fn(async (request, passedSignal) => {
    expect(passedSignal).toBe(signal)
    expect(request.source.bytes).toBe(bytes.length)
    expect(request.source.version).toBe(ref.sha256)
    await expect(request.source.read(signal, bytes.length - 1)).rejects.toThrow('capacity')
    await expect(request.source.read(AbortSignal.abort(new Error('cancelled')), bytes.length)).rejects.toThrow('cancelled')
    expect(await request.source.read(signal, bytes.length)).toEqual({ bytes, version: ref.sha256 })
    const metadata = JSON.parse(await readFile(join(f.root, 'attachments/files/v1/objects', ref.sha256.slice(0, 2), ref.sha256 + '.json'), 'utf8'))
    await writeFile(metadata.sourcePath, Buffer.alloc(bytes.length))
    await expect(request.source.read(signal, bytes.length)).rejects.toThrow('Source changed')
    return { pdf: Buffer.from('%PDF-1.7'), missingFonts: [] }
  }) }
  await expect(f.service.renderOfficeAttachment({ sessionId: 'intruder', attachmentId: ref.attachmentId }, signal)).rejects.toThrow('session')
  expect(f.services.officeToPdf.convert).not.toHaveBeenCalled()
  expect(await f.service.renderOfficeAttachment({ sessionId: 'session', attachmentId: ref.attachmentId }, signal)).toEqual({ data: Buffer.from('%PDF-1.7').toString('base64'), missingFonts: [] })
})
it('keeps concurrent session authorization and both extraction records when metadata writes share a timestamp', async () => {
  const f = await fixture()
  vi.spyOn(Date, 'now').mockReturnValue(1790805861045)
  const data = Buffer.from('name,value\nmeasured,42').toString('base64')
  const refs = await Promise.all(Array.from({ length: 12 }, (_, index) => prepareUploadedFile({ sessionId: index === 0 ? 'session' : 'parallel-' + index, name: 'facts.csv', data })))
  const ref = refs[0]!
  const artifact = join(f.root, 'enhanced.md'); await writeFile(artifact, 'enhanced layout')
  f.services.zerowallMineru = { getConfigStatus: async () => ({ tokenConfigured: true }), parse: async () => ({ taskId: 'parallel-task', artifacts: [{ name: 'full.md', path: artifact }] }) }
  await Promise.all([
    f.service.extract({ sessionId: 'session', attachmentId: ref.attachmentId, mode: 'local' }),
    f.service.extract({ sessionId: 'session', attachmentId: ref.attachmentId, mode: 'mineru' }),
    prepareUploadedFile({ sessionId: 'last-session', name: 'facts.csv', data }),
  ])
  const stored = JSON.parse(await readFile(join(f.root, 'attachments/files/v1/objects', ref.sha256.slice(0, 2), ref.sha256 + '.json'), 'utf8'))
  expect(stored.sessionIds).toHaveLength(13)
  expect(stored.localExtraction.state).toBe('done')
  expect(stored.mineruExtraction.state).toBe('done')
  expect((await f.service.read({ sessionId: 'session', attachmentId: ref.attachmentId })).text).toContain('42')
})
it('admits current image blocks before session commit, persists OCR state and calls next', async () => {
  const f = await fixture(); const data = Buffer.from('image-fixture'); const sha = createHash('sha256').update(data).digest('hex')
  const path = join(f.root, 'scan.png'); await writeFile(path, data)
  f.services.attachments = { imageHostPath: () => path }; f.services.zerowallMineru = { getConfigStatus: async () => ({ tokenConfigured: false }) }
  let hook: any; f.ctx.on = (name: string, fn: unknown) => { if (name === 'agent/pre-step') hook = fn }; f.ctx.effect = () => {}
  installAttachmentParsing(f.ctx)
  const incoming = { role: 'user', source: { kind: 'user' }, content: [{ type: 'image', attachment: { attachmentId: `sha256:${sha}`, name: 'scan.png', mediaType: 'image/png', bytes: data.length, width: 10, height: 10 } }] }
  const next = vi.fn().mockResolvedValue({ kind: 'enter', messages: [incoming] })
  const result = await hook({ agent: { session: f.session }, messages: [incoming] }, next)
  expect(next).toHaveBeenCalledOnce()
  expect(result.messages).toHaveLength(2)
  expect(result.messages[1].content[0].text).toContain('needs_ocr')
  expect(result.messages[1].content[0].text).toContain('needs_configuration')
  expect(f.events.some(event => event.type === 'zerowall/file-extraction')).toBe(true)
  expect(await f.service.inspectOriginalMetadata({ sessionId: 'session', attachmentId: `sha256:${sha}` })).toMatchObject({ sha256: sha })
})
it('retains complete text beyond the old limit and reuses verified artifacts after model retries', async () => {
  const f = await fixture(); const text = 'x'.repeat(130000) + 'LAST-PAGE'
  const ref = await prepareUploadedFile({ sessionId: 'session', name: 'long.txt', data: Buffer.from(text).toString('base64') })
  const first = await f.service.extract({ sessionId: 'session', attachmentId: ref.attachmentId })
  expect(first.textChars).toBe(text.length); expect(await readFile(first.artifactPath!, 'utf8')).toBe(text)
  const second = await f.service.extract({ sessionId: 'session', attachmentId: ref.attachmentId })
  expect(second).toEqual(first)
  expect((await f.service.read({ sessionId: 'session', attachmentId: ref.attachmentId, offset: 130000 })).text).toBe('LAST-PAGE')
})
it('keeps submitted MinerU taskId across interruption and missing configuration, then resumes without resubmission', async () => {
  const f = await fixture(); const ref = await prepareUploadedFile({ sessionId: 'session', name: 'scan.pdf', data: Buffer.from('fake pdf').toString('base64') })
  const parse = vi.fn(async (input: any) => { await input.onTaskSubmitted('task-existing'); throw new Error('network interrupted') })
  const artifact = join(f.root, 'full.md'); await writeFile(artifact, '# recovered result')
  const task = vi.fn().mockResolvedValue({ state: 'done', result: { taskId: 'task-existing', artifacts: [{ name: 'full.md', path: artifact }] } })
  let configured = true
  f.services.zerowallMineru = { getConfigStatus: async () => ({ tokenConfigured: configured }), parse, task }
  expect(await f.service.extract({ sessionId: 'session', attachmentId: ref.attachmentId, mode: 'mineru' })).toMatchObject({ state: 'partial', taskId: 'task-existing' })
  configured = false
  expect(await f.service.extract({ sessionId: 'session', attachmentId: ref.attachmentId, mode: 'mineru' })).toMatchObject({ state: 'needs_configuration', taskId: 'task-existing' })
  configured = true
  expect(await f.service.extract({ sessionId: 'session', attachmentId: ref.attachmentId, mode: 'mineru' })).toMatchObject({ state: 'done', taskId: 'task-existing' })
  expect(parse).toHaveBeenCalledOnce(); expect(task).toHaveBeenCalledWith({ sessionId: 'session', taskId: 'task-existing', api: 'precision', wait: true })
})

it('keeps spreadsheet cells authoritative while allowing explicit enhanced-result reads', async () => {
  const f = await fixture()
  const ref = await prepareUploadedFile({ sessionId: 'session', name: 'facts.csv', data: Buffer.from('name,value\nmeasured,42').toString('base64') })
  const artifact = join(f.root, 'enhanced.md'); await writeFile(artifact, 'decorative layout enhancement')
  f.services.zerowallMineru = { getConfigStatus: async () => ({ tokenConfigured: true }), parse: async () => ({ taskId: 'enhanced', artifacts: [{ name: 'full.md', path: artifact }] }) }
  await f.service.extract({ sessionId: 'session', attachmentId: ref.attachmentId, mode: 'local' })
  await f.service.extract({ sessionId: 'session', attachmentId: ref.attachmentId, mode: 'mineru' })
  expect((await f.service.read({ sessionId: 'session', attachmentId: ref.attachmentId })).text).toContain('42')
  expect((await f.service.inspect({ sessionId: 'session', attachmentId: ref.attachmentId, view: 'parsed' })).content).toContain('42')
  expect((await f.service.read({ sessionId: 'session', attachmentId: ref.attachmentId, kind: 'mineru' })).text).toBe('decorative layout enhancement')
})
