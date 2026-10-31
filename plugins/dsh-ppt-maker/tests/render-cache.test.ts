import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSlides, loadPresentation } from '@office-kit/pptx'
import { createProject, editProject } from '../src/core/project/store.js'
import { buildProjectDeck, checkBuiltProject, checkProject, renderProjectPreviews, renderPptxImages } from '../src/core/export-pipeline.js'

const state = vi.hoisted(() => ({ calls: [] as Array<{ pages: number[]; dpi: number }>, active: 0, maximum: 0, fail: false }))
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
vi.mock('@deepseek-ai/libreoffice-kit', () => ({
  createConverter: async () => ({
    dispose: async () => {},
    render: async (request: { inputPath: string; outputPath: string }) => {
      // Keep a readable fixture container while separately exercising the
      // production PPTX -> PDF -> image call boundary.
      await writeFile(request.outputPath, await readFile(request.inputPath))
      return { missingFonts: ['fixture-font'] }
    },
    renderImages: async (request: { inputPath: string; outputDir: string; pages: number[] | 'all'; dpi: number }) => {
      state.active++; state.maximum = Math.max(state.maximum, state.active)
      try {
        const count = getSlides(await loadPresentation(new Uint8Array(await readFile(request.inputPath)))).length
        const pages = request.pages === 'all' ? Array.from({ length: count }, (_, i) => i + 1) : request.pages
        state.calls.push({ pages, dpi: request.dpi })
        if (state.fail) throw new Error('synthetic renderer failure')
        await mkdir(request.outputDir)
        const images = await Promise.all(pages.map(async (page) => {
          const target = path.join(request.outputDir, `page-${page}.png`)
          await writeFile(target, png)
          return { index: page - 1, page, path: target, width: 1280, height: 720 }
        }))
        return { images, missingFonts: ['fixture-font'], pageCount: count }
      } finally { state.active-- }
    }
  })
}))

let cwd: string
beforeEach(async () => {
  state.calls = []; state.active = 0; state.maximum = 0; state.fail = false
  cwd = await mkdtemp(path.join(tmpdir(), 'ppt-cache-40-'))
  await createProject(cwd, { dir: 'deck', title: '40-page cache fixture' })
  await mkdir(path.join(cwd, 'deck/media'), { recursive: true })
  await writeFile(path.join(cwd, 'deck/media/figure.png'), png)
  await editProject(cwd, { dir: 'deck',
    baseRevision: 0,
    ops: Array.from({ length: 40 }, (_, index) => ({ op: 'add_page' as const, page: `pages/${String(index + 1).padStart(2, '0')}.page`, content: {
      elements: [{ elementId: `shape-${index}`, elementType: 'shape', shapeName: 'rect', bounds: [20, 20, 80, 40] },
        ...(index === 1 ? [{ elementId: 'scientific-figure', elementType: 'image', src: 'media/figure.png', bounds: [120, 20, 80, 80] }] : [])]
    } }))
  })
})
afterEach(async () => { await rm(cwd, { recursive: true, force: true }) })

describe('40-page final-deck preview cache', () => {
  it('checks and renders only selected pages even when an unrelated page has missing media', async () => {
    await rm(path.join(cwd, 'deck/media/figure.png'))
    const result = await checkProject(cwd, 'deck', { pages: [37], withMissingFonts: false })
    expect(result.issues.some(issue => issue.page === 2)).toBe(false)
    await renderProjectPreviews(cwd, 'deck', { pages: [37] })
    expect(state.calls).toEqual([{ pages: [37], dpi: 96 }])
    await expect(buildProjectDeck(cwd, 'deck')).rejects.toMatchObject({ code: 'MediaUnreadable' })
  })

  it('renders one batch, coalesces concurrent repeat requests, and only re-renders a changed page', async () => {
    const [first, second, third] = await Promise.all(Array.from({ length: 3 }, () => renderProjectPreviews(cwd, 'deck')))
    expect(first.images).toHaveLength(40)
    expect(second.images).toEqual(first.images); expect(third.images).toEqual(first.images)
    expect(state.calls).toHaveLength(1)
    expect(state.calls[0].pages).toHaveLength(40)
    await editProject(cwd, { dir: 'deck', baseRevision: 1, ops: [{ op: 'update_element', page: 'pages/37.page', elementId: 'shape-36', patch: { bounds: [40, 20, 80, 40] } }] })
    await renderProjectPreviews(cwd, 'deck')
    expect(state.calls.at(-1)?.pages).toEqual([37])
    expect(state.calls).toHaveLength(2)
  })

  it('invalidates replaced media, external page edits and corrupted PNGs without a revision bump', async () => {
    await renderProjectPreviews(cwd, 'deck')
    await writeFile(path.join(cwd, 'deck/media/figure.png'), Buffer.concat([png, Buffer.from('changed-source')]))
    await renderProjectPreviews(cwd, 'deck')
    expect(state.calls.at(-1)?.pages).toEqual([2])
    const page = path.join(cwd, 'deck/pages/03.page')
    await writeFile(page, (await readFile(page, 'utf8')).replace('20, 20, 80, 40', '30, 20, 80, 40'))
    await renderProjectPreviews(cwd, 'deck')
    expect(state.calls.at(-1)?.pages).toEqual([3])
    await writeFile(path.join(cwd, 'deck/.previews/page-01.png'), 'broken')
    await renderProjectPreviews(cwd, 'deck')
    expect(state.calls.at(-1)?.pages).toEqual([1])
    expect(state.calls).toHaveLength(4)
  })

  it('separates DPI variants, checks page bounds, and retries a failed batch', async () => {
    await renderProjectPreviews(cwd, 'deck', { pages: [1], dpi: 24 })
    const high = await renderProjectPreviews(cwd, 'deck', { pages: [1] })
    expect(state.calls.map((call) => call.dpi)).toEqual([24, 96])
    expect(high.images[0].path).toContain(path.join('.previews', 'page-01.png'))
    await expect(renderProjectPreviews(cwd, 'deck', { pages: [41] })).rejects.toThrow('页码')
    state.fail = true
    await expect(renderProjectPreviews(cwd, 'deck', { pages: [2] })).rejects.toThrow('synthetic')
    state.fail = false
    await renderProjectPreviews(cwd, 'deck', { pages: [2] })
    expect(state.calls.at(-1)?.pages).toEqual([2])
  })

  it('font diagnosis and AI review share one 96-DPI render', async () => {
    const pipeline = await buildProjectDeck(cwd, 'deck')
    const checked = await checkBuiltProject(pipeline, { pages: [1, 2], ai: { cwd, deps: { sessionId: null } } })
    expect(checked.missingFonts).toEqual(['fixture-font'])
    expect(checked.ai?.performed).toBe(false)
    expect(state.calls).toEqual([{ pages: [1, 2], dpi: 96 }])
  })

  it('a normal check and subsequent PNG review reuse the same exact-page render', async () => {
    const pipeline = await buildProjectDeck(cwd, 'deck')
    await checkBuiltProject(pipeline, { pages: [1, 2] })
    await renderProjectPreviews(cwd, 'deck', { pages: [1, 2] })
    expect(state.calls).toEqual([{ pages: [1, 2], dpi: 96 }])
  })

  it('bounds simultaneous independent native render processes to two', async () => {
    const { saveRawProjectPptx } = await import('../src/core/export-pipeline.js')
    const bytes = await saveRawProjectPptx(await buildProjectDeck(cwd, 'deck'))
    const renders = await Promise.all(Array.from({ length: 5 }, () => renderPptxImages(bytes, { pages: [1] })))
    await Promise.all(renders.map((render) => render.cleanup()))
    expect(state.maximum).toBeLessThanOrEqual(2)
    expect(state.calls).toHaveLength(5)
  })
})
