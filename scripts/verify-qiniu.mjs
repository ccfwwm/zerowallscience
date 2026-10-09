import { spawnSync } from 'node:child_process'
import { root } from '../tools/build/paths.mjs'

const result = spawnSync(process.execPath, ['scripts/publish-desktop.mjs', 'verify'], { cwd: root, env: process.env, stdio: 'inherit', windowsHide: true })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
