import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { copyFile, mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'

// Isolated app ID in .build/installer-test/config.cjs prevents changing the
// user's real installation registration. The native welcome screen is driven
// interactively; this harness verifies the outcome and keeps unrelated apps alive.
const root = resolve('.build/installer-upgrade-running')
const directory = join(root, '科研应用')
await mkdir(directory, { recursive: true })
const executable = join(directory, 'ZeroWallScience.exe')
await copyFile(process.execPath, executable)
await writeFile(join(directory, 'user-data-sentinel.txt'), 'retain existing data')
const target = spawn(executable, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true, stdio: 'ignore' })
await new Promise((ok, fail) => { target.once('spawn', ok); target.once('error', fail) })
const installer = spawn(resolve('.build/installer-test/zerowall-installer-test-6.3.0.exe'), [`/D=${directory}`], { windowsHide: true, stdio: 'ignore' })
console.log(JSON.stringify({ directory, targetPid: target.pid, installerPid: installer.pid }))
const deadline = setTimeout(() => installer.kill(), 300_000)
try {
  const exitCode = await new Promise((ok, fail) => { installer.once('exit', ok); installer.once('error', fail) })
  assert.equal(exitCode, 0)
  assert.notEqual(target.exitCode, null, 'Running target was not closed')
  await access(join(directory, 'resources/app.asar'))
  assert.equal(await readFile(join(directory, 'user-data-sentinel.txt'), 'utf8'), 'retain existing data')
  const result = { passed: true, exitCode, targetClosed: true, installed: true, userDataPreserved: true, directory }
  await writeFile(join(root, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
} finally { clearTimeout(deadline); if (target.exitCode === null) target.kill() }
