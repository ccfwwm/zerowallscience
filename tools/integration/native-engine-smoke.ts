/** Opt-in local GUI check: pnpm exec tsx tools/integration/native-engine-smoke.ts --run */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { deflateSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { ResearchStore } from '../../store/src/index.js'
import { NativeEngineService } from '../../plugins/research/src/host/native-engines.js'

if (!process.argv.includes('--run')) throw new Error('Pass --run to open local Fiji and napari windows with synthetic data. Close only these test windows afterwards.')
const root = resolve('.build', 'science-native-smoke', new Date().toISOString().replaceAll(':', '-'))
await mkdir(root, { recursive: true })
const path = join(root, 'ZeroWall-native-smoke-64x64.png')
const chunk = (type: string, bytes: Buffer) => {
  const body = Buffer.concat([Buffer.from(type), bytes]); let crc = 0xffffffff
  for (const byte of body) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0) }
  const size = Buffer.alloc(4); size.writeUInt32BE(bytes.length)
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return Buffer.concat([size, body, checksum])
}
const header = Buffer.alloc(13); header.writeUInt32BE(64); header.writeUInt32BE(64, 4); header[8] = 8
const pixels = Buffer.alloc(64 * 65)
for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) pixels[y * 65 + 1 + x] = x >= 24 && x < 40 && y >= 24 && y < 40 ? 255 : x * 4
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))])
await writeFile(path, png)
const store = new ResearchStore(join(root, 'research.sqlite'))
const engines = new NativeEngineService(store)
const project = store.createProject({ name: 'Native GUI smoke with synthetic data', rootPath: root })
const asset = store.createDataAsset({ projectId: project.id, name: 'Synthetic 64x64 gradient with central white square', uri: pathToFileURL(path).href, location: 'local', mediaType: 'image/png', checksumAlgorithm: 'sha256', checksum: createHash('sha256').update(png).digest('hex') })
const reportPath = join(root, 'report.json')
const report = async () => writeFile(reportPath, JSON.stringify({ recordedAt: new Date().toISOString(), input: { uri: asset.uri, sha256: asset.checksum, width: 64, height: 64 }, launches: engines.list(project.id), scope: 'Process launch only; visual observations must be recorded separately. No scientific results.' }, null, 2))
let reportTimer: ReturnType<typeof setInterval> | undefined
try {
  for (const id of ['fiji', 'napari'] as const) console.log(JSON.stringify(await engines.launch(project, 'native-smoke', id, asset.id)))
  await report()
  reportTimer = setInterval(() => { void report().catch(error => console.error(String(error))) }, 3000)
  console.log(`REPORT ${reportPath}`)
  console.log('Close the two test windows, then press Enter here to finish and persist their process status.')
  await new Promise<void>(done => {
    const finish = () => { process.stdin.off('data', finish); process.off('SIGINT', finish); done() }
    process.stdin.once('data', finish); process.once('SIGINT', finish); process.stdin.resume()
  })
  await report()
} finally { clearInterval(reportTimer); engines.dispose(); await report(); store.close(); process.stdin.pause() }
