import { execFileSync } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function verifyRuntimeFreshness(root, { allowDirty = process.env.ZEROWALL_ALLOW_DIRTY_DSH === '1' } = {}) {
  const json = async file => JSON.parse(await readFile(resolve(root, file), 'utf8'))
  const pin = await json('config/deepseek-harness/upstream.json')
  const app = await json('package.json')
  const build = await json('.build/dsh/build-receipt.json')
  const runtime = await json('.build/runtime/build-receipt.json')
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: resolve(root, 'deepseek-harness'), encoding: 'utf8' }).trim()
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: resolve(root, 'deepseek-harness'), encoding: 'utf8' }).trim()
  if (dirty && !allowDirty) throw new Error('Harness source changed since the pinned build. Commit and rebuild it before packaging.')
  for (const receipt of [build, runtime]) {
    if (head !== pin.commit || receipt.commit !== head || receipt.version !== pin.version || receipt.applicationVersion !== app.version || runtime.builtAt !== build.builtAt) {
      throw new Error('Stale Harness runtime: source, build, runtime, and release version must match. Run pnpm build.')
    }
  }
  let checked = 0
  for (const entry of await readdir(resolve(root, 'plugins'), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'wechat') continue
    const source = resolve(root, 'plugins', entry.name)
    const manifestText = await readFile(join(source, 'package.json'), 'utf8').catch(error => {
      if (error.code === 'ENOENT') return undefined
      throw error
    })
    if (manifestText === undefined) continue
    const manifest = JSON.parse(manifestText)
    const target = resolve(root, '.build/runtime/node_modules', manifest.name)
    if (manifest.version !== app.version) throw new Error(`Release version mismatch: ${manifest.name}`)
    for (const file of ['package.json', 'zerowall.plugin.json', ...(await readdir(join(source, 'lib'))).filter(name => /\.(?:js|css)$/.test(name)).map(name => `lib/${name}`)]) {
      if (!(await readFile(join(source, file))).equals(await readFile(join(target, file)))) {
        throw new Error(`Stale runtime: ${manifest.name}/${file}. Run pnpm build before packaging.`)
      }
      checked++
    }
  }
  return { commit: head, version: app.version, checked }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log('Runtime freshness verified:', await verifyRuntimeFreshness(resolve(import.meta.dirname, '../..')))
}
