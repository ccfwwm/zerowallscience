import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '../..')
const profile = JSON.parse(await readFile(resolve(root, 'config/layout/runtime-profile.json'), 'utf8'))
const core = profile.optionalPluginPolicy?.bundled === false
const args = core
  ? [resolve(import.meta.dirname, 'verify-packaged-runtime.mjs'), '--desktop-only', '--require-thin-python']
  : [process.env.npm_execpath, 'exec', 'vitest', 'run', '--config', 'e2e/vitest.config.ts', 'e2e/desktop.spec.ts']
if (!core && !process.env.npm_execpath) throw new Error('Run pnpm smoke:electron')
const result = spawnSync(process.execPath, args, { cwd: resolve(root, 'desktop'), stdio: 'inherit', windowsHide: true })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
