import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { globSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { historicalPackage } from './package-history.mjs'
import { root } from '../build/paths.mjs'
import { packageSource } from '../build/layout.mjs'

const workspaceManifestCache = new Map()

/**
 * Resolve a workspace dependency manifest without relying on the temporary
 * publish links created by `artifacts:links`. Those links are intentionally
 * created lazily during a build, so a package can be packed before its
 * dependency has received a publish staging directory.
 */
async function workspaceDependencyManifest(source, name) {
  if (workspaceManifestCache.has(name)) return workspaceManifestCache.get(name)
  if (name.startsWith('@deepseek-ai/')) {
    // Adapted offline packages have no development node_modules links. Resolve
    // their Harness peers from the pinned workspace's manifests instead.
    for (const file of globSync(['packages/*/*/package.json', 'vendor/*/package.json', 'apps/*/package.json'], { cwd: join(root, 'deepseek-harness') })) {
      const manifest = JSON.parse(await readFile(join(root, 'deepseek-harness', file), 'utf8'))
      workspaceManifestCache.set(manifest.name, manifest)
    }
    if (workspaceManifestCache.has(name)) return workspaceManifestCache.get(name)
  }
  const candidates = []
  if (name.startsWith('@zerowallscience/plugin-')) {
    candidates.push(join(root, 'plugins', name.slice('@zerowallscience/plugin-'.length), 'package.json'))
  } else if (name === '@zerowallscience/research-store') {
    candidates.push(join(root, 'store', 'package.json'))
  } else if (name === '@zerowallscience/integrity-runtime') {
    candidates.push(join(await packageSource('integrity-runtime'), 'package.json'))
  } else if (name.startsWith('@zerowallscience/')) {
    candidates.push(join(await packageSource(name.slice('@zerowallscience/'.length)), 'package.json'))
  } else if (name.startsWith('dsh-')) {
    candidates.push(join(await packageSource(name), 'package.json'))
  }
  for (const candidate of candidates) {
    try {
      const manifest = JSON.parse(await readFile(candidate, 'utf8'))
      workspaceManifestCache.set(name, manifest)
      return manifest
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  // Installed links may point at an older publish staging manifest. Resolve
  // owned workspace sources first; external/Git dependencies still use links.
  try {
    return JSON.parse(await readFile(join(source, 'node_modules', name, 'package.json'), 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  throw new Error(`Unable to resolve workspace dependency ${name} for ${source}; publish staging and source manifest are both missing`)
}

/** Dereference build output links into a publishable physical package. */
export async function preparePublishPackage(source, staging) {
  const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
  await mkdir(staging, { recursive: true })
  for (const file of new Set(manifest.files.map(file => file.split('/')[0]))) {
    await cp(join(source, file), join(staging, file), { recursive: true, dereference: true }).catch(error => {
      if (error.code !== 'ENOENT') throw error
    })
  }
  if (manifest.main) await access(join(staging, manifest.main))
  const publish = structuredClone(manifest)
  const baseline = await historicalPackage(manifest.name, manifest.version)
  const previous = baseline ? JSON.parse(execFileSync('tar', ['-xOf', baseline.path, 'package/package.json'], { encoding: 'utf8' })) : undefined
  delete publish.scripts
  delete publish.devDependencies
  delete publish.private
  delete publish.packageManager
  delete publish.publishConfig?.directory
  if (publish.publishConfig && Object.keys(publish.publishConfig).length === 0) delete publish.publishConfig
  for (const section of ['dependencies', 'peerDependencies']) {
    for (const [name, range] of Object.entries(publish[section] ?? {})) {
      if (!/^(?:workspace:|github:|git\+|git:)/.test(range)) continue
      const dependency = await workspaceDependencyManifest(source, name)
      // An unchanged component keeps its published dependency contract even
      // when a newer compatible workspace dependency is being bundled today.
      publish[section][name] = /^workspace:/.test(range) && previous?.[section]?.[name]
        ? previous[section][name] : dependency.version
    }
  }
  for (const [name, range] of Object.entries(publish.dependencies ?? {})) {
    if (!name.startsWith('@deepseek-ai/')) continue
    publish.peerDependencies ??= {}
    publish.peerDependencies[name] = range
    delete publish.dependencies[name]
  }
  await writeFile(join(staging, 'package.json'), JSON.stringify(publish, null, 2) + '\n')
  return { manifest, publish }
}
