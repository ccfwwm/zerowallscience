import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, basename } from 'node:path'
import updaterPackage from 'electron-updater'
import helperPackage from 'electron-updater/out/DownloadedUpdateHelper.js'
import { verifyDownloadedArtifact } from '../src/main/update-artifact.ts'

const output = resolve(import.meta.dirname, '../dist/verification-6.4.0')
await mkdir(output, { recursive: true })
const installer = resolve(import.meta.dirname, '../dist/zerowall-science-6.4.0-win-x64.exe')
const hash = createHash('sha512')
for await (const chunk of createReadStream(installer)) hash.update(chunk)
const file = { url: basename(installer), sha512: hash.digest('base64') }
const info = { version: '6.4.0', releaseDate: new Date().toISOString(), files: [file] }
await verifyDownloadedArtifact({ ...info, downloadedFile: installer }, '6.2.0')
const helper = new helperPackage.DownloadedUpdateHelper(resolve(output, 'isolated-cache'))
await helper.setDownloadedFile(installer, null, info, { url: new URL(file.url, 'https://update.invalid/'), info: file }, basename(installer), false)
const calls = []
class ProbeUpdater extends updaterPackage.NsisUpdater {
  useCache() { this.downloadedUpdateHelper = helper }
  async spawnLog(command, args) { calls.push({ command, args }); return true }
}
const updater = new ProbeUpdater(null, {
  version: '6.2.0', name: 'ZeroWall upgrade fixture', isPackaged: true,
  appUpdateConfigPath: '', userDataPath: output, baseCachePath: output,
  whenReady: async () => {}, relaunch() {}, quit() {}, onQuit() {},
})
updater.logger = { info() {}, warn() {}, error() {}, debug() {} }
updater.installDirectory = resolve(output, '旧版本 中文目录')
updater.useCache()
assert.equal(updater.install(false, true), true)
assert.deepEqual(calls, [{ command: installer, args: ['--updated', '--force-run', `/D=${updater.installDirectory}`] }])
const result = { passed: true, currentVersion: '6.2.0', offeredVersion: info.version, binaryVersionVerified: true, sha512Verified: true, launch: calls[0], note: 'Real NsisUpdater cache/argument construction; process launch captured without touching an installed app.' }
await writeFile(resolve(output, 'update-handoff.json'), JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
