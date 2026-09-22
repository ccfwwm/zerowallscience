import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { ResearchStore } from '../../../store/src/index.js'
import { FlowService } from '../src/host/flow.js'
import { analyzeFlowStream, FcsReader, FLOW_STREAM_LIMITS } from '../src/host/flow-reader.js'
import { analyzeFlow, gatingMlSubset, parseFcs } from '../src/shared/flow.js'
import { parseFlowJoWorkspace } from '../src/host/flowjo.js'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose() })
function padded(value: number): string { return String(value).padStart(8, ' ') }
function fcs(events: number[][]): Uint8Array {
  const text = `|$TOT|${events.length}|$PAR|2|$DATATYPE|F|$BYTEORD|1,2,3,4|$P1N|FSC-A|$P1S|FSC-A|$P1B|32|$P1R|1024|$P2N|SSC-A|$P2S|SSC-A|$P2B|32|$P2R|1024|$SPILLOVER|2,FSC-A,SSC-A,1,0.1,0.2,1|`
  const textStart = 58; const textEnd = textStart + Buffer.byteLength(text) - 1; const dataStart = textEnd + 1; const dataEnd = dataStart + events.length * 8 - 1; const bytes = Buffer.alloc(dataEnd + 1); bytes.write('FCS3.0', 0, 'ascii'); bytes.write(padded(textStart), 10, 'ascii'); bytes.write(padded(textEnd), 18, 'ascii'); bytes.write(padded(dataStart), 26, 'ascii'); bytes.write(padded(dataEnd), 34, 'ascii'); bytes.write(text, textStart, 'utf8'); let offset = dataStart; for (const row of events) for (const value of row) { bytes.writeFloatLE(value, offset); offset += 4 } return bytes
}

it('parses FCS text/data segments and applies explicit compensation and ordered gates', () => {
  const dataset = parseFcs(fcs([[10, 20], [50, 50], [100, 20]]), 'sha')
  expect(dataset.eventCount).toBe(3); expect(dataset.channels.map(channel => channel.name)).toEqual(['FSC-A', 'SSC-A'])
  const result = analyzeFlow(dataset, { applyCompensation: true, transform: 'none', gates: [{ id: 'cells', name: 'Cells', x: { channel: 'FSC-A', min: 0, max: 60 } }, { id: 'singlets', name: 'Singlets', parentId: 'cells', x: { channel: 'FSC-A', min: 20, max: 60 }, y: { channel: 'SSC-A', min: 0, max: 60 } }] })
  expect(result.compensationApplied).toBe(true); expect(result.gates).toMatchObject([{ id: 'cells', count: 2, fractionOfTotal: 2 / 3 }, { id: 'singlets', count: 1, fractionOfParent: .5 }])
})

it('rejects malformed bounded files and singular compensation', () => {
  expect(() => parseFcs(new Uint8Array(58), 'sha')).toThrow('FCS3.0')
  const dataset = parseFcs(fcs([[1, 2]]), 'sha'); dataset.compensation = { ...dataset.compensation!, matrix: [[1, 1], [1, 1]] }
  expect(() => analyzeFlow(dataset, { applyCompensation: true })).toThrow('singular')
})

it('uses the FCS row-source spillover convention and reports mean/median on the explicit scale', () => {
  // True fluorescence [10,20] and [30,40], measured=true * [[1,.1],[.2,1]].
  const dataset = parseFcs(fcs([[14, 21], [38, 43]]), 'sha')
  const result = analyzeFlow(dataset, { applyCompensation: true, gates: [{ id: 'all', name: 'All', x: { channel: 'FSC-A', min: 10, max: 30 } }, { id: 'empty', name: 'Empty', parentId: 'all', x: { channel: 'FSC-A', min: 50, max: 60 } }] })
  expect(result.preview[0]?.['FSC-A']).toBeCloseTo(10, 12); expect(result.preview[0]?.['SSC-A']).toBeCloseTo(20, 12)
  expect(result.statisticsScale).toBe('compensated')
  expect(result.statistics['FSC-A']?.mean).toBeCloseTo(20, 12)
  expect(result.statistics['SSC-A']?.median).toBeCloseTo(30, 12)
  expect(result.gates[0]?.count).toBe(2)
  expect(result.gates[1]?.statistics['FSC-A']).toEqual({ mean: null, median: null })
  expect(() => analyzeFlow({ ...dataset, events: [dataset.events[0]!], eventsComplete: false }, {})).toThrow('complete Host')
  expect(() => analyzeFlow(dataset, { gates: [{ id: 'poly', name: 'Poly', x: { channel: 'FSC-A', min: 0, max: 100 }, polygon: [[0,0],[100,0],[0,100]] }] })).toThrow('both X and Y')
})

it('bounds RPC event data while analyzing all events and restores gates when exporting', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flow-bounded-')); const store = new ResearchStore(join(root, 'store.sqlite')); cleanup.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  const project = store.createProject({ name: 'Bounded flow', rootPath: root }); const path = join(root, 'many.fcs'); await writeFile(path, fcs(Array.from({ length: 6000 }, (_, index) => [index, 1])))
  const asset = store.createDataAsset({ projectId: project.id, name: 'Many', uri: pathToFileURL(path).href, location: 'local', mediaType: 'application/octet-stream' }); const service = new FlowService(store)
  const opened = await service.execute(project, { sessionId: 's', action: 'open', assetId: asset.id })
  expect(opened.dataset?.eventCount).toBe(6000); expect(opened.dataset?.events).toHaveLength(5000); expect(opened.dataset?.eventsComplete).toBe(false)
  const analyzed = await service.execute(project, { sessionId: 's', action: 'analyze', viewerId: opened.viewer!.id, expectedVersion: opened.viewer!.version, gates: [{ id: 'tail', name: 'Tail', boundaryMode: 'gatingml', x: { channel: 'FSC-A', min: 5000, max: 6000 } }] })
  expect(analyzed.analysis?.gates[0]?.count).toBe(1000)
  const exported = await service.execute(project, { sessionId: 's', action: 'export', viewerId: analyzed.viewer!.id, expectedVersion: analyzed.viewer!.version })
  expect(await readFile(fileURLToPath(String(exported.artifact!.metadata.gatingMlUri)), 'utf8')).toContain('id="tail"')
})

it('counts polygon gates and exports a validated polygon subset', () => {
  const dataset = parseFcs(fcs([[10, 20], [50, 50], [100, 20]]), 'sha')
  const gate = { id: 'poly', name: 'Poly', boundaryMode: 'gatingml' as const, x: { channel: 'FSC-A', min: 0, max: 100 }, y: { channel: 'SSC-A', min: 0, max: 100 }, polygon: [[0, 0], [100, 0], [0, 100]] as Array<[number, number]> }
  const result = analyzeFlow(dataset, { gates: [gate] })
  expect(result.gates[0]?.count).toBe(1)
  expect(gatingMlSubset(result, [gate])).toContain('<gating:PolygonGate')
})

it('opens, analyzes and exports a traceable FCS result', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flow-service-')); const projectRoot = join(root, 'project'); await mkdir(projectRoot); const store = new ResearchStore(join(root, 'store.sqlite')); const service = new FlowService(store); cleanup.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  const project = store.createProject({ name: 'Flow', rootPath: projectRoot }); const path = join(projectRoot, 'sample.fcs'); await writeFile(path, fcs([[10, 20], [50, 50]])); const asset = store.createDataAsset({ projectId: project.id, name: 'Sample', uri: pathToFileURL(path).href, location: 'local', mediaType: 'application/octet-stream' })
  const opened = await service.execute(project, { sessionId: 's', action: 'open', assetId: asset.id }); const viewer = opened.viewer!
  const exported = await service.execute(project, { sessionId: 's', action: 'export', viewerId: viewer.id, expectedVersion: viewer.version, gates: [{ id: 'all', name: 'All', boundaryMode: 'gatingml', x: { channel: 'FSC-A', min: 0, max: 100 } }] }); expect(exported.artifact?.metadata.runner).toBe('zerowall-flow/7.0.0-6'); expect(JSON.parse(await readFile(fileURLToPath(exported.artifact!.uri), 'utf8')).format).toBe('zerowall-flow-result')
  await writeFile(path, Buffer.concat([Buffer.from(fcs([[10, 20], [50, 50]])), Buffer.from([1])]))
  await expect(service.execute(project, { sessionId: 's', action: 'analyze', viewerId: viewer.id, expectedVersion: exported.viewer!.version })).rejects.toThrow('source changed')
})

it('streams across event and sorted-run boundaries with exact odd/even hierarchical medians', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flow-stream-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'many.fcs'); const count = 131074
  await writeFile(path, fcs(Array.from({ length: count }, (_, index) => [index, count - index])))
  const reader = await FcsReader.open(path)
  try {
    let blocks = 0; let rows = 0
    for await (const block of reader.blocks()) { expect(block.length).toBeLessThanOrEqual(FLOW_STREAM_LIMITS.eventsPerBlock); blocks++; rows += block.length }
    expect(rows).toBe(count); expect(blocks).toBe(17); expect(reader.dataset.events).toHaveLength(0)
    const scratch = join(root, 'scratch'); await mkdir(scratch); await writeFile(join(scratch, 'keep.txt'), 'unrelated')
    const result = await analyzeFlowStream(reader, { previewLimit: 3, gates: [{ id: 'tail', name: 'Tail', x: { channel: 'FSC-A', min: 65536, max: count } }, { id: 'odd', name: 'Odd count', parentId: 'tail', x: { channel: 'FSC-A', min: 65537, max: count } }, { id: 'empty', name: 'Empty', x: { channel: 'FSC-A', min: -2, max: -1 } }] }, scratch)
    expect(result.statistics['FSC-A']).toEqual({ mean: (count - 1) / 2, median: (count - 1) / 2 })
    expect(result.statistics['SSC-A']).toEqual({ mean: (count + 1) / 2, median: (count + 1) / 2 })
    expect(result.gates[0]?.count).toBe(count - 65536); expect(result.gates[0]?.statistics['FSC-A']?.median).toBe((65536 + count - 1) / 2)
    expect(result.gates[1]?.statistics['FSC-A']?.median).toBe((65537 + count - 1) / 2)
    expect(result.gates[2]?.statistics['FSC-A']).toEqual({ mean: null, median: null })
    expect(result.preview).toHaveLength(3); expect(await readdir(scratch)).toEqual(['keep.txt'])
  } finally { await reader.close() }
}, 30000)

it('rejects excess temporary budget before creating a task and cleans only task files on decode failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flow-failure-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'invalid.fcs'); const bytes = Buffer.from(fcs(Array.from({ length: 9000 }, (_, index) => [index, 1]))); bytes.writeFloatLE(Number.NaN, bytes.length - 4); await writeFile(path, bytes)
  const reader = await FcsReader.open(path); const scratch = join(root, 'scratch'); await mkdir(scratch); await writeFile(join(scratch, 'keep.txt'), 'unrelated')
  try {
    const originalCount = reader.dataset.eventCount; reader.dataset.eventCount = 2_000_000
    await expect(analyzeFlowStream(reader, { gates: Array.from({ length: 128 }, (_, index) => ({ id: `g${index}`, name: 'Gate', x: { channel: 'FSC-A', min: 0, max: 10 } })) }, scratch)).rejects.toThrow('2 GiB')
    reader.dataset.eventCount = originalCount
    expect(await readdir(scratch)).toEqual(['keep.txt'])
    await expect(analyzeFlowStream(reader, {}, scratch)).rejects.toThrow('non-finite')
    expect(await readdir(scratch)).toEqual(['keep.txt']); expect(await readFile(join(scratch, 'keep.txt'), 'utf8')).toBe('unrelated')
  } finally { await reader.close() }
})

it('rejects source mutation after the first event block without retaining a full matrix', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flow-mutation-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'source.fcs'); const bytes = fcs(Array.from({ length: 9000 }, (_, index) => [index, 1])); await writeFile(path, bytes)
  const reader = await FcsReader.open(path)
  try { const iterator = reader.blocks(); expect((await iterator.next()).value).toHaveLength(8192); await writeFile(path, Buffer.concat([bytes, Buffer.from([0])])); await iterator.next(); await expect(iterator.next()).rejects.toThrow('changed') }
  finally { await reader.close() }
})

it('imports a registered same-project GatingML asset, persists its source and rejects conflicts/foreign assets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flow-import-')); const store = new ResearchStore(join(root, 'store.sqlite')); cleanup.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  const project = store.createProject({ name: 'Import', rootPath: root }); const service = new FlowService(store)
  const path = join(root, 'sample.fcs'); await writeFile(path, fcs([[0, 0], [1, 1], [5, 5], [9, 1], [10, 0], [-1, 1]]))
  const asset = store.createDataAsset({ projectId: project.id, name: 'FCS', uri: pathToFileURL(path).href, location: 'local', mediaType: 'application/octet-stream' })
  const xmlPath = join(root, 'gates.xml'); const fixture = (await readFile(new URL('./fixtures/gating-ml-standard.xml', import.meta.url), 'utf8')).replaceAll('d:name="X"', 'd:name="FSC-A"').replaceAll('d:name="Y"', 'd:name="SSC-A"'); await writeFile(xmlPath, fixture)
  const gateAsset = store.createDataAsset({ projectId: project.id, name: 'GatingML', uri: pathToFileURL(xmlPath).href, location: 'local', mediaType: 'application/xml' })
  const opened = await service.execute(project, { sessionId: 's', action: 'open', assetId: asset.id }); const viewer = opened.viewer!
  const imported = await service.execute(project, { sessionId: 's', action: 'import', viewerId: viewer.id, expectedVersion: viewer.version, importAssetId: gateAsset.id })
  expect(imported.analysis?.gates.map(gate => gate.count)).toEqual([4, 2]); expect(imported.viewer?.state.gatingMlSource).toMatchObject({ assetId: gateAsset.id })
  await expect(service.execute(project, { sessionId: 's', action: 'import', viewerId: viewer.id, expectedVersion: viewer.version, importAssetId: gateAsset.id })).rejects.toThrow('revision conflict')
  const foreignRoot = join(root, 'foreign'); await mkdir(foreignRoot); const foreign = store.createProject({ name: 'Other', rootPath: foreignRoot }); const foreignAsset = store.createDataAsset({ projectId: foreign.id, name: 'Other XML', uri: pathToFileURL(xmlPath).href, location: 'local', mediaType: 'application/xml' })
  await expect(service.execute(project, { sessionId: 's', action: 'import', viewerId: viewer.id, expectedVersion: imported.viewer!.version, importAssetId: foreignAsset.id })).rejects.toThrow('not in the active project')
  await writeFile(xmlPath, fixture.replaceAll('g:PolygonGate', 'g:EllipsoidGate'))
  await expect(service.execute(project, { sessionId: 's', action: 'import', viewerId: viewer.id, expectedVersion: imported.viewer!.version, importAssetId: gateAsset.id })).rejects.toThrow('Unsupported')
  expect(store.listViewerSessions(project.id)[0]?.version).toBe(imported.viewer!.version)
  const restored = await service.execute(project, { sessionId: 's', action: 'export', viewerId: viewer.id, expectedVersion: imported.viewer!.version })
  expect(restored.analysis?.gates.map(gate => gate.count)).toEqual([4, 2])
  expect(await readFile(fileURLToPath(String(restored.artifact!.metadata.gatingMlUri)), 'utf8')).toContain('gating:parent_id="parent"')
})

function flowJoWorkspace(sampleUri = 'sample.fcs'): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Workspace xmlns:gating="http://www.isac-net.org/std/Gating-ML/v2.0/gating" xmlns:data-type="http://www.isac-net.org/std/Gating-ML/v2.0/datatypes" version="20.0" flowJoVersion="10.6.2"><Matrices/><Groups><GroupNode name="All Samples"><Group><SampleRefs><SampleRef sampleID="1"/></SampleRefs></Group></GroupNode></Groups><SampleList><Sample><DataSet uri="${sampleUri}" sampleID="1"/><Transformations/><SampleNode name="sample"><Subpopulations><Population name="Cells"><Gate><gating:RectangleGate gating:id="cells"><gating:dimension gating:min="0" gating:max="10"><data-type:fcs-dimension data-type:name="FSC-A"/></gating:dimension></gating:RectangleGate></Gate><Subpopulations><Population name="High"><Gate><gating:RectangleGate gating:id="high"><gating:dimension gating:min="5" gating:max="10"><data-type:fcs-dimension data-type:name="FSC-A"/></gating:dimension></gating:RectangleGate></Gate></Population></Subpopulations></Population></Subpopulations></SampleNode></Sample></SampleList></Workspace>`
}
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const object = value as Record<string, unknown>; return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`
}
function batchFingerprint(value: unknown): string { return createHash('sha256').update(canonicalJson(value)).digest('hex') }

it('imports the strict FlowJo rectangle subset and records a per-sample batch refusal without leaking success', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flowjo-service-')); const store = new ResearchStore(join(root, 'store.sqlite')); cleanup.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  const project = store.createProject({ name: 'FlowJo', rootPath: root }); const service = new FlowService(store)
  const fcsPath = join(root, 'sample.fcs'); await writeFile(fcsPath, fcs([[1, 1], [6, 1], [11, 1]])); const source = store.createDataAsset({ projectId: project.id, name: 'sample.fcs', uri: pathToFileURL(fcsPath).href, location: 'local', mediaType: 'application/octet-stream' })
  const workspacePath = join(root, 'gates.wsp'); await writeFile(workspacePath, flowJoWorkspace('sample')); const workspace = store.createDataAsset({ projectId: project.id, name: 'gates.wsp', uri: pathToFileURL(workspacePath).href, location: 'local', mediaType: 'application/xml' })
  expect(parseFlowJoWorkspace(await readFile(workspacePath, 'utf8')).samples[0]?.gates.map(gate => gate.id)).toEqual(['cells', 'high'])
  const opened = await service.execute(project, { sessionId: 's', action: 'open', assetId: source.id })
  const imported = await service.execute(project, { sessionId: 's', action: 'workspace_import', viewerId: opened.viewer!.id, expectedVersion: opened.viewer!.version, importAssetId: workspace.id })
  expect(imported.analysis?.gates.map(gate => gate.count)).toEqual([2, 1]); expect(imported.viewer?.state.gatingMlSource).toMatchObject({ format: 'flowjo-wsp', assetId: workspace.id, sampleId: '1' })
  const submitted = await service.execute(project, { sessionId: 's', action: 'batch_submit', requestId: 'flowjo-two-source-v1', assetIds: [source.id, 'missing'], importAssetId: workspace.id })
  expect(submitted.run?.status).toBe('submitted')
  const retry = await service.execute(project, { sessionId: 's', action: 'batch_submit', requestId: 'flowjo-two-source-v1', assetIds: [source.id, 'missing'], importAssetId: workspace.id })
  expect(retry.run?.id).toBe(submitted.run?.id)
  let batch = retry
  for (let attempt = 0; attempt < 50 && batch.run?.status !== 'succeeded'; attempt++) { await new Promise(resolve => setTimeout(resolve, 10)); batch = await service.execute(project, { sessionId: 's', action: 'batch_status', runId: submitted.run!.id }) }
  expect(batch.run?.status).toBe('succeeded'); expect(batch.batch?.items.map(item => Boolean(item.analysis))).toEqual([true, false]); expect(batch.batch?.items[1]?.error).toContain('not in the active project'); expect(batch.artifact?.runId).toBe(submitted.run?.id); expect(batch.artifact?.metadata.needsReview).toBe(true); expect(JSON.parse(await readFile(fileURLToPath(batch.artifact!.uri), 'utf8')).format).toBe('zerowall-flow-batch-result')
  const partial = JSON.parse(await readFile(fileURLToPath(String(batch.run!.logUri)), 'utf8'))
  expect(partial).toMatchObject({ format: 'zerowall-flow-batch-partial', completed: 2, total: 2 })
  await writeFile(workspacePath, flowJoWorkspace('sample').replace('<Transformations/>', '<Transformations><Unsupported/></Transformations>'))
  await expect(service.execute(project, { sessionId: 's', action: 'workspace_import', viewerId: opened.viewer!.id, expectedVersion: imported.viewer!.version, importAssetId: workspace.id })).rejects.toThrow('transformations are not enabled')
  await writeFile(fileURLToPath(batch.artifact!.uri), '{"tampered":true}\n')
  await expect(service.execute(project, { sessionId: 's', action: 'batch_status', runId: submitted.run!.id })).rejects.toThrow('checksum')
})

it('recovers a submitted batch from its snapshot and marks unowned running or cancelled batches terminal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flow-batch-recovery-')); const store = new ResearchStore(join(root, 'store.sqlite')); cleanup.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  const project = store.createProject({ name: 'Batch recovery', rootPath: root }); const service = new FlowService(store)
  const sourcePath = join(root, 'sample.fcs'); await writeFile(sourcePath, fcs([[1, 2], [4, 5]])); const source = store.createDataAsset({ projectId: project.id, name: 'sample.fcs', uri: pathToFileURL(sourcePath).href, location: 'local', mediaType: 'application/octet-stream' })
  const snapshot = { sessionId: 's', action: 'batch_submit' as const, requestId: 'recover-v1', assetIds: [source.id] }
  let recovered = store.createRun({ projectId: project.id, name: 'Recovered Flow batch', command: 'flow.batch.v1', workingDirectory: root, status: 'submitted', progress: 0, leaseOwner: 'flow-batch', inputs: [{ name: 'request_id', uri: snapshot.requestId }, { name: 'fingerprint', uri: batchFingerprint(snapshot) }] })
  const recoveryDirectory = join(root, '.zerowall', 'flow-batches', recovered.id); await mkdir(recoveryDirectory, { recursive: true }); const snapshotPath = join(recoveryDirectory, 'request.json'); await writeFile(snapshotPath, JSON.stringify(snapshot))
  recovered = store.updateRun(recovered.id, { inputs: [...recovered.inputs, { name: 'batch_request', uri: pathToFileURL(snapshotPath).href, mediaType: 'application/json' }] })
  let status = await service.execute(project, { sessionId: 's', action: 'batch_status', runId: recovered.id })
  for (let attempt = 0; attempt < 50 && status.run?.status !== 'succeeded'; attempt++) { await new Promise(resolve => setTimeout(resolve, 10)); status = await service.execute(project, { sessionId: 's', action: 'batch_status', runId: recovered.id }) }
  expect(status.run?.status).toBe('succeeded'); expect(status.batch?.items).toHaveLength(1)
  const tampered = store.createRun({ projectId: project.id, name: 'Tampered Flow batch', command: 'flow.batch.v1', workingDirectory: root, status: 'submitted', progress: 0, leaseOwner: 'flow-batch', inputs: [{ name: 'request_id', uri: snapshot.requestId }, { name: 'fingerprint', uri: '0'.repeat(64) }] })
  const tamperedDirectory = join(root, '.zerowall', 'flow-batches', tampered.id); await mkdir(tamperedDirectory, { recursive: true }); const tamperedPath = join(tamperedDirectory, 'request.json'); await writeFile(tamperedPath, JSON.stringify(snapshot)); store.updateRun(tampered.id, { inputs: [...tampered.inputs, { name: 'batch_request', uri: pathToFileURL(tamperedPath).href, mediaType: 'application/json' }] })
  const tamperedStatus = await service.execute(project, { sessionId: 's', action: 'batch_status', runId: tampered.id })
  expect(tamperedStatus.run).toMatchObject({ status: 'failed', error: expect.stringContaining('fingerprint') })
  const tooMany = { ...snapshot, requestId: 'recover-65', assetIds: Array.from({ length: 65 }, (_, index) => `${source.id}-${index}`) }
  const oversized = store.createRun({ projectId: project.id, name: 'Oversized Flow batch', command: 'flow.batch.v1', workingDirectory: root, status: 'submitted', progress: 0, leaseOwner: 'flow-batch', inputs: [{ name: 'request_id', uri: tooMany.requestId }, { name: 'fingerprint', uri: batchFingerprint(tooMany) }] })
  const oversizedDirectory = join(root, '.zerowall', 'flow-batches', oversized.id); await mkdir(oversizedDirectory, { recursive: true }); const oversizedPath = join(oversizedDirectory, 'request.json'); await writeFile(oversizedPath, JSON.stringify(tooMany)); store.updateRun(oversized.id, { inputs: [...oversized.inputs, { name: 'batch_request', uri: pathToFileURL(oversizedPath).href, mediaType: 'application/json' }] })
  const oversizedStatus = await service.execute(project, { sessionId: 's', action: 'batch_status', runId: oversized.id })
  expect(oversizedStatus.run).toMatchObject({ status: 'failed', error: expect.stringContaining('1–64') })
  const lost = store.createRun({ projectId: project.id, name: 'Lost Flow batch', command: 'flow.batch.v1', workingDirectory: root, status: 'submitted', progress: 0, leaseOwner: 'flow-batch' }); store.updateRun(lost.id, { status: 'running' })
  const lostStatus = await service.execute(project, { sessionId: 's', action: 'batch_status', runId: lost.id })
  expect(lostStatus.run).toMatchObject({ status: 'failed', error: expect.stringContaining('ownership was lost') })
  const cancellable = store.createRun({ projectId: project.id, name: 'Cancelled Flow batch', command: 'flow.batch.v1', workingDirectory: root, status: 'submitted', progress: 0, leaseOwner: 'flow-batch' })
  const cancelled = await service.execute(project, { sessionId: 's', action: 'batch_cancel', runId: cancellable.id })
  expect(cancelled.run).toMatchObject({ status: 'cancelled', error: expect.stringContaining('Cancelled by user') })
})
