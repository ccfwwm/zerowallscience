import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { Context } from '@deepseek-ai/cordis'
import ZeroWallMcpService from '../src/host/index.js'
import { afterEach, describe, expect, it, vi } from 'vitest'

const roots: string[] = []
function registerConversationProjectBinding(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'mcp__rmcp__r_runtime',
    description: 'conversation project binding fixture',
    parameters: { action: { type: 'string', required: true }, arguments: { type: 'json', required: true } },
    output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'ok' }] },
    execute: async (args: any) => ({ project_id: `zw-${args.arguments.binding_key}`, managed: true, scope: 'conversation' }),
  }))
}
afterEach(() => {
  delete process.env.ZEROWALL_DISABLE_DEFAULT_MCP
  delete process.env.ZEROWALL_RESEARCH_DB
  delete process.env.DSH_HOME
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('rdatalinux workspace file transfer bridge', () => {
	it('lists local download_workspace alongside the remote file catalog', async () => {
		const root = mkdtempSync(join(tmpdir(), 'zerowall-r-files-catalog-'))
		roots.push(root)
		process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
		process.env.DSH_HOME = join(root, 'harness')
		process.env.ZEROWALL_DISABLE_DEFAULT_MCP = '1'
		const ctx = new Context()
		try {
			await ctx.plugin(SystemPrompt)
			await ctx.plugin(ToolRuntime)
			await ctx.plugin(ZeroWallMcpService)
			vi.spyOn(ctx.zerowallMcp, 'ensureConnected').mockResolvedValue(undefined)
			ctx.tools.register(defineTool({
				name: 'mcp__rmcp__r_files',
				description: 'remote files catalog fixture',
				parameters: { action: { type: 'string', required: true }, arguments: { type: 'json' } },
				output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'ok' }] },
				execute: async () => ({ domain: 'r_files', capabilities: [{ id: 'r.download.file' }, { id: 'r.read.file.chunk' }] }),
			}))
			const result = await ctx.tools.execute({
				signal: new AbortController().signal,
				callId: ToolCallId('workspace-file-catalog'),
				name: 'r_files',
				arguments: { action: 'catalog' },
			})
			expect(result.isError, JSON.stringify(result)).toBe(false)
			const value = result.isError ? {} : result.value as any
			expect(value.capabilities.map((item: any) => item.id)).toEqual(expect.arrayContaining([
				'r.download.file', 'r.read.file.chunk', 'host.r_files.download_workspace', 'host.r_download_workspace', 'host.r_files.upload_workspace',
			]))
			expect(value.host_capabilities.find((item: any) => item.id === 'host.r_files.download_workspace')?.input_schema.properties.local_path.description).toMatch(/省略时/u)
		} finally {
			await ctx.fiber.dispose()
		}
	})

	it('downloads a Biomni job artifact directly into the local workspace without exposing base64', async () => {
		const root = mkdtempSync(join(tmpdir(), 'zerowall-biomni-download-'))
		roots.push(root)
		process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
		process.env.DSH_HOME = join(root, 'harness')
		process.env.ZEROWALL_DISABLE_DEFAULT_MCP = '1'
		const bytes = Buffer.from('biomni-figure-bytes')
		const sha256 = createHash('sha256').update(bytes).digest('hex')
		const forwarded: any[] = []
		const ctx = new Context()
		try {
			await ctx.plugin(SystemPrompt)
			await ctx.plugin(ToolRuntime)
			await ctx.plugin(ZeroWallMcpService)
			vi.spyOn(ctx.zerowallMcp, 'ensureConnected').mockResolvedValue(undefined)
			ctx.tools.register(defineTool({
				name: 'mcp__rmcp__biomni_artifacts',
				description: 'Biomni artifact fixture',
				parameters: { action: { type: 'string', required: true }, arguments: { type: 'json', required: true } },
				output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'ok' }] },
				execute: async (args: any) => {
					forwarded.push(args)
					if (args.action === 'biomni.get.job.manifest') return { job_id: 'bio-1', outputs: [{ path: 'figures/plot.png', bytes: bytes.length, sha256, mime_type: 'image/png' }] }
					if (args.action === 'biomni.read.file.chunk') return { path: args.arguments.path, offset: args.arguments.offset, bytes: bytes.length, total_bytes: bytes.length, eof: true, data_base64: bytes.toString('base64') }
					throw new Error(`Unexpected Biomni action: ${args.action}`)
				},
			}))
			const result = await ctx.tools.execute({
				signal: new AbortController().signal,
				callId: ToolCallId('biomni-workspace-download'),
				name: 'r_download_workspace',
				arguments: { source: 'biomni', job_id: 'bio-1', remote_path: 'figures/plot.png' },
				agent: { session: { header: { cwd: root } } } as any,
			})
			expect(result.isError, JSON.stringify(result)).toBe(false)
			expect(readFileSync(join(root, 'downloads', 'plot.png'))).toEqual(bytes)
			expect(forwarded.map(item => item.action)).toEqual(['biomni.get.job.manifest', 'biomni.read.file.chunk'])
			expect(JSON.stringify(result.isError ? {} : result.value)).not.toContain('data_base64')
			expect(result.isError ? undefined : result.value).toMatchObject({ source: 'biomni', jobId: 'bio-1', localPath: 'downloads/plot.png', bytes: bytes.length, sha256 })
		} finally {
			await ctx.fiber.dispose()
		}
	})

	it('forwards a workspace upload once through the native tool', async () => {
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
      await ctx.plugin(ZeroWallMcpService)
      // Transport behavior is exercised by lifecycle.spec; this fixture supplies the remote tools.
      let connectionChecks = 0
      vi.spyOn(ctx.zerowallMcp, 'ensureConnected').mockImplementation(async () => {
        // Fail a recursive dispatch deterministically instead of exhausting
        // the test worker's heap while waiting for its timeout.
        if (++connectionChecks > 8) throw new Error('Recursive r_files dispatch')
      })
      const resolveProjectId = vi.spyOn(ctx.researchWorkflow.get(), 'resolveProjectId').mockResolvedValue('auto-project')
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
		await ctx.plugin(SkillRegistry)
		await ctx.systemPrompt.assemble({ scope: owner })
      const result = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: ToolCallId('workspace-upload'),
			name: 'r_files',
			arguments: { action: 'upload_workspace', local_path: 'counts_raw', remote_path: 'data/raw/counts_raw', confirm: true },
        agent: owner,
      })
      expect(result.isError, JSON.stringify(result)).toBe(false)
      expect(resolveProjectId).toHaveBeenCalledWith(expect.objectContaining({ agent: owner }), undefined)
      expect(connectionChecks).toBe(1)
      expect(forwarded).toHaveLength(1)
      expect(forwarded[0]).toMatchObject({ action: 'r.upload.file', arguments: { project_id: 'auto-project', path: 'data/raw/counts_raw', confirm: true } })
      expect(Buffer.from(forwarded[0].arguments.data_base64, 'base64')).toEqual(bytes)
		expect(result.isError ? undefined : result.value).toMatchObject({ bytes: bytes.length, sha256: createHash('sha256').update(readFileSync(source)).digest('hex') })
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
    const forwarded: any[] = []
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(ZeroWallMcpService)
      // Transport behavior is exercised by lifecycle.spec; this fixture supplies the remote tools.
      vi.spyOn(ctx.zerowallMcp, 'ensureConnected').mockResolvedValue(undefined)
      registerConversationProjectBinding(ctx)
      ctx.tools.register(defineTool({
        name: 'mcp__rmcp__r_files',
        description: 'test remote download',
        parameters: { action: { type: 'string', required: true }, arguments: { type: 'json', required: true } },
        output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'ok' }] },
        execute: async (args: any) => {
          forwarded.push(args)
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
        name: 'r_download_workspace',
        arguments: { source: 'project', project_id: 'study-1', remote_path: 'module-source/FigureYa123/example.png' },
        agent: { session: { id: 'download-conversation', header: { cwd: root } } } as any,
      })
      expect(result.isError, JSON.stringify(result)).toBe(false)
      expect(readFileSync(join(root, 'downloads', 'example.png'))).toEqual(bytes)
      expect(forwarded[1]).toMatchObject({ action: 'r.read.file.chunk', arguments: { internal_host_download: true, offset: 0 } })
      expect(JSON.stringify(result.isError ? {} : result.value)).not.toContain('data_base64')
      expect(result.isError ? undefined : result.value).toMatchObject({ localPath: 'downloads/example.png', requestedRemotePath: 'module-source/FigureYa123/example.png', remotePath: 'figureya/run-1/module-source/FigureYa123/example.png', bytes: bytes.length, sha256 })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('downloads a complete R job manifest with 1 MiB chunks and resumes a 5.95 MB artifact', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-r-manifest-download-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.DSH_HOME = join(root, 'harness')
    process.env.ZEROWALL_DISABLE_DEFAULT_MCP = '1'
    const bytes = Buffer.alloc(5_953_087)
    const pattern = Buffer.from(Array.from({ length: 251 }, (_, index) => index))
    for (let offset = 0; offset < bytes.length; offset += pattern.length) pattern.copy(bytes, offset, 0, Math.min(pattern.length, bytes.length - offset))
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const manifest = [{ path: 'reports/large-report.xlsx', bytes: bytes.length, sha256, mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }]
    const offsets: number[] = []
    let failOnce = true
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(ZeroWallMcpService)
      vi.spyOn(ctx.zerowallMcp, 'ensureConnected').mockResolvedValue(undefined)
      ctx.tools.register(defineTool({
        name: 'mcp__rmcp__r_runtime', description: 'manifest download runtime fixture',
        parameters: { action: { type: 'string', required: true }, arguments: { type: 'json' } },
        output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'ok' }] },
        execute: async (args: any) => args.action === 'r.ensure.project'
          ? { project_id: 'manifest-project' }
          : { capability: { id: 'r.get.job.manifest', public_tool: 'r_files', input_schema: { type: 'object' } } },
      }))
      ctx.tools.register(defineTool({
        name: 'mcp__rmcp__r_files', description: 'manifest download files fixture',
        parameters: { action: { type: 'string', required: true }, arguments: { type: 'json' } },
        output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'ok' }] },
        execute: async (args: any) => {
          const action = args.action as string
          const input = args.arguments ?? {}
          if (action === 'r.get.job.manifest') return { files: manifest }
          if (action === 'r.resolve.file') {
            const item = manifest.find(entry => entry.path === String(input.path).split('/').slice(-2).join('/')) ?? manifest[0]!
            return { path: input.path, bytes: item.bytes, sha256: item.sha256, mime_type: item.mime_type }
          }
          if (action === 'r.read.file.chunk') {
            const offset = Number(input.offset)
            const length = Number(input.length)
            offsets.push(offset)
            if (failOnce && offset >= 2 * 1024 * 1024) { failOnce = false; throw new Error('simulated connection drop') }
            const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + length))
            return { path: input.path, offset, bytes: chunk.length, total_bytes: bytes.length, next_offset: offset + chunk.length, eof: offset + chunk.length === bytes.length, data_base64: chunk.toString('base64') }
          }
          throw new Error(`Unexpected action: ${action}`)
        },
      }))
      const owner = { session: { id: 'manifest-conversation', header: { cwd: root } } } as any
      const download = () => ctx.tools.execute({
        signal: new AbortController().signal,
        callId: ToolCallId(`manifest-download-${offsets.length}`),
        name: 'r_download_workspace',
        arguments: { source: 'project', job_id: 'job-large', download_all: true },
        agent: owner,
      })
      const first = await download()
      expect(first.isError).toBe(false)
      expect(first.isError ? undefined : first.value).toMatchObject({ status: 'partial', manifestFiles: 1, failedFiles: 1 })
      const localPath = join(root, 'downloads', 'faerskit', 'job-large', 'reports', 'large-report.xlsx')
      expect(statSync(`${localPath}.download-partial`).size).toBe(2 * 1024 * 1024)
      const second = await download()
      expect(second.isError).toBe(false)
      expect(second.isError ? undefined : second.value).toMatchObject({ status: 'complete', manifestFiles: 1, verifiedFiles: 1, failedFiles: 0 })
      expect(readFileSync(localPath)).toEqual(bytes)
      expect(createHash('sha256').update(readFileSync(localPath)).digest('hex')).toBe(sha256)
      expect(offsets).toContain(2 * 1024 * 1024)
      expect(offsets).toContain(5 * 1024 * 1024)
      expect(JSON.stringify(second.isError ? {} : second.value)).not.toContain('data_base64')
    } finally {
      await ctx.fiber.dispose()
    }
  }, 30_000)

  it('accepts a Manifest file larger than 20 GiB and preserves the failed transfer checkpoint', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-r-manifest-unbounded-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.DSH_HOME = join(root, 'harness')
    process.env.ZEROWALL_DISABLE_DEFAULT_MCP = '1'
    const bytes = 22 * 1024 ** 3
    const sha256 = 'a'.repeat(64)
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(ZeroWallMcpService)
      vi.spyOn(ctx.zerowallMcp, 'ensureConnected').mockResolvedValue(undefined)
      ctx.tools.register(defineTool({
        name: 'mcp__rmcp__r_runtime', description: 'oversize manifest runtime fixture',
        parameters: { action: { type: 'string', required: true }, arguments: { type: 'json' } },
        output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'ok' }] },
        execute: async (args: any) => args.action === 'r.ensure.project'
          ? { project_id: 'large-project' }
          : { capability: { id: 'r.get.job.manifest', public_tool: 'r_files', input_schema: { type: 'object' } } },
      }))
      ctx.tools.register(defineTool({
        name: 'mcp__rmcp__r_files', description: 'oversize manifest file fixture',
        parameters: { action: { type: 'string', required: true }, arguments: { type: 'json' } },
        output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'ok' }] },
        execute: async (args: any) => {
          if (args.action === 'r.get.job.manifest') return { files: [{ path: 'huge/result.rds', bytes, sha256 }] }
          if (args.action === 'r.resolve.file') return { path: args.arguments.path, bytes, sha256 }
          if (args.action === 'r.read.file.chunk') throw new Error('simulated network interruption')
          throw new Error(`Unexpected action: ${args.action}`)
        },
      }))
      const result = await ctx.tools.execute({
        signal: new AbortController().signal, callId: ToolCallId('oversize-manifest-download'), name: 'r_download_workspace',
        arguments: { source: 'project', job_id: 'job-oversize', download_all: true },
        agent: { session: { id: 'oversize-conversation', header: { cwd: root } } } as any,
      })
      expect(result.isError).toBe(false)
      expect(result.isError ? undefined : result.value).toMatchObject({ status: 'partial', manifestFiles: 1, failedFiles: 1, totalBytes: String(bytes) })
      expect(JSON.stringify(result.isError ? {} : result.value)).toContain('simulated network interruption')
      expect(existsSync(join(root, 'downloads', 'faerskit', 'job-oversize', 'huge', 'result.rds.download-partial'))).toBe(true)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('rejects a legacy 4 MiB server chunk with a length error instead of overflowing the regexp stack', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-r-download-legacy-chunk-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.DSH_HOME = join(root, 'harness')
    process.env.ZEROWALL_DISABLE_DEFAULT_MCP = '1'
    const bytes = Buffer.alloc(4 * 1024 * 1024, 97)
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(ZeroWallMcpService)
      vi.spyOn(ctx.zerowallMcp, 'ensureConnected').mockResolvedValue(undefined)
      registerConversationProjectBinding(ctx)
      ctx.tools.register(defineTool({
        name: 'mcp__rmcp__r_files', description: 'legacy oversized server chunk',
        parameters: { action: { type: 'string', required: true }, arguments: { type: 'json', required: true } },
        output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'ok' }] },
        execute: async (args: any) => args.action === 'r.resolve.file'
          ? { path: 'report.xlsx', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
          : { offset: 0, bytes: bytes.length, total_bytes: bytes.length, next_offset: bytes.length, eof: true, data_base64: bytes.toString('base64') },
      }))
      const result = await ctx.tools.execute({
        signal: new AbortController().signal, callId: ToolCallId('legacy-chunk'), name: 'r_files',
        arguments: { action: 'download_workspace', remote_path: 'report.xlsx' },
        agent: { session: { id: 'legacy-chunk-conversation', header: { cwd: root } } } as any,
      })
      expect(result.isError).toBe(true)
      const message = JSON.stringify(result)
      expect(message).toContain('invalid length or encoding')
      expect(message).not.toContain('Maximum call stack')
      expect(existsSync(join(root, 'downloads', 'report.xlsx'))).toBe(false)
    } finally { await ctx.fiber.dispose() }
  })

  it('keeps an invalid checksum checkpoint out of the published file path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-r-download-integrity-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.DSH_HOME = join(root, 'harness')
    process.env.ZEROWALL_DISABLE_DEFAULT_MCP = '1'
    const expected = Buffer.from('verified contents')
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(ZeroWallMcpService)
      vi.spyOn(ctx.zerowallMcp, 'ensureConnected').mockResolvedValue(undefined)
      registerConversationProjectBinding(ctx)
      ctx.tools.register(defineTool({
        name: 'mcp__rmcp__r_files',
        description: 'checksum failure fixture',
        parameters: { action: { type: 'string', required: true }, arguments: { type: 'json', required: true } },
        output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'ok' }] },
        execute: async (args: any) => args.action === 'r.resolve.file'
          ? { path: 'results/report.pdf', bytes: expected.length, sha256: createHash('sha256').update('different contents').digest('hex') }
          : { path: args.arguments.path, offset: args.arguments.offset, bytes: expected.length, total_bytes: expected.length, next_offset: expected.length, eof: true, data_base64: expected.toString('base64') },
      }))
      const result = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: ToolCallId('workspace-download-integrity'),
        name: 'r_files',
        arguments: { action: 'download_workspace', project_id: 'study-1', remote_path: 'results/report.pdf' },
        agent: { session: { id: 'integrity-conversation', header: { cwd: root } } } as any,
      })
      expect(result.isError).toBe(true)
      expect(existsSync(join(root, 'downloads', 'report.pdf'))).toBe(false)
      expect(statSync(join(root, 'downloads', 'report.pdf.download-partial')).size).toBe(expected.length)
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
      expect(result.isError ? undefined : result.value).toMatchObject({ moduleId: 'FigureYa128Prognostic', bytes: bytes.length, sha256 })
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
      expect(result.content[0]?.type === 'text' ? result.content[0].text : '').toMatch(/(?:escapes|outside) the current workspace|inside the current workspace/u)
      expect(existsSync(join(root, '..', 'outside', 'blocked.bin'))).toBe(false)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
