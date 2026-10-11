import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const pnpm = process.env.npm_execpath
if (!pnpm) throw new Error('Run pnpm build:dev')
function run(args) { execFileSync(process.execPath, [pnpm, ...args], { cwd: root, env: process.env, stdio: 'inherit' }) }
// Compatibility output links target artifacts/dev; never initialize or select
// a release stage, offline closure, catalog, signer or installer payload here.
for (const task of ['artifacts:links', 'version:check', 'plugins:generate', 'profiles:generate', 'dsh:verify']) run([task])
execFileSync(process.execPath, [resolve(root, 'tools/build/build-graph.mjs'), 'development', ...process.argv.slice(2)], { cwd: root, env: process.env, stdio: 'inherit' })
