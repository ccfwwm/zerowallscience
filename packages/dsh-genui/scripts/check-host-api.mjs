import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const hostRef = process.argv[2]
assert.match(hostRef ?? '', /^dsh-v0\.1\.7-(?:alpha\.[12]|rc\.[12])$/, '需要明确的 DSH 0.1.7 发布标签')
const version = hostRef.slice('dsh-v'.length)
const pkg = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'))
const dshPackages = Object.keys(pkg.peerDependencies).filter(name => name.startsWith('@deepseek-ai/dsh-'))
const checkRoot = await mkdtemp(join(repoRoot, '.compat-check-'))

try {
  for (const name of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', 'tsconfig.json', 'tsdown.config.ts']) {
    await cp(join(repoRoot, name), join(checkRoot, name))
  }
  await cp(join(repoRoot, 'src'), join(checkRoot, 'src'), { recursive: true })

  // pnpm 在隔离目录安装发布包，源码中的 import 由该目录的 node_modules 解析。
  execFileSync('pnpm', ['add', '--save-dev', '--save-exact', ...dshPackages.map(name => `${name}@${version}`)], { cwd: checkRoot, stdio: 'inherit' })
  for (const name of dshPackages) {
    const installed = JSON.parse(await readFile(join(checkRoot, 'node_modules', name, 'package.json'), 'utf8'))
    assert.equal(installed.version, version, `${name} 必须使用 ${version} 的公开类型`)
  }
  execFileSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], { cwd: checkRoot, stdio: 'inherit' })
  execFileSync('pnpm', ['exec', 'tsdown'], { cwd: checkRoot, stdio: 'inherit' })
  console.log(`${hostRef} API typecheck 与 tsdown build 通过`)
} finally {
  await rm(checkRoot, { recursive: true, force: true })
}
