/** Reviewed optional builds shared by Desktop profiles and isolated business updates. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isAlias, isMap, isNode, parseDocument, visit } from 'yaml'

const optionalBuilds = ['@google/genai', 'protobufjs', 'cpu-features', 'ssh2']

/** Optional provider scripts and SSH native acceleration are unnecessary for the portable runtime. */
export const PLUGIN_BUILD_DENIALS = "allowBuilds:\n  '@google/genai': false\n  protobufjs: false\n  cpu-features: false\n  ssh2: false\n"

/**
 * Add missing reviewed denials without replacing user settings or explicit build decisions.
 * The caller holds the profile write lock and has stopped its Host.
 * @param directory - Desktop-owned external plugin profile directory.
 * @throws When workspace YAML cannot be safely updated; the original file remains unchanged.
 */
export function ensurePluginBuildDefaults(directory: string): void {
  const path = join(directory, 'pnpm-workspace.yaml')
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  const document = parseDocument(text)
  if (document.errors[0] !== undefined) throw document.errors[0]
  if (!isMap(document.contents)) throw new Error('pnpm-workspace.yaml must be a YAML mapping')
  const builds = document.get('allowBuilds')
  if (builds !== undefined && !isMap(builds)) throw new Error('allowBuilds must be a YAML mapping')
  visit(builds ?? null, (_key, node) => {
    if (isAlias(node) || (isNode(node) && 'anchor' in node && node.anchor)) {
      throw new Error('allowBuilds must not contain YAML anchors or aliases')
    }
  })
  let changed = false
  for (const key of optionalBuilds) {
    const decided = builds?.items.some((pair) => {
      const matcher = String(pair.key)
      return (matcher === key || matcher.startsWith(key + '@')) && typeof document.getIn(['allowBuilds', matcher]) === 'boolean'
    })
    if (decided) continue
    document.setIn(['allowBuilds', key], false)
    changed = true
  }
  if (changed) writeFileSync(path, String(document), { mode: 0o600 })
}
