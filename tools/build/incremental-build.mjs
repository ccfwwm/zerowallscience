import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const pnpm = process.env.npm_execpath
if (!pnpm) throw new Error('Run pnpm build or pnpm build:full')
const force = process.argv.includes('--force')
function run(args) { execFileSync(process.execPath, [pnpm, ...args], { cwd: root, env: process.env, stdio: 'inherit' }) }
run(['artifacts:init', '--new'])
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version
const artifacts = resolve(process.env.ZEROWALL_ARTIFACT_ROOT ?? join(root, 'artifacts'))
process.env.ZEROWALL_BUILD_ID = JSON.parse(await readFile(join(artifacts, 'stage', version, 'current.json'), 'utf8')).buildId
run(['artifacts:links'])
run(['version:check'])
run(['plugins:generate'])
run(['profiles:generate'])
run(['dsh:verify'])
execFileSync(process.execPath, [join(root, 'tools/build/build-graph.mjs'), 'components', ...(force ? ['--force'] : [])], { cwd: root, env: process.env, stdio: 'inherit' })
execFileSync(process.execPath, [join(root, 'tools/build/prepare-native.mjs')], { cwd: root, env: process.env, stdio: 'inherit' })
run(['dsh:runtime:closure'])
const { assembleRuntime } = await import('./assembly-cache.mjs')
for (const kind of ['core', 'offline']) await assembleRuntime(kind, task => run([task]))
run(['resources:prepare'])
execFileSync(process.execPath, [join(root, 'tools/packaging/write-runtime-integrity.mjs')], { cwd: root, env: process.env, stdio: 'inherit' })
for (const task of ['commands:prepare', 'plugins:pack', 'catalogs:generate', 'runtime:profile:sign']) run([task])
execFileSync(process.execPath, [join(root, 'tools/build/build-graph.mjs'), 'desktop'], { cwd: root, env: process.env, stdio: 'inherit' })
