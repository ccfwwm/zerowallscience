import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HE_PACKAGES, LIMITS, engineProfile, hashFile, importHeEngine, safeArchivePath, validateManifest, verifyPackage } from '../../tools/science/science-engine-package.mjs'

const JSZip = createRequire(new URL('../../desktop/package.json', import.meta.url))('jszip')
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

async function fixture(t, mutateZip, mutateManifest) {
  const base = await mkdtemp(join(tmpdir(), 'zerowall-science-engine-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const zip = new JSZip()
  const bytes = Buffer.from('shared model provenance fixture')
  const files = [{ path: 'provenance/he-shared-python.json', kind: 'provenance', size: bytes.length, sha256: digest(bytes) }]
  zip.file(files[0].path, bytes, { createFolders: false })
  mutateZip?.(zip)
  const archivePath = join(base, 'package.zip')
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', platform: 'UNIX' })
  await writeFile(archivePath, buffer)
  const manifest = {
    schema: 'zerowall-science-engine/v1', engineId: 'he', engineVersion: '7.1.0', format: 'shared-python-model-v1',
    platform: 'win32', arch: 'x64', compatibleApplications: ['7.1.0'],
    python: { implementation: 'cpython', version: '3.12', bundled: false, relativeExecutable: 'Python/python.exe', relativeSitePackages: 'Python/Lib/site-packages' },
    archive: { size: buffer.length, sha256: digest(buffer) }, files,
    packages: Object.entries(HE_PACKAGES).map(([name, version]) => ({ name, version, source: 'signed-shared-dependency-manifest' })),
  }
  mutateManifest?.(manifest)
  const manifestPath = join(base, 'manifest.json')
  await writeFile(manifestPath, JSON.stringify(manifest))
  return { base, manifest, options: { manifestPath, archivePath, manifestSha256: await hashFile(manifestPath), root: join(base, 'models'), temporaryRoot: join(base, 'verify'), platform: 'win32', arch: 'x64' } }
}

test('shared engine package verifies every ZIP member and clears extraction directory', async t => {
  const { options } = await fixture(t)
  const result = await verifyPackage(options)
  assert.deepEqual(result, { verified: true, files: 1, engineId: 'he', version: '7.1.0', pythonBundled: false, sharedPython: 'Python/python.exe' })
  assert.deepEqual(await readdir(options.temporaryRoot), [])
})

test('manifest trust, platform, and shared layout are checked before installation', async t => {
  const { options, manifest } = await fixture(t)
  await assert.rejects(importHeEngine({ ...options, manifestSha256: '0'.repeat(64) }), /Manifest SHA-256 mismatch/u)
  await assert.rejects(importHeEngine({ ...options, manifestSha256: undefined }), /trusted manifest SHA-256/u)
  assert.throws(() => validateManifest(manifest, 'linux', 'x64'), /platform mismatch/u)
  assert.throws(() => validateManifest({ ...manifest, python: { ...manifest.python, bundled: true } }, 'win32', 'x64'), /shared CPython/u)
  assert.throws(() => validateManifest({ ...manifest, python: { ...manifest.python, relativeExecutable: 'venv/Scripts/python.exe' } }, 'win32', 'x64'), /ZeroWall Python layout/u)
})

test('corrupt archive is rejected without changing the shared model directory', async t => {
  const { options } = await fixture(t)
  const installed = await importHeEngine(options)
  const before = await readFile(join(installed.modelRoot, 'provenance/he-shared-python.json'), 'utf8')
  const bytes = await readFile(options.archivePath); bytes[20] ^= 1
  await writeFile(options.archivePath, bytes)
  await assert.rejects(importHeEngine(options), /Archive size or SHA-256 mismatch/u)
  assert.equal(await readFile(join(installed.modelRoot, 'provenance/he-shared-python.json'), 'utf8'), before)
})

test('individual file hashes, traversal, and unlisted files are rejected', async t => {
  const badHash = await fixture(t, undefined, manifest => { manifest.files[0].sha256 = '0'.repeat(64) })
  await assert.rejects(verifyPackage(badHash.options), /File SHA-256 mismatch/u)
  for (const path of ['../outside', '/absolute', 'C:/outside', 'wheels\\escape', 'wheels/a:stream', 'wheels/../escape', 'wheels/CON.txt', 'wheels/a.', 'wheels/a ', 'wheels//a', './a', 'wheels/a\0']) assert.throws(() => safeArchivePath(path), /Unsafe archive path/u)
  const extra = await fixture(t, zip => zip.file('install.ps1', 'unexpected', { createFolders: false }))
  await assert.rejects(verifyPackage(extra.options), /Unlisted/u)
})

test('installation stores only model/provenance data and leaves Python to the shared runtime', async t => {
  const { options } = await fixture(t)
  const installed = await importHeEngine(options)
  assert.equal(installed.sharedPython, 'Python/python.exe')
  assert.equal(installed.modelRoot, options.root)
  assert.deepEqual(await readdir(options.root), ['install-receipt.json', 'provenance'])
  assert.equal(JSON.parse(await readFile(join(options.root, 'install-receipt.json'), 'utf8')).sharedPython, 'Python/python.exe')
  assert.ok(!JSON.stringify(installed).match(/venv|site-packages|wheels/iu))
})

test('StarDist remains a model trust boundary but uses the shared Python version', () => {
  const profile = engineProfile('he-stardist')
  assert.equal(profile.pythonVersion, '3.12')
  assert.equal(Object.keys(profile.packages).length, profile.requiredPackages.length)
  assert.throws(() => validateManifest({
    schema: 'zerowall-science-engine/v1', engineId: 'he-stardist', engineVersion: '7.1.0', format: 'shared-python-model-v1', platform: 'win32', arch: 'x64', compatibleApplications: ['7.1.0'],
    python: { implementation: 'cpython', version: '3.11', bundled: false, relativeExecutable: 'Python/python.exe', relativeSitePackages: 'Python/Lib/site-packages' }, archive: { size: 1, sha256: 'c'.repeat(64) }, files: [], packages: [], model: structuredClone(profile.model),
  }, 'win32', 'x64'), /shared CPython 3.12/u)
})

test('HE archive limit remains bounded', async t => {
  const { manifest } = await fixture(t)
  assert.throws(() => validateManifest({ ...manifest, archive: { ...manifest.archive, size: LIMITS.archive + 1 } }, 'win32', 'x64'), /archive integrity/u)
})
