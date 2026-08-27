import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const sourceRoot = resolve(root, 'resources/skills')
const outputRoot = resolve(root, '.build/resources/skills')
const expectedParent = resolve(root, '.build/resources')
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

function includeSkillPath(candidate) {
  const path = relative(sourceRoot, candidate).replaceAll('\\', '/')
  if (path === '') return true
  const lower = path.toLowerCase()
  const segments = lower.split('/')
  if (segments.some(segment => forbiddenDirectories.has(segment))) return false
  if (lower.endsWith('.pyc') || lower.endsWith('.pyo')) return false
  return true
}
