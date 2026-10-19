import { contract } from '../../tools/build/paths.mjs'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { copyFile, mkdir, readFile, writeFile, lstat } from 'node:fs/promises'
import { resolve, join, basename, parse } from 'node:path'
import { windowsFileVersion } from '../src/main/update-artifact.ts'
import { commandRegistrationFingerprint, verifyInstallerTestContract } from '../../tools/packaging/installer-test-contract.mjs'

// Build with the isolated appId in build/electron-builder.installer-test.cjs.
// Never invoke the production installer from this test.
const version = JSON.parse(await readFile(resolve(import.meta.dirname, '../package.json'), 'utf8')).version
const versionKey = version.replaceAll('.', '')
const root = join(contract.verification, `installer-test-${versionKey}`)
const installer = join(root, `zerowall-installer-test-${version}.exe`)
const directory = join(root, '科研应用 中文目录')
const executable = join(directory, 'ZeroWallScience.exe')
const elevatedRunner = process.platform === 'win32' && spawnSync('powershell.exe', ['-NoProfile', '-Command', '[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'], { encoding: 'utf8', windowsHide: true }).stdout?.trim() === 'True'
const children = []
async function run(path, args) {
  return new Promise((ok, fail) => {
    const child = spawn(path, args, { windowsHide: true, stdio: 'ignore' })
    const timer = setTimeout(() => { child.kill(); fail(new Error('Installer timeout')) }, 180_000)
    child.once('error', error => { clearTimeout(timer); fail(error) })
    child.once('exit', code => { clearTimeout(timer); ok(code) })
  })
}
await verifyInstallerTestContract(installer, version)
await mkdir(directory, { recursive: true })
const commandRegistrationBefore = await commandRegistrationFingerprint()
try {
  assert.equal(await run(installer, ['/S', '/currentuser', '/no-launch', `/D=${directory}`]), 0)
  assert.equal(await commandRegistrationFingerprint(), commandRegistrationBefore, 'Isolated installer changed the formal command PATH owner')
  assert.equal(await windowsFileVersion(executable), `${version}.0`)
  const sentinel = join(directory, 'user-data-sentinel.txt')
  await writeFile(sentinel, 'preserve researcher data')
  // Simulate a running prior executable at the registered installation path.
  await copyFile(process.execPath, executable)
  const target = spawn(executable, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true, stdio: 'ignore' })
  children.push(target)
  await new Promise((ok, fail) => { target.once('spawn', ok); target.once('error', fail) })
  const unrelatedDirectory = join(root, 'unrelated'); await mkdir(unrelatedDirectory, { recursive: true })
  const unrelatedExe = join(unrelatedDirectory, 'ZeroWallScience.exe'); await copyFile(process.execPath, unrelatedExe)
  const unrelated = spawn(unrelatedExe, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true, stdio: 'ignore' })
  children.push(unrelated)
  await new Promise((ok, fail) => { unrelated.once('spawn', ok); unrelated.once('error', fail) })
  // No /D: the existing registration must keep the selected Chinese directory.
  assert.equal(await run(installer, ['--updated', '/S', '/no-launch']), 0)
  assert.equal(await commandRegistrationFingerprint(), commandRegistrationBefore, 'Isolated upgrade changed the formal command PATH owner')
  assert.notEqual(target.exitCode, null)
  assert.equal(unrelated.exitCode, null)
  assert.equal(await windowsFileVersion(executable), `${version}.0`)
  assert.equal(await readFile(sentinel, 'utf8'), 'preserve researcher data')
  const pythonSentinel = join(directory, 'Python/preserve-python.txt')
  await mkdir(join(directory, 'Python'), { recursive: true }); await writeFile(pythonSentinel, 'fixed Python root')
  const movedDirectory = resolve(process.env.ZEROWALL_TEST_INSTALLER_MOVE_ROOT ?? join(root, 'zws-installer-841-改目录'))
  assert(basename(movedDirectory).startsWith('zws-installer-841-'), 'Directory move must use an isolated 8.4.1 test destination')
  assert.notEqual(movedDirectory, directory)
  assert.equal(await run(installer, ['/S', '/currentuser', '/no-launch', `/D=${movedDirectory}`]), 0)
  assert.equal(await windowsFileVersion(join(movedDirectory, 'ZeroWallScience.exe')), `${version}.0`)
  await assert.rejects(lstat(executable), { code: 'ENOENT' })
  assert.equal(await readFile(sentinel, 'utf8'), 'preserve researcher data')
  assert.equal(await readFile(pythonSentinel, 'utf8'), 'fixed Python root')
  assert.equal(unrelated.exitCode, null)
  const result = { passed: true, installationScope: 'current-user', elevatedRunner, directory, movedDirectory, crossDriveUpgrade: parse(directory).root.toLowerCase() !== parse(movedDirectory).root.toLowerCase(), fileVersion: `${version}.0`, rememberedDirectory: true, runningTargetStopped: true, unrelatedProcessPreserved: true, dataPreserved: true, previousFixedPythonPreserved: true, oldOwnedExecutableRemoved: true, commandRegistrationUnchanged: true, limitation: elevatedRunner ? 'Isolated current-user install and upgrade executed with an elevated runner; machine-wide installation was not exercised.' : 'Standard-user test; machine-wide UAC consent requires an administrator and was not exercised.' }
  await writeFile(join(root, 'upgrade-verification.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
} finally {
  for (const child of children) if (child.exitCode === null) child.kill()
  assert.equal(await commandRegistrationFingerprint(), commandRegistrationBefore, 'Isolated installer left the formal command PATH owner changed')
}
