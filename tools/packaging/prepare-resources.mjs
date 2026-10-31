import { stageRoot } from '../build/paths.mjs'
import { cp, mkdir, readdir, stat } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { patchSciMasterMcp } from '../release/scimaster-compat.mjs'
import { readFile, writeFile } from 'node:fs/promises'
import { x as extractArchive } from 'tar'
import { contract } from '../build/paths.mjs'
import { createHash } from 'node:crypto'
import { reuseAssembly } from '../build/assembly-cache.mjs'
import { includePackagedSkillPath, resourceTreeFiles } from '../build/resource-tree.mjs'
import { digestFile } from '../build/content-store.mjs'

const root = resolve(import.meta.dirname, '../..')
const skillRoots = contract.resource('skills')
const sourceRoot = resolve((await stat(skillRoots.preferred).catch(() => undefined)) ? skillRoots.preferred : skillRoots.legacy)
const outputRoot = resolve(stageRoot, 'resources/extensions/skills')
const expectedParent = resolve(stageRoot, 'resources')
if (!outputRoot.startsWith(`${expectedParent}${sep}`)) throw new Error(`Refusing to replace Skills output outside ${expectedParent}.`)

const sourceEntries = (await readdir(sourceRoot, { withFileTypes: true })).filter(entry => entry.isDirectory())
const skillEntries = []
for (const skill of sourceEntries) {
  const skillRoot = resolve(sourceRoot, skill.name)
  try {
    await stat(resolve(skillRoot, 'SKILL.md'))
  } catch {
    // Deleted Skills may retain ignored caches locally. A directory without a
    // manifest is not a runtime Skill and must never be copied into a package.
    continue
  }
  skillEntries.push(skill)
}
const groups = [
  ...skillEntries.map(skill => ({ source: resolve(sourceRoot, skill.name), destination: `extensions/skills/${skill.name}`, filter: candidate => includePackagedSkillPath(resolve(sourceRoot, skill.name), candidate) })),
  ...[
    ['resources/extensions/mcp/bio-tools', 'extensions/mcp/bio-tools'],
    ['resources/extensions/mcp/ketcher-chemistry', 'extensions/mcp/ketcher-chemistry'],
    ['resources/extensions/capabilities/biogenie', 'extensions/capabilities/biogenie'],
  ].map(([source, destination]) => ({ source: resolve(root, source), destination, filter: candidate => {
    const segments = relative(resolve(root, source), candidate).toLowerCase().split(/[\\/]/u)
    return !segments.some(segment => forbiddenDirectories.has(segment)) && !/\.py[co]$/u.test(candidate)
  } })),
]
const bundle = JSON.parse(await readFile(resolve(root, 'config/catalogs/mcp-server-bundles.json'), 'utf8')).scimaster
const inputs = []
for (const group of groups) inputs.push({ destination: group.destination, files: await resourceTreeFiles(group.source, group.filter) })
const recipes = []
for (const file of ['tools/packaging/prepare-resources.mjs', 'tools/release/scimaster-compat.mjs', 'plugins/mcp/src/scimaster/zerowall-mcp-launcher.cjs']) recipes.push({ file, sha256: await digestFile(resolve(root, file)) })
const key = createHash('sha256').update(JSON.stringify({ inputs, recipes, bundle })).digest('hex')
// The complete resource tree is independent of Desktop version. Each fresh
// stage links it; unchanged files also share objects across changed trees.
await reuseAssembly({ cache: resolve(contract.cache, 'resource-trees'), output: expectedParent, key, objectRoot: contract.artifacts, prepare: async destination => {
  await mkdir(resolve(destination, 'extensions/skills'), { recursive: true })
  for (const group of groups) await cp(group.source, resolve(destination, group.destination), { recursive: true, filter: group.filter })
  console.log(`Prepared ${skillEntries.length} runtime Skills.`)
  // Pin the small CLI bundle; Python environments remain on demand.
  const sci = resolve(destination, 'sci')
  const cache = resolve(contract.cache, `mcp/${bundle.package}-${bundle.upstreamVersion}`)
  await mkdir(cache, { recursive: true })
  const archive = resolve(cache, `${bundle.package}-${bundle.upstreamVersion}.tgz`)
  if (!await stat(archive).catch(() => undefined)) {
    const metadata = await fetch(`https://registry.npmjs.org/${bundle.package}/${bundle.upstreamVersion}`).then(response => { if (!response.ok) throw new Error('SciMaster metadata unavailable'); return response.json() })
    const bytes = Buffer.from(await fetch(metadata.dist.tarball).then(response => { if (!response.ok) throw new Error('SciMaster download failed'); return response.arrayBuffer() }))
    if ('sha512-' + createHash('sha512').update(bytes).digest('base64') !== metadata.dist.integrity) throw new Error('SciMaster npm integrity mismatch')
    await writeFile(archive, bytes)
  }
  await mkdir(sci, { recursive: true })
  // Use npm tar to avoid drive-letter parsing by PATH-dependent tar binaries.
  await extractArchive({ file: archive, strip: 1, cwd: sci })
  await writeFile(resolve(sci, 'dist/mcp.cjs'), patchSciMasterMcp(await readFile(resolve(sci, 'dist/mcp.cjs'))))
  await cp(resolve(root, 'plugins/mcp/src/scimaster/zerowall-mcp-launcher.cjs'), resolve(sci, 'zerowall-mcp-launcher.cjs'))
  return { skills: skillEntries.length }
} })
