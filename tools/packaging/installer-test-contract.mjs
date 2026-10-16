import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'

const receiptName = 'isolated-installer-contract.json'
const execFileAsync = promisify(execFile)

// Read only: hash existence, unexpanded PATH, value kinds, and all command
// owner values in both scopes, without exposing those values in tool output.
export async function commandRegistrationFingerprint() {
  assert.equal(process.platform, 'win32', 'Installer isolation verification requires Windows')
  const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
  const script = String.raw`
$ErrorActionPreference='Stop'
$state=@()
foreach($hive in @([Microsoft.Win32.Registry]::CurrentUser,[Microsoft.Win32.Registry]::LocalMachine)) {
  $environment=if($hive.Name -eq 'HKEY_CURRENT_USER'){'Environment'}else{'SYSTEM\CurrentControlSet\Control\Session Manager\Environment'}
  foreach($path in @($environment,'Software\ZeroWallScience\Command')) {
    $key=$hive.OpenSubKey($path)
    try {
      $values=@()
      if($key) {
        foreach($name in @($key.GetValueNames() | Sort-Object)) {
          if($path -ne $environment -or $name -ieq 'Path') {
            $values+=[ordered]@{name=$name;kind=[string]$key.GetValueKind($name);value=$key.GetValue($name,$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)}
          }
        }
      }
      $state+=[ordered]@{hive=$hive.Name;path=$path;exists=($null -ne $key);values=$values}
    } finally {if($key){$key.Dispose()}}
  }
}
$bytes=[Text.Encoding]::UTF8.GetBytes(($state | ConvertTo-Json -Depth 8 -Compress))
$hash=[Security.Cryptography.SHA256]::Create()
try {[BitConverter]::ToString($hash.ComputeHash($bytes)).Replace('-','')} finally {$hash.Dispose()}
`
  const { stdout } = await execFileAsync(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 15_000 })
  const fingerprint = stdout.trim()
  assert.match(fingerprint, /^[A-F0-9]{64}$/u, 'Could not fingerprint the formal command registration')
  return fingerprint
}

export function installerTestIdentity(version) {
  assert.match(version, /^\d+\.\d+\.\d+$/u)
  const key = version.replaceAll('.', '')
  return {
    appId: `com.zerowall.science.installer-test-${key}`,
    productName: `ZeroWall Installer Test ${key}`,
    artifactName: `zerowall-installer-test-${version}.exe`,
    include: 'build/installer-test.nsh',
  }
}

async function digest(file) {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(file)) hash.update(bytes)
  return hash.digest('hex')
}

// Generated only after a build using the explicit test wrapper. Older test
// EXEs used the formal command owner, so their filename alone is insufficient.
export async function writeInstallerTestContract({ configuration, artifactPaths }, version) {
  const expected = installerTestIdentity(version)
  assert.equal(configuration.appId, expected.appId)
  assert.equal(configuration.productName, expected.productName)
  assert.equal(configuration.nsis.include, expected.include)
  assert.equal(configuration.publish, null)
  const output = resolve(configuration.directories.output)
  const file = join(output, expected.artifactName)
  assert.ok(artifactPaths.some(candidate => resolve(candidate) === file), 'Build did not produce the isolated installer')
  assert.equal(dirname(await realpath(file)), await realpath(output), 'Installer must reside inside its isolated output')
  const receipt = { schema: 1, version, ...expected, commandRegistration: 'skipped', legacyMigration: 'skipped', size: (await stat(file)).size, sha256: await digest(file) }
  await writeFile(join(output, receiptName), JSON.stringify(receipt, null, 2) + '\n')
  return []
}

export async function verifyInstallerTestContract(file, version) {
  const receipt = JSON.parse(await readFile(join(dirname(file), receiptName), 'utf8'))
  const expected = installerTestIdentity(version)
  assert.equal(receipt.schema, 1)
  assert.equal(receipt.version, version)
  for (const [name, value] of Object.entries(expected)) assert.equal(receipt[name], value)
  assert.equal(basename(file), expected.artifactName)
  assert.equal(dirname(await realpath(file)), await realpath(dirname(file)))
  assert.equal(receipt.commandRegistration, 'skipped')
  assert.equal(receipt.legacyMigration, 'skipped')
  assert.equal((await stat(file)).size, receipt.size)
  assert.equal(await digest(file), receipt.sha256, 'Isolated installer does not match its guarded build receipt; rebuild the test installer')
  return receipt
}
