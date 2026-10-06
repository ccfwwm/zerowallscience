import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { contract, root } from './paths.mjs'
if (!process.env.npm_execpath) throw new Error('Run pnpm package:stable:win')
const env = { ...process.env, ELECTRON_CACHE: join(contract.cache, 'electron'), ELECTRON_BUILDER_CACHE: join(contract.cache, 'electron-builder'), ZEROWALL_TARGET: 'windows-x64' }
for (const args of [['build']]) {
  execFileSync(process.execPath, [process.env.npm_execpath, ...args], { cwd: root, env, stdio: 'inherit' })
}

// The stable desktop installer is intentionally thin: Python + pip and the
// signed 42-package core layer are fetched and installed after first launch.
// Never copy a staged Python archive into a release package; that archive is
// large and is published as an independently verified runtime resource.
const { buildPaths } = await import('./paths.cjs')
const current = buildPaths(root)
env.ZEROWALL_BUNDLE_PYTHON = '0'
env.ZEROWALL_BUILD_ID = current.buildId
execFileSync(process.execPath, [process.env.npm_execpath, '--filter', '@zerowallscience/desktop', 'run', 'package:stable:win'], { cwd: root, env, stdio: 'inherit' })
