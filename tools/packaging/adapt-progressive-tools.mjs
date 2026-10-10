import { parse, stringify } from 'yaml'

const peers = [
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-system-prompt',
  '@deepseek-ai/dsh-tools',
]
export const PROGRESSIVE_TOOLS_RESOURCE_VERSION = '0.7.2-zws.1'

export function adaptProgressiveToolsPatch(source) {
  const patch = parse(source)
  if (JSON.stringify(patch) !== JSON.stringify([{ insert: [{ id: 'progressive-tools', name: 'dsh-progressive-tools' }] }])) {
    throw new Error('Progressive Tools bundle adapter requires the audited upstream registration patch.')
  }
  patch[0].insert[0].name = '@everclear077/dsh-progressive-tools'
  return stringify(patch)
}

export function adaptProgressiveToolsManifest(source) {
  const manifest = JSON.parse(source)
  if (manifest.name !== '@everclear077/dsh-progressive-tools' || manifest.version !== '0.7.0') {
    throw new Error('Progressive Tools manifest adapter requires audited upstream 0.7.0.')
  }
  const actual = Object.keys(manifest.peerDependencies ?? {}).filter(name => name.startsWith('@deepseek-ai/dsh-')).sort()
  if (JSON.stringify(actual) !== JSON.stringify([...peers].sort())) throw new Error('Progressive Tools DSH peer set changed; review the adapter.')
  for (const name of peers) {
    if (manifest.peerDependencies[name] !== '0.2.0-rc.1') throw new Error(`Progressive Tools upstream peer ${name} changed; review the adapter.`)
    manifest.peerDependencies[name] = '0.2.0-rc.2'
  }
  manifest.version = PROGRESSIVE_TOOLS_RESOURCE_VERSION
  return JSON.stringify(manifest, null, 2) + '\n'
}
