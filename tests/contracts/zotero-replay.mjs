import vm from 'node:vm'

// Execute the shipped reducer, with unused rendering imports stubbed. The
// browser smoke separately exercises the complete renderer and Host replay.
export function loadZoteroReducer(source) {
  let reducer
  const entry = source.replace('return module.exports; } });', 'return {collectZoteroCalls,buildSourceWorkspace,sessionSignatureOf}; } });')
  vm.runInNewContext(entry, { window: { __ModuleLoader__: { load: module => { reducer = module.factory(() => ({})) } } } })
  return reducer
}

export function snapshotFromLog(rows) {
  const calls = new Map()
  const nodes = new Map()
  for (const row of rows) {
    if (row.type === 'tool/call') calls.set(row.data.callId, row.data)
    if (row.type !== 'tool/result') continue
    for (const result of row.data.message.content) {
      if (result.type !== 'tool-result') continue
      const call = calls.get(result.toolCallId)
      if (!call) continue
      nodes.set(result.toolCallId, { kind: 'tool-call', visibility: 'visible', data: { root: {
        kind: 'tool', callId: result.toolCallId, seq: row.seq, time: row.time,
        call: { name: call.name, argsRaw: call.arguments }, content: result.content,
        isError: result.isError, meta: row.data.meta, subCalls: [],
      } } })
    }
  }
  return { order: [...nodes.keys()], nodes }
}
