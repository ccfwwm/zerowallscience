import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as capabilityRegistry from '../../../packages/dsh-capability-menu/src/registry.ts'
import * as capabilityPolicy from '../../../packages/dsh-capability-menu/src/policy.ts'
import { Context } from '@deepseek-ai/cordis'
import ZeroWallProjectsService from '../../projects/src/host/index.js'
import ZeroWallMcpService from '../src/host/index.js'
import { afterEach, describe, expect, it, vi } from 'vitest'

const roots: string[] = []
afterEach(() => {
  delete process.env.ZEROWALL_DISABLE_DEFAULT_MCP
  delete process.env.ZEROWALL_RESEARCH_DB
  delete process.env.DSH_HOME
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('rdatalinux workspace upload bridge', () => {
  it.each([false, true])('forwards a workspace upload once with capability policy %s', async (withPolicy) => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-r-upload-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'research.sqlite')
    process.env.DSH_HOME = join(root, 'dsh')
    process.env.ZEROWALL_DISABLE_DEFAULT_MCP = '1'
    const source = join(root, 'counts_raw')
    const bytes = Buffer.from('gene\tcell1\nSTAT1\t4\n')
    writeFileSync(source, bytes)
    const forwarded: any[] = []
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(ZeroWallProjectsService)
      await ctx.plugin(ZeroWallMcpService)
      vi.spyOn(ctx.zerowallMcp, 'executeCompactCapability').mockResolvedValue({ target: 'mcp__rmcp__r_project', content: [], value: { ok: true } })
      // Transport behavior is exercised by lifecycle.spec; this fixture supplies the remote tools.
      let connectionChecks = 0
      vi.spyOn(ctx.zerowallMcp, 'ensureConnected').mockImplementation(async () => {
        // Fail a recursive dispatch deterministically instead of exhausting
        // the test worker's heap while waiting for its timeout.
        if (++connectionChecks > 8) throw new Error('Recursive r_files dispatch')
      })
      ctx.tools.register(defineTool({
        name: 'mcp__rmcp__r_files',
        description: 'test remote upload',
        parameters: { action: { type: 'string', required: true }, arguments: { type: 'json', required: true } },
        output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'ok' }] },
        execute: async (args: any) => { forwarded.push(args); return { ok: true } },
      }))
      const events: any[] = []
      const owner = { ctx, id: 'upload-fixture', session: {
        header: { cwd: root }, snapshotEvents: () => events,
        append: (type: string, data: unknown) => events.push({ type, data }),
      } } as any
      if (withPolicy) {
        await ctx.plugin(SkillRegistry)
        await ctx.plugin(capabilityRegistry, { catalogFile: '' })
        await ctx.plugin(capabilityPolicy, { zeroWallDefaults: true })
        ctx.capabilityPolicy.selectTools(owner, ['r_files'])
        await ctx.systemPrompt.assemble({ scope: owner })
      }
      const result = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: ToolCallId('workspace-upload'),
        name: 'r_files',
        arguments: { action: 'upload_workspace', project_id: 'study-1', local_path: 'counts_raw', remote_path: 'data/raw/counts_raw', confirm: true },
        agent: owner,
      })
      expect(result.isError, JSON.stringify(result)).toBe(false)
      expect(connectionChecks).toBe(1)
      expect(forwarded).toHaveLength(1)
      expect(forwarded[0]).toMatchObject({ action: 'r.upload.file', arguments: { project_id: 'study-1', path: 'data/raw/counts_raw', confirm: true } })
      expect(Buffer.from(forwarded[0].arguments.data_base64, 'base64')).toEqual(bytes)
      expect((result.isError ? undefined : result.value)).toMatchObject({ bytes: bytes.length, sha256: createHash('sha256').update(readFileSync(source)).digest('hex') })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('downloads a remote file into the workspace without returning base64', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-r-download-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.DSH_HOME = join(root, 'harness')
    process.env.ZEROWALL_DISABLE_DEFAULT_MCP = '1'
    const bytes = Buffer.from('remote-figure-bytes')
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(ZeroWallProjectsService)
      await ctx.plugin(ZeroWallMcpService)
      // Transport behavior is exercised by lifecycle.spec; this fixture supplies the remote tools.
      vi.spyOn(ctx.zerowallMcp, 'ensureConnected').mockResolvedValue(undefined)
      ctx.tools.register(defineTool({
        name: 'mcp__rmcp__r_files',
        description: 'test remote download',
        parameters: { action: { type: 'string', required: true }, arguments: { type: 'json', required: true } },
        output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'ok' }] },
        execute: async (args: any) => {
          const structuredContent = args.action === 'r.resolve.file'
            ? { path: 'figureya/run-1/module-source/FigureYa123/example.png', manifest: { path: 'figureya/run-1/module-source/FigureYa123/example.png', bytes: bytes.length, sha256, mime_type: 'image/png' } }
            : args.action === 'r.get.file.manifest'
            ? { path: args.arguments.path, bytes: bytes.length, sha256, mime_type: 'image/png' }
            : { path: args.arguments.path, offset: args.arguments.offset, bytes: bytes.length, eof: true, data_base64: bytes.toString('base64') }
          return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent }
        },
      }))
      const result = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: ToolCallId('workspace-download'),
        name: 'r_files',
        arguments: { action: 'download_workspace', project_id: 'study-1', remote_path: 'module-source/FigureYa123/example.png', local_path: 'outputs/plot.png' },
        agent: { session: { header: { cwd: root } } } as any,
      })
      expect(result.isError).toBe(false)
      expect(readFileSync(join(root, 'outputs', 'plot.png'))).toEqual(bytes)
      expect(JSON.stringify(result.isError ? {} : result.value)).not.toContain('data_base64')
      expect((result.isError ? undefined : result.value)).toMatchObject({ localPath: 'outputs/plot.png', requestedRemotePath: 'module-source/FigureYa123/example.png', remotePath: 'figureya/run-1/module-source/FigureYa123/example.png', bytes: bytes.length, sha256 })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('downloads a server-installed FigureYa file without a project id', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-figureya-source-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.DSH_HOME = join(root, 'harness')
    process.env.ZEROWALL_DISABLE_DEFAULT_MCP = '1'
    const bytes = Buffer.from('---\ntitle: Prognostic\n---\n')
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const forwarded: any[] = []
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(ZeroWallProjectsService)
      await ctx.plugin(ZeroWallMcpService)
      // Transport behavior is exercised by lifecycle.spec; this fixture supplies the remote tools.
      vi.spyOn(ctx.zerowallMcp, 'ensureConnected').mockResolvedValue(undefined)
      ctx.tools.register(defineTool({
        name: 'mcp__rmcp__r_files',
        description: 'project files fixture',
        parameters: { action: { type: 'string', required: true }, arguments: { type: 'json' } },
        output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'ok' }] },
        execute: async () => ({ ok: true }),
      }))
      ctx.tools.register(defineTool({
        name: 'mcp__rmcp__r_figureya_catalog',
        description: 'FigureYa source fixture',
        parameters: { action: { type: 'string', required: true }, arguments: { type: 'json' } },
        output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'ok' }] },
        execute: async (args: any) => {
          forwarded.push(args)
          const structuredContent = args.action === 'figureya.source.file.manifest'
            ? { module_id: 'FigureYa128Prognostic', path: 'FigureYa128Prognostic/FigureYa128Prognostic.Rmd', bytes: bytes.length, sha256, mime_type: 'application/octet-stream' }
            : { offset: args.arguments.offset, bytes: bytes.length, eof: true, data_base64: bytes.toString('base64') }
          return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent }
        },
      }))
      const result = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: ToolCallId('figureya-source-download'),
        name: 'r_files',
        arguments: {
          action: 'download_workspace',
          remote_path: '/opt/rdatalinux-figureya/current/FigureYa128Prognostic/FigureYa128Prognostic.Rmd',
          local_path: 'figureya/FigureYa128Prognostic.Rmd',
        },
        agent: { session: { header: { cwd: root } } } as any,
      })
      expect(result.isError).toBe(false)
      expect(readFileSync(join(root, 'figureya', 'FigureYa128Prognostic.Rmd'))).toEqual(bytes)
      expect(forwarded.map(item => item.action)).toEqual(['figureya.source.file.manifest', 'figureya.read.source.file.chunk'])
      expect(JSON.stringify(result.isError ? {} : result.value)).not.toContain('data_base64')
      expect((result.isError ? undefined : result.value)).toMatchObject({ moduleId: 'FigureYa128Prognostic', bytes: bytes.length, sha256 })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('downloads every server-installed FigureYa module file through the compact catalog contract', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-figureya-module-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.DSH_HOME = join(root, 'harness')
    process.env.ZEROWALL_DISABLE_DEFAULT_MCP = '1'
    const moduleId = 'FigureYa999Complete'
    const contents = new Map<string, Buffer>([
      [`${moduleId}/plot.png`, Buffer.from([0x89, 0x50, 0x4e, 0x47])],
      [`${moduleId}/report.html`, Buffer.from('<h1>FigureYa report</h1>')],
      [`${moduleId}/README.md`, Buffer.from('# FigureYa introduction\n')],
      [`${moduleId}/${moduleId}.R`, Buffer.from('plot(1:3)\n')],
      [`${moduleId}/${moduleId}.Rmd`, Buffer.from('---\ntitle: FigureYa\n---\n')],
      [`${moduleId}/data/example.csv`, Buffer.from('gene,value\nTP53,1\n')],
      [`${moduleId}/data/schema.json`, Buffer.from('{"type":"object"}\n')],
    ])
    const manifests = [...contents.entries()].map(([path, bytes]) => ({
      path,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      mime_type: path.endsWith('.png') ? 'image/png' : path.endsWith('.html') ? 'text/html' : path.endsWith('.json') ? 'application/json' : 'text/plain',
    }))
    const forwarded: any[] = []
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(ZeroWallProjectsService)
      await ctx.plugin(ZeroWallMcpService)
      // Transport behavior is exercised by lifecycle.spec; this fixture supplies the remote tools.
      vi.spyOn(ctx.zerowallMcp, 'ensureConnected').mockResolvedValue(undefined)
      ctx.tools.register(defineTool({
        name: 'mcp__rmcp__r_figureya_catalog',
        description: 'FigureYa compact catalog fixture',
        parameters: { action: { type: 'string', required: true }, arguments: { type: 'json' } },
        output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'ok' }] },
        execute: async (args: any) => {
          forwarded.push(args)
          const path = args.arguments?.path as string | undefined
          const bytes = path === undefined ? undefined : contents.get(path)
          const manifest = path === undefined ? undefined : manifests.find(item => item.path === path)
          const structuredContent = args.action === 'figureya.list.files'
            ? { module_id: moduleId, files: manifests }
            : args.action === 'figureya.source.file.manifest'
            ? manifest
            : bytes === undefined
            ? undefined
            : { path, offset: args.arguments.offset, bytes: bytes.length, total_bytes: bytes.length, eof: true, data_base64: bytes.toString('base64') }
          if (structuredContent === undefined) throw new Error(`Unexpected FigureYa fixture action: ${args.action}`)
          // Exercise the wrapper form emitted by some compact MCP transports.
          return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], value: { content: [{ type: 'text', text: JSON.stringify(structuredContent) }] } }
        },
      }))
      const result = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: ToolCallId('figureya-module-download'),
        name: 'r_files',
        arguments: { action: 'download_figureya_module', module_id: moduleId, local_path: `figureya/${moduleId}` },
        agent: { session: { header: { cwd: root } } } as any,
      })
      expect(result.isError).toBe(false)
      for (const [path, bytes] of contents) expect(readFileSync(join(root, 'figureya', moduleId, path.slice(moduleId.length + 1)))).toEqual(bytes)
      const value = result.isError ? undefined : result.value as any
      expect(value).toMatchObject({ moduleId, localRoot: `figureya/${moduleId}`, totalBytes: [...contents.values()].reduce((total, bytes) => total + bytes.length, 0) })
      expect(value.files).toHaveLength(contents.size)
      expect(value.files).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: `${moduleId}/plot.png`, localPath: `figureya/${moduleId}/plot.png`, mimeType: 'image/png' }),
        expect.objectContaining({ path: `${moduleId}/report.html`, mimeType: 'text/html' }),
        expect.objectContaining({ path: `${moduleId}/README.md` }),
        expect.objectContaining({ path: `${moduleId}/${moduleId}.R` }),
        expect.objectContaining({ path: `${moduleId}/${moduleId}.Rmd` }),
        expect.objectContaining({ path: `${moduleId}/data/example.csv` }),
        expect.objectContaining({ path: `${moduleId}/data/schema.json`, mimeType: 'application/json' }),
      ]))
      expect(JSON.stringify(value)).not.toContain('data_base64')
      expect(existsSync(join(root, 'figureya', moduleId, 'plot.png.part'))).toBe(false)
      expect(forwarded.map(item => item.action)).toContain('figureya.list.files')
      expect(forwarded.every(item => item.action === 'figureya.list.files' || item.action === 'figureya.source.file.manifest' || item.action === 'figureya.read.source.file.chunk')).toBe(true)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('rejects a download path outside the workspace before creating directories', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-r-download-boundary-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.DSH_HOME = join(root, 'harness')
    process.env.ZEROWALL_DISABLE_DEFAULT_MCP = '1'
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(ZeroWallProjectsService)
      await ctx.plugin(ZeroWallMcpService)
      // Transport behavior is exercised by lifecycle.spec; this fixture supplies the remote tools.
      vi.spyOn(ctx.zerowallMcp, 'ensureConnected').mockResolvedValue(undefined)
      ctx.tools.register(defineTool({
        name: 'mcp__rmcp__r_files',
        description: 'test remote boundary',
        parameters: { action: { type: 'string', required: true }, arguments: { type: 'json', required: true } },
        output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'ok' }] },
        execute: async () => ({ path: 'remote.bin', bytes: 1, sha256: createHash('sha256').update('x').digest('hex'), data_base64: Buffer.from('x').toString('base64') }),
      }))
      const result = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: ToolCallId('workspace-download-boundary'),
        name: 'r_files',
        arguments: { action: 'download_workspace', project_id: 'study-1', remote_path: 'remote.bin', local_path: '../outside/blocked.bin', confirm: true },
        agent: { session: { header: { cwd: root } } } as any,
      })
      expect(result.isError).toBe(true)
      expect(result.content[0]?.type === 'text' ? result.content[0].text : '').toMatch(/(?:escapes|outside) the current workspace/u)
      expect(existsSync(join(root, '..', 'outside', 'blocked.bin'))).toBe(false)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
