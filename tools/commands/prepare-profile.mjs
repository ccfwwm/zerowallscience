import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { root, stageRoot } from '../build/paths.mjs'
const runtimeProfile = JSON.parse(await readFile(join(root, 'config/layout/runtime-profile.json'), 'utf8'))
// Retain every customized core patch. Domain plugin activation is profile
// state in 8.0.0, so removing a plugin cannot be undone by the shell overlay.
const lines = (await readFile(join(root, 'desktop/build/zerowall.patch.yml'), 'utf8')).split('\n')
let skipping = false
const core = []
// Optional adapters used to be inserted by the desktop overlay. They now
// arrive through the signed profile catalog, so their patch rows must not
// make the Core installer depend on their source packages.
const optionalOverlayIds = new Set([
  'ssh-ops', 'progressive-tools', 'session-notification', 'dream-skin',
  'better-sidebar', 'univer-office', 'zotero', 'zotero-harvest',
  'dsh-wechat', 'genui',
])
for (const line of lines) {
  if (/^    - id:/.test(line)) {
    const id = /^    - id: ([^\s]+)/.exec(line)?.[1] ?? ''
    skipping = id.startsWith('zerowall-') || optionalOverlayIds.has(id)
  }
  else if (/^\S/.test(line) && !line.startsWith('#')) skipping = false
  if (!skipping) core.push(line)
}
await mkdir(join(stageRoot, 'resources'), { recursive: true })
await mkdir(join(stageRoot, 'commands'), { recursive: true })
await writeFile(join(stageRoot, 'resources/zerowall-core.patch.yml'), core.join('\n'))
// The stable profile is the authoritative composition for the desktop. Keep
// this list in the packaged command layer so `zws plugin list` can report
// bundled third-party plugins even when an older user profile does not yet
// contain them in its package manifest.
const inventory = JSON.parse(await readFile(join(root, 'config/deepseek-harness/plugin-inventory.json'), 'utf8'))
const configuredDefaults = [...(inventory.profiles?.stable?.plugins ?? [])]
const defaults = [...new Set([
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  ...configuredDefaults,
])]
const bundled = []
for (const name of await readdir(join(root, 'plugins'))) {
  if (name === 'wechat') continue
  const manifest = JSON.parse(await readFile(join(root, 'plugins', name, 'package.json'), 'utf8'))
  if (!defaults.includes(manifest.name)) defaults.push(manifest.name)
  bundled.push({ id: manifest.name, version: manifest.version, desktop: manifest.zerowall.desktop, dsh: manifest.zerowall.dsh, managed: true, core: runtimeProfile.corePlugins.includes(manifest.name), offline: true })
}
const known = new Set(bundled.map(item => item.id))
const coreIds = new Set(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-experimental-voice-input-bundle'])
const overlayIds = new Set([...core.join('\n').matchAll(/^\s+name: ['"]([^'"]+)['"]/gm)].map(match => match[1]))
for (const id of [...new Set([...defaults, ...coreIds])]) {
  if (known.has(id)) continue
  const manifest = JSON.parse(await readFile(join(stageRoot, coreIds.has(id) ? 'runtime/node_modules' : 'offline-profile/modules', id, 'package.json'), 'utf8'))
  bundled.push({ id, version: manifest.version, core: coreIds.has(id), managed: !coreIds.has(id) && !overlayIds.has(id), offline: !coreIds.has(id) })
}
const profileDefaults = [...new Set(defaults)].filter(id => !overlayIds.has(id))
await writeFile(join(stageRoot, 'commands/default-plugins.json'), JSON.stringify(profileDefaults))
await writeFile(join(stageRoot, 'commands/bundled-plugins.json'), JSON.stringify(bundled))
const optional = configuredDefaults.filter(id => !runtimeProfile.corePlugins.includes(id))
await writeFile(join(stageRoot, 'commands/optional-plugins.json'), JSON.stringify(optional))
await writeFile(join(stageRoot, 'commands/default-profile.patch.json'), JSON.stringify([
  { id: 'progressive-tools', config: { mode: 'stable-proxy', toolName: 'tool_search', dispatchToolName: 'tool_dispatch', maxResults: 5, requireDiscovery: true, statusGrantsDiscovery: false, deferToolGuidance: true } },
  { id: 'univer-office', config: { telemetry: false } },
  { id: 'dsh-wechat', config: { autoStart: false } },
]))
console.log(`Complete offline default profile owns ${profileDefaults.length} plugins; ${optional.length} domain plugins remain independently catalog-managed`)
