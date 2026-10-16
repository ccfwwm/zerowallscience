import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { commandRegistrationFingerprint, installerTestIdentity, verifyInstallerTestContract, writeInstallerTestContract } from '../../tools/packaging/installer-test-contract.mjs'

const root = resolve(import.meta.dirname, '../..')
const read = name => readFile(resolve(root, name), 'utf8')

test('installer upgrade regression uses an isolated NSIS contract', async () => {
  const [config, define, nsis, stable, commandPath, verifier] = await Promise.all([
    read('desktop/build/electron-builder.installer-test.cjs'),
    read('desktop/build/installer-test.nsh'),
    read('desktop/build/installer.nsh'),
    read('desktop/build/electron-builder.stable.cjs'),
    read('tools/commands/install-command-path.ps1'),
    read('desktop/scripts/verify-installer-upgrade.mjs'),
  ])

  assert.match(config, /com\.zerowall\.science\.installer-test-\$\{key\}/u)
  assert.match(config, /installer-test-\$\{key\}/u)
  assert.match(config, /zerowall-installer-test-\$\{version\}\.exe/u)
  assert.match(config, /installer-test\.nsh/u)
  assert.match(define, /!define\s+ZW_INSTALLER_TEST_MODE/u)
  assert.match(define, /!if "\$\{APP_ID\}" != "com\.zerowall\.science\.installer-test-/u)
  assert.match(define, /!include "\$\{__FILEDIR__\}\\installer\.nsh"/u)
  const testModeExcluded = [...nsis.matchAll(/!ifndef ZW_INSTALLER_TEST_MODE\r?\n([\s\S]*?)^\s*!endif/gmu)].map(match => match[1])
  assert.equal(testModeExcluded.length, 3)
  assert.match(testModeExcluded[0], /install-command-path\.ps1" install/u)
  assert.match(testModeExcluded[1], /install-command-path\.ps1" remove/u)
  assert.match(testModeExcluded[2], /ReadRegStr.*ZEROWALL_V2_UNINSTALL_REGKEY/u)
  assert.match(testModeExcluded[2], /taskkill\.exe/u)
  assert.match(testModeExcluded[2], /ExecWait '\$R8 \/S'/u)
  const testMode = testModeExcluded.reduce((source, block) => source.replace(block, ''), nsis)
  assert.doesNotMatch(testMode, /install-command-path\.ps1|ReadRegStr.*ZEROWALL_V2_UNINSTALL_REGKEY|taskkill\.exe|ExecWait '\$R8/u)
  assert.match(nsis, /--stop-running\s+"\$INSTDIR\\\$\{APP_EXECUTABLE_FILENAME\}"/u)
  assert.match(commandPath, /Software\\ZeroWallScience\\Command/u)
  assert.match(commandPath, /Global\\ZeroWallScience\.Command\./u)
  assert.match(verifier, /installer-test-\$\{versionKey\}/u)
  assert.match(verifier, /zerowall-installer-test-\$\{version\}\.exe/u)
  assert.match(stable, /appId:\s*'com\.zerowall\.science'/u)
  assert.doesNotMatch(stable, /installer-test\.nsh|ZW_INSTALLER_TEST_MODE/u)
  assert.ok(verifier.indexOf('await verifyInstallerTestContract(') < verifier.indexOf('await run(installer,'))
  assert.match(verifier, /commandRegistrationUnchanged: true/u)
  assert.doesNotMatch(config, /Software\\ZeroWallScience\\Command/u)
})

test('guarded build receipts reject old, mismatched, and altered installer bytes before execution', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zws-isolated-contract-'))
  const version = '8.3.0'
  const identity = installerTestIdentity(version)
  const installer = join(directory, identity.artifactName)
  const configuration = { ...identity, nsis: { include: identity.include }, directories: { output: directory }, publish: null }
  const result = { configuration, artifactPaths: [installer] }
  try {
    await writeFile(installer, 'isolated installer fixture')
    await assert.rejects(verifyInstallerTestContract(installer, version), /ENOENT/u)
    await assert.rejects(writeInstallerTestContract({ ...result, configuration: { ...configuration, appId: 'com.zerowall.science' } }, version))
    await assert.rejects(writeInstallerTestContract({ ...result, configuration: { ...configuration, nsis: { include: 'build/installer.nsh' } } }, version))
    await writeInstallerTestContract(result, version)
    assert.equal((await verifyInstallerTestContract(installer, version)).commandRegistration, 'skipped')
    await assert.rejects(verifyInstallerTestContract(installer, '8.2.1'))
    await writeFile(installer, 'modified installer fixture')
    await assert.rejects(verifyInstallerTestContract(installer, version), /guarded build receipt/u)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('formal command registry fingerprints are stable across read-only probes', { skip: process.platform !== 'win32' }, async () => {
  const first = await commandRegistrationFingerprint()
  assert.match(first, /^[A-F0-9]{64}$/u)
  assert.equal(await commandRegistrationFingerprint(), first)
})
