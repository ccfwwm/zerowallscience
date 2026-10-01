import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { _electron } from 'playwright'
import { contract } from '../../tools/build/paths.mjs'
import { locatePackagedApp } from './packaged-app.mjs'

// Explicit network integration; never use or modify the user's Python/profile.
if (process.env.ZEROWALL_VERIFY_PYTHON_ON_DEMAND !== '1') throw new Error('Set ZEROWALL_VERIFY_PYTHON_ON_DEMAND=1 to download the signed Python environment into an isolated verification directory.')
const execute = promisify(execFile)
const packaged = await locatePackagedApp(join(import.meta.dirname, '..'))
const directory = join(contract.verification, 'python-on-demand', randomUUID())
const userdata = join(directory, 'userdata')
const runtimeRoot = join(directory, 'shared-python/Python')
const management = join(dirname(runtimeRoot), 'zerowall-python')
const evidence = { ok: false, directory, executable: packaged.executablePath, startedAt: new Date().toISOString(), progress: [] }
const receipt = join(directory, 'receipt.json')
const save = () => writeFile(receipt, JSON.stringify(evidence, null, 2))
const env = { ...process.env, ZEROWALL_USER_DATA_DIR: userdata, ZEROWALL_DISABLE_DEFAULT_MCP: '1',
  APPDATA: join(directory, 'appdata'), LOCALAPPDATA: join(directory, 'localappdata') }
delete env.ELECTRON_RUN_AS_NODE
await Promise.all([userdata, env.APPDATA, env.LOCALAPPDATA].map(path => mkdir(path, { recursive: true })))
const location = join(env.LOCALAPPDATA, 'ZeroWall Science/python-location.json')
await mkdir(dirname(location), { recursive: true })
await writeFile(location, JSON.stringify({ runtimeRoot }))
await save()
console.log('Isolated Python evidence:', receipt)
let app, page
async function launch() {
  app = await _electron.launch({ executablePath: packaged.executablePath, env,
    args: [`--user-data-dir=${join(directory, 'chromium')}`], timeout: 120_000 })
  page = await app.firstWindow({ timeout: 60_000 })
  await page.waitForURL(url => /^https?:/u.test(url.protocol), { timeout: 180_000 })
  await page.waitForFunction(() => Boolean(window.zerowallDesktop?.getMcpEnvironmentStatus))
}
const current = () => page.evaluate(() => window.zerowallDesktop.getMcpEnvironmentStatus())
const jobs = async () => Promise.all((await readdir(join(management, 'jobs')).catch(error => {
  if (error.code === 'ENOENT') return []; throw error
})).filter(name => name.endsWith('.json')).map(async name => JSON.parse(await readFile(join(management, 'jobs', name), 'utf8'))))
async function settle(timeout, taskId) {
  const deadline = Date.now() + timeout
  let previous, lastRecorded = 0
  while (Date.now() < deadline) {
    const status = await current()
    const stage = status.updateJob?.stage ?? status.phase
    if (stage !== previous || Date.now() - lastRecorded > 15_000) {
      evidence.progress.push({ at: new Date().toISOString(), phase: status.phase, stage,
        progress: status.progress, receivedBytes: status.updateJob?.receivedBytes, totalBytes: status.updateJob?.totalBytes,
        completedFiles: status.updateJob?.completedFiles, totalFiles: status.updateJob?.totalFiles })
      console.log('Python:', JSON.stringify(evidence.progress.at(-1)))
      await save(); previous = stage; lastRecorded = Date.now()
    }
    if (status.phase === 'failed' || stage === 'failed') throw new Error(status.lastUpdateError ?? status.message ?? 'Python installation failed')
    if (taskId ? status.phase === 'ready' && stage === 'ready' && status.updateJob?.taskId === taskId
      : ['idle', 'ready'].includes(status.phase) && !status.updateJob) return status
    await new Promise(accept => setTimeout(accept, 1000))
  }
  throw new Error('Python verification timed out')
}
try {
  await launch()
  evidence.startup = await settle(60_000)
  assert.equal(evidence.startup.phase, 'idle')
  assert.deepEqual(await jobs(), [], 'Thin startup must not schedule installation')
  await access(join(runtimeRoot, 'python.exe')).then(() => assert.fail('Python installed before request'), error => { if (error.code !== 'ENOENT') throw error })
  const seed = process.env.ZEROWALL_PYTHON_RESUME_SEED
  if (seed) {
    const digest = /([a-f0-9]{64})\.part$/u.exec(seed)?.[1]
    assert(digest, 'Resume seed must be a content-addressed .part file')
    await mkdir(join(management, 'downloads'), { recursive: true })
    await copyFile(resolve(seed), join(management, 'downloads', digest + '.part'))
    evidence.resumeSeedBytes = (await stat(seed)).size
  }
  const command = await execute(packaged.executablePath,
    ['--expose-internals', join(packaged.resourcesRoot, 'commands/zws.mjs'), 'python', 'install'],
    { cwd: directory, env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, timeout: 60_000 })
  evidence.request = JSON.parse(command.stdout)
  const taskId = evidence.request.updateJob?.taskId
  assert(taskId, 'Explicit install must return a durable task id')
  evidence.installed = await settle(30 * 60_000, taskId)
  evidence.jobs = await jobs()
  assert(evidence.jobs.some(job => job.taskId === taskId && job.state === 'complete'))
  const pointer = JSON.parse(await readFile(join(management, 'current.json'), 'utf8'))
  evidence.generation = pointer.root
  assert.equal(pointer.generation, true)
  assert(resolve(pointer.root).startsWith(resolve(join(management, 'slots')) + '\\'))
  const interpreter = join(pointer.root, 'Python/python.exe')
  evidence.interpreter = interpreter
  const probe = await execute(interpreter, ['-I', '-B', '-c',
    "import sys,json,importlib.metadata as m,numpy,pandas,scipy,anndata,scanpy,flowio; print(json.dumps({'python':sys.version.split()[0],'packages':{n:m.version(n) for n in ['numpy','pandas','scipy','anndata','scanpy','flowio']}}))"],
    { cwd: pointer.root, env: { ...env, PYTHONPATH: '', PYTHONNOUSERSITE: '1' }, windowsHide: true, timeout: 180_000 })
  evidence.scienceProbe = JSON.parse(probe.stdout.trim())
  assert.equal(evidence.scienceProbe.python, '3.12.10')
  const archive = join(management, 'downloads', pointer.archiveSha256 + '.part')
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(archive)) digest.update(chunk)
  evidence.archiveSha256 = digest.digest('hex')
  assert.equal(evidence.archiveSha256, pointer.archiveSha256)
  await save()
  const before = await readFile(join(management, 'current.json'))
  await app.close(); app = undefined
  await launch()
  evidence.reused = await settle(60_000)
  assert.equal(evidence.reused.phase, 'ready')
  assert.equal(evidence.reused.activeEnvironment.snapshotId, pointer.root)
  assert.deepEqual(await readFile(join(management, 'current.json')), before)
  assert.equal((await jobs()).length, evidence.jobs.length, 'Restart must reuse the runtime without creating another install job')
  evidence.inventory = await page.evaluate(() => window.zerowallDesktop.getMcpPythonInfo())
  assert(evidence.inventory.ready && evidence.inventory.packages.length > 0)
  evidence.ok = true; evidence.completedAt = new Date().toISOString()
  await save()
  console.log('Signed on-demand Python installation and restart reuse passed:', receipt)
} catch (error) {
  evidence.error = error.stack ?? String(error)
  await save()
  throw error
} finally { if (app) await app.close() }
