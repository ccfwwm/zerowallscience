import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { access, cp, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { contract, root } from '../build/paths.mjs'
import { verifyOfflineProfile } from '../commands/offline-profile.mjs'

const key = contract.version.replaceAll('.', '')
const testRoot = join(contract.verification, `installer-test-${key}`)
// NSIS extraction uses Windows MAX_PATH. Keep the isolated installation root
// short enough for the Office runtime's nested physical resources.
const directory = join(await mkdtemp(join(tmpdir(), `zws-${key}-`)), '科研应用 中文目录')
const installer = join(testRoot, `zerowall-installer-test-${contract.version}.exe`)
await mkdir(directory, { recursive: true })
// Reproduce the installed 8.1.0 carrier in an isolated installation, including
// obsolete physical assets. This is a read-only copy of the selected fixture.
const previousOffline = process.argv[process.argv.indexOf('--previous-offline') + 1]
let rejectedOldCarrier = false
const keys = JSON.parse(await readFile(join(root, 'config/catalogs/trusted-keys.json'), 'utf8'))
const upstream = JSON.parse(await readFile(join(root, 'config/deepseek-harness/upstream.json'), 'utf8'))
const target = { desktopVersion: contract.version, dshVersion: upstream.version, dshCommit: upstream.commit, platform: 'win32', architecture: 'x64' }
const offline = join(directory, 'resources/offline-profile')
if (process.argv.includes('--previous-offline')) {
  assert.ok(previousOffline, '--previous-offline needs an explicit source')
  await cp(previousOffline, offline, { recursive: true })
  await assert.rejects(verifyOfflineProfile(offline, keys, target), /file set mismatch/)
  rejectedOldCarrier = true
}
const sentinel = join(directory, 'user-research-sentinel.txt')
await writeFile(sentinel, 'preserve researcher data')
// NSIS GetOptions expects the custom performance option without outer quotes.
// Keep this optional trace in the workspace, apart from the Unicode /D target.
const performanceFile = join(testRoot, 'installer-performance.log')
const commandSnapshot = join(testRoot, 'command-registration-before.json')
function commandState(operation) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(import.meta.dirname, 'installer-command-state.ps1'), '-Operation', operation, '-Snapshot', commandSnapshot, '-Directory', join(directory, 'resources/commands')], { windowsHide: true, encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Isolated command registration ${operation} failed: ${result.stderr || result.stdout}`)
}
commandState('capture')
let code
try { code = await new Promise((accept, reject) => {
  const child = spawn(installer, ['/S', '/currentuser', '/no-launch', `/ZW_PERF=${performanceFile}`, `/D=${directory}`], { windowsHide: true, stdio: 'ignore' })
  const timer = setTimeout(() => {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    void readFile(performanceFile, 'utf8').catch(() => 'No installer phase receipt')
      .then(phases => reject(new Error(`Isolated installer timeout after 180 seconds; phases:\n${phases}`)))
  }, 180000)
  child.once('error', error => { clearTimeout(timer); reject(error) })
  child.once('exit', code => { clearTimeout(timer); accept(code) })
}) } finally { commandState('restore') }
assert.equal(code, 0, 'Isolated NSIS installation must succeed')
const verifiedOffline = await verifyOfflineProfile(offline, keys, target)
assert.equal(await readFile(sentinel, 'utf8'), 'preserve researcher data')
async function digest(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
const stableAsarSha256 = await digest(join(contract.packages, 'win-unpacked/resources/app.asar'))
const installedAsarSha256 = await digest(join(directory, 'resources/app.asar'))
assert.equal(installedAsarSha256, stableAsarSha256, 'Installation must preserve the exact candidate payload')
assert.ok((await stat(join(directory, 'ZeroWallScience.exe'))).size > 0)
const engine = join(directory, 'resources/app.asar.unpacked/node_modules/@deepseek-ai/libreoffice-kit-win32-x64')
const nativeManifest = JSON.parse(await readFile(join(engine, 'prebuilds.json'), 'utf8'))
for (const file of Object.keys(nativeManifest.files)) await access(join(engine, file))
await writeFile(join(testRoot, 'installation-receipt.json'), JSON.stringify({
  version: contract.version, buildId: contract.buildId, completed: true, directory,
  appId: `com.zerowall.science.installer-test-${key}`, installationScope: 'current-user',
  stableAsarSha256, installedAsarSha256, identicalPayload: true, physicalOfficeResources: Object.keys(nativeManifest.files).length, checkedAt: new Date().toISOString(),
  rejectedOldCarrier, signedOfflineVerified: true, payloadFiles: verifiedOffline.receipt.payloadFiles.length, userSentinelPreserved: true,
  commandRegistrationRestored: true,
  installerExitCode: code, installerPhases: await readFile(performanceFile, 'utf8').catch(() => undefined),
  limitation: 'Production registration and machine-wide UAC were not exercised.'
}, null, 2) + '\n')
console.log('Isolated Chinese-directory installation passed:', directory)
