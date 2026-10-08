import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, access, readdir, stat } from 'node:fs/promises'
import { root, contract, applicationVersion } from './paths.mjs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { assertPluginDesktopCompatibility } from '../plugins/compatibility.mjs'
import { resourceSource } from './layout.mjs'

async function document(file, required = true) {
  try { return JSON.parse(await readFile(file, 'utf8')) }
  catch (error) { if (!required && error.code === 'ENOENT') return; throw error }
}
function equal(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`)
}
async function sha256(path) {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(path)) digest.update(chunk)
  return digest.digest('hex')
}
for (const file of ['desktop/package.json', 'config/integrations/upstream-sources.json']) {
  equal((await document(join(root, file))).version, applicationVersion, file)
}
await access(join(root, `docs/release-notes-${applicationVersion}.md`))
const python = await document(await resourceSource('python', 'dependency-manifest.json'))
// Python generations have an independent lifecycle. A previously signed
// generation remains valid when its minimum desktop version is satisfied;
// changing applicationVersion would invalidate its Ed25519 signature.
if (!python.compatibility?.minApplicationVersion ||
    compareVersions(python.compatibility.minApplicationVersion, applicationVersion) > 0) {
  throw new Error(`Python generation requires desktop ${python.compatibility?.minApplicationVersion ?? '(missing)'}, current desktop is ${applicationVersion}`)
}
const pythonBootstrap = await document(join(root, 'config/python/bootstrap-inputs.json'))
equal(pythonBootstrap.applicationVersion, applicationVersion, 'Python bootstrap applicationVersion')
const desktopMain = await readFile(join(root, 'desktop/src/main/index.ts'), 'utf8')
if (!desktopMain.includes(`/windows-x64/${pythonBootstrap.environmentVersion}/manifest.json`)) {
  throw new Error(`Desktop Python bootstrap URL does not match environment version ${pythonBootstrap.environmentVersion}.`)
}
const dshContract = await document(join(root, 'config/deepseek-harness/upstream.json'))
if (typeof dshContract.commit !== 'string' || dshContract.commit.length !== 40) {
  throw new Error(`DSH upstream contract has an invalid commit: ${dshContract.commit ?? '(missing)'}`)
}
for (const name of await readdir(join(root, 'plugins'))) {
  // Retired adapter source remains for historical compatibility. The active
  // WeChat bundle is packages/dsh/dsh-wechat with its own upstream version.
  if (name === 'wechat') continue
  const manifest = await document(join(root, 'plugins', name, 'package.json'), false)
  if (!manifest?.name?.startsWith('@zerowallscience/plugin-')) continue
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error(`Invalid independent plugin version: ${name}`)
  assertPluginDesktopCompatibility(manifest.zerowall.desktop, applicationVersion, name)
  equal(manifest.zerowall.dsh.min, '0.2.0-rc.2', `${name} DSH minimum`)
  equal(manifest.zerowall.dsh.max, '0.2.0-rc.2', `${name} DSH maximum`)
}
const strict = process.argv.includes('--artifacts')
const receipt = await document(join(contract.stage, 'dsh/build-receipt.json'), strict)
if (receipt) {
  equal(receipt.applicationVersion, applicationVersion, 'DSH build receipt')
  equal(receipt.commit, dshContract.commit, 'DSH build commit')
}
if (strict) {
  const metadata = await document(join(contract.packages, `zerowall-science-${applicationVersion}-latest.json`))
  equal(metadata.version, applicationVersion, 'Windows release metadata')
  const artifacts = await document(join(contract.packages, 'artifact-manifest.json'))
  equal(artifacts.applicationVersion, applicationVersion, 'Artifact manifest version')
  equal(artifacts.buildId, contract.buildId, 'Artifact manifest build ID')
  if (!Array.isArray(artifacts.files) || artifacts.files.length === 0) throw new Error('Artifact manifest has no package files.')
  const declared = new Set()
  for (const item of artifacts.files) {
    if (typeof item.path !== 'string' || isAbsolute(item.path) || item.path.includes('\\')) throw new Error(`Invalid artifact manifest path: ${item.path}`)
    const file = resolve(contract.packages, item.path)
    const relativeFile = relative(contract.packages, file)
    if (!relativeFile || relativeFile === '..' || relativeFile.startsWith(`..${sep}`)) throw new Error(`Artifact manifest path escapes package output: ${item.path}`)
    if (declared.has(item.path)) throw new Error(`Duplicate artifact manifest path: ${item.path}`)
    declared.add(item.path)
    if (!Number.isSafeInteger(item.size) || item.size < 0 || !/^[a-f0-9]{64}$/u.test(item.sha256 ?? '')) throw new Error(`Invalid size or SHA-256 for artifact: ${item.path}`)
    const info = await stat(file).catch(error => { throw new Error(`Artifact listed in manifest is missing: ${item.path} (${error.code})`) })
    equal(info.size, item.size, `Artifact size ${item.path}`)
    equal(await sha256(file), item.sha256, `Artifact SHA-256 ${item.path}`)
  }
  if (contract.target === 'windows-x64') {
    const installerName = `zerowall-science-${applicationVersion}-win-x64.exe`
    const installer = artifacts.files.find(item => item.path === installerName)
    if (!installer) throw new Error(`Artifact manifest does not include ${installerName}.`)
    equal(metadata.assetSha256, installer.sha256, 'Windows metadata installer SHA-256')
    equal(metadata.sizeBytes, installer.size, 'Windows metadata installer size')
  }
  for (const kind of ['plugin', 'skill', 'mcp', 'python']) {
    equal((await document(join(contract.release, 'catalogs', `${kind}-catalog.json`))).applicationVersion, applicationVersion, `${kind} catalog`)
  }
}
console.log(`Application version contract verified: ${applicationVersion}${strict ? ' including packaged artifacts' : ''}`)

function compareVersions(left, right) {
  const parse = value => String(value).split('.').map(Number)
  const a = parse(left), b = parse(right)
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference) return difference
  }
  return 0
}
