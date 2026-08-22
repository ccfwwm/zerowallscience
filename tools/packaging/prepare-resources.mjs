import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { extname, relative, resolve, sep } from 'node:path'

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
await cp(sourceRoot, outputRoot, { recursive: true, filter: includeSkillPath })

const skillEntries = (await readdir(outputRoot, { withFileTypes: true })).filter(entry => entry.isDirectory())
for (const skill of skillEntries) await stat(resolve(outputRoot, skill.name, 'SKILL.md'))
console.log(`Prepared ${skillEntries.length} runtime Skills.`)

function includeSkillPath(candidate) {
  const path = relative(sourceRoot, candidate).replaceAll('\\', '/')
  if (path === '') return true
  const lower = path.toLowerCase()
  const segments = lower.split('/')
  if (segments.some(segment => forbiddenDirectories.has(segment))) return false
  if (lower.endsWith('.pyc') || lower.endsWith('.pyo')) return false
  if (lower.startsWith('gpt-image2-ppt/docs/assets/')) return false
  if (lower.startsWith('gpt-image2-ppt/examples/editable-pptx/')) return false
  if (lower.startsWith('gpt-image2-ppt/examples/') && !isRecipeFile(candidate)) return false
  return true
}

function isRecipeFile(path) {
  const extension = extname(path).toLowerCase()
  return extension === '.md' || extension === '.json' || extension === '.txt'
}
