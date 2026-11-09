import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { extractArchive, parseInstruction, prepareImport, publishImport, safeArchivePath } from '../src/host/importer.js'

const roots: string[] = []
async function temporary() { const root = await mkdtemp(join(tmpdir(), 'zerowall-skills-test-')); roots.push(root); return root }
const instruction = (name: string) => `---\nname: ${name}\ndescription: Test workflow\n---\nUse scripts/task.py.\n`
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

describe('inert skill imports', () => {
  it('rejects malformed metadata and paths escaping an archive', () => {
    expect(() => parseInstruction('no metadata')).toThrow('frontmatter')
    expect(() => parseInstruction(instruction('Bad Name'))).toThrow('kebab-case')
    expect(() => parseInstruction(instruction('example').replace('description:', 'disable-model-invocation: no\ndescription:'))).toThrow('must be a boolean')
    for (const value of ['../outside', '/outside', 'C:/outside', 'folder/../../outside', 'folder\\..\\outside', 'safe:stream']) expect(() => safeArchivePath(value)).toThrow('escapes')
  })
  it('retains model and user invocation controls from canonical frontmatter', () => {
    expect(parseInstruction(instruction('defaults')).invocation).toEqual({ modelInvocable: true, userInvocable: true })
    expect(parseInstruction(instruction('manual').replace('description:', 'disable-model-invocation: true\ndescription:')).invocation).toEqual({ modelInvocable: false, userInvocable: true })
    expect(parseInstruction(instruction('model').replace('description:', 'user-invocable: false\ndescription:')).invocation).toEqual({ modelInvocable: true, userInvocable: false })
  })
  it('previews conflicts and preserves relative resources without executing scripts', async () => {
    const root = await temporary()
    const folder = join(root, 'source')
    await mkdir(join(folder, 'scripts'), { recursive: true })
    await writeFile(join(folder, 'SKILL.md'), instruction('example'))
    await writeFile(join(folder, 'scripts', 'task.py'), 'raise RuntimeError("MUST NOT EXECUTE")\n')
    const staged = await prepareImport(folder, join(root, 'stage'), new Set(['example']))
    expect(staged.preview.skills).toEqual([{ name: 'example', description: 'Test workflow', relativePath: 'SKILL.md', conflict: true }])
    const installed = await publishImport(staged, join(root, 'imports'))
    expect(await readFile(join(installed, 'scripts', 'task.py'), 'utf8')).toContain('MUST NOT EXECUTE')
  })
  it('rejects duplicate names and ZIP traversal before publishing', async () => {
    const root = await temporary()
    const archive = join(root, 'duplicates.zip')
    await writeFile(archive, zipSync({ 'a/SKILL.md': strToU8(instruction('same')), 'b/SKILL.md': strToU8(instruction('same')) }))
    await expect(prepareImport(archive, join(root, 'stage'), new Set())).rejects.toThrow('repeats skill')
    await expect(extractArchive(zipSync({ '../escaped': strToU8('bad') }), join(root, 'safe'))).rejects.toThrow('escapes')
  })
  it('imports Markdown but refuses symlink sources', async () => {
    const root = await temporary()
    const source = join(root, 'one.md')
    await writeFile(source, instruction('single'))
    const staged = await prepareImport(source, join(root, 'stage'), new Set())
    expect(staged.preview.skills[0]?.name).toBe('single')
    const link = join(root, 'link')
    await symlink(root, link, process.platform === 'win32' ? 'junction' : 'dir')
    await expect(prepareImport(link, join(root, 'stage'), new Set())).rejects.toThrow('symbolic link')
  })
})
