import { readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { isResolutionInstallSource } from './profile-copy.mjs'

export function declaredResolutionRoots(profile, values) {
  const roots = new Set(), seen = new Set()
  function visit(value) {
    if (typeof value === 'string') {
      const spec = /^(?:file:|link:)(.+)$/u.exec(value)?.[1]
      if (!spec) return
      const path = process.platform === 'win32' ? spec.replace(/^\/([a-z]:\/)/iu, '$1') : spec
      const local = relative(profile, resolve(profile, path)).replaceAll('\\', '/')
      if (local === '..' || local.startsWith('../') || isAbsolute(local)) return
      const root = local.split('/').slice(0, 3).join('/')
      if (isResolutionInstallSource(root)) roots.add(root)
      return
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    for (const child of Array.isArray(value) ? value : Object.values(value)) visit(child)
  }
  for (const value of values) visit(value)
  return [...roots]
}

const optional = path => readFile(path, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error })

/** Read-only retention plan shared by candidates and rollback snapshots.
 * Link references are additionally retained by copyProfileTree. A malformed
 * marker cannot justify omitting history, so keep that namespace in full. */
export async function profileHistoryCopyOptions(profile, { yaml = JSON, manifest, materialization } = {}) {
  const [manifestText, markerText, workspaceText] = await Promise.all([
    manifest === undefined ? optional(join(profile, 'package.json')) : undefined,
    materialization === undefined ? optional(join(profile, '.zerowall/materialized-profile.json')) : undefined,
    optional(join(profile, 'pnpm-workspace.yaml')),
  ])
  manifest ??= manifestText === undefined ? {} : JSON.parse(manifestText)
  let validMarker = true
  if (materialization === undefined) {
    try { materialization = markerText === undefined ? {} : JSON.parse(markerText) }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; validMarker = false }
  }
  if (materialization?.preserved !== undefined && !Array.isArray(materialization.preserved)) validMarker = false
  const retainedDependencyHistory = (validMarker ? materialization?.preserved ?? [] : [])
    .map(entry => typeof entry?.dependencyRoot === 'string' ? entry.dependencyRoot.replaceAll('\\', '/') : undefined)
    .map(path => path?.match(/^(\.zerowall\/dependency-history\/[^/]+)\/node_modules(?:\/|$)/u)?.[1])
    .filter(Boolean)
  const workspace = workspaceText?.trim() ? yaml.parse(workspaceText) : undefined
  return {
    pruneDependencyHistory: validMarker,
    retainedDependencyHistory,
    pruneInstallSources: true,
    retainedInstallSources: declaredResolutionRoots(profile, [manifest, workspace]),
  }
}
