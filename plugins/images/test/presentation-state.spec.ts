import { randomUUID } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { installPresentationWorkflow } from '../src/host/presentation-workflow.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'presentation-state-')); roots.push(root)
  await mkdir(join(root, 'deck', 'pages'), { recursive: true })
  await writeFile(join(root, 'spec.json'), JSON.stringify({ width: 960, height: 540, fonts: {}, palette: {}, slides: [{}, {}] }))
  await writeFile(join(root, 'assets.json'), JSON.stringify({ schemaVersion: 2, assets: [] }))
  await writeFile(join(root, 'deck', 'deck.pptd'), 'size: [960, 540]\npages:\n  - pages/01.page\n  - pages/02.page\n')
  await writeFile(join(root, 'deck', 'manifest.json'), '{"revision":1}')
  for (const page of ['01', '02']) await writeFile(join(root, 'deck', 'pages', `${page}.page`), 'elements: []\n')
  const events: any[] = [], definitions = new Map<string, any>(), canonical = new Map<string, any>()
  let observer: any
  const agent = { session: { header: { cwd: root }, snapshotEvents: () => events, append: (type: string, data: any) => events.push({ type, data: structuredClone(data) }) } }
  const ctx = { effect: () => {}, on: (_: string, fn: any) => { observer = fn }, tools: {
    register: (def: any) => { definitions.set(def.name, def) }, execute: async (input: any) => invoke(input.name, input.arguments, input.callId)
  } }
  async function invoke(name: string, args: any, callId = randomUUID()): Promise<any> {
    const exec = { name, arguments: args, agent, callId }
    const next = async () => ({ isError: false, value: await canonical.get(name)(args) })
    if (definitions.has(name)) return { isError: false, value: await definitions.get(name).execute(args, exec) }
    return observer(exec, next)
  }
  canonical.set('ppt_check', vi.fn(async () => ({ ok: true, pass: true, issues: [] })))
  canonical.set('ppt_render', vi.fn(async (args: any) => {
    const images = []
    for (const page of args.pages ?? [1, 2]) { const path = join(root, `page-${page}.png`); await writeFile(path, `png-${page}`); images.push({ page, path }) }
    return { ok: true, images }
  }))
  installPresentationWorkflow(ctx as any)
  await invoke('presentation_prepare', { spec_path: 'spec.json', manifest_path: 'assets.json', dir: 'deck', mode: 'edit' })
  const state = async () => JSON.parse(await readFile(events.at(-1).data.journal, 'utf8'))
  return { root, invoke, canonical, state }
}

it('reuses current checks and PNGs; regenerates only changed pages and damaged PNGs', async () => {
  const { root, invoke, canonical } = await fixture()
  await invoke('presentation_check_pages', {})
  await invoke('presentation_check_pages', {})
  expect(canonical.get('ppt_check')).toHaveBeenCalledTimes(1)
  expect(canonical.get('ppt_render')).toHaveBeenCalledTimes(1)
  await writeFile(join(root, 'deck', 'pages', '02.page'), 'elements: []\nnotes: changed\n')
  await invoke('presentation_check_pages', {})
  expect(canonical.get('ppt_check').mock.calls.at(-1)[0].pages).toEqual([2])
  expect(canonical.get('ppt_render').mock.calls.at(-1)[0].pages).toEqual([2])
  await writeFile(join(root, 'page-1.png'), 'corrupted')
  await invoke('presentation_check_pages', {})
  expect(canonical.get('ppt_check')).toHaveBeenCalledTimes(2)
  expect(canonical.get('ppt_render').mock.calls.at(-1)[0].pages).toEqual([1])
})

it('allows in-flight reads to overlap, merges their evidence, and rejects stale page evidence', async () => {
  const { root, invoke, canonical, state } = await fixture()
  const checkStarted = Promise.withResolvers<void>(), renderStarted = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  canonical.set('ppt_check', async () => { checkStarted.resolve(); await release.promise; return { ok: true, pass: true, issues: [] } })
  canonical.set('ppt_render', async () => { renderStarted.resolve(); await release.promise; await writeFile(join(root, 'render.png'), 'png'); return { ok: true, images: [{ page: 1, path: 'render.png' }, { page: 2, path: 'render.png' }] } })
  const checks = invoke('ppt_check', { dir: 'deck' }); await checkStarted.promise
  const renders = invoke('ppt_render', { dir: 'deck' }); await renderStarted.promise
  await writeFile(join(root, 'deck', 'pages', '02.page'), 'elements: []\nnotes: changed during render\n')
  release.resolve(); await Promise.all([checks, renders])
  const saved = await state()
  expect(saved.pages[1].checks).toHaveProperty('ppt_check')
  expect(saved.pages[1].checks).toHaveProperty('ppt_render')
  expect(saved.pages[2].checks).toEqual({})
})

it.each(['ppt_check', 'ppt_render'])('does not commit a late %s into another project after a rebind', async name => {
  const { root, invoke, canonical, state } = await fixture()
  await cp(join(root, 'deck'), join(root, 'other-deck'), { recursive: true })
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  canonical.set(name, async () => {
    started.resolve(); await release.promise
    if (name === 'ppt_check') return { ok: true, pass: false, issues: [{ page: 1, severity: 'blocker', category: 'old-project-only' }] }
    await writeFile(join(root, 'old-project.png'), 'old-project')
    return { ok: true, images: [{ page: 1, path: 'old-project.png' }] }
  })
  const pending = invoke(name, { dir: 'deck' }); await started.promise
  await invoke('presentation_prepare', { spec_path: 'spec.json', manifest_path: 'assets.json', dir: 'other-deck', mode: 'edit' })
  release.resolve(); await pending
  const saved = await state()
  expect(saved.dir).toBe(join(root, 'other-deck'))
  expect(saved.pages[1].checks).toEqual({})
  expect(saved.failure).toBeUndefined()
})

it('does not attach an older failed operation to a newly selected project', async () => {
  const { root, invoke, canonical, state } = await fixture()
  await cp(join(root, 'deck'), join(root, 'other-deck'), { recursive: true })
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  canonical.set('ppt_check', async () => { started.resolve(); await release.promise; throw new Error('old-project-check-failed') })
  const pending = invoke('ppt_check', { dir: 'deck' }); const rejected = expect(pending).rejects.toThrow('old-project-check-failed')
  await started.promise
  await invoke('presentation_prepare', { spec_path: 'spec.json', manifest_path: 'assets.json', dir: 'other-deck', mode: 'edit' })
  release.resolve(); await rejected
  expect((await state()).failure).toBeUndefined()
  expect((await state()).dir).toBe(join(root, 'other-deck'))
})

it('stops a combined check/render when its project binding changes during the check', async () => {
  const { root, invoke, canonical, state } = await fixture()
  await cp(join(root, 'deck'), join(root, 'other-deck'), { recursive: true })
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  canonical.set('ppt_check', async () => { started.resolve(); await release.promise; return { ok: true, pass: true, issues: [] } })
  const pending = invoke('presentation_check_pages', {}); const rejected = expect(pending).rejects.toThrow('Presentation binding changed')
  await started.promise
  await invoke('presentation_prepare', { spec_path: 'spec.json', manifest_path: 'assets.json', dir: 'other-deck', mode: 'edit' })
  release.resolve(); await rejected
  expect(canonical.get('ppt_render')).not.toHaveBeenCalled()
  expect((await state()).dir).toBe(join(root, 'other-deck'))
})

it('invalidates checks when deck settings after the page list change', async () => {
  const { root, invoke, canonical } = await fixture()
  await invoke('presentation_check_pages', {})
  await writeFile(join(root, 'deck', 'deck.pptd'), 'pages:\n  - pages/01.page\n  - pages/02.page\nsize: [1920, 1080]\n')
  await invoke('presentation_check_pages', {})
  expect(canonical.get('ppt_check').mock.calls.at(-1)[0].pages).toEqual([1, 2])
  expect(canonical.get('ppt_render').mock.calls.at(-1)[0].pages).toEqual([1, 2])
})

it('explains missing review separately and keeps blockers and explicit finding waivers enforced', async () => {
  const { invoke, canonical, state } = await fixture()
  canonical.set('ppt_check', async () => ({ ok: true, pass: false, issues: [{ page: 1, severity: 'blocker', category: 'overflow' }, { page: 2, severity: 'warning', category: 'overlap' }] }))
  await invoke('presentation_check_pages', {})
  await expect(invoke('ppt_export', { dir: 'deck' })).rejects.toThrow('"missingChecks":false')
  await invoke('presentation_record_reviews', { reviews: [1, 2].map(page => ({ kind: 'page', target: String(page), observations: 'Viewed the actual returned PNG and checked text boundaries and figures.' })) })
  const result = JSON.parse((await invoke('presentation_status', {})).value)
  expect(result.requirements).toMatchObject([{ page: 1, missingReview: false, blockers: 1 }, { page: 2, missingReview: false, unreviewedFindings: 1 }])
  expect((await state()).exportReceipt).toBeUndefined()
})
