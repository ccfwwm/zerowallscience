import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const sourceRoot = resolve(process.argv[2] ?? join(root, '..', 'claude-science-code'))
const outputPath = resolve(process.argv[3] ?? join(root, 'docs', 'claude-science-integration-audit.json'))
const sourceSkills = join(sourceRoot, 'app', 'runtime', 'assets', 'skills')
const bundledSkills = join(root, 'resources', 'skills')

async function filesUnder(path) {
  const entries = await readdir(path, { withFileTypes: true })
  const result = []
  for (const entry of entries) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) result.push(...await filesUnder(child))
    else if (entry.isFile()) result.push(child)
  }
  return result
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }

async function skillRecord(name) {
  const source = join(sourceSkills, name)
  const target = join(bundledSkills, name)
  const sourceFiles = await filesUnder(source)
  const targetFiles = await filesUnder(target).catch(() => [])
  const targetByRelative = new Map(targetFiles.map(path => [relative(target, path).replaceAll('\\', '/'), path]))
  const differences = []
  let matchingFiles = 0
  for (const path of sourceFiles) {
    const key = relative(source, path).replaceAll('\\', '/')
    const other = targetByRelative.get(key)
    if (other === undefined) { differences.push({ path: key, kind: 'source-only' }); continue }
    const [left, right] = await Promise.all([readFile(path), readFile(other)])
    if (sha256(left) === sha256(right)) matchingFiles += 1
    else differences.push({ path: key, kind: 'content-diff' })
    targetByRelative.delete(key)
  }
  for (const key of targetByRelative.keys()) differences.push({ path: key, kind: 'zerowall-only' })
  const markdown = await readFile(join(source, 'SKILL.md'), 'utf8')
  const license = /^license:\s*(.+)$/mu.exec(markdown)?.[1]?.trim() ?? null
  return {
    name,
    sourcePath: relative(root, source).replaceAll('\\', '/'),
    zeroWallPath: relative(root, target).replaceAll('\\', '/'),
    sourceFiles: sourceFiles.length,
    zeroWallFiles: targetFiles.length,
    matchingFiles,
    differences,
    sourceSkillSha256: sha256(await readFile(join(source, 'SKILL.md'))),
    zeroWallSkillSha256: await readFile(join(target, 'SKILL.md')).then(sha256).catch(() => null),
    license,
    status: targetFiles.length === 0 ? 'missing' : differences.length === 0 ? 'exact-duplicate' : 'existing-adapted',
  }
}

await stat(sourceSkills)
await stat(bundledSkills)
const sourceNames = (await readdir(sourceSkills, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
const skills = await Promise.all(sourceNames.map(skillRecord))
const report = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  source: { path: relative(root, sourceRoot).replaceAll('\\', '/'), runtime: '0.0.37-linux-x64' },
  summary: {
    sourceSkills: skills.length,
    missing: skills.filter(item => item.status === 'missing').length,
    exactDuplicates: skills.filter(item => item.status === 'exact-duplicate').length,
    existingAdapted: skills.filter(item => item.status === 'existing-adapted').length,
  },
  policy: 'Claude Science Skills are audited for provenance and duplication; existing ZeroWall Skills are authoritative and are never overwritten.',
  skills,
}
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(`Claude Science Skill audit: ${skills.length} source Skills, ${report.summary.missing} missing, ${report.summary.exactDuplicates} exact duplicates, ${report.summary.existingAdapted} adapted.`)
