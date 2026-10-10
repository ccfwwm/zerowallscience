import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { root, verificationRoot } from '../build/paths.mjs'
const require = createRequire(join(root, 'desktop/package.json'))
const JSZip = require('jszip'), PptxGenJS = require('pptxgenjs')
const { PDFDocument, StandardFonts } = require('pdf-lib')
const output = join(verificationRoot, 'functional-samples')
await mkdir(output, { recursive: true })
const samples = []
const save = async (name, bytes, metadata = {}) => {
  const path = join(output, name)
  await writeFile(path, bytes)
  samples.push({ name, path, ...metadata })
}
const xml = text => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + text
const relationships = (type, target) => xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/></Relationships>`)
const doc = new JSZip()
doc.file('[Content_Types].xml', xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'))
doc.file('_rels/.rels', relationships('officeDocument', 'word/document.xml'))
doc.file('word/document.xml', xml('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>ZeroWall Office conversion and preview 8.1.0</w:t></w:r></w:p><w:p><w:r><w:t>科研文档离线验收</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>'))
await save('sample.docx', await doc.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), { expectedText: 'ZeroWall Office' })
const book = new JSZip()
book.file('[Content_Types].xml', xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'))
book.file('_rels/.rels', relationships('officeDocument', 'xl/workbook.xml'))
book.file('xl/workbook.xml', xml('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet3" sheetId="1" r:id="rId1"/></sheets></workbook>'))
book.file('xl/_rels/workbook.xml.rels', relationships('worksheet', 'worksheets/sheet1.xml'))
const rows = Array.from({ length: 13 }, (_, row) => `<row r="${row + 1}">${Array.from({ length: row === 12 ? 5 : 14 }, (_, col) => `<c r="${String.fromCharCode(65 + col)}${row + 1}"><v>${row * 14 + col + 1}</v></c>`).join('')}</row>`).join('')
book.file('xl/worksheets/sheet1.xml', xml(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:N13"/><sheetData>${rows}</sheetData></worksheet>`))
await save('sample.xlsx', await book.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), { minRows: 13, minColumns: 14 })
const deck = new PptxGenJS()
deck.layout = 'LAYOUT_WIDE'
for (const title of Array.from({ length: 12 }, (_, index) => `ZeroWall Science Office 8.1.0 - ${index + 1}`)) {
  const slide = deck.addSlide()
  slide.addShape(deck.ShapeType.rect, { x: 0.5, y: 1.6, w: 4, h: 2.2, fill: { color: '2563EB' } })
  slide.addText(title, { x: 0.6, y: 0.4, w: 12, h: 0.8, fontSize: 30 })
  slide.addText('Preserve shapes, text and the original file.', { x: 5, y: 2, w: 7, h: 1, fontSize: 22 })
}
await save('sample.pptx', await deck.write({ outputType: 'nodebuffer' }), { minSlides: 12 })
const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica)
pdf.addPage([600, 800]).drawText('Offline PDF worker and zoom verification 8.1.0', { x: 40, y: 720, size: 18, font })
await save('offline-worker.pdf', await pdf.save(), { expectedText: 'Offline PDF worker' })
await save('ethanol.sdf', Buffer.from('Ethanol\nZeroWall\n\n  3  2  0  0  0  0            999 V2000\n    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n    2.5000    1.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  1  0  0  0  0\n  2  3  1  0  0  0  0\nM  END\n$$$$\n'))
await save('offline-map.geojson', Buffer.from(JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'Offline polygon' }, geometry: { type: 'Polygon', coordinates: [[[116, 39], [117, 39], [117, 40], [116, 40], [116, 39]]] } }] })))
await writeFile(join(output, 'samples.json'), JSON.stringify(samples, null, 2))
await writeFile(join(output, 'route-samples.json'), JSON.stringify(samples.filter(sample => !sample.name.endsWith('.sdf')), null, 2))
await writeFile(join(output, 'office-samples.json'), JSON.stringify(samples.filter(sample => /\.(?:docx|xlsx|pptx)$/u.test(sample.name)), null, 2))
console.log(`Prepared ${samples.length} synthetic functional samples: ${output}`)
