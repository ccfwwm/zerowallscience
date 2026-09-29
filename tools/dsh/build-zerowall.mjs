import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const source = resolve(root, 'deepseek-harness')
// pnpm sets npm_execpath for lifecycle scripts, but that variable is not
// guaranteed to survive the PowerShell/Corepack wrapper used on Windows.
// Resolve the bundled Corepack pnpm entrypoint as a deterministic fallback so
// the Harness build can also be invoked directly during package verification.
const pnpmCli = process.env.npm_execpath
  ?? resolve(dirname(process.execPath), 'node_modules', 'corepack', 'dist', 'pnpm.js')
const expected = JSON.parse(await readFile(resolve(root, 'config/deepseek-harness/upstream.json'), 'utf8'))
const rootManifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))

if (!pnpmCli) throw new Error('pnpm executable path is unavailable to the ZeroWall DSH build wrapper.')

const manifest = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8'))
const commit = git(['rev-parse', 'HEAD'])
const status = git(['status', '--porcelain'])
const allowDirty = process.env.ZEROWALL_ALLOW_DIRTY_DSH === '1'
if (manifest.version !== expected.version) {
  throw new Error(`DSH version must be ${expected.version}, received ${manifest.version}`)
}
if (commit !== expected.commit) {
  throw new Error(`DSH commit must be ${expected.commit}, received ${commit}`)
}
if (status !== '' && !allowDirty) {
  throw new Error(`deepseek-harness must be clean before building:\n${status}`)
}

runPnpm(['--filter', '@deepseek-ai/dsh-root', 'run', 'build:lib:host'], { NODE_OPTIONS: '--max-old-space-size=8192' })
runPnpm(['--filter', '@deepseek-ai/dsh-root', 'run', 'build:lib:client'], { NODE_OPTIONS: '--max-old-space-size=8192' })
runPnpm(['--filter', '@deepseek-ai/dsh-root', 'run', 'build:web'])
await mkdir(resolve(root, '.build/dsh'), { recursive: true })
await writeFile(resolve(root, '.build/dsh/build-receipt.json'), JSON.stringify({
  commit, version: manifest.version, applicationVersion: rootManifest.version, builtAt: new Date().toISOString(),
}, null, 2))

function git(args) {
  return execFileSync('git', args, { cwd: source, encoding: 'utf8' }).trim()
}

function runPnpm(args, extraEnv = {}) {
  execFileSync(process.execPath, [pnpmCli, ...args], {
    cwd: source,
    stdio: 'inherit',
    env: { ...process.env, ZEROWALL_CLIENT_VERSION: rootManifest.version, ...extraEnv },
  })
}
