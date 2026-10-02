import { stageRoot } from '../build/paths.mjs'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const dshRoot = resolve(root, 'deepseek-harness')
const outputPath = resolve(stageRoot, 'dsh/runtime-closure.json')
const check = process.argv.includes('--check')
const upstream = JSON.parse(await readFile(resolve(root, 'config/deepseek-harness/upstream.json'), 'utf8'))

// Claude Code is intentionally excluded from the ZeroWall desktop runtime.
// Claude model access remains available through the Anthropic API integration;
// this deny-list prevents the optional local CLI/subagent package from being
// pulled back into the closure through a preset or peer dependency.
const forbiddenRuntimePackages = new Set([
  '@deepseek-ai/dsh-subagent-claude-code',
  '@deepseek-ai/dsh-hooks-claude-code',
  '@anthropic-ai/claude-agent-sdk',
  '@anthropic-ai/claude-agent-sdk-darwin-arm64',
  '@anthropic-ai/claude-agent-sdk-darwin-x64',
  '@anthropic-ai/claude-agent-sdk-linux-arm64',
  '@anthropic-ai/claude-agent-sdk-linux-arm64-musl',
  '@anthropic-ai/claude-agent-sdk-linux-x64',
  '@anthropic-ai/claude-agent-sdk-linux-x64-musl',
  '@anthropic-ai/claude-agent-sdk-win32-arm64',
  '@anthropic-ai/claude-agent-sdk-win32-x64',
])

const manifests = new Map()
for (const path of await findPackageManifests(dshRoot)) {
  const manifest = JSON.parse(await readFile(path, 'utf8'))
  if (typeof manifest.name === 'string') manifests.set(manifest.name, manifest)
}

// The shipped agent preset is a second runtime root: its rows are loaded from
// YAML and therefore are not necessarily reachable from @deepseek-ai/dsh's
// package dependency graph.
// Harness 0.1.7-rc.2 ships Agent presets as bundle patches. Keep this source
// explicit: these YAML-loaded package rows are runtime roots even when the
// bundle manifest does not expose them through ordinary package dependencies.
const presetText = await readFile(resolve(dshRoot, 'packages/bundle/web-app/presets/standard.patch.yml'), 'utf8')
const presetRoots = [...presetText.matchAll(/^\s+name:\s+['"]([^'"]+)['"]\s*$/gmu)].map(match => match[1])
const patchText = await readFile(resolve(root, 'desktop/build/zerowall.patch.yml'), 'utf8')
const patchRoots = [...patchText.matchAll(/^\s+name:\s+['"]([^'"]+)['"]\s*$/gmu)].map(match => match[1])
const pluginPeers = []
for (const directory of ['packages/zotero-harvest', 'packages/dsh-ssh-ops', 'packages/dsh-progressive-tools', 'packages/dsh-session-notification', 'packages/dsh-wechat', 'packages/dsh-auto-review', 'packages/dsh-file-review']) {
  const manifest = JSON.parse(await readFile(resolve(root, directory, 'package.json'), 'utf8'))
  pluginPeers.push(...Object.keys(manifest.peerDependencies ?? {}), ...Object.keys(manifest.dependencies ?? {}))
}
const queue = [...new Set(['@deepseek-ai/dsh', ...presetRoots, ...patchRoots, ...pluginPeers])]
  .filter(name => manifests.has(name) || forbiddenRuntimePackages.has(name))
const closure = new Set()
for (let index = 0; index < queue.length; index += 1) {
  const name = queue[index]
  if (forbiddenRuntimePackages.has(name)) {
    throw new Error(`Claude Code runtime package must not enter the DSH closure: ${name}`)
  }
  if (closure.has(name)) continue
  const manifest = manifests.get(name)
  if (manifest === undefined) throw new Error(`DSH runtime package is missing from the pinned source: ${name}`)
  closure.add(name)

  const dependencies = {
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
  }
  for (const dependency of Object.keys(dependencies).sort()) {
    if ((manifests.has(dependency) || forbiddenRuntimePackages.has(dependency)) && !closure.has(dependency)) queue.push(dependency)
  }

  for (const peer of Object.keys(manifest.peerDependencies ?? {}).sort()) {
    if (manifest.peerDependenciesMeta?.[peer]?.optional === true) continue
    if ((manifests.has(peer) || forbiddenRuntimePackages.has(peer)) && !closure.has(peer)) queue.push(peer)
  }
}

const generated = `${JSON.stringify({
  dshVersion: upstream.version,
  packages: [...closure].sort(),
}, null, 2)}\n`

if (check) {
  if (!existsSync(outputPath) || await readFile(outputPath, 'utf8') !== generated) {
    throw new Error('DSH runtime closure is stale. Run: pnpm dsh:runtime:closure')
  }
  console.log(`DSH runtime closure verified (${closure.size} workspace packages).`)
} else {
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, generated)
  console.log(`Generated DSH runtime closure (${closure.size} workspace packages).`)
}

async function findPackageManifests(directory) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'lib' || entry.name === 'dist') continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await findPackageManifests(path))
    else if (entry.name === 'package.json') result.push(path)
  }
  return result
}
