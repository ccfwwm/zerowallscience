/** Publish immutable software artifacts before switching the isolated newui feed. */
import { createHash, createPrivateKey, createPublicKey, sign, verify, X509Certificate } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { parseArgs, parseEnv } from 'node:util'
import { fileURLToPath } from 'node:url'
import { createDesktopUploadPlan, type DesktopUploadPlan } from './desktop-upload-plan.ts'
import { openQiniuStore, type QiniuAsset, type QiniuReceipt, type QiniuReleaseStore } from './zerowall-qiniu-store.mjs'
import { valid } from 'semver'
import { resolveZeroWallReleaseConfig } from './zerowall-release-config.mjs'
import { inspectWindowsRuntimeSignature } from './windows-runtime-signature.mjs'

const DEFAULT_QINIU_ENV_FILE = fileURLToPath(new URL('../config/publishing/.env.qiniu', import.meta.url))

/**
 * Resolve the local Qiniu settings file without exposing its contents.
 * @param environment - Process environment with an optional dotenv path.
 * @returns Absolute path to the selected dotenv file.
 */
export function resolveZeroWallQiniuEnvironmentFile(environment: NodeJS.ProcessEnv = process.env): string {
  return resolve(environment.ZEROWALL_QINIU_ENV_FILE?.trim() || DEFAULT_QINIU_ENV_FILE)
}

/**
 * Load local Qiniu publication settings and resolve relative resource-key paths beside that file.
 * @param environment - Process environment with an optional alternate dotenv path.
 * @returns Qiniu settings with the isolated ZeroWall provider selected.
 */
export async function loadZeroWallQiniuEnvironment(environment: NodeJS.ProcessEnv = process.env): Promise<NodeJS.ProcessEnv> {
  const envFile = resolveZeroWallQiniuEnvironmentFile(environment)
  let credentials: NodeJS.ProcessEnv
  try {
    credentials = parseEnv((await readFile(envFile, 'utf8')).replace(/^\uFEFF/u, ''))
  } catch {
    throw new Error('ZeroWall release: cannot read valid Qiniu settings from the selected local dotenv file')
  }
  const loaded: NodeJS.ProcessEnv = { ...environment, ...credentials, DSH_DESKTOP_UPDATE_PROVIDER: 'qiniu' }
  const keyFile = loaded.ZEROWALL_RESOURCE_PRIVATE_KEY_FILE?.trim()
  if (keyFile) loaded.ZEROWALL_RESOURCE_PRIVATE_KEY_FILE = isAbsolute(keyFile) ? resolve(keyFile) : resolve(dirname(envFile), keyFile)
  return loaded
}

/**
 * Ensure public verification reads the same HTTPS origin configured for the updater feed.
 * @param environment - Qiniu upload settings.
 * @param releaseOrigin - Public HTTPS origin owned by the ZeroWall release configuration.
 * @returns Nothing when the domains agree.
 * @throws When the Qiniu public domain differs from the configured release origin.
 */
export function validateZeroWallQiniuDomain(environment: NodeJS.ProcessEnv, releaseOrigin: string): void {
  const domain = environment.QINIU_DOMAIN?.trim()
  let parsed: URL
  try {
    parsed = new URL(domain && /^https?:\/\//u.test(domain) ? domain : `https://${domain ?? ''}`)
  } catch {
    throw new Error('ZeroWall release: QINIU_DOMAIN must match the public release origin')
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash
    || parsed.origin !== releaseOrigin) throw new Error('ZeroWall release: QINIU_DOMAIN must match the public release origin')
}

async function digest(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(path)) hash.update(bytes)
  return hash.digest('hex')
}

/**
 * Publicly verify every immutable object, then update and verify only the feed pointer.
 * @param plan - Locally validated package, checksums and update destination.
 * @param store - Credential-owning Qiniu transport.
 * @param recordsRoot - Durable local evidence directory outside package artifacts.
 * @param verifySignature - Authenticode verifier; tests inject a hardware-free verifier.
 * @param expectedThumbprint - Public certificate identity used during packaging.
 * @returns Local record directory containing successful and partial publication evidence.
 */
export async function publishZeroWallRelease(
  plan: DesktopUploadPlan, store: QiniuReleaseStore, recordsRoot: string,
  verifySignature = inspectWindowsRuntimeSignature, expectedThumbprint?: string,
): Promise<string> {
  if (plan.provider !== 'qiniu' || !plan.publicUrl.startsWith(`${store.base}/newui/`)) throw new Error('ZeroWall release: destination mismatch')
  if (plan.target !== 'win-x64') throw new Error('ZeroWall release: this publisher requires Windows artifacts')
  const pointer = plan.artifacts.filter(asset => asset.channelMetadata)
  if (pointer.length !== 1) throw new Error('ZeroWall release: exactly one feed pointer is required')
  for (const asset of plan.artifacts) {
    if (!asset.key.startsWith('newui/') || asset.key.includes('..')) throw new Error('ZeroWall release: object escapes newui')
  }
  const installer = plan.artifacts.find(asset => asset.filename.endsWith('.exe'))
  if (installer === undefined) throw new Error('ZeroWall release: installer missing')
  const signature = await verifySignature(installer.path)
  if (expectedThumbprint === undefined || !/^[0-9a-f]{40}$/iu.test(expectedThumbprint)) throw new Error('ZeroWall release: expected signing certificate is required')
  if (signature.thumbprint?.toUpperCase() !== expectedThumbprint.toUpperCase()) throw new Error('ZeroWall release: installer signer differs from release certificate')
  if (signature.status !== 'Valid' || !signature.timestamped || signature.thumbprint === null) throw new Error('ZeroWall release: a valid timestamped installer signature is required')
  await mkdir(recordsRoot, { recursive: true })
  const directory = await mkdtemp(join(recordsRoot, `${plan.version}-`))
  const receipts: QiniuReceipt[] = []
  const record = async (phase: string) => writeFile(join(directory, 'publication.json'), JSON.stringify({
    version: plan.version, target: plan.target, feed: plan.publicUrl, phase, receipts,
  }, null, 2) + '\n', { flush: true })
  await record('uploading-artifacts')
  const immutablePrefix = `newui/releases/${plan.version}/${plan.target}`
  const prepared: QiniuAsset[] = []
  for (const artifact of plan.artifacts) {
    let path = artifact.path
    if (artifact.contents !== undefined) {
      path = join(directory, artifact.filename)
      await writeFile(path, artifact.contents, { flag: 'wx' })
    }
    prepared.push({ path, key: artifact.channelMetadata ? `${immutablePrefix}/${artifact.filename}` : artifact.key })
  }
  const manifestPath = join(directory, 'release.json')
  const files = []
  for (const asset of prepared) files.push({ key: asset.key, bytes: (await stat(asset.path)).size, sha256: await digest(asset.path) })
  await writeFile(manifestPath, JSON.stringify({ version: plan.version, target: plan.target, signer: signature.thumbprint, files }, null, 2) + '\n', { flag: 'wx' })
  prepared.push({ path: manifestPath, key: `${immutablePrefix}/release.json` })
  for (const asset of prepared) {
    await store.upload(asset)
    receipts.push(await store.verify(asset))
    await record('uploading-artifacts')
  }
  const feed = pointer[0]!
  const feedAsset = { path: join(directory, feed.filename), key: feed.key }
  await record('switching-feed')
  await store.upload(feedAsset, true)
  await store.refresh([feed.key])
  receipts.push(await store.verify(feedAsset))
  await record('verified')
  return directory
}

/**
 * Publish a manual installer and signed checksum metadata without changing any updater feed.
 * @param installer - Completed EXE for manual installation.
 * @param version - Exact immutable Desktop build version.
 * @param store - Qiniu transport using the configured public origin.
 * @param recordsRoot - Local checksum and upload evidence directory.
 * @param signing - Ed25519 resource key and its public identifier; never a Windows signing certificate.
 * @returns Local publication evidence directory.
 */
export async function publishZeroWallDownload(installer: string, version: string, store: QiniuReleaseStore,
  recordsRoot: string, signing: { keyId: string; privateKey: string }): Promise<string> {
  if (valid(version) === null || !version.includes('-') || !installer.endsWith('.exe')) throw new Error('Manual download requires a preview EXE version.')
  const key = createPrivateKey(signing.privateKey)
  if (key.asymmetricKeyType !== 'ed25519' || !/^[a-z0-9-]+$/u.test(signing.keyId)) throw new Error('Resource signing key is invalid.')
  const filename = basename(installer)
  if (!filename.includes(version)) throw new Error('Installer filename does not identify this build.')
  const bytes = (await stat(installer)).size, sha256 = await digest(installer)
  const prefix = 'newui/releases/' + version + '/win-x64/'
  const payload = { schema: 1, version, target: 'win-x64', delivery: 'manual-install', automaticUpdate: false,
    files: [{ key: prefix + filename, bytes, sha256 }] }
  const body = Buffer.from(JSON.stringify(payload))
  const signature = sign(null, body, key)
  if (!verify(null, body, createPublicKey(key), signature)) throw new Error('Resource signature verification failed.')
  await mkdir(recordsRoot, { recursive: true })
  const directory = await mkdtemp(join(recordsRoot, version + '-download-'))
  const metadata = join(directory, 'download.json')
  await writeFile(metadata, JSON.stringify({ keyId: signing.keyId, payload, signature: signature.toString('base64') }, null, 2) + '\n', { flag: 'wx' })
  const receipts = []
  for (const asset of [{ path: installer, key: prefix + filename }, { path: metadata, key: prefix + 'download.json' }]) {
    await store.upload(asset)
    receipts.push(await store.verify(asset))
    await writeFile(join(directory, 'publication.json'), JSON.stringify({ version, automaticUpdate: false, phase: receipts.length === 2 ? 'verified' : 'uploading', receipts }, null, 2) + '\n', { flush: true })
  }
  return directory
}

/** Publish a completed signed Windows build using the local Qiniu settings file. */
export async function publishZeroWallCommand(): Promise<void> {
  const { values } = parseArgs({ options: { latest: { type: 'boolean' }, 'download-only': { type: 'string' }, version: { type: 'string' } } })
  const environment = await loadZeroWallQiniuEnvironment()
  const environmentWithChannel: NodeJS.ProcessEnv = { ...environment,
    ...values.latest ? { DSH_DESKTOP_UPDATE_CHANNEL: 'latest', DSH_DESKTOP_AUTO_UPDATE_ENV: 'production' } : {} }
  if (values['download-only'] !== undefined) {
    const config = resolveZeroWallReleaseConfig(environmentWithChannel, 'win32', 'x64')
    validateZeroWallQiniuDomain(environmentWithChannel, config.origin)
    const store = await openQiniuStore(environmentWithChannel)
    if (!values.version || !environmentWithChannel.ZEROWALL_RESOURCE_PRIVATE_KEY_FILE || !environmentWithChannel.ZEROWALL_RESOURCE_KEY_ID) throw new Error('Manual download version and resource signing configuration are required.')
    const record = await publishZeroWallDownload(resolve(values['download-only']), values.version, store,
      resolve(import.meta.dirname, '../.desktop-build/zerowall-publications'), { keyId: environmentWithChannel.ZEROWALL_RESOURCE_KEY_ID,
        privateKey: await readFile(environmentWithChannel.ZEROWALL_RESOURCE_PRIVATE_KEY_FILE, 'utf8') })
    process.stdout.write('Manual download verified: ' + basename(record) + '\n')
    return
  }
  const plan = await createDesktopUploadPlan('win-x64', { environment: environmentWithChannel })
  validateZeroWallQiniuDomain(environmentWithChannel, new URL(plan.publicUrl).origin)
  const store = await openQiniuStore(environmentWithChannel)
  const certificateFile = environmentWithChannel.DSH_DESKTOP_WINDOWS_CER_FILE
  if (certificateFile === undefined) throw new Error('ZeroWall release: public signing certificate is required')
  const thumbprint = new X509Certificate(await readFile(certificateFile)).fingerprint.replaceAll(':', '')
  const record = await publishZeroWallRelease(plan, store, resolve(import.meta.dirname, '../.desktop-build/zerowall-publications'), inspectWindowsRuntimeSignature, thumbprint)
  process.stdout.write(`ZeroWall release verified: ${basename(record)}\n${plan.publicUrl}\n`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  void publishZeroWallCommand().catch(() => {
    process.stderr.write('ZeroWall publication stopped. Check the local publication record; the feed is switched only after all immutable objects verify.\n')
    process.exitCode = 1
  })
}
