import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { recordAssetReview, recordVisualAssets, validatePresentationAssets, hash } from '../src/host/visual-assets.js'
import { prepareSvg, lintImageOcclusion } from '../src/host/presentation-layout.js'
import { actualCoverage, exportBlockers, refreshPages, installPresentationWorkflow, type PresentationWorkflow } from '../src/host/presentation-workflow.js'

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
  await hooks['tools/execute']({ name: 'univer_execute', arguments: { file: 'book.univer', unitId: 'sheet', worktreeId: 'draft' }, agent }, next)
  expect(next).toHaveBeenCalledOnce(); expect(tools.some(tool => tool.name === 'presentation_compile_pages')).toBe(true)
})

// Exercise the installed tools, nested dispatch, locks and on-disk journal, not
// just refreshPages in isolation. Rendering remains a separate real-Univer test.
function runtime(root: string, snapshots: any[], events: any[] = []) {
  const hooks: Record<string, any> = {}, registered = new Map<string, any>()
  const counts: Record<string, number> = {}, controls = { screenshots: [1, 2], failPage: 0 }
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
        if (exec.name === 'univer_execute') value = { result: { value: snapshots } }
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
  return { call, prepare, scope, counts, controls, events }
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
