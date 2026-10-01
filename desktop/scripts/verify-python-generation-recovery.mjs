import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createHash, createPublicKey, randomUUID, sign, verify } from 'node:crypto'
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { _electron } from 'playwright'
import { contract } from '../../tools/build/paths.mjs'
import { locatePackagedApp } from './packaged-app.mjs'

if (process.env.ZEROWALL_VERIFY_PYTHON_RECOVERY !== '1') throw new Error('Explicit isolated Python recovery verification is required')
const signingFile = process.env.ZEROWALL_MCP_ENVIRONMENT_PRIVATE_KEY_FILE
if (!signingFile) throw new Error('The existing environment signing key file is required for an isolated feed fixture')
const prior = JSON.parse(await readFile(process.argv[2], 'utf8'))
assert(prior.ok, 'Start from a verified isolated on-demand installation')
const management = prior.managementRoot
const pointerPath = join(management, 'current.json')
const beforeBytes = await readFile(pointerPath)
const before = JSON.parse(beforeBytes)
const manifest = JSON.parse(await readFile(join(before.root, 'manifest.json'), 'utf8'))
const canonical = document => { const { signature, ...body } = document; return Buffer.from(JSON.stringify(body)) }
const privateKey = await readFile(signingFile, 'utf8')
assert(verify(null, canonical(manifest), createPublicKey(privateKey), Buffer.from(manifest.signature.value, 'base64')), 'Fixture signer must match the verified existing feed')
manifest.contentRevision = (manifest.contentRevision ?? 1) + 1
manifest.signature.value = sign(null, canonical(manifest), privateKey).toString('base64')
const server = createServer((_request, response) => { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(manifest)) })
await new Promise(accept => server.listen(0, '127.0.0.1', accept))
const directory = join(contract.verification, 'python-generation-recovery', randomUUID())
await mkdir(directory, { recursive: true })
const packaged = await locatePackagedApp(join(import.meta.dirname, '..'))
const env = { ...process.env, ZEROWALL_USER_DATA_DIR: join(prior.directory, 'userdata'),
  APPDATA: join(prior.directory, 'appdata'), LOCALAPPDATA: join(prior.directory, 'localappdata'),
  ZEROWALL_DISABLE_DEFAULT_MCP: '1', ZEROWALL_PYTHON_MANIFEST: `http://127.0.0.1:${server.address().port}/latest.json` }
delete env.ELECTRON_RUN_AS_NODE
const evidence = { ok: false, buildId: contract.buildId, executable: packaged.executablePath, oldSnapshot: before.root, fixture: 'Isolated signed content revision; not a public release', progress: [] }
const save = () => writeFile(join(directory, 'receipt.json'), JSON.stringify(evidence, null, 2) + '\n')
const jobs = async () => Promise.all((await readdir(join(management, 'jobs'))).filter(name => name.endsWith('.json')).map(async name => JSON.parse(await readFile(join(management, 'jobs', name)))))
const pointer = async () => JSON.parse(await readFile(pointerPath))
let app, page, runningTask
const lease = join(management, 'leases', 'verification-' + randomUUID() + '.json')
async function launch() {
  app = await _electron.launch({ executablePath: packaged.executablePath, env, args: [`--user-data-dir=${join(prior.directory, 'chromium')}`], timeout: 120000 })
  page = await app.firstWindow()
  await page.waitForURL(url => url.hostname === '127.0.0.1', { timeout: 180000 })
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('dialog', { name: '设置', exact: true }).getByRole('button', { name: 'Python 环境', exact: true }).click()
  await page.getByLabel('搜索依赖', { exact: true }).waitFor()
}
async function waitFor(task, timeout = 180000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await task()) return
    await new Promise(accept => setTimeout(accept, 250))
  }
  throw new Error('Packaged Python recovery state timed out')
}
const status = () => page.evaluate(() => window.zerowallDesktop.getMcpEnvironmentStatus())
try {
  const previousJobs = await jobs()
  await launch()
  await waitFor(async () => (await status()).activeEnvironment?.snapshotId === before.root)
  assert.equal((await jobs()).length, previousJobs.length, 'Opening Python settings must not start an update')
  assert.deepEqual(await readFile(pointerPath), beforeBytes)
  evidence.openingSettingsDoesNotInstall = true
  const interpreter = join(before.root, 'Python/python.exe')
  const interpreterHash = createHash('sha256').update(await readFile(interpreter)).digest('hex')
  // A real task keeps its selected interpreter and imported scientific library
  // alive while a newer generation is installed and activated.
  runningTask = spawn(interpreter, ['-I', '-B', '-c', 'import json,sys,numpy; print(json.dumps({"executable":sys.executable,"numpy":numpy.__version__}),flush=True); sys.stdin.readline(); print(json.dumps({"executable":sys.executable,"numpy":numpy.__version__}),flush=True)'], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let taskOutput = ''
  runningTask.stdout.on('data', bytes => { taskOutput += bytes })
  await waitFor(() => taskOutput.includes('\n'))
  await mkdir(dirname(lease), { recursive: true })
  await writeFile(lease, JSON.stringify({ pid: runningTask.pid, snapshot: before.root }))
  const request = await page.evaluate(() => window.zerowallDesktop.updateMcpEnvironment())
  const taskId = request.updateJob?.taskId
  assert(taskId, 'Explicit update returns a durable task ID')
  evidence.taskId = taskId
  await waitFor(async () => { const value = await status(); if (value.phase === 'failed') throw new Error(value.lastUpdateError); return value.phase === 'installing' && value.updateJob?.completedFiles > 1024 }, 180000)
  assert.equal((await pointer()).root, before.root, 'The candidate cannot replace a running snapshot before health validation')
  await page.evaluate(() => window.zerowallDesktop.pauseMcpEnvironment())
  await waitFor(async () => (await jobs()).some(job => job.taskId === taskId && job.state === 'paused'))
  await app.close(); app = undefined
  await launch()
  await waitFor(async () => (await status()).phase === 'paused')
  assert.equal((await pointer()).root, before.root)
  const resumed = await page.evaluate(() => window.zerowallDesktop.retryMcpEnvironment())
  assert.equal(resumed.updateJob.taskId, taskId, 'Restart resumes the same task')
  evidence.pauseRestartResumesSameTask = true
  const deadline = Date.now() + 30 * 60000
  let lastRecorded = 0, ready = false
  while (Date.now() < deadline) {
    const value = await status()
    if (value.phase === 'failed' || value.updateJob?.stage === 'failed') throw new Error(value.lastUpdateError ?? value.message)
    if (Date.now() - lastRecorded > 15000) {
      evidence.progress.push({ phase: value.phase, completedFiles: value.updateJob?.completedFiles, snapshot: value.activeEnvironment?.snapshotId })
      await save(); console.log('Python recovery:', JSON.stringify(evidence.progress.at(-1))); lastRecorded = Date.now()
    }
    await page.getByLabel('搜索依赖', { exact: true }).fill('numpy')
    if (value.phase === 'ready' && value.activeEnvironment?.contentRevision === manifest.contentRevision && (await jobs()).some(job => job.taskId === taskId && job.state === 'complete')) { ready = true; break }
    assert.equal((await pointer()).root, before.root, 'Active pointer stays on the old generation during installation')
    await new Promise(accept => setTimeout(accept, 1000))
  }
  assert(ready, 'The resumed candidate must finish and pass health')
  const updated = await pointer()
  assert.notEqual(updated.root, before.root)
  evidence.newSnapshot = updated.root
  assert.equal(createHash('sha256').update(await readFile(interpreter)).digest('hex'), interpreterHash)
  runningTask.stdin.end('\n')
  await waitFor(() => taskOutput.trim().split('\n').length === 2)
  const [started, finished] = taskOutput.trim().split('\n').map(JSON.parse)
  assert.deepEqual(finished, started, 'An active task keeps its original interpreter and scientific library')
  evidence.runningTaskSnapshotPreserved = true
  const rollback = await page.evaluate(() => window.zerowallDesktop.rollbackMcpEnvironment())
  await waitFor(async () => (await jobs()).some(job => job.taskId === rollback.taskId && job.state === 'complete'))
  assert.equal((await pointer()).root, before.root)
  await waitFor(async () => (await status()).activeEnvironment?.snapshotId === before.root)
  evidence.rollbackRestoresSnapshot = true
  evidence.ok = true
  await save()
  console.log('Packaged Python pause, restart, snapshot and rollback passed:', directory)
} catch (error) { evidence.error = error.stack ?? String(error); await save(); throw error }
finally {
  runningTask?.kill()
  await unlink(lease).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (app) await app.close()
  await new Promise(accept => server.close(accept))
}
