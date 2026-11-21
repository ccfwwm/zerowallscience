/** Controlled external package manager for the real plugin-update browser composition. */
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'

const root = process.env.PLUGIN_UPDATE_FIXTURE_ROOT
if (!root) throw new Error('Missing isolated plugin update fixture')
const [command, spec] = process.argv.slice(2)
await appendFile(join(root, 'commands.jsonl'), JSON.stringify(process.argv.slice(2)) + '\n')
if (command === 'config') {
  console.log('https://registry.npmjs.org/')
} else if (command === 'view') {
  const name = spec.replace(/@[^@/]+$/u, '')
  console.log(JSON.stringify({ name, version: '2.0.0', versions: ['1.0.0', '2.0.0'],
    'dist-tags': { latest: '2.0.0' }, time: { '2.0.0': '2026-11-20T00:00:00Z' }, dsh: { bundle: { patch: './cordis.patch.yml' } } }))
} else if (command === 'add') {
  await appendFile(join(root, 'started.jsonl'), JSON.stringify({ spec }) + '\n')
  console.log('Waiting for the controlled download')
  while (!existsSync(join(root, 'release'))) await setTimeout(50)
  const name = spec.replace(/@[^@/]+$/u, '')
  const manifestPath = join(process.cwd(), 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.dependencies[name] = '2.0.0'
  await writeFile(manifestPath, JSON.stringify(manifest) + '\n')
  const packagePath = join(process.cwd(), 'node_modules', name, 'package.json')
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
  await writeFile(packagePath, JSON.stringify({ ...pkg, version: '2.0.0' }) + '\n')
  await appendFile(join(root, 'completed.jsonl'), JSON.stringify({ spec }) + '\n')
} else throw new Error('Unexpected fixture package manager command: ' + command)
