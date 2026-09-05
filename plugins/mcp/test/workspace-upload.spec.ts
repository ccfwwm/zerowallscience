import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { Context } from '@deepseek-ai/cordis'
import ZeroWallProjectsService from '../../projects/src/host/index.js'
import ZeroWallMcpService from '../src/host/index.js'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
afterEach(() => {
  delete process.env.ZEROWALL_DISABLE_DEFAULT_MCP
  delete process.env.ZEROWALL_RESEARCH_DB
  delete process.env.DSH_HOME
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('rdatalinux workspace upload bridge', () => {
  it('reads a session workspace file and forwards it to the remote R MCP tool', async () => {
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
      ctx.tools.register(defineTool({
        name: 'mcp__rmcp__rplatform__r_upload_file',
        description: 'test remote upload',
        parameters: { project_id: { type: 'string', required: true }, path: { type: 'string', required: true }, data_base64: { type: 'string', required: true }, confirm: { type: 'boolean', required: true } },
        output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'ok' }] },
        execute: async (args: any) => { forwarded.push(args); return { ok: true } },
      }))
      const result = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: ToolCallId('workspace-upload'),
        name: 'r_upload_workspace_file',
        arguments: { project_id: 'study-1', local_path: 'counts_raw', remote_path: 'data/raw/counts_raw', confirm: true },
        agent: { session: { header: { cwd: root } } } as any,
      })
      expect(result.isError).toBe(false)
      expect(forwarded).toHaveLength(1)
      expect(forwarded[0]).toMatchObject({ project_id: 'study-1', path: 'data/raw/counts_raw', confirm: true })
      expect(Buffer.from(forwarded[0].data_base64, 'base64')).toEqual(bytes)
      expect((result.isError ? undefined : result.value)).toMatchObject({ bytes: bytes.length, sha256: createHash('sha256').update(readFileSync(source)).digest('hex') })
    } finally {
      await ctx.fiber.dispose()
    }
  })
})

