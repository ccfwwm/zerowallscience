import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { strToU8, unzipSync, zipSync } from 'fflate'
import { expect, it } from 'vitest'
import { installPresentationWorkflow } from '../src/host/presentation-workflow.js'

// Use DSH's actual dispatcher: it validates around-wrapper outputs and freezes
// values. A permissive execute mock missed both production failures.
it('keeps closed Univer outputs intact through lint, review, export and journal recovery', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zerowall-presentation-contract-'))
  const ctx = new Context(), events: any[] = []
  const agent: any = { session: { id: 'contract', header: { cwd: root }, snapshotEvents: () => events, append: (type: string, data: unknown) => events.push({ type, data: structuredClone(data) }) } }
  const scope = { file: join(root, 'deck.univer'), unitId: 'slides', worktreeId: 'draft' }
  const canonical = { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true }, result: { type: 'json', required: true } } } as const
  const occludingPage = { page: 1, id: 'p1', fingerprint: 'rev1', data: { elementOrder: ['text', 'image'], elements: {
    text: { type: 'shape', transform: { left: 20, top: 20, width: 100, height: 30 }, shapeData: { shapeText: { text: 'Editable result' } } },
    image: { type: 'shape', transform: { left: 60, top: 20, width: 100, height: 50 }, shapeData: { fill: { fillImageSource: 'bitmap' } } },
  } } }
  const snapshots = [occludingPage]
  const notes = ['Speaker notes retained after export']
  let streamHook: any
  try {
    await writeFile(join(root, 'spec.json'), JSON.stringify({ width: 960, height: 540, fonts: {}, palette: {}, slides: [{ assetIds: [] }] }))
    await writeFile(join(root, 'assets.json'), JSON.stringify({ schemaVersion: 2, assets: [] }))
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    const on = ctx.on.bind(ctx)
    const workflowContext: any = new Proxy(ctx, { get(target, key) {
      if (key === 'llm') return { resolveModelInfo: async () => ({ inputModalities: ['text', 'image'] }) }
      if (key === 'on') return (name: string, hook: any) => { if (name === 'llm/stream') streamHook = hook; return on(name as any, hook) }
      return Reflect.get(target, key)
    } })
    installPresentationWorkflow(workflowContext)
    for await (const _ of streamHook({ sessionId: agent.session.id, provider: 'selected', model: 'selected' }, async function* () {})) { /* fixture route */ }
    const bodies: Record<string, (args: any) => Promise<any>> = {
      univer_execute: async args => ({ value: args.code.includes('map(slide=>slide.getSpeakerNotes())') ? notes : snapshots }),
      univer_inspect: async () => ({ slides: [{ id: 'p1', index: 0 }] }),
      univer_lint: async () => ({ coverage: { pages: [{ page: 1, pageId: 'p1' }] }, findings: [] }),
      univer_screenshot: async () => ({ images: [{ path: 'page-1.png', metadata: { page: 1 } }] }),
      univer_export: async args => {
        await writeFile(join(root, args.output), zipSync({
          '[Content_Types].xml': strToU8('<Types></Types>'),
          'ppt/presentation.xml': strToU8('<p:presentation><p:sldIdLst></p:sldIdLst></p:presentation>'),
          'ppt/slides/slide1.xml': strToU8('<editable-slide/>'),
        }))
        return { outputPath: args.output }
      },
    }
    for (const [name, body] of Object.entries(bodies)) ctx.tools.register(defineTool({ name, description: '', parameters: { file: { type: 'string' }, unitId: { type: 'string' }, worktreeId: { type: 'string' }, code: { type: 'string' }, pages: { type: 'array', items: { type: 'integer' } }, output: { type: 'string' }, contactSheet: { type: 'boolean' } }, output: { schema: canonical, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] }, execute: async args => ({ ok: true, result: await body(args) }) }))
    const raw = (name: string, args: any = {}) => ctx.tools.execute({ name, arguments: args, callId: randomUUID() as any, agent, signal: new AbortController().signal })
    const call = async (name: string, args: any = {}) => {
      const result = await raw(name, args)
      if (result.isError) throw new Error(result.error.message)
      return typeof result.value === 'string' ? JSON.parse(result.value.startsWith('{') ? result.value : JSON.stringify(result.value)) : result.value
    }
    await call('presentation_prepare', { ...scope, spec_path: 'spec.json', manifest_path: 'assets.json', mode: 'new' })
    const lint = await raw('univer_lint', { ...scope, pages: [1] })
    expect(lint.isError).toBe(false)
    if (!lint.isError) { expect(Object.keys(lint.value as object)).toEqual(['ok', 'result']); expect(Object.isFrozen(lint.value)).toBe(true) }
    const checked = await call('presentation_check_pages', { pages: [1], output: 'screenshots' })
    expect(checked.lint.presentationFindings).toBeUndefined()
    expect(checked.presentationFindings).toHaveLength(1)
    expect(checked.presentationFindings[0]).toMatchObject({ page: 1, sha256: expect.stringMatching(/^[a-f0-9]{64}$/u) })
    expect((await call('presentation_status')).presentationFindings).toEqual(checked.presentationFindings)
    const blocked = await raw('univer_export', { ...scope, output: 'blocked.pptx' })
    expect(blocked.isError).toBe(true)
    if (blocked.isError) expect(blocked.error.message).toContain('pages: 1')
    // Test fixture observations exercise the review gate; real visual acceptance
    // is covered by the separate rendered-Univer smoke, not these fake images.
    await call('presentation_record_reviews', { reviews: [{ kind: 'page', target: '1', observations: 'Fixture confirms this intentional overlap; real PNG review is separate.', waivers: checked.presentationFindings.map((finding: any) => finding.sha256) }] })
    const exported = await raw('univer_export', { ...scope, output: 'deck.pptx' })
    expect(exported.isError).toBe(false)
    if (!exported.isError) { expect(Object.keys(exported.value as object)).toEqual(['ok', 'result']); expect(Object.isFrozen(exported.value)).toBe(true) }
    const status = await call('presentation_status')
    const bytes = await readFile(join(root, 'deck.pptx'))
    expect(status.state).toMatchObject({ phase: 'exported-awaiting-readback', exportReceipt: { outputPath: 'deck.pptx', notesWritten: 1, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } })
    expect(status.state.failure).toBeUndefined()
    expect(Buffer.from(unzipSync(bytes)['ppt/notesSlides/notesSlide1.xml']!).toString()).toContain(notes[0])
    events.length = 0
    await call('presentation_prepare', { ...scope, spec_path: 'spec.json', manifest_path: 'assets.json', mode: 'new' })
    expect((await call('presentation_status')).state.exportReceipt).toEqual(status.state.exportReceipt)
    snapshots[0]!.fingerprint = 'edited'
    await call('univer_execute', { ...scope, code: 'capture edited page' })
    expect((await call('presentation_status')).state.exportReceipt).toBeUndefined()
    expect((await call('presentation_status')).blockedPages).toEqual([1])
  } finally { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
})
