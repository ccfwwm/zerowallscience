import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { loadZoteroReducer, snapshotFromLog } from './zotero-replay.mjs'
import { zoteroDispatch } from '../../tools/packaging/zotero-dispatch.mjs'
import {
  adaptZoteroClient,
  adaptZoteroCommand,
  adaptZoteroDetail,
  adaptZoteroItemGraph,
  adaptZoteroRemote,
  adaptZoteroContract,
} from '../../tools/packaging/adapt-zotero.mjs'

const root = resolve(import.meta.dirname, '../..')
const read = path => readFile(resolve(root, path), 'utf8')

test('live item and citation endpoints preserve provider refs and configured styles', async () => {
  let source = adaptZoteroRemote(await read('desktop/node_modules/dsh-zotero/lib/remote.js'))
  assert.equal(adaptZoteroRemote(source), source)
  source = source.replace(/^import .*;$/gm, '')
  const Runtime = Function('TypertRemoteService', 'parseSupportedRef', 'ZOTERO_SETTINGS_NAMESPACE', source.replace('export class ', 'class ') + '\n; return ZoteroRuntime')(
    class { constructor(ctx) { this.ctx = ctx } }, (ref, kinds) => { assert.deepEqual(kinds, ['item']); return { ref } }, 'zotero')
  const ref = 'zotero://user/0/item/ABCD1234?server=instance'
  const service = { config: { defaultStyle: 'apa', defaultLocale: 'zh-CN' },
    get: async request => { assert.deepEqual(request.ref, { ref }); assert.equal(request.include.size, 0); return { title: 'Actual metadata', abstract: 'Actual abstract' } },
    export: async request => { assert.deepEqual(request.refs, [{ ref }]); assert.equal(request.style, 'apa'); assert.equal(request.locale, 'zh-CN'); return { format: request.format, text: '@article{actual}' } },
  }
  const runtime = new Runtime({ get: () => service })
  assert.equal(JSON.parse(await runtime.itemDetail({ ref })).abstract, 'Actual abstract')
  assert.equal(JSON.parse(await runtime.exportCitation({ ref, format: 'bibtex' })).text, '@article{actual}')
  const contract = adaptZoteroContract(await read('desktop/node_modules/dsh-zotero/lib/contract.js'))
  assert.equal(adaptZoteroContract(contract), contract)
  assert.match(contract, /wire: 'request', source: 'json'/)
})

test('shipped Zotero reducer restores dispatcher search rows and prefers structured metadata', async () => {
  const reducer = loadZoteroReducer(adaptZoteroClient(await read('desktop/node_modules/dsh-zotero/lib/client.js')))
  const result = { kind: 'tool', callId: 'legacy', seq: 1, time: 1,
    call: { name: 'tool_dispatch', argsRaw: JSON.stringify({ name: 'zotero_search', arguments: { query: 'test' } }) },
    meta: { protocol: 'dsh-progressive-tools/dispatch-v1', tool: 'zotero_search' },
    content: [{ type: 'text', text: 'Found 1 of 1 results:\n1. zotero://user/0/item/ABCD1234?server=local — Test title (2025) [journalArticle] — Author — PDF' }],
    subCalls: [], isError: false,
  }
  const workspace = reducer.buildSourceWorkspace([result])
  assert.equal(workspace.sources.length, 1)
  assert.equal(workspace.sources[0].title, 'Test title')
  assert.equal(zoteroDispatch(result).meta.items[0].bestAttachmentRef, undefined)
  assert.equal(reducer.buildSourceWorkspace([{ ...result, isError: true }]).sources.length, 0)
  assert.equal(zoteroDispatch({ ...result, call: { name: 'report', argsRaw: '{}' }, meta: {} }), null)
  result.meta.targetMeta = { items: [{ ref: 'zotero://user/0/item/NEW12345', title: 'Structured title', creatorSummary: 'Writer' }] }
  assert.equal(reducer.buildSourceWorkspace([result]).sources[0].title, 'Structured title')
})

test('replay supplied session through the shipped Zotero reducer', { skip: !process.env.ZEROWALL_ZOTERO_REPLAY_LOG }, async () => {
  const rows = (await readFile(process.env.ZEROWALL_ZOTERO_REPLAY_LOG, 'utf8')).trim().split(/\r?\n/u).map(JSON.parse)
  const reducer = loadZoteroReducer(adaptZoteroClient(await read('desktop/node_modules/dsh-zotero/lib/client.js')))
  const workspace = reducer.buildSourceWorkspace(reducer.collectZoteroCalls(snapshotFromLog(rows)))
  assert.equal(workspace.sources.length, 19)
  assert.ok(workspace.sources.every(source => source.title && source.ref.startsWith('zotero://')))
})

test('Zotero status command remains usable with the pinned commands API', async () => {
  const original = await read('desktop/node_modules/dsh-zotero/lib/command.js')
  const adapted = adaptZoteroCommand(original)
  assert.doesNotMatch(adapted, /CommandDefinitionId/u)
  assert.equal(adaptZoteroCommand(adapted), adapted)
  const { registerStatusCommand } = await import(`data:text/javascript;base64,${Buffer.from(adapted).toString('base64')}`)
  let command
  registerStatusCommand({ inject: (_names, mount) => mount({ commands: { register: value => { command = value } } }) }, {
    status: async () => ({ connected: false, diagnosis: 'Zotero is offline' }),
  })
  assert.equal(command.name, 'zotero')
  assert.equal((await command.handler({ rawInput: 'status' })).text, 'Zotero local API: not connected\nZotero is offline')
  assert.equal((await command.handler({ rawInput: 'unknown' })).kind, 'error')
  assert.throws(() => adaptZoteroCommand('CommandDefinitionId(unknown)'), /Unrecognized/u)
})

test('Zotero Sources tab invalidates for nested Progressive Tools calls', async () => {
  const original = await read('desktop/node_modules/dsh-zotero/lib/client.js')
  const adapted = adaptZoteroClient(original)
  assert.equal(adaptZoteroClient(adapted), adapted)
  assert.match(adapted, /visit\(root, key, 1\)/u)
  assert.match(adapted, /for \(const child of block\.subCalls\) visit\(child, key, depth \+ 1\)/u)

  const match = adapted.match(/function sessionSignatureOf\(snapshot\) \{[\s\S]*?\n\}/u)
  assert.ok(match)
  const sessionSignatureOf = Function(
    'visibleToolRoots',
    'isZoteroRoot',
    'isSettledTool',
    'MAX_SUBCALL_DEPTH',
    `${match[0]}; return sessionSignatureOf;`,
  )(
    snapshot => snapshot.roots,
    block => block.name.startsWith('zotero_'),
    block => block.settled,
    256,
  )
  const nested = { callId: 'z1', name: 'zotero_search', settled: false, subCalls: [] }
  const snapshot = {
    roots: [{ key: 'root-1', root: { callId: 'dispatch-1', name: 'tool_dispatch', settled: false, subCalls: [nested] } }],
  }
  const running = sessionSignatureOf(snapshot)
  assert.deepEqual(JSON.parse(running), { order: ['root-1:z1'], running: ['z1'] })
  nested.settled = true
  const settled = sessionSignatureOf(snapshot)
  assert.deepEqual(JSON.parse(settled), { order: ['root-1:z1'], running: [] })
  assert.notEqual(settled, running)
  assert.throws(() => adaptZoteroClient('function sessionSignatureOf(snapshot) { return snapshot }'), /Unrecognized/u)
})

test('Zotero annotation traversal explicitly filters attachment children', async () => {
  const itemGraphOriginal = await read('desktop/node_modules/dsh-zotero/lib/item-graph.js')
  const detailOriginal = await read('desktop/node_modules/dsh-zotero/lib/local/detail.js')
  const itemGraph = adaptZoteroItemGraph(itemGraphOriginal)
  const detail = adaptZoteroDetail(detailOriginal)
  assert.equal(adaptZoteroItemGraph(itemGraph), itemGraph)
  assert.equal(adaptZoteroDetail(detail), detail)
  assert.match(itemGraph, /options\.fetchAnnotationChildren \?\? options\.fetchChildren/u)
  assert.match(detail, /fetchAnnotationChildren: \(childKey\) => fetchChildRows\(deps, childKey, library, serverId, signal, true\)/u)
  assert.match(detail, /annotationsOnly \? new URLSearchParams\(\{ itemType: 'annotation' \}\) : undefined/u)

  const graphModule = itemGraph
    .replace("import { mapWithConcurrency } from './concurrency.js';", 'const mapWithConcurrency = async (rows, _limit, visit) => Promise.all(rows.map(visit));')
    .replace("import { asRecord, asString } from './json.js';", 'const asRecord = value => value && typeof value === "object" ? value : undefined; const asString = value => typeof value === "string" ? value : undefined;')
  const { loadItemGraph } = await import(`data:text/javascript;base64,${Buffer.from(graphModule).toString('base64')}`)
  const calls = []
  const graph = await loadItemGraph({
    parentKey: 'PARENT',
    concurrency: 2,
    withAnnotations: true,
    fetchChildren: async key => {
      calls.push(`plain:${key}`)
      return [{ key: 'PDF1', data: { itemType: 'attachment' } }]
    },
    fetchAnnotationChildren: async key => {
      calls.push(`annotation:${key}`)
      return [{ key: 'ANN1', data: { itemType: 'annotation' } }]
    },
  })
  assert.deepEqual(calls, ['plain:PARENT', 'annotation:PDF1'])
  assert.equal(graph.attachmentAnnotations.length, 1)
  assert.throws(() => adaptZoteroItemGraph('export const loadItemGraph = () => null'), /Unrecognized/u)
  assert.throws(() => adaptZoteroDetail('export const children = () => null'), /Unrecognized/u)
})

test('Zotero ships compiled entries and is mounted once in every profile', async () => {
  const desktop = JSON.parse(await read('desktop/package.json'))
  assert.equal(desktop.dependencies['dsh-zotero'], '0.8.4')
  assert.equal(desktop.dependencies['@fylar/dsh-fylar-office-editor'], undefined)
  const manifest = JSON.parse(await read('desktop/node_modules/dsh-zotero/package.json'))
  assert.equal(manifest.version, '0.8.4')
  assert.equal(manifest.license, 'MIT')
  for (const entry of ['lib/index.js', 'lib/client.js', 'LICENSE']) {
    assert.ok((await read(`desktop/node_modules/dsh-zotero/${entry}`)).length > 0)
  }
  for (const profile of ['development', 'preview', 'stable']) {
    const source = await read(`profiles/generated/${profile}.yml`)
    assert.equal((source.match(/'dsh-zotero'/gu) ?? []).length, 1)
    assert.match(source, /'dsh-progressive-tools'/u)
    assert.doesNotMatch(source, /fylar/iu)
  }
  const patch = await read('desktop/build/zerowall.patch.yml')
  assert.equal((patch.match(/name: 'dsh-zotero'/gu) ?? []).length, 1)
  assert.doesNotMatch(patch, /fylar/iu)
})


test('harvest saves populate the actual Zotero reducer in direct and dispatcher logs', async () => {
  const reducer = loadZoteroReducer(adaptZoteroClient(await read('desktop/node_modules/dsh-zotero/lib/client.js')))
  for (const name of ['lit_save', 'lit_review_run', 'tool_dispatch']) {
    const save = { resolvedMode: 'zotero-api', zoteroItems: [{ ref: 'zotero://user/0/item/ABCD1234?server=local', title: 'New harvest paper' }] }
    const result = { kind: 'tool', callId: 'harvest', seq: 1, time: 1, isError: false, subCalls: [],
      call: { name, argsRaw: JSON.stringify({ name: 'lit_save', arguments: {} }) },
      content: [{ type: 'text', text: JSON.stringify(name === 'lit_review_run' ? { save } : save) }] }
    const workspace = reducer.buildSourceWorkspace([result])
    assert.equal(workspace.sources.length, 1, name)
    assert.equal(workspace.sources[0].title, 'New harvest paper')
  }
})
