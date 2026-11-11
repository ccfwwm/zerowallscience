/** Publish immutable signed Host releases before switching the independent stable pointer. */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { fetchHostRuntimeFeed, parseHostRuntimeFeed } from '../src/host-runtime-update.ts'
import { loadZeroWallQiniuEnvironment, validateZeroWallQiniuDomain } from './publish-zerowall.ts'
import { openQiniuStore, type QiniuAsset, type QiniuReleaseStore } from './zerowall-qiniu-store.mjs'

const origin = 'https://zerowall.chengxunkeji.cn'
const pointerKey = 'stable/host-runtime/latest.json'

/** Local evidence for staging and promoting one immutable release. */
export interface HostPublication {
  schemaVersion: 1
  directory: string
  runtimeVersion: string
  phase: 'staged' | 'switching' | 'verified'
  previousSha256: string | null
  assets: QiniuAsset[]
}

async function digest(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function publicPointer(): Promise<Buffer | undefined> {
  const response = await fetch(`${origin}/${pointerKey}?verify=${Date.now()}`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30_000) })
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(`Host pointer HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

/**
 * Authenticate a local feed and publish only immutable release objects.
 * @param directory - Signed release output from package-host-runtime.
 * @param store - Explicit release transport.
 * @param records - Local directory retaining publication evidence.
 * @param trust - Public key embedded in the Desktop Bootstrap.
 * @param readPointer - Current public pointer reader.
 * @returns Evidence required for a separate pointer promotion.
 */
export async function stageHostRelease(directory: string, store: QiniuReleaseStore, records: string,
  trust: { keyId: string; publicKey: string }, readPointer = publicPointer): Promise<HostPublication> {
  if (store.base !== origin) throw new Error('Invalid Host publication origin')
  const feedPath = join(directory, 'latest.json')
  const bytes = await readFile(feedPath)
  const parsed = parseHostRuntimeFeed(JSON.parse(bytes.toString('utf8')))
  const manifest = parsed.manifest
  const feed = await fetchHostRuntimeFeed(`${origin}/${pointerKey}`, { ...manifest, platform: 'win32', arch: 'x64' },
    trust.publicKey, trust.keyId, async () => new Response(bytes))
  if (!/^\d+\.\d+\.\d+$/u.test(manifest.runtimeVersion) || !/^9\.\d+\.\d+$/u.test(manifest.productVersion)) throw new Error('Host publication requires formal versions')
  const prefix = `stable/host-runtime/releases/${manifest.runtimeVersion}/`
  if (feed.archiveUrl !== `${origin}/${prefix}host-runtime.tgz`) throw new Error('Host archive URL differs from immutable release path')
  const source = join(directory, 'releases', manifest.runtimeVersion)
  const archive = join(source, 'host-runtime.tgz')
  if ((await stat(archive)).size !== manifest.payload.bytes || await digest(archive) !== manifest.payload.sha256) throw new Error('Host archive size or digest mismatch')
  if (JSON.stringify(JSON.parse(await readFile(join(source, 'host-runtime.json'), 'utf8'))) !== JSON.stringify(manifest)) throw new Error('Host manifest differs from signed feed')
  await mkdir(records, { recursive: true })
  const evidence = await mkdtemp(join(records, manifest.runtimeVersion + '-'))
  const previous = await readPointer()
  if (previous !== undefined) await writeFile(join(evidence, 'previous-latest.json'), previous, { flag: 'wx' })
  await writeFile(join(evidence, 'latest.json'), bytes, { flag: 'wx' })
  const assets = ['host-runtime.tgz', 'host-runtime.json', 'release.json'].map(name => ({ path: join(source, name), key: prefix + name }))
  assets.push({ path: join(evidence, 'latest.json'), key: prefix + 'latest.json' })
  const receipts = []
  for (const asset of assets) { await store.upload(asset); receipts.push(await store.verify(asset)) }
  await writeFile(join(evidence, 'receipts.json'), JSON.stringify(receipts, null, 2) + '\n', { flag: 'wx' })
  const record: HostPublication = { schemaVersion: 1, directory: evidence, runtimeVersion: manifest.runtimeVersion,
    phase: 'staged', previousSha256: previous === undefined ? null : createHash('sha256').update(previous).digest('hex'), assets }
  await writeFile(join(evidence, 'publication.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' })
  return record
}

/**
 * Promote a previously verified release after detecting concurrent pointer changes.
 * @param record - Staging evidence retained on disk.
 * @param store - Explicit release transport.
 * @param readPointer - Current public pointer reader.
 */
export async function promoteHostRelease(record: HostPublication, store: QiniuReleaseStore, readPointer = publicPointer): Promise<void> {
  if (record.schemaVersion !== 1 || record.phase !== 'staged' || store.base !== origin
    || !/^\d+\.\d+\.\d+$/u.test(record.runtimeVersion) || record.assets.length !== 4
    || record.assets.some(asset => !asset.key.startsWith(`stable/host-runtime/releases/${record.runtimeVersion}/`))) throw new Error('Invalid Host publication evidence')
  const previous = await readPointer()
  const currentHash = previous === undefined ? null : createHash('sha256').update(previous).digest('hex')
  if (currentHash !== record.previousSha256) throw new Error('Host pointer moved; inspect the newer publication before promotion')
  for (const asset of record.assets) await store.verify(asset)
  const persist = (phase: HostPublication['phase']) => writeFile(join(record.directory, 'publication.json'), JSON.stringify({ ...record, phase }, null, 2) + '\n', { flush: true })
  await persist('switching')
  const pointer = { path: join(record.directory, 'latest.json'), key: pointerKey }
  await store.upload(pointer, true)
  await store.refresh([pointerKey])
  await store.verify(pointer)
  await persist('verified')
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { stage: { type: 'string' }, promote: { type: 'string' } } })
  if ((values.stage === undefined) === (values.promote === undefined)) throw new Error('Specify --stage release-directory or --promote publication.json')
  const environment = await loadZeroWallQiniuEnvironment()
  validateZeroWallQiniuDomain(environment, origin)
  const store = await openQiniuStore(environment)
  if (values.stage !== undefined) {
    const trust = JSON.parse(await readFile(resolve(import.meta.dirname, '../config/zerowall-resource-public-key.json'), 'utf8'))
    const record = await stageHostRelease(resolve(values.stage), store, resolve(import.meta.dirname, '../.desktop-build/host-runtime-publications'), trust)
    console.log('Host release staged:', join(record.directory, 'publication.json'))
  } else {
    const record: HostPublication = JSON.parse(await readFile(resolve(values.promote!), 'utf8'))
    await promoteHostRelease(record, store)
    console.log('Host pointer verified:', record.runtimeVersion)
  }
}
if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) await main()
