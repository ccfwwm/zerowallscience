import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { contract, root } from './paths.mjs'
if (!process.env.npm_execpath) throw new Error('Run pnpm package:stable:win')
const env = { ...process.env, ELECTRON_CACHE: join(contract.cache, 'electron'), ELECTRON_BUILDER_CACHE: join(contract.cache, 'electron-builder'), ZEROWALL_TARGET: 'windows-x64' }
for (const args of [['build'], ['--filter', '@zerowallscience/desktop', 'run', 'package:stable:win']]) {
  execFileSync(process.execPath, [process.env.npm_execpath, ...args], { cwd: root, env, stdio: 'inherit' })
}
