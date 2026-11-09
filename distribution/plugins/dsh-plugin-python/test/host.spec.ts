import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { pythonRuntimeEnvironment, resolvePythonRuntime } from '../src/shared/runtime-path.js'
import * as Python from '../src/host/index.js'
import { UvRuntime } from '../src/host/uv-runtime.js'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { ToolExecutionPipeline } from '@deepseek-ai/dsh-tools/pipeline'
import { ToolCallId } from '@deepseek-ai/dsh-llm'

const roots: string[] = []
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

it('uses explicit carrier paths in directories containing spaces and Chinese characters', async () => {
  const root = await mkdtemp(join(tmpdir(), 'Python 全新目录 ')); roots.push(root)
  const executable = join(root, 'different executable.exe'); const sitePackages = join(root, 'dependency packages')
  await writeFile(executable, 'fixture'); await mkdir(sitePackages)
  const paths = { root, executable, sitePackages, snapshotRoot: root }
  const env = pythonRuntimeEnvironment(paths, { PATH: join(root, 'tools'), PYTHONHOME: 'ambient', PYTHONPATH: 'ambient', ZEROWALL_PYTHON_ROOT: 'old', CONDA_PREFIX: 'ambient' })
  expect(await resolvePythonRuntime(env)).toEqual(paths)
  expect(env.PATH?.split(delimiter)[0]).toBe(root)
  expect(env.VIRTUAL_ENV).toBe(root)
  expect(env.PYTHONPATH).toBeUndefined(); expect(env.PYTHONHOME).toBeUndefined(); expect(env.CONDA_PREFIX).toBeUndefined()
  expect(env.ZEROWALL_PYTHON_ROOT).toBeUndefined()
})

it('does not discover old Python pointers or fall back to system Python', async () => {
  await expect(resolvePythonRuntime({ ZEROWALL_PYTHON_ROOT: 'C:/old/Python', PATH: process.env.PATH })).rejects.toThrow('PYTHON_ENVIRONMENT_UNAVAILABLE')
})

it('registers Python output and releases all tools when disabled', async () => {
  const root = await mkdtemp(join(tmpdir(), 'Python-plugin-')); roots.push(root)
  const paths = { root, executable: join(root, 'python'), sitePackages: root, snapshotRoot: root }
  vi.spyOn(UvRuntime.prototype, 'prepare').mockResolvedValue(paths)
  const ctx = new Context()
  try {
    await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime)
    const fiber = ctx.plugin(Python, { environmentRoot: root, assetsRoot: root })
    await fiber
    vi.spyOn(ctx.zerowallPython, 'run').mockResolvedValue({ exitCode: 0, timedOut: false, cancelled: false, stdout: 'mcp ready', stderr: '', python: 'carrier-selected-python' })
    const pipeline = new ToolExecutionPipeline(ctx)
    const prepared = await pipeline.prepare({ name: 'python', arguments: { code: 'import mcp', description: 'Probe core dependencies' }, callId: ToolCallId('python-output-contract'), signal: new AbortController().signal, agent: { session: { header: {} } } as never })
    const result = await pipeline.complete(prepared.exec, prepared.kind === 'dispatch' ? await pipeline.dispatch(prepared.exec) : prepared)
    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({ exitCode: 0, cancelled: false, stdout: 'mcp ready', python: 'carrier-selected-python' })
    expect(result.content).toMatchSnapshot()
    await fiber.dispose()
    expect(ctx.tools.get('python')).toBeUndefined()
  } finally { await ctx.fiber.dispose() }
})
