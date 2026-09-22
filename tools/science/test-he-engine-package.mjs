import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify, parseArgs } from 'node:util'
import { mkdir, readFile, readlink, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { importHeEngine, rollbackHeEngine, verifyPackage } from './science-engine-package.mjs'

const { values } = parseArgs({ strict: true, options: {
  manifest: { type: 'string' }, archive: { type: 'string' }, 'manifest-sha256': { type: 'string' },
  reference: { type: 'string' }, output: { type: 'string' }, python: { type: 'string', default: 'python' },
} })
if (!values.output || !values.reference || !values.manifest || !values.archive || !values['manifest-sha256']) throw new Error('Provide --output <new-directory>, --reference <create-he-reference.py TIFF>, --manifest, --archive and --manifest-sha256.')
const output = resolve(values.output)
await mkdir(output, { recursive: false })
const options = { manifestPath: resolve(values.manifest), archivePath: resolve(values.archive), manifestSha256: values['manifest-sha256'], root: join(output, 'science-engines'), temporaryRoot: join(output, 'verification'), python: values.python }
const exec = promisify(execFile)
const readReference = async executable => {
  const { stdout } = await exec(executable, ['-I', '-c', 'import json,sys,openslide; s=openslide.OpenSlide(sys.argv[1]); p=s.read_region((128,64),1,(64,32)); print(json.dumps({"levels":list(s.level_dimensions),"region":list(p.size),"pixel":list(p.getpixel((0,0))),"mppX":float(s.properties["openslide.mpp-x"]),"mppY":float(s.properties["openslide.mpp-y"])})); s.close()', resolve(values.reference)], { windowsHide: true, timeout: 30_000 })
  const result = JSON.parse(stdout)
  assert.deepEqual(result.levels, [[512, 384], [256, 192], [128, 96]])
  assert.deepEqual(result.region, [64, 32]); assert.deepEqual(result.pixel, [80, 60, 120, 255])
  assert.equal(result.mppX, 0.25); assert.equal(result.mppY, 0.5)
  return result
}
const startedAt = new Date().toISOString()
const verification = await verifyPackage(options)
const engineId = verification.engineId
const first = await importHeEngine(options)
const firstReference = await readReference(first.python)
const second = await importHeEngine(options)
assert.notEqual(first.active, second.active)
const secondReference = await readReference(second.python)
const corruptPath = join(output, 'corrupt-package.zip')
const corrupt = await readFile(options.archivePath); corrupt[20] ^= 1
await writeFile(corruptPath, corrupt)
let corruptRejected = false
try { await importHeEngine({ ...options, archivePath: corruptPath }) } catch (error) {
  assert.match(error.message, /Archive size or SHA-256 mismatch/u); corruptRejected = true
}
assert.equal(corruptRejected, true)
assert.equal(basename(await readlink(join(options.root, `${engineId}-7.0.0`))), second.active)
const rollback = await rollbackHeEngine(options.root, engineId)
const restoredReference = await readReference(rollback.python)
assert.equal(basename(await readlink(join(options.root, `${engineId}-7.0.0`))), first.active)
const report = { status: 'passed', purpose: 'Offline HE software engine import and synthetic TIFF reference; no medical claim.', startedAt, completedAt: new Date().toISOString(), manifestSha256: options.manifestSha256, verification, first, second, firstReference, secondReference, corruptRejected, rollback, restoredReference, externalPythonRequired: true, releaseSignatureVerified: false }
const reportPath = join(output, 'report.json')
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ status: report.status, reportPath, manifestSha256: report.manifestSha256, corruptRejected }, null, 2))
