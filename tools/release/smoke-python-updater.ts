import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { cp, mkdir, readFile, writeFile, link, stat, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { McpEnvironmentController, MCP_ENVIRONMENT_KEYRING } from '../../desktop/src/main/mcp-environment.js'
const work = resolve('.build/python-updater')
const root = join(work, 'real-upgrade'); await mkdir(root, { recursive: true })
const userRoot = join(process.env.APPDATA!, 'zerowall-science', 'zerowall-python')
const previous = JSON.parse(await readFile(resolve('.build/python-1.4.0/client-pointer-rollback/current.json'), 'utf8'))
const next = JSON.parse(await readFile(resolve('.build/python-1.4.0/dist/latest.json'), 'utf8'))
const resumePackages = process.argv.includes('--resume-packages')
if (!resumePackages) {
await writeFile(join(root, 'current.json'), JSON.stringify(previous))
await cp(join(userRoot, 'python-overlay'), join(root, 'python-overlay'), { recursive: true })
}
await mkdir(join(root, 'downloads'), { recursive: true })
await link(resolve('.build/python-1.4.0/dist/zerowall-python-windows-x64-1.4.0.zip'), join(root, 'downloads', `${next.archiveSha256}.part`)).catch(error => { if (error.code !== 'EEXIST') throw error })
const events: unknown[] = []; let running: Promise<string> | undefined; let last = ''; let firstUpgrade = !resumePackages
const controller = new McpEnvironmentController({ root, manifestUrl: next.archiveUrl.replace(/\/1\.4\.0\/[^/]+$/, '/latest.json'), publicKey: MCP_ENVIRONMENT_KEYRING['stable-3']!, publicKeys: MCP_ENVIRONMENT_KEYRING,
  publish: status => {
    const key = `${status.phase}:${status.progress}`
    if (key !== last) { last = key; console.log(key, status.message?.slice(0, 180)) }
    if (firstUpgrade && status.phase === 'installing' && status.progress === 92 && !running) {
      running = new Promise((accept, reject) => {
        const child = spawn(join(previous.root, previous.manifest.python.relativeExecutable), ['-I', '-B', '-c', 'import time,sys; time.sleep(80); import numpy; print(sys.executable); print(numpy.sum([1,2,3]))'], { windowsHide: true })
        let output = ''; child.stdout.on('data', data => output += data); child.stderr.resume(); child.on('error', reject); child.on('exit', code => code === 0 ? accept(output) : reject(new Error(`long job ${code}`)))
      })
    }
    if (firstUpgrade && status.phase === 'installing') assert.equal(status.activeEnvironment?.environmentVersion, '1.3.0')
  },
})
const result = resumePackages ? await controller.localStatus() : await controller.initialize()
assert.equal(result.environmentVersion, '1.4.0', result.lastUpdateError)
let info = await controller.pythonInfo()
assert.equal(info.packageCount, 387); assert.equal(info.overlayPackageCount, 6); assert.equal(info.version, '3.12.10')
assert.ok((await stat(join(root, 'current.json'))).size < 8192)
if (!resumePackages) assert.ok((await running)?.includes(previous.root))
firstUpgrade = false
events.push({ test: 'real-upgrade-387-and-six-extensions-small-pointer-long-old-task', ok: true })
await writeFile(join(work, 'real-upgrade-verification.json'), JSON.stringify({ ok: true, phase: 'upgrade', events }, null, 2))
const active = info.snapshotId
const conflict = await controller.previewPackages(['numpy==0.1.0'])
assert.ok(conflict.error); assert.equal((await controller.pythonInfo()).snapshotId, active)
events.push({ test: 'incompatible-package-keeps-current', ok: true })
console.log('Preparing core package transaction colorama==0.4.5')
const plan = await controller.previewPackages(['colorama==0.4.5'])
assert.ok(!plan.error, plan.error); assert.ok(plan.changes.some(change => change.name.toLowerCase() === 'colorama'))
info = await controller.applyPackagePlan(plan.planId)
assert.equal(info.packages.find(pkg => pkg.name.toLowerCase() === 'colorama')?.version, '0.4.5')
assert.equal(info.localRevision, 1); assert.equal(info.overlayPackageCount, 6)
events.push({ test: 'core-package-independent-candidate', ok: true })
const upgradePlan = await controller.previewPackages(['colorama==0.4.6'])
assert.ok(!upgradePlan.error, upgradePlan.error)
info = await controller.applyPackagePlan(upgradePlan.planId)
assert.equal(info.packages.find(pkg => pkg.name.toLowerCase() === 'colorama')?.version, '0.4.6')
events.push({ test: 'core-package-upgrade', ok: true })
await controller.rollback(); info = await controller.pythonInfo()
assert.equal(info.packages.find(pkg => pkg.name.toLowerCase() === 'colorama')?.version, '0.4.5')
events.push({ test: 'local-revision-rollback', ok: true })
await writeFile(join(work, 'real-upgrade-verification.json'), JSON.stringify({ ok: true, events }, null, 2))
console.log(JSON.stringify(events))
