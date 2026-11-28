/** Session-local Claude skill files retain relative resource access and Host tool routing. */
import { copyFile, cp, mkdir, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SkillProjectionResult } from './projection.js'

/** @param text - Host-authored skill or prompt text. @returns Tool references using Claude's Host bridge namespace. */
export function claudeHostText(text: string): string {
  return text.replace(/\bmcp__(?!zerowall__)([A-Za-z0-9_-]+)__([A-Za-z0-9_-]+)/gu, 'mcp__zerowall__mcp__$1__$2')
}

// Electron handles ASAR paths in readdir and copyFile. Node's recursive cp
// also uses internal filesystem operations that cannot traverse the archive.
async function copyAsarDirectory(source: string, target: string): Promise<void> {
  await mkdir(target, { mode: 0o700 })
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name)
    const to = join(target, entry.name)
    if (entry.isDirectory()) await copyAsarDirectory(from, to)
    else await copyFile(from, to)
  }
}

/**
 * Replace only this session's projected skills. Resource directories use links on ordinary filesystems and copies inside ASAR.
 * @param root - Private projection root owned by the active Claude session.
 * @param projection - Enabled skill definitions from that session's Host registry.
 */
export async function writeClaudeSkills(root: string, projection: SkillProjectionResult): Promise<void> {
  const skillsRoot = join(root, 'skills')
  await mkdir(skillsRoot, { recursive: true, mode: 0o700 })
  const active = new Set(projection.skills.map(skill => skill.name))
  for (const entry of await readdir(skillsRoot)) if (!active.has(entry)) await rm(join(skillsRoot, entry), { recursive: true, force: true })
  for (const skill of projection.skills) {
    const directory = join(skillsRoot, skill.name)
    await rm(directory, { recursive: true, force: true })
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const resource = skill.resourceBase
    if (resource?.kind === 'directory') {
      const fromAsar = /\.asar(?:[\\/]|$)/iu.test(resource.path)
      for (const entry of await readdir(resource.path, { withFileTypes: true })) {
        if (['SKILL.md', '.git', 'node_modules', '__pycache__'].includes(entry.name)) continue
        const source = join(resource.path, entry.name), target = join(directory, entry.name)
        if (fromAsar) {
          if (entry.isDirectory()) await copyAsarDirectory(source, target)
          else await copyFile(source, target)
        } else if (entry.isDirectory()) await symlink(source, target, process.platform === 'win32' ? 'junction' : 'dir')
        else await cp(source, target, { recursive: true, dereference: true })
      }
    }
    const hint = resource?.kind === 'url' ? 'Resolve relative resource URLs against ' + resource.url
      : resource?.kind === 'opaque' ? resource.description : 'Relative resources are available in this skill directory.'
    await writeFile(join(directory, 'SKILL.md'), '---\nname: ' + skill.name + '\ndescription: ' + JSON.stringify(skill.description) + '\ndisable-model-invocation: ' + !skill.invocation.modelInvocable + '\nuser-invocable: ' + (skill.invocation.userInvocable !== false) + '\n---\n' + hint + '\n\n' + claudeHostText(skill.content), { mode: 0o600 })
  }
}
