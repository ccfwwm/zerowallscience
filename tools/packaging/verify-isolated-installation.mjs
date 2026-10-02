import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { access, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { contract } from '../build/paths.mjs'

const key = contract.version.replaceAll('.', '')
const testRoot = join(contract.verification, `installer-test-${key}`)
// NSIS extraction uses Windows MAX_PATH. Keep the isolated installation root
// short enough for the Office runtime's nested physical resources.
const directory = join(await mkdtemp(join(tmpdir(), `zws-${key}-`)), '科研应用 中文目录')
const installer = join(testRoot, `zerowall-installer-test-${contract.version}.exe`)
await mkdir(directory, { recursive: true })
const code = await new Promise((accept, reject) => {
  const child = spawn(installer, ['/S', '/currentuser', '/no-launch', `/D=${directory}`], { windowsHide: true, stdio: 'ignore' })
  const timer = setTimeout(() => { child.kill(); reject(new Error('Isolated installer timeout')) }, 180000)
  child.once('error', error => { clearTimeout(timer); reject(error) })
  child.once('exit', code => { clearTimeout(timer); accept(code) })
})
assert.equal(code, 0, 'Isolated NSIS installation must succeed')
async function digest(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
const stableAsarSha256 = await digest(join(contract.packages, 'win-unpacked/resources/app.asar'))
const installedAsarSha256 = await digest(join(directory, 'resources/app.asar'))
assert.equal(installedAsarSha256, stableAsarSha256, 'Installation must preserve the exact candidate payload')
assert.ok((await stat(join(directory, 'ZeroWallScience.exe'))).size > 0)
const engine = join(directory, 'resources/app.asar.unpacked/node_modules/@deepseek-ai/libreoffice-kit-win32-x64')
const nativeManifest = JSON.parse(await readFile(join(engine, 'prebuilds.json'), 'utf8'))
for (const file of Object.keys(nativeManifest.files)) await access(join(engine, file))
await writeFile(join(testRoot, 'installation-receipt.json'), JSON.stringify({
  version: contract.version, buildId: contract.buildId, completed: true, directory,
  appId: `com.zerowall.science.installer-test-${key}`, installationScope: 'current-user',
  stableAsarSha256, installedAsarSha256, identicalPayload: true, physicalOfficeResources: Object.keys(nativeManifest.files).length, checkedAt: new Date().toISOString(),
  limitation: 'Production registration and machine-wide UAC were not exercised.'
}, null, 2) + '\n')
console.log('Isolated Chinese-directory installation passed:', directory)
