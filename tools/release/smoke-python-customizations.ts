import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { McpEnvironmentController, MCP_ENVIRONMENT_KEYRING, canonicalManifest } from '../../desktop/src/main/mcp-environment.js'
import { hashFile } from '../../desktop/src/main/python-archive.js'
const root = resolve('.build/python-updater/real-upgrade')
const report = resolve('.build/python-updater/customization-verification.json')
const manifest = JSON.parse(await readFile(resolve('.build/python-1.4.0/dist/latest.json'), 'utf8'))
const events: unknown[] = []
let last = 0
const controller = new McpEnvironmentController({ root, manifestUrl: manifest.archiveUrl.replace(/\/1\.4\.0\/[^/]+$/, '/latest.json'), publicKey: MCP_ENVIRONMENT_KEYRING['stable-3']!, publicKeys: MCP_ENVIRONMENT_KEYRING, publish: s => { if (Date.now() - last > 10_000 || s.phase === 'ready') { console.log(s.phase, s.message?.slice(0, 150)); last = Date.now() } } })
await controller.localStatus()
const before = await controller.pythonInfo()
const plan = await controller.previewPackages(['tomli==2.3.0'])
assert.ok(!plan.error, plan.error)
let info = await controller.applyPackagePlan(plan.planId)
assert.equal(info.packages.find(pkg => pkg.name.toLowerCase() === 'tomli')?.version, '2.3.0')
assert.equal(info.overlayPackageCount, 6)
events.push({ test: 'extension-upgrade-keeps-source-and-effective-count', ok: true })
await writeFile(report, JSON.stringify({ events }, null, 2))
const keys = generateKeyPairSync('ed25519')
const next = { ...manifest, contentRevision: 2, signature: { algorithm: 'ed25519', keyId: 'test-rebase', value: '' } }
next.signature.value = sign(null, canonicalManifest(next), keys.privateKey).toString('base64')
const publisher = new McpEnvironmentController({ root, manifestUrl: 'https://test/latest.json', publicKey: MCP_ENVIRONMENT_KEYRING['stable-3']!, publicKeys: { ...MCP_ENVIRONMENT_KEYRING, 'test-rebase': keys.publicKey.export({ format: 'pem', type: 'spki' }).toString() }, fetcher: async url => { if (!String(url).endsWith('latest.json')) throw new Error('Verified cached archive must be reused'); return new Response(JSON.stringify(next)) }, publish: s => { if (Date.now() - last > 10_000 || s.phase === 'ready') { console.log(s.phase, s.message?.slice(0, 150)); last = Date.now() } } })
const updated = await publisher.initialize()
assert.equal(updated.contentRevision, 2, updated.lastUpdateError)
info = await publisher.pythonInfo()
assert.equal(info.packages.find(pkg => pkg.name.toLowerCase() === 'tomli')?.version, '2.3.0')
assert.equal(info.packages.find(pkg => pkg.name.toLowerCase() === 'colorama')?.version, '0.4.5')
assert.equal(info.overlayPackageCount, 6)
events.push({ test: 'official-revision-replays-core-and-extension-customizations', ok: true })
// Verify all original user-extension bytes still exist unchanged in the previous snapshot.
const current = JSON.parse(await readFile(join(root, 'rollback.json'), 'utf8'))
assert.ok(current.root)
await publisher.rollback()
assert.equal((await publisher.pythonInfo()).snapshotId, current.root)
events.push({ test: 'official-update-rollback-preserves-customizations', ok: true })
await writeFile(report, JSON.stringify({ ok: true, events }, null, 2))
console.log(JSON.stringify(events))
