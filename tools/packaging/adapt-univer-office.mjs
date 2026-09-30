const upstreamPeerRange = '^0.1.5-rc.3 || ^0.1.7-alpha.2 || ^0.1.7-rc.1'
const dshPeers = [
  '@deepseek-ai/dsh-attachment',
  '@deepseek-ai/dsh-host-webserver',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-skill',
  '@deepseek-ai/dsh-tools',
]

// The published 0.3.5 bundle predates rc.2. Only the curated runtime copy
// gets the range extension; any upstream manifest change requires a new audit.
export function adaptUniverOfficeManifest(source) {
  const manifest = JSON.parse(source)
  if (manifest.name !== 'dsh-univer-office' || manifest.version !== '0.3.5') {
    throw new Error('Unexpected Univer Office manifest identity; review its DSH compatibility.')
  }
  if (Object.keys(manifest.peerDependencies ?? {}).filter(name => name.startsWith('@deepseek-ai/dsh-')).length !== dshPeers.length) {
    throw new Error('Univer Office DSH peer set changed; review its DSH compatibility.')
  }
  for (const name of dshPeers) {
    if (manifest.peerDependencies[name] !== upstreamPeerRange) {
      throw new Error(`Univer Office peer ${name} changed; review its DSH compatibility.`)
    }
    manifest.peerDependencies[name] = `${upstreamPeerRange} || ^0.2.0-rc.2`
  }
  return `${JSON.stringify(manifest, null, 2)}\n`
}
