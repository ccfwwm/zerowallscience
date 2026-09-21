import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { parseAb1 } from '../../plugins/research/src/shared/sanger.js'

// Reference JSON is produced independently by Biopython, never by the TS parser.
const root = resolve(process.argv[2] ?? '.build/sanger-reference')
const names = ['310.ab1', '3100.ab1', '3730.ab1', 'A6_1-DB3.ab1', 'no_smpl1.ab1', 'nonascii_encoding.ab1']
const results = []
for (const name of names) {
  const bytes = await readFile(join(root, name))
  const reference = JSON.parse(await readFile(join(root, name + '.reference.json'), 'utf8'))
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  assert.equal(sha256, reference.sha256)
  const trace = parseAb1(bytes, sha256)
  assert.equal(trace.bases.map(base => base.base).join(''), String(reference.sequence).toUpperCase())
  assert.deepEqual(trace.bases.map(base => base.phred), reference.phred)
  assert.deepEqual(trace.bases.map(base => base.peak), reference.peaks)
  assert.deepEqual(trace.channels, reference.channels)
  for (const base of trace.bases) assert.equal(base.quality, 1 - 10 ** (-base.phred! / 10))
  results.push({ name, sha256, source: reference.source, sampleCount: trace.sampleCount, baseCount: trace.bases.length, passed: true })
}
await mkdir(root, { recursive: true })
await writeFile(join(root, 'report.json'), JSON.stringify({ checkedAt: new Date().toISOString(), reference: 'Biopython 1.88 AbiIO', scope: 'all processed channel samples, called bases, peak positions, stored Phred Q and confidence conversion', results }, null, 2))
console.log(JSON.stringify(results, null, 2))
