/** Stage verified 9.x artifacts before switching the legacy 8.x stable pointers. */
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { parseArgs, promisify } from 'node:util'
import { dump } from 'js-yaml'
import { loadZeroWallQiniuEnvironment, validateZeroWallQiniuDomain } from './publish-zerowall.ts'
import { openQiniuStore, type QiniuAsset, type QiniuReceipt, type QiniuReleaseStore } from './zerowall-qiniu-store.mjs'
import { verifyResourceRelease, type ResourceReleasePayload } from '../src/resource-update.ts'
import { inspectWindowsRuntimeSignature } from './windows-runtime-signature.mjs'

const origin = 'https://zerowall.chengxunkeji.cn'
const pointers = ['stable/latest.yml', 'stable/releases/latest.json'] as const

async function digest(path: string, algorithm = 'sha256', encoding: 'hex' | 'base64' = 'hex'): Promise<string> {
  const hash = createHash(algorithm)
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest(encoding)
}

/** Durable local release record; private signing material is never recorded. */
export interface StablePublication {
  readonly schema: 1
  readonly version: string
  readonly directory: string
  readonly phase: 'staging' | 'staged' | 'switching' | 'verified'
  readonly assets: readonly QiniuAsset[]
  readonly receipts: readonly QiniuReceipt[]
  readonly previous: readonly { readonly key: string; readonly sha256: string }[]
}

/**
 * Upload immutable binaries and signed metadata, then verify every object through the public origin.
 * @param installer - Exact 9.x Windows installer.
 * @param version - Stable product version.
 * @param store - Owned Qiniu transport.
 * @param records - Private local evidence root.
 * @param signing - Resource signing key; unrelated to Windows Authenticode.
 * @param readPointer - Public pointer reader, replaceable for isolated tests.
 * @returns Staged record. No mutable pointer is changed.
 */
export async function stageStableRelease(installer: string, version: string, store: QiniuReleaseStore, records: string,
  signing: { keyId: string
    privateKey: string },
  readPointer: (key: string) => Promise<Buffer> = publicPointer): Promise<StablePublication> {
  if (!/^9\.\d+\.\d+$/u.test(version) || basename(installer) !== `zerowall-science-${version}-win-x64.exe` || store.base !== origin) throw new Error('Invalid ZeroWall stable release identity')
  const key = createPrivateKey(signing.privateKey)
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Stable release requires its Ed25519 resource key')
  await mkdir(records, { recursive: true })
  const directory = await mkdtemp(join(records, version + '-'))
  const previous: { key: string; sha256: string }[] = []
  for (const name of pointers) {
    const data = await readPointer(name)
    await writeFile(join(directory, name.endsWith('.yml') ? 'previous-latest.yml' : 'previous-latest.json'), data, { flag: 'wx' })
    previous.push({ key: name, sha256: createHash('sha256').update(data).digest('hex') })
  }
  const prefix = `stable/releases/${version}/`
  const assets: QiniuAsset[] = [{ path: installer,
    key: prefix + basename(installer) },
  { path: installer + '.blockmap',
    key: prefix + basename(installer) + '.blockmap' }]
  const files = []
  for (const asset of assets) files.push({ key: asset.key, bytes: (await stat(asset.path)).size, sha256: await digest(asset.path) })
  const payload: ResourceReleasePayload = { schema: 1, version, target: 'win-x64', signing: 'resource-ed25519', files }
  const envelope = { keyId: signing.keyId, payload, signature: sign(null, Buffer.from(JSON.stringify(payload)), key).toString('base64') }
  verifyResourceRelease(envelope,
    version,
    { keyId: signing.keyId,
      publicKey: createPublicKey(key).export({ type: 'spki',
        format: 'pem' }).toString() })
  await writeFile(join(directory, 'release.json'), JSON.stringify(envelope) + '\n', { flag: 'wx' })
  assets.push({ path: join(directory, 'release.json'), key: prefix + 'release.json' })
  const releaseDate = (await stat(installer)).mtime.toISOString(), sha512 = await digest(installer, 'sha512', 'base64')
  const filename = basename(installer), relativeUrl = `releases/${version}/${filename}`, installerFile = files[0]!
  await writeFile(join(directory,
    'latest.yml'),
  dump({ version,
    files: [{ url: relativeUrl,
      sha512,
      size: installerFile.bytes }],
    path: relativeUrl,
    sha512,
    releaseDate,
    releaseNotes: 'ZeroWall Science 9.0: research workspace, native Gemini, independent plugin updates and automatic legacy data import.' }),
  { flag: 'wx' })
  await writeFile(join(directory, 'latest.json'), JSON.stringify({ schema: 1, version, channel: 'stable', platform: 'win-x64',
    assetUrl: `${origin}/${prefix}${filename}`, url: `${origin}/${prefix}${filename}`, assetName: filename,
    assetSha256: installerFile.sha256, sha256: installerFile.sha256, sizeBytes: installerFile.bytes, publishedAt: releaseDate,
    signing: 'resource-ed25519',
    signatureUrl: `${origin}/${prefix}release.json`,
    notesUrl: `https://github.com/ccfwwm/zerowallscience/releases/tag/v${version}` }) + '\n',
  { flag: 'wx' })
  for (const name of ['latest.yml', 'latest.json']) assets.push({ path: join(directory, name), key: prefix + name })
  const receipts: QiniuReceipt[] = []
  const persist = (phase: StablePublication['phase']) => writeFile(join(directory,
    'publication.json'),
  JSON.stringify({ schema: 1,
    version,
    directory,
    phase,
    assets,
    receipts,
    previous },
  null,
  2) + '\n',
  { flush: true })
  await persist('staging')
  for (const asset of assets) { await store.upload(asset); receipts.push(await store.verify(asset)); await persist('staging') }
  const record: StablePublication = { schema: 1, version, directory, phase: 'staged', assets, receipts, previous }
  await writeFile(join(directory, 'publication.json'), JSON.stringify(record, null, 2) + '\n', { flush: true })
  return record
}

async function publicPointer(key: string): Promise<Buffer> {
  const response = await fetch(`${origin}/${key}?zws_pointer=${Date.now()}`,
    { redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store' })
  if (!response.ok) throw new Error('Existing stable pointer unavailable; promotion stopped')
  return Buffer.from(await response.arrayBuffer())
}

/**
 * Promote only a fully verified staged release after detecting any concurrent pointer movement.
 * @param record - Staged publication from this build.
 * @param store - Owned Qiniu transport.
 * @param readPointer - Public pointer reader.
 * @returns Durable verification; failures retain the last phase and both previous pointers for recovery.
 */
export async function promoteStableRelease(record: StablePublication, store: QiniuReleaseStore,
  readPointer: (key: string) => Promise<Buffer> = publicPointer): Promise<void> {
  if (record.schema !== 1 || record.phase !== 'staged' || !/^9\.\d+\.\d+$/u.test(record.version) || store.base !== origin
    || record.receipts.length !== 5 || record.assets.length !== 5 || record.previous.length !== 2) throw new Error('Release is not fully staged')
  for (const prior of record.previous) {
    if (!pointers.includes(prior.key as typeof pointers[number]) || createHash('sha256').update(await readPointer(prior.key)).digest('hex') !== prior.sha256) throw new Error('Stable pointer moved; inspect the newer publication before promotion')
  }
  // Public checks run again immediately before promotion, including the installer bytes.
  for (const asset of record.assets) await store.verify(asset)
  const persist = (phase: StablePublication['phase']) => writeFile(join(record.directory,
    'publication.json'),
  JSON.stringify({ ...record,
    phase },
  null,
  2) + '\n',
  { flush: true })
  await persist('switching')
  for (const key of pointers) {
    const asset = { path: join(record.directory, key.endsWith('.yml') ? 'latest.yml' : 'latest.json'), key }
    await store.upload(asset, true)
    await store.refresh([key])
    await store.verify(asset)
  }
  await persist('verified')
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { stage: { type: 'string' }, version: { type: 'string' }, promote: { type: 'string' } } })
  if ((values.stage === undefined) === (values.promote === undefined)) throw new Error('Specify either --stage installer --version 9.x or --promote publication.json')
  const environment = await loadZeroWallQiniuEnvironment()
  validateZeroWallQiniuDomain(environment, origin)
  const store = await openQiniuStore(environment)
  if (values.stage !== undefined) {
    if (!values.version || !environment.ZEROWALL_RESOURCE_PRIVATE_KEY_FILE || !environment.ZEROWALL_RESOURCE_KEY_ID) throw new Error('Stable version and resource signing configuration are required')
    const installer = resolve(values.stage)
    const signature = await inspectWindowsRuntimeSignature(installer)
    if (signature.status !== 'NotSigned') throw new Error('Official unsigned lane requires a verified NotSigned installer')
    const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '[Console]::Write([System.Diagnostics.FileVersionInfo]::GetVersionInfo($env:ZEROWALL_VERIFY_EXE).ProductVersion)'], {
      env: { ...process.env, ZEROWALL_VERIFY_EXE: installer }, encoding: 'utf8', windowsHide: true, timeout: 30_000,
    })
    if (stdout.trim() !== values.version) throw new Error('Installer embedded product version differs from requested release')
    const privateKey = await readFile(environment.ZEROWALL_RESOURCE_PRIVATE_KEY_FILE, 'utf8')
    const trust: { keyId: string
      publicKey: string } = JSON.parse(await readFile(resolve(import.meta.dirname,
      '../config/zerowall-resource-public-key.json'),
    'utf8'))
    if (trust.keyId !== environment.ZEROWALL_RESOURCE_KEY_ID || createPublicKey(privateKey).export({ type: 'spki',
      format: 'pem' }).toString().trim() !== trust.publicKey.trim()) throw new Error('Publication key differs from the application embedded resource trust')
    const result = await stageStableRelease(installer,
      values.version,
      store,
      resolve(import.meta.dirname,
        '../.desktop-build/zerowall-stable-publications'),
      { keyId: environment.ZEROWALL_RESOURCE_KEY_ID, privateKey })
    console.log('Stable artifacts staged and verified:', join(result.directory, 'publication.json'))
  } else {
    const record = JSON.parse(await readFile(resolve(values.promote!), 'utf8')) as StablePublication
    await promoteStableRelease(record, store)
    console.log('Stable pointers published and verified:', record.version)
  }
}
if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) await main()
