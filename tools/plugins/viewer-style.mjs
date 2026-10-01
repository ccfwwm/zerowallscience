import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

export function viewerStylePlugin() {
  return {
    name: 'zerowall-viewer-style',
    resolveId(id) { return id === 'zerowall:viewer-style' ? '\0zerowall:viewer-style' : null },
    load(id) {
      if (id !== '\0zerowall:viewer-style') return null
      const root = resolve(import.meta.dirname, '../../plugins/files')
      const require = createRequire(resolve(root, 'package.json'))
      const css = readFileSync(resolve(dirname(require.resolve('@open-file-viewer/core')), 'style.css'), 'utf8')
      const manifest = JSON.parse(readFileSync(resolve(root, 'lib/viewer-assets/asset-manifest.json'), 'utf8'))
      return `export default ${JSON.stringify(css)}; export const assetVersion = ${JSON.stringify(manifest.version)};`
    },
  }
}
