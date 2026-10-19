import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function syncDesktopRelease(root, { check = false } = {}) {
  const config = JSON.parse(await readFile(join(root, 'config/build/desktop-release.json'), 'utf8'))
  if (config.schema !== 1 || !/^\d+\.\d+\.\d+$/u.test(config.version) || typeof config.description !== 'string') throw new Error('Invalid desktop release configuration')
  const changed = []
  for (const file of ['package.json', 'desktop/package.json', 'config/layout/package-layout.json', 'config/layout/runtime-profile.json', 'config/integrations/upstream-sources.json']) {
    const path = join(root, file), original = await readFile(path, 'utf8'), document = JSON.parse(original)
    const mismatch = document.version !== config.version || (file.endsWith('package.json') && document.description !== config.description)
    if (!mismatch) continue
    changed.push(file)
    if (!check) {
      document.version = config.version
      if (file.endsWith('package.json')) document.description = config.description
      await writeFile(path, JSON.stringify(document, null, 2) + '\n')
    }
  }
  if (check && changed.length) throw new Error(`Desktop release config is not synchronized: ${changed.join(', ')}; run pnpm release:sync`)
  return { ...config, changed }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await syncDesktopRelease(resolve(import.meta.dirname, '../..'), { check: process.argv.includes('--check') })
  console.log(`Desktop release ${result.version}: ${result.changed.length} manifests synchronized`)
}
