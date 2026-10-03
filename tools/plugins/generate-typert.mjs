import { access, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import '../build/register-output-resolution.mjs'
const { WorkspaceTypertGenerator } = await import('../../deepseek-harness/packages/typert/generator/lib/types/workspace.js')

const root = resolve(import.meta.dirname, '../..')
const pluginsRoot = resolve(root, 'plugins')
const packageRoots = [pluginsRoot, resolve(root, 'packages')]
const desktopManifest = JSON.parse(await readFile(resolve(root, 'desktop/package.json'), 'utf8'))
const baseManifest = JSON.parse(await readFile(resolve(pluginsRoot, 'base/package.json'), 'utf8'))
const runtimePackages = new Set([
  ...Object.keys(desktopManifest.dependencies ?? {}),
  ...Object.keys(desktopManifest.optionalDependencies ?? {}),
  ...Object.keys(baseManifest.dependencies ?? {}),
  ...Object.keys(baseManifest.optionalDependencies ?? {}),
])
const remotePackages = []

for (const rootDir of packageRoots) for (const entry of await readdir(rootDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const packageRoot = resolve(rootDir, entry.name)
  let manifest
  try {
    manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'))
  } catch { continue }
  // The workspace also contains disabled or development-only plugins. Only
  // packages that the desktop runtime actually installs may contribute to the
  // shared browser remote assembly; otherwise a removed plugin can survive in
  // the workspace and break startup through a stale generated import.
  if (!runtimePackages.has(manifest.name) && !manifest.name?.startsWith('@zerowallscience/plugin-')) {
    continue
  }
  if (manifest.exports?.['./remote'] === undefined) {
    await removeTypertArtifacts(packageRoot)
    continue
  }
  // Some legacy host services (notably the account gateway) extend the
  // runtime Typert service directly and are not discoverable by the rc.2
  // source analyzer. Preserve their checked-in descriptor when the package
  // still publishes it; deleting it here would leave the client remote
  // assembly without an otherwise valid service contract.
  const existingRemoteArtifact = await hasRemoteArtifact(packageRoot)
  // Feature packages are loaded by the client module loader, which mounts
  // their browser remote before plugin-base applies. Keep file-review out of
  // the shared assembly or its direct methods are registered twice.
  if (['dsh-file-review', 'dsh-ssh-ops'].includes(manifest.name)) continue
  let artifacts
  try {
    artifacts = new WorkspaceTypertGenerator(root, {
      packageRoots: ['deepseek-harness/packages', 'plugins', 'store'],
    }).generate([manifest.name], ['host'])
  } catch (error) {
    // rc.2 validates the manifest before returning the artifact. A few legacy
    // gateway packages intentionally publish a checked-in remote descriptor
    // without declaring Remote methods in their host source. Preserve that
    // descriptor; all packages with actual Remote methods still fail loudly.
    if (existingRemoteArtifact
      && error instanceof Error
      && error.message.includes('publishes Remote artifacts but has no Remote methods')) {
      console.warn(`Typert source discovery skipped ${manifest.name}; preserving its existing remote descriptor.`)
      remotePackages.push(manifest.name)
      continue
    }
    throw error
  }
  const host = artifacts.find(artifact => artifact.face === 'host')
  // Some standalone packages ship a prebuilt remote descriptor rather than a
  // DSH host face. Keep that artifact and include it in the common assembly.
  if (host?.remote === undefined) {
    if (existingRemoteArtifact) {
      console.warn(`Typert source discovery skipped ${manifest.name}; preserving its existing remote descriptor.`)
      remotePackages.push(manifest.name)
      continue
    }
    if (rootDir === resolve(root, 'packages') && await hasRemoteArtifact(packageRoot)) {
      remotePackages.push(manifest.name)
      continue
    }
    throw new Error(`${manifest.name} exports ./remote but generated no Remote contribution.`)
  }
  await mkdir(resolve(packageRoot, 'lib'), { recursive: true })
  await Promise.all([
    writeFile(resolve(packageRoot, 'lib/typert.host.js'), host.js),
    writeFile(resolve(packageRoot, 'lib/typert.host.d.ts'), host.dts),
    writeFile(resolve(packageRoot, 'lib/typert.remote-client.js'), host.remote.js),
    writeFile(resolve(packageRoot, 'lib/typert.remote-client.d.ts'), host.remote.dts),
    writeFile(resolve(packageRoot, 'lib/typert.remote-client.d.ts.map'), host.remote.dtsMap),
  ])
  remotePackages.push(manifest.name)
}

async function hasRemoteArtifact(packageRoot) {
  try {
    for (const name of ['lib/typert.remote-client.js', 'lib/remote.js']) {
      try { await access(resolve(packageRoot, name)); return true } catch { /* try next */ }
    }
    return false
  } catch { return false }
}

// Each package owns its remote; no aggregate Client import is emitted.
console.log(`Generated Typert contracts for ${remotePackages.length} ZeroWall remote plugins.`)

async function removeTypertArtifacts(packageRoot) {
  for (const name of [
    'typert.host.js', 'typert.host.d.ts', 'typert.remote-client.js',
    'typert.remote-client.d.ts', 'typert.remote-client.d.ts.map',
  ]) await rm(resolve(packageRoot, 'lib', name), { force: true })
}
