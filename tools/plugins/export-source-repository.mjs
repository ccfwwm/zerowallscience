import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, writeFile, access, unlink } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { root, stageRoot, releaseRoot, contract } from '../build/paths.mjs'
import { sourceFiles, isExportableSource } from './source-files.mjs'
import { sourceRepositoryReadme } from './source-readme.mjs'

const destination = resolve(process.argv[2] ?? join(root, 'artifacts/source/zerowall-dsh-plugins'))
await mkdir(destination, { recursive: true })
const sourceOnly = process.argv.includes('--source-only')
const update = process.argv.includes('--update')
if (update) {
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: destination, encoding: 'utf8' })
  if (status.trim()) throw new Error('Refusing to update a dirty source repository')
}
const selected = sourceFiles(root)
const selectedSet = new Set(selected)
if (update) {
  const previous = execFileSync('git', ['ls-files', '-z'], { cwd: destination, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean)
  for (const path of previous) {
    if (!selectedSet.has(path) && (isExportableSource(path) || /^(?:packages|store)\//u.test(path))) {
      // Remove only individually tracked obsolete source files; preserve all
      // untracked/ignored state and independent publication receipts.
      await unlink(join(destination, path)).catch(error => { if (error.code !== 'ENOENT') throw error })
    }
  }
}
let copied = 0
for (const path of selected) {
  if (/node_modules|(?:^|\/)\.env(?:\.|$)|(?:^|\/)artifacts\/|^(?:plugins|packages|store)\/.*(?:^|\/)(?:lib|payload|\.yarn)\//u.test(path)) throw new Error('Private/generated path selected: ' + path)
  if (!update) await access(join(destination, path)).then(() => { throw new Error('Refusing to replace existing source: ' + path) }, error => { if (error.code !== 'ENOENT') throw error })
  await mkdir(dirname(join(destination, path)), { recursive: true })
  try { await cp(join(root, path), join(destination, path)) } catch (error) { if (error.code === 'ENOENT') continue; throw error }
  copied++
}
if (!sourceOnly) {
await cp(join(stageRoot, 'resources/extensions/skills'), join(destination, 'skills'), { recursive: true, dereference: true })
await mkdir(join(destination, 'mcp'), { recursive: true })
await cp(join(root, 'config/catalogs/mcp'), join(destination, 'mcp/templates'), { recursive: true })
// The launcher source is already exported from plugins/mcp/src/scimaster.
// Never copy the staged SciMaster runtime, dependencies or its local state.
await mkdir(join(destination, 'catalogs'), { recursive: true })
for (const kind of ['plugin', 'skill', 'mcp', 'python']) {
  await cp(join(releaseRoot, 'catalogs', `${kind}-catalog.json`), join(destination, 'catalogs', `${kind}-catalog.json`))
  await cp(join(releaseRoot, 'catalogs', `${kind}-latest.json`), join(destination, 'catalogs', `${kind}-latest.json`))
}
await cp(join(root, 'config/catalogs/trusted-keys.json'), join(destination, 'catalogs/trusted-keys.json'))
}
await mkdir(join(destination, 'docs'), { recursive: true })
await cp(join(root, 'docs/extensions-update-guide.md'), join(destination, 'docs/extensions-update-guide.md'))
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
pkg.name = 'zerowall-dsh-plugins'
pkg.description = 'ZeroWall independently versioned DSH extensions and signed resources.'
pkg.scripts = {
  'artifacts:init': 'node tools/build/init-artifacts.mjs',
  'artifacts:links': 'node tools/build/link-outputs.mjs',
  'plugins:typert': 'node tools/plugins/generate-typert.mjs',
  'plugins:bundle': 'pnpm --filter @zerowallscience/plugin-* run bundle',
  'plugins:typecheck': 'pnpm --filter @zerowallscience/plugin-* run typecheck',
  'plugins:test': 'pnpm --filter @zerowallscience/plugin-* run test',
  'plugins:pack': 'node tools/plugins/pack.mjs',
  'package:build': 'node tools/build/build-graph.mjs package:build',
  'plugin:build': 'node tools/build/build-graph.mjs plugin:build',
  'plugin:pack': 'node tools/build/build-graph.mjs plugin:pack',
  'source:verify': 'node tools/plugins/verify-source-repository.mjs',
}
await writeFile(join(destination, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
await writeFile(join(destination, '.gitignore'), 'node_modules/\nartifacts/\n/plugins/*/lib/\n/plugins/biogenie/payload/\ndist/\n.build/\n.env\n.env.*\n/scripts/env/\n*.pem\n*.tsbuildinfo\n*.log\n__pycache__/\n')
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const dshCommit = execFileSync('git', ['-C', 'deepseek-harness', 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const integrations = JSON.parse(await readFile(join(root, 'config/integrations/upstream-sources.json'), 'utf8'))
await writeFile(join(destination, 'README.md'), sourceRepositoryReadme({ version: contract.version, sourceOnly, sourceCommit, dshCommit, integrations }))
const records = sourceOnly ? [] : JSON.parse(await readFile(join(releaseRoot, 'plugin-packages.json'), 'utf8'))
await writeFile(join(destination, 'source-provenance.json'), JSON.stringify({ applicationVersion: contract.version, sourceRepository: 'https://github.com/ccfwwm/zerowallscience', sourceCommit,
  sourceOnly, buildCommit: sourceOnly ? null : JSON.parse(await readFile(join(contract.packages, 'artifact-manifest.json'), 'utf8')).commit, dshCommit,
  packages: records.map(({ id, version, kind }) => ({ id, version, kind })), exportedSourceFiles: copied }, null, 2) + '\n')
console.log(`Exported ${copied} current source files to ${destination}`)
