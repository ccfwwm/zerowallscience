import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { root, stageRoot } from '../build/paths.mjs'
// Retain every customized core patch. Domain plugin activation is profile
// state in 8.0.0, so removing a plugin cannot be undone by the shell overlay.
const lines = (await readFile(join(root, 'desktop/build/zerowall.patch.yml'), 'utf8')).split('\n')
let skipping = false
const core = []
for (const line of lines) {
  if (/^    - id:/.test(line)) skipping = /^    - id: (?:zerowall-|dsh-wechat$|session-notification$)/.test(line)
  else if (/^\S/.test(line) && !line.startsWith('#')) skipping = false
  if (!skipping) core.push(line)
}
await mkdir(join(stageRoot, 'resources'), { recursive: true })
await writeFile(join(stageRoot, 'resources/zerowall-core.patch.yml'), core.join('\n'))
// The stable profile is the authoritative composition for the desktop. Keep
// this list in the packaged command layer so `zws plugin list` can report
// bundled third-party plugins even when an older user profile does not yet
// contain them in its package manifest.
const inventory = JSON.parse(await readFile(join(root, 'config/deepseek-harness/plugin-inventory.json'), 'utf8'))
const defaults = [...(inventory.profiles?.stable?.plugins ?? ['dsh-wechat', '@dingyi222666/dsh-session-notification'])]
const bundled = []
for (const name of await readdir(join(root, 'plugins'))) {
  if (name === 'wechat') continue
  const manifest = JSON.parse(await readFile(join(root, 'plugins', name, 'package.json'), 'utf8'))
  defaults.push(manifest.name)
  bundled.push({ id: manifest.name, version: manifest.version, desktop: manifest.zerowall.desktop, dsh: manifest.zerowall.dsh, managed: true })
}
const known = new Set(bundled.map(item => item.id))
const coreIds = new Set(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-experimental-voice-input-bundle'])
const overlayIds = new Set([...core.join('\n').matchAll(/^\s+name: ['"]([^'"]+)['"]/gm)].map(match => match[1]))
for (const id of [...new Set([...defaults, ...coreIds])]) {
  if (known.has(id)) continue
  const manifest = JSON.parse(await readFile(join(stageRoot, 'runtime/node_modules', id, 'package.json'), 'utf8'))
  bundled.push({ id, version: manifest.version, core: coreIds.has(id), managed: !coreIds.has(id) && !overlayIds.has(id) })
}
const profileDefaults = [...new Set(defaults)].filter(id => !overlayIds.has(id))
await writeFile(join(stageRoot, 'commands/default-plugins.json'), JSON.stringify(profileDefaults))
await writeFile(join(stageRoot, 'commands/bundled-plugins.json'), JSON.stringify(bundled))
console.log(`Profile owns ${profileDefaults.length} independent plugins; inventory contains ${bundled.length} packages`)
