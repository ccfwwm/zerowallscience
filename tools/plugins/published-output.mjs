import { execFileSync } from 'node:child_process'
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { canonical, fileDigest, verifySignedDocument } from '../commands/resource-catalog.mjs'
import { packageFiles } from './immutable-package.mjs'
import { historicalPackage } from './package-history.mjs'
import { preparePublishPackage } from './publish-package.mjs'
import { offlineFiles } from '../commands/offline-profile.mjs'
import { matchesHistoricalDependencyLock, sharedSourceInputs } from '../build/component-inputs.mjs'
import { isTestInputPath } from '../build/build-graph-lib.mjs'
import { root, stageRoot, contract } from '../build/paths.mjs'

/** Bootstrap an empty component cache from an immutable release. Prove its
 * source, source helpers, compiler configuration and noncompiled package
 * files match before importing the already reviewed compiled bytes. */
export async function restorePublishedOutput(source, { restore = true } = {}) {
  const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
  const sourcePath = relative(root, source).replaceAll('\\', '/')
  const firstParty = manifest.name.startsWith('@zerowallscience/plugin-')
  if (!sourcePath.startsWith('plugins/')) return false
  if (!manifest.main?.replace(/^\.\//u, '').startsWith('lib/')) return false
  const baseline = await historicalPackage(manifest.name, manifest.version)
  if (!baseline) return false
  const normalizedArchive = baseline.path.replaceAll('\\', '/')
  // Public-history downloads live in release/<version>/published/<hash>/,
  // while locally packed archives live in plugins/. Both share the catalog.
  const releaseMatch = normalizedArchive.match(/^(.*\/release\/\d+\.\d+\.\d+)(?:\/|$)/u)
  if (!releaseMatch) return false
  const catalogRoot = releaseMatch[1]
  const keys = JSON.parse(await readFile(join(root, 'config/catalogs/trusted-keys.json'), 'utf8'))
  const catalog = verifySignedDocument(JSON.parse(await readFile(join(catalogRoot, 'catalogs/plugin-catalog.json'), 'utf8')), keys)
  const resource = catalog.resources.find(entry => entry.id === manifest.name && entry.version === manifest.version)
  // Independent releases can leave a newer packed version beside an older
  // catalog snapshot. That snapshot cannot prove a bootstrap; build normally
  // and retain the immutable-package comparison against the original archive.
  if (!resource) return false
  if (await fileDigest(baseline.path) !== resource.sha256) throw new Error('Published bootstrap archive differs from its signed catalog: ' + manifest.name)
  const files = await packageFiles(baseline.path)
  const reference = 'v' + baseline.path.replaceAll('\\', '/').match(/\/release\/([^/]+)\//u)?.[1]
  if (!/^v\d+\.\d+\.\d+$/u.test(reference)) return false
  const importer = relative(root, source).replaceAll('\\', '/')
  const tools = ['tsdown', 'typescript', ...(firstParty ? ['@tsdown/css'] : [])]
  let baselineLock
  try {
    baselineLock = execFileSync('git', ['show', `${reference}:pnpm-lock.yaml`], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  } catch (error) {
    // Some releases were delivered from a commit without a matching Git tag.
    // A missing baseline cannot prove source equivalence, so build from the
    // current source instead of failing the whole package operation.
    if (error?.status !== 128) throw error
    console.log(`BOOTSTRAP MISS ${manifest.name}: baseline tag ${reference} is unavailable`)
    return false
  }
  if (!await matchesHistoricalDependencyLock(root, [importer], tools, baselineLock)) {
    console.log(`BOOTSTRAP MISS ${manifest.name}: historical dependency proof unavailable or changed`)
    return false
  }
  const own = execFileSync('git', ['ls-files', '--', relative(root, source)], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/u)
  const shared = [...await sharedSourceInputs(root, source), 'tools/plugins/tsdown.ts', 'tsconfig.plugin.host.json', 'tsconfig.plugin.client.json']
  for (const path of new Set([...own, ...shared])) {
    if (!path) continue
    // Non-distributed tests cannot alter compiled output. Any test shipped in
    // the archive or explicitly imported by production remains part of proof.
    if (isTestInputPath(path) && !shared.includes(path) && !files.has('package/' + path.slice(sourcePath.length + 1))) continue
    // This Windows installation helper is neither compiled nor distributed
    // by the adapter's manifest. A PATH ownership fix cannot change its JS.
    if (!firstParty && path.endsWith('/scripts/install.ps1') && !files.has('package/scripts/install.ps1') && !Object.values(manifest.scripts ?? {}).some(script => script.includes('install.ps1'))) continue
    let published
    try { published = execFileSync('git', ['show', `${reference}:${path.replaceAll('\\', '/')}`], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }) }
    catch { console.log(`BOOTSTRAP MISS ${manifest.name}: baseline source absent ${path}`); return false }
    const current = await readFile(join(root, path))
    // Git stores LF while Windows checkouts can use CRLF. Only normalize
    // text inputs; executable output is still restored from the signed archive
    // and compared byte for byte by the immutable package guard.
    const equal = /\.(?:ts|tsx|css|md|yml|yaml)$/u.test(path)
      ? published.toString('utf8').replaceAll('\r\n', '\n') === current.toString('utf8').replaceAll('\r\n', '\n')
      : published.equals(current)
    if (!equal) { console.log(`BOOTSTRAP MISS ${manifest.name}: source changed ${path}`); return false }
  }
  const staging = join(stageRoot, 'published-bootstrap', manifest.name.split('/').at(-1))
  await preparePublishPackage(source, staging)
  const expected = new Map([...files].filter(([path]) => !path.startsWith('package/lib/')).map(([path, bytes]) => [path.slice('package/'.length), bytes]))
  // 8.0.8 packed an ignored, retired generated source alongside the virtual
  // viewer-style module. Its factory is owned by the unchanged compiler
  // helper above; this file has no runtime entry or source import.
  if (manifest.name === '@zerowallscience/plugin-files' && !own.some(path => path.endsWith('/src/client/viewer-style.ts'))) expected.delete('src/client/viewer-style.ts')
  const current = (await offlineFiles(staging)).filter(entry => !entry.path.startsWith('lib/'))
  if (!firstParty) {
    for (let index = current.length - 1; index >= 0; index--) {
      const entry = current[index]
      if (!expected.has(entry.path) && own.includes(importer + '/' + entry.path)) current.splice(index, 1)
    }
  }
  // pnpm pack includes the workspace license automatically; the explicit
  // publish staging tree may not contain it yet.
  if (expected.has('LICENSE') && !current.some(entry => entry.path === 'LICENSE')) {
    const license = await readFile(join(root, 'LICENSE'))
    if (!expected.get('LICENSE').equals(license)) return false
    await writeFile(join(staging, 'LICENSE'), license)
    current.push({ path: 'LICENSE' })
  }
  if (current.length !== expected.size) { console.log(`BOOTSTRAP MISS ${manifest.name}: noncompiled file set (${current.length}/${expected.size}), missing ${[...expected.keys()].filter(path => !current.some(entry => entry.path === path)).join(', ')}`); return false }
  for (const entry of current) {
    const bytes = await readFile(join(staging, entry.path)), original = expected.get(entry.path)
    // Older adapter tarballs were packed from the trimmed runtime, where
    // pnpm supplied the workspace license. Accept only the exact license in
    // that release's Git tree; the adapter's own source was proven above.
    // Reuse the signed tarball unchanged and retain the source license in
    // the desktop runtime rather than rewriting either license.
    if (!firstParty && entry.path === 'LICENSE' && original && !original.equals(bytes)) {
      const workspaceLicense = execFileSync('git', ['show', `${reference}:LICENSE`], { cwd: root })
      if (original.equals(workspaceLicense)) continue
    }
    const equal = original && (entry.path === 'package.json' ? JSON.stringify(canonical(JSON.parse(original))) === JSON.stringify(canonical(JSON.parse(bytes)))
      : /\.(?:ts|tsx|css|md|yml|yaml)$/u.test(entry.path) ? original.toString('utf8').replaceAll('\r\n', '\n') === bytes.toString('utf8').replaceAll('\r\n', '\n') : original.equals(bytes))
    if (!equal) { console.log(`BOOTSTRAP MISS ${manifest.name}: noncompiled content changed ${entry.path}`); return false }
  }
  const output = await realpath(join(source, 'lib'))
  const rel = relative(contract.dev, output)
  if (!rel || rel.startsWith('..')) throw new Error('Published output target is outside owned artifact cache')
  if (!restore) {
    const currentOutput = (await offlineFiles(output)).filter(entry => firstParty || !entry.path.endsWith('.d.ts') || files.has('package/lib/' + entry.path))
    const compiled = [...files].filter(([path]) => path.startsWith('package/lib/'))
    if (currentOutput.length !== compiled.length) return false
    for (const [path, bytes] of compiled) if (!bytes.equals(await readFile(join(output, path.slice('package/lib/'.length))).catch(() => Buffer.alloc(0)))) return false
    return { ...baseline, sha256: resource.sha256 }
  }
  for (const entry of await offlineFiles(output)) {
    if (!files.has('package/lib/' + entry.path) && (firstParty || !entry.path.endsWith('.d.ts'))) await rm(join(output, entry.path))
  }
  for (const [path, bytes] of files) if (path.startsWith('package/lib/')) {
    const target = join(output, path.slice('package/lib/'.length))
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, bytes)
  }
  console.log(`CACHE BOOTSTRAP ${manifest.name}@${manifest.version}: source/helper/compiler proof matched ${reference}; preserved published compiled bytes`)
  return { ...baseline, sha256: resource.sha256 }
}
