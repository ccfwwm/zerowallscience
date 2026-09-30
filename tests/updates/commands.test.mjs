import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createConnection } from 'node:net'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { startCommandServer } from '../../desktop/src/main/command-server.ts'
import { commandPathWorker } from '../../tools/commands/path-worker.mjs'
const run = promisify(execFile)

test('real CLI socket authenticates the owner, rejects another token and supports zws', async () => {
  const home = await mkdtemp(join(tmpdir(), 'zws-command-'))
  let calls = 0
  const stop = await startCommandServer(home, async request => {
    calls++
    if (request.operation === 'skill.disable') { assert.deepEqual(request.args, ['fixture', false]); return }
    assert.equal(request.operation, 'python.status'); return { ready: false }
  })
  try {
    const endpoint = JSON.parse(await readFile(join(home, 'command-endpoint.json')))
    const denied = await new Promise((accept, reject) => {
      const socket = createConnection(endpoint.address); let output = ''
      socket.on('error', reject)
      socket.on('connect', () => socket.write(JSON.stringify({ token: 'another-owner', operation: 'python.status', args: [] }) + '\n'))
      socket.on('data', chunk => { output += chunk })
      socket.on('end', () => accept(JSON.parse(output)))
    })
    assert.equal(denied.ok, false); assert.equal(calls, 0)
    const result = await run(process.execPath, ['tools/commands/zws.mjs', '--user-data', home, 'python', 'status'], { windowsHide: true })
    assert.deepEqual(JSON.parse(result.stdout), { ready: false }); assert.equal(calls, 1)
    const disabled = await run(process.execPath, ['tools/commands/zws.mjs', '--user-data', home, 'skill', 'disable', 'fixture'], { windowsHide: true })
    assert.deepEqual(JSON.parse(disabled.stdout), { ok: true }); assert.equal(calls, 2)
  } finally { await stop(); await rm(home, { recursive: true, force: true }) }
})

test('Windows PATH owner preserves external commands and removes only its own entry', { skip: process.platform !== 'win32' }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'zws-path-'))
  const script = join(home, 'path-test.ps1')
  const worker = join(home, 'command-path.ps1')
  await writeFile(worker, await commandPathWorker())
  await mkdir(join(home, 'commands'))
  await writeFile(join(home, 'commands/dsh.cmd'), '@echo off\r\n')
  const id = randomUUID()
  const quote = value => "'" + value.replaceAll("'", "''") + "'"
  await writeFile(script, `
$ErrorActionPreference='Stop'
. ${quote(worker)}
$environmentKey='Software\\ZeroWallScience\\Tests\\${id}\\Environment'
$ownerKey='Software\\ZeroWallScience\\Tests\\${id}\\Owner'
$testKey='Software\\ZeroWallScience\\Tests\\${id}'
$environment=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($environmentKey)
try { $environment.SetValue('Path','C:\\external-dsh;C:\\preserved',[Microsoft.Win32.RegistryValueKind]::ExpandString) } finally { $environment.Dispose() }
$options=@{EnvironmentKey=$environmentKey;OwnerKey=$ownerKey;MachinePath='';MutexName='Local\\ZwsPathTest.${id}'}
$directory=${quote(join(home, 'commands'))}
try {
  $state=Invoke-DshCommandPath -Request @{operation='inspect';directory=$directory} @options
  $state=Invoke-DshCommandPath -Request @{operation='install';directory=$directory;expected=$state.fingerprint} @options
  $environment=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($environmentKey)
  try { $installed=$environment.GetValue('Path') } finally { $environment.Dispose() }
  if ($installed -ne ('C:\\external-dsh;C:\\preserved;'+$directory)) { throw 'Existing PATH order changed' }
  $state=Invoke-DshCommandPath -Request @{operation='inspect';directory=$directory} @options
  $state=Invoke-DshCommandPath -Request @{operation='remove';directory='C:\\unowned';expected=$state.fingerprint} @options
} catch { if ($_.Exception.Data['code'] -ne 'ESTALE') { throw } }
try {
  $state=Invoke-DshCommandPath -Request @{operation='inspect';directory=$directory} @options
  $state=Invoke-DshCommandPath -Request @{operation='remove';directory=$directory;expected=$state.fingerprint} @options
  $environment=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($environmentKey)
  try { if ($environment.GetValue('Path') -ne 'C:\\external-dsh;C:\\preserved') { throw 'Uninstall removed external PATH' } } finally { $environment.Dispose() }
  'PATH ownership verified'
} finally { [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree($testKey,$false) }
`)
  try { const result = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true }); assert.match(result.stdout, /ownership verified/) }
  finally { await rm(home, { recursive: true, force: true }) }
})
