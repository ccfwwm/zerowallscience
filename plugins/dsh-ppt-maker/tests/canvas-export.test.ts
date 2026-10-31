import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import { afterEach, expect, it } from 'vitest'
import { createProject, editProject, loadProject, loadCanvasSnapshot, restoreProject } from '../src/core/project/store.js'
import { buildProjectDeck, saveProjectPptx } from '../src/core/export-pipeline.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
const textPage = (text: string) => ({ elements: [{ elementId: 'title', elementType: 'text' as const, bounds: [10, 10, 800, 50] as [number, number, number, number], content: { text } }] })

it('exports the visible baseline plus drafts during a conflict without changing live files or history', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canvas-export-')); roots.push(root)
  await createProject(root, { dir: 'deck', metadata: { zeroWall: { outputMode: 'image' } } })
  await editProject(root, { dir: 'deck', newVersion: true, ops: [{ op: 'add_page', page: 'pages/01.page', content: textPage('Visible old page') }] })
  const baseline = await loadProject(root, 'deck')
  await editProject(root, { dir: 'deck', newVersion: true, ops: [{ op: 'update_element', page: 'pages/01.page', elementId: 'title', patch: { content: { text: 'Background new version' } } }] })
  const files = ['manifest.json', 'deck.pptd', 'pages/01.page', '.history/r0001/pages/01.page', '.history/r0002/pages/01.page']
  const before = await Promise.all(files.map(file => readFile(join(root, 'deck', file), 'utf8')))
  const snapshot = { baseRevision: baseline.manifest.revision, deck: { ...baseline.deck, export: { fontEmbed: 'off' as const } }, pageData: Object.fromEntries(baseline.pages),
    ops: [{ op: 'update_element', page: 'pages/01.page', elementId: 'title', patch: { content: { text: 'Visible draft text' } } }] }
  const pipeline = await buildProjectDeck(root, 'deck', snapshot)
  const output = await saveProjectPptx(pipeline)
  const parts = unzipSync(output.bytes), xml = strFromU8(parts['ppt/slides/slide1.xml'])
  expect(xml).toContain('Visible draft text')
  expect(xml).not.toContain('Background new version')
  expect(pipeline.revision).toBe(1)
  expect(pipeline.snapshotHash).toMatch(/^[a-f0-9]{64}$/)
  expect(pipeline.qualityIssues).toContainEqual(expect.stringContaining('presentation-provenance.json'))
  expect(await Promise.all(files.map(file => readFile(join(root, 'deck', file), 'utf8')))).toEqual(before)
  expect((await loadCanvasSnapshot(root, 'deck', { baseRevision: 1, ops: [] })).pages.get('pages/01.page')!.elements[0].content).toEqual({ text: 'Visible old page' })
})

it('keeps selected single/multi-page changes as separate versions and exports the selected version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canvas-versions-')); roots.push(root)
  await createProject(root, { dir: 'deck' })
  await editProject(root, { dir: 'deck', newVersion: true, ops: [1, 2, 3].map(page => ({ op: 'add_page', page: `pages/0${page}.page`, content: textPage(`Original ${page}`) })) })
  await editProject(root, { dir: 'deck', newVersion: true, ops: [2, 3].map(page => ({ op: 'update_element', page: `pages/0${page}.page`, elementId: 'title', patch: { content: { text: `Modified ${page}` } } })) })
  const latest = await loadProject(root, 'deck')
  expect(latest.manifest.revision).toBe(2)
  expect(latest.pages.get('pages/01.page')!.elements[0].content).toEqual({ text: 'Original 1' })
  const old = await buildProjectDeck(root, 'deck', { baseRevision: 1, ops: [] })
  const oldXml = strFromU8(unzipSync((await saveProjectPptx(old)).bytes)['ppt/slides/slide2.xml'])
  expect(oldXml).toContain('Original 2'); expect(oldXml).not.toContain('Modified 2')
  await restoreProject(root, 'deck', 1)
  expect((await buildProjectDeck(root, 'deck')).revision).toBe(1)
  await restoreProject(root, 'deck', 2)
  const newXml = strFromU8(unzipSync((await saveProjectPptx(await buildProjectDeck(root, 'deck'))).bytes)['ppt/slides/slide2.xml'])
  expect(newXml).toContain('Modified 2')
})

it('reports actual missing media and invalid draft operations clearly', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canvas-errors-')); roots.push(root)
  await createProject(root, { dir: 'deck' })
  await expect(buildProjectDeck(root, 'deck', { baseRevision: 0, ops: [{ op: 'unknown' }] })).rejects.toThrow('未知 op')
  await editProject(root, { dir: 'deck', ops: [{ op: 'add_page', page: 'pages/01.page', content: { elements: [{ elementId: 'image', elementType: 'image', src: 'media/missing.png', bounds: [0, 0, 960, 540] }] } }] })
  await expect(buildProjectDeck(root, 'deck')).rejects.toMatchObject({ code: 'MediaUnreadable' })
  await writeFile(join(root, 'deck', 'pages', '01.page'), 'invalid: [')
  await expect(buildProjectDeck(root, 'deck')).rejects.toHaveProperty('code')
})
