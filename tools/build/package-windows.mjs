import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { acquireBuildLock } from './build-lock.mjs'
const root = resolve(import.meta.dirname, '../..')
if (!process.env.npm_execpath) throw new Error('Run pnpm package:stable:win')
// The formal packaging entry checks every component fingerprint, including
// committed changes. Unchanged compiled outputs and tarballs are reused.
const applicationVersion = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version
const artifactRoot = resolve(process.env.ZEROWALL_ARTIFACT_ROOT ?? join(root, 'artifacts'))
execFileSync(process.execPath, [process.env.npm_execpath, 'build'], { cwd: root, env: process.env, stdio: 'inherit' })
const activeStage = JSON.parse(await readFile(join(artifactRoot, 'stage', applicationVersion, 'current.json'), 'utf8'))
process.env.ZEROWALL_BUILD_ID = activeStage.buildId
const { contract } = await import('./paths.mjs')
const { verifyRuntimeFreshness } = await import('../packaging/verify-runtime-freshness.mjs')
const releaseLock = await acquireBuildLock(contract.cache, 'runtime')
try {
await verifyRuntimeFreshness(root)
const env = {
  ...process.env,
  ELECTRON_CACHE: join(contract.cache, 'electron'),
  ELECTRON_BUILDER_CACHE: join(contract.cache, 'electron-builder'),
  ZEROWALL_TARGET: 'windows-x64',
  ZEROWALL_BUNDLE_PYTHON: '0',
  ZEROWALL_BUILD_ID: activeStage.buildId,
}
execFileSync(process.execPath, [process.env.npm_execpath, '--filter', '@zerowallscience/desktop', 'run', 'package:stable:win'], { cwd: root, env, stdio: 'inherit' })
} finally { await releaseLock() }
