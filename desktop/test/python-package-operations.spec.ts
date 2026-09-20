import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { generateKeyPairSync, sign } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { expect, it } from 'vitest'
import { canonicalManifest, McpEnvironmentController } from '../src/main/mcp-environment.js'
import { replayCustomizations } from '../src/main/python-packages.js'

// Opt-in network integration, using a small copy of the installed interpreter.
// The user's current pointer and packages are never mutated.
it.skipIf(!process.env.ZEROWALL_TEST_PYTHON_SNAPSHOT)('previews, installs, uninstalls, replays removals and rolls back safely on real Python', async () => {
  const source = process.env.ZEROWALL_TEST_PYTHON_SNAPSHOT!
  const root = await mkdtemp(join(tmpdir(), 'zerowall-package-operations-'))
  try {
    const slot = join(root, 'slots', 'a')
    const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'))
    const pythonDirectory = dirname(manifest.python.relativeExecutable)
    await mkdir(join(slot, pythonDirectory), { recursive: true })
    for (const entry of await readdir(join(source, pythonDirectory), { withFileTypes: true })) {
      if (!entry.isDirectory()) await cp(join(source, pythonDirectory, entry.name), join(slot, pythonDirectory, entry.name))
    }
    const site = join(slot, manifest.python.relativeSitePackages)
    await mkdir(site, { recursive: true })
    for (const entry of await readdir(join(source, manifest.python.relativeSitePackages))) {
      if (/^(pip|packaging)(?:$|-)/u.test(entry)) await cp(join(source, manifest.python.relativeSitePackages, entry), join(site, entry), { recursive: true })
    }
    for (const entry of await readdir(join(slot, pythonDirectory))) if (entry.endsWith('._pth')) await writeFile(join(slot, pythonDirectory, entry), `python312.zip\n.\n${relative(join(slot, pythonDirectory), site)}\nimport site\n`)
    for (const path of ['bio-tools/run_server.py', 'ketcher-chemistry/server.js', manifest.sci.cli, manifest.sci.mcp]) { await mkdir(dirname(join(slot, path)), { recursive: true }); await writeFile(join(slot, path), '') }
    await mkdir(join(slot, manifest.skillsRoot), { recursive: true })
    manifest.python.modules = ['pip', 'packaging']; manifest.pythonHealth.imports = ['pip', 'packaging']; manifest.dependencies = { ...manifest.dependencies, corePackages: [] }
    const keys = generateKeyPairSync('ed25519')
    manifest.signature.keyId = 'stable-1'
    manifest.signature.value = sign(null, canonicalManifest(manifest), keys.privateKey).toString('base64')
    await writeFile(join(slot, 'manifest.json'), JSON.stringify(manifest))
    await writeFile(join(root, 'current.json'), JSON.stringify({ root: slot, health: 'ready', slot: 'a', manifest }))
    let failHealth = false
    const controller = new McpEnvironmentController({ root, manifestUrl: 'https://fixture.invalid', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(), publish() {}, healthCheck: async () => { if (failHealth) throw new Error('injected failure') } })
    const initial = await controller.pythonInfo()
    expect(initial.version, JSON.stringify(initial)).toBe('3.12.10')
    const plan = await controller.previewPackages(['six==1.17.0'])
    expect(plan.error).toBeUndefined(); expect(plan.changes).toContainEqual(expect.objectContaining({ name: 'six', to: '1.17.0' }))
    expect((await controller.pythonInfo()).packages.some(p => p.name === 'six')).toBe(false)
    const installed = await controller.applyPackagePlan(plan.planId)
    expect(installed.packages.find(p => p.name === 'six')?.version).toBe('1.17.0')
    await expect(controller.previewUninstall(['pip'])).rejects.toThrow('必需依赖')
    const uninstall = await controller.previewUninstall(['six'])
    failHealth = true
    await expect(controller.applyPackagePlan(uninstall.planId)).rejects.toThrow('injected failure')
    expect((await controller.pythonInfo()).snapshotId).toBe(installed.snapshotId)
    failHealth = false
    const removed = await controller.applyPackagePlan(uninstall.planId)
    expect(removed.packages.some(p => p.name === 'six')).toBe(false)
    const pointer = JSON.parse(await readFile(join(root, 'current.json'), 'utf8'))
    expect(pointer.removedPackages).toContain('six')
    const replay = join(root, 'slots', 'replay')
    await cp(installed.snapshotId!, replay, { recursive: true })
    await replayCustomizations(replay, manifest, join(replay, 'user-overlay'), {}, ['six'])
    expect((await readdir(join(replay, manifest.python.relativeSitePackages))).some(name => name.startsWith('six-'))).toBe(false)
    await expect(controller.applyPackagePlan(plan.planId)).rejects.toThrow('环境已变化')
    await controller.rollback()
    expect((await controller.pythonInfo()).packages.find(p => p.name === 'six')?.version).toBe('1.17.0')
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 3 }) }
}, 180_000)
