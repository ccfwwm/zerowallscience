import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { randomUUID, createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '../..')
const output = resolve(root, '.build/compiled-python-worker', `run-${Date.now()}`)
await mkdir(output, { recursive: true })
const main = resolve(root, 'desktop/out/main')
const workerPath = join(main, 'python-updater-worker.js')
const chunkName = (await readdir(join(main, 'chunks'))).find(name => /^mcp-environment-.*\.js$/u.test(name))
assert(chunkName, 'Build the desktop worker first')
const chunkPath = join(main, 'chunks', chunkName)
const module = await import(pathToFileURL(chunkPath).href)
const keys = Object.values(module).find(value => value && typeof value === 'object' && value['stable-3'])
assert(keys, 'Compiled verification keys not found')
const evidence = { startedAt: new Date().toISOString(), output, workerPath, workerSha256: createHash('sha256').update(await readFile(workerPath)).digest('hex'), chunkSha256: createHash('sha256').update(await readFile(chunkPath)).digest('hex'), statuses: [] }
const child = fork(workerPath, [], { execArgv: ['--max-old-space-size=128', '--max-semi-space-size=8'], windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
const requests = new Map()
let stderr = ''; let previousStage
child.stderr.on('data', data => { stderr = (stderr + data).slice(-8000) })
child.on('message', message => {
  if (message.type === 'status') {
    const stage = `${message.status.phase}:${message.status.updateJob?.stage ?? ''}`
    if (stage !== previousStage) { console.log(stage); evidence.statuses.push({ at: new Date().toISOString(), phase: message.status.phase, message: message.status.message }); previousStage = stage }
  } else if (message.id) {
    const pending = requests.get(message.id); if (!pending) return
    requests.delete(message.id); clearTimeout(pending.timer)
    message.error ? pending.reject(new Error(message.error)) : pending.resolve(message.result)
  }
})
child.on('exit', code => { for (const request of requests.values()) { clearTimeout(request.timer); request.reject(new Error(`Worker exited: ${code}; ${stderr}`)) }; requests.clear() })
const rpc = (method, args = []) => new Promise((resolve, reject) => {
  const id = randomUUID()
  const timer = setTimeout(() => { requests.delete(id); reject(new Error(`${method} timed out`)) }, 20 * 60_000)
  requests.set(id, { resolve, reject, timer }); child.send({ id, method, args })
})
child.send({ type: 'configure', config: { root: join(output, 'environment'), manifestUrl: 'https://zerowall.chengxunkeji.cn/stable/zerowall-python/windows-x64/latest.json', publicKey: keys['stable-3'], publicKeys: keys, bundledManifestPath: resolve(root, 'desktop/dist/python-base-1.4.1/latest.json'), bundledArchivePath: resolve(root, 'desktop/dist/python-base-1.4.1/zerowall-python-windows-x64-1.4.1.zip'), diagnosticPath: join(output, 'environment.log') } })
try {
  console.log('Compiled worker: installing signed local base')
  evidence.initialized = await rpc('initialize')
  assert.equal(evidence.initialized.phase, 'ready', JSON.stringify(evidence.initialized))
  evidence.before = await rpc('pythonInfo')
  assert.equal(evidence.before.version, '3.12.10')
  assert(!evidence.before.packages.some(pkg => pkg.name.toLowerCase() === 'docopt'))
  console.log('Compiled worker: source preview')
  evidence.plan = await rpc('previewPackages', [['docopt>=0.6.1,<0.7']])
  assert(!evidence.plan.error, evidence.plan.error)
  assert(evidence.plan.wheels.some(pkg => pkg.name === 'docopt' && pkg.sourceArchiveSha256))
  console.log('Compiled worker: applying source plan')
  evidence.applied = await rpc('applyPackagePlan', [evidence.plan.planId])
  evidence.after = await rpc('pythonInfo')
  assert(evidence.after.packages.some(pkg => pkg.name === 'docopt' && pkg.version === '0.6.2'))
  console.log('Compiled worker: rollback')
  evidence.rollback = await rpc('rollback')
  evidence.restored = await rpc('pythonInfo')
  assert(!evidence.restored.packages.some(pkg => pkg.name.toLowerCase() === 'docopt'))
  evidence.ok = true
} catch (error) { evidence.ok = false; evidence.error = String(error); process.exitCode = 1 }
finally {
  evidence.finishedAt = new Date().toISOString(); evidence.stderr = stderr
  await writeFile(join(output, 'receipt.json'), JSON.stringify(evidence, null, 2))
  console.log(`Compiled worker receipt: ${join(output, 'receipt.json')} (${evidence.ok})`)
  if (child.connected) child.disconnect()
}
