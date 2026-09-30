import { cp, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { root, stageRoot } from '../build/paths.mjs'
const output = join(stageRoot, 'commands')
await mkdir(output, { recursive: true })
await cp(join(root, 'tools/commands'), output, { recursive: true, filter: file => !file.endsWith('prepare.mjs') && !file.endsWith('prepare-profile.mjs') })
const source = dirname(await realpath(join(root, 'deepseek-harness/apps/desktop/node_modules/pnpm/package.json')))
await cp(source, join(output, 'pnpm'), { recursive: true })
// The official PATH worker owns one directory entry and preserves all prior
// entries. Append our directory so an external dsh retains its precedence.
const worker = (await readFile(join(root, 'deepseek-harness/apps/desktop/scripts/command-path.ps1'), 'utf8'))
  .replaceAll('Software\\DeepSeekHarness\\Command', 'Software\\ZeroWallScience\\Command')
  .replaceAll('Global\\DeepSeekHarness.Command.', 'Global\\ZeroWallScience.Command.')
  .replace('(@($directory) + $kept)', '($kept + @($directory))')
await writeFile(join(output, 'command-path.ps1'), worker)

await cp(join(root, 'tools/release/resource-catalog.mjs'), join(output, 'resource-catalog.mjs'))
await cp(join(root, 'config/catalogs/trusted-keys.json'), join(output, 'trusted-keys.json'))
await import('./prepare-profile.mjs')
