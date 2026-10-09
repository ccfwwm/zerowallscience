import { spawnSync } from 'node:child_process'
import { root } from '../tools/build/paths.mjs'
import { openQiniuStore } from '../tools/release/qiniu-store.mjs'

// Keep the documented Stable entry point on the guarded publication flow:
// immutable bytes are downloaded and compared before latest is promoted.
if (process.env.ZEROWALL_QINIU_OVERWRITE === '1') throw new Error('Version assets are immutable; publish a new version for different bytes')
if (process.env.ZEROWALL_QINIU_REFRESH_ONLY === '1') {
  const store = await openQiniuStore(root)
  await store.refresh(['stable/latest.yml', 'stable/releases/latest.json', 'stable/releases-zerowallsciencedev/latest.json'])
  console.log('Refreshed Stable pointers without uploading objects.')
} else {
  for (const mode of ['stage', 'promote']) {
    const result = spawnSync(process.execPath, ['scripts/publish-desktop.mjs', mode], { cwd: root, env: process.env, stdio: 'inherit', windowsHide: true })
    if (result.error) throw result.error
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
}
