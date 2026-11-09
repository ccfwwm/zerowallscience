/** Bundled instructions for the image generation and editing tools. */
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import type { SkillProvider } from '@deepseek-ai/dsh-skill'
import { PACKAGE_ROOT } from '../root.js'

/**
 * Provide the packaged Skill and its resources without copying user Skills.
 * @returns The provider owned by this plugin's lifecycle.
 */
export function createImageSkillProvider(): SkillProvider {
  const root = resolve(PACKAGE_ROOT, 'skills/gpt-image-generator')
  const path = resolve(root, 'SKILL.md')
  const descriptor = {
    name: 'gpt-image-generator',
    description: 'Generate or edit images with the configured ZeroWall model, size and quality.',
    invocation: { modelInvocable: true, userInvocable: true },
    provider: 'zerowall-image-create', source: 'bundled' as const,
    metadata: { ownerPackage: '@zerowall/dsh-imagecreate' },
    resourceBase: { kind: 'directory' as const, path: root }, rank: 100,
    locator: pathToFileURL(path), path,
  }
  return {
    name: descriptor.provider,
    async list() { return [descriptor] },
    async get(candidate) {
      if (candidate.provider !== descriptor.provider || candidate.name !== descriptor.name) return undefined
      return { ...descriptor, content: (await readFile(path, 'utf8')).replace(/^---[\s\S]*?---\s*/, '') }
    },
  }
}
