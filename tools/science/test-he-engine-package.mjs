import assert from 'node:assert/strict'
import { parseArgs } from 'node:util'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { importHeEngine, verifyPackage } from './science-engine-package.mjs'

const { values } = parseArgs({ strict: true, options: {
  manifest: { type: 'string' }, archive: { type: 'string' }, 'manifest-sha256': { type: 'string' }, output: { type: 'string' },
} })
if (!values.output || !values.manifest || !values.archive || !values['manifest-sha256']) throw new Error('Provide --output <new-directory>, --manifest, --archive and --manifest-sha256.')
const output = resolve(values.output)
await mkdir(output, { recursive: false })
const options = { manifestPath: resolve(values.manifest), archivePath: resolve(values.archive), manifestSha256: values['manifest-sha256'], root: join(output, 'models'), temporaryRoot: join(output, 'verification'), platform: 'win32', arch: 'x64' }
const startedAt = new Date().toISOString()
const verification = await verifyPackage(options)
assert.equal(verification.pythonBundled, false)
assert.equal(verification.sharedPython, 'Python/python.exe')
const first = await importHeEngine(options)
const receipt = JSON.parse(await readFile(join(first.modelRoot, 'install-receipt.json'), 'utf8'))
assert.equal(receipt.sharedPython, 'Python/python.exe')
const before = await readFile(join(first.modelRoot, 'install-receipt.json'), 'utf8')
const second = await importHeEngine(options)
assert.equal(second.modelRoot, first.modelRoot)
assert.equal(await readFile(join(second.modelRoot, 'install-receipt.json'), 'utf8'), before)
const corruptPath = join(output, 'corrupt-package.zip')
const corrupt = await readFile(options.archivePath); corrupt[20] ^= 1
await writeFile(corruptPath, corrupt)
let corruptRejected = false
try { await importHeEngine({ ...options, archivePath: corruptPath }) } catch (error) {
  assert.match(error.message, /Archive size or SHA-256 mismatch/u); corruptRejected = true
}
assert.equal(corruptRejected, true)
const report = { status: 'passed', purpose: 'Shared-Python model package import and integrity checks; no private Python environment.', startedAt, completedAt: new Date().toISOString(), manifestSha256: options.manifestSha256, verification, first, second, corruptRejected, pythonBundled: false, sharedPython: 'Python/python.exe', archive: basename(options.archivePath) }
const reportPath = join(output, 'report.json')
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ status: report.status, reportPath, manifestSha256: report.manifestSha256, corruptRejected, sharedPython: report.sharedPython }, null, 2))
