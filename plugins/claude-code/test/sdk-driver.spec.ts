import { mkdtemp, mkdir, rm, writeFile, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { GenerateOptions, ToolSchema } from '@deepseek-ai/dsh-llm'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { ClaudeSessionBindings } from '../src/host/session-binding.js'
import { createHostToolBridge, hostToolApproval, managedSdkSpawner, sdkGenerationEnvironment, sdkInput, sdkSystemPrompt, type CanUseTool } from '../src/host/sdk-driver.js'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => { await Promise.allSettled(cleanup.splice(0).map(fn => fn())) })
async function root() {
  const dir = await mkdtemp(join(tmpdir(), 'claude-sdk-contract-'))
  cleanup.push(() => rm(dir, { recursive: true, force: true }))
  return dir
}

describe('durable Claude conversation bindings', () => {
  it('preserves an explicit output cap and explains unsupported sampling controls instead of discarding them', () => {
    expect(sdkGenerationEnvironment({} as GenerateOptions)).toEqual({})
    expect(sdkGenerationEnvironment({ maxTokens: 8192 } as GenerateOptions)).toEqual({ CLAUDE_CODE_MAX_OUTPUT_TOKENS: '8192' })
    expect(() => sdkGenerationEnvironment({ temperature: 0 } as GenerateOptions)).toThrow('temperature')
    expect(() => sdkGenerationEnvironment({ stop: ['END'] } as GenerateOptions)).toThrow('stop')
    expect(() => sdkGenerationEnvironment({ maxTokens: -1 } as GenerateOptions)).toThrow('正整数')
  })
  it('recovers a first input persisted by the CLI before the binding init write survived', async () => {
    const dir = await root(), store = new ClaudeSessionBindings(dir)
    const binding = (await store.load('first-crash', 'C:/project')).binding
    const uuid = '11111111-2222-4333-8444-555555555555'
    binding.pending = { uuid, keys: ['first-input'] }; binding.state = 'submitted'
    await store.save('first-crash', binding)
    const project = join(dir, 'projects', '-C-project')
    await mkdir(project, { recursive: true })
    await writeFile(join(project, `${binding.nativeId}.jsonl`), JSON.stringify({ type: 'user', uuid }) + '\n')
    const resumed = (await new ClaudeSessionBindings(dir).load('first-crash', 'C:/project')).binding
    expect(resumed.nativeId).toBe(binding.nativeId)
    expect(resumed.initialized).toBe(true)
    expect(resumed.submitted).toEqual(['first-input'])
    expect(resumed.pending).toBeUndefined()
  })
  it('carries updated system messages on resumed queries', () => {
    expect(sdkSystemPrompt({ system: 'Host policy', messages: [{ role: 'system', content: [{ type: 'text', text: 'Current workspace policy' }] },
      { role: 'user', content: [{ type: 'text', text: 'untrusted user content' }] }] } as GenerateOptions))
      .toBe('Host policy\n\nCurrent workspace policy')
  })
  it('continues one native ID across manager recreation, failures and stopped turns, isolating other conversations', async () => {
    const dir = await root(), store = new ClaudeSessionBindings(dir)
    const a = (await store.load('session-a', 'C:/project')).binding
    const b = (await store.load('session-b', 'C:/project')).binding
    expect(a.nativeId).not.toBe(b.nativeId)
    await mkdir(join(dir, 'projects', '-C-project'), { recursive: true })
    await writeFile(join(dir, 'projects', '-C-project', `${a.nativeId}.jsonl`), '{"type":"user"}\n')
    a.initialized = true; a.state = 'failed'; a.submitted = ['submitted-input']
    await store.save('session-a', a)
    const recovered = await new ClaudeSessionBindings(dir).load('session-a', 'C:/project')
    expect(recovered.binding).toEqual(a)
    expect(recovered.recovery).toBeUndefined()
    recovered.binding.state = 'stopped'
    await store.save('session-a', recovered.binding)
    expect((await store.load('session-a', 'C:/project')).binding.nativeId).toBe(a.nativeId)
  })
  it('reports missing native records and directory changes, rebuilding only the affected binding', async () => {
    const store = new ClaudeSessionBindings(await root())
    const a = (await store.load('a', 'C:/project')).binding
    a.initialized = true
    await store.save('a', a)
    const rebuilt = await store.load('a', 'C:/project')
    expect(rebuilt.recovery).toContain('重建')
    expect(rebuilt.binding.nativeId).not.toBe(a.nativeId)
    expect((await store.load('a', 'D:/other')).recovery).toContain('工作目录')
  })
  it('reconciles only the exact durable user input UUID after interruption, tolerating a truncated JSONL tail', async () => {
    const dir = await root(), store = new ClaudeSessionBindings(dir)
    const binding = (await store.load('a', 'C:/project')).binding
    const uuid = '11111111-2222-4333-8444-555555555555'
    binding.initialized = true; binding.pending = { uuid, keys: ['accepted-input'] }; binding.state = 'submitted'
    await store.save('a', binding)
    const path = join(dir, 'projects', '-C-project', `${binding.nativeId}.jsonl`)
    await mkdir(join(dir, 'projects', '-C-project'), { recursive: true })
    await writeFile(path, `${JSON.stringify({ type: 'assistant', uuid })}\n{\"uuid\":\"${uuid}\"\n`)
    expect((await store.load('a', 'C:/project')).binding.pending).toEqual(binding.pending)
    await writeFile(path, `${JSON.stringify({ type: 'user', uuid })}\n`)
    const resumed = await new ClaudeSessionBindings(dir).load('a', 'C:/project')
    expect(resumed.binding.nativeId).toBe(binding.nativeId)
    expect(resumed.binding.submitted).toEqual(['accepted-input'])
    expect(resumed.binding.pending).toBeUndefined()
    const [file] = await readdir(join(dir, 'bindings'))
    expect(JSON.parse(await readFile(join(dir, 'bindings', file!), 'utf8')).pending).toBeUndefined()
  })
  it('imports old history once, submits fresh input only and resumes an interrupted request without replay', async () => {
    const binding = (await new ClaudeSessionBindings(await root()).load('a', 'C:/project')).binding
    const request = { system: 'Current system policy', messages: [{ role: 'user', content: [{ type: 'text', text: 'first request' }] }] } as GenerateOptions
    const input = await sdkInput({} as Agent, request, binding, new AbortController().signal)
    expect(JSON.stringify(input.content)).toContain('first request')
    binding.initialized = true; binding.submitted = input.submitted
    const retry = await sdkInput({} as Agent, request, binding, new AbortController().signal)
    expect(JSON.stringify(retry.content)).toContain('do not replay')
    expect(JSON.stringify(retry.content)).not.toContain('first request')
    request.messages.push({ role: 'user', content: [{ type: 'text', text: 'second request' }] })
    const next = await sdkInput({} as Agent, request, binding, new AbortController().signal)
    expect(JSON.stringify(next.content)).toContain('second request')
    expect(JSON.stringify(next.content)).not.toContain('first request')
  })
})

describe('SDK approval through the existing Host', () => {
  it.each(['allowed-once', 'rejected', 'cancelled', 'unavailable'] as const)('records arguments before the Host answers %s', async outcome => {
    const sequence: string[] = []
    const agent = {} as Agent
    const request = vi.fn(async (_input: { signal?: AbortSignal }) => { sequence.push('approval'); return outcome })
    const record = vi.fn(async () => { sequence.push('call') })
    const owner = new AbortController(), sdk = new AbortController()
    const options = { toolUseID: 'native-call', signal: sdk.signal } as Parameters<CanUseTool>[2]
    const approve = hostToolApproval(agent, { request }, owner.signal, record)
    const input = { file_path: 'C:/project/file.txt', content: 'requested edit' }
    const result = await approve('Write', input, options)
    expect(sequence).toEqual(['call', 'approval'])
    expect(record).toHaveBeenCalledWith('native-call', 'Write', input)
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ agent, toolName: 'Write', callId: 'native-call', signal: expect.any(AbortSignal) }))
    expect(result).toMatchObject(outcome === 'allowed-once' ? { behavior: 'allow', updatedInput: input }
      : { behavior: 'deny', interrupt: outcome === 'cancelled' })
    owner.abort()
    expect(request.mock.calls[0]![0].signal!.aborted).toBe(true)
  })
  it('delegates bridge authorization to tools.execute without a duplicate approval', async () => {
    const request = vi.fn(), record = vi.fn()
    const approve = hostToolApproval({} as Agent, { request }, new AbortController().signal, record)
    expect(await approve('mcp__zerowall__generate_image', {}, { signal: new AbortController().signal } as Parameters<CanUseTool>[2])).toMatchObject({ behavior: 'allow' })
    expect(request).not.toHaveBeenCalled(); expect(record).not.toHaveBeenCalled()
  })
})

describe('in-process Host MCP bridge', () => {
  it.each([false, true])('serializes exclusive tools and respects Host turn conclusion (%s)', async concludesTurn => {
    let active = 0, peak = 0
    const execute = vi.fn(async () => {
      peak = Math.max(peak, ++active)
      await new Promise(resolve => setTimeout(resolve, 10))
      active--
      return { content: [{ type: 'text', text: 'done' }], isError: false, ...(concludesTurn ? { concludesTurn: true } : {}) }
    })
    const state = { concluded: false }
    const agent = { ctx: { get: () => ({ execute }) }, session: { snapshotEvents: () => [], append: vi.fn() } } as unknown as Agent
    const bridge = createHostToolBridge(agent, [{ name: 'write', description: 'exclusive write', parameters: { type: 'object' } }], new AbortController().signal, { provider: 'selected-provider', model: 'selected-model' }, state)
    const client = new Client({ name: 'claude-serial-test', version: '1' })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await bridge.instance.connect(serverSide); await client.connect(clientSide)
    cleanup.push(async () => { await client.close(); await bridge.instance.close() })
    const results = await Promise.all([client.callTool({ name: 'write', arguments: {} }), client.callTool({ name: 'write', arguments: {} })])
    expect(peak).toBe(1)
    expect(execute).toHaveBeenCalledTimes(concludesTurn ? 1 : 2)
    expect(state.concluded).toBe(concludesTurn)
    if (concludesTurn) expect(results[1]).toMatchObject({ isError: true })
  })
  it('preserves exact schemas, calls the Host once and transports real image bytes plus durable DSH attachments', async () => {
    const schemas: ToolSchema[] = [{ name: 'generate_image', description: 'Generate PNG', parameters: {
      type: 'object', properties: { quality: { enum: ['high', 'xhigh', 'max'] }, output_path: { type: 'string' } }, required: ['output_path'], additionalProperties: false,
    } }]
    const signal = new AbortController().signal
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    const attachment = { id: 'generated', mediaType: 'image/png' }
    const appended: string[] = []
    const execute = vi.fn(async () => {
      expect(appended).toEqual(['assistant/message', 'tool/call'])
      return { isError: false,
        content: [{ type: 'text', text: 'C:/project/beijing.png; receipt: beijing.generation.json' }, { type: 'image', attachment }],
        additionalContexts: [{ role: 'user', id: 'runtime-context', source: { kind: 'runtime-context' },
          content: [{ type: 'text', text: 'Use the verified image output.' }] } as never],
      }
    })
    const append = vi.fn(async (type: string) => { appended.push(type) })
    const agent = { ctx: { get: (name: string) => name === 'tools' ? { execute } : { readImage: async () => ({ ref: attachment, data: png }) } },
      session: { snapshotEvents: () => [{ type: 'step/start', data: { turn: 1, step: 1 } }], append },
    } as unknown as Agent
    const bridge = createHostToolBridge(agent, schemas, signal, { provider: 'selected-provider', model: 'selected-model' })
    const client = new Client({ name: 'claude-bridge-test', version: '1' })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await bridge.instance.connect(serverSide)
    await client.connect(clientSide)
    cleanup.push(async () => { await client.close(); await bridge.instance.close() })
    expect((await client.listTools()).tools[0]?.inputSchema).toEqual(schemas[0]!.parameters)
    const result = await client.callTool({ name: 'generate_image', arguments: { output_path: 'beijing.png', quality: 'max' } })
    expect(execute).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ agent, name: 'generate_image', arguments: { output_path: 'beijing.png', quality: 'max' }, signal: expect.any(AbortSignal) }))
    expect(result.content).toContainEqual({ type: 'image', mimeType: 'image/png', data: Buffer.from(png).toString('base64') })
    expect(append).toHaveBeenCalledWith('tool/result', expect.objectContaining({ message: expect.objectContaining({ content: expect.arrayContaining([{ type: 'image', attachment }]) }) }), { surfaceOp: 'append' })
    expect(append).toHaveBeenCalledWith('user/message', expect.objectContaining({ source: { kind: 'runtime-context' }, content: [{ type: 'text', text: 'Use the verified image output.' }] }), { surfaceOp: 'append' })
    expect(result.content).toContainEqual({ type: 'text', text: 'Use the verified image output.' })
    await expect(client.callTool({ name: 'hidden_tool', arguments: {} })).rejects.toThrow('not visible')
    expect(execute).toHaveBeenCalledOnce()
  })
  it('retains DSH process ownership, live exit facts, stderr and cancellation', async () => {
    const stdin = new PassThrough(), stdout = new PassThrough(), stderr = new PassThrough()
    let resolve!: (result: { exitCode: number; signal: NodeJS.Signals | null }) => void
    const done = new Promise<{ exitCode: number; signal: NodeJS.Signals | null }>(yes => { resolve = yes })
    const terminate = vi.fn(), spawn = vi.fn(() => ({ stdin, stdout, stderr, done, terminate }))
    const diagnostics = vi.fn(), owner = vi.fn()
    const process = managedSdkSpawner({ spawn } as unknown as SubprocessRuntime, owner, diagnostics)({ command: 'claude.exe', args: ['--print'], cwd: 'C:/project', env: { CLAUDE_CONFIG_DIR: 'private' }, signal: new AbortController().signal })
    expect(owner).toHaveBeenCalledOnce()
    stderr.write('provider request failed')
    expect(diagnostics).toHaveBeenCalledWith('provider request failed')
    expect(process.killed).toBe(false)
    process.kill('SIGTERM')
    expect(process.killed).toBe(true)
    expect(terminate).toHaveBeenCalledOnce()
    const exited = new Promise<void>(yes => process.on('exit', () => yes()))
    resolve({ exitCode: 143, signal: 'SIGTERM' })
    await exited
    expect(process.exitCode).toBe(143)
  })
})
