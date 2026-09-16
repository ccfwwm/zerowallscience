import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Exercise the curated production tree against an isolated local API fixture.
const runtime = resolve(import.meta.dirname, '../../.build/runtime')
const require = createRequire(resolve(runtime, 'probe.cjs'))
const load = name => import(pathToFileURL(require.resolve(name)).href)
const { Context } = await load('@deepseek-ai/cordis')
const { default: SystemPrompt } = await load('@deepseek-ai/dsh-system-prompt')
const { default: Tools } = await load('@deepseek-ai/dsh-tools')
const { default: Zotero } = await load('dsh-zotero')
let requests = 0
const server = createServer((req, res) => {
  requests++
  res.writeHead(200, {
    'Content-Type': 'application/json', 'Zotero-API-Version': '3',
    'Zotero-Schema-Version': '25', 'Zotero-Server-ID': 'zerowall-test-library',
    'X-Zotero-Version': '7.0.0', 'Total-Results': '0', 'Last-Modified-Version': '1',
  })
  res.end(req.url === '/api/' ? '{}' : '[]')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const ctx = new Context()
try {
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(Tools, {})
  await ctx.plugin(Zotero, { baseUrl: `http://127.0.0.1:${server.address().port}/api` })
  assert.equal(requests, 0, 'loading Zotero must not scan the library')
  const names = ['search', 'get', 'children', 'attachment', 'retrieve', 'export', 'browse', 'changes']
  for (const name of names) assert.ok(ctx.tools.get(`zotero_${name}`), `missing zotero_${name}`)
  const status = await ctx.get('zotero').status()
  assert.equal(status.connected, true)
  const result = await ctx.tools.execute({
    callId: 'zotero-smoke-1', name: 'zotero_search', arguments: { query: 'integration probe' },
    signal: new AbortController().signal,
  })
  assert.equal(result.isError, false, JSON.stringify(result))
  console.log(JSON.stringify({ registeredTools: names.length, startupRequests: 0, connected: status.connected, searchSucceeded: true, requests }))
} finally {
  await ctx.fiber.dispose()
  await new Promise(resolve => server.close(resolve))
}
