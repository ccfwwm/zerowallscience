import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import { afterEach, expect, it, vi } from 'vitest'
import { createProject, editProject, loadProject } from '../../dsh-ppt-maker/src/core/project/store.js'
import { installPresentationWorkflow } from '../src/host/presentation-workflow.js'
import { hash, pageStyle } from '../src/host/visual-assets.js'
import { imageConcurrency } from '../src/host/image-concurrency.js'

const roots: string[] = [], disposers: (() => void)[] = []
afterEach(async () => { disposers.splice(0).forEach(dispose => dispose()); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function fixture(count: number) {
  const root = await mkdtemp(join(tmpdir(), 'page-jobs-')); roots.push(root)
  const spec: any = { width: 960, height: 540, fonts: {}, palette: {}, slides: Array.from({ length: count }, (_, index) => ({ text: [`Page ${index + 1}`], assetIds: [] })) }
  await writeFile(join(root, 'spec.json'), JSON.stringify(spec)); await writeFile(join(root, 'assets.json'), '{"schemaVersion":2,"assets":[]}')
  await createProject(root, { dir: 'deck' })
  const events: any[] = [], definitions = new Map<string, any>(), canonical = new Map<string, any>()
  let observer: any
  const agent = { session: { header: { cwd: root }, snapshotEvents: () => events, append: (type: string, data: any) => events.push({ type, data }) } }
  const ctx = { effect: (factory: () => () => void) => disposers.push(factory()), on: (_: string, fn: any) => { observer = fn }, tools: {
    register: (definition: any) => definitions.set(definition.name, definition), execute: (input: any) => invoke(input.name, input.arguments, input.callId)
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
  installPresentationWorkflow(ctx as any)
  await invoke('presentation_prepare', { spec_path: 'spec.json', manifest_path: 'assets.json', dir: 'deck', mode: 'new' })
  const state = async () => JSON.parse(await readFile(events.at(-1).data.journal, 'utf8'))
  async function waitPage(page: number, status: string) { await vi.waitFor(async () => { const job = (await state()).pageJobs[page]; expect({ status: job.status, error: job.error }).toEqual({ status, error: status === 'failed' ? job.error : undefined }) }, { timeout: 10000 }) }
  return { root, invoke, canonical, state, waitPage, spec, generate, events }
}

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
