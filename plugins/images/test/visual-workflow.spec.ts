import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { recordAssetReview, recordVisualAssets, validatePresentationAssets, hash } from '../src/host/visual-assets.js'
import { prepareSvg, lintImageOcclusion, validateEditableSvgPlan } from '../src/host/presentation-layout.js'
import { actualCoverage, editableReconstructionFailures, exportBlockers, normalizeUniverExecutionSource, refreshPages, installPresentationWorkflow, runPresentationImageTasks, validateEditablePagePlan, type PresentationWorkflow } from '../src/host/presentation-workflow.js'

async function fixture(action: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'zerowall-presentation-'))
  try { await writeFile(join(root, 'source.pdf'), 'source identity'); await writeFile(join(root, 'spec.json'), JSON.stringify({ width: 960, height: 540, fonts: {}, palette: {}, slides: [{ assetIds: ['figure', 'art'] }, { assetIds: ['art'] }] })); await action(root) } finally { await rm(root, { recursive: true, force: true }) }
}
async function images(root: string) {
  for (const id of ['figure', 'art', 'unused']) {
    const bytes = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#287190' } }).png().toBuffer()
    await writeFile(join(root, id + '.png'), bytes)
    if (id === 'art') await writeFile(join(root, id + '.png.generation.json'), JSON.stringify({ sha256: hash(bytes), model: 'configured', inputImageHashes: [] }))
  }
  return recordVisualAssets(root, [
    { manifest: 'assets.json', image: 'figure.png', assetId: 'figure', role: 'evidence', sourceKind: 'literature', source: { path: 'source.pdf', page: 3, figure: 'Fig. 1', citation: 'Verified paper' } },
    { manifest: 'assets.json', image: 'art.png', assetId: 'art', role: 'illustration' },
  ])
}
const flow = { spec: 'spec.json', manifest: 'assets.json', mode: 'new' as const }
it('runs independent template image tasks with bounded concurrency and stable order', async () => {
  let active = 0, maximum = 0
  const values = await runPresentationImageTasks([
    { id: 'page-1', page: 1, run: async () => { active++; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 12)); active--; return 'one' } },
    { id: 'page-2', page: 2, run: async () => { active++; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 2)); active--; return 'two' } },
    { id: 'page-3', page: 3, run: async () => { active++; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 4)); active--; return 'three' } },
  ], 2)
  expect(values).toEqual(['one', 'two', 'three']); expect(maximum).toBeLessThanOrEqual(2)
})
it('validates editable reconstruction plans while keeping template assets reference-only', () => {
  const plan = validateEditablePagePlan(1, 'template-page-1', [
    { id: 'title', type: 'text', x: 40, y: 30, width: 800, height: 64, content: 'Editable title', editable: true },
    { id: 'chart', type: 'chart', x: 60, y: 150, width: 840, height: 280, role: 'primary-result' },
  ], 'balanced')
  expect(plan).toMatchObject({ page: 1, templateAssetId: 'template-page-1', density: 'balanced' })
  expect(() => validateEditablePagePlan(1, 'template-page-1', [{ id: 'bad', type: 'text', x: 0, y: 0, width: 20, height: 20 }])).toThrow('requires content')
  expect(() => validateEditablePagePlan(1, 'template-page-1', [{ id: 'bad', type: 'shape', x: 0, y: 0, width: 0, height: 20 }])).toThrow('positive bounds')
})

it('requires the compiled SVG to carry every planned editable element', async () => fixture(async root => {
  await writeFile(join(root, 'planned.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><text data-zerowall-element-id="title" data-zerowall-element-type="text">Title</text><rect data-zerowall-element-id="panel" data-zerowall-element-type="shape" width="10" height="10"/></svg>')
  const plan = { page: 1, elements: [{ id: 'title', type: 'text' }, { id: 'panel', type: 'shape' }] }
  await expect(validateEditableSvgPlan(root, 'planned.svg', plan)).resolves.toBeUndefined()
  await writeFile(join(root, 'planned.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><text data-zerowall-element-id="title" data-zerowall-element-type="shape">Title</text></svg>')
  await expect(validateEditableSvgPlan(root, 'planned.svg', plan)).rejects.toThrow('expected text')
  await writeFile(join(root, 'planned.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><text data-zerowall-element-id="title" data-zerowall-element-type="text">Title</text></svg>')
  await expect(validateEditableSvgPlan(root, 'planned.svg', plan)).rejects.toThrow('missing planned editable element panel')
}))
it('requires actual native reconstruction objects, content and bounds before export', () => {
  const plan = validateEditablePagePlan(1, 'template', [
    { id: 'title', type: 'text', x: 10, y: 10, width: 200, height: 60, content: 'Editable title' },
    { id: 'chart', type: 'chart', x: 20, y: 100, width: 300, height: 200 },
    { id: 'table', type: 'table', x: 400, y: 100, width: 300, height: 200 },
  ])
  const text = { type: 'shape', transform: { left: 10, top: 10, width: 180, height: 40 }, shapeData: { shapeText: { text: 'Editable title' } } }
  const chart = { type: 'chart', chartId: 'real-chart', transform: { left: 20, top: 100, width: 300, height: 200 } }
  const table = { type: 'table', tableId: 'real-table', transform: { left: 400, top: 100, width: 300, height: 200 } }
  const snapshot = { page: 1, id: 'p1', fingerprint: 'r1', data: { elements: { text, chart, table } } }
  expect(editableReconstructionFailures(snapshot, plan)).toEqual([])
  expect(editableReconstructionFailures({ ...snapshot, data: { elements: { text, chart: { ...chart, type: 'shape' }, table } } }, plan).join()).toContain('Planned chart chart')
  expect(editableReconstructionFailures({ ...snapshot, data: { elements: { text: { ...text, shapeData: { shapeText: { text: 'wrong content' } } }, chart, table } } }, plan).join()).toContain('Planned text title')
  expect(editableReconstructionFailures({ ...snapshot, data: { elements: { text, chart, table: { ...table, transform: { ...table.transform, left: 800 } } } } }, plan).join()).toContain('Planned table table')
  const state: PresentationWorkflow = { schemaVersion: 2, spec: '', manifest: '', mode: 'new', changedPages: [1], pages: {}, phase: 'reviewed', reconstructionFailures: { 1: ['missing native chart'] } }
  expect(exportBlockers(state)).toEqual([1])
})
it('normalizes the /none execution-source sentinel and rejects real dual sources', () => {
  expect(normalizeUniverExecutionSource({ file: 'deck.univer', unitId: 'slides', worktreeId: 'draft', code: 'return 1', codeFile: '/none' }))
    .toEqual({ file: 'deck.univer', unitId: 'slides', worktreeId: 'draft', code: 'return 1' })
  expect(() => normalizeUniverExecutionSource({ code: 'return 1', codeFile: 'scripts/mutate.js' }))
    .toThrow('INVALID_EXECUTION_SOURCE')
  expect(normalizeUniverExecutionSource({ codeFile: 'scripts/mutate.js' })).toEqual({ codeFile: 'scripts/mutate.js' })
})
it('accepts multi-image literature/generated pages without style ceremony and ignores unused failed art', async () => fixture(async root => {
  await images(root)
  await expect(validatePresentationAssets(root, flow, 1)).rejects.toThrow('review')
  await Promise.all(['figure', 'art'].map(id => recordAssetReview(root, 'assets.json', 'asset', id, 'Viewed actual image: labels intact, clear scientific content.')))
  await recordVisualAssets(root, [{ manifest: 'assets.json', image: 'unused.png', assetId: 'unused', role: 'illustration', sourceKind: 'user' }])
  await expect(validatePresentationAssets(root, flow)).resolves.toBeUndefined()
  await writeFile(join(root, 'figure.png'), 'changed')
  await expect(validatePresentationAssets(root, flow, 1)).rejects.toThrow('changed')
  await expect(validatePresentationAssets(root, flow, 2)).resolves.toBeUndefined()
}))
it('requires real source identity for literature but never a generation receipt', async () => fixture(async root => {
  await images(root)
  const manifest = JSON.parse(await readFile(join(root, 'assets.json'), 'utf8'))
  expect(manifest.assets[0].source.sha256).toBe(hash('source identity'))
  await expect(recordVisualAssets(root, [{ manifest: 'assets.json', image: 'figure.png', assetId: 'bad', role: 'evidence', sourceKind: 'literature' }])).rejects.toThrow('source_page')
}))
it('serializes concurrent writes and repeated identical registrations preserve reviews', async () => fixture(async root => {
  const first = await images(root)
  await Promise.all(['figure', 'art'].map(id => recordAssetReview(root, 'assets.json', 'asset', id, 'Viewed actual image: sufficient contrast and complete labels.')))
  const again = await images(root)
  expect(again.changedAssetIds).toEqual([])
  expect(first.changedAssetIds).toHaveLength(2)
  expect(Object.keys(JSON.parse(await readFile(join(root, 'assets.json'), 'utf8')).assetReviews)).toHaveLength(2)
}))
it('bakes opacity into a provenance-tracked alpha derivative without changing the original', async () => fixture(async root => {
  await images(root)
  await writeFile(join(root, 'page.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><image href="art.png" width="200" height="100" opacity="0.22"/><text x="250" y="50">editable</text></svg>')
  const original = await readFile(join(root, 'art.png'))
  const prepared = await prepareSvg(root, 'page.svg', 'spec.json', 'assets.json', 1)
  const svg = await readFile(prepared, 'utf8')
  expect(svg).not.toContain('opacity="0.22"'); expect(svg).toContain('<text')
  const assets = JSON.parse(await readFile(join(root, 'assets.json'), 'utf8')).assets
  const derived = assets.find((asset: any) => asset.sourceKind === 'derived')
  const rgba = await sharp(derived.path).ensureAlpha().raw().toBuffer()
  expect(rgba[3]).toBe(56); expect(await readFile(join(root, 'art.png'))).toEqual(original)
  expect(derived.parentAssetId).toBe('art')
}))
it('flags images above content while allowing images below text and disjoint images', () => {
  const data = { elementOrder: ['text', 'image'], elements: { text: { type: 'shape', transform: { left: 20, top: 20, width: 100, height: 30 }, shapeData: { shapeText: { text: 'Result 1.61' } } }, image: { type: 'shape', transform: { left: 60, top: 20, width: 100, height: 50 }, shapeData: { fill: { fillImageSource: 'bitmap' } } } } }
  expect(lintImageOcclusion({ page: 1, id: 'p1', fingerprint: 'a', data })).toHaveLength(1)
  data.elementOrder.reverse(); expect(lintImageOcclusion({ page: 1, id: 'p1', fingerprint: 'a', data })).toHaveLength(0)
})
it('binds checks to actual page coverage and invalidates only changed revisions', () => {
  const snapshots = [1, 2].map(page => ({ page, id: `p${page}`, fingerprint: `rev${page}`, data: {} }))
  expect(actualCoverage('univer_inspect', { result: { slides: [{ id: 'p1', index: 0 }, { id: 'p2', index: 1 }] } }, snapshots)).toEqual([1, 2])
  expect(actualCoverage('univer_lint', { result: { coverage: { pages: [{ page: 2, pageId: 'p2' }] } } }, snapshots)).toEqual([2])
  expect(actualCoverage('univer_screenshot', { ok: true, result: { images: [] } }, snapshots)).toEqual([])
  const state: PresentationWorkflow = { schemaVersion: 2, spec: 'spec', manifest: 'assets', mode: 'new', changedPages: [], pages: {}, phase: 'building' }
  refreshPages(state, snapshots, { 1: 'asset1', 2: 'asset2' })
  for (const page of Object.values(state.pages)) {
    for (const name of ['univer_inspect', 'univer_lint', 'univer_screenshot']) page.checks[name] = { fingerprint: page.fingerprint, findings: [] }
    page.review = { fingerprint: page.fingerprint, observations: 'Viewed actual screenshot and labels.', waivers: [] }
  }
  expect(exportBlockers(state)).toEqual([])
  refreshPages(state, snapshots, { 1: 'asset1', 2: 'asset2' }); expect(exportBlockers(state)).toEqual([])
  snapshots[0]!.fingerprint = 'edited'; refreshPages(state, snapshots, { 1: 'asset1', 2: 'asset2' })
  expect(exportBlockers(state)).toEqual([1]); expect(state.pages[2]!.review).toBeTruthy()
})
it('loads old manifests without imposing seed lineage or mandatory per-page imagery', async () => fixture(async root => {
  await writeFile(join(root, 'spec.json'), JSON.stringify({ width: 960, height: 540, fonts: {}, palette: {}, slides: [{}] }))
  await writeFile(join(root, 'assets.json'), JSON.stringify({ schemaVersion: 1, assets: [{ assetId: 'unused', role: 'content-seed', slideNumber: 1, path: 'missing.png' }] }))
  await expect(validatePresentationAssets(root, flow)).resolves.toBeUndefined()
}))
it('does not intercept other Office Units/files or read-only tools in unbound sessions', async () => {
  const hooks: Record<string, any> = {}, tools: any[] = []
  installPresentationWorkflow({ effect: () => {}, on: (name: string, hook: any) => { hooks[name] = hook }, tools: { register: (tool: any) => tools.push(tool) }, llm: {} } as any)
  const agent = { session: { snapshotEvents: () => [], header: { cwd: 'unused' } } }, next = vi.fn(async () => ({ isError: false }))
  const execution = { name: 'univer_execute', arguments: { file: 'book.univer', unitId: 'sheet', worktreeId: 'draft', code: 'return 1', codeFile: '/none' }, agent }
  await hooks['tools/execute'](execution, next)
  expect(execution.arguments).toEqual({ file: 'book.univer', unitId: 'sheet', worktreeId: 'draft', code: 'return 1' })
  expect(next).toHaveBeenCalledOnce(); expect(tools.some(tool => tool.name === 'presentation_compile_pages')).toBe(true)
  await expect(hooks['tools/execute']({ name: 'univer_execute', arguments: { file: 'book.univer', unitId: 'sheet', worktreeId: 'draft', code: 'return 1', codeFile: 'real.js' }, agent }, next)).rejects.toThrow('INVALID_EXECUTION_SOURCE')
})

// Exercise the installed tools, nested dispatch, locks and on-disk journal, not
// just refreshPages in isolation. Rendering remains a separate real-Univer test.
function runtime(root: string, snapshots: any[], events: any[] = []) {
  const hooks: Record<string, any> = {}, registered = new Map<string, any>()
  const counts: Record<string, number> = {}, controls = { screenshots: [1, 2], failPage: 0 }, imageCalls: any[] = []
  const scope = { file: join(root, 'report.univer'), unitId: 'slides', worktreeId: 'draft' }
  const agent = { session: { id: 'reviewing-model', header: { cwd: root }, snapshotEvents: () => events, append: (type: string, data: unknown) => events.push({ type, data: structuredClone(data) }) } }
  const ctx: any = { effect: () => {}, on: (name: string, hook: any) => { hooks[name] = hook }, llm: { resolveModelInfo: async () => ({ inputModalities: ['text', 'image'] }) }, tools: {
    register: (tool: any) => registered.set(tool.name, tool),
    execute: async (exec: any): Promise<any> => {
      const execution = { ...exec, agent, token: 'test', deferContext: () => {} }
      const next = async () => {
        if (registered.has(exec.name)) return { isError: false, value: await registered.get(exec.name).execute(exec.arguments, execution), content: [] }
        counts[exec.name] = (counts[exec.name] ?? 0) + 1
        let value: any
        if (exec.name === 'generate_image') {
          imageCalls.push(exec.arguments)
          const bytes = await sharp({ create: { width: 40, height: 20, channels: 3, background: '#183a5a' } }).png().toBuffer()
          await writeFile(join(root, exec.arguments.output_path), bytes)
          await writeFile(join(root, exec.arguments.output_path + '.generation.json'), JSON.stringify({ sha256: hash(bytes), model: 'configured', inputImageHashes: [] }))
          value = { path: exec.arguments.output_path, model: 'configured', providerId: 'provider', groupId: 'group', requestedSize: 'auto', quality: 'medium', requestedQuality: 'medium', actualQuality: 'medium' }
        } else if (exec.name === 'univer_execute') value = { result: { value: snapshots } }
        else if (exec.name === 'univer_compile_svg') {
          if (exec.arguments.page === controls.failPage) throw new Error('temporary compiler failure')
          snapshots[exec.arguments.page - 1].fingerprint += '-compiled'; value = { ok: true }
        } else if (exec.name === 'univer_inspect') value = { result: { slides: snapshots.map(s => ({ id: s.id, index: s.page - 1 })) } }
        else if (exec.name === 'univer_lint') value = { result: { coverage: { pages: exec.arguments.pages.map((page: number) => ({ page, pageId: snapshots[page - 1].id })) }, findings: [] } }
        else if (exec.name === 'univer_screenshot') value = { result: { images: controls.screenshots.filter(page => exec.arguments.pages.includes(page)).map(page => ({ path: `actual-page-${page}.png`, metadata: { page } })) } }
        else value = { ok: true }
        return { isError: false, value, content: [] }
      }
      return hooks['tools/execute'] ? hooks['tools/execute'](execution, next) : next()
    },
  } }
  installPresentationWorkflow(ctx)
  const call = async (name: string, arguments_: any = {}) => {
    const result = await ctx.tools.execute({ callId: Math.random().toString(), name, arguments: arguments_ })
    return typeof result.value === 'string' && result.value.startsWith('{') ? JSON.parse(result.value) : result.value
  }
  const prepare = async () => {
    for await (const _ of hooks['llm/stream']({ sessionId: agent.session.id, provider: 'selected', model: 'selected' }, async function* () {})) { /* vision capability */ }
    return call('presentation_prepare', { ...scope, spec_path: 'spec.json', manifest_path: 'assets.json', mode: 'new' })
  }
  return { call, prepare, scope, counts, controls, events, imageCalls }
}
async function runtimeFixture(action: (root: string, snapshots: any[]) => Promise<void>) {
  await fixture(async root => {
    await images(root)
    for (const id of ['figure', 'art']) await recordAssetReview(root, 'assets.json', 'asset', id, 'Viewed actual asset: complete labels, clear contrast and intact evidence.')
    await writeFile(join(root, 'page.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><text x="30" y="50">Editable content</text></svg>')
    await action(root, [1, 2].map(page => ({ page, id: `p${page}`, fingerprint: `rev${page}`, data: { elements: {}, elementOrder: [] } })))
  })
}
const pageReviews = [1, 2].map(page => ({ kind: 'page', target: String(page), observations: 'Viewed actual screenshot: text, image bounds and labels are complete and disjoint.' }))
it('preserves current checks across reads, asset reviews and scope mismatches; edits only invalidate the affected page', async () => runtimeFixture(async (root, snapshots) => {
  const rt = runtime(root, snapshots); await rt.prepare()
  await rt.call('presentation_check_pages', { pages: [1, 2], output: 'screenshots' })
  await rt.call('presentation_record_reviews', { reviews: pageReviews })
  await rt.call('univer_execute', { ...rt.scope, code: 'read only' })
  await Promise.all(['figure', 'art'].map(target => rt.call('presentation_record_review', { kind: 'asset', target, observations: 'Re-viewed actual asset: labels complete and no change to page composition.' })))
  await images(root)
  expect((await rt.call('presentation_status')).blockedPages).toEqual([])
  await rt.call('univer_export', { ...rt.scope, unitId: 'another-sheet' })
  expect((await rt.call('presentation_status')).blockedPages).toEqual([])
  snapshots[0].fingerprint = 'changed'
  await rt.call('univer_execute', { ...rt.scope, code: 'capture changed page' })
  expect((await rt.call('presentation_status')).blockedPages).toEqual([1])
  await expect(rt.call('univer_export', rt.scope)).rejects.toThrow('pages: 1')
}))
it('requires returned screenshot coverage and restores checked reviews from disk in a new session', async () => runtimeFixture(async (root, snapshots) => {
  const rt = runtime(root, snapshots); await rt.prepare(); rt.controls.screenshots = [1]
  await rt.call('presentation_check_pages', { pages: [1, 2], output: 'screenshots' })
  await expect(rt.call('presentation_record_reviews', { reviews: pageReviews })).rejects.toThrow('screenshot')
  expect((await rt.call('presentation_status')).blockedPages).toEqual([2])
  rt.controls.screenshots = [1, 2]
  await rt.call('presentation_check_pages', { pages: [2], output: 'screenshots' })
  await rt.call('presentation_record_reviews', { reviews: [pageReviews[1]] })
  const restored = runtime(root, snapshots)
  await restored.prepare()
  expect((await restored.call('presentation_status')).blockedPages).toEqual([])
  await expect(restored.call('univer_export', restored.scope)).resolves.toEqual({ ok: true })
}))
it('journals a failed batch without losing successful pages and resumes only the failed page', async () => runtimeFixture(async (root, snapshots) => {
  const rt = runtime(root, snapshots); await rt.prepare();rt.controls.failPage = 2
  await expect(rt.call('presentation_compile_pages', { pages: [1, 2].map(page => ({ page, source: 'page.svg' })) })).rejects.toThrow('temporary compiler failure')
  const status = await rt.call('presentation_status')
  expect(status.state.failure.stage).toBe('univer_compile_svg')
  expect(snapshots[0].fingerprint).toBe('rev1-compiled')
  expect(snapshots[1].fingerprint).toBe('rev2')
  const restored = runtime(root, snapshots);await restored.prepare()
  await restored.call('presentation_compile_pages', { pages: [{ page: 2, source: 'page.svg' }] })
  expect(snapshots.map(s => s.fingerprint)).toEqual(['rev1-compiled', 'rev2-compiled'])
  expect((await restored.call('presentation_status')).state.failure).toBeUndefined()
}))

it('generates reference-only page templates through the image route and persists editable overlays', async () => runtimeFixture(async (root, snapshots) => {
  const rt = runtime(root, snapshots)
  await rt.prepare()
  const generated = await rt.call('presentation_generate_templates', {
    templates: [
      { page: 1, prompt: 'A complete scientific slide composition used only as a raster reference.', output_path: 'template-page-1.png', asset_id: 'template-page-1' },
      { page: 2, prompt: 'A complete scientific comparison slide composition used only as a raster reference.', output_path: 'template-page-2.png', asset_id: 'template-page-2' },
    ],
    concurrency: 2,
  })
  expect(generated.templates.map((item: any) => item.assetId)).toEqual(['template-page-1', 'template-page-2'])
  expect(rt.imageCalls).toEqual([
    { prompt: 'A complete scientific slide composition used only as a raster reference.', output_path: 'template-page-1.png' },
    { prompt: 'A complete scientific comparison slide composition used only as a raster reference.', output_path: 'template-page-2.png' },
  ])
  expect(Object.keys(rt.counts).filter(name => name.startsWith('media_'))).toEqual([])
  const manifest = JSON.parse(await readFile(join(root, 'assets.json'), 'utf8'))
  expect(manifest.assets.filter((asset: any) => asset.role === 'template').map((asset: any) => asset.slideNumber)).toEqual([1, 2])
  const planned = await rt.call('presentation_plan_editable_pages', {
    plans: [
      { page: 1, template_asset_id: 'template-page-1', density: 'balanced', elements: [{ id: 'title', type: 'text', x: 40, y: 30, width: 800, height: 60, content: 'Editable title' }, { id: 'result-chart', type: 'chart', x: 60, y: 140, width: 840, height: 280 }] },
      { page: 2, template_asset_id: 'template-page-2', elements: [{ id: 'comparison', type: 'table', x: 60, y: 120, width: 840, height: 300 }] },
    ],
  })
  expect(planned.plans.map((plan: any) => plan.templateAssetId)).toEqual(['template-page-1', 'template-page-2'])
  expect((await rt.call('presentation_status')).state.phase).toBe('planned-editable-reconstruction')
  await expect(rt.call('presentation_compile_pages', { pages: [{ page: 1, source: 'page.svg' }] })).rejects.toThrow('missing planned editable element title')
  await writeFile(join(root, 'page.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><text data-zerowall-element-id="title" data-zerowall-element-type="text">Editable title</text><rect data-zerowall-element-id="result-chart" data-zerowall-element-type="chart" width="10" height="10"/></svg>')
  await expect(rt.call('presentation_compile_pages', { pages: [{ page: 1, source: 'page.svg' }] })).resolves.toBeTruthy()
  await rt.call('presentation_check_pages', { pages: [1, 2], output: 'screenshots' })
  await rt.call('presentation_record_reviews', { reviews: pageReviews })
  await expect(rt.call('univer_export', rt.scope)).rejects.toThrow('matching editable reconstruction')
  expect((await rt.call('presentation_status')).state.reconstructionFailures['1'].join()).toContain('result-chart')
  snapshots[0].data.elements = {
    title: { type: 'text', text: 'Editable title', transform: { left: 40, top: 30, width: 800, height: 60 } },
    chart: { type: 'chart', chartId: 'native-result', transform: { left: 60, top: 140, width: 840, height: 280 } },
  }
  snapshots[1].data.elements = { table: { type: 'table', tableId: 'native-comparison', transform: { left: 60, top: 120, width: 840, height: 300 } } }
  snapshots[0].fingerprint += '-native'; snapshots[1].fingerprint += '-native'
  await rt.call('presentation_check_pages', { pages: [1, 2], output: 'screenshots' })
  await rt.call('presentation_record_reviews', { reviews: pageReviews })
  await expect(rt.call('univer_export', rt.scope)).resolves.toEqual({ ok: true })
  await expect(rt.call('presentation_plan_editable_pages', { plans: [{ page: 1, template_asset_id: 'art', elements: [{ id: 'title', type: 'text', x: 0, y: 0, width: 100, height: 40, content: 'Title' }] }] })).rejects.toThrow('generated template')
  await writeFile(join(root, 'template.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><image href="template-page-1.png" width="960" height="540"/></svg>')
  await expect(prepareSvg(root, 'template.svg', 'spec.json', 'assets.json', 1)).rejects.toThrow('not in this page')
  const spec = JSON.parse(await readFile(join(root, 'spec.json'), 'utf8'))
  spec.slides[0].assetIds = ['template-page-1']
  await writeFile(join(root, 'spec.json'), JSON.stringify(spec))
  await expect(validatePresentationAssets(root, flow, 1)).rejects.toThrow('reference-only')
}))

it('rejects invalid template batches before image dispatch', async () => runtimeFixture(async (root, snapshots) => {
  const rt = runtime(root, snapshots); await rt.prepare()
  const first = { page: 1, prompt: 'Reference template', output_path: 'template.png', asset_id: 'template-1' }
  await expect(rt.call('presentation_generate_templates', { templates: [{ ...first, page: 3 }] })).rejects.toThrow('outside')
  await expect(rt.call('presentation_generate_templates', { templates: [first, { ...first, asset_id: 'template-2' }] })).rejects.toThrow('paths must be unique')
  await expect(rt.call('presentation_generate_templates', { templates: [first, { ...first, output_path: 'second.png' }] })).rejects.toThrow('IDs must be unique')
  expect(rt.imageCalls).toEqual([])
}))
