import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { contract, root } from '../../tools/build/paths.mjs'
import { MCP_ENVIRONMENT_KEYRING } from '../src/main/mcp-environment.ts'
import { locatePackagedApp } from './packaged-app.mjs'

// Opt-in preflight: run the freshly compiled updater through Electron's Node
// runtime before rebuilding the installer. Final Desktop IPC is checked separately.
assert.equal(process.env.ZEROWALL_VERIFY_PYTHON_ON_DEMAND, '1')
const packaged = await locatePackagedApp(join(root, 'desktop'))
const directory = join(contract.verification, 'python-worker', randomUUID())
const home = join(contract.cache, 'python', 'worker-' + randomUUID().slice(0, 8))
const management = join(home, 'zerowall-python')
await mkdir(directory, { recursive: true }); await mkdir(join(management, 'downloads'), { recursive: true })
const seed = process.env.ZEROWALL_PYTHON_RESUME_SEED
const digest = /([a-f0-9]{64})\.part$/u.exec(seed ?? '')?.[1]
assert(digest, 'Provide a content-addressed resume seed from isolated verification')
await copyFile(seed, join(management, 'downloads', digest + '.part'))
const evidence = { ok: false, home, directory, worker: join(root, 'desktop/out/main/python-updater-worker.js'), progress: [] }
const save = () => writeFile(join(directory, 'receipt.json'), JSON.stringify(evidence, null, 2))
await save()
console.log('Compiled worker preflight:', directory)
const child = fork(evidence.worker, [], { execPath: packaged.executablePath, execArgv: ['--max-old-space-size=128', '--max-semi-space-size=8'],
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
let errors = '', previous, lastRecorded = 0
child.stderr.on('data', data => { errors = (errors + data).slice(-16000) })
try {
  const result = await new Promise((accept, reject) => {
    const timer = setTimeout(() => reject(new Error('Source worker initialization timed out')), 30 * 60_000)
    const finish = (error, value) => { clearTimeout(timer); error ? reject(error) : accept(value) }
    child.once('error', error => finish(error))
    child.once('exit', code => finish(new Error('Source worker exited: ' + code + '; ' + errors)))
    child.on('message', message => {
      if (message.type === 'status') {
        const status = message.status
        if (status.phase !== previous || Date.now() - lastRecorded > 15000) {
          evidence.progress.push({ at: new Date().toISOString(), phase: status.phase, progress: status.progress, message: status.message })
          previous = status.phase; lastRecorded = Date.now()
          console.log('Worker:', status.phase, status.progress ?? '')
          void save()
        }
      } else if (message.id === 'initialize') finish(message.error ? new Error(message.error) : undefined, message.result)
    })
    child.send({ type: 'configure', config: { root: management, generationMode: true,
      manifestUrl: 'https://zerowall.chengxunkeji.cn/stable/zerowall-python/windows-x64/latest.json',
      publicKey: MCP_ENVIRONMENT_KEYRING['stable-1'], publicKeys: MCP_ENVIRONMENT_KEYRING,
      diagnosticPath: join(directory, 'worker.log'), bundledAssets: {
        bioToolsRoot: join(packaged.resourcesRoot, 'bio-tools'), ketcherRoot: join(packaged.resourcesRoot, 'ketcher-chemistry'),
        sciRoot: join(packaged.resourcesRoot, 'sci'), skillsRoot: join(packaged.resourcesRoot, 'skills') } } })
    child.send({ id: 'initialize', method: 'initialize', args: [] })
  })
  evidence.result = result
  assert.equal(result.phase, 'ready', result.lastUpdateError ?? result.message)
  evidence.ok = true
  console.log('Compiled Python worker installed the signed runtime:', directory)
} catch (error) { evidence.error = error.stack ?? String(error); throw error }
finally { child.kill(); await save() }
