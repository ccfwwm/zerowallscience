import { createHash } from 'node:crypto'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function treeHashes(directory, prefix = '') {
  const result = {}
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = prefix + entry.name
    if (entry.isDirectory()) Object.assign(result, await treeHashes(join(directory, entry.name), path + '/'))
    else if (entry.isFile()) result[path] = createHash('sha256').update(await readFile(join(directory, entry.name))).digest('hex')
  }
  return result
}
async function snapshot(root, stage) {
  const packages = ['@deepseek-ai/libreoffice-kit', '@deepseek-ai/libreoffice-kit-win32-x64', '@deepseek-ai/dsh-client-ui-sidebar-documentpreview', 'dsh-univer-office']
  const result = { skillsSource: await treeHashes(join(root, 'resources/extensions/skills')), skillsRuntime: await treeHashes(join(stage, 'resources/extensions/skills')), runtime: {} }
  for (const id of packages) {
    const directory = join(stage, 'runtime/node_modules', id)
    try {
      await stat(directory)
      result.runtime[id] = await treeHashes(directory)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      result.runtime[id] = null
    }
  }
  return result
}
export async function writeRuntimeIntegrity(root, stage) {
  await writeFile(join(stage, 'runtime/integrity-receipt.json'), JSON.stringify(await snapshot(root, stage), null, 2) + '\n')
}
export async function verifyRuntimeIntegrity(root, stage) {
  const expected = await readFile(join(stage, 'runtime/integrity-receipt.json'), 'utf8')
  if (expected !== JSON.stringify(await snapshot(root, stage), null, 2) + '\n') throw new Error('Stale runtime: Office resources, adapted chunks or Skills changed after staging')
}
