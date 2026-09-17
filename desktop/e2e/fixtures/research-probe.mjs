// Test-only observer/executor loaded solely by an isolated DSH home patch.
import { randomUUID } from 'node:crypto'
import { LlmAdapter } from '../../../deepseek-harness/packages/llm/llm/lib/index.js'
export const name = 'zerowall-integration-probe'
export const inject = ['tools', 'sessions', 'sessionController', 'webServer', 'agents', 'connection', 'llm']
export function apply(ctx) {
  const gates = new Map()
  ctx.llm.registerAdapter(['integration-test'], Object.assign(new LlmAdapter(), {
    providerInfo: () => ({ id: 'integration-test', name: 'Integration test' }),
    listModels: async () => [{ provider: 'integration-test', id: 'hold', name: 'Hold' }],
    resolveModel: async () => ({ provider: 'integration-test', id: 'hold', name: 'Hold', context: { contextWindow: 32768 }, defaultMaxTokens: 1024 }),
    async *stream(options) {
      const key = randomUUID()
      await new Promise(resolve => { gates.set(key, resolve); options.signal?.addEventListener('abort', resolve, { once: true }) })
      gates.delete(key)
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'Completed integration task.' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Completed integration task.' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }))
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/zerowall-integration', handler: async (req,res) => {
    const rejection = ctx.connection.requestRejection(req)
    if (rejection !== undefined) { res.writeHead(rejection); res.end(); return }
    try {
      const chunks=[];for await (const chunk of req) chunks.push(chunk)
      const body=JSON.parse(Buffer.concat(chunks).toString() || '{}')
      let value
      if (body.action === 'inventory') value={pid:process.pid,tools:ctx.tools.schemas().map(x=>x.name), agents:ctx.sessions.list().map(s=>({id:s.id,status:ctx.agents.get(s.id)?.status})), gates:[...gates.keys()]}
      else if (body.action === 'schema') value=ctx.tools.get(body.name)?.parameters
      else if (body.action === 'release') { for (const resolve of gates.values()) resolve(); value=true }
      else {
        const result=await ctx.sessionController.resolveAgent(body.sessionId)
        if (result.error) throw result.error
        const tool=ctx.tools.get(body.name)
        if (!tool) throw new Error('Missing tool '+body.name)
        value=await tool.execute(body.args,{agent:result.agent,signal:new AbortController().signal,callId:randomUUID(),rootCallId:randomUUID(),name:body.name,arguments:body.args,deferContext:()=>{}})
      }
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,value}))
    } catch(error) {res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({ok:false,error:String(error)}))}
  }}), 'isolated integration probe')
}
