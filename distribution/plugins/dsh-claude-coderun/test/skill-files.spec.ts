import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { claudeHostText, writeClaudeSkills } from '../src/host/skill-files.js'
import { resourceStatus } from '../src/host/resource-status.js'

vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...fs,
    cp: async (...args: Parameters<typeof fs.cp>) => {
      if (/\.asar[\\/]/iu.test(String(args[0]))) throw new Error('Electron cannot use recursive cp inside ASAR')
      return fs.cp(...args)
    },
  }
})

it('projects relative scripts and canonical MCP references into the session plugin', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-skills-'))
  try {
    const source = join(root, 'source'); await mkdir(join(source, 'scripts'), { recursive: true })
    await writeFile(join(source, 'scripts', 'run.py'), 'print(42)')
    const projection = { skills: [{ name: 'science', description: 'Science', content: 'Call mcp__zerowallrmcp__r_runtime. Read scripts/run.py.', invocation: { modelInvocable: true }, resourceBase: { kind: 'directory' as const, path: source } }], skipped: [] }
    await writeClaudeSkills(join(root, 'projection'), projection)
    expect(await readFile(join(root, 'projection/skills/science/scripts/run.py'), 'utf8')).toBe('print(42)')
    expect(await readFile(join(root, 'projection/skills/science/SKILL.md'), 'utf8')).toContain('mcp__zerowall__mcp__zerowallrmcp__r_runtime')
    expect(claudeHostText('mcp__zerowall__mcp__zerowallrmcp__r_runtime')).toBe('mcp__zerowall__mcp__zerowallrmcp__r_runtime')
    await writeClaudeSkills(join(root, 'projection'), { skills: [], skipped: [] })
    await expect(readFile(join(root, 'projection/skills/science/SKILL.md'))).rejects.toThrow()
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('materializes standalone files and nested ASAR resources for the native CLI', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-asar-skills-'))
  try {
    const source = join(root, 'app.asar', 'source')
    await mkdir(join(source, 'scripts', 'lib'), { recursive: true })
    await writeFile(join(source, 'SKILL.md'), 'Packaged instructions')
    await writeFile(join(source, 'guide.md'), 'Resource guide')
    await writeFile(join(source, 'scripts', 'lib', 'run.py'), 'print(42)')
    const projection = join(root, 'projection')
    await writeClaudeSkills(projection, {
      skills: [{ name: 'science', description: 'Science', content: 'Projected instructions', invocation: { modelInvocable: true }, resourceBase: { kind: 'directory', path: source } }],
      skipped: [],
    })
    await rm(source, { recursive: true })
    const skill = join(projection, 'skills', 'science')
    expect(await readFile(join(skill, 'guide.md'), 'utf8')).toBe('Resource guide')
    expect(await readFile(join(skill, 'scripts', 'lib', 'run.py'), 'utf8')).toBe('print(42)')
    expect(await readFile(join(skill, 'SKILL.md'), 'utf8')).toContain('Projected instructions')
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('distinguishes enabled on-demand MCP from disabled services before tools connect', () => {
  const record = { name: 'Science', serverName: 'zerowallrmcp', enabled: true, transport: 'streamable-http', command: '', args: [], envRefs: {}, headerRefs: {} }
  expect(resourceStatus({ skills: [], skipped: [] }, [record], [{ name: 'capability_search', description: '', parameters: { type: 'object' } }])[0]?.state).toBe('on-demand')
  expect(resourceStatus({ skills: [], skipped: [] }, [{ ...record, enabled: false }], [])[0]?.state).toBe('disabled')
})
