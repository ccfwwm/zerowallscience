import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, relative, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.filter(entry => entry.name !== 'node_modules').map(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]))).flat().sort()
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
export async function buildReceipt() {
  const sources = [...(await Promise.all(['src', 'client', 'scripts'].map(directory => files(join(root, directory))))).flat(), ...['package.json', 'tsup.config.ts', 'tsconfig.json', 'tsconfig.client.json'].map(name => join(root, name))].sort()
  const input = createHash('sha256')
  for (const file of sources) input.update(relative(root, file).replaceAll('\\', '/')).update(await readFile(file))
  const outputs = {}
  for (const file of (await files(join(root, 'lib'))).filter(file => file.endsWith('.js'))) outputs[relative(join(root, 'lib'), file).replaceAll('\\', '/')] = digest(await readFile(file))
  return { schemaVersion: 1, sourceSha256: input.digest('hex'), outputs }
}
if (process.argv.includes('--write')) await writeFile(join(root, 'lib/build-receipt.json'), JSON.stringify(await buildReceipt(), null, 2) + '\n')
