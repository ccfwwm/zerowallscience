import assert from 'node:assert/strict'
import vm from 'node:vm'

export function verifyZoteroDispatch(client, dispatcher) {
  assert.ok(client.includes('function zoteroDispatch(block)'), 'Zotero dispatch replay projection is missing')
  // 0.7 preserves target metadata on the nested call, while the parent carries
  // dispatch identity and rendered content. Verify both against shipped code.
  for (const marker of ['parent: exec.token', 'dispatchContent.set(exec.token, [...nested.content])', 'protocol: DISPATCH_PROTOCOL_V2', 'value: nested.value']) {
    assert.ok(dispatcher.includes(marker), `Progressive Tools nested dispatch contract is missing: ${marker}`)
  }
  const presentation = dispatcher.match(/presentationMeta: \(args\) => \(\{\s*protocol: 'dsh-progressive-tools\/dispatch-v1',\s*tool: args.name,?\s*\}\)/u)
  assert.ok(presentation, 'Progressive Tools dispatch presentation metadata is missing')
  const dispatchMeta = vm.runInNewContext(presentation[0].slice('presentationMeta: '.length))({ name: 'zotero_search' })
  assert.equal(dispatchMeta.tool, 'zotero_search')
  let reducer
  const entry = client.replace('return module.exports; } });', 'return {collectZoteroCalls,buildSourceWorkspace}; } });')
  vm.runInNewContext(entry, { window: { __ModuleLoader__: { load: module => { reducer = module.factory(() => ({})) } } } })
  assert.ok(reducer?.buildSourceWorkspace, 'Shipped Zotero reducer could not be loaded')
  const result = { kind: 'tool', callId: 'dispatch', seq: 1, time: 1, isError: false,
    call: { name: 'tool_dispatch', argsRaw: JSON.stringify({ name: 'zotero_search', arguments: { query: 'check' } }) },
    meta: dispatchMeta, content: [], subCalls: [{ kind: 'tool', callId: 'dispatch:dispatch', seq: 2, time: 2, isError: false,
      call: { name: 'zotero_search', argsRaw: '{"query":"check"}' }, content: [], subCalls: [],
      meta: { items: [{ ref: 'zotero://user/0/item/ABCD1234', title: 'Structured replay', creatorSummary: 'Writer', bestAttachmentRef: 'zotero://user/0/item/PDF12345' }] },
    }],
  }
  const snapshot = { order: ['dispatch'], nodes: new Map([['dispatch', { kind: 'tool-call', visibility: 'visible', data: { root: result } }]]) }
  const workspace = reducer.buildSourceWorkspace(reducer.collectZoteroCalls(snapshot))
  assert.equal(workspace.sources.length, 1, 'Nested dispatch lost Zotero metadata')
  assert.equal(workspace.sources[0].title, 'Structured replay')
  assert.equal(workspace.sources[0].bestAttachment?.ref, 'zotero://user/0/item/PDF12345')
  result.subCalls = []
  result.content = [{ type: 'text', text: 'Found 1 of 1 results:\n1. zotero://user/0/item/ABCD1234 — Text replay (2025) [journalArticle] — Writer' }]
  assert.equal(reducer.buildSourceWorkspace([result]).sources[0]?.title, 'Text replay', 'Parent-only historical dispatch replay failed')
}
