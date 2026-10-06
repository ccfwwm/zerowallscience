import { readFile, access, readdir } from 'node:fs/promises'
import { root, contract, applicationVersion } from './paths.mjs'
import { join } from 'node:path'
import { assertPluginDesktopCompatibility } from '../plugins/compatibility.mjs'

async function document(file, required = true) {
  try { return JSON.parse(await readFile(file, 'utf8')) }
  catch (error) { if (!required && error.code === 'ENOENT') return; throw error }
}
function equal(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`)
}
for (const file of ['desktop/package.json', 'config/integrations/upstream-sources.json']) {
  equal((await document(join(root, file))).version, applicationVersion, file)
}
await access(join(root, `docs/release-notes-${applicationVersion}.md`))
const python = await document(join(root, 'resources/python/dependency-manifest.json'))
equal(python.applicationVersion, applicationVersion, 'Python manifest applicationVersion')
equal(python.compatibility.minApplicationVersion, applicationVersion, 'Python minimum desktop')
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
  // WeChat bundle is packages/dsh-wechat with its own upstream version.
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
  for (const kind of ['plugin', 'skill', 'mcp', 'python']) {
    equal((await document(join(contract.release, 'catalogs', `${kind}-catalog.json`))).applicationVersion, applicationVersion, `${kind} catalog`)
  }
}
console.log(`Application version contract verified: ${applicationVersion}${strict ? ' including packaged artifacts' : ''}`)
