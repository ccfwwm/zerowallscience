import { stageRoot } from '../build/paths.mjs'
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { patchSciMasterMcp } from '../release/scimaster-compat.mjs'
import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { contract } from '../build/paths.mjs'
import { createHash } from 'node:crypto'

const root = resolve(import.meta.dirname, '../..')
const skillRoots = contract.resource('skills')
const sourceRoot = resolve((await stat(skillRoots.preferred).catch(() => undefined)) ? skillRoots.preferred : skillRoots.legacy)
const outputRoot = resolve(stageRoot, 'resources/extensions/skills')
const expectedParent = resolve(stageRoot, 'resources')
const forbiddenDirectories = new Set([
  '.git', '.pytest_cache', '__pycache__', 'coverage', 'output', 'outputs', 'rendered',
  'screenshots', 'test-output', 'test-results', 'tests',
])

if (!outputRoot.startsWith(`${expectedParent}${sep}`)) throw new Error(`Refusing to replace Skills output outside ${expectedParent}.`)

await rm(outputRoot, { recursive: true, force: true })
await mkdir(outputRoot, { recursive: true })
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
  await cp(skillRoot, resolve(outputRoot, skill.name), { recursive: true, filter: includeSkillPath })
  skillEntries.push(skill)
}
console.log(`Prepared ${skillEntries.length} runtime Skills.`)
// Ship reviewed launchers and widgets, while keeping Python environments on demand.
for (const [source, destination] of [
  ['resources/extensions/mcp/bio-tools', 'extensions/mcp/bio-tools'],
  ['resources/extensions/mcp/ketcher-chemistry', 'extensions/mcp/ketcher-chemistry'],
  ['resources/extensions/capabilities/biogenie', 'extensions/capabilities/biogenie'],
]) {
  const input = resolve(root, source)
  await cp(input, resolve(stageRoot, 'resources', destination), { recursive: true, filter: candidate => {
    const segments = relative(input, candidate).toLowerCase().split(/[\\/]/u)
    return !segments.some(segment => forbiddenDirectories.has(segment) || ['node_modules', '.venv', 'venv', '.cache', 'python'].includes(segment)) && !/\.py[co]$/u.test(candidate)
  } })
}
// Catalogs distribute the reviewed authoring descriptions too. The runtime
// copy was hash-checked and adapted without changing the upstream package.
// Univer is an optional package in the 8.0.7 Core box. A Core-only build must
// therefore remain valid when that package is not installed in the runtime.
const univerSkillsRoot = resolve(stageRoot, 'offline-profile/modules/dsh-univer-office/skills')
if (await stat(univerSkillsRoot).catch(() => undefined)) {
  for (const name of ['univer', 'univer-slide', 'univer-doc', 'univer-sheet']) {
    const source = resolve(univerSkillsRoot, name)
    if (!await stat(source).catch(() => undefined)) continue
    await cp(source, resolve(outputRoot, name), { recursive: true, filter: includeSkillPath })
  }
}

// Small, self-contained CLI resource; Python remains an on-demand download.
// Pin the npm tarball and apply the existing verified compatibility patch.
const sci = resolve(stageRoot, 'resources/sci')
const cache = resolve(contract.cache, 'mcp/scimaster-cli-0.3.15')
await mkdir(cache, { recursive: true })
let archive = resolve(cache, 'scimaster-cli-0.3.15.tgz')
if (!await stat(archive).catch(() => undefined)) {
  const metadata = await fetch('https://registry.npmjs.org/scimaster-cli/0.3.15').then(response => { if (!response.ok) throw new Error('SciMaster metadata unavailable'); return response.json() })
  const bytes = Buffer.from(await fetch(metadata.dist.tarball).then(response => { if (!response.ok) throw new Error('SciMaster download failed'); return response.arrayBuffer() }))
  if ('sha512-' + createHash('sha512').update(bytes).digest('base64') !== metadata.dist.integrity) throw new Error('SciMaster npm integrity mismatch')
  await writeFile(archive, bytes)
}
await mkdir(sci, { recursive: true })
execFileSync('tar', ['-xzf', archive, '--strip-components=1', '-C', sci], { windowsHide: true })
await writeFile(resolve(sci, 'dist/mcp.cjs'), patchSciMasterMcp(await readFile(resolve(sci, 'dist/mcp.cjs'))))
await cp(resolve(root, 'mcp-environment-staging/sci/zerowall-mcp-launcher.cjs'), resolve(sci, 'zerowall-mcp-launcher.cjs'))

function includeSkillPath(candidate) {
  const path = relative(sourceRoot, candidate).replaceAll('\\', '/')
  if (path === '') return true
  const lower = path.toLowerCase()
  const segments = lower.split('/')
  if (segments.some(segment => forbiddenDirectories.has(segment))) return false
  if (lower.endsWith('.pyc') || lower.endsWith('.pyo')) return false
  return true
}
