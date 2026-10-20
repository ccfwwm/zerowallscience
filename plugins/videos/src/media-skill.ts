import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { SkillProvider } from '@deepseek-ai/dsh-skill'
import { MEDIA_SKILL_DESCRIPTION } from './media-contract.js'
export function mediaKnowledgeRoot() { return resolve(fileURLToPath(new URL('./media-create', import.meta.url))) }
export function createMediaSkillProvider(root = mediaKnowledgeRoot()): SkillProvider {
  const path = resolve(root, 'SKILL.md')
  return { name: 'zerowall-media-create', async list() { return [{ name: 'media-create', description: MEDIA_SKILL_DESCRIPTION, invocation: { modelInvocable: true, userInvocable: true }, provider: 'zerowall-media-create', source: 'bundled', resourceBase: { kind: 'directory', path: root }, rank: 100, locator: pathToFileURL(path), path }] }, async get(candidate) {
    if (candidate.name !== 'media-create' || candidate.provider !== 'zerowall-media-create') return undefined
    return { name: candidate.name, description: candidate.description, invocation: candidate.invocation, provider: candidate.provider, source: 'bundled', path, resourceBase: { kind: 'directory', path: root }, content: (await readFile(path, 'utf8')).replace(/^---[\s\S]*?---\s*/, '') }
  } }
}
