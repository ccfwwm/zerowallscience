import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, createHash } from 'node:crypto'
import { createBootstrapManifest, verifyBootstrapManifest } from './python-bootstrap-manifest.mjs'

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const publicPem = publicKey.export({ format: 'pem', type: 'spki' }).toString()
const corePackages = Array.from({ length: 42 }, (_, index) => ({ name: `core-${index}`, version: '1.0.0', required: true }))
corePackages[20] = { name: 'pip', version: '26.2.1', required: true }
const coreManifest = { schema: 3, runtimeId: 'zerowall-science-python', platform: 'win32-x64', layer: 'core', packages: corePackages, index: { indexUrl: 'https://pypi.example/simple' } }
const template = {
  pipVersion: '26.2.1', pythonVersion: '3.12.10',
  python: { relativeExecutable: 'Python/python.exe', relativeSitePackages: 'Python/Lib/site-packages', layers: ['base', 'science'], dependencyManifests: ['core.json'] },
  pythonHealth: { bioServer: 'bio-tools/run_server.py mcp_bio', ketcherServer: 'ketcher-chemistry/server.js' },
  sci: { version: '1.0.0', nodeMinimum: '20.3.0', cli: 'sci/cli.mjs', mcp: 'sci/mcp.cjs' },
  mcp: { publicToolCount: 8, internalToolCount: 247, sciMasterVersion: '1.0.0', servers: ['bio'] },
  publicKey: publicPem,
}

test('bootstrap manifest signs a pip-only archive and records the separate 42-package layer', () => {
  const manifest = createBootstrapManifest({
    applicationVersion: '8.0.5', environmentVersion: '1.5.1', baseUrl: 'https://example.test/python',
    archiveName: 'bootstrap.zip', archiveSize: 17, archiveSha256: createHash('sha256').update('archive').digest('hex'),
    coreManifest, template, keyId: 'stable-3', privateKey,
  })
  assert.equal(manifest.python.bootstrapOnly, true)
  assert.deepEqual(manifest.python.modules, ['pip'])
  assert.equal(manifest.dependencies.corePackages.length, 42)
  assert.equal(manifest.updatePolicy.required, false)
  assert.equal(manifest.archiveUrl, 'https://example.test/python/1.5.1/bootstrap.zip')
  assert.equal(verifyBootstrapManifest(manifest, publicPem), true)
  manifest.python.bootstrapOnly = false
  assert.equal(verifyBootstrapManifest(manifest, publicPem), false)
})

test('bootstrap builder rejects a changed core package contract', () => {
  assert.throws(() => createBootstrapManifest({
    applicationVersion: '8.0.5', environmentVersion: '1.5.1', baseUrl: 'https://example.test/python',
    archiveName: 'bootstrap.zip', archiveSize: 17, archiveSha256: 'a'.repeat(64),
    coreManifest: { ...coreManifest, packages: corePackages.slice(1) }, template, keyId: 'stable-3', privateKey,
  }), /exactly 42/)
})
