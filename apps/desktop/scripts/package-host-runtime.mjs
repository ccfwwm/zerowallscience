/** Build a signed immutable Host Runtime archive and feed pointer. */
import { createHash, createPrivateKey, sign } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { c as createTar } from 'tar'
import { valid } from 'semver'

const { values } = parseArgs({ options: {
  runtime: { type: 'string' }, output: { type: 'string' }, version: { type: 'string' }, product: { type: 'string' },
  dsh: { type: 'string' }, protocol: { type: 'string' }, electron: { type: 'string' }, abi: { type: 'string' },
  libreoffice: { type: 'string' }, pnpm: { type: 'string' }, platform: { type: 'string' }, arch: { type: 'string' },
  python: { type: 'string' },
  'archive-url': { type: 'string' }, 'key-file': { type: 'string' }, 'key-id': { type: 'string' },
} })

function required(name, value) {
  if (typeof value !== 'string' || value === '') throw new Error(`host runtime release: --${name} is required`)
  return value
}

function version(name, value) {
  const result = required(name, value)
  if (valid(result) === null) throw new Error(`host runtime release: --${name} must be a valid SemVer`)
  return result
}

function digest(bytes) { return createHash('sha256').update(bytes).digest('hex') }

async function requireAbsent(path, description) {
  try {
    await lstat(path)
    throw new Error(`host runtime release: ${description} already exists`)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
    throw error
  }
}

function isWithin(parent, candidate) {
  const path = relative(parent, candidate)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

function signedBody(value, privateKey) {
  return { ...value, signature: { algorithm: 'ed25519', keyId: required('key-id', values['key-id']), value: sign(null, Buffer.from(JSON.stringify(value)), privateKey).toString('base64') } }
}

const runtime = resolve(required('runtime', values.runtime))
const output = resolve(required('output', values.output))
const runtimeVersion = version('version', values.version)
const productVersion = version('product', values.product)
const dshVersion = version('dsh', values.dsh)
const platform = required('platform', values.platform)
const arch = required('arch', values.arch)
if (platform !== 'win32' || arch !== 'x64') throw new Error('host runtime release: only win32/x64 is supported')
if (!(await stat(runtime)).isDirectory()) throw new Error('host runtime release: --runtime must name a directory')
const hostPackage = JSON.parse(await readFile(join(runtime, 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'package.json'), 'utf8'))
const dshPackage = JSON.parse(await readFile(join(runtime, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), 'utf8'))
if (hostPackage.name !== '@deepseek-ai/dsh-desktop-host' || hostPackage.version !== dshVersion
  || hostPackage.main !== 'lib/index.js' || dshPackage.name !== '@deepseek-ai/dsh' || dshPackage.version !== dshVersion) {
  throw new Error('host runtime release: DSH package identity or version does not match --dsh')
}
if (!(await stat(join(runtime, 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'index.js'))).isFile()) {
  throw new Error('host runtime release: Host entry point is missing')
}
const keyPath = resolve(required('key-file', values['key-file']))
if (isWithin(runtime, output) || isWithin(runtime, keyPath)) {
  throw new Error('host runtime release: output and signing key must stay outside the Runtime directory')
}
const key = createPrivateKey(await readFile(keyPath, 'utf8'))
if (key.asymmetricKeyType !== 'ed25519') throw new Error('host runtime release: signing key must be Ed25519')
const archiveDir = join(output, 'releases', runtimeVersion)
const archiveUrl = required('archive-url', values['archive-url'])
if (!/^https:\/\//u.test(archiveUrl)) throw new Error('host runtime release: --archive-url must use HTTPS')
const latestPath = join(output, 'latest.json')
await mkdir(join(output, 'releases'), { recursive: true })
await requireAbsent(archiveDir, `release ${runtimeVersion}`)
await requireAbsent(latestPath, 'latest feed')
const stagingDir = await mkdtemp(join(join(output, 'releases'), `.${runtimeVersion}.staging-`))
try {
  const archivePath = join(stagingDir, 'host-runtime.tgz')
  await createTar({ gzip: true, file: archivePath, cwd: dirname(runtime), portable: true, mtime: new Date(0) }, [basename(runtime)])
  const archive = await readFile(archivePath)
  const manifestBody = {
    schemaVersion: 1,
    product: 'zerowall-science',
    runtimeVersion,
    productVersion,
    platform: 'win32',
    arch: 'x64',
    dshVersion,
    hostProtocolVersion: required('protocol', values.protocol),
    electronVersion: required('electron', values.electron),
    nodeAbi: required('abi', values.abi),
    libreOfficeKitVersion: required('libreoffice', values.libreoffice),
    pnpmVersion: version('pnpm', values.pnpm),
    pythonVersion: version('python', values.python),
    payload: { path: '.update/host-runtime.tgz', bytes: archive.byteLength, sha256: digest(archive) },
  }
  const manifest = signedBody(manifestBody, key)
  await writeFile(join(stagingDir, 'host-runtime.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
  const feedBody = { schemaVersion: 1, product: 'zerowall-science', manifest, archiveUrl }
  const feed = signedBody(feedBody, key)
  await writeFile(join(stagingDir, 'release.json'), `${JSON.stringify({ schemaVersion: 1, runtimeVersion, productVersion,
    archive: { path: basename(archivePath), bytes: archive.byteLength, sha256: digest(archive) },
    manifest: { path: 'host-runtime.json', sha256: digest(Buffer.from(JSON.stringify(manifest, null, 2) + '\n')) },
  }, null, 2)}\n`, { flag: 'wx' })
  await requireAbsent(archiveDir, `release ${runtimeVersion}`)
  await rename(stagingDir, archiveDir)
  await writeFile(latestPath, `${JSON.stringify(feed, null, 2)}\n`, { flag: 'wx' })
} catch (error) {
  await rm(stagingDir, { recursive: true, force: true })
  throw error
}
console.log(`Built signed Host Runtime ${runtimeVersion} at ${output}`)
