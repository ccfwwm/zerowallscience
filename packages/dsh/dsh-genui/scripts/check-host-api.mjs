import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const hostRef = process.argv[2]
assert.match(hostRef ?? '', /^dsh-v\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/, '需要明确的 DSH 发布标签')
const version = hostRef.slice('dsh-v'.length)
const pkg = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'))
const dshPackages = Object.keys(pkg.peerDependencies).filter(name => name.startsWith('@deepseek-ai/dsh-'))
const checkRoot = await mkdtemp(join(tmpdir(), 'dsh-genui-host-api-'))

try {
  for (const name of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', 'tsconfig.json', 'tsdown.config.ts', 'vitest.config.ts', 'SKILL.md']) {
    await cp(join(repoRoot, name), join(checkRoot, name))
  }
  await cp(join(repoRoot, 'src'), join(checkRoot, 'src'), { recursive: true })
  await cp(join(repoRoot, 'tests'), join(checkRoot, 'tests'), { recursive: true })
  // e2e-auth 等测试按 cwd 相对路径读取 scripts/ 源码，隔离目录需要一并拷贝
  await cp(join(repoRoot, 'scripts'), join(checkRoot, 'scripts'), { recursive: true })

  // pnpm 在隔离目录安装发布包，源码中的 import 由该目录的 node_modules 解析。
  // hostRuntimeClosure：发布宿主包在真实 App 内运行，部分 import 未在包内声明
  // （如 ui-primitives 直接 import clsx/shiki/simple-icons，client-store import
  // zustand/immer）。真实宿主由 App 外层提供这些依赖，隔离目录必须显式补齐，
  // 否则 vite 在模块加载阶段以 "Failed to resolve import" 拒绝整批测试文件。
  // 新宿主引入新的幽灵依赖时 vitest 会点名报错，届时在此追加。
  const hostRuntimeClosure = [
    'clsx', 'simple-icons', 'shiki', '@shikijs/langs', 'anser', 'diff',
    'mdast-util-gfm', 'mdast-util-math', 'micromark-extension-gfm',
    'micromark-extension-math', 'zustand', 'immer',
  ]
  execFileSync('pnpm', ['add', '--save-dev', '--save-exact',
    ...dshPackages.map(name => `${name}@${version}`),
    `@deepseek-ai/dsh-util-code-language@${version}`,
    ...hostRuntimeClosure,
  ], { cwd: checkRoot, stdio: 'inherit' })
  for (const name of dshPackages) {
    const installed = JSON.parse(await readFile(join(checkRoot, 'node_modules', name, 'package.json'), 'utf8'))
    assert.equal(installed.version, version, `${name} 必须使用 ${version} 的公开类型`)
  }
  execFileSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], { cwd: checkRoot, stdio: 'inherit' })
  // 全量套件：安装的宿主暴露 fence-registry 时，registry 门控的渲染用例
  // （默认 0.1.2-rc.1 依赖下被 skipIf 跳过的那批）会真正执行而不是静默跳过
  execFileSync('pnpm', ['exec', 'vitest', 'run'], { cwd: checkRoot, stdio: 'inherit' })
  execFileSync('pnpm', ['exec', 'tsdown'], { cwd: checkRoot, stdio: 'inherit' })
  console.log(`${hostRef} API typecheck、全量单元测试与 tsdown build 通过`)
} finally {
  await rm(checkRoot, { recursive: true, force: true })
}
