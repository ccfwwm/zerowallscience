import { randomUUID } from 'node:crypto'
import { cp, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import { afterEach, expect, it, vi } from 'vitest'
import { installPresentationWorkflow } from '../src/host/presentation-workflow.js'
import { hash } from '../src/host/visual-assets.js'
import { createProject, editProject, loadProject } from '../../dsh-ppt-maker/src/core/project/store.js'
import { assertTemplateExportReady } from '../../dsh-ppt-maker/src/core/template-review.js'
import { registerExportTool } from '../../dsh-ppt-maker/src/tools/export.js'
import type { ToolDef } from '../../dsh-ppt-maker/src/tools/shared.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
const observations = 'Viewed the actual full resolution PNG, transcribed all visible labels and checked layout, sources and content against the specification.'

async function fixture(mode: 'image' | 'editable' = 'image', fact = false) {
  const root = await mkdtemp(join(tmpdir(), 'template-gate-')); roots.push(root)
  const spec = { width: 960, height: 540, fonts: {}, palette: {}, slides: [{ text: ['Verified heading', 'Exact data 42'], assetIds: fact ? ['fact'] : [] as string[], ...(fact ? { assetPlacements: [{ assetId: 'fact', bounds: [20, 100, 200, 140] }] } : {}) }] }
  await writeFile(join(root, 'spec.json'), JSON.stringify(spec))
  await createProject(root, { dir: 'deck' })
  const events: any[] = [], definitions = new Map<string, any>(), canonical = new Map<string, any>()
  let observer: any
  const agent = { session: { header: { cwd: root }, snapshotEvents: () => events, append: (type: string, data: any) => events.push({ type, data: structuredClone(data) }) } }
  const ctx = { effect: () => {}, on: (_: string, fn: any) => { observer = fn }, tools: { register: (def: any) => definitions.set(def.name, def), execute: (input: any) => invoke(input.name, input.arguments, input.callId) } }
  async function invoke(name: string, args: any, callId = randomUUID()): Promise<any> {
    const exec = { name, arguments: args, agent, callId }
    if (definitions.has(name)) {
      const result = { isError: false, value: await definitions.get(name).execute(args, exec) }
      if (name === 'presentation_repair_templates') {
        const queued = JSON.parse(result.value)
        let jobs: any[] = []
        await vi.waitFor(async () => {
          const journal = JSON.parse(await readFile(events.at(-1).data.journal, 'utf8'))
          jobs = Object.values(journal.pageJobs ?? {}).filter((job: any) => job.taskId === queued.taskId)
          expect(jobs.length).toBe(args.repairs.length)
          expect(jobs.every(job => ['complete', 'failed', 'awaiting-editable'].includes(job.status))).toBe(true)
        }, { timeout: 10000 })
        const failed = jobs.find(job => job.status === 'failed')
        if (failed) throw new Error(failed.error)
      }
      return result
    }
    return observer(exec, async () => ({ isError: false, value: await canonical.get(name)(args) }))
  }
  canonical.set('ppt_edit', vi.fn(async args => ({ ok: true, ...await editProject(root, { dir: args.dir, ops: args.ops, baseRevision: args.baseRevision, newVersion: args.newVersion }) })))
  canonical.set('edit_image', vi.fn(async args => {
    const path = resolve(root, args.output_path), bytes = await sharp({ create: { width: 16, height: 9, channels: 4, background: 'green' } }).png().toBuffer()
    await writeFile(path, bytes)
    await writeFile(path + '.generation.json', JSON.stringify({ sha256: hash(bytes), prompt: args.prompt, model: 'selected-model', requestedQuality: 'medium', requestedSize: 'auto', inputImageHashes: await Promise.all(args.input_paths.map(async (path: string) => hash(await readFile(path)))) }))
    return { path }
  }))
  canonical.set('ppt_check', async () => ({ ok: true, pass: true, issues: [] }))
  canonical.set('ppt_render', async (args: any) => {
    const path = join(root, 'render.png'); await writeFile(path, 'rendered')
    return { ok: true, images: (args.pages ?? [1]).map((page: number) => ({ page, path })) }
  })
  installPresentationWorkflow(ctx as any)
  await invoke('presentation_prepare', { spec_path: 'spec.json', manifest_path: 'assets.json', dir: 'deck', mode: 'new', output_mode: mode })
  const bytes = await sharp({ create: { width: 16, height: 9, channels: 4, background: 'white' } }).png().toBuffer()
  await writeFile(join(root, 'template.png'), bytes)
  await writeFile(join(root, 'template.png.generation.json'), JSON.stringify({ sha256: hash(bytes), prompt: 'ORIGINAL PROMPT\n原样', promptHash: hash('ORIGINAL PROMPT\n原样'), model: 'selected-model', requestedQuality: 'medium', requestedSize: 'auto', inputImageHashes: [] }))
  await invoke('presentation_record_asset', { manifest_path: 'assets.json', image_path: 'template.png', asset_id: 'initial', role: mode === 'image' ? 'slide-image' : 'template', source_kind: 'generated', slide_number: 1 })
  if (fact) { await writeFile(join(root, 'fact.png'), bytes); await invoke('presentation_record_asset', { manifest_path: 'assets.json', image_path: 'fact.png', asset_id: 'fact', role: 'data-figure', source_kind: 'user', slide_number: 1 }) }
  const review = (asset_id = 'initial', expected_sha256 = hash(bytes), patch: any = {}) => invoke('presentation_review_templates', { reviews: [{ asset_id, expected_sha256, status: 'passed', text_integrity: 'pass', layout: 'pass', content_accuracy: 'pass', observations, issues: [], text_transcription: spec.slides[0]!.text, ...patch }] })
  const gate = async () => {
    const loaded = await loadProject(root, 'deck')
    return assertTemplateExportReady({ workspaceRoot: root, dir: loaded.dir, deck: loaded.deck, pages: loaded.deck.pages.map(path => loaded.pages.get(path)!), metadata: loaded.manifest.metadata, loadMedia: src => readFile(join(loaded.dir, src)) })
  }
  return { root, spec, invoke, canonical, review, gate, bytes, manifest: async () => JSON.parse(await readFile(join(root, 'assets.json'), 'utf8')) }
}

it.each(['image', 'editable'] as const)('allows unreviewed %s construction and keeps actual review diagnostics', async mode => {
  const { invoke, review, gate, root, spec } = await fixture(mode)
  const plan = { plans: [{ page: 1, elements: [{ elementId: 'native-title', elementType: 'text', bounds: [10, 10, 800, 60], content: { text: 'Verified heading' } }] }] }
  await expect(invoke(mode === 'image' ? 'presentation_build_pages' : 'presentation_plan_editable_pages', mode === 'image' ? {} : plan)).resolves.toHaveProperty('value')
  await review()
  if (mode === 'editable') await invoke('presentation_plan_editable_pages', plan)
  await invoke('presentation_build_pages', {})
  await expect(gate()).resolves.toBeUndefined()
  const receipt = JSON.parse(await readFile(join(root, 'deck/presentation-provenance.json'), 'utf8')).templateReviews[0]
  expect(receipt.review).toMatchObject({ textTranscription: ['Verified heading', 'Exact data 42'], status: 'passed' })
  expect(JSON.parse(await readFile(join(root, 'deck/presentation-provenance.json'), 'utf8'))).toMatchObject({ workspaceRoot: await realpath(root), specificationFingerprint: hash(JSON.stringify(spec)) })
})

it('checks exact transcribed text, requires image repair for failed bytes and reviews the new SHA before build', async () => {
  const { invoke, review, manifest, canonical, gate } = await fixture()
  await expect(review('initial', undefined, { text_transcription: ['wrong'] })).rejects.toThrow('differs')
  await review('initial', undefined, { status: 'repair-required', text_integrity: 'fail', issues: ['Garbled heading'], text_transcription: ['Garbled'] })
  await expect(review()).rejects.toThrow('failed image must be repaired')
  const original = (await manifest()).assets[0]
  await invoke('presentation_repair_templates', { repairs: [{ asset_id: 'initial', expected_sha256: original.sha256, prompt: 'Repair garbled heading only. Keep layout unchanged.', output_path: 'repaired.png', new_asset_id: 'fixed' }], concurrency: 3 })
  expect(canonical.get('edit_image')).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'Repair garbled heading only. Keep layout unchanged.', input_paths: [original.path], concurrency: 3 }))
  expect(canonical.get('edit_image').mock.calls[0][0]).not.toHaveProperty('quality')
  const repaired = (await manifest()).assets.find((asset: any) => asset.assetId === 'fixed')
  expect(repaired).toMatchObject({ parentAssetId: 'initial', inputImageHashes: [original.sha256], prompt: 'Repair garbled heading only. Keep layout unchanged.' })
  expect((await manifest()).assets[0].prompt).toBe('ORIGINAL PROMPT\n原样')
  await expect(invoke('presentation_build_pages', {})).resolves.toHaveProperty('value')
  await review('fixed', repaired.sha256)
  await invoke('presentation_build_pages', {})
  await expect(gate()).resolves.toBeUndefined()
})

it('invalidates review after specification/image change', async () => {
  const { invoke, review, root, spec, manifest, gate } = await fixture()
  await review()
  spec.slides[0]!.text[0] = 'Changed exact text'; await writeFile(join(root, 'spec.json'), JSON.stringify(spec))
  await invoke('presentation_build_pages', {}); await expect(gate()).rejects.toHaveProperty('code')
  await review()
  await writeFile(join(root, 'template.png'), Buffer.from('tampered'))
  await expect(invoke('presentation_build_pages', {})).rejects.toThrow('checksum changed')
  expect((await manifest()).templateReviews.initial.sha256).not.toBe(hash('tampered'))
})

it.each(['provider-failure', 'wrong-parent'] as const)('preserves the failed gate when repair has %s', async failure => {
  const { invoke, review, canonical, manifest, root } = await fixture()
  await review('initial', undefined, { status: 'repair-required', layout: 'fail', issues: ['Overlapping title'] })
  const original = (await manifest()).assets[0]
  const originalEdit = canonical.get('edit_image')
  canonical.set('edit_image', async (args: any) => {
    if (failure === 'provider-failure') throw new Error('provider failed')
    const value = await originalEdit(args)
    const receiptPath = value.path + '.generation.json', receipt = JSON.parse(await readFile(receiptPath, 'utf8'))
    receipt.inputImageHashes = ['0'.repeat(64)]; await writeFile(receiptPath, JSON.stringify(receipt)); return value
  })
  await expect(invoke('presentation_repair_templates', { repairs: [{ asset_id: 'initial', expected_sha256: original.sha256, prompt: 'Fix overlap', output_path: 'failed-repair.png', new_asset_id: 'not-approved' }] })).rejects.toThrow(failure === 'provider-failure' ? 'provider failed' : 'bind the referenced original')
  expect((await manifest()).templateReviews.initial.status).toBe('repair-required')
  expect((await manifest()).assets).toHaveLength(1)
  await expect(invoke('presentation_build_pages', {})).resolves.toHaveProperty('value')
  expect(await readFile(join(root, 'template.png'))).toBeDefined()
})

it('requires fresh review when the same registered image ID is replaced', async () => {
  const { invoke, review, root, manifest } = await fixture()
  await review()
  const bytes = await sharp({ create: { width: 16, height: 9, channels: 4, background: 'blue' } }).png().toBuffer()
  await writeFile(join(root, 'replacement.png'), bytes)
  await writeFile(join(root, 'replacement.png.generation.json'), JSON.stringify({ sha256: hash(bytes), prompt: 'Replacement exact prompt', inputImageHashes: [] }))
  await invoke('presentation_record_asset', { manifest_path: 'assets.json', image_path: 'replacement.png', asset_id: 'initial', role: 'slide-image', source_kind: 'generated', slide_number: 1 })
  expect((await manifest()).templateReviews.initial).toBeUndefined()
  await expect(invoke('presentation_build_pages', {})).resolves.toHaveProperty('value')
})

it('embeds original fact-image bytes at explicit bounds and blocks missing placements', async () => {
  const { invoke, review, root, spec, gate, bytes } = await fixture('image', true)
  await review(); await invoke('presentation_build_pages', {})
  const project = await loadProject(root, 'deck'), element = project.pages.get(project.deck.pages[0]!)!.elements.find(element => element.elementId === 'fact-fact')!
  expect(element.bounds).toEqual([20, 100, 200, 140])
  expect(await readFile(join(project.dir, String(element.src)))).toEqual(bytes)
  await expect(gate()).resolves.toBeUndefined()
  delete (spec.slides[0] as any).assetPlacements; await writeFile(join(root, 'spec.json'), JSON.stringify(spec)); await review()
  await expect(invoke('presentation_build_pages', {})).rejects.toThrow('explicit in-bounds assetPlacements')
})

it('merges template evidence across partial page builds and exposes actionable missing reviews', async () => {
  const { invoke, root, spec, review, bytes, gate } = await fixture()
  spec.slides.push({ text: [...spec.slides[0]!.text], assetIds: [] }); await writeFile(join(root, 'spec.json'), JSON.stringify(spec))
  await invoke('presentation_record_asset', { manifest_path: 'assets.json', image_path: 'template.png', asset_id: 'second', role: 'slide-image', source_kind: 'generated', slide_number: 2 })
  expect(JSON.parse((await invoke('presentation_status', {})).value).templateRequirements).toEqual(expect.arrayContaining([expect.objectContaining({ page: 2, assetId: 'second', imagePath: join(root, 'template.png'), status: 'unreviewed' })]))
  await review(); await review('second', hash(bytes))
  await invoke('presentation_build_pages', { pages: [1] })
  await invoke('presentation_build_pages', { pages: [2] })
  const receipt = JSON.parse(await readFile(join(root, 'deck/presentation-provenance.json'), 'utf8'))
  expect(receipt.templateReviews.map((entry: any) => entry.page)).toEqual([1, 2])
  await expect(gate()).resolves.toBeUndefined()
})

it('removes a previous workbench export pass when the same built image fails reinspection', async () => {
  const { invoke, review, gate } = await fixture()
  await review(); await invoke('presentation_build_pages', {}); await expect(gate()).resolves.toBeUndefined()
  await review('initial', undefined, { status: 'repair-required', layout: 'fail', issues: ['New inspection found overlapping text'] })
  await expect(gate()).rejects.toMatchObject({ code: 'TemplateReviewRequired' })
})

it.each(['new-id', 'metadata', 'legacy-manifest'] as const)('keeps failed SHA evidence through %s registration and allows a genuine edit repair', async change => {
  const { invoke, review, root, manifest, bytes, gate } = await fixture()
  await review('initial', undefined, { status: 'repair-required', layout: 'fail', issues: ['Overlapping title'] })
  if (change === 'legacy-manifest') {
    const legacy = await manifest(); delete legacy.templateFailures
    await writeFile(join(root, 'assets.json'), JSON.stringify(legacy))
  }
  const assetId = change === 'new-id' ? 'alias' : 'initial'
  await invoke('presentation_record_asset', { manifest_path: 'assets.json', image_path: 'template.png', asset_id: assetId, role: 'slide-image', source_kind: 'generated', slide_number: 1, slide_numbers: [1] })
  await expect(review(assetId)).rejects.toThrow('same failed bytes cannot be marked passed')
  expect(Object.values((await manifest()).templateFailures)).toEqual(expect.arrayContaining([expect.objectContaining({ sha256: hash(bytes), status: 'repair-required', page: 1 })]))
  expect(JSON.parse((await invoke('presentation_status', {})).value).templateRequirements).toEqual(expect.arrayContaining([expect.objectContaining({ assetId, status: 'repair-required', issues: ['Overlapping title'] })]))
  await invoke('presentation_repair_templates', { repairs: [{ asset_id: assetId, expected_sha256: hash(bytes), prompt: 'Fix overlapping title only.', output_path: 'fixed-alias.png', new_asset_id: 'fixed-alias' }] })
  const repaired = (await manifest()).assets.find((asset: any) => asset.assetId === 'fixed-alias')
  await review('fixed-alias', repaired.sha256); await invoke('presentation_build_pages', {})
  await expect(gate()).resolves.toBeUndefined()
})

it('revokes old passed project evidence for any alias of failed bytes, including direct ppt_export with skipCheck', async () => {
  const { invoke, review, root, gate } = await fixture()
  await review(); await invoke('presentation_build_pages', {}); await expect(gate()).resolves.toBeUndefined()
  await invoke('presentation_record_asset', { manifest_path: 'assets.json', image_path: 'template.png', asset_id: 'new-alias', role: 'slide-image', source_kind: 'generated', slide_number: 1 })
  await review('new-alias', undefined, { status: 'repair-required', content_accuracy: 'fail', issues: ['New inspection found a wrong fact'] })
  await expect(review('initial')).rejects.toThrow('same failed bytes cannot be marked passed')
  await expect(gate()).rejects.toMatchObject({ code: 'TemplateReviewRequired' })
  let tool!: ToolDef
  registerExportTool({ tools: { register: def => { tool = def } }, sessions: { get: () => ({ header: { cwd: root } }) } })
  expect(await tool.execute({ dir: 'deck', out: 'blocked.pptx', skipCheck: true }, { agent: { session: { id: 'test' } } }))
    .toMatchObject({ ok: true, warnings: expect.arrayContaining([expect.any(String)]) })
  expect((await readFile(join(root, 'blocked.pptx'))).length).toBeGreaterThan(1000)
})

it('rejects an unrelated regenerated image as a substitute for repairing a failed page', async () => {
  const { invoke, review, root, manifest } = await fixture()
  await review('initial', undefined, { status: 'repair-required', layout: 'fail', issues: ['Broken layout'] })
  const bytes = await sharp({ create: { width: 16, height: 9, channels: 4, background: 'blue' } }).png().toBuffer()
  await writeFile(join(root, 'unrelated.png'), bytes)
  await writeFile(join(root, 'unrelated.png.generation.json'), JSON.stringify({ sha256: hash(bytes), prompt: 'Generate unrelated new page', inputImageHashes: [] }))
  await invoke('presentation_record_asset', { manifest_path: 'assets.json', image_path: 'unrelated.png', asset_id: 'unrelated', role: 'slide-image', source_kind: 'generated', slide_number: 1 })
  await expect(review('unrelated', hash(bytes))).rejects.toThrow('unrelated generation cannot replace repair')
  expect((await manifest()).templateReviews.unrelated).toBeUndefined()
})

it('rejects unchanged repair bytes and accepts a newly reviewed edit after multiple repair rounds', async () => {
  const { invoke, review, root, manifest, canonical, bytes, gate } = await fixture()
  await review('initial', undefined, { status: 'repair-required', layout: 'fail', issues: ['Broken layout'] })
  const edit = canonical.get('edit_image')
  canonical.set('edit_image', async (args: any) => {
    const output = resolve(root, args.output_path)
    await writeFile(output, bytes)
    await writeFile(output + '.generation.json', JSON.stringify({ sha256: hash(bytes), prompt: args.prompt, inputImageHashes: [hash(bytes)] }))
    return { path: output }
  })
  await expect(invoke('presentation_repair_templates', { repairs: [{ asset_id: 'initial', expected_sha256: hash(bytes), prompt: 'Fix layout', output_path: 'unchanged.png', new_asset_id: 'unchanged' }] })).rejects.toThrow('changed image bytes')
  expect((await manifest()).assets).toHaveLength(1)
  canonical.set('edit_image', edit)
  await invoke('presentation_repair_templates', { repairs: [{ asset_id: 'initial', expected_sha256: hash(bytes), prompt: 'Fix layout', output_path: 'first-edit.png', new_asset_id: 'first-edit' }] })
  const first = (await manifest()).assets.find((asset: any) => asset.assetId === 'first-edit')
  await review('first-edit', first.sha256, { status: 'repair-required', text_integrity: 'fail', issues: ['Heading still wrong'], text_transcription: ['wrong'] })
  canonical.set('edit_image', async (args: any) => {
    const value = await edit(args), fixed = await sharp({ create: { width: 16, height: 9, channels: 4, background: 'blue' } }).png().toBuffer()
    await writeFile(value.path, fixed)
    const receiptPath = value.path + '.generation.json', receipt = JSON.parse(await readFile(receiptPath, 'utf8'))
    await writeFile(receiptPath, JSON.stringify({ ...receipt, sha256: hash(fixed) })); return value
  })
  await invoke('presentation_repair_templates', { repairs: [{ asset_id: 'first-edit', expected_sha256: first.sha256, prompt: 'Fix heading exactly', output_path: 'second-edit.png', new_asset_id: 'second-edit' }] })
  const second = (await manifest()).assets.find((asset: any) => asset.assetId === 'second-edit')
  await review('second-edit', second.sha256); await invoke('presentation_build_pages', {})
  await expect(gate()).resolves.toBeUndefined()
})

it.each([['image', 'literature'], ['editable', 'user']] as const)('requires original factual references through nested style links for %s mode and %s sources', async (mode, sourceKind) => {
  const { invoke, review, root, spec, bytes, gate } = await fixture(mode)
  await writeFile(join(root, 'fact.png'), bytes)
  await invoke('presentation_record_asset', { manifest_path: 'assets.json', image_path: 'fact.png', asset_id: 'fact', role: 'data-figure', source_kind: sourceKind, ...(sourceKind === 'literature' ? { source_path: 'fact.png', source_page: 1, citation: 'Original project figure 1' } : {}) })
  await invoke('presentation_record_asset', { manifest_path: 'assets.json', image_path: 'template.png', asset_id: 'style-bridge', role: 'style-candidate', source_kind: 'generated', style_reference_ids: ['fact'] })
  await invoke('presentation_record_asset', { manifest_path: 'assets.json', image_path: 'template.png', asset_id: 'initial', role: mode === 'image' ? 'slide-image' : 'template', source_kind: 'generated', slide_number: 1, style_reference_ids: ['style-bridge'] })
  await review()
  const elements = [{ elementId: 'native-title', elementType: 'text', bounds: [10, 10, 800, 60], content: { text: 'Verified heading' } }]
  if (mode === 'editable') await invoke('presentation_plan_editable_pages', { plans: [{ page: 1, elements }] })
  await invoke('presentation_build_pages', {})
  const styleOnly = await loadProject(root, 'deck')
  expect(styleOnly.pages.get(styleOnly.deck.pages[0]!)!.elements.some(element => String(element.src ?? '').includes('fact-'))).toBe(false)
  spec.slides[0]!.assetIds = ['fact']; await writeFile(join(root, 'spec.json'), JSON.stringify(spec))
  await expect(invoke('presentation_build_pages', {})).rejects.toThrow(mode === 'image' ? 'explicit in-bounds assetPlacements' : 'native image object')
  if (mode === 'image') {
    Object.assign(spec.slides[0]!, { assetPlacements: [{ assetId: 'fact', bounds: [20, 100, 200, 140] }] })
    await writeFile(join(root, 'spec.json'), JSON.stringify(spec)); await review()
  } else { await review(); await invoke('presentation_plan_editable_pages', { plans: [{ page: 1, elements: [...elements, { elementId: 'fact-original', elementType: 'image', src: 'fact', bounds: [20, 100, 200, 140] }] }] }) }
  await invoke('presentation_build_pages', {})
  const project = await loadProject(root, 'deck'), page = project.pages.get(project.deck.pages[0]!)!
  const original = page.elements.find(element => element.elementType === 'image' && String(element.src).includes('fact-'))!
  expect(original.bounds).toEqual([20, 100, 200, 140])
  expect(await readFile(join(project.dir, String(original.src)))).toEqual(bytes)
  await expect(gate()).resolves.toBeUndefined()
  await writeFile(join(root, 'fact.png'), 'changed source')
  await expect(invoke('presentation_build_pages', {})).rejects.toThrow('checksum changed')
})

it('inherits factual originals through edited template parents when the child omits style reference IDs', async () => {
  const { invoke, review, root, bytes, canonical } = await fixture()
  await writeFile(join(root, 'fact.png'), bytes)
  await invoke('presentation_record_asset', { manifest_path: 'assets.json', image_path: 'fact.png', asset_id: 'fact', role: 'data-figure', source_kind: 'user' })
  await invoke('presentation_record_asset', { manifest_path: 'assets.json', image_path: 'template.png', asset_id: 'style-parent', role: 'style-candidate', source_kind: 'generated', style_reference_ids: ['fact'] })
  const edited = await canonical.get('edit_image')({ prompt: 'Preserve original referenced figure', output_path: 'child.png', input_paths: [join(root, 'template.png')] })
  await invoke('presentation_record_asset', { manifest_path: 'assets.json', image_path: edited.path, asset_id: 'initial', role: 'slide-image', source_kind: 'generated', slide_number: 1, parent_asset_id: 'style-parent' })
  await review('initial', hash(await readFile(edited.path)))
  await invoke('presentation_build_pages', {})
  const loaded = await loadProject(root, 'deck')
  expect(loaded.pages.get(loaded.deck.pages[0]!)!.elements).toHaveLength(1)
})

it('checks source authority for direct exports after spec changes and shared-ledger failures in another project', async () => {
  const { invoke, review, root, spec, gate } = await fixture()
  await review(); await invoke('presentation_build_pages', {}); await expect(gate()).resolves.toBeUndefined()
  const originalText = spec.slides[0]!.text[0]!
  spec.slides[0]!.text[0] = 'Changed exact source heading'; await writeFile(join(root, 'spec.json'), JSON.stringify(spec))
  await expect(gate()).rejects.toMatchObject({ code: 'TemplateReviewStale' })
  spec.slides[0]!.text[0] = originalText; await writeFile(join(root, 'spec.json'), JSON.stringify(spec))
  await cp(join(root, 'deck'), join(root, 'other-deck'), { recursive: true })
  await invoke('presentation_prepare', { spec_path: 'spec.json', manifest_path: 'assets.json', dir: 'other-deck', mode: 'new', output_mode: 'image' })
  await review('initial', undefined, { status: 'repair-required', layout: 'fail', issues: ['Failure recorded in the other project'] })
  const oldReceipt = JSON.parse(await readFile(join(root, 'deck/presentation-provenance.json'), 'utf8')).templateReviews[0]
  expect(oldReceipt.review.status).toBe('passed')
  await expect(gate()).rejects.toMatchObject({ code: 'TemplateReviewStale' })
})
