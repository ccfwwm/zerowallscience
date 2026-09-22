import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { importGatingMl } from '../src/host/gating-ml.js'
import { analyzeFlow, gatingMlSubset, type FlowDataset } from '../src/shared/flow.js'

const gatingFixture = readFileSync(new URL('./fixtures/gating-ml-standard.xml', import.meta.url), 'utf8')
const dataset: FlowDataset = { format: 'fcs', version: '3.0', datatype: 'F', byteOrder: 'little', eventCount: 6, channels: ['X', 'Y'].map((name, index) => ({ index, name, shortName: name, range: 100, bits: 32 })), events: [[0, 0], [1, 1], [5, 5], [9, 1], [10, 0], [-1, 1]], keywords: {}, sourceSha256: 'test', notes: [] }

it('resolves namespaces and forward parent references, uses standard max-exclusive bounds and round trips', () => {
  const imported = importGatingMl(gatingFixture, dataset)
  expect(imported.gates.map(gate => gate.id)).toEqual(['parent', 'child'])
  const result = analyzeFlow(dataset, imported)
  expect(result.gates.map(gate => gate.count)).toEqual([4, 2])
  const exported = gatingMlSubset(result, imported.gates)
  expect(exported).toContain('gating:parent_id="parent"')
  expect(analyzeFlow(dataset, importGatingMl(exported, dataset))).toEqual(result)
})

it('round trips standard equivalent fasinh and explicit square compensation', () => {
  const compensation = { channels: ['X', 'Y'], matrix: [[1, .1], [.2, 1]], source: 'fixture' }
  const parameters = { ...importGatingMl(gatingFixture, dataset), transform: 'arcsinh' as const, cofactor: 5, applyCompensation: true }
  const withMatrix = { ...dataset, compensation }; const before = analyzeFlow(withMatrix, parameters)
  const exported = gatingMlSubset(before, parameters.gates, compensation); const imported = importGatingMl(exported, dataset)
  expect(imported.compensation?.matrix).toEqual(compensation.matrix)
  expect(imported.cofactor).toBeCloseTo(5, 14)
  expect(analyzeFlow({ ...dataset, compensation: imported.compensation }, imported).gates).toEqual(before.gates)
})

it('rejects unsupported semantics and malformed XML without dropping definitions', () => {
  const forbidden = [
    gatingFixture.replace('g:Gating-ML', 'g:GatingML'),
    gatingFixture.replaceAll('g:PolygonGate', 'g:EllipsoidGate'),
    gatingFixture.replace('g:compensation-ref="uncompensated"', 'g:compensation-ref="missing"'),
    gatingFixture.replace('g:parent_id="parent"', 'g:parent_id="child"'),
    gatingFixture.replace('g:max="10"', ''),
    gatingFixture.replace('g:id="child"', 'g:id="parent"'),
    gatingFixture.replace('g:id="child"', 'g:id="child" g:unknown="value"'),
    gatingFixture.replace('g:compensation-ref="uncompensated"', 'g:compensation-ref="FCS"'),
    gatingFixture.replace('<?xml version="1.0" encoding="UTF-8"?>', '<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///secret">]>'),
  ]
  for (const xml of forbidden) expect(() => importGatingMl(xml, dataset)).toThrow()
  const parameters = importGatingMl(gatingFixture, dataset); const result = analyzeFlow(dataset, parameters)
  expect(() => gatingMlSubset(result, parameters.gates.map(gate => ({ ...gate, boundaryMode: undefined })))).toThrow('Legacy inclusive')
  const arcsinh = gatingMlSubset({ ...result, transform: 'arcsinh' }, parameters.gates)
  expect(() => importGatingMl(arcsinh.replace(`transforms:M="${1 / Math.LN10}"`, 'transforms:M="4.5"'), dataset)).toThrow('scaled fasinh')
})
