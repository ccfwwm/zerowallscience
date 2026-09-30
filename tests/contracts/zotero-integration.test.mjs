import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
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
  adaptZoteroManifest,
  adaptZoteroRemote,
  adaptZoteroContract,
  adaptZoteroStatusCodec,
} from '../../tools/packaging/adapt-zotero.mjs'
import { decodeZoteroAuthorizationResponse } from '../../tools/packaging/zotero-authorization.mjs'

const root = resolve(import.meta.dirname, '../..')
const read = path => readFile(resolve(root, path), 'utf8')

test('Zotero runtime manifest accepts DSH rc.2 without changing the source package', () => {
  const source = JSON.stringify({
    name: 'dsh-zotero', version: '0.11.0',
    engines: { dsh: '0.1.7-rc.2' },
    dsh: { harnessRange: '0.1.7-rc.2' },
    peerDependencies: { '@deepseek-ai/dsh-tools': '0.1.7-rc.2', react: '^18.2.0' },
  })
  const adapted = JSON.parse(adaptZoteroManifest(source))
  assert.equal(adapted.engines.dsh, '^0.1.7-rc.2 || ^0.2.0-rc.2')
  assert.equal(adapted.dsh.harnessRange, '^0.1.7-rc.2 || ^0.2.0-rc.2')
  assert.equal(adapted.peerDependencies['@deepseek-ai/dsh-tools'], '^0.1.7-rc.2 || ^0.2.0-rc.2')
  assert.equal(adapted.peerDependencies.react, '^18.2.0')
  assert.throws(() => adaptZoteroManifest(JSON.stringify({ name: 'dsh-zotero', version: '0.12.0' })), /Unexpected Zotero manifest identity/u)
  assert.equal(JSON.parse(source).engines.dsh, '0.1.7-rc.2')
})

test('live item and citation endpoints preserve provider refs and configured styles', async () => {
  let source = adaptZoteroRemote(await read('desktop/node_modules/dsh-zotero/lib/remote.js'))
  assert.equal(adaptZoteroRemote(source), source)
  const syntax = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: source, encoding: 'utf8' })
  assert.equal(syntax.status, 0, syntax.stderr)
  source = source.replace(/^import .*;$/gm, '')
  const Runtime = Function('TypertRemoteService', 'parseSupportedRef', 'ZOTERO_SETTINGS_NAMESPACE', 'ZOTERO_STATUS_SERVICE_KEY', source.replace('export class ', 'class ') + '\n; return ZoteroRuntime')(
    class { constructor(ctx) { this.ctx = ctx } }, (ref, kinds) => { assert.deepEqual(kinds, ['item']); return { ref } }, 'zotero', 'zoteroRemote')
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
  assert.match(contract, /ZOTERO_STATUS_ENDPOINT/u)
  const statusCodec = adaptZoteroStatusCodec(await read('desktop/node_modules/dsh-zotero/lib/status-codec.js'))
  assert.equal(adaptZoteroStatusCodec(statusCodec), statusCodec)
  assert.match(statusCodec, /method: 'localAuthorization'/u)
  assert.match(statusCodec, /namespace: 'zotero'[\s\S]*?method: 'localAuthorization'/u)
  assert.match(statusCodec, /zoteroStatusInvocation\(zoteroStatusCodec\)/u)
  assert.match(statusCodec, /method: 'itemDetail'/u)
  assert.match(statusCodec, /method: 'exportCitation'/u)
})

test('Zotero adapted Remote codecs satisfy the current Typert create() contract', async () => {
  const source = adaptZoteroStatusCodec(await read('desktop/node_modules/dsh-zotero/lib/status-codec.js'))
  const schema = new Proxy({}, { get: () => () => schema })
  const z = new Proxy({}, { get: () => () => schema })
  const invocations = Function('z', 'zoteroStatusInvocation', 'ZOTERO_STATUS_TYPE_SYMBOL',
    `${source.replace(/^import .*;\r?\n/gmu, '').replace(/^export /gmu, '')}\nreturn ZOTERO_INVOCATIONS;`)(
    z, result => ({ id: 'dsh-zotero#zotero/status', parameters: [], result }), 'dsh-zotero#ZoteroStatusView')
  assert.equal(invocations.length, 4)
  for (const invocation of invocations) {
    for (const codec of [invocation.result, ...invocation.parameters.map(parameter => parameter.codec)]) {
      assert.equal(codec.mode, 'strict')
      assert.equal(typeof codec.create, 'function', invocation.id)
      assert.equal(codec.schema, undefined, invocation.id)
      assert.ok(codec.create(), invocation.id)
    }
  }
})

test('local authorization reports text 404 responses without JSON parse errors', async () => {
  await assert.rejects(
    decodeZoteroAuthorizationResponse(new Response('not found', { status: 404 })),
    error => error.message === 'Zotero authorization failed (HTTP 404): not found',
  )
})

test('local authorization decodes the successful Host RPC envelope', async () => {
  const value = { authorized: true, remember: true }
  const response = new Response(JSON.stringify({ result: { ok: true, value: JSON.stringify(value) } }), { status: 200 })
  assert.deepEqual(await decodeZoteroAuthorizationResponse(response), value)
})

test('shipped Zotero reducer restores dispatcher search rows and prefers structured metadata', async () => {
  const client = adaptZoteroClient(await read('desktop/node_modules/dsh-zotero/lib/client.js'))
  assert.match(client, /function decodeZoteroAuthorizationResponse\(response\)/u)
  const reducer = loadZoteroReducer(client)
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
  assert.match(adapted, /for \(const \{ key, root \} of visibleToolRoots\(snapshot\)\) visitBlock\(root, \[key\], 1\)/u)
  assert.match(adapted, /visitBlock\(child, \[\.\.\.path, child\.callId\], depth \+ 1\)/u)
  assert.match(adapted, /function zoteroDispatch\(block\)/u)

  const visitMatch = adapted.match(/function visitVisibleZoteroCalls\(snapshot, visit\) \{[\s\S]*?\n\}/u)
  const signatureMatch = adapted.match(/function sessionSignatureOf\(snapshot\) \{[\s\S]*?\n\}/u)
  assert.ok(visitMatch)
  assert.ok(signatureMatch)
  const visitVisibleZoteroCalls = Function(
    'visibleToolRoots',
    'isZoteroRoot',
    'MAX_SUBCALL_DEPTH',
    `${visitMatch[0]}; return visitVisibleZoteroCalls;`,
  )(
    snapshot => {
      if (snapshot === undefined) return []
      return snapshot.order.flatMap(key => {
        const node = snapshot.nodes.get(key)
        return node?.kind === 'tool-call' && node.visibility === 'visible' ? [{ key, root: node.data.root }] : []
      })
    },
    block => block.name.startsWith('zotero_'),
    256,
  )
  const sessionSignatureOf = Function(
    'visitVisibleZoteroCalls',
    'isSettledTool',
    'MAX_SUBCALL_DEPTH',
    `${signatureMatch[0]}; return sessionSignatureOf;`,
  )(visitVisibleZoteroCalls, block => 'kind' in block, 256)
  const nested = { callId: 'z1', name: 'zotero_search', phase: 'running', subCalls: [] }
  const snapshot = {
    order: ['root-1'],
    nodes: new Map([['root-1', { kind: 'tool-call', visibility: 'visible', data: {
      root: { callId: 'dispatch-1', name: 'tool_dispatch', phase: 'running', subCalls: [nested] },
    } }]]),
  }
  const running = sessionSignatureOf(snapshot)
  assert.deepEqual(JSON.parse(running), { order: [{ callId: 'z1', path: ['root-1', 'z1'] }], running: [{ callId: 'z1', phase: 'running' }] })
  nested.kind = 'tool-result'
  nested.phase = 'done'
  const settled = sessionSignatureOf(snapshot)
  assert.deepEqual(JSON.parse(settled), { order: [{ callId: 'z1', path: ['root-1', 'z1'] }], running: [] })
  assert.notEqual(settled, running)
  assert.throws(() => adaptZoteroClient('function sessionSignatureOf(snapshot) { return snapshot }'), /Unrecognized/u)
})

test('Zotero 0.11 ships native annotation traversal and the adapter stays idempotent', async () => {
  const detailOriginal = await read('desktop/node_modules/dsh-zotero/lib/local/detail.js')
  const childrenWire = await read('desktop/node_modules/dsh-zotero/lib/local/children-wire.js')
  const detail = adaptZoteroDetail(detailOriginal)
  assert.equal(adaptZoteroDetail(detail), detail)
  assert.match(detail, /fetchAnnotationChildren/u)
  assert.match(detail, /loadChildRows/u)
  assert.match(childrenWire, /itemType: 'annotation'/u)
  assert.match(childrenWire, /fetchDirectChildren/u)
  assert.throws(() => adaptZoteroItemGraph('export const loadItemGraph = () => null'), /Unrecognized/u)
  assert.throws(() => adaptZoteroDetail('export const children = () => null'), /Unrecognized/u)
})

test('Zotero ships compiled entries and is mounted once in every profile', async () => {
  const desktop = JSON.parse(await read('desktop/package.json'))
  assert.equal(desktop.dependencies['dsh-zotero'], '0.11.0')
  assert.equal(desktop.dependencies['@fylar/dsh-fylar-office-editor'], undefined)
  const manifest = JSON.parse(await read('desktop/node_modules/dsh-zotero/package.json'))
  assert.equal(manifest.version, '0.11.0')
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
