import assert from 'node:assert/strict'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

// Run with the packaged Electron executable in ELECTRON_RUN_AS_NODE mode.
const [resources, samplesFile, outputDirectory] = process.argv.slice(2)
const output = resolve(outputDirectory)
await mkdir(output, { recursive: true })
const engine = resolve(resources, 'app.asar.unpacked/node_modules/@deepseek-ai/libreoffice-kit-win32-x64')
const manifest = JSON.parse(await readFile(resolve(engine, 'prebuilds.json'), 'utf8'))
for (const path of Object.keys(manifest.files)) await access(resolve(engine, path))
const { createConverter } = await import(pathToFileURL(resolve(resources, 'app.asar/node_modules/@deepseek-ai/libreoffice-kit/lib/index.js')).href)
const converter = await createConverter({})
const results = []
try {
  for (const sample of JSON.parse(await readFile(samplesFile, 'utf8'))) {
    const before = await readFile(sample.path)
    const pdfPath = resolve(output, sample.name + '.pdf')
    const result = await converter.render({ inputPath: sample.path, outputPath: pdfPath })
    const pdf = await readFile(pdfPath)
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
    assert.deepEqual(await readFile(sample.path), before)
    results.push({ name: sample.name, sha256: createHash('sha256').update(before).digest('hex'), pdfPath, pdfBytes: pdf.length, missingFonts: result.missingFonts })
  }
  await writeFile(resolve(output, 'office-conversion.json'), JSON.stringify({ physicalResources: Object.keys(manifest.files).length, results }, null, 2))
  console.log(JSON.stringify({ physicalResources: Object.keys(manifest.files).length, results }, null, 2))
} finally { await converter.dispose() }
