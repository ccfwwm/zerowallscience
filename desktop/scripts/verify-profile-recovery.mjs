import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cp, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { _electron } from 'playwright'
import { contract } from '../../tools/build/paths.mjs'
import { locatePackagedApp } from './packaged-app.mjs'

// Simulate interrupted on-disk switches before launching the actual package.
const execute = promisify(execFile)
const packaged = await locatePackagedApp(join(import.meta.dirname, '..'))
const directory = join(contract.verification, 'profile-recovery', randomUUID())
const userdata = join(directory, 'userdata')
const home = join(userdata, 'harness')
const active = join(home, 'profiles/web')
const journal = join(home, 'resources/transaction.json')
const env = { ...process.env, ZEROWALL_USER_DATA_DIR: userdata, ZEROWALL_DISABLE_DEFAULT_MCP: '1',
  APPDATA: join(directory, 'appdata'), LOCALAPPDATA: join(directory, 'localappdata') }
delete env.ELECTRON_RUN_AS_NODE
await Promise.all([userdata, env.APPDATA, env.LOCALAPPDATA].map(path => mkdir(path, { recursive: true })))
await mkdir(join(env.LOCALAPPDATA, 'ZeroWall Science'), { recursive: true })
await writeFile(join(env.LOCALAPPDATA, 'ZeroWall Science/python-location.json'), JSON.stringify({ runtimeRoot: join(directory, 'shared-python/Python') }))
const evidence = { ok: false, executable: packaged.executablePath, scenarios: [] }
let app
async function launch() {
  app = await _electron.launch({ executablePath: packaged.executablePath, env,
    args: [`--user-data-dir=${join(directory, 'chromium')}`], timeout: 120_000 })
  const page = await app.firstWindow({ timeout: 60_000 })
  await page.waitForURL(url => /^https?:/u.test(url.protocol), { timeout: 180_000 })
  const result = await execute(packaged.executablePath,
    ['--expose-internals', join(packaged.resourcesRoot, 'commands/zws.mjs'), 'doctor'],
    { cwd: directory, env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, timeout: 30_000 })
  assert.equal(JSON.parse(result.stdout).host, 'ready')
}
try {
  await launch(); await app.close(); app = undefined
  const baseline = await readFile(join(active, 'package.json'))
  for (const scenario of ['before-first-rename', 'after-backup', 'after-activation', 'interrupted-rollback']) {
    const backup = join(home, 'resources/history', randomUUID())
    const candidate = join(home, 'profiles', 'candidate-' + randomUUID())
    await mkdir(join(home, 'resources/history'), { recursive: true })
    await cp(active, candidate, { recursive: true })
    const broken = JSON.parse(baseline)
    broken.dsh.profile.bundles.push('deliberately-absent-recovery-plugin')
    await writeFile(join(candidate, 'package.json'), JSON.stringify(broken))
    await writeFile(journal, JSON.stringify({ state: 'activating', backup, candidate,
      operation: scenario === 'interrupted-rollback' ? 'rollback' : 'update' }))
    if (scenario !== 'before-first-rename') await rename(active, backup)
    if (['after-activation', 'interrupted-rollback'].includes(scenario)) await rename(candidate, active)
    await launch()
    assert.deepEqual(await readFile(join(active, 'package.json')), baseline)
    assert.equal(JSON.parse(await readFile(journal)).state, 'recovered')
    evidence.scenarios.push({ scenario, host: 'ready', activePreserved: true, recovered: true })
    await app.close(); app = undefined
  }
  evidence.retainedInterruptedProfiles = (await readdir(join(home, 'profiles'))).filter(name => name.includes('interrupted'))
  const retainedCandidates = await Promise.all(evidence.retainedInterruptedProfiles.map(async name =>
    JSON.parse(await readFile(join(home, 'profiles', name, 'package.json'), 'utf8'))))
  assert.equal(retainedCandidates.filter(value => value.dsh.profile.bundles.includes('deliberately-absent-recovery-plugin')).length, 2)
  evidence.ok = true
  console.log('Packaged startup recovery passed:', directory)
} catch (error) { evidence.error = error.stack ?? String(error); throw error }
finally {
  if (app) await app.close()
  await writeFile(join(directory, 'receipt.json'), JSON.stringify(evidence, null, 2))
}
