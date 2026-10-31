import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { zlibSync, unzipSync } from 'fflate'
import { getShapeText, getShapeXmlString, getSlideNotes, getSlideShapes, getSlides, loadPresentation } from '@office-kit/pptx'
import { describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'
import { buildProjectDeck, checkBuiltProject, renderPptxImages, saveProjectPptx } from '../src/core/export-pipeline.js'
import { createProject, editProject, loadProject } from '../src/core/project/store.js'
import type { ElementBase } from '../src/core/pptd/schema.js'
import { templatePageFingerprint } from '../src/core/template-review.js'

function hash(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex') }

/** Deterministic local visual fixtures; never call an image-generation API. */
function png(width: number, height: number, figure: boolean): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = y * (width * 3 + 1) + 1 + x * 3
      const bar = figure && x > 15 && x < width - 15 && y > height * (0.7 - 0.4 * x / width)
      raw.set(figure ? (bar ? [0, 145, 180] : [245, 250, 255]) : (y < 100 ? [22, 43, 76] : [235, 242, 250]), offset)
    }
  }
  const crc = (bytes: Buffer): number => {
    let value = 0xffffffff
    for (const byte of bytes) {
      value ^= byte
      for (let bit = 0; bit < 8; bit++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1
    }
    return (value ^ 0xffffffff) >>> 0
  }
  const chunk = (kind: string, data: Uint8Array): Buffer => {
    const body = Buffer.concat([Buffer.from(kind), data]), header = Buffer.alloc(4), footer = Buffer.alloc(4)
    header.writeUInt32BE(data.length); footer.writeUInt32BE(crc(body))
    return Buffer.concat([header, body, footer])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array())])
}

describe('image-only and editable export modes', () => {
  it('reopens and renders both exports, preserving original figure bytes and exact provenance notes', { timeout: 120000 }, async () => {
    const retained = process.env.PPT_VERIFY_OUTPUT
    const cwd = retained ? path.resolve(retained) : await mkdtemp(path.join(os.tmpdir(), 'ppt-export-modes-'))
    await mkdir(cwd, { recursive: true })
    const figure = png(320, 180, true), slideImage = png(960, 540, false)
    const prompt = '请原样插入已有图：Figure 2（含坐标、数值和图例）；不要重绘。\nOriginal prompt: keep α / β, 10.5%, and "source figure" exactly.'
    const source = 'fixture://project/literature/figure-2.png'
    const provenance = { prompt, source, sha256: hash(figure) }
    const evidence: unknown[] = []
    try {
      for (const mode of ['image-only', 'editable'] as const) {
        const outputMode = mode === 'image-only' ? 'image' : 'editable'
        const metadata = { mode, provenance, zeroWall: { outputMode } }
        await createProject(cwd, { dir: mode, title: `Verification ${mode}`, metadata })
        await writeFile(path.join(cwd, mode, 'media', 'original-figure.png'), figure)
        await writeFile(path.join(cwd, mode, 'media', 'slide-image.png'), slideImage)
        const original: ElementBase = { elementId: 'original-figure', elementType: 'image', bounds: mode === 'image-only' ? [640, 280, 240, 135] : [40, 405, 240, 90], src: 'media/original-figure.png', fit: { mode: 'contain' } }
        const elements: ElementBase[] = mode === 'image-only' ? [
          { elementId: 'slide-raster', elementType: 'image', bounds: [0, 0, 960, 540], src: 'media/slide-image.png' }, original
        ] : [
          { elementId: 'title', elementType: 'text', bounds: [40, 30, 880, 60], content: { text: 'Editable native objects', fontSize: 30, fontFamily: 'Arial' } },
          { elementId: 'callout', elementType: 'shape', shapeName: 'roundRect', bounds: [40, 110, 250, 80], fill: { type: 'solid', color: '#D8E9FA' } },
          { elementId: 'table', elementType: 'table', bounds: [40, 220, 360, 150], rows: [[{ text: 'Platform' }, { text: 'Score' }], [{ text: 'A' }, { text: '12' }], [{ text: 'B' }, { text: '24' }]] },
          { elementId: 'chart', elementType: 'chart', bounds: [430, 110, 480, 260], data: { cols: ['Platform', 'Score'], rows: [['A', 12], ['B', 24]] }, series: [{ type: 'bar', name: 'Score', encode: { x: 'Platform', y: 'Score' } }] },
          original
        ]
        await editProject(cwd, { dir: mode, ops: [{ op: 'add_page', page: 'pages/01.page', content: { notes: JSON.stringify(provenance), elements } }] })
        // The fixture measures object/media/render fidelity; font embedding has
        // a separate native end-to-end test, and may alter LO's font selection.
        const deckPath = path.join(cwd, mode, 'deck.pptd')
        const deck = parse(await readFile(deckPath, 'utf8')); deck.export.fontEmbed = 'off'
        await writeFile(deckPath, stringify(deck))
        const pipeline = await buildProjectDeck(cwd, mode)
        const check = await checkBuiltProject(pipeline, { withMissingFonts: false })
        expect(check.pass).toBe(true)
        expect(pipeline.buildWarnings).toEqual([])
        const unreviewed = await saveProjectPptx(pipeline)
        expect(unreviewed.bytes.length).toBeGreaterThan(1000)
        expect(pipeline.qualityIssues).toContainEqual(expect.stringContaining('presentation-provenance.json'))
        const spec = { width: 960, height: 540, fonts: {}, palette: {}, slides: [{ text: [] }] }
        const templateReview = { schemaVersion: 1, sha256: hash(slideImage), status: 'passed', textIntegrity: 'pass', layout: 'pass', contentAccuracy: 'pass', page: 1, specFingerprint: hash(Buffer.from(JSON.stringify(spec.slides[0]))), textTranscription: [],
          observations: 'Viewed the full-size local template: the intended empty text area is clear, the background is consistent and the source figure remains intact.', issues: [], reviewedAt: new Date().toISOString() }
        await writeFile(path.join(cwd, `${mode}-source.png`), slideImage)
        await writeFile(path.join(cwd, `${mode}-spec.json`), JSON.stringify(spec))
        await writeFile(path.join(cwd, `${mode}-assets.json`), JSON.stringify({ schemaVersion: 2, assets: [{ assetId: 'slide-template', role: 'template', path: `${mode}-source.png`, sha256: hash(slideImage), slideNumber: 1 }], templateReviews: { 'slide-template': templateReview } }))
        await writeFile(path.join(cwd, mode, 'presentation-provenance.json'), JSON.stringify({ schemaVersion: 2, mode: 'new', outputMode, workspaceRoot: cwd, spec: `${mode}-spec.json`, assetsManifest: `${mode}-assets.json`, specificationFingerprint: hash(Buffer.from(JSON.stringify(spec))), requiredTemplatePages: [1], templateReviews: [{
          page: 1, assetId: 'slide-template', assetSha256: hash(slideImage), mediaPath: 'media/slide-image.png', review: templateReview,
          pageFingerprint: templatePageFingerprint(deck, await readFile(path.join(cwd, mode, 'pages/01.page'), 'utf8'))
        }] }, null, 2))
        const saved = await saveProjectPptx(pipeline)
        const pptxPath = path.join(cwd, `${mode}.pptx`)
        await writeFile(pptxPath, saved.bytes)
        const reopened = await loadPresentation(new Uint8Array(await readFile(pptxPath)))
        const slides = getSlides(reopened), shapes = getSlideShapes(slides[0])
        expect(slides).toHaveLength(1)
        expect(shapes).toHaveLength(elements.length)
        expect(JSON.parse(getSlideNotes(slides[0])!)).toEqual(provenance)
        const shapeXml = shapes.map((shape) => getShapeXmlString(shape))
        if (mode === 'image-only') {
          expect(shapeXml.every((xml) => xml.includes('<p:pic'))).toBe(true)
          expect(shapes.every((shape) => !getShapeText(shape))).toBe(true)
        } else {
          expect(shapes.map((shape) => getShapeText(shape))).toContain('Editable native objects')
          expect(shapeXml.some((xml) => xml.includes('<a:tbl'))).toBe(true)
          expect(shapeXml.some((xml) => xml.includes('<c:chart'))).toBe(true)
          expect(shapeXml.some((xml) => xml.includes('<a:prstGeom prst="roundRect"'))).toBe(true)
        }
        const parts = unzipSync(saved.bytes)
        const media = Object.entries(parts).filter(([name]) => name.startsWith('ppt/media/'))
        const originalMatches = media.filter(([, bytes]) => hash(bytes) === provenance.sha256)
        expect(originalMatches).toHaveLength(1)
        expect((await loadProject(cwd, mode)).manifest.metadata).toEqual(metadata)
        const renderedAt = performance.now(), rendered = await renderPptxImages(saved.bytes, { dpi: 96 })
        try {
          expect(rendered.result.images).toHaveLength(1)
          const image = rendered.result.images[0], bytes = await readFile(image.path)
          expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          expect(bytes.readUInt32BE(16)).toBe(1280)
          expect(bytes.readUInt32BE(20)).toBe(720)
          await writeFile(path.join(cwd, `${mode}.png`), bytes)
          evidence.push({ mode, pptxPath, pptxBytes: saved.bytes.length, pptxSha256: hash(saved.bytes), shapeCount: shapes.length, originalMediaPart: originalMatches[0][0], originalSha256: provenance.sha256, exactPromptAndSourceInNotes: true, unreviewedExportAllowed: true, reviewedTemplateSha256: hash(slideImage), pngSha256: hash(bytes), renderMs: Math.round(performance.now() - renderedAt) })
        } finally { await rendered.cleanup() }
      }
      await writeFile(path.join(cwd, 'verification.json'), JSON.stringify({ provenance, exports: evidence }, null, 2))
      console.info(`[ppt-export-modes] ${JSON.stringify(evidence)}`)
    } finally { if (!retained) await rm(cwd, { recursive: true, force: true }) }
  })
})
