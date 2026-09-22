import { XMLParser, XMLValidator } from 'fast-xml-parser'
import type { FlowCompensation, FlowDataset, FlowGate, FlowParameters } from '../shared/flow.js'

const G = 'http://www.isac-net.org/std/Gating-ML/v2.0/gating'
const T = 'http://www.isac-net.org/std/Gating-ML/v2.0/transformations'
const D = 'http://www.isac-net.org/std/Gating-ML/v2.0/datatypes'
const Z = 'https://zerowallscience.org/gating'
type Element = { name: string; attributes: Record<string, string>; children: Element[] }
const key = (uri: string, name: string): string => `{${uri}}${name}`
function tree(entries: any[], inherited: Record<string, string> = {}, depth = 0): Element[] {
  if (depth > 16) throw new Error('GatingML XML nesting exceeds 16.')
  const result: Element[] = []
  for (const entry of entries) {
    const tag = Object.keys(entry).find(name => name !== ':@')!
    if (tag === '?xml') continue
    if (tag === '#text') { if (String(entry[tag]).trim()) throw new Error('GatingML unexpected text.'); continue }
    if (!tag || tag.startsWith('?') || tag.startsWith('!')) throw new Error('GatingML processing instructions are not supported.')
    const namespaces = { ...inherited }; const attributes = entry[':@'] ?? {}
    for (const [name, value] of Object.entries(attributes)) if (name === 'xmlns') namespaces[''] = String(value); else if (name.startsWith('xmlns:')) namespaces[name.slice(6)] = String(value)
    const expand = (name: string, attribute = false): string => { const parts = name.split(':'); if (parts.length > 2) throw new Error('Invalid XML qualified name.'); const prefix = parts.length === 2 ? parts[0]! : ''; const uri = attribute && !prefix ? '' : namespaces[prefix]; if (prefix && !uri) throw new Error(`GatingML undeclared prefix ${prefix}.`); return key(uri ?? '', parts.at(-1)!) }
    const normalized: Record<string, string> = {}
    for (const [name, value] of Object.entries(attributes)) if (name !== 'xmlns' && !name.startsWith('xmlns:')) { const full = expand(name, true); if (full in normalized) throw new Error('GatingML duplicate expanded attribute.'); normalized[full] = String(value) }
    result.push({ name: expand(tag), attributes: normalized, children: tree(entry[tag], namespaces, depth + 1) })
  }
  return result
}
function allowed(element: Element, attributes: string[], children: string[]): void {
  for (const name of Object.keys(element.attributes)) if (!attributes.includes(name)) throw new Error(`Unsupported GatingML attribute ${name}.`)
  for (const child of element.children) if (!children.includes(child.name)) throw new Error(`Unsupported GatingML element ${child.name}.`)
}
function attr(element: Element, uri: string, name: string): string { const value = element.attributes[key(uri, name)]; if (value === undefined || value === '') throw new Error(`GatingML ${name} is required.`); return value }
function numeric(element: Element, uri: string, name: string): number { const value = Number(attr(element, uri, name)); if (!Number.isFinite(value)) throw new Error(`GatingML ${name} must be finite.`); return value }
function id(element: Element, uri: string): string { const value = attr(element, uri, 'id'); if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/u.test(value)) throw new Error('GatingML IDs must use the supported XML NCName subset.'); return value }

/** Explicit subset only. Unknown semantics are errors, never dropped or approximated. */
export function importGatingMl(xml: string, dataset: FlowDataset): FlowParameters & { gates: FlowGate[]; compensation?: FlowCompensation } {
  if (Buffer.byteLength(xml) > 1024 * 1024 || /<!\s*(?:DOCTYPE|ENTITY)/iu.test(xml)) throw new Error('GatingML exceeds 1 MiB or contains forbidden DTD/entities.')
  if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/u.test(xml)) throw new Error('GatingML contains an unknown or malformed entity reference.')
  const validation = XMLValidator.validate(xml); if (validation !== true) throw new Error(`Invalid GatingML XML: ${validation.err.msg}`)
  const roots = tree(new XMLParser({ preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '', parseTagValue: false, parseAttributeValue: false, trimValues: false, processEntities: true }).parse(xml))
  if (roots.length !== 1 || roots[0]!.name !== key(G, 'Gating-ML')) throw new Error('Expected the GatingML 2.0 Gating-ML root namespace.')
  const root = roots[0]!; allowed(root, [], [key(G, 'RectangleGate'), key(G, 'PolygonGate'), key(T, 'transformation'), key(T, 'spectrumMatrix')])
  if (!root.children.length || root.children.length > 160) throw new Error('GatingML must contain 1–160 gate/transform/matrix declarations.')
  const transforms = new Map<string, number>(); const matrices = new Map<string, FlowCompensation>(); const ids = new Set<string>()
  for (const element of root.children) {
    const namespace = element.name.startsWith(`{${G}}`) ? G : T; const identifier = id(element, namespace)
    if (ids.has(identifier)) throw new Error(`Duplicate GatingML id ${identifier}.`); ids.add(identifier)
    if (element.name === key(T, 'transformation')) {
      allowed(element, [key(T, 'id')], [key(T, 'fasinh')]); if (element.children.length !== 1) throw new Error('GatingML requires exactly one fasinh transform.')
      const transform = element.children[0]!; allowed(transform, ['T', 'M', 'A'].map(name => key(T, name)), [])
      const top = numeric(transform, T, 'T'); const m = numeric(transform, T, 'M'); const a = numeric(transform, T, 'A')
      if (top <= 0 || Math.abs(m * Math.LN10 - 1) > 1e-14 || a !== 0) throw new Error('Unsupported scaled fasinh: this viewer requires A=0 and M=1/ln(10), equivalent to asinh(x/cofactor).')
      const cofactor = top / Math.sinh(m * Math.LN10); if (cofactor <= 0 || cofactor > 10000) throw new Error('GatingML arcsinh cofactor exceeds supported limits.'); transforms.set(identifier, cofactor)
    } else if (element.name === key(T, 'spectrumMatrix')) {
      allowed(element, [key(T, 'id'), key(T, 'matrix-inverted-already')], [key(T, 'fluorochromes'), key(T, 'detectors'), key(T, 'spectrum')])
      if (!['false', '0', undefined].includes(element.attributes[key(T, 'matrix-inverted-already')])) throw new Error('Pre-inverted GatingML matrices are not supported.')
      const names = (name: string): string[] => { const elements = element.children.filter(child => child.name === key(T, name)); if (elements.length !== 1) throw new Error(`GatingML requires one ${name} list.`); const list = elements[0]!; allowed(list, [], [key(D, 'fcs-dimension')]); return list.children.map(child => { allowed(child, [key(D, 'name')], []); return attr(child, D, 'name') }) }
      const detectors = names('detectors'); const fluorochromes = names('fluorochromes')
      if (detectors.length < 2 || detectors.length > 128 || new Set(detectors).size !== detectors.length || JSON.stringify(detectors) !== JSON.stringify(fluorochromes)) throw new Error('Only square GatingML compensation with identical unique detector/fluorochrome names is supported.')
      const matrix = element.children.filter(child => child.name === key(T, 'spectrum')).map(row => { allowed(row, [], [key(T, 'coefficient')]); return row.children.map(item => { allowed(item, [key(T, 'value')], []); return numeric(item, T, 'value') }) })
      if (element.children[0]?.name !== key(T, 'fluorochromes') || element.children[1]?.name !== key(T, 'detectors') || element.children.slice(2).some(child => child.name !== key(T, 'spectrum'))) throw new Error('GatingML matrix children are not in schema order.')
      if (matrix.length !== detectors.length || matrix.some(row => row.length !== detectors.length)) throw new Error('GatingML matrix dimensions are inconsistent.')
      if (detectors.some(name => !dataset.channels.some(channel => channel.name === name))) throw new Error('GatingML compensation detector is absent from the FCS file.')
      matrices.set(identifier, { channels: detectors, matrix, source: `GatingML spectrumMatrix ${identifier}` })
    }
  }
  const usedTransforms = new Set<string>(); const usedCompensation = new Set<string>(); const gates: FlowGate[] = []
  for (const element of root.children.filter(child => child.name.startsWith(`{${G}}`))) {
    const polygon = element.name === key(G, 'PolygonGate'); allowed(element, [key(G, 'id'), key(G, 'parent_id'), key(Z, 'name')], [key(G, 'dimension'), ...(polygon ? [key(G, 'vertex')] : [])])
    const dimensions = element.children.filter(child => child.name === key(G, 'dimension'))
    if (element.children.slice(0, dimensions.length).some(child => child.name !== key(G, 'dimension'))) throw new Error('GatingML dimensions must precede vertices.')
    if (dimensions.length < (polygon ? 2 : 1) || dimensions.length > 2) throw new Error('Only one/two-dimensional rectangles and two-dimensional polygons are supported.')
    const dims = dimensions.map(dimension => {
      allowed(dimension, [key(G, 'compensation-ref'), key(G, 'transformation-ref'), ...(!polygon ? [key(G, 'min'), key(G, 'max')] : [])], [key(D, 'fcs-dimension')])
      if (dimension.children.length !== 1) throw new Error('GatingML dimension must reference one FCS channel.')
      const ref = dimension.children[0]!; allowed(ref, [key(D, 'name')], []); const channel = attr(ref, D, 'name')
      if (!dataset.channels.some(item => item.name === channel)) throw new Error(`GatingML channel ${channel} is absent from the FCS file.`)
      usedTransforms.add(dimension.attributes[key(G, 'transformation-ref')] ?? ''); usedCompensation.add(attr(dimension, G, 'compensation-ref'))
      return { channel, min: polygon ? 0 : numeric(dimension, G, 'min'), max: polygon ? 1 : numeric(dimension, G, 'max') }
    })
    const identifier = id(element, G); const parentId = element.attributes[key(G, 'parent_id')]
    const gate: FlowGate = { id: identifier, name: element.attributes[key(Z, 'name')] ?? identifier, boundaryMode: 'gatingml', x: dims[0]!, ...(dims[1] ? { y: dims[1] } : {}), ...(parentId ? { parentId } : {}) }
    if (polygon) {
      const vertices = element.children.filter(child => child.name === key(G, 'vertex'))
      if (vertices.length < 3 || vertices.length > 100) throw new Error('GatingML polygon requires 3–100 vertices.')
      gate.polygon = vertices.map(vertex => { allowed(vertex, [], [key(G, 'coordinate')]); if (vertex.children.length !== 2) throw new Error('GatingML vertex requires two coordinates.'); return vertex.children.map(coordinate => { allowed(coordinate, [key(D, 'value')], []); return numeric(coordinate, D, 'value') }) as [number, number] })
      for (let axis = 0; axis < 2; axis++) { const values = gate.polygon.map(point => point[axis]!); dims[axis]!.min = Math.min(...values); dims[axis]!.max = Math.max(...values) }
    }
    gates.push(gate)
  }
  if (gates.length > 128) throw new Error('At most 128 GatingML gates are supported.')
  if (usedTransforms.size > 1 || usedCompensation.size > 1) throw new Error('Mixed per-dimension GatingML transforms/compensation are unsupported; no definitions were imported.')
  const transformId = [...usedTransforms][0] ?? ''; const compensationId = [...usedCompensation][0] ?? 'uncompensated'
  if (transformId && !transforms.has(transformId)) throw new Error('GatingML transformation reference is unresolved.')
  if (!['uncompensated', 'FCS'].includes(compensationId) && !matrices.has(compensationId)) throw new Error('GatingML compensation reference is unresolved.')
  if (compensationId === 'FCS' && !dataset.compensation) throw new Error('GatingML requests FCS compensation but this file has no spillover matrix.')
  if ([...transforms.keys()].some(name => name !== transformId) || [...matrices.keys()].some(name => name !== compensationId)) throw new Error('GatingML contains unused definitions outside the supported global transform/compensation subset.')
  const ordered: FlowGate[] = []; const pending = [...gates]
  while (pending.length) { const index = pending.findIndex(gate => !gate.parentId || ordered.some(parent => parent.id === gate.parentId)); if (index < 0) throw new Error('GatingML parent reference is missing or cyclic.'); ordered.push(pending.splice(index, 1)[0]!) }
  return { gates: ordered, transform: transformId ? 'arcsinh' : 'none', cofactor: transformId ? transforms.get(transformId)! : 5, applyCompensation: compensationId !== 'uncompensated', ...(matrices.has(compensationId) ? { compensation: matrices.get(compensationId)! } : {}) }
}
