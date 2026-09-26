import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import {
  assertCompletePartition,
  applySourceDistributions,
  canonicalDocument,
  packageForModule,
  parseDirectRequirements,
  parseLockedPackages,
  partitionLock,
  scienceManifestDocument,
  scienceManifestName,
  signDocument,
  verifyDocument,
} from './python-layer-split.mjs'

const hash = letter => letter.repeat(64)
const LOCK = [
  '# synthetic lock',
  'anyio==4.15.1 --hash=sha256:' + hash('a'),
  'idna==3.19 --hash=sha256:' + hash('b'),
  'mcp==1.30.0 --hash=sha256:' + hash('c'),
  'numpy==2.5.3 --hash=sha256:' + hash('d'),
  'pandas==3.0.5 --hash=sha256:' + hash('e'),
  'torch==2.9.0 --hash=sha256:' + hash('f'),
  'Foo_Bar==1.0 --hash=sha256:' + hash('0'),
  'broken-without-hash==1.0',
].join('\n')

test('lock parsing keeps only hash-verified lines and normalises names', () => {
  const packages = parseLockedPackages(LOCK)
  assert.equal(packages.size, 7)
  assert.deepEqual(packages.get('foo-bar'), { name: 'Foo_Bar', version: '1.0', sha256: hash('0') })
  assert.equal(packages.has('broken-without-hash'), false)
})

test('direct requirements skip comments, blanks and nested includes', () => {
  const text = '# base profile\nmcp>=1.13,<2\n\n-r requirements-science.txt\npython-dotenv>=1.0,<2\n'
  assert.deepEqual(parseDirectRequirements(text), ['mcp', 'python-dotenv'])
})

test('source artifacts must match the upstream source lock and retain signed sdist identity', () => {
  const packages = new Map([['example', { name: 'example', version: '1.0', sha256: hash('a') }]])
  const sources = [{ name: 'example', version: '1.0', filename: 'example-1.0.tar.gz', sha256: hash('b') }]
  const sourceLock = 'example==1.0 \\\n    --hash=sha256:' + hash('b')
  const applied = applySourceDistributions(packages, sourceLock, sources)
  assert.equal(applied.get('example').sha256, hash('b'))
  assert.equal(packages.get('example').sha256, hash('a'))
  const document = scienceManifestDocument({ environmentVersion: '3.12.10', scienceRevision: 2, pythonVersion: '3.12.10', applicationVersion: '7.1.0', index: { indexUrl: 'https://example.org/simple' }, packages: [...applied.values()], keyId: 'test' })
  assert.equal(document.packages[0].source, 'sdist')
  assert.equal(document.packages[0].filename, 'example-1.0.tar.gz')
  assert.equal(document.compatibility.minApplicationVersion, '7.1.0')
  for (const changed of [{ ...sources[0], sha256: hash('c') }, { ...sources[0], version: '2.0' }, { ...sources[0], filename: '../example-1.0.tar.gz' }]) {
    assert.throws(() => applySourceDistributions(packages, sourceLock, [changed]), /upstream lock/)
  }
  assert.throws(() => applySourceDistributions(packages, sourceLock, [...sources, ...sources]), /upstream lock/)
})

test('base is the closure of the roots and science is the remainder', () => {
  const packages = parseLockedPackages(LOCK)
  const edges = new Map([
    ['mcp', ['anyio', 'idna']],
    ['anyio', ['idna']],
    ['pandas', ['numpy']],
  ])
  const split = partitionLock({ packages, edges, roots: ['mcp', 'pandas'] })
  assert.deepEqual(split.base.map(pkg => pkg.name), ['anyio', 'idna', 'mcp', 'numpy', 'pandas'])
  assert.deepEqual(split.science.map(pkg => pkg.name), ['Foo_Bar', 'torch'])
  assertCompletePartition({ packages, ...split })
})

test('missing roots and transitive gaps are reported separately, not silently dropped', () => {
  const packages = parseLockedPackages(LOCK)
  const edges = new Map([['mcp', ['not-available-anywhere']]])
  const split = partitionLock({ packages, edges, roots: ['mcp', 'wheel'] })
  assert.deepEqual(split.rootsNotInLock, ['wheel'])
  assert.deepEqual(split.closureNotInLock, ['not-available-anywhere'])
  assertCompletePartition({ packages, ...split })
})

test('an incomplete partition is rejected', () => {
  const packages = parseLockedPackages(LOCK)
  // No edges and a single root: base is exactly one entry, so the six remaining
  // names are the science layer of a complete partition.
  const split = partitionLock({ packages, edges: new Map(), roots: ['mcp'] })
  assert.deepEqual(split.base.map(pkg => pkg.name), ['mcp'])
  const scienceOf = names => names.map(name => packages.get(name))
  assert.throws(() => assertCompletePartition({ packages, base: split.base, science: [] }), /does not cover the lock exactly/)
  // Each rejection below keeps the counts balanced so the intended guard fires.
  assert.throws(() => assertCompletePartition({ packages, base: split.base, science: [...scienceOf(['anyio', 'idna', 'numpy', 'pandas', 'torch']), { name: 'ghost', version: '1', sha256: hash('9') }] }), /invented a package/)
  assert.throws(() => assertCompletePartition({ packages, base: [...split.base, ...scienceOf(['mcp'])], science: scienceOf(['anyio', 'idna', 'numpy', 'pandas', 'torch']) }), /duplicate package names/)
})

test('import aliases map a module to its distribution', () => {
  const aliases = { cv2: 'opencv-python-headless', skimage: 'scikit-image', markdown: 'Markdown' }
  assert.equal(packageForModule('cv2', aliases), 'opencv-python-headless')
  assert.equal(packageForModule('markdown', aliases), 'markdown')
  assert.equal(packageForModule('pyzotero', aliases), 'pyzotero')
})

test('science manifest names and signatures round-trip', () => {
  const name = scienceManifestName({ environmentVersion: '1.4.0', scienceRevision: 3 })
  assert.equal(name, 'manifest-1.4.0-r3.json')
  const document = scienceManifestDocument({
    environmentVersion: '1.4.0', scienceRevision: 3, pythonVersion: '3.12.10',
    index: { indexUrl: 'https://pypi.tuna.tsinghua.edu.cn/simple', trustedHost: 'pypi.tuna.tsinghua.edu.cn' },
    basePackageCount: 47, keyId: 'stable-3', generatedAt: '2026-01-01T00:00:00.000Z',
    packages: [{ name: 'torch', version: '2.9.0', sha256: hash('f') }],
  })
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  signDocument(document, privateKey, publicKey.export({ type: 'spki', format: 'pem' }).toString())
  assert.ok(verifyDocument(document, publicKey.export({ type: 'spki', format: 'pem' }).toString()))
  // The signature must cover every other field, not a re-encoded subset.
  assert.equal(JSON.parse(canonicalDocument(document).toString()).packages.length, 1)
  const tampered = { ...document, packageCount: 2 }
  assert.equal(verifyDocument(tampered, publicKey.export({ type: 'spki', format: 'pem' }).toString()), false)
})
