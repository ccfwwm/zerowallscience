import { createHash } from 'node:crypto'
const upstreamPeerRange = '^0.1.5-rc.3 || ^0.1.7-alpha.2 || ^0.1.7-rc.1'
export const UNIVER_SKILL_HASHES = {
  univer: 'e7d13dab051806eee9fb482b3b487d37198fa4eb7050bf755226de5dbca6b24c',
  'univer-slide': '8b24e3fb8d24546a5199d5c65fabb7245c50145f9a0113a5aa7377a389ad3baf',
  'univer-doc': '50defd3678477eaf10dd3eee389d4b668b7038b24bc31658447300d0ed669c9d',
  'univer-sheet': '4599841af059e772c6d9af352359d22c50bd2438cc9a167b272ab2ebc2f4991a',
}
export function adaptUniverSkill(name, source, version, commit) {
  if (version !== '0.3.5' || commit !== 'ce7f3e0bfa1e9b6bc4eb855e1c220b77fcdab806') throw new Error('Univer Skill adapter identity changed.')
  if (createHash('sha256').update(source).digest('hex') !== UNIVER_SKILL_HASHES[name]) throw new Error(`Univer Skill ${name} upstream hash changed; review before adapting.`)
  const descriptions = {
    univer: 'Create, inspect, edit, import and export .univer Units. Use for Univer authoring or explicitly requested Office import into Univer. Ordinary Office attachment identification, reading, summary and comparison use Host extraction and pagination; load this before the matching authoring Unit skill.',
    'univer-slide': 'Create, redesign, edit, lint, screenshot and export editable Univer Slide Units. Use when creating or modifying a presentation or importing for editing, not passive PPTX attachment reading. New scientific decks also load zerowall-presentation for image style samples and independent visuals.',
    'univer-doc': 'Create, edit, paginate, inspect and export Univer Doc Units, or explicitly import DOCX for editing. Passive attachment reading and summary use Host extraction, not this skill.',
    'univer-sheet': 'Author, calculate, format and verify Univer Sheet Units or explicitly import spreadsheet data for editing. Passive attachment reading uses Host local cell/formula extraction and pagination.',
  }
  let result = source.replace(/^description: .+$/mu, `description: ${descriptions[name]}`)
  if (name === 'univer') {
    result = result.replace('Use the structured `univer_*` tools whenever the task creates, reads, changes, converts, or reviews office content.', 'Use structured `univer_*` tools when authoring or editing Univer content or importing Office content for editing. Passive Office reading, identification, summary and comparison use Host extraction and read_uploaded_file; they do not require Univer.')
    result = result.replace('- Office source (`.xlsx`, `.csv`, `.tsv`, `.docx`, `.pptx`):', '- Explicit Office import for authoring (`.xlsx`, `.csv`, `.tsv`, `.docx`, `.pptx`):')
  }
  if (name === 'univer-slide') result = result.replace('## Route the task', 'For a new scientific deck, follow zerowall-presentation first: current-chat vision check, three generated style samples, seed + style edit_image, independent assets, then editable layouts. Preserve existing imagery unless redesign is requested. Formal text/data are native objects.\n\n## Route the task')
  for (const tool of name === 'univer-slide' ? ['univer_compile_svg', 'univer_execute', 'univer_inspect', 'univer_lint', 'univer_screenshot', 'univer_export'] : ['univer_execute']) if (!result.includes(tool)) throw new Error(`Univer authoring capability ${tool} was lost.`)
  return result
}
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
