import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import { afterEach, expect, it, vi } from 'vitest'
import { createProject, editProject, loadProject } from '../../dsh-ppt-maker/src/core/project/store.js'
import { installPresentationWorkflow } from '../src/host/presentation-workflow.js'
import { hash, pageStyle } from '../src/host/visual-assets.js'
import { registerExportTool } from '../../dsh-ppt-maker/src/tools/export.js'
import { unzipSync, strFromU8 } from 'fflate'
import { imageConcurrency } from '../src/host/image-concurrency.js'
import { templateFixture } from './fixtures/presentation-template.js'

const roots: string[] = [], disposers: (() => void)[] = []
afterEach(async () => { disposers.splice(0).forEach(dispose => dispose()); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function fixture(count: number, newFlow = false, outputMode: 'image' | 'editable' = 'image') {
  const root = await mkdtemp(join(tmpdir(), 'page-jobs-')); roots.push(root)
  const spec: any = { width: 960, height: 540, fonts: {}, palette: {}, slides: Array.from({ length: count }, (_, index) => ({ text: [`Page ${index + 1}`], assetIds: [] })) }
  await writeFile(join(root, 'spec.json'), JSON.stringify(spec)); await writeFile(join(root, 'assets.json'), '{"schemaVersion":2,"assets":[]}')
  await createProject(root, { dir: 'deck' })
  const events: any[] = [], definitions = new Map<string, any>(), canonical = new Map<string, any>()
  let observer: any
  const agent = { session: { header: { cwd: root }, snapshotEvents: () => events, append: (type: string, data: any) => events.push({ type, data }) } }
  const ctx = { effect: (factory: () => () => void) => disposers.push(factory()), on: (_: string, fn: any) => { observer = fn }, tools: {
    register: (definition: any) => { if (definitions.has(definition.name)) throw new Error('Duplicate tool registration: ' + definition.name); definitions.set(definition.name, definition) }, execute: (input: any) => invoke(input.name, input.arguments, input.callId)
  } }
  async function invoke(name: string, args: any, callId = randomUUID()): Promise<any> {
    const exec = { name, arguments: args, agent, callId }
    return definitions.has(name) ? { isError: false, value: await definitions.get(name).execute(args, exec) }
      : observer(exec, async () => ({ isError: false, value: await canonical.get(name)(args) }))
  }
  const generate = vi.fn(async (args: any) => {
    const bytes = await sharp({ create: { width: 16, height: 9, channels: 4, background: args.prompt.includes('Modify') ? 'green' : 'blue' } }).png().toBuffer()
    const path = resolve(root, args.output_path)
    await writeFile(path, bytes)
    await writeFile(path + '.generation.json', JSON.stringify({ sha256: hash(bytes), prompt: args.prompt, model: 'selected-image-model', requestedQuality: 'max', inputImageHashes: await Promise.all((args.input_paths ?? []).map(async (path: string) => hash(await readFile(path)))) }))
    return { path, sha256: hash(bytes) }
  })
  canonical.set('generate_image', generate); canonical.set('edit_image', vi.fn(async args => generate(args)))
  canonical.set('ppt_edit', vi.fn(async args => ({ ok: true, ...await editProject(root, { dir: args.dir, baseRevision: args.baseRevision, ops: args.ops, newVersion: args.newVersion }) })))
  canonical.set('ppt_check', vi.fn(async () => ({ ok: true, pass: false, issues: [{ page: 1, severity: 'blocker', description: 'advisory' }] })))
  canonical.set('ppt_render', vi.fn(async args => {
    const images = await Promise.all(args.pages.map(async (page: number) => { const path = join(root, `render-${page}.png`); await writeFile(path, `png-${page}`); return { page, path } }))
    return { ok: true, images }
  }))
  let exportTool: any
  registerExportTool({ tools: { register: (definition: any) => { exportTool = definition } }, sessions: { get: () => ({ header: { cwd: root } }) } } as any)
  canonical.set('ppt_export', vi.fn(async args => exportTool.execute(args, { agent: { session: { id: 'fixture' } } })))
  installPresentationWorkflow(ctx as any)
  await invoke('presentation_prepare', { spec_path: 'spec.json', manifest_path: 'assets.json', dir: 'deck', mode: 'new', output_mode: outputMode })
  const state = async () => JSON.parse(await readFile(events.at(-1).data.journal, 'utf8'))
  // Existing job tests exercise saved pre-upgrade projects. New-flow tests below
  // keep the gate created by presentation_prepare and run the real four-image path.
  if (!newFlow) { const saved = await state(); delete saved.styleSelectionRequired; await writeFile(events.at(-1).data.journal, JSON.stringify(saved)) }
  async function waitPage(page: number, status: string) { await vi.waitFor(async () => { const job = (await state()).pageJobs[page]; expect({ status: job.status, error: job.error }).toEqual({ status, error: status === 'failed' ? job.error : undefined }) }, { timeout: 10000 }) }
  return { root, invoke, canonical, state, waitPage, spec, generate, events, definitions }
}

it('requires four visible representative images and a user selection before confirmed pages inherit the chosen image', { timeout: 30000 }, async () => {
  const f = await fixture(2, true)
  const formal = { templates: [{ page: 1, output_path: 'page.png', asset_id: 'page' }] }
  await expect(f.invoke('presentation_generate_fast', formal)).rejects.toThrow('PRESENTATION_STYLE_CANDIDATES_REQUIRED')
  await expect(f.invoke('presentation_write_prompt_document', { spec_path: 'spec.json', output_path: 'prompts.md' })).rejects.toThrow('PRESENTATION_STYLE_CANDIDATES_REQUIRED')
  await expect(f.invoke('presentation_select_style', { style_id: 'academic-clean' })).rejects.toThrow('PRESENTATION_STYLE_CANDIDATES_REQUIRED')
  const result = await f.invoke('presentation_generate_style_candidates', { representative_page: 2 })
  const previews = JSON.parse(result.value)
  expect(previews.candidates).toHaveLength(4)
  expect(new Set(previews.candidates.map((item: any) => item.id)).size).toBe(4)
  expect(new Set(previews.candidates.map((item: any) => item.path)).size).toBe(4)
  for (const call of f.generate.mock.calls) {
    expect(call[0].prompt).toContain('Exact page text to preserve: ["Page 2"]')
    expect(call[0].aspect_ratio).toBe('16:9')
  }
  const rendered = f.definitions.get('presentation_generate_style_candidates').output.render({}, result.value)
  for (const candidate of previews.candidates) {
    expect(await readFile(candidate.path)).toBeTruthy()
    expect(rendered[0].text).toContain(candidate.previewMarkdown)
  }
  await expect(f.invoke('presentation_write_prompt_document', { spec_path: 'spec.json', output_path: 'prompts.md' })).rejects.toThrow('PRESENTATION_STYLE_SELECTION_REQUIRED')
  const selected = previews.candidates[1]
  await f.invoke('presentation_select_style', { style_id: selected.id })
  await f.invoke('presentation_write_prompt_document', { spec_path: 'spec.json', output_path: 'prompts.md', markdown: '' })
  let spec = JSON.parse(await readFile(join(f.root, 'spec.json'), 'utf8'))
  expect(spec.slides[0].combinedPrompt).toContain(selected.assetId)
  expect(spec.slides[0].combinedPrompt).toContain(selected.id)
  await expect(f.invoke('presentation_generate_fast', formal)).rejects.toThrow('PRESENTATION_PLAN_CONFIRMATION_REQUIRED')
  await f.invoke('presentation_confirm_plan', { prompt_document_path: 'prompts.md' })
  await f.invoke('presentation_generate_fast', formal)
  await waitFastExport(f)
  const call = f.canonical.get('edit_image').mock.calls[0][0]
  expect(call.input_paths).toEqual([selected.path])
  expect(call.aspect_ratio).toBe('16:9')
  expect(call.prompt).toBe(spec.slides[0].combinedPrompt)
  expect(f.generate).toHaveBeenCalledTimes(5)
  expect((await f.state()).pageJobs[1].status).toBe('complete')
  // Registering the completed page must not invalidate the confirmed sources.
  await f.invoke('presentation_generate_fast', { templates: [{ page: 2, output_path: 'page-2.png', asset_id: 'page-2' }] })
  await waitFastExport(f)
  expect((await f.state()).exportReceipt.stage).toBe('final')
})

it('does not bind or select an incomplete candidate set', async () => {
  const f = await fixture(1, true), original = f.generate
  f.canonical.set('generate_image', async (args: any) => { if (args.prompt.includes('Style option 编辑杂志')) throw new Error('provider unavailable'); return original(args) })
  await expect(f.invoke('presentation_generate_style_candidates', {})).rejects.toThrow('incomplete (3/4 images registered)')
  expect(JSON.parse(await readFile(join(f.root, 'assets.json'), 'utf8')).assets).toHaveLength(3)
  await expect(f.invoke('presentation_select_style', { style_id: 'academic-clean' })).rejects.toThrow('PRESENTATION_STYLE_CANDIDATES_REQUIRED')
})

it('requires a rendered and explicitly confirmed editable representative page before queuing the rest', { timeout: 30000 }, async () => {
  const f = await fixture(2, true, 'editable')
  const candidates = JSON.parse((await f.invoke('presentation_generate_style_candidates', {})).value)
  await f.invoke('presentation_select_style', { style_id: candidates.candidates[0].id })
  await f.invoke('presentation_write_prompt_document', { spec_path: 'spec.json', output_path: 'prompts.md', markdown: '' })
  await f.invoke('presentation_confirm_plan', { prompt_document_path: 'prompts.md' })

  const rest = [{ page: 2, output_path: 'page-2.png', asset_id: 'page-2' }]
  await expect(f.invoke('presentation_generate_templates', { templates: rest })).rejects.toThrow('PRESENTATION_EDITABLE_SAMPLE_CONFIRMATION_REQUIRED')
  await expect(f.invoke('presentation_plan_editable_pages', { plans: [{ page: 2, elements: [{ elementId: 'title-2', elementType: 'text', bounds: [10, 10, 300, 50], content: { text: 'Page 2' } }] }] })).rejects.toThrow('PRESENTATION_EDITABLE_SAMPLE_CONFIRMATION_REQUIRED')
  await expect(f.invoke('presentation_build_pages', { pages: [2] })).rejects.toThrow('PRESENTATION_EDITABLE_SAMPLE_CONFIRMATION_REQUIRED')

  await f.invoke('presentation_generate_templates', { templates: [{ page: 1, output_path: 'page-1.png', asset_id: 'page-1' }] })
  await f.waitPage(1, 'awaiting-editable')
  const sample = (await f.state()).pageJobs[1].asset
  await f.invoke('presentation_plan_editable_pages', { plans: [{ page: 1, template_asset_id: sample.assetId, elements: [{ elementId: 'title-1', elementType: 'text', bounds: [10, 10, 300, 50], content: { text: 'Page 1' } }] }] })
  await f.invoke('presentation_resume_pages', { pages: [1] })
  await f.waitPage(1, 'complete')
  await expect(f.invoke('presentation_confirm_editable_samples', { confirmed: true, observations: 'The title is editable, aligned to the source layout, and the rendered font and diagram boundary are acceptable.' })).resolves.toBeTruthy()

  await f.invoke('presentation_generate_templates', { templates: rest })
  await f.waitPage(2, 'awaiting-editable')
  expect((await f.state()).editableApproval).toMatchObject({ pages: { 1: expect.any(String) } })
  const deck = await loadProject(f.root, 'deck'), samplePage = deck.pages.get('pages/01.page')!
  await editProject(f.root, { dir: 'deck', baseRevision: deck.manifest.revision, newVersion: true, ops: [{ op: 'update_page', page: 'pages/01.page', patch: { elements: samplePage.elements.map((element: any) => element.elementId === 'title-1' ? { ...element, content: { ...element.content, text: 'Changed after approval' } } : element) } }] })
  await expect(f.invoke('presentation_plan_editable_pages', { plans: [{ page: 2, template_asset_id: (await f.state()).pageJobs[2].asset.assetId, elements: [{ elementId: 'title-2', elementType: 'text', bounds: [10, 10, 300, 50], content: { text: 'Page 2' } }] }] })).rejects.toThrow('PRESENTATION_EDITABLE_SAMPLE_CONFIRMATION_STALE')
})

it('uses supplied visual references for all four candidates and verifies their generation receipts', async () => {
  const f = await fixture(1, true)
  await f.generate({ prompt: 'Customer visual reference', output_path: 'reference.png' })
  await f.invoke('presentation_record_asset', { manifest_path: 'assets.json', image_path: 'reference.png', asset_id: 'reference', role: 'style-reference' })
  await writeFile(join(f.root, 'spec.json'), JSON.stringify({ ...f.spec, styleReferenceAssetIds: ['reference'] }))
  f.generate.mockClear()
  const previews = JSON.parse((await f.invoke('presentation_generate_style_candidates', {})).value)
  expect(f.canonical.get('edit_image')).toHaveBeenCalledTimes(4)
  for (const call of f.canonical.get('edit_image').mock.calls) expect(call[0].input_paths).toEqual([join(f.root, 'reference.png')])
  const assets = JSON.parse(await readFile(join(f.root, 'assets.json'), 'utf8')).assets
  for (const candidate of previews.candidates) {
    expect(assets.find((asset: any) => asset.assetId === candidate.assetId).styleReferenceIds).toEqual(['reference'])
  }
})

it('confirms a non-empty existing prompt document and binds missing approval fields for legacy projects', async () => {
  const f = await fixture(1)
  await writeFile(join(f.root, 'manual.md'), '# User reviewed prompt')
  await f.invoke('presentation_confirm_plan', { prompt_document_path: 'manual.md' })
  expect(JSON.parse(await readFile(join(f.root, 'spec.json'), 'utf8'))).toMatchObject({ promptDocumentPath: 'manual.md', promptApprovalRequired: true })
  expect((await f.state()).promptApproval.promptDocumentSha256).toBe(hash('# User reviewed prompt'))
})

it('analyzes the supplied PPTX before candidates and reparses changed template bytes', { timeout: 30000 }, async () => {
  const f = await fixture(1, true), template = templateFixture()
  await writeFile(join(f.root, 'customer.pptx'), template)
  const prepared = JSON.parse((await f.invoke('presentation_prepare', { spec_path: 'spec.json', manifest_path: 'assets.json', dir: 'deck', mode: 'new', template_path: 'customer.pptx' })).value)
  expect(prepared.templateAnalysis.palette.accent1).toBe('#336699')
  expect(prepared.nextStep).toBe('presentation_generate_style_candidates')
  const previews = JSON.parse((await f.invoke('presentation_generate_style_candidates', {})).value)
  expect(f.generate.mock.calls[0]![0].prompt).toContain('Master, layout and example-slide geometry')
  await f.invoke('presentation_select_style', { style_id: previews.candidates[0].id })
  await writeFile(join(f.root, 'manual.md'), '# Old prompt')
  await expect(f.invoke('presentation_confirm_plan', { prompt_document_path: 'manual.md' })).rejects.toThrow('PRESENTATION_PROMPT_RECOMPILE_REQUIRED')
  await f.invoke('presentation_write_prompt_document', { spec_path: 'spec.json', output_path: 'prompts.md' })
  await f.invoke('presentation_confirm_plan', { prompt_document_path: 'prompts.md' })
  await writeFile(join(f.root, 'customer.pptx'), templateFixture('663399'))
  await expect(f.invoke('presentation_generate_fast', { templates: [{ page: 1, output_path: 'page.png', asset_id: 'page' }] })).rejects.toThrow('PRESENTATION_TEMPLATE_CHANGED')
  // The stored template path is enough to analyze again without a second copy.
  await f.invoke('presentation_prepare', { spec_path: 'spec.json', manifest_path: 'assets.json', dir: 'deck', mode: 'new' })
  const spec = JSON.parse(await readFile(join(f.root, 'spec.json'), 'utf8'))
  expect(spec.templateAnalysis.palette.accent1).toBe('#663399')
  expect(spec.styleCandidates).toBeUndefined()
  expect(spec.selectedStyleId).toBeUndefined()
})

it('preserves the existing project and plan when a supplied master has a different canvas', async () => {
  const f = await fixture(1, true), original = await readFile(join(f.root, 'spec.json'), 'utf8')
  await writeFile(join(f.root, 'customer.pptx'), templateFixture('336699', [9144000, 6858000]))
  await expect(f.invoke('presentation_prepare', { spec_path: 'spec.json', manifest_path: 'assets.json', dir: 'deck', mode: 'new', template_path: 'customer.pptx' })).rejects.toThrow('PRESENTATION_TEMPLATE_CANVAS_MISMATCH')
  expect(await readFile(join(f.root, 'spec.json'), 'utf8')).toBe(original)
  expect((await loadProject(f.root, 'deck')).deck.size).toEqual([960, 540])
})

it('returns immediately, commits out-of-order success, isolates failure, and resumes only the selected page', { timeout: 30000 }, async () => {
  const f = await fixture(3), slow = Promise.withResolvers<void>()
  const original = f.generate; let fail = true
  f.canonical.set('generate_image', vi.fn(async args => {
    if (args.prompt === 'Page 1') await slow.promise
    if (args.prompt === 'Page 2' && fail) throw new Error('Page 2 provider failure')
    return original(args)
  }))
  const queued = JSON.parse((await f.invoke('presentation_generate_templates', { templates: [1, 2, 3].map(page => ({ page, prompt: `Page ${page}`, output_path: `page-${page}.png`, asset_id: `page-${page}` })), concurrency: 3 })).value)
  expect(queued).toMatchObject({ taskId: expect.any(String), concurrency: 3, pages: [1, 2, 3].map(page => ({ page, status: 'queued', assetId: `page-${page}` })) })
  await f.waitPage(3, 'complete'); await f.waitPage(2, 'failed')
  expect((await f.state()).pageJobs[1].status).toBe('generating')
  const partial = await loadProject(f.root, 'deck')
  expect(partial.deck.pages).toHaveLength(3)
  expect(partial.pages.get('pages/01.page')!.elements).toEqual([])
  expect(partial.pages.get('pages/03.page')!.elements[0].src).toContain('page-3-')
  expect(f.canonical.get('ppt_check').mock.calls.map((call: any) => call[0].pages)).toEqual([[3]])
  slow.resolve(); await f.waitPage(1, 'complete')
  fail = false
  await f.invoke('presentation_resume_pages', { pages: [2] }); await f.waitPage(2, 'complete')
  expect(f.canonical.get('generate_image').mock.calls.map((call: any) => call[0].prompt).sort()).toEqual(['Page 1', 'Page 2', 'Page 2', 'Page 3'])
  expect(f.canonical.get('ppt_check').mock.calls.map((call: any) => call[0].pages)).toEqual([[3], [1], [2]])
  expect((await loadProject(f.root, 'deck')).manifest.revision).toBe(3)
})

it('inherits global style independently per field, routes references through edit, and never embeds style-only originals', { timeout: 30000 }, async () => {
  const f = await fixture(3), bytes = await sharp({ create: { width: 16, height: 9, channels: 4, background: 'white' } }).png().toBuffer()
  await writeFile(join(f.root, 'style.png'), bytes)
  await f.invoke('presentation_record_asset', { manifest_path: 'assets.json', image_path: 'style.png', asset_id: 'style', role: 'style-reference', source_kind: 'user', slide_numbers: [1, 2, 3] })
  f.spec.stylePrompt = 'Global ink style'; f.spec.styleReferenceAssetIds = ['style']
  Object.assign(f.spec.slides[1], { stylePrompt: '', styleReferenceAssetIds: [] })
  Object.assign(f.spec.slides[2], { stylePrompt: 'Page three style' })
  await writeFile(join(f.root, 'spec.json'), JSON.stringify(f.spec))
  expect(pageStyle(f.spec, 2)).toEqual({ stylePrompt: '', styleReferenceAssetIds: [] })
  await f.invoke('presentation_generate_templates', { templates: [1, 2, 3].map(page => ({ page, prompt: `Original ${page}`, output_path: `page-${page}.png`, asset_id: `page-${page}` })) })
  await Promise.all([1, 2, 3].map(page => f.waitPage(page, 'complete')))
  const calls = f.canonical.get('edit_image').mock.calls.map((call: any) => call[0])
  expect(calls.map((call: any) => call.prompt).sort()).toEqual(['Original 1\n\n[Style reference]\nGlobal ink style', 'Original 3\n\n[Style reference]\nPage three style'].sort())
  expect(calls.every((call: any) => call.input_paths[0] === join(f.root, 'style.png'))).toBe(true)
  expect(calls.every((call: any) => !('quality' in call) && !('model' in call))).toBe(true)
  const state = await f.state()
  expect(state.pageJobs[1].asset).toMatchObject({ originalPrompt: 'Original 1', stylePrompt: 'Global ink style', referenceImageHashes: [hash(bytes)], requestedQuality: 'max' })
  const deck = await loadProject(f.root, 'deck')
  for (const page of deck.pages.values()) expect(page.elements).toHaveLength(1)
  const oldOne = await readFile(join(deck.dir, 'pages/01.page')), oldThree = await readFile(join(deck.dir, 'pages/03.page'))
  await f.invoke('presentation_repair_templates', { repairs: [{ asset_id: 'page-2', expected_sha256: state.pageJobs[2].asset.sha256, prompt: 'Modify only page two', output_path: 'modified-2.png', new_asset_id: 'modified-2' }] })
  await f.waitPage(2, 'complete')
  expect(await readFile(join(deck.dir, 'pages/01.page'))).toEqual(oldOne); expect(await readFile(join(deck.dir, 'pages/03.page'))).toEqual(oldThree)
  expect(f.canonical.get('ppt_check').mock.calls.at(-1)[0].pages).toEqual([2])
  Object.assign(f.spec.slides[0], { stylePrompt: 'New selected style', styleReferenceAssetIds: [] })
  await writeFile(join(f.root, 'spec.json'), JSON.stringify(f.spec))
  await f.invoke('presentation_repair_templates', { repairs: [{ asset_id: 'page-1', expected_sha256: state.pageJobs[1].asset.sha256, prompt: 'Modify page one', output_path: 'modified-1.png', new_asset_id: 'modified-1' }] })
  await f.waitPage(1, 'complete')
  expect(f.canonical.get('edit_image').mock.calls.at(-1)[0]).toMatchObject({ input_paths: [state.pageJobs[1].asset.path], prompt: 'Modify page one\n\n[Style reference]\nNew selected style' })
})

it('bounds page generation at ten and exposes restart interruption without automatically charging again', { timeout: 30000 }, async () => {
  expect(imageConcurrency(undefined)).toBe(10)
  expect(() => imageConcurrency(11)).toThrow('1 to 10')
  const f = await fixture(12), release = Promise.withResolvers<void>(); let active = 0, maximum = 0
  f.canonical.set('generate_image', async (args: any) => { active++; maximum = Math.max(maximum, active); await release.promise; try { return await f.generate(args) } finally { active-- } })
  await f.invoke('presentation_generate_templates', { templates: Array.from({ length: 12 }, (_, index) => ({ page: index + 1, prompt: `Page ${index + 1}`, output_path: `page-${index + 1}.png`, asset_id: `page-${index + 1}` })) })
  await vi.waitFor(() => expect(active).toBe(10), { timeout: 10000 })
  release.resolve(); await Promise.all(Array.from({ length: 12 }, (_, index) => f.waitPage(index + 1, 'complete')))
  expect(maximum).toBe(10)
  const journal = f.events.at(-1).data.journal, saved = await f.state()
  saved.pageJobs[2].runId = 'previous-host'; saved.pageJobs[2].status = 'rendering'
  await writeFile(journal, JSON.stringify(saved))
  const before = f.generate.mock.calls.length
  const status = JSON.parse((await f.invoke('presentation_status', {})).value)
  expect(status.state.pageJobs[2].status).toBe('interrupted')
  expect(f.generate).toHaveBeenCalledTimes(before)
  await f.invoke('presentation_resume_pages', { pages: [2] }); await f.waitPage(2, 'complete')
  expect(f.generate).toHaveBeenCalledTimes(before)
})

it('blocks formal generation until the prompt plan is confirmed and rejects stale confirmations', { timeout: 30000 }, async () => {
  const f = await fixture(1)
  await f.invoke('presentation_write_prompt_document', { spec_path: 'spec.json', output_path: 'presentation-prompts.md', markdown: '# Confirmed prompts\n\nPage 1: exact text.' , style_id: 'style-a' })
  await expect(f.invoke('presentation_generate_templates', { templates: [{ page: 1, prompt: 'Page 1', output_path: 'page-1.png', asset_id: 'page-1' }] })).rejects.toThrow('PRESENTATION_PLAN_CONFIRMATION_REQUIRED')
  await f.invoke('presentation_confirm_plan', { prompt_document_path: 'presentation-prompts.md', style_id: 'style-a' })
  await f.invoke('presentation_generate_templates', { templates: [{ page: 1, prompt: 'Page 1', output_path: 'page-1.png', asset_id: 'page-1' }] })
  await f.waitPage(1, 'complete')
  await writeFile(join(f.root, 'presentation-prompts.md'), '# Changed prompts')
  await expect(f.invoke('presentation_generate_templates', { templates: [{ page: 1, prompt: 'Page 1 revised', output_path: 'page-1-revised.png', asset_id: 'page-1-revised' }] })).rejects.toThrow('PRESENTATION_PLAN_CONFIRMATION_STALE')
})

async function waitFastExport(f: Awaited<ReturnType<typeof fixture>>) {
  await vi.waitFor(async () => { const state = await f.state(); expect(state.fastExportRunId).toBeUndefined(); expect(state.exportReceipt ?? state.failure).toBeDefined() }, { timeout: 15000 })
  return f.state()
}
it('exports a real provisional PPTX before a slow page finishes, then a complete deck without per-page QA', { timeout: 30000 }, async () => {
  const f = await fixture(2), release = Promise.withResolvers<void>()
  f.canonical.set('generate_image', async (args: any) => { if (args.prompt === 'Slow page') await release.promise; return f.generate(args) })
  await f.invoke('presentation_generate_fast', { templates: [{ page: 1, prompt: 'Fast page', output_path: 'fast.png', asset_id: 'fast' }, { page: 2, prompt: 'Slow page', output_path: 'slow.png', asset_id: 'slow' }] })
  try {
    await vi.waitFor(async () => expect((await f.state()).exportReceipt).toMatchObject({ stage: 'partial', completedPages: [1], pendingPages: [2], failedPages: [] }), { timeout: 15000 })
    const partial = unzipSync(await readFile(join(f.root, 'deck/presentation.pptx')))
    expect(Object.keys(partial).some(name => /^ppt\/slides\/slide1\.xml$/.test(name))).toBe(true)
    expect((await f.state()).pageJobs[2].status).toBe('generating')
  } finally { release.resolve() }
  const state = await waitFastExport(f)
  expect(state.exportReceipt).toMatchObject({ stage: 'final', completedPages: [1, 2], pendingPages: [], failedPages: [] })
  const bytes = await readFile(join(f.root, 'deck/presentation.pptx')), zip = unzipSync(bytes)
  expect(Object.keys(zip).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))).toHaveLength(2)
  expect(state.exportReceipt.sha256).toBe(hash(bytes))
  expect(f.canonical.get('ppt_check')).not.toHaveBeenCalled()
  expect(f.canonical.get('ppt_render')).not.toHaveBeenCalled()
})
it('marks failed fast batches as partial, resumes only failed pages, and reports all-failed batches', { timeout: 30000 }, async () => {
  const f = await fixture(2); let failing = true
  f.canonical.set('generate_image', async (args: any) => { if (args.prompt === 'Page 2' && failing) throw new Error('provider failure'); return f.generate(args) })
  await f.invoke('presentation_generate_fast', { templates: [1, 2].map(page => ({ page, prompt: 'Page ' + page, output_path: 'page-' + page + '.png', asset_id: 'page-' + page })) })
  let state = await waitFastExport(f)
  expect(state.exportReceipt).toMatchObject({ stage: 'partial', completedPages: [1], pendingPages: [], failedPages: [2] })
  failing = false
  await f.invoke('presentation_resume_pages', { pages: [2] })
  state = await waitFastExport(f)
  expect(state.exportReceipt).toMatchObject({ stage: 'final', completedPages: [1, 2], failedPages: [] })
  expect(f.generate.mock.calls.filter(call => call[0].prompt === 'Page 1')).toHaveLength(1)
  const all = await fixture(1)
  all.canonical.set('generate_image', async () => { throw new Error('provider offline') })
  await all.invoke('presentation_generate_fast', { templates: [{ page: 1, prompt: 'Fails', output_path: 'fail.png', asset_id: 'fail' }] })
  const failed = await waitFastExport(all)
  expect(failed.exportReceipt).toBeUndefined()
  expect(failed.failure).toMatchObject({ stage: 'ppt_export', message: expect.stringContaining('PRESENTATION_NO_COMPLETED_PAGES') })
})
it('preserves existing PPTX files and a valid draft when the final exporter fails', { timeout: 30000 }, async () => {
  const f = await fixture(1)
  await writeFile(join(f.root, 'existing.pptx'), 'user deck')
  await expect(f.invoke('presentation_generate_fast', { output_path: 'existing.pptx', templates: [{ page: 1, prompt: 'Page', output_path: 'p.png', asset_id: 'p' }] })).rejects.toThrow('PRESENTATION_OUTPUT_EXISTS')
  expect(f.generate).not.toHaveBeenCalled()
  expect(await readFile(join(f.root, 'existing.pptx'), 'utf8')).toBe('user deck')
  const release = Promise.withResolvers<void>()
  const g = await fixture(2), exporter = g.canonical.get('ppt_export'); let calls = 0
  g.canonical.set('generate_image', async (args: any) => { if (args.prompt === 'Slow') await release.promise; return g.generate(args) })
  g.canonical.set('ppt_export', async (args: any) => { if (++calls > 1) throw new Error('serializer failure'); return exporter(args) })
  await g.invoke('presentation_generate_fast', { templates: [{ page: 1, prompt: 'Fast', output_path: 'a.png', asset_id: 'a' }, { page: 2, prompt: 'Slow', output_path: 'b.png', asset_id: 'b' }] })
  let draft: Buffer
  try {
    await vi.waitFor(async () => expect((await g.state()).exportReceipt?.stage).toBe('partial'), { timeout: 15000 })
    draft = await readFile(join(g.root, 'deck/presentation.pptx'))
  } finally { release.resolve() }
  const state = await waitFastExport(g)
  expect(state.failure?.message).toContain('serializer failure')
  expect(await readFile(join(g.root, 'deck/presentation.pptx'))).toEqual(draft!)
})
it('compiles research-backed prompts, uses the confirmed bytes and embeds source evidence in PPTX notes', { timeout: 30000 }, async () => {
  const f = await fixture(1)
  Object.assign(f.spec, { audience: '研究生', originalPrompt: '解释给定的机制与边界', stylePrompt: '浅色学术风格' })
  Object.assign(f.spec.slides[0], { purpose: '解释因果与相关性的区别', analysisPrompt: '先展示已知证据，再标注待验证连接', layout: { left: [24, 90, 420, 360], right: [470, 90, 460, 360] }, visualBrief: '左侧流程主图，右侧提供结论限定', immutableFacts: ['不编造任何样本量'], editablePlanPrompt: '标题和标签可编辑，事实图保持原字节', confidence: 0.9 })
  await writeFile(join(f.root, 'spec.json'), JSON.stringify(f.spec))
  await f.invoke('presentation_write_source_manifest', { spec_path: 'spec.json', output_path: 'sources.json', topic: 'Fixture topic', queries: ['mechanism evidence'], sources: [{ id: 'source-1', title: 'Fixture guideline', citation: 'Fixture source for integration test', sourceType: 'guideline', verification: 'abstract-checked', claims: [{ text: 'Exploratory association requires validation', slideNumbers: [1], evidenceNote: 'Checked abstract text only' }] }] })
  await f.invoke('presentation_write_prompt_document', { spec_path: 'spec.json', output_path: 'prompts.md', style_id: 'style-a' })
  const spec = JSON.parse(await readFile(join(f.root, 'spec.json'), 'utf8'))
  const markdown = await readFile(join(f.root, 'prompts.md'), 'utf8')
  expect(markdown).toContain(spec.slides[0].combinedPrompt)
  expect(markdown).toContain('abstract-checked')
  expect(spec.slides[0].combinedPrompt).toContain('Exploratory association requires validation')
  await f.invoke('presentation_confirm_plan', { prompt_document_path: 'prompts.md' })
  await expect(f.invoke('presentation_generate_fast', { templates: [{ page: 1, prompt: 'Unconfirmed rewrite', output_path: 'bad.png', asset_id: 'bad' }] })).rejects.toThrow('PRESENTATION_PROMPT_MISMATCH')
  await f.invoke('presentation_generate_fast', { templates: [{ page: 1, output_path: 'page.png', asset_id: 'page' }] })
  await waitFastExport(f)
  expect(f.generate.mock.calls[0]![0].prompt).toBe(spec.slides[0].combinedPrompt)
  const deck = unzipSync(await readFile(join(f.root, 'deck/presentation.pptx')))
  const notes = Object.entries(deck).filter(([name]) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)).map(([, bytes]) => strFromU8(bytes)).join('')
  expect(notes).toContain('Fixture source for integration test')
  expect(notes).toContain('abstract-checked')
  await writeFile(join(f.root, 'sources.json'), JSON.stringify({ schemaVersion: 1, changed: true }))
  await expect(f.invoke('presentation_generate_fast', { templates: [{ page: 1, output_path: 'revised.png', asset_id: 'revised' }] })).rejects.toThrow('research source manifest')
})
