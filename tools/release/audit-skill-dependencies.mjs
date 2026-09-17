import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
const python = process.env.ZEROWALL_MCP_BUILD_PYTHON ?? (process.platform === 'win32' ? 'py' : 'python3')
const prefix = process.platform === 'win32' && python.toLowerCase() === 'py' ? ['-3.12'] : []
const result = spawnSync(python, [...prefix, '-s', '-B', resolve(import.meta.dirname, 'audit-skill-dependencies.py'), ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: true, env: { ...process.env, PYTHONNOUSERSITE: '1' } })
if (result.error) throw result.error
process.exit(result.status ?? 1)
