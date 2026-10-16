import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ResearchStore } from '@zerowallscience/research-store'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { executionCommandSpec, ZeroWallExecutionService } from '../src/host/index.js'
import type { CreateExecutionContextInput, ExecutionJsonObject } from '../src/shared/types.js'

const common = { id: 'ctx', projectId: 'project', name: 'Context', version: 1, createdAt: '', updatedAt: '' }

describe('Execution command specifications', () => {
  it('round-trips the local remote DTO with arbitrary nested JSON config', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-execution-dto-'))
    const path = join(root, 'research.sqlite')
    vi.stubEnv('ZEROWALL_RESEARCH_DB', path)
    const store = new ResearchStore(path)
    const ctx = new Context()
    try {
      const project = store.createProject({ name: 'Execution DTO', rootPath: root })
      await ctx.plugin(ZeroWallExecutionService)
      const config: ExecutionJsonObject = { host: 'gpu.test', nested: { values: [null, true, 3.5, 'text', [{ deep: false }]] }, empty: {} }
      const input: CreateExecutionContextInput = { projectId: project.id, name: 'SSH', kind: 'ssh', config }
      const created = ctx.zerowallExecution.create(input)
      expect(created.config).toEqual(config)
      expect(ctx.zerowallExecution.get(created.id).config).toEqual(config)
      expect(ctx.zerowallExecution.list(project.id)[0]?.config).toEqual(config)
      const updated = { ...config, additional: [[], { preserved: null }] }
      expect(ctx.zerowallExecution.update({ id: created.id, changes: { config: updated } }).config).toEqual(updated)
      expect(store.getExecutionContext(created.id)?.config).toEqual(updated)
    } finally {
      await ctx.fiber.dispose()
      store.close()
      vi.unstubAllEnvs()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('keeps Windows and macOS local execution explicit', () => {
    expect(executionCommandSpec(undefined, 'Write-Output ok', 'C:/work', 'win32')).toEqual({
      executable: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', 'Write-Output ok'], cwd: 'C:/work',
    })
    expect(executionCommandSpec(undefined, 'printf ok', '/work', 'darwin')).toEqual({ executable: '/bin/sh', args: ['-lc', 'printf ok'], cwd: '/work' })
  })

  it('builds WSL and SSH commands without embedding private key contents', () => {
    const wsl = executionCommandSpec({ ...common, kind: 'wsl' as const, config: { distro: 'Ubuntu' } }, 'python run.py', '/work dir', 'win32')
    expect(wsl).toMatchObject({ executable: 'wsl.exe', args: expect.arrayContaining(['-d', 'Ubuntu', '--', 'sh', '-lc']) })
    expect(wsl.args.at(-1)).toContain("cd '/work dir'")

    const ssh = executionCommandSpec({ ...common, kind: 'ssh' as const, config: { host: 'gpu.test', user: 'alice', port: 2222, privateKeyPath: 'C:/keys/gpu' } }, 'python run.py', '/srv/work', 'darwin')
    expect(ssh).toMatchObject({ executable: 'ssh', args: expect.arrayContaining(['-p', '2222', '-i', 'C:/keys/gpu', 'alice@gpu.test']) })
    expect(JSON.stringify(ssh)).not.toContain('BEGIN PRIVATE KEY')
  })
})
