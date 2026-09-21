import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { ResearchStore } from '../../../store/src/index.js'
import { FlowService } from '../src/host/flow.js'
import { analyzeFlow, gatingMlSubset, parseFcs } from '../src/shared/flow.js'

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

it('counts polygon gates and exports a validated polygon subset', () => {
  const dataset = parseFcs(fcs([[10, 20], [50, 50], [100, 20]]), 'sha')
  const gate = { id: 'poly', name: 'Poly', x: { channel: 'FSC-A', min: 0, max: 100 }, y: { channel: 'SSC-A', min: 0, max: 100 }, polygon: [[0, 0], [100, 0], [0, 100]] as Array<[number, number]> }
  const result = analyzeFlow(dataset, { gates: [gate] })
  expect(result.gates[0]?.count).toBe(1)
  expect(gatingMlSubset(result, [gate])).toContain('<PolygonGate')
})

it('opens, analyzes and exports a traceable FCS result', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flow-service-')); const projectRoot = join(root, 'project'); await mkdir(projectRoot); const store = new ResearchStore(join(root, 'store.sqlite')); const service = new FlowService(store); cleanup.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  const project = store.createProject({ name: 'Flow', rootPath: projectRoot }); const path = join(projectRoot, 'sample.fcs'); await writeFile(path, fcs([[10, 20], [50, 50]])); const asset = store.createDataAsset({ projectId: project.id, name: 'Sample', uri: pathToFileURL(path).href, location: 'local', mediaType: 'application/octet-stream' })
  const opened = await service.execute(project, { sessionId: 's', action: 'open', assetId: asset.id }); const viewer = opened.viewer!
  const exported = await service.execute(project, { sessionId: 's', action: 'export', viewerId: viewer.id, expectedVersion: viewer.version, gates: [{ id: 'all', name: 'All', x: { channel: 'FSC-A', min: 0, max: 100 } }] }); expect(exported.artifact?.metadata.runner).toBe('zerowall-flow/7.0.0-1'); expect(JSON.parse(await readFile(fileURLToPath(exported.artifact!.uri), 'utf8')).format).toBe('zerowall-flow-result')
  await writeFile(path, Buffer.concat([Buffer.from(fcs([[10, 20], [50, 50]])), Buffer.from([1])]))
  await expect(service.execute(project, { sessionId: 's', action: 'analyze', viewerId: viewer.id, expectedVersion: exported.viewer!.version })).rejects.toThrow('source changed')
})
