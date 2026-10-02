import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { root, stageRoot, releaseRoot, contract } from '../build/paths.mjs'

const destination = resolve(process.argv[2] ?? join(root, 'artifacts/source/zerowall-dsh-plugins'))
await mkdir(destination, { recursive: true })
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
const selected = tracked.filter(path => /^(plugins\/|packages\/|store\/|tools\/|config\/|tests\/|patches\/|resources\/python\/|desktop\/src\/shared\/)/u.test(path)
  || ['tsconfig.base.json', 'vitest.plugins.config.ts', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.gitmodules', 'LICENSE', 'LICENSE.md'].includes(path))
let copied = 0
for (const path of selected) {
  if (/node_modules|(?:^|\/)\.env(?:\.|$)|(?:^|\/)artifacts\//u.test(path)) throw new Error('Private/generated path selected')
  await access(join(destination, path)).then(() => { throw new Error('Refusing to replace existing source: ' + path) }, error => { if (error.code !== 'ENOENT') throw error })
  await mkdir(dirname(join(destination, path)), { recursive: true })
  await cp(join(root, path), join(destination, path))
  copied++
}
await cp(join(stageRoot, 'resources/skills'), join(destination, 'skills'), { recursive: true, dereference: true })
await mkdir(join(destination, 'mcp'), { recursive: true })
await cp(join(root, 'config/catalogs/mcp'), join(destination, 'mcp/templates'), { recursive: true })
await cp(join(stageRoot, 'resources/sci'), join(destination, 'mcp/scimaster'), { recursive: true, dereference: true })
await mkdir(join(destination, 'catalogs'), { recursive: true })
for (const kind of ['plugin', 'skill', 'mcp', 'python']) {
  await cp(join(releaseRoot, 'catalogs', `${kind}-catalog.json`), join(destination, 'catalogs', `${kind}-catalog.json`))
  await cp(join(releaseRoot, 'catalogs', `${kind}-latest.json`), join(destination, 'catalogs', `${kind}-latest.json`))
}
await cp(join(root, 'config/catalogs/trusted-keys.json'), join(destination, 'catalogs/trusted-keys.json'))
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
  'source:verify': 'node tools/plugins/verify-source-repository.mjs',
}
await writeFile(join(destination, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
await writeFile(join(destination, '.gitignore'), 'node_modules/\nartifacts/\nlib/\ndist/\n.build/\n.env\n.env.*\n*.pem\n*.tsbuildinfo\n*.log\n__pycache__/\n')
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const dshCommit = execFileSync('git', ['-C', 'deepseek-harness', 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const records = JSON.parse(await readFile(join(releaseRoot, 'plugin-packages.json'), 'utf8'))
await writeFile(join(destination, 'source-provenance.json'), JSON.stringify({ applicationVersion: contract.version, sourceRepository: 'https://github.com/ccfwwm/zerowallscience', sourceCommit,
  buildCommit: JSON.parse(await readFile(join(contract.packages, 'artifact-manifest.json'), 'utf8')).commit, dshCommit,
  packages: records.map(({ id, version, kind }) => ({ id, version, kind })), exportedTrackedFiles: copied }, null, 2) + '\n')
console.log(`Exported ${copied} tracked source files and staged Skills/MCP to ${destination}`)
