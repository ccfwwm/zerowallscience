import { fork, execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { writeFile, mkdir, copyFile, readFile, cp, link } from 'node:fs/promises'
import { MCP_ENVIRONMENT_KEYRING } from '../../desktop/src/main/mcp-environment.js'
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
const legacy = process.argv.includes('--legacy')
const full = process.argv.includes('--full')
const prepareOnly = process.argv.includes('--prepare-only')
const packaged = process.argv.includes('--packaged')
const root = resolve(prepareOnly ? `.build/python-updater/memory-prepare-${Date.now()}` : full ? '.build/python-updater/memory-full' : legacy ? '.build/python-updater/memory-legacy' : '.build/python-updater/real-upgrade')
if (legacy) { await mkdir(root, { recursive: true }); await copyFile(resolve('.build/python-1.4.0/client-pointer-rollback/current.json'), resolve(root, 'current.json')) }
if (full) {
  const manifest = JSON.parse(await readFile(resolve('.build/python-1.4.0/dist/latest.json'), 'utf8'))
  await mkdir(resolve(root, 'downloads'), { recursive: true })
  await cp(resolve(process.env.APPDATA!, 'zerowall-science/zerowall-python/python-overlay'), resolve(root, 'python-overlay'), { recursive: true })
  await link(resolve('.build/python-1.4.0/dist/zerowall-python-windows-x64-1.4.0.zip'), resolve(root, 'downloads', `${manifest.archiveSha256}.part`)).catch(error => { if (error.code !== 'EEXIST') throw error })
}
const electron = process.argv.includes('--electron')
const server = createServer((_request, response) => { response.setHeader('content-type', 'application/json'); createReadStream(resolve('.build/python-1.4.0/dist/latest.json')).pipe(response) })
await new Promise<void>(accept => server.listen(0, '127.0.0.1', accept))
const address = server.address() as { port: number }
const child = fork(resolve(packaged ? '.build/python-updater/package/win-unpacked/resources/app.asar.unpacked/out/main/python-updater-worker.js' : 'desktop/out/main/python-updater-worker.js'), [], { ...(electron ? { execPath: resolve(packaged ? '.build/python-updater/package/win-unpacked/ZeroWallScience.exe' : 'desktop/node_modules/electron/dist/electron.exe'), env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } } : {}), execArgv: ['--max-old-space-size=128', '--max-semi-space-size=8'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
let errors = ''; child.stderr!.on('data', data => { errors = (errors + data).slice(-4000) })
child.send({ type: 'configure', config: { root, manifestUrl: `http://127.0.0.1:${address.port}/latest.json`, publicKey: MCP_ENVIRONMENT_KEYRING['stable-3'], publicKeys: MCP_ENVIRONMENT_KEYRING } })
try {
  const call = (method: string, id: string) => new Promise<void>((accept, reject) => {
    const exit = () => reject(new Error(errors || 'Worker exited'))
    child.once('exit', exit)
    const listener = (message: any) => {
      if (message.id !== id) return
      child.off('message', listener); child.off('exit', exit)
      message.error || message.result?.lastUpdateError ? reject(new Error(message.error ?? message.result.lastUpdateError)) : accept()
    }
    child.on('message', listener); child.send({ id, method })
  })
  const initialized = Promise.all(['localStatus', 'pythonInfo', 'pythonInfo', full ? 'initialize' : 'checkForUpdates'].map((method, index) => call(method, `concurrent-${index}`)))
  if (prepareOnly) await Promise.race([initialized, new Promise<void>(accept => child.on('message', (message: any) => { if (message.status?.updateJob?.completedFiles >= 2048) accept() }))])
  else await initialized
  if (!full) for (let pass = 0; pass < 3; pass++) await call('checkForUpdates', `probe-${pass}`)
  const stats = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command', `$p=Get-Process -Id ${child.pid}; @{rssMiB=$p.WorkingSet64/1MB;peakRssMiB=$p.PeakWorkingSet64/1MB}|ConvertTo-Json`], { encoding: 'utf8', windowsHide: true }))
  await writeFile(resolve(`.build/python-updater/manifest-memory-probe${prepareOnly ? '-prepare' : ''}${packaged ? '-packaged' : ''}${full ? '-full' : ''}${legacy ? '-legacy' : ''}${electron ? '-electron' : ''}.json`), JSON.stringify({ ok: true, ...stats }, null, 2))
  console.log(stats)
} finally { child.kill(); server.close() }
