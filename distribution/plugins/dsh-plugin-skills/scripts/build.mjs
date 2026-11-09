/** Build the owned registry subpath without republishing a modified official package. */
import { readFile, writeFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
const source = new URL('../../../../packages/skill/skill/src/index.ts', import.meta.url)
const target = new URL('../src/host/registry.ts', import.meta.url)
const registry = (await readFile(source, 'utf8'))
  .replace(/  interface Context \{\r?\n    skills: SkillRegistry\r?\n  \}\r?\n\r?\n/u, '')
await writeFile(target, '// Generated from the workspace DSH skill registry; retain THIRD-PARTY-LICENSES/DSH-MIT.txt.\n' + registry)
await import('../../../scripts/build-plugin.mjs')
await build({ entryPoints: [fileURLToPath(target)], outfile: 'lib/registry.js', bundle: true, platform: 'node', format: 'esm', target: 'node24', packages: 'external' })
