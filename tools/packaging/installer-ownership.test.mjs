import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm, cp, readdir, lstat } from 'node:fs/promises'
import { createHash, generateKeyPairSync } from 'node:crypto'
import { dirname, join, resolve, toNamespacedPath } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { writeInstallerOwnership } from './installer-ownership.mjs'
import { signCatalog } from '../release/resource-catalog.mjs'

async function signedPayload(root, payloadPath = 'profile-runtime.asar.unpacked/node_modules/plugin/new.css') {
  const source = join(root, 'source'), target = join(root, 'target')
  const payload = 'new signed runtime'
  await mkdir(join(source, 'resources/offline-profile', dirname(payloadPath)), { recursive: true })
  await mkdir(join(source, 'resources/commands'), { recursive: true })
  // Use the deployed verifier, including its dependency, rather than a test stub.
  await cp(resolve('tools/release/resource-catalog.mjs'), join(source, 'resources/commands/resource-catalog.mjs'))
  await cp(resolve('tools/commands/physical-fs.mjs'), join(source, 'resources/commands/physical-fs.mjs'))
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  await writeFile(join(source, 'resources/commands/trusted-keys.json'), JSON.stringify({ test: publicKey.export({ format: 'pem', type: 'spki' }) }))
  const receipt = signCatalog({ schema: 2, kind: 'offline-profile', payloadFiles: [{ path: payloadPath, size: Buffer.byteLength(payload), sha256: createHash('sha256').update(payload).digest('hex') }] }, privateKey, 'test')
  await writeFile(join(source, 'resources/offline-profile/receipt.json'), JSON.stringify(receipt))
  await writeFile(join(source, 'resources/offline-profile', payloadPath), payload)
  await writeFile(join(source, 'app.exe'), 'new application')
  await writeInstallerOwnership(source)
  await mkdir(join(target, 'resources/offline-profile', dirname(payloadPath)), { recursive: true })
  await writeFile(join(target, 'resources/offline-profile', payloadPath), 'damaged old runtime')
  await writeFile(join(target, 'resources/offline-profile/obsolete.css'), 'legacy extra')
  await writeFile(join(target, 'app.exe'), 'old application')
  await mkdir(join(target, 'Python'), { recursive: true })
  await writeFile(join(target, 'Python/python.exe'), 'user Python')
  await writeFile(join(target, 'resources/user.txt'), 'user resource')
  return { source, target, payloadPath, receipt }
}

for (const primaryFailure of [false, true]) test(`cleanup access denial preserves ${primaryFailure ? 'the primary failure and rolled-back' : 'the committed'} transaction for recovery`, async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-cleanup-pending-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const { source, target } = await signedPayload(root), log = join(root, 'install.log')
  const args = [resolve('tools/commands/installer-copy-files.mjs'), source, target, '--log', log]
  try {
    execFileSync(process.execPath, args, { windowsHide: true, stdio: 'pipe', env: { ...process.env, ZEROWALL_TEST_INSTALLER_CLEANUP_FAILURE: '1', ...(primaryFailure ? { ZEROWALL_TEST_INSTALLER_FAILURE_AT: '0' } : {}) } })
    assert.equal(primaryFailure, false)
  } catch (error) {
    assert.equal(primaryFailure, true)
    assert.match(error.stderr.toString(), /Injected installer transaction failure/u)
  }
  const journal = JSON.parse(await readFile(join(target, 'resources/installer-recovery/transaction.json')))
  assert.equal(journal.state, primaryFailure ? 'rolled-back' : 'committed')
  assert.equal(journal.cleanupPending, true)
  assert.equal(journal.cleanupError.code, 'EACCES')
  assert.equal(await readFile(join(target, 'app.exe'), 'utf8'), primaryFailure ? 'old application' : 'new application')
  assert.match(await readFile(log, 'utf16le'), /cleanup-error/u)
  execFileSync(process.execPath, args, { windowsHide: true, stdio: 'pipe' })
  assert.equal(await readFile(join(target, 'app.exe'), 'utf8'), 'new application')
  await assert.rejects(lstat(join(target, 'resources/installer-recovery')), { code: 'ENOENT' })
})

test('moved installer files including long customer paths inherit destination ACLs without touching user or Python ACLs', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-installer-acl-'))
  const acl = path => execFileSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from(`$ErrorActionPreference='Stop'; $acl=Get-Acl -LiteralPath '${path.replaceAll("'", "''")}'; [pscustomobject]@{protected=$acl.AreAccessRulesProtected;sddl=$acl.Sddl}|ConvertTo-Json -Compress`, 'utf16le').toString('base64')], { windowsHide: true, encoding: 'utf8' }).trim()
  try {
    const longPath = 'profile-runtime.asar.unpacked/node_modules/dsh-ppt-maker/skills/ppt-maker/reference/design_system/promotion/silver-gray-luxury-magazine/design.md'
    const { source, target } = await signedPayload(root, longPath)
    const stagedLongPath = join(target, 'resources/installer-recovery/stage/resources/offline-profile', longPath)
    assert(stagedLongPath.length > 260, 'Regression must exercise the customer MAX_PATH failure')
    await writeFile(join(source, 'resources/icon.ico'), 'native icon bytes')
    await writeInstallerOwnership(source)
    const sid = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value'], { windowsHide: true, encoding: 'utf8' }).trim()
    const incoming = ['app.exe', 'resources/icon.ico', 'resources/offline-profile/' + longPath]
    for (const local of incoming) execFileSync('icacls.exe', [toNamespacedPath(join(source, local)), '/inheritance:r', '/grant:r', `*${sid}:(F)`], { windowsHide: true, stdio: 'pipe' })
    const python = acl(join(target, 'Python/python.exe')), user = acl(join(target, 'resources/user.txt'))
    assert.equal(JSON.parse(acl(join(source, 'app.exe'))).protected, true)
    // Record the native tool boundary: this machine has LongPathsEnabled=1,
    // while customer installations must also work without that opt-in.
    const preload = join(root, 'record-acl.mjs'), invocation = join(root, 'acl-argument.txt')
    await writeFile(preload, `import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { writeFileSync } from 'node:fs'
const execute = childProcess.execFileSync
childProcess.execFileSync = function (file, args, options) {
  if (file === 'icacls.exe') writeFileSync(${JSON.stringify(invocation)}, args[0])
  return execute.call(this, file, args, options)
}
syncBuiltinESMExports()
`)
    execFileSync(process.execPath, ['--import', pathToFileURL(preload).href, resolve('tools/commands/installer-copy-files.mjs'), source, target, '--move-source'], { windowsHide: true, stdio: 'pipe' })
    assert.equal(await readFile(invocation, 'utf8'), toNamespacedPath(join(target, 'resources/installer-recovery/stage')))
    for (const local of incoming) {
      const installed = JSON.parse(acl(join(target, local)))
      assert.equal(installed.protected, false)
      assert.match(installed.sddl, /\(A;[^)]*ID;/u)
    }
    assert.equal(acl(join(target, 'Python/python.exe')), python)
    assert.equal(acl(join(target, 'resources/user.txt')), user)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('a genuine ACL failure restores the old installation and permits a clean retry', { skip: process.platform !== 'win32' }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-installer-acl-rollback-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const { source, target } = await signedPayload(root)
  const preload = join(root, 'deny-acl.mjs'), result = join(root, 'result.ini')
  await writeFile(preload, `import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
const execute = childProcess.execFileSync
childProcess.execFileSync = function (file, ...args) {
  if (file === 'icacls.exe') throw Object.assign(new Error('Injected native ACL denial'), { code: 'EPERM' })
  return execute.call(this, file, ...args)
}
syncBuiltinESMExports()
`)
  const args = [resolve('tools/commands/installer-copy-files.mjs'), source, target, '--result', result]
  assert.throws(() => execFileSync(process.execPath, ['--import', pathToFileURL(preload).href, ...args], { windowsHide: true, stdio: 'pipe' }), /Injected native ACL denial/u)
  assert.match(await readFile(result, 'utf16le'), /Phase=transaction-staging\r?\nCode=EPERM\r?\n/u)
  assert.match(await readFile(result, 'utf16le'), /Rollback=restored\r?\n/u)
  assert.equal(await readFile(join(target, 'app.exe'), 'utf8'), 'old application')
  assert.equal(await readFile(join(target, 'Python/python.exe'), 'utf8'), 'user Python')
  assert.equal(await readFile(join(target, 'resources/user.txt'), 'utf8'), 'user resource')
  execFileSync(process.execPath, args, { windowsHide: true, stdio: 'pipe' })
  assert.equal(await readFile(join(target, 'app.exe'), 'utf8'), 'new application')
})

test('installer preflight validates payload without changing the existing application, and persists failures', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-install-preflight-'))
  try {
    const { source, target, payloadPath } = await signedPayload(root)
    const log = join(root, 'installer.log')
    const args = [resolve('tools/commands/installer-copy-files.mjs'), source, target, '--preflight', '--log', log]
    execFileSync(process.execPath, args, { windowsHide: true })
    assert.equal(await readFile(join(target, 'app.exe'), 'utf8'), 'old application')
    assert.equal(await readFile(join(target, 'resources/offline-profile/obsolete.css'), 'utf8'), 'legacy extra')
    await writeFile(join(source, 'resources/offline-profile', payloadPath), 'tampered')
    assert.throws(() => execFileSync(process.execPath, args, { windowsHide: true, stdio: 'pipe' }))
    assert.equal(await readFile(join(target, 'app.exe'), 'utf8'), 'old application')
    assert.match(await readFile(log, 'utf16le'), /Incoming offline payload size or SHA-256 mismatch/u)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('installer bypasses persistent native CopyFile EPERM and removes its read-only partial before verified byte staging', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-installer-eperm-copy-'))
  try {
    const { source, target } = await signedPayload(root)
    const dll = 'd3dcompiler_47.dll'
    await writeFile(join(source, dll), 'complete DirectX runtime payload')
    await writeFile(join(source, `${dll}.partial`), 'legitimate payload file ending in .partial')
    await writeInstallerOwnership(source)
    const log = join(root, 'install.log')
    execFileSync(process.execPath, [resolve('tools/commands/installer-copy-files.mjs'), source, target, '--log', log], {
      windowsHide: true,
      stdio: 'pipe',
      env: {
        ...process.env,
        ZEROWALL_TEST_INSTALLER_COPY_EPERM_FILE: dll,
        ZEROWALL_TEST_INSTALLER_COPY_EPERM_COUNT: '11',
        ZEROWALL_TEST_INSTALLER_COPY_READONLY_PARTIAL: '1',
      },
    })
    assert.equal(await readFile(join(target, dll), 'utf8'), 'complete DirectX runtime payload')
    assert.equal(await readFile(join(target, `${dll}.partial`), 'utf8'), 'legitimate payload file ending in .partial')
    assert.equal(await readFile(join(target, 'app.exe'), 'utf8'), 'new application')
    assert.equal(await readFile(join(target, 'Python/python.exe'), 'utf8'), 'user Python')
    assert.equal(await readFile(join(target, 'resources/user.txt'), 'utf8'), 'user resource')
    assert.match(await readFile(log, 'utf16le'), /native-copy-denied; using verified byte copy; file=d3dcompiler_47\.dll; code=EPERM/u)
    await assert.rejects(readdir(join(target, 'resources/installer-recovery')), { code: 'ENOENT' })
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('persistent staging EPERM returns the permission code only after restoring the old installation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-installer-eperm-persistent-'))
  try {
    const { source, target } = await signedPayload(root)
    const dll = 'd3dcompiler_47.dll', result = join(root, 'copy-result.ini')
    await writeFile(join(source, dll), 'complete DirectX runtime payload')
    await writeInstallerOwnership(source)
    assert.throws(() => execFileSync(process.execPath, [resolve('tools/commands/installer-copy-files.mjs'), source, target, '--result', result], {
      windowsHide: true,
      stdio: 'pipe',
      env: { ...process.env, ZEROWALL_TEST_INSTALLER_COPY_EPERM_FILE: dll, ZEROWALL_TEST_INSTALLER_COPY_EPERM_COUNT: '11', ZEROWALL_TEST_INSTALLER_BYTE_EPERM_FILE: dll },
    }), /EPERM/u)
    const outcome = await readFile(result, 'utf16le')
    assert.match(outcome, /Phase=transaction-staging\r?\nCode=EPERM\r?\n/u)
    assert.match(outcome, /Rollback=restored\r?\n/u)
    assert.equal(await readFile(join(target, 'app.exe'), 'utf8'), 'old application')
    assert.equal(await readFile(join(target, 'Python/python.exe'), 'utf8'), 'user Python')
    assert.equal(await readFile(join(target, 'resources/user.txt'), 'utf8'), 'user resource')
    await assert.rejects(lstat(join(target, dll)), { code: 'ENOENT' })
    await assert.rejects(lstat(join(target, 'resources/installer-recovery')), { code: 'ENOENT' })
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('installer recovery removes an interrupted atomic-copy partial before retrying', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-installer-partial-recovery-'))
  try {
    const { source, target } = await signedPayload(root)
    const dll = 'd3dcompiler_47.dll'
    await writeFile(join(source, dll), 'complete DirectX runtime payload')
    await writeInstallerOwnership(source)
    const recovery = join(target, 'resources/installer-recovery')
    const partial = join(recovery, 'stage-partial', dll)
    await mkdir(dirname(partial), { recursive: true })
    await writeFile(partial, 'interrupted partial bytes')
    await writeFile(join(recovery, 'transaction.json'), JSON.stringify({
      schema: 1,
      root: target,
      state: 'staging',
      rows: [{ local: dll, original: false, incoming: true }],
    }))
    execFileSync(process.execPath, [resolve('tools/commands/installer-copy-files.mjs'), source, target], { windowsHide: true, stdio: 'pipe' })
    assert.equal(await readFile(join(target, dll), 'utf8'), 'complete DirectX runtime payload')
    assert.equal(await readFile(join(target, 'app.exe'), 'utf8'), 'new application')
    await assert.rejects(readdir(recovery), { code: 'ENOENT' })
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('permission retry reextracts a complete payload after move-source staging consumed files', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-installer-move-retry-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const { source, target } = await signedPayload(root)
  const archive = join(root, 'archive'), retry = join(root, 'payload-2'), result = join(root, 'copy-result.ini')
  await cp(source, archive, { recursive: true })
  const script = resolve('tools/commands/installer-copy-files.mjs')
  assert.throws(() => execFileSync(process.execPath, [script, source, target, '--move-source', '--result', result], {
    windowsHide: true, stdio: 'pipe',
    env: { ...process.env, ZEROWALL_TEST_INSTALLER_STAGING_EPERM_FILE: 'app.exe' },
  }), /EPERM/u)
  assert.match(await readFile(result, 'utf16le'), /Phase=transaction-staging\r?\nCode=EPERM\r?\n/u)
  assert.match(await readFile(result, 'utf16le'), /Rollback=restored\r?\n/u)
  await assert.rejects(lstat(join(source, 'app.exe')), { code: 'ENOENT' })
  assert.equal(await readFile(join(target, 'app.exe'), 'utf8'), 'old application')
  await cp(archive, retry, { recursive: true })
  execFileSync(process.execPath, [script, retry, target, '--move-source'], { windowsHide: true, stdio: 'pipe' })
  assert.equal(await readFile(join(target, 'app.exe'), 'utf8'), 'new application')
  assert.equal(await readFile(join(target, 'Python/python.exe'), 'utf8'), 'user Python')
  assert.equal(await readFile(join(target, 'resources/user.txt'), 'utf8'), 'user resource')
  const extraction = await readFile(resolve('desktop/build/installer-extraction.nsh'), 'utf8')
  assert.match(extraction, /zerowall_extract_retry:[\s\S]*IntOp \$ZeroWallAttempt \$ZeroWallAttempt \+ 1[\s\S]*StrCpy \$ZeroWallPayloadDirectory "\$PLUGINSDIR\\payload-\$ZeroWallAttempt"[\s\S]*Nsis7z::Extract/u)
})

for (const oldReceipt of ['missing', 'corrupt', 'older expanded layout']) test(`upgrade replaces legacy offline payload with ${oldReceipt} receipt and deletes obsolete files`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-offline-upgrade-'))
  try {
    const { source, target, payloadPath } = await signedPayload(root)
    if (oldReceipt === 'corrupt') await writeFile(join(target, 'resources/offline-profile/receipt.json'), '{broken')
    const olderFiles = ['modules/legacy/package.json', 'packages/legacy.tgz', 'build-receipt.json', 'old-runtime.zip']
    if (oldReceipt === 'older expanded layout') {
      await writeFile(join(target, 'resources/offline-profile/receipt.json'), JSON.stringify({ schema: 1, applicationVersion: '8.0.8' }))
      for (const file of olderFiles) {
        await mkdir(dirname(join(target, 'resources/offline-profile', file)), { recursive: true })
        await writeFile(join(target, 'resources/offline-profile', file), 'obsolete from an older layout')
      }
    }
    execFileSync(process.env.ZEROWALL_TEST_ELECTRON ?? process.execPath, [resolve('tools/commands/installer-copy-files.mjs'), source, target], { windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
    assert.equal(await readFile(join(target, 'app.exe'), 'utf8'), 'new application')
    assert.equal(await readFile(join(target, 'resources/offline-profile', payloadPath), 'utf8'), 'new signed runtime')
    assert.deepEqual(await readFile(join(target, 'resources/offline-profile/receipt.json')), await readFile(join(source, 'resources/offline-profile/receipt.json')))
    await assert.rejects(readFile(join(target, 'resources/offline-profile/obsolete.css')), /ENOENT/)
    if (oldReceipt === 'older expanded layout') for (const file of olderFiles) await assert.rejects(readFile(join(target, 'resources/offline-profile', file)), /ENOENT/)
    await assert.rejects(readdir(join(target, 'resources/installer-recovery')), /ENOENT/)
    assert.equal(await readFile(join(target, 'Python/python.exe'), 'utf8'), 'user Python')
    assert.equal(await readFile(join(target, 'resources/user.txt'), 'utf8'), 'user resource')
  } finally { await rm(root, { recursive: true, force: true }) }
})

for (const corruption of ['signature', 'same-size payload', 'unsigned file', 'missing receipt']) test(`incoming ${corruption} is rejected before touching the old installation`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-offline-reject-'))
  try {
    const { source, target, payloadPath, receipt } = await signedPayload(root)
    if (corruption === 'signature') await writeFile(join(source, 'resources/offline-profile/receipt.json'), JSON.stringify({ ...receipt, kind: 'tampered' }))
    if (corruption === 'same-size payload') await writeFile(join(source, 'resources/offline-profile', payloadPath), 'bad signed runtime')
    if (corruption === 'unsigned file') {
      await writeFile(join(source, 'resources/offline-profile/unsigned.txt'), 'untrusted')
      await writeInstallerOwnership(source)
    }
    if (corruption === 'missing receipt') {
      await rm(join(source, 'resources/offline-profile/receipt.json'))
      await writeInstallerOwnership(source)
    }
    assert.throws(() => execFileSync(process.execPath, [resolve('tools/commands/installer-copy-files.mjs'), source, target], { windowsHide: true, stdio: 'pipe' }))
    assert.equal(await readFile(join(target, 'app.exe'), 'utf8'), 'old application')
    assert.equal(await readFile(join(target, 'resources/offline-profile', payloadPath), 'utf8'), 'damaged old runtime')
    assert.equal(await readFile(join(target, 'resources/offline-profile/obsolete.css'), 'utf8'), 'legacy extra')
    await assert.rejects(readdir(join(target, 'resources/installer-recovery')), /ENOENT/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('real uninstall removes only packaged files and preserves Python and unowned files', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-uninstall-'))
  try {
    await mkdir(join(root, 'resources/commands'), { recursive: true })
    await writeFile(join(root, 'app.exe'), 'packaged')
    await cp(resolve('tools/commands/uninstall-owned-files.ps1'), join(root, 'resources/commands/uninstall-owned-files.ps1'))
    await writeInstallerOwnership(root)
    await mkdir(join(root, 'Python/Lib/site-packages'), { recursive: true })
    await writeFile(join(root, 'Python/python.exe'), 'preserved-python')
    await writeFile(join(root, 'Python/Lib/site-packages/pandas.py'), 'custom-version')
    await writeFile(join(root, 'resources/user.txt'), 'preserved-user')
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'resources/commands/uninstall-owned-files.ps1'), '-InstallRoot', root], { windowsHide: true })
    assert.equal(await readFile(join(root, 'Python/python.exe'), 'utf8'), 'preserved-python')
    assert.equal(await readFile(join(root, 'Python/Lib/site-packages/pandas.py'), 'utf8'), 'custom-version')
    assert.equal(await readFile(join(root, 'resources/user.txt'), 'utf8'), 'preserved-user')
    await assert.rejects(readFile(join(root, 'app.exe')), /ENOENT/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('transaction failure restores replaced files and ownership while preserving unknown files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-transaction-'))
  try {
    const { source, target } = await signedPayload(root)
    await writeFile(join(target,'obsolete-owned.txt'),'old owned')
    await writeFile(join(target,'resources/installer-owned.json'),JSON.stringify({schema:1,files:['app.exe','obsolete-owned.txt','resources/installer-owned.json']}))
    const before = await readFile(join(target,'resources/installer-owned.json'))
    assert.throws(() => execFileSync(process.execPath,[resolve('tools/commands/installer-copy-files.mjs'),source,target],{windowsHide:true,stdio:'pipe',env:{...process.env,ZEROWALL_TEST_INSTALLER_FAILURE_AT:'0'}}))
    assert.equal(await readFile(join(target,'app.exe'),'utf8'),'old application')
    assert.equal(await readFile(join(target,'obsolete-owned.txt'),'utf8'),'old owned')
    assert.deepEqual(await readFile(join(target,'resources/installer-owned.json')),before)
    assert.equal(await readFile(join(target,'resources/user.txt'),'utf8'),'user resource')
    await assert.rejects(readdir(join(target,'resources/installer-recovery')),/ENOENT/)
    execFileSync(process.execPath,[resolve('tools/commands/installer-copy-files.mjs'),source,target],{windowsHide:true})
    await assert.rejects(readFile(join(target,'obsolete-owned.txt')),/ENOENT/)
  } finally { await rm(root,{recursive:true,force:true}) }
})

test('interrupted applying transaction is restored before retry and stale ownership is recalculated', async () => {
  const root=await mkdtemp(join(tmpdir(),'zws-recovery-'))
  try {
    const {source,target}=await signedPayload(root)
    const recovery=join(target,'resources/installer-recovery')
    await mkdir(join(recovery,'backup'),{recursive:true})
    await writeFile(join(recovery,'backup/app.exe'),'old application')
    await writeFile(join(target,'app.exe'),'partial application')
    await writeFile(join(target,'interrupted-new.txt'),'partial new file')
    await writeFile(join(recovery,'transaction.json'),JSON.stringify({schema:1,root:target,state:'applying',rows:[{local:'app.exe',original:true,incoming:true},{local:'interrupted-new.txt',original:false,incoming:true}]}))
    execFileSync(process.execPath,[resolve('tools/commands/installer-copy-files.mjs'),source,target],{windowsHide:true})
    assert.equal(await readFile(join(target,'app.exe'),'utf8'),'new application')
    await assert.rejects(readFile(join(target,'interrupted-new.txt')),/ENOENT/)
    await assert.rejects(readdir(recovery),/ENOENT/)
    assert.equal(await readFile(join(target,'Python/python.exe'),'utf8'),'user Python')
  } finally { await rm(root,{recursive:true,force:true}) }
})

for (const checkpoint of ['initial-journal-directory', 'initial-journal-temp']) test(`interrupted ${checkpoint} recovers before any installed-file mutation`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-initial-journal-'))
  try {
    const { source, target, payloadPath } = await signedPayload(root)
    const args = [resolve('tools/commands/installer-copy-files.mjs'), source, target]
    assert.throws(() => execFileSync(process.execPath, args, { windowsHide: true, stdio: 'pipe', env: { ...process.env, ZEROWALL_TEST_INSTALLER_FAILURE_AT: checkpoint } }), /Injected installer initial journal/u)
    const recovery = join(target, 'resources/installer-recovery')
    assert.deepEqual(await readdir(recovery), checkpoint === 'initial-journal-temp' ? ['transaction.json.tmp'] : [])
    assert.equal(await readFile(join(target, 'app.exe'), 'utf8'), 'old application')
    assert.equal(await readFile(join(target, 'resources/offline-profile', payloadPath), 'utf8'), 'damaged old runtime')
    assert.equal(await readFile(join(target, 'resources/offline-profile/obsolete.css'), 'utf8'), 'legacy extra')
    execFileSync(process.execPath, args, { windowsHide: true, stdio: 'pipe' })
    assert.equal(await readFile(join(target, 'app.exe'), 'utf8'), 'new application')
    assert.equal(await readFile(join(target, 'Python/python.exe'), 'utf8'), 'user Python')
    assert.equal(await readFile(join(target, 'resources/user.txt'), 'utf8'), 'user resource')
    await assert.rejects(readdir(recovery), /ENOENT/u)
  } finally { await rm(root, { recursive: true, force: true }) }
})

for (const corruption of ['truncated JSON', 'applying checkpoint', 'incomplete inventory', 'changed original', 'unknown file', 'unknown stage directory']) test(`missing initial journal fails closed with ${corruption}`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-initial-reject-'))
  try {
    const { source, target } = await signedPayload(root)
    const args = [resolve('tools/commands/installer-copy-files.mjs'), source, target]
    assert.throws(() => execFileSync(process.execPath, args, { windowsHide: true, stdio: 'pipe', env: { ...process.env, ZEROWALL_TEST_INSTALLER_FAILURE_AT: 'initial-journal-temp' } }))
    const recovery = join(target, 'resources/installer-recovery'), temporary = join(recovery, 'transaction.json.tmp')
    if (corruption === 'truncated JSON') await writeFile(temporary, '{"schema":1,')
    if (['applying checkpoint', 'incomplete inventory', 'changed original'].includes(corruption)) {
      const document = JSON.parse(await readFile(temporary, 'utf8'))
      if (corruption === 'applying checkpoint') document.state = 'applying'
      if (corruption === 'incomplete inventory') document.rows = document.rows.filter(row => row.local !== 'app.exe')
      if (corruption === 'changed original') document.rows.find(row => row.local === 'app.exe').original = false
      await writeFile(temporary, JSON.stringify(document))
    }
    if (corruption === 'unknown file') await writeFile(join(recovery, 'user.txt'), 'do not remove')
    if (corruption === 'unknown stage directory') await mkdir(join(recovery, 'stage'))
    const before = await readFile(temporary), entries = await readdir(recovery)
    assert.throws(() => execFileSync(process.execPath, args, { windowsHide: true, stdio: 'pipe' }))
    assert.deepEqual(await readFile(temporary), before)
    assert.deepEqual(await readdir(recovery), entries)
    assert.equal(await readFile(join(target, 'app.exe'), 'utf8'), 'old application')
    assert.equal(await readFile(join(target, 'resources/offline-profile/obsolete.css'), 'utf8'), 'legacy extra')
    assert.equal(await readFile(join(target, 'resources/user.txt'), 'utf8'), 'user resource')
    assert.equal(await readFile(join(target, 'Python/python.exe'), 'utf8'), 'user Python')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('commit journal failure restores the complete old installation and removes introduced files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-commit-journal-'))
  try {
    const { source, target, payloadPath } = await signedPayload(root)
    await writeFile(join(source, 'introduced.txt'), 'new file that must be removed')
    await writeInstallerOwnership(source)
    await writeFile(join(target, 'obsolete-owned.txt'), 'old owned')
    const oldInventory = JSON.stringify({ schema: 1, files: ['app.exe', 'obsolete-owned.txt', 'resources/installer-owned.json'] })
    await writeFile(join(target, 'resources/installer-owned.json'), oldInventory)
    assert.throws(() => execFileSync(process.execPath, [resolve('tools/commands/installer-copy-files.mjs'), source, target], {
      windowsHide: true, stdio: 'pipe', env: { ...process.env, ZEROWALL_TEST_INSTALLER_FAILURE_AT: 'commit-journal' },
    }), /Injected installer commit journal failure/u)
    assert.equal(await readFile(join(target, 'app.exe'), 'utf8'), 'old application')
    assert.equal(await readFile(join(target, 'obsolete-owned.txt'), 'utf8'), 'old owned')
    assert.equal(await readFile(join(target, 'resources/installer-owned.json'), 'utf8'), oldInventory)
    assert.equal(await readFile(join(target, 'resources/offline-profile', payloadPath), 'utf8'), 'damaged old runtime')
    assert.equal(await readFile(join(target, 'resources/offline-profile/obsolete.css'), 'utf8'), 'legacy extra')
    assert.equal(await readFile(join(target, 'Python/python.exe'), 'utf8'), 'user Python')
    assert.equal(await readFile(join(target, 'resources/user.txt'), 'utf8'), 'user resource')
    await assert.rejects(readFile(join(target, 'introduced.txt')), /ENOENT/u)
    await assert.rejects(readFile(join(target, 'resources/commands/resource-catalog.mjs')), /ENOENT/u)
    await assert.rejects(readFile(join(target, 'resources/offline-profile/receipt.json')), /ENOENT/u)
    await assert.rejects(readdir(join(target, 'resources/installer-recovery')), /ENOENT/u)
    execFileSync(process.execPath, [resolve('tools/commands/installer-copy-files.mjs'), source, target], { windowsHide: true })
    assert.equal(await readFile(join(target, 'introduced.txt'), 'utf8'), 'new file that must be removed')
    await assert.rejects(readFile(join(target, 'obsolete-owned.txt')), /ENOENT/u)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('interrupted recovery recalculates closed offline files restored from backup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-recovery-offline-'))
  try {
    const { source, target } = await signedPayload(root)
    const local = 'resources/offline-profile/obsolete.css'
    const recovery = join(target, 'resources/installer-recovery')
    await mkdir(dirname(join(recovery, 'backup', local)), { recursive: true })
    await writeFile(join(recovery, 'backup', local), 'legacy file moved away before interruption')
    await rm(join(target, local))
    // This file is from an older expanded layout and has no old inventory.
    await writeFile(join(recovery, 'transaction.json'), JSON.stringify({ schema: 1, root: target, state: 'applying', rows: [{ local, original: true, incoming: false }] }))
    execFileSync(process.execPath, [resolve('tools/commands/installer-copy-files.mjs'), source, target], { windowsHide: true })
    await assert.rejects(readFile(join(target, local)), /ENOENT/u)
    await assert.rejects(readdir(recovery), /ENOENT/u)
    assert.equal(await readFile(join(target, 'app.exe'), 'utf8'), 'new application')
    assert.equal(await readFile(join(target, 'resources/user.txt'), 'utf8'), 'user resource')
    assert.equal(await readFile(join(target, 'Python/python.exe'), 'utf8'), 'user Python')
  } finally { await rm(root, { recursive: true, force: true }) }
})

for (const byteFallback of [false, true]) test(`bundled Electron copies raw ASAR bytes and ignores unowned runtime files with byte fallback ${byteFallback}`, { skip: !process.env.ZEROWALL_TEST_ELECTRON }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-electron-copy-'))
  const source = join(root, 'source'), input = join(root, 'archive-input'), target = join(root, 'target')
  try {
    await mkdir(join(source, 'resources'), { recursive: true })
    await mkdir(join(input, 'Python'), { recursive: true })
    await writeFile(join(input, 'Python/not-an-active-runtime.txt'), 'archived')
    const { createPackageWithOptions } = createRequire(new URL('../../desktop/package.json', import.meta.url))('@electron/asar')
    await createPackageWithOptions(input, join(source, 'resources/app.asar'), {})
    await writeInstallerOwnership(source)
    await mkdir(join(source, 'Python'), { recursive: true })
    await writeFile(join(source, 'Python/not-owned.txt'), 'test-environment')
    execFileSync(process.env.ZEROWALL_TEST_ELECTRON, [resolve('tools/commands/installer-copy-files.mjs'), source, target], { windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1',
      ...(byteFallback ? { ZEROWALL_TEST_INSTALLER_COPY_EPERM_FILE: 'app.asar', ZEROWALL_TEST_INSTALLER_COPY_EPERM_COUNT: '11', ZEROWALL_TEST_INSTALLER_COPY_READONLY_PARTIAL: '1' } : {}),
    } })
    assert.deepEqual(await readFile(join(target, 'resources/app.asar')), await readFile(join(source, 'resources/app.asar')))
    await assert.rejects(readFile(join(target, 'Python/not-owned.txt')), /ENOENT/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('upgrade preserves an unmanaged legacy installation and rejects unsafe inventory before deleting', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-upgrade-'))
  const script = resolve('tools/commands/uninstall-owned-files.ps1')
  const run = () => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-InstallRoot', root, '-PreserveIfUnmanaged'], { windowsHide: true, stdio: 'pipe' })
  try {
    await mkdir(join(root, 'resources'), { recursive: true })
    await writeFile(join(root, 'app.exe'), 'existing')
    run()
    assert.equal(await readFile(join(root, 'app.exe'), 'utf8'), 'existing')
    await writeFile(join(root, 'resources/installer-owned.json'), JSON.stringify({ schema: 1, files: ['app.exe', 'Python/python.exe'] }))
    assert.throws(run)
    assert.equal(await readFile(join(root, 'app.exe'), 'utf8'), 'existing')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('installer copies and uninstalls owned files beyond MAX_PATH while preserving Python', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-long-install-'))
  const source = join(root, 'payload'), target = join(root, '安装 目录', 'ZeroWallScience')
  const local = join('resources', 'extensions', ...Array.from({ length: 5 }, (_, i) => `long-component-${i}-${'x'.repeat(35)}`), 'asset.json')
  try {
    await mkdir(dirname(join(source, local)), { recursive: true })
    await writeFile(join(source, local), 'verified-long-path-resource')
    await writeInstallerOwnership(source)
    await mkdir(target, { recursive: true })
    await mkdir(join(target, 'Python'), { recursive: true })
    await writeFile(join(target, 'Python/python.exe'), 'preserved')
    execFileSync(process.execPath, [resolve('tools/commands/installer-copy-files.mjs'), source, target], { windowsHide: true })
    assert.ok(join(target, local).length > 300)
    assert.equal(await readFile(join(target, local), 'utf8'), 'verified-long-path-resource')
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolve('tools/commands/uninstall-owned-files.ps1'), '-InstallRoot', target], { windowsHide: true })
    assert.equal(await readFile(join(target, 'Python/python.exe'), 'utf8'), 'preserved')
    await assert.rejects(readFile(join(target, local)), /ENOENT/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
