import { cp, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const skillPrefix = 'resources/extensions/skills/'

export async function copyCanonicalSkillSnapshot(sourceRoot, destinationRoot, sourcePaths) {
  for (const sourcePath of sourcePaths) {
    const parts = sourcePath.split('/')
    if (!sourcePath.startsWith(skillPrefix) || sourcePath.includes('\\') || parts.some(part => !part || part === '.' || part === '..')) {
      throw new Error('Unsafe canonical Skill source path: ' + sourcePath)
    }
    const relativePath = sourcePath.slice(skillPrefix.length)
    const target = join(destinationRoot, 'skills', relativePath)
    await mkdir(dirname(target), { recursive: true })
    await cp(join(sourceRoot, sourcePath), target, { dereference: true })
  }
}

export function isObsoleteSkillSnapshot(sourcePaths, path) {
  if (!path.startsWith('skills/')) return false
  return !sourcePaths.has('resources/extensions/' + path)
}
