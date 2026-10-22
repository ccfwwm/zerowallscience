import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { contract, root } from '../build/paths.mjs'

const installation = resolve(process.argv[2]), userData = resolve(process.argv[3])
const skipInstall = process.argv.includes('--skip-install')
const installer = join(contract.packages, `zerowall-science-${contract.version}-win-x64.exe`)
const output = join(contract.verification, `local-startup-${contract.buildId}`)
await mkdir(output, { recursive: true })
const fingerprint = async local => readFile(join(userData, local)).then(bytes => createHash('sha256').update(bytes).digest('hex'), error => { if (error.code !== 'ENOENT') throw error })
const protectedFiles = ['harness/.credentials.yaml', 'harness/settings.yaml.imported', 'harness/profiles/web/cordis.patch.yml', 'harness/profiles/web/cordis.yml', 'harness/resources/plugins/selection.json', 'harness/profiles/web/node_modules/dsh-context/package.json']
const before = Object.fromEntries(await Promise.all(protectedFiles.map(async file => [file, await fingerprint(file)])))
await writeFile(join(output, 'protected-files-before.json'), JSON.stringify(before, null, 2))
const vaultFile = join(userData, 'credentials/vault.json')
const vaultBefore = await readFile(vaultFile, 'utf8')
const salt = randomBytes(32).toString('base64')
if (!skipInstall) {
console.log('actual-installer:started')
await new Promise((accept, reject) => {
  const child = spawn(installer, ['/S', '/currentuser', '/no-launch', `/D=${installation}`], { windowsHide: true, stdio: 'ignore' })
  const timer = setTimeout(() => { child.kill(); reject(new Error('Actual installer timed out')) }, 900_000)
  child.once('error', reject)
  child.once('exit', code => { clearTimeout(timer); code === 0 ? accept() : reject(new Error(`Actual installer failed (${code})`)) })
})
console.log('actual-installer:complete')
}
assert.equal(await readFile(vaultFile, 'utf8'), vaultBefore, 'Installer changed the credential vault')
for (const name of ['offline-profile.mjs', 'resource-manager.mjs', 'profile-package-commit.mjs', 'profile-pnpm-transaction.mjs', 'installer-copy-files.mjs']) {
  assert((await readFile(join(installation, 'resources/commands', name))).equals(await readFile(join(root, 'tools/commands', name))), `Installed commands differ: ${name}`)
}
const { _electron } = createRequire(join(root, 'desktop/package.json'))('playwright')
const env = { ...process.env, ZEROWALL_USER_DATA_DIR: userData }
delete env.ELECTRON_RUN_AS_NODE
const starts = []
const credentialFingerprints = async (application, document) => application.evaluate(({ safeStorage }, { document, salt }) => {
  const { createHmac } = process.getBuiltinModule('node:crypto')
  const entries = JSON.parse(document).entries
  return Object.fromEntries(Object.entries(entries).map(([key, encoded]) => {
    let value = safeStorage.decryptString(Buffer.from(encoded, 'base64'))
    // current() refreshes these two account billing fields on every startup.
    // Compare every identity, token, model, credential and other session field.
    if (key === 'zerowall.ai-cloud.session') {
      const { balance, currency, ...session } = JSON.parse(value)
      value = JSON.stringify(session)
    }
    return [key, createHmac('sha256', Buffer.from(salt, 'base64')).update(value).digest('hex')]
  }))
}, { document, salt })
for (let attempt = 1; attempt <= 2; attempt++) {
  const started = Date.now(), deadline = started + 900_000
  const application = await _electron.launch({ executablePath: join(installation, 'ZeroWallScience.exe'), env, timeout: 120_000 })
  let page, ready = false, lastPhase
  try {
  assert.equal(await application.evaluate(({ app }) => app.getVersion()), contract.version)
  while (Date.now() < deadline) {
    const rows = (await readFile(join(userData, 'logs/startup.log'), 'utf8')).trim().split(/\r?\n/u)
    const events = rows.map(row => JSON.parse(row)).filter(row => Date.parse(row.timestamp) >= started)
    const failure = events.find(event => event.phase === 'failed')
    if (failure) throw new Error(failure.message)
    const latest = events.at(-1)
    if (latest && latest.segment !== lastPhase) { lastPhase = latest.segment; console.log(`startup-${attempt}:${lastPhase ?? latest.phase}`) }
    page = application.context().pages().find(page => page.url().startsWith('http://127.0.0.1:'))
    if (page && await page.locator('button[data-update]').count() && events.some(event => event.phase === 'ready')) { ready = true; break }
    await new Promise(accept => setTimeout(accept, 1000))
  }
  assert(ready, 'Installed app did not reach the actual workbench')
  // Host readiness precedes publication cleanup. Keep the real application
  // alive until the transaction releases its lease, including large profiles.
  let settled = false, waiting = false
  while (Date.now() < deadline) {
    const profiles = await readdir(join(userData, 'harness/profiles'))
    const locked = await lstat(join(userData, 'harness/profiles/.zerowall-plugin-mutation.lock')).then(() => true, error => { if (error.code !== 'ENOENT') throw error; return false })
    if (!locked && !profiles.some(name => name === 'zerowall' || name.startsWith('zerowall-pnpm-'))) { settled = true; break }
    const events = (await readFile(join(userData, 'logs/startup.log'), 'utf8')).trim().split(/\r?\n/u).map(row => JSON.parse(row)).filter(row => Date.parse(row.timestamp) >= started)
    const failure = events.find(event => event.phase === 'failed')
    if (failure) throw new Error(failure.message)
    if (!waiting) { console.log(`startup-${attempt}:waiting-for-profile-transaction`); waiting = true }
    await new Promise(accept => setTimeout(accept, 1000))
  }
  assert(settled, 'Profile transaction did not settle and remove temporary profiles')
  await new Promise(accept => setTimeout(accept, 10_000))
  const events = (await readFile(join(userData, 'logs/startup.log'), 'utf8')).trim().split(/\r?\n/u).map(row => JSON.parse(row)).filter(row => Date.parse(row.timestamp) >= started)
  assert(!events.some(event => event.phase === 'failed'), 'Startup reported a failure after the workbench opened')
  if (attempt === 2) assert(!events.some(event => event.segment === 'profile-prepare:started'), 'Current profile unexpectedly repeated offline migration')
  await page.screenshot({ path: join(output, `installed-workbench-${attempt}.png`) })
  const profiles = await readdir(join(userData, 'harness/profiles'))
  assert(!profiles.some(name => name === 'zerowall' || name.startsWith('zerowall-pnpm-')), 'Temporary profiles remain after startup')
  assert.deepEqual(await credentialFingerprints(application, await readFile(vaultFile, 'utf8')), await credentialFingerprints(application, vaultBefore), 'Stored credential contents changed')
  for (const file of protectedFiles) assert.equal(await fingerprint(file), before[file], `User state changed: ${file}`)
  starts.push({ attempt, workbenchReady: true, startupMs: Date.now() - started, profiles, screenshot: join(output, `installed-workbench-${attempt}.png`) })
  console.log(`startup-${attempt}:verified`)
  } finally { await application.close() }
}
const report = { complete: true, version: contract.version, buildId: contract.buildId, actualInstallation: installation,
  originalUserData: true, installerExecuted: !skipInstall, protectedFiles, installedCommandsMatch: true, credentialsPreserved: true, billingRefreshFields: ['balance', 'currency'], starts }
await writeFile(join(output, 'verification.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
