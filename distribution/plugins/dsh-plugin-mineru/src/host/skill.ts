/** Plugin-owned MinerU instructions, discoverable without the curated skill collection. */
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { SkillProvider } from '@deepseek-ai/dsh-skill'

/** Create a lifecycle-owned skill provider. @returns The bundled document parsing instructions. */
export function createMineruSkillProvider(): SkillProvider {
  const own = fileURLToPath(import.meta.url).replace(/\.asar([\\/])/u, '.asar.unpacked$1')
  const root = resolve(dirname(own), own.endsWith('.ts') ? '../..' : '..', 'skills/mineru-document-parser')
  const path = resolve(root, 'SKILL.md')
  const descriptor = {
    name: 'mineru-document-parser', description: 'Read PDF, Office, image and HTML documents with MinerU; retain structured artifacts, page anchors and recoverable tasks.',
    invocation: { modelInvocable: true, userInvocable: true }, provider: 'zerowall-mineru', source: 'bundled' as const,
    metadata: { ownerPackage: '@zerowall/dsh-plugin-mineru' }, resourceBase: { kind: 'directory' as const, path: root }, rank: 100,
    locator: pathToFileURL(path), path,
  }
  return {
    name: descriptor.provider,
    async list() { return [descriptor] },
    async get(candidate) {
      if (candidate.name !== descriptor.name || candidate.provider !== descriptor.provider) return undefined
      return { ...descriptor, content: (await readFile(path, 'utf8')).replace(/^---[\s\S]*?---\s*/u, '') }
    },
  }
}
