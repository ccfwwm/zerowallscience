import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { parse, stringify } from 'yaml'
import { afterEach, describe, expect, it } from 'vitest'
import { buildProjectDeck, saveProjectPptx, saveRawProjectPptx } from '../src/core/export-pipeline.js'
import { createProject, editProject } from '../src/core/project/store.js'
import { assertTemplateExportReady, hasPassedTemplateReview, templatePageFingerprint, type TemplateVisualReview } from '../src/core/template-review.js'
import { registerExportTool } from '../src/tools/export.js'
import type { ToolDef } from '../src/tools/shared.js'
import { PNG_1PX } from './__fixtures__/pptx-fixtures.js'
import { createApiHandler, API_PREFIX } from '../plugin/host/routes.mjs'
import { ProjectError, loadProject, writeExportReport } from '../src/core/project/store.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
const imageHash = sha(PNG_1PX)
const passed: TemplateVisualReview = { schemaVersion: 1, sha256: imageHash, status: 'passed', textIntegrity: 'pass', layout: 'pass', contentAccuracy: 'pass', observations: 'Viewed the full resolution image: all labels are readable and match the source; layout and figures are consistent.', issues: [], reviewedAt: '2026-10-17T12:00:00.000Z' }

async function fixture(mode: 'image' | 'editable' = 'image') {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'ppt-template-review-')); roots.push(cwd)
  const dir = path.join(cwd, 'deck')
  await createProject(cwd, { dir: 'deck', metadata: { zeroWall: { outputMode: mode } } })
  await writeFile(path.join(dir, 'media', 'template.png'), PNG_1PX)
  await editProject(cwd, { dir: 'deck', ops: [{ op: 'add_page', page: 'pages/01.page', content: { elements: mode === 'image'
    ? [{ elementId: 'slide-image', elementType: 'image', src: 'media/template.png', bounds: [0, 0, 960, 540] }]
    : [{ elementId: 'native-text', elementType: 'text', content: { text: 'Native editable content' }, bounds: [10, 10, 800, 80] }] } }] })
  const deckPath = path.join(dir, 'deck.pptd'), deck = parse(await readFile(deckPath, 'utf8'))
  deck.export.fontEmbed = 'off'; await writeFile(deckPath, stringify(deck))
  const spec = { width: 960, height: 540, fonts: {}, palette: {}, slides: [{ text: ['Reviewed heading'] }] }
  const evidence = { page: 1, assetId: 'template', assetSha256: imageHash, mediaPath: 'media/template.png', pageFingerprint: templatePageFingerprint(deck, await readFile(path.join(dir, 'pages/01.page'), 'utf8')), review: { ...passed, page: 1, specFingerprint: sha(JSON.stringify(spec.slides[0])), textTranscription: [...spec.slides[0].text] } }
  const ledger: any = { schemaVersion: 2, assets: [{ assetId: 'template', role: 'template', slideNumber: 1, path: 'source.png', sha256: imageHash, sourceKind: 'generated', inputImageHashes: [] }], templateReviews: { template: evidence.review }, templateFailures: {} }
  await writeFile(path.join(cwd, 'source.png'), PNG_1PX)
  await writeFile(path.join(cwd, 'spec.json'), JSON.stringify(spec))
  await writeFile(path.join(cwd, 'assets.json'), JSON.stringify(ledger))
  const provenance = { schemaVersion: 2, mode: 'new', outputMode: mode, workspaceRoot: cwd, spec: 'spec.json', assetsManifest: 'assets.json', specificationFingerprint: sha(JSON.stringify(spec)), requiredTemplatePages: [1], templateReviews: [evidence] }
  const saveEvidence = () => writeFile(path.join(dir, 'presentation-provenance.json'), JSON.stringify(provenance))
  return { cwd, dir, evidence, provenance, saveEvidence, spec, ledger, saveLedger: () => writeFile(path.join(cwd, 'assets.json'), JSON.stringify(ledger)) }
}

async function diagnoseExport(pipeline: Awaited<ReturnType<typeof buildProjectDeck>>) {
  return assertTemplateExportReady({ metadata: JSON.parse(await readFile(path.join(pipeline.dir, 'manifest.json'), 'utf8')).metadata, workspaceRoot: path.dirname(pipeline.dir), dir: pipeline.dir, deck: pipeline.deck, pages: pipeline.pages,
    loadMedia: src => readFile(path.join(pipeline.dir, src)) })
}

describe('generated page image quality diagnostics (advisory for export)', () => {
  it('keeps previews available before review, while skipCheck cannot bypass the required image review', async () => {
    const { cwd } = await fixture()
    const built = await buildProjectDeck(cwd, 'deck')
    expect((await saveRawProjectPptx(built)).length).toBeGreaterThan(1000)
    await expect(diagnoseExport(built)).rejects.toMatchObject({ code: 'TemplateReviewRequired' })
    let tool!: ToolDef
    registerExportTool({ tools: { register: def => { tool = def } }, sessions: { get: () => ({ header: { cwd } }) } })
    expect(await tool.execute({ dir: 'deck', out: 'blocked.pptx', skipCheck: true }, { agent: { session: { id: 'test' } } }))
      .toMatchObject({ ok: true })
  })

  it.each(['image', 'editable'] as const)('allows %s export only after the exact template passes all three checks', async mode => {
    const { cwd, saveEvidence } = await fixture(mode)
    await saveEvidence()
    const saved = await saveProjectPptx(await buildProjectDeck(cwd, 'deck'))
    expect(saved.bytes.length).toBeGreaterThan(1000)
  })

  it('requires repair and a new review when text, layout or content checks fail', async () => {
    const { cwd, evidence, saveEvidence } = await fixture()
    for (const field of ['textIntegrity', 'layout', 'contentAccuracy'] as const) {
      evidence.review = { ...evidence.review, [field]: 'fail', status: 'repair-required', issues: ['Unreadable or inconsistent image content.'] }
      await saveEvidence()
      await expect(diagnoseExport(await buildProjectDeck(cwd, 'deck'))).rejects.toMatchObject({ code: 'TemplateReviewRequired' })
    }
    expect(hasPassedTemplateReview({ ...passed, issues: ['still wrong'] }, imageHash)).toBe(false)
  })

  it('rejects an old review after the image is repaired or replaced', async () => {
    const { cwd, dir, saveEvidence } = await fixture('editable')
    await saveEvidence()
    await writeFile(path.join(dir, 'media/template.png'), Buffer.concat([PNG_1PX, Buffer.from('repaired')]))
    await expect(diagnoseExport(await buildProjectDeck(cwd, 'deck'))).rejects.toMatchObject({ code: 'TemplateReviewStale' })
  })

  it('keeps an already built image snapshot tied to its own reviewed bytes after a disk replacement', async () => {
    const { cwd, dir, saveEvidence } = await fixture()
    await saveEvidence()
    const built = await buildProjectDeck(cwd, 'deck')
    const original = await saveProjectPptx(built)
    await writeFile(path.join(dir, 'media/template.png'), Buffer.concat([PNG_1PX, Buffer.from('replacement')]))
    // The immutable built snapshot still exports the old reviewed bytes. A new
    // build observes the replacement and cannot reuse the old review.
    expect((await saveProjectPptx(built)).bytes).toEqual(original.bytes)
    await expect(diagnoseExport(await buildProjectDeck(cwd, 'deck'))).rejects.toMatchObject({ code: 'TemplateReviewStale' })
  })

  it('does not require generating or reviewing the same template again after native editable text changes', async () => {
    const { cwd, dir, saveEvidence } = await fixture('editable')
    await saveEvidence()
    const pagePath = path.join(dir, 'pages/01.page'), page = parse(await readFile(pagePath, 'utf8'))
    page.elements[0].content.text = 'Updated native editable content'
    await writeFile(pagePath, stringify(page))
    expect((await saveProjectPptx(await buildProjectDeck(cwd, 'deck'))).bytes.length).toBeGreaterThan(1000)
  })

  it('rejects stale page evidence and an image-mode slide that no longer references the reviewed full-page PNG', async () => {
    const { cwd, dir, evidence, saveEvidence } = await fixture()
    await saveEvidence()
    const pagePath = path.join(dir, 'pages/01.page'), page = parse(await readFile(pagePath, 'utf8'))
    page.elements[0].bounds = [10, 10, 400, 200]
    await writeFile(pagePath, stringify(page))
    await expect(diagnoseExport(await buildProjectDeck(cwd, 'deck'))).rejects.toMatchObject({ code: 'TemplateReviewStale' })
    evidence.pageFingerprint = templatePageFingerprint(parse(await readFile(path.join(dir, 'deck.pptd'), 'utf8')), await readFile(pagePath, 'utf8'))
    await saveEvidence()
    await expect(diagnoseExport(await buildProjectDeck(cwd, 'deck'))).rejects.toMatchObject({ code: 'TemplateReviewStale' })
  })

  it('preserves independent nonmanaged PPTD exports', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'ppt-independent-')); roots.push(cwd)
    await createProject(cwd, { dir: 'independent' })
    await editProject(cwd, { dir: 'independent', ops: [{ op: 'add_page', content: { elements: [] } }] })
    expect((await saveProjectPptx(await buildProjectDeck(cwd, 'independent'))).bytes.length).toBeGreaterThan(1000)
  })

  it.each(['spec', 'slide-fingerprint', 'ledger', 'source', 'receipt-root', 'missing-root', 'missing-source-hash', 'review-transcription', 'source-escape'] as const)('blocks stale or missing %s authority even with a copied passing receipt', async change => {
    const item = await fixture(); await item.saveEvidence()
    if (change === 'spec') { item.spec.slides[0].text[0] = 'Changed fact'; await writeFile(path.join(item.cwd, 'spec.json'), JSON.stringify(item.spec)) }
    if (change === 'ledger') await writeFile(path.join(item.cwd, 'assets.json'), '{}')
    if (change === 'source') await writeFile(path.join(item.cwd, 'source.png'), Buffer.from('different source bytes'))
    if (change === 'receipt-root') { item.provenance.workspaceRoot = path.dirname(item.cwd); await item.saveEvidence() }
    if (change === 'missing-root') { delete (item.provenance as any).workspaceRoot; await item.saveEvidence() }
    if (change === 'missing-source-hash') { delete (item.provenance as any).specificationFingerprint; await item.saveEvidence() }
    if (change === 'review-transcription') { item.ledger.templateReviews.template.textTranscription = ['Wrong text']; await item.saveLedger() }
    if (change === 'slide-fingerprint') { item.spec.slides[0].text[0] = 'Changed fact'; await writeFile(path.join(item.cwd, 'spec.json'), JSON.stringify(item.spec)); item.provenance.specificationFingerprint = sha(JSON.stringify(item.spec)); await item.saveEvidence() }
    if (change === 'source-escape') { item.ledger.assets[0].path = path.join(item.cwd, '..', 'outside.png'); await item.saveLedger() }
    await expect(diagnoseExport(await buildProjectDeck(item.cwd, 'deck'))).rejects.toMatchObject({ code: 'TemplateReviewStale' })
  })

  it('requires changed generated bytes with the failed parent/input SHA chain for a replacement template', async () => {
    const item = await fixture('editable'); await item.saveEvidence()
    const failed = { ...item.evidence.review, status: 'repair-required', layout: 'fail', issues: ['The title overlaps the graph.'] }
    item.ledger.templateFailures.old = failed
    const repaired = Buffer.concat([PNG_1PX, Buffer.from('repaired template')]), repairedHash = sha(repaired)
    await writeFile(path.join(item.cwd, 'repaired.png'), repaired)
    await writeFile(path.join(item.dir, 'media/template.png'), repaired)
    item.ledger.assets.push({ assetId: 'repaired', role: 'template', slideNumber: 1, path: 'repaired.png', sha256: repairedHash, sourceKind: 'generated', parentAssetId: 'template', inputImageHashes: [imageHash] })
    const repairedReview = { ...item.evidence.review, sha256: repairedHash }
    item.ledger.templateReviews.repaired = repairedReview
    item.evidence.assetId = 'repaired'; item.evidence.assetSha256 = repairedHash; item.evidence.review = repairedReview
    await item.saveEvidence(); await item.saveLedger()
    expect((await saveProjectPptx(await buildProjectDeck(item.cwd, 'deck'))).bytes.length).toBeGreaterThan(1000)
    // A passing new-ID receipt cannot hide that the registered replacement
    // is unrelated to the failed original.
    item.ledger.assets[1].inputImageHashes = ['0'.repeat(64)]; await item.saveLedger()
    await expect(diagnoseExport(await buildProjectDeck(item.cwd, 'deck'))).rejects.toMatchObject({ code: 'TemplateReviewStale' })
  })

  it('allows direct skipCheck export after a specification edit without rebuilding', async () => {
    const item = await fixture('editable'); await item.saveEvidence()
    item.spec.slides[0].text[0] = 'Updated source fact'; await writeFile(path.join(item.cwd, 'spec.json'), JSON.stringify(item.spec))
    let tool!: ToolDef
    registerExportTool({ tools: { register: def => { tool = def } }, sessions: { get: () => ({ header: { cwd: item.cwd } }) } })
    expect(await tool.execute({ dir: 'deck', out: 'blocked.pptx', skipCheck: true }, { agent: { session: { id: 'test' } } }))
      .toMatchObject({ ok: true })
  })

  it('records shared-ledger failures while allowing HTTP binary and saved exports', async () => {
    const item = await fixture(); await item.saveEvidence()
    await createProject(item.cwd, { dir: 'other', metadata: { zeroWall: { outputMode: 'image' } } })
    await mkdir(path.join(item.cwd, 'other', 'pages'), { recursive: true })
    for (const file of ['deck.pptd', 'pages/01.page', 'media/template.png', 'presentation-provenance.json']) await copyFile(path.join(item.dir, file), path.join(item.cwd, 'other', file))
    const built = await buildProjectDeck(item.cwd, 'other')
    expect((await saveProjectPptx(built)).bytes.length).toBeGreaterThan(1000)
    item.ledger.templateFailures.alias = { ...item.evidence.review, status: 'repair-required', layout: 'fail', issues: ['Shared image layout is incorrect.'] }
    await item.saveLedger()
    // The other project's passing receipt remains unchanged; the shared ledger
    // is the current authority, including for an already built snapshot.
    await expect(diagnoseExport(built)).rejects.toMatchObject({ code: 'TemplateReviewStale' })
    const handler = createApiHandler({ resolveCwd: () => item.cwd,
      core: { loadProject, editProject, buildProjectDeck, saveProjectPptx, writeExportReport, ProjectError },
      sessionStore: { resolveProject: () => ({ dir: 'other', abs: path.join(item.cwd, 'other') }) } })
    const server = createServer((req, res) => { void handler(req, res) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Expected loopback port')
    try {
      for (const save of [false, true]) {
        const response = await fetch(`http://127.0.0.1:${address.port}${API_PREFIX}/export`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 'shared-authority', key: 'other', save, skipCheck: true }) })
        expect(response.status).toBe(200)
        if (save) expect(await response.json()).toMatchObject({ ok: true, qualityIssues: expect.arrayContaining([expect.any(String)]) })
        else expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1000)
      }
    } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
  })
})
