import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

test('changing the application directory preserves the original fixed Python path and explicit selections', { skip: process.platform !== 'win32' }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-installer-user-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const previous = join(root, '旧 应用'), current = join(root, '新 应用'), appData = join(root, 'original-user')
  await mkdir(join(previous, 'Python'), { recursive: true })
  const location = join(appData, 'ZeroWall Science/python-location.json')
  const run = () => promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolve('tools/commands/installer-user-upgrade.ps1'), '-InstallRoot', current, '-OldInstallRoot', previous], { env: { ...process.env, LOCALAPPDATA: appData }, windowsHide: true })
  await run()
  assert.deepEqual(JSON.parse(await readFile(location)), { runtimeRoot: join(previous, 'Python'), source: 'user-selected', reason: 'preserved-install-directory-change' })
  const explicit = JSON.stringify({ runtimeRoot: join(root, '科研 Python'), source: 'user-selected' })
  await writeFile(location, explicit)
  await run()
  assert.equal(await readFile(location, 'utf8'), explicit)
})
