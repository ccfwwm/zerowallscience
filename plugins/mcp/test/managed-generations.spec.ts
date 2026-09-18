import { describe, it, expect } from 'vitest'
import { ManagedGenerations } from '../src/host/managed-generations.js'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
const server = String.raw`
const readline = require('node:readline');
const generation = process.env.TEST_GENERATION;
readline.createInterface({input:process.stdin}).on('line', line => {
 const q=JSON.parse(line);
 const reply=result=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,result})+'\n');
 if(q.method==='initialize') reply({protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'fixture',version:generation}});
 if(q.method==='tools/list') reply({tools:[{name:'echo',description:'Generation echo',inputSchema:{type:'object',properties:{delay:{type:'number'}}}}]});
 if(q.method==='tools/call') setTimeout(()=>reply({content:[{type:'text',text:generation}]}),q.params.arguments.delay||0);
});`
describe('managed MCP generations', () => {
  it('keeps an in-flight request on the old client and routes new requests to the candidate', async () => {
    const definitions = new Map<string, ToolDefinition>()
    const ctx = { tools: { register: (definition: ToolDefinition) => { if (definitions.has(definition.name)) throw Error('duplicate'); definitions.set(definition.name, definition); return () => definitions.delete(definition.name) } }, logger: { error() {} }, get: () => undefined } as any
    let snapshot = 'one'
    const generations = new ManagedGenerations(ctx, () => snapshot)
    const config = (value: string) => ({ serverName: 'managed', transport: 'stdio' as const, command: process.execPath, args: ['-e', server], cwd: process.cwd(), env: { TEST_GENERATION: value }, toolCallTimeoutMs: 5000, failOnStartupError: true })
    const exec = () => ({ signal: new AbortController().signal }) as any
    try {
      generations.activate('id', await generations.prepare(config('one')))
      const tool = definitions.get('mcp__managed__echo')!
      const pending = tool.execute({ delay: 300 }, exec())
      const candidate = await generations.prepare(config('two'))
      await generations.stage('id', 'two', candidate)
      snapshot = 'two'
      const next = await tool.execute({ delay: 0 }, exec())
      const old = await pending
      expect(JSON.stringify(next)).toContain('two'); expect(JSON.stringify(old)).toContain('one')
      expect(definitions.size).toBe(1)
    } finally { await generations.dispose() }
  })
  it('retains the active generation when a replacement fails to initialize', async () => {
    const definitions = new Map<string, ToolDefinition>()
    const ctx = { tools: { register: (definition: ToolDefinition) => { definitions.set(definition.name, definition); return () => definitions.delete(definition.name) } }, logger: { error() {} }, get: () => undefined } as any
    const generations = new ManagedGenerations(ctx)
    const config = { serverName: 'managed', transport: 'stdio' as const, command: process.execPath, args: ['-e', server], cwd: process.cwd(), env: { TEST_GENERATION: 'old' }, toolCallTimeoutMs: 5000, failOnStartupError: true }
    try {
      generations.activate('id', await generations.prepare(config))
      await expect(generations.prepare({ ...config, args: ['-e', 'process.exit(1)'] })).rejects.toThrow()
      expect(JSON.stringify(await definitions.get('mcp__managed__echo')!.execute({}, { signal: new AbortController().signal } as any))).toContain('old')
    } finally { await generations.dispose() }
  })
  it('rejects changed tool schemas before activation and keeps the old route', async () => {
    const definitions = new Map<string, ToolDefinition>()
    const ctx = { tools: { register: (definition: ToolDefinition) => { definitions.set(definition.name, definition); return () => definitions.delete(definition.name) } }, logger: { error() {} }, get: () => undefined } as any
    const generations = new ManagedGenerations(ctx)
    const config = { serverName: 'managed', transport: 'stdio' as const, command: process.execPath, args: ['-e', server], cwd: process.cwd(), env: { TEST_GENERATION: 'old' }, toolCallTimeoutMs: 5000, failOnStartupError: true }
    try {
      generations.activate('id', await generations.prepare(config))
      const candidate = await generations.prepare({ ...config, args: ['-e', server.replace("delay:{type:'number'}", "delay:{type:'string'}")] })
      await expect(generations.stage('id', 'new', candidate)).rejects.toThrow('工具接口发生变化')
      await generations.discard(candidate)
      expect(JSON.stringify(await definitions.get('mcp__managed__echo')!.execute({}, { signal: new AbortController().signal } as any))).toContain('old')
    } finally { await generations.dispose() }
  })
})
