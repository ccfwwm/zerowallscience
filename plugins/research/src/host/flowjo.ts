import { XMLParser, XMLValidator } from 'fast-xml-parser'
import type { FlowDataset, FlowGate } from '../shared/flow.js'

const GATING = 'http://www.isac-net.org/std/Gating-ML/v2.0/gating'
const DATA_TYPE = 'http://www.isac-net.org/std/Gating-ML/v2.0/datatypes'
const MAX_WORKSPACE_BYTES = 64 * 1024 * 1024

type Element = { name: string; attributes: Record<string, string>; children: Element[] }
export interface FlowJoWorkspaceSample { sampleId: string; sampleName: string; sourceUri: string; groups: string[]; gates: FlowGate[] }
export interface FlowJoWorkspace { format: 'flowjo-wsp'; version: string; flowJoVersion?: string; samples: FlowJoWorkspaceSample[]; notes: string[] }

function tree(entries: any[], depth = 0): Element[] {
  if (depth > 64) throw new Error('FlowJo workspace XML nesting exceeds 64.')
  const result: Element[] = []
  for (const entry of entries) {
    const name = Object.keys(entry).find(key => key !== ':@')
    if (!name || name === '?xml') continue
    if (name === '#text') { if (String(entry[name]).trim()) throw new Error('Unexpected FlowJo workspace text node.'); continue }
    if (name.startsWith('?') || name.startsWith('!')) throw new Error('FlowJo workspace processing instructions are not supported.')
    const attributes: Record<string, string> = {}
    for (const [key, value] of Object.entries(entry[':@'] ?? {})) attributes[key] = String(value)
    result.push({ name, attributes, children: tree(entry[name] ?? [], depth + 1) })
  }
  return result
}

const child = (element: Element, name: string): Element | undefined => element.children.find(item => item.name === name)
const children = (element: Element, name: string): Element[] => element.children.filter(item => item.name === name)
const required = (element: Element, name: string, label = element.name): string => {
  const value = element.attributes[name]
  if (!value) throw new Error(`FlowJo workspace ${label} requires ${name}.`)
  return value
}
const validId = (value: string, label: string): string => {
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/u.test(value)) throw new Error(`FlowJo workspace ${label} is not a supported ID.`)
  return value
}

function parseGate(population: Element, parentId: string | undefined): FlowGate {
  const wrapper = child(population, 'Gate')
  if (!wrapper) throw new Error(`FlowJo population ${required(population, 'name')} has no Gate.`)
  const gates = wrapper.children.filter(item => item.name.startsWith('gating:'))
  if (gates.length !== 1 || wrapper.children.length !== 1) throw new Error(`FlowJo population ${required(population, 'name')} must contain one supported gate.`)
  const source = gates[0]!
  const polygon = source.name === 'gating:PolygonGate'
  if (!polygon && source.name !== 'gating:RectangleGate') throw new Error(`Unsupported FlowJo gate ${source.name}; only RectangleGate and PolygonGate are enabled.`)
  const id = validId(required(source, 'gating:id', source.name), 'gate ID')
  const dimensions = children(source, 'gating:dimension')
  if (dimensions.length < (polygon ? 2 : 1) || dimensions.length > 2 || source.children.slice(0, dimensions.length).some(item => item.name !== 'gating:dimension')) throw new Error(`FlowJo ${source.name} dimensions are outside the supported subset.`)
  const dimensionsParsed = dimensions.map(dimension => {
    const transform = dimension.attributes['gating:transformation-ref']
    if (transform) throw new Error(`FlowJo gate ${id} references transform ${transform}; this FlowJo transform is not enabled by the deterministic runner.`)
    const compensation = dimension.attributes['gating:compensation-ref']
    if (compensation && !['FCS', 'uncompensated'].includes(compensation)) throw new Error(`FlowJo gate ${id} references workspace compensation ${compensation}; workspace matrices are not enabled.`)
    const reference = child(dimension, 'data-type:fcs-dimension')
    if (!reference || dimension.children.length !== 1) throw new Error(`FlowJo gate ${id} dimension must reference one FCS channel.`)
    const channel = required(reference, 'data-type:name', 'fcs-dimension')
    if (polygon) return { channel, min: 0, max: 1 }
    const min = Number(required(dimension, 'gating:min', 'dimension')); const max = Number(required(dimension, 'gating:max', 'dimension'))
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) throw new Error(`FlowJo gate ${id} has invalid rectangle bounds.`)
    return { channel, min, max }
  })
  const gate: FlowGate = { id, name: required(population, 'name'), boundaryMode: 'gatingml', x: dimensionsParsed[0]!, ...(dimensionsParsed[1] ? { y: dimensionsParsed[1] } : {}), ...(parentId ? { parentId } : {}) }
  if (polygon) {
    const vertices = children(source, 'gating:vertex')
    if (vertices.length < 3 || vertices.length > 100 || source.children.slice(dimensions.length).some(item => item.name !== 'gating:vertex')) throw new Error(`FlowJo polygon ${id} must contain 3–100 vertices.`)
    gate.polygon = vertices.map(vertex => {
      const points = children(vertex, 'gating:coordinate')
      if (points.length !== 2 || vertex.children.length !== 2) throw new Error(`FlowJo polygon ${id} has invalid vertex coordinates.`)
      const parsed = points.map(point => Number(required(point, 'data-type:value', 'coordinate')))
      if (!parsed.every(Number.isFinite)) throw new Error(`FlowJo polygon ${id} has non-finite coordinates.`)
      return parsed as [number, number]
    })
    for (let axis = 0; axis < 2; axis++) { const values = gate.polygon.map(point => point[axis]!); dimensionsParsed[axis]!.min = Math.min(...values); dimensionsParsed[axis]!.max = Math.max(...values) }
  }
  return gate
}

function walkPopulations(container: Element | undefined, parentId: string | undefined, output: FlowGate[]): void {
  if (!container) return
  for (const population of children(container, 'Population')) {
    const gate = parseGate(population, parentId)
    if (output.some(item => item.id === gate.id)) throw new Error(`FlowJo workspace repeats gate ID ${gate.id}.`)
    output.push(gate)
    walkPopulations(child(population, 'Subpopulations'), gate.id, output)
  }
}

/** Strict FlowJo 10 import subset. Visual metadata is ignored; unimplemented analysis semantics are rejected. */
export function parseFlowJoWorkspace(xml: string): FlowJoWorkspace {
  if (Buffer.byteLength(xml) > MAX_WORKSPACE_BYTES || /<!\s*(?:DOCTYPE|ENTITY)/iu.test(xml)) throw new Error('FlowJo workspace exceeds 64 MiB or contains forbidden DTD/entities.')
  const validation = XMLValidator.validate(xml); if (validation !== true) throw new Error(`Invalid FlowJo workspace XML: ${validation.err.msg}`)
  const roots = tree(new XMLParser({ preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '', parseTagValue: false, parseAttributeValue: false, trimValues: false, processEntities: true }).parse(xml))
  if (roots.length !== 1 || roots[0]!.name !== 'Workspace') throw new Error('Expected a FlowJo Workspace root.')
  const root = roots[0]!
  if (root.attributes['xmlns:gating'] !== GATING || root.attributes['xmlns:data-type'] !== DATA_TYPE) throw new Error('FlowJo workspace must declare Gating-ML 2.0 gating and data-type namespaces.')
  const version = required(root, 'version', 'Workspace'); if (!/^2\d(?:\.\d+)?$/u.test(version)) throw new Error(`Unsupported FlowJo workspace version ${version}.`)
  const flowJoVersion = root.attributes.flowJoVersion; if (flowJoVersion && !flowJoVersion.startsWith('10.')) throw new Error(`Unsupported FlowJo application version ${flowJoVersion}.`)
  const matrices = child(root, 'Matrices'); if (!matrices) throw new Error('FlowJo workspace lacks Matrices.'); if (matrices.children.length) throw new Error('FlowJo workspace compensation matrices are not enabled; use a declared FCS spillover matrix or import a supported GatingML matrix.')
  const list = child(root, 'SampleList'); if (!list) throw new Error('FlowJo workspace lacks SampleList.')
  const memberships = new Map<string, string[]>()
  const groups = child(root, 'Groups')
  for (const node of groups ? children(groups, 'GroupNode') : []) {
    const name = required(node, 'name', 'GroupNode'); const refs = child(child(node, 'Group') ?? node, 'SampleRefs')
    for (const reference of refs ? children(refs, 'SampleRef') : []) { const sampleId = required(reference, 'sampleID', 'SampleRef'); memberships.set(sampleId, [...(memberships.get(sampleId) ?? []), name]) }
  }
  const samples: FlowJoWorkspaceSample[] = []
  for (const sample of children(list, 'Sample')) {
    const dataset = child(sample, 'DataSet'); const node = child(sample, 'SampleNode'); const transformations = child(sample, 'Transformations')
    if (!dataset || !node) throw new Error('FlowJo Sample requires DataSet and SampleNode.')
    if (transformations && transformations.children.length) throw new Error('FlowJo workspace transformations are not enabled; use the explicit GatingML arcsinh subset or select the runner transform manually.')
    const sampleId = required(dataset, 'sampleID', 'DataSet'); if (!/^[A-Za-z0-9_.-]{1,160}$/u.test(sampleId)) throw new Error('FlowJo workspace sample ID is invalid.'); if (samples.some(item => item.sampleId === sampleId)) throw new Error(`FlowJo workspace repeats sample ID ${sampleId}.`)
    const gates: FlowGate[] = []; walkPopulations(child(node, 'Subpopulations'), undefined, gates)
    if (gates.length > 128) throw new Error(`FlowJo sample ${sampleId} exceeds 128 supported gates.`)
    samples.push({ sampleId, sampleName: required(node, 'name', 'SampleNode'), sourceUri: required(dataset, 'uri', 'DataSet'), groups: memberships.get(sampleId) ?? [], gates })
  }
  if (!samples.length || samples.length > 256) throw new Error('FlowJo workspace must contain 1–256 samples.')
  return { format: 'flowjo-wsp', version, ...(flowJoVersion ? { flowJoVersion } : {}), samples, notes: ['Only per-sample FlowJo 10 RectangleGate/PolygonGate trees are imported.', 'Workspace compensation matrices and workspace transforms are rejected rather than approximated.', 'Source URI mapping is checked against registered local FCS assets before analysis.'] }
}

export function validateFlowJoSample(sample: FlowJoWorkspaceSample, dataset: FlowDataset): void {
  const channels = new Set(dataset.channels.map(channel => channel.name))
  for (const gate of sample.gates) {
    for (const dimension of [gate.x, ...(gate.y ? [gate.y] : [])]) if (!channels.has(dimension.channel)) throw new Error(`FlowJo sample ${sample.sampleId} gate ${gate.id} channel ${dimension.channel} is absent from the FCS file.`)
  }
}
