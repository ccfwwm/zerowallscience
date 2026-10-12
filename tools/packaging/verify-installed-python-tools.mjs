import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Run with the installed Electron in Node mode, using its verified carrier.
const installation = resolve(process.argv[2]), output = resolve(process.argv[3])
const commands = join(installation, 'resources/commands')
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const core = createRequire(join(installation, 'resources/app.asar/package.json'))
const { initializeProfile } = await import(pathToFileURL(join(commands, 'profile.mjs')))
const { prepareOfflineCandidate } = await import(pathToFileURL(join(commands, 'offline-profile.mjs')))
const defaults = await json(join(commands, 'default-plugins.json'))
const bundledPlugins = await json(join(commands, 'bundled-plugins.json'))
const pin = await json(join(installation, 'resources/licenses/deepseek-harness.version.json'))
const home = join(output, 'host'), workspace = join(output, 'workspace')
await mkdir(workspace, { recursive: true })
await initializeProfile(home, defaults, bundledPlugins)
const prepared = await prepareOfflineCandidate({ home, source: join(installation, 'resources/offline-profile'),
  keys: await json(join(commands, 'trusted-keys.json')), target: { desktopVersion: '8.1.3', dshVersion: pin.version, dshCommit: pin.commit, platform: process.platform, architecture: process.arch },
  defaults, bundledPlugins, yaml: core('yaml') })
assert.equal(prepared.blocked.length, 0)
process.env.DSH_HOME = home
process.env.ZEROWALL_PROFILE_ANCHOR = pathToFileURL(join(prepared.candidate, 'package.json')).href
process.env.ZEROWALL_RUNTIME_ANCHOR = pathToFileURL(join(installation, 'resources/app.asar/package.json')).href
await import(pathToFileURL(join(installation, 'resources/app.asar/runtime/runtime-esm-register.mjs')))
const profile = createRequire(join(prepared.candidate, 'package.json'))
const entry = id => { try { return profile.resolve(id) } catch { return core.resolve(id) } }
const load = async id => import(pathToFileURL(entry(id)))
const plugin = async id => { const module = await load(id); return module.default ?? module }
const { Context } = await load('@deepseek-ai/cordis')
const { SessionId } = await load('@deepseek-ai/dsh-session')
const { ToolCallId, createUserMessage } = await load('@deepseek-ai/dsh-llm')
const ctx = new Context()
process.env.ZEROWALL_PYTHON_RUNTIME_ROOT = join(installation, 'Python')
process.env.ZEROWALL_PYTHON_MANAGEMENT_ROOT = join(installation, 'Python/.zerowall')
process.env.ZEROWALL_RESEARCH_DB = join(output, 'research.sqlite')
const receipt = { candidate: prepared.candidate, complete: false, checks: [] }
try {
  for (const id of ['@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-session-projection', '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-llm', '@zerowallscience/plugin-python', '@zerowallscience/plugin-biogenie']) await ctx.plugin(await plugin(id))
  await ctx.plugin(await plugin('@everclear077/dsh-progressive-tools'), { groups: [{ id: 'bio', include: ['bio_*', 'python*'], description: 'Scientific Python and BioGenie' }] })
  await ctx.plugin(await plugin('@deepseek-ai/dsh-agent-loop'), { agents: [] })
  ctx.on('llm/stream', () => (async function* () { yield { type: 'finish', reason: { kind: 'stop' } } })())
  const sessionId = SessionId('installed-python-tools')
  const agent = await ctx.agentLoop.create(sessionId, { provider: 'acceptance-fixture', model: 'acceptance-fixture' }, { cwd: workspace })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Verify installed tools.' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  const call = async (name, args, signal = new AbortController().signal) => {
    const result = await ctx.tools.execute({ name, arguments: args, callId: ToolCallId('installed-' + crypto.randomUUID()), signal, agent })
    assert.equal(result.isError, false, JSON.stringify(result.content))
    if (name === 'tool_dispatch') {
      assert.equal(result.value.protocol, 'dsh-progressive-tools/dispatch-v2')
      return result.value.value
    }
    return result.value
  }
  const search = await call('tool_search', { query: 'bio_local', action: 'search' })
  assert.match(JSON.stringify(search), /bio_local/u)
  receipt.checks.push({ name: 'installed tool_search', foundBioLocal: true })
  const bio = await call('tool_dispatch', { name: 'bio_local', arguments: { action: 'run', operation: 'seq_translate', arguments: { sequence: 'ATGGCCATTGTA' } } })
  assert.match(JSON.stringify(bio), /MAIV/u)
  receipt.checks.push({ name: 'installed tool_dispatch → bio_local', translated: 'MAIV' })
  const bioCall = async (operation, args) => {
    const value = await call('tool_dispatch', { name: 'bio_local', arguments: { action: 'run', operation, arguments: args } })
    assert.equal(value.ok, true, JSON.stringify(value))
    assert.equal(value.provenance.executable.toLowerCase(), join(installation, 'Python/python.exe').toLowerCase())
    return value
  }
  await writeFile(join(workspace, 'one.fasta'), '>one\nATGGCCATTGTA\n')
  assert.equal((await bioCall('seq_translate', { sequence: 'one.fasta' })).result.protein, 'MAIV')
  await writeFile(join(workspace, 'multiple.fasta'), '>one\nATGGCC\n>two\nATGGCC\n')
  for (const sequence of ['multiple.fasta', '../outside.fasta']) {
    const value = await call('tool_dispatch', { name: 'bio_local', arguments: { action: 'run', operation: 'seq_translate', arguments: { sequence } } })
    assert.equal(value.ok, false, JSON.stringify(value))
  }
  const sbol = await bioCall('sbol_write', { components: [{ name: 'promoter', sequence: 'ATGGCC', role: 'promoter' }], output_file: 'design.xml' })
  assert.equal(sbol.result.n_components, 1)
  receipt.checks.push({ name: 'installed file input, multirecord/path rejection and SBOL', complete: true })
  const genes = Array.from({ length: 100 }, (_, i) => 'G' + i), samples = Array.from({ length: 8 }, (_, i) => 'S' + i)
  await writeFile(join(workspace, 'counts.csv'), 'gene,' + samples.join(',') + '\n' + genes.map((gene, g) => gene + ',' + samples.map((_, s) => Math.floor((30 + g * 3) * (g < 20 && s >= 4 ? 3 : 1) * (0.6 + ((g * 11 + s * 7) % 17) / 20))).join(',')).join('\n'))
  await writeFile(join(workspace, 'meta.csv'), 'sample,condition\n' + samples.map((s, i) => `${s},${i < 4 ? 'ctrl' : 'trt'}`).join('\n'))
  const de = await bioCall('deseq2', { counts_file: 'counts.csv', meta_file: 'meta.csv', contrast: 'trt_vs_ctrl', out_csv: 'de.csv' })
  assert.equal(de.result.method.backend, 'pydeseq2')
  await writeFile(join(workspace, 'sets.gmt'), 'UP\tlocal\t' + genes.slice(0, 20).join('\t') + '\nDOWN\tlocal\t' + genes.slice(50, 75).join('\t') + '\n')
  const gsea = await bioCall('gsea', { de_results_file: 'de.csv', gene_set_file: 'sets.gmt', permutation_num: 20, min_size: 5, out_csv: 'gsea.csv' })
  assert.equal(gsea.result.method.backend, 'gseapy')
  await writeFile(join(workspace, 'ml.csv'), 'x,z,patient,label\n' + Array.from({ length: 60 }, (_, i) => `${i % 2 + i / 100},${i % 7},P${Math.floor(i / 3)},${i % 2}`).join('\n'))
  const ml = await bioCall('ml_pipeline', { path: 'ml.csv', target: 'label', group_col: 'patient', cv: 3 })
  assert.equal(ml.result.split_policy.group_col, 'patient')
  assert.equal(ml.result.validation_scope.holdout_evaluated_once, true)
  const plot = await bioCall('plasmid_map', { sequence: 'ATGGCC'.repeat(100), features: [{ start: 20, end: 150, name: 'gene', type: 'CDS' }], out_file: 'plasmid.png' })
  assert.equal(plot.result.graphic, true)
  await writeFile(join(output, 'installed-algorithms-receipt.json'), JSON.stringify({ sbol, de, gsea, ml, plot }, null, 2))
  receipt.checks.push({ name: 'installed formal DE/GSEA, grouped ML and plasmid plot', complete: true })
  await call('tool_search', { query: 'python', action: 'search' })
  const python = await call('tool_dispatch', { name: 'python', arguments: { code: 'import sys; print(sys.executable)', description: 'Verify fixed interpreter' } })
  assert.match(JSON.stringify(python).toLowerCase(), /python[\\/]+python\.exe/u)
  assert.ok(!JSON.stringify(python).match(/slots[\\/]/iu))
  receipt.checks.push({ name: 'installed Python tool', result: python })
  const stored = await ctx.zerowallPython.run({ code: "import sys; sys.stderr.write('错'*400000)", description: 'Verify full stderr recording' }, { signal: new AbortController().signal, agent })
  const bytes = await readFile(join(workspace, '.zerowall/python-results', stored.result_id + '.stderr'))
  assert.equal(bytes.length, 1200000)
  await call('tool_search', { query: 'python_result', action: 'search' })
  const page = await call('tool_dispatch', { name: 'python_result', arguments: { result_id: stored.result_id, stream: 'stderr', offset: 1199997, limit: 4 } })
  assert.match(JSON.stringify(page), /错/u)
  receipt.checks.push({ name: 'complete stderr result retained', bytes: bytes.length })
  const cancellation = new AbortController()
  const pending = ctx.zerowallPython.run({ code: "import time; print('started',flush=True); time.sleep(60)", description: 'Cancellation acceptance' }, { signal: cancellation.signal, agent })
  setTimeout(() => cancellation.abort(), 500)
  await assert.rejects(pending)
  const resultFiles = await readdir(join(workspace, '.zerowall/python-results'))
  const metadata = await Promise.all(resultFiles.filter(name => name.endsWith('.json')).map(name => json(join(workspace, '.zerowall/python-results', name))))
  assert.ok(metadata.some(item => item.cancelled === true && item.python.toLowerCase() === join(installation,'Python/python.exe').toLowerCase()))
  receipt.checks.push({ name: 'actual Python cancellation and durable metadata', complete: true })
  const timedOut = await ctx.zerowallPython.run({ code: 'import time; time.sleep(60)', description: 'Timeout acceptance', timeoutMs: 100 }, { signal: new AbortController().signal, agent })
  assert.equal(timedOut.timedOut, true)
  receipt.checks.push({ name: 'actual Python timeout', complete: true })
  // Exercise the installed MCP resolver and SDK handshake using a local server
  // that reports its actual interpreter. No remote account or credentials.
  const mcp = await load('@zerowallscience/plugin-mcp')
  process.env.ZEROWALL_BIO_TOOLS_ROOT = join(workspace, 'mcp-fixture')
  await mkdir(process.env.ZEROWALL_BIO_TOOLS_ROOT, { recursive: true })
  const server = join(process.env.ZEROWALL_BIO_TOOLS_ROOT, 'run_server.py')
  await writeFile(server, `import json,sys\nfor line in sys.stdin:\n q=json.loads(line)\n if 'id' not in q: continue\n method=q.get('method')\n result={'protocolVersion':'2024-11-05','capabilities':{'tools':{}},'serverInfo':{'name':'fixed-python-acceptance','version':'1'}} if method=='initialize' else {'tools':[{'name':'interpreter','inputSchema':{'type':'object'}}]} if method=='tools/list' else {'content':[{'type':'text','text':sys.executable}]}\n print(json.dumps({'jsonrpc':'2.0','id':q['id'],'result':result}),flush=True)\n`)
  const launch = mcp.resolveStdioLaunch({ command: 'zerowall-managed:bio-tools', args: [], cwd: '' }, workspace)
  assert.equal(launch.command.toLowerCase(), join(installation, 'Python/python.exe').toLowerCase())
  const mcpRequire = createRequire(entry('@zerowallscience/plugin-mcp'))
  const { Client } = await import(pathToFileURL(mcpRequire.resolve('@modelcontextprotocol/sdk/client/index.js')))
  const { StdioClientTransport } = await import(pathToFileURL(mcpRequire.resolve('@modelcontextprotocol/sdk/client/stdio.js')))
  const client = new Client({ name: 'installed-acceptance', version: '1' })
  try {
    await client.connect(new StdioClientTransport({ ...launch, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } }))
    assert.equal((await client.listTools()).tools[0].name, 'interpreter')
    const result = await client.callTool({ name: 'interpreter', arguments: {} })
    assert.equal(result.content[0].text.toLowerCase(), launch.command.toLowerCase())
    receipt.checks.push({ name: 'installed managed MCP initialize → tools/list → call', executable: result.content[0].text, server: 'local acceptance fixture' })
  } finally { await client.close() }
  // Verify the installed Bio Tools payload as well as the interpreter fixture.
  process.env.ZEROWALL_BIO_TOOLS_ROOT = join(installation, 'resources/extensions/mcp/bio-tools')
  const actualLaunch = mcp.resolveStdioLaunch({ command: 'zerowall-managed:bio-tools', args: [], cwd: '' }, workspace)
  assert.equal(actualLaunch.command.toLowerCase(), join(installation, 'Python/python.exe').toLowerCase())
  const actualClient = new Client({ name: 'installed-bio-tools-acceptance', version: '1' })
  try {
    await actualClient.connect(new StdioClientTransport({ ...actualLaunch, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } }))
    const listed = await actualClient.listTools()
    assert.ok(listed.tools.some(tool => tool.name === 'bio_jobs'))
    assert.ok(listed.tools.some(tool => tool.name === 'bio_search'))
    const status = await actualClient.callTool({ name: 'bio_jobs', arguments: { action: 'status' } })
    assert.ok(!status.isError, JSON.stringify(status))
    assert.ok(status.content.some(item => item.type === 'text' && item.text.length > 0))
    receipt.checks.push({ name: 'installed actual Bio Tools initialize → tools/list → bio_jobs', executable: actualLaunch.command, tools: listed.tools.map(tool => tool.name), result: status })
  } finally { await actualClient.close() }
  receipt.complete = true
} catch (error) {
  receipt.error = error.stack ?? String(error)
  throw error
} finally {
  await writeFile(join(output, 'installed-tools-receipt.json'), JSON.stringify(receipt, null, 2))
  await ctx.fiber.dispose()
}
