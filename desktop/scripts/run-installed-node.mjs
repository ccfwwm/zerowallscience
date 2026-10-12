import { spawnSync } from 'node:child_process'
const result = spawnSync(process.argv[2], process.argv.slice(3), {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, stdio: 'inherit',
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
