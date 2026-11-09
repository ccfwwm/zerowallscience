/**
 * check:build — 守 `lib/` 产物与源码同步。
 *
 * 为什么单独成脚本：lib/ 是包发布的边界（`dsh plugin add` 不构建），源码改了
 * 而产物没跟上会让装好的用户拿到旧代码。有 CI 时以 `git diff --exit-code` 把
 * 这条钉死；本仓没有 CI，本脚本改用 `git status --porcelain -- lib/` 判漂移
 * （只关心 lib/ 下有没有改动/未跟踪文件，工作区其余部分是否干净不参与判定），
 * 且不依赖 shell（Windows 上 `git` 也只吃 execFile 的 argv）。
 *
 * 用法：`npm run build && node scripts/check-build.mjs`——脚本自己会看 lib/ 在
 * git 里的状态，改完代码忘了重 build 时立刻见红。
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { root, buildReceipt } from './build-receipt.mjs'

try {
  const stored = JSON.parse(await readFile(join(root, 'lib/build-receipt.json'), 'utf8'))
  if (JSON.stringify(stored) !== JSON.stringify(await buildReceipt())) throw new Error('源码或构建产物已变化，请运行 npm run build')
  console.log('[check-build] source and emitted Host/Client SHA-256 verified')
} catch (err) {
  console.error(`[check-build] ${err?.message ?? err}`)
  process.exit(1)
}
