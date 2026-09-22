import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HE_PACKAGES, LIMITS, engineProfile, hashFile, importHeEngine, rollbackHeEngine, safeArchivePath, validateManifest, verifyPackage } from '../../tools/science/science-engine-package.mjs'

const JSZip = createRequire(new URL('../../desktop/package.json', import.meta.url))('jszip')
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
async function fixture(t, mutateZip, mutateManifest) {
  const base = await mkdtemp(join(tmpdir(), 'zerowall-science-engine-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const zip = new JSZip(); const files = []; const packages = []
  for (const [name, version] of Object.entries(HE_PACKAGES)) {
    const filename = `${name.replaceAll('-', '_')}-${version}-py3-none-any.whl`
    const file = `wheels/${filename}`; const license = `licenses/${name}.txt`
    for (const [path, content, kind] of [[file, `contract fixture ${name}`, 'wheel'], [license, 'fixture license', 'license']]) {
      const bytes = Buffer.from(content)
      zip.file(path, bytes, { createFolders: false })
      files.push({ path, size: bytes.length, sha256: digest(bytes), kind })
    }
    packages.push({ name, version, file, source: `https://files.pythonhosted.org/packages/${filename}`, license: 'fixture-only', licenseFiles: [license] })
  }
  mutateZip?.(zip)
  const archivePath = join(base, 'package.zip')
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', platform: 'UNIX' })
  await writeFile(archivePath, buffer)
  const manifest = { schema: 'zerowall-science-engine/v1', engineId: 'he', engineVersion: '7.0.0', format: 'python-wheels-v1', platform: 'win32', arch: 'x64', compatibleApplications: ['7.0.0'], python: { implementation: 'cpython', version: '3.12', bundled: false }, archive: { size: buffer.length, sha256: digest(buffer) }, files, packages }
  mutateManifest?.(manifest)
  const manifestPath = join(base, 'manifest.json')
  await writeFile(manifestPath, JSON.stringify(manifest))
  return { base, manifest, options: { manifestPath, archivePath, manifestSha256: await hashFile(manifestPath), root: join(base, 'science-engines'), temporaryRoot: join(base, 'verify'), platform: 'win32', arch: 'x64' } }
}
const fakeEnvironment = async candidate => {
  await mkdir(join(candidate, 'venv', 'Scripts'), { recursive: true })
  await writeFile(join(candidate, 'venv', 'Scripts', 'python.exe'), 'contract-test engine')
  return { health: { kind: 'contract-test fixture; not a Python executable' } }
}

test('offline package verifies every real ZIP member and clears its extraction directory', async t => {
  const { options } = await fixture(t)
  const result = await verifyPackage(options)
  assert.equal(result.verified, true)
  assert.equal(result.files, 6)
  assert.deepEqual(await readdir(options.temporaryRoot), [])
})

test('manifest trust and platform are checked before installation', async t => {
  const { options, manifest } = await fixture(t)
  await assert.rejects(importHeEngine({ ...options, manifestSha256: '0'.repeat(64), createEnvironment: fakeEnvironment }), /Manifest SHA-256 mismatch/u)
  await assert.rejects(importHeEngine({ ...options, manifestSha256: undefined }), /trusted manifest SHA-256/u)
  assert.throws(() => validateManifest(manifest, 'linux', 'x64'), /platform mismatch/u)
  assert.throws(() => validateManifest({ ...manifest, python: { ...manifest.python, bundled: true } }, 'win32', 'x64'), /external CPython/u)
})

test('corrupt archive is rejected without changing active engine', async t => {
  const { options } = await fixture(t)
  await mkdir(join(options.root, 'he-7.0.0'), { recursive: true })
  await writeFile(join(options.root, 'he-7.0.0', 'old.txt'), 'old')
  const bytes = await readFile(options.archivePath); bytes[20] ^= 1
  await writeFile(options.archivePath, bytes)
  await assert.rejects(importHeEngine({ ...options, createEnvironment: fakeEnvironment }), /Archive size or SHA-256 mismatch/u)
  assert.equal(await readFile(join(options.root, 'he-7.0.0', 'old.txt'), 'utf8'), 'old')
  assert.deepEqual(await readdir(join(options.root, '.installs')), [])
})

test('individual file hashes are required even when archive hash is valid', async t => {
  const { options } = await fixture(t, undefined, manifest => { manifest.files[0].sha256 = '0'.repeat(64) })
  await assert.rejects(verifyPackage(options), /File SHA-256 mismatch/u)
})

test('ZIP traversal, absolute, alternate streams and Windows aliases are rejected', () => {
  for (const path of ['../outside', '/absolute', 'C:/outside', 'wheels\\escape', 'wheels/a:stream', 'wheels/../escape', 'wheels/CON.txt', 'wheels/a.', 'wheels/a ', 'wheels//a', './a', 'wheels/a\0']) assert.throws(() => safeArchivePath(path), /Unsafe archive path/u)
})

test('unlisted ZIP files cannot hide installation scripts', async t => {
  const { options } = await fixture(t, zip => zip.file('install.ps1', 'malicious', { createFolders: false }))
  await assert.rejects(verifyPackage(options), /Unlisted/u)
})

test('ZIP traversal is rejected by real archive reader', async t => {
  const { options } = await fixture(t, zip => zip.file('../outside.txt', 'escape', { createFolders: false }))
  await assert.rejects(verifyPackage(options), /invalid relative path|Unsafe archive path/u)
})

test('ZIP symlink is rejected even with matching name and hash', async t => {
  const { options } = await fixture(t, zip => { const path = Object.keys(zip.files)[0]; zip.files[path].unixPermissions = 0o120777 })
  await assert.rejects(verifyPackage(options), /links and special entries/u)
})

test('missing and case-colliding manifest entries are rejected', async t => {
  const missing = await fixture(t, zip => { zip.remove(Object.keys(zip.files)[0]) })
  await assert.rejects(verifyPackage(missing.options), /missing manifest files/u)
  const collision = await fixture(t, undefined, manifest => { manifest.files.push({ ...manifest.files[0], path: manifest.files[0].path.toUpperCase() }) })
  await assert.rejects(verifyPackage(collision.options), /duplicate manifest file/u)
})

test('license and unexpected package checks cannot be bypassed', async t => {
  const { manifest } = await fixture(t)
  manifest.packages[0].licenseFiles = []
  assert.throws(() => validateManifest(manifest, 'win32', 'x64'), /license/u)
  manifest.packages[0].name = 'arbitrary-installer'
  assert.throws(() => validateManifest(manifest, 'win32', 'x64'), /fixed HE profile/u)
})

test('archive and expanded-entry limits are checked before extracting a payload', async t => {
  const { manifest } = await fixture(t)
  assert.throws(() => validateManifest({ ...manifest, archive: { ...manifest.archive, size: LIMITS.archive + 1 } }, 'win32', 'x64'), /archive integrity/u)
  manifest.files[0].size = LIMITS.file + 1
  assert.throws(() => validateManifest(manifest, 'win32', 'x64'), /manifest file/u)
})

test('import uses immutable environment, preserves old installation and rolls back', async t => {
  const { options } = await fixture(t)
  await mkdir(join(options.root, 'he-7.0.0'), { recursive: true })
  await writeFile(join(options.root, 'he-7.0.0', 'old.txt'), 'old engine')
  const installed = await importHeEngine({ ...options, createEnvironment: fakeEnvironment })
  assert.equal(await readFile(installed.python, 'utf8'), 'contract-test engine')
  assert.equal(await readFile(join(options.root, '.history', installed.previous, 'old.txt'), 'utf8'), 'old engine')
  const receipt = JSON.parse(await readFile(join(options.root, 'he-7.0.0', 'install-receipt.json'), 'utf8'))
  assert.equal(receipt.manifestSha256, options.manifestSha256)
  await rollbackHeEngine(options.root)
  assert.equal(await readFile(join(options.root, 'he-7.0.0', 'old.txt'), 'utf8'), 'old engine')
  await rollbackHeEngine(options.root)
  assert.equal(await readFile(installed.python, 'utf8'), 'contract-test engine')
})

test('health failure preserves old installation and removes incomplete candidate', async t => {
  const { options } = await fixture(t)
  await mkdir(join(options.root, 'he-7.0.0'), { recursive: true })
  await writeFile(join(options.root, 'he-7.0.0', 'old.txt'), 'unchanged')
  await assert.rejects(importHeEngine({ ...options, createEnvironment: async () => { throw new Error('probe failed') } }), /probe failed/u)
  assert.equal(await readFile(join(options.root, 'he-7.0.0', 'old.txt'), 'utf8'), 'unchanged')
  assert.deepEqual(await readdir(join(options.root, '.installs')), [])
})

test('failed state activation rolls back the switched pointer', async t => {
  const { options } = await fixture(t)
  await mkdir(join(options.root, 'he-7.0.0'), { recursive: true })
  await mkdir(join(options.root, 'he-7.0.0-state.json'))
  await writeFile(join(options.root, 'he-7.0.0', 'old.txt'), 'unchanged')
  await assert.rejects(importHeEngine({ ...options, createEnvironment: fakeEnvironment }))
  assert.equal(await readFile(join(options.root, 'he-7.0.0', 'old.txt'), 'utf8'), 'unchanged')
  assert.deepEqual(await readdir(join(options.root, '.installs')), [])
})

test('Fiji and napari directories cannot be used as engine root', async t => {
  const { options, base } = await fixture(t)
  for (const name of ['fiji', 'napari']) await assert.rejects(importHeEngine({ ...options, root: join(base, name), createEnvironment: fakeEnvironment }), /dedicated science-engines/u)
})

test('concurrent installer lock fails without changing an engine', async t => {
  const { options } = await fixture(t)
  await mkdir(options.root, { recursive: true })
  await writeFile(join(options.root, '.install.lock'), 'another process')
  await assert.rejects(importHeEngine({ ...options, createEnvironment: fakeEnvironment }), /Another engine operation/u)
  assert.equal(await readFile(join(options.root, '.install.lock'), 'utf8'), 'another process')
})

function stardistManifest() {
  const profile = engineProfile('he-stardist')
  const files = []; const packages = []
  for (const [name, version] of Object.entries(profile.packages)) {
    const file = `wheels/${name.replaceAll('-', '_')}-${version}-py3-none-any.whl`
    const license = `licenses/${name}.txt`
    files.push({ path: file, kind: 'wheel', size: 1, sha256: 'a'.repeat(64) }, { path: license, kind: 'license', size: 1, sha256: 'b'.repeat(64) })
    packages.push({ name, version, file, source: `https://files.pythonhosted.org/packages/${file.split('/').at(-1)}`, license: 'fixture-only', licenseFiles: [license] })
  }
  files.push(...profile.model.files.map(file => ({ ...file, kind: 'model', size: 1 })))
  return { schema: 'zerowall-science-engine/v1', engineId: 'he-stardist', engineVersion: '7.0.0', format: 'python-wheels-v1', platform: 'win32', arch: 'x64', compatibleApplications: ['7.0.0'], python: { implementation: 'cpython', version: '3.11', bundled: false }, archive: { size: 1, sha256: 'c'.repeat(64) }, files, packages, model: structuredClone(profile.model) }
}

test('StarDist has its own fixed environment and model trust boundary', () => {
  const manifest = stardistManifest()
  assert.equal(validateManifest(manifest, 'win32', 'x64').engineId, 'he-stardist')
  assert.throws(() => validateManifest({ ...manifest, python: { ...manifest.python, version: '3.12' } }, 'win32', 'x64'), /external CPython 3.11/u)
  manifest.model.files[0].sha256 = '0'.repeat(64)
  assert.throws(() => validateManifest(manifest, 'win32', 'x64'), /Model provenance/u)
})

test('StarDist refuses omitted, changed or extra model assets and package drift', () => {
  for (const change of [
    m => { m.files = m.files.filter(f => f.path !== m.model.files[0].path) },
    m => { m.files.find(f => f.kind === 'model').sha256 = '0'.repeat(64) },
    m => { m.files.push({ path: 'model/untrusted.h5', kind: 'model', size: 1, sha256: 'a'.repeat(64) }) },
    m => { m.packages.find(p => p.name === 'numpy').version = '2.0.0' },
  ]) {
    const manifest = stardistManifest(); change(manifest)
    assert.throws(() => validateManifest(manifest, 'win32', 'x64'), /model inventory|model hash|fixed HE profile/u)
  }
})

test('larger StarDist archive limit does not loosen existing HE package limits', async t => {
  const largeSize = 400 * 1024 ** 2
  const manifest = stardistManifest(); manifest.archive.size = largeSize
  assert.equal(validateManifest(manifest, 'win32', 'x64').archive.size, largeSize)
  const old = await fixture(t); old.manifest.archive.size = largeSize
  assert.throws(() => validateManifest(old.manifest, 'win32', 'x64'), /archive integrity/u)
})
