import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { globSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { root, cacheRoot } from './paths.mjs'
import { dependencyLockFingerprint } from './component-inputs.mjs'
import { fileDigest } from '../commands/resource-catalog.mjs'

const require = createRequire(join(root, 'desktop/package.json'))
const pnpm = process.env.npm_execpath
if (!pnpm) throw new Error('Run with pnpm')
const packages = ['electron', 'node-pty', 'sharp', 'koffi']
const identities = packages.map(name => {
  let path
  try { path = require.resolve(name + '/package.json') }
  catch { path = globSync(`node_modules/.pnpm/${name}@*/node_modules/${name}/package.json`, { cwd: root }).map(file => join(root, file))[0] }
  if (!path) throw new Error('Native dependency is not installed: ' + name)
  return { name, path, version: require(path).version }
})
const outputs = [join(dirname(identities[0].path), 'dist/electron.exe'),
  join(dirname(identities[1].path), 'prebuilds/win32-x64/conpty.node'),
  ...globSync('node_modules/.pnpm/@img+sharp-win32-x64@*/node_modules/@img/sharp-win32-x64/lib/*.{node,dll}', { cwd: root }).map(file => join(root, file)),
  ...globSync('node_modules/.pnpm/@koromix+koffi-win32-x64@*/node_modules/@koromix/koffi-win32-x64/win32_x64/*.node', { cwd: root }).map(file => join(root, file))]
const electronAbi = () => { try { return execFileSync(outputs[0], ['--eval', 'process.stdout.write(process.versions.modules)'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, encoding: 'utf8' }) } catch { return null } }
const keyFields = { node: process.version, platform: process.platform, architecture: process.arch, identities: identities.map(({name, version}) => ({name, version})), lock: await dependencyLockFingerprint(root, ['desktop'], ['electron']) }
const key = JSON.stringify({ ...keyFields, electronAbi: electronAbi() })
const receiptPath = join(cacheRoot, 'native-runtime.json')
const prior = await readFile(receiptPath, 'utf8').then(JSON.parse, () => undefined)
const integrity = await Promise.all(outputs.map(async path => ({ path, sha256: await fileDigest(path) }))).catch(() => undefined)
if (prior?.key === key && integrity && JSON.stringify(prior.outputs) === JSON.stringify(integrity)) console.log('CACHE HIT native: verified Electron/native output hashes')
else {
  console.log('REBUILD native: target/toolchain changed or verified output missing')
  execFileSync(process.execPath, [pnpm, 'native:rebuild'], { cwd: root, env: process.env, stdio: 'inherit' })
  // pnpm --ignore-scripts installs can omit Electron from pendingBuilds;
  // explicitly run its checksum-verifying installer if the executable lacks.
  if (!await fileDigest(outputs[0]).catch(() => undefined)) execFileSync(process.execPath, [join(dirname(identities[0].path), 'install.js')], { cwd: root, env: process.env, stdio: 'inherit' })
  await mkdir(cacheRoot, { recursive: true })
  if (!outputs.some(path => path.includes('sharp') && path.endsWith('.node')) || !outputs.some(path => path.includes('koffi') && path.endsWith('.node'))) throw new Error('Native runtime cache lacks sharp or koffi target bindings')
  await writeFile(receiptPath, JSON.stringify({ key: JSON.stringify({ ...keyFields, electronAbi: electronAbi() }), outputs: await Promise.all(outputs.map(async path => ({ path, sha256: await fileDigest(path) }))) }, null, 2))
}
