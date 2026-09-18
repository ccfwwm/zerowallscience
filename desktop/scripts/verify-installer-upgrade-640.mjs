import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { windowsFileVersion } from '../src/main/update-artifact.ts'

// Build with the isolated appId in build/electron-builder.installer-test.cjs.
// Never invoke the production installer from this test.
const root = resolve(import.meta.dirname, '../../.build/installer-test-640')
const installer = join(root, 'zerowall-installer-test-6.4.0.exe')
const directory = join(root, '科研应用 中文目录')
const executable = join(directory, 'ZeroWallScience.exe')
const children = []
async function run(path, args) {
  return new Promise((ok, fail) => {
    const child = spawn(path, args, { windowsHide: true, stdio: 'ignore' })
    const timer = setTimeout(() => { child.kill(); fail(new Error('Installer timeout')) }, 180_000)
    child.once('error', error => { clearTimeout(timer); fail(error) })
    child.once('exit', code => { clearTimeout(timer); ok(code) })
  })
}
await mkdir(directory, { recursive: true })
try {
  assert.equal(await run(installer, ['/S', '/currentuser', '/no-launch', `/D=${directory}`]), 0)
  assert.equal(await windowsFileVersion(executable), '6.4.0.0')
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
  assert.notEqual(target.exitCode, null)
  assert.equal(unrelated.exitCode, null)
  assert.equal(await windowsFileVersion(executable), '6.4.0.0')
  assert.equal(await readFile(sentinel, 'utf8'), 'preserve researcher data')
  const result = { passed: true, installationScope: 'current-user', directory, fileVersion: '6.4.0.0', rememberedDirectory: true, runningTargetStopped: true, unrelatedProcessPreserved: true, dataPreserved: true, limitation: 'Standard-user test; machine-wide UAC consent requires an administrator and was not exercised.' }
  await writeFile(join(root, 'upgrade-verification.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
} finally { for (const child of children) if (child.exitCode === null) child.kill() }
