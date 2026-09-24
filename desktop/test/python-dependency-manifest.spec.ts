import { describe, expect, it } from 'vitest'
import { generateKeyPairSync, sign } from 'node:crypto'
import { parsePythonDependencyManifest, dependencyManifestChanges, assertManifestWheels } from '../src/main/python-dependency-manifest.js'

function fixture(packages?: any[]) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const doc: any = {
    schema: 3, runtimeId: 'zerowall-science-python', platform: 'win32-x64', pythonVersion: '3.12.10', environmentVersion: '7.0.3', revision: '12', createdAt: '2026-09-23T00:00:00.000Z',
    index: { indexUrl: 'https://mirrors.aliyun.com/pypi/simple' }, packages: [{ name: 'numpy', version: '2.3.0', required: true, capabilities: ['science'] }], compatibility: { minApplicationVersion: '7.0.0' }, signature: { algorithm: 'ed25519', keyId: 'test', value: '' },
  }
  if (packages) doc.packages = packages
  const { signature: _, ...unsigned } = doc
  doc.signature.value = sign(null, Buffer.from(JSON.stringify(unsigned)), privateKey).toString('base64')
  return { doc, key: publicKey.export({ type: 'spki', format: 'pem' }).toString() }
}

describe('shared Python dependency manifest', () => {
  it('validates signed schema 3 documents and diffs installed packages', () => {
    const { doc, key } = fixture()
    const parsed = parsePythonDependencyManifest(doc, { test: key }, '7.0.3')
    expect(parsed.runtimeId).toBe('zerowall-science-python')
    expect(dependencyManifestChanges(parsed, [{ name: 'numpy', version: '2.2.0' }])[0]?.to).toBe('2.3.0')
    expect(() => assertManifestWheels(parsed, [{ name: 'numpy', version: '2.3.0', hash: 'a'.repeat(64) }])).not.toThrow()
    // Identity is the name and the exact version. The artifact digest is not
    // part of the contract, so a wheel the mirror re-published still installs.
    expect(() => assertManifestWheels(parsed, [{ name: 'numpy', version: '2.3.0', hash: 'b'.repeat(64) }])).not.toThrow()
    expect(() => assertManifestWheels(parsed, [{ name: 'numpy', version: '2.3.0' }])).not.toThrow()
    expect(() => assertManifestWheels(parsed, [{ name: 'numpy', version: '2.4.0' }])).toThrow(/版本不一致/)
    expect(() => assertManifestWheels(parsed, [])).toThrow(/均缺少/)
    expect(() => assertManifestWheels(parsed, [], [{ name: 'numpy', version: '2.3.0' }])).not.toThrow()
    expect(() => assertManifestWheels(parsed, [], [{ name: 'numpy', version: '2.2.0' }])).toThrow(/均缺少/)
    expect(() => assertManifestWheels(parsed, [{ name: 'numpy', version: '2.3.0' }, { name: 'numpy', version: '2.3.0' }])).toThrow(/重复/)
  })

  it('rejects tampering before interpreting the package index', () => {
    const { doc, key } = fixture()
    doc.index.indexUrl = 'http://pypi.example/simple'
    expect(() => parsePythonDependencyManifest(doc, { test: key })).toThrow(/签名/)
  })

  it('rejects a digest that is present but malformed', () => {
    const { doc, key } = fixture([{ name: 'numpy', version: '2.3.0', sha256: 'not-a-digest', required: true, capabilities: [] }])
    expect(() => parsePythonDependencyManifest(doc, { test: key })).toThrow(/字段无效/)
  })

  it('binds a source-built wheel by identity and keeps its signed source digest', () => {
    const pkg = { name: 'autograd-gamma', version: '0.5.0', sha256: 'a'.repeat(64), required: true, capabilities: ['science'], source: 'sdist', filename: 'autograd-gamma-0.5.0.tar.gz' }
    const { doc, key } = fixture([pkg])
    const parsed = parsePythonDependencyManifest(doc, { test: key }, '7.0.3')
    const built = { name: 'autograd_gamma', version: '0.5.0', hash: 'b'.repeat(64), sourceArchiveSha256: pkg.sha256 }
    expect(() => assertManifestWheels(parsed, [built])).not.toThrow()
    // The built wheel's own bytes are not pinned by the manifest...
    expect(() => assertManifestWheels(parsed, [{ ...built, hash: 'c'.repeat(64) }])).not.toThrow()
    // ...but the version still is.
    expect(() => assertManifestWheels(parsed, [{ ...built, version: '0.4.0' }])).toThrow(/版本不一致/)
    expect(() => assertManifestWheels(parsed, [{ ...built, name: 'other' }])).toThrow(/版本不一致/)
  })

  it.each(['../docopt-0.6.2.tar.gz', 'C:\\temp\\docopt.tar.gz', 'docopt.whl', 'docopt.exe', 'docopt-0.6.1.tar.gz', 'other-0.6.2.tar.gz'])('rejects a signed but invalid source filename %s', filename => {
    const { doc, key } = fixture([{ name: 'docopt', version: '0.6.2', sha256: 'a'.repeat(64), required: true, capabilities: [], source: 'sdist', filename }])
    expect(() => parsePythonDependencyManifest(doc, { test: key })).toThrow(/文件名/)
  })
})
