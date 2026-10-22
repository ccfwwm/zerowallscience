import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

// Match the sidebar compiler/prepare-runtime contract. A declaration alone
// cannot exempt a missing dependency: the restored bytes must own the engine
// and icons, and none of their executable files may still import either one.
export async function verifiedInlinedDependencies(source, manifest) {
  if (manifest.name !== 'dsh-better-sidebar') return new Set()
  const names = new Set(['mermaid', 'react-icons'])
  let client, mermaid
  try {
    client = await readFile(join(source, 'lib/client.js'), 'utf8')
    mermaid = await readFile(join(source, 'lib/client-mermaid.js'), 'utf8')
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) return new Set()
    throw error
  }
  if (!client.includes('GenIcon') || !mermaid.includes('flowchart') || !mermaid.includes('__dshChunks__')) return new Set()
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) { if (!await inspect(path)) return false }
      else if (entry.isFile() && /\.[cm]?js$/u.test(entry.name)) {
        const code = await readFile(path, 'utf8')
        for (const match of code.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)['"]([^'"]+)['"]/gu)) {
          if ([...names].some(name => match[1] === name || match[1].startsWith(name + '/'))) return false
        }
      }
    }
    return true
  }
  return await inspect(source) ? names : new Set()
}
