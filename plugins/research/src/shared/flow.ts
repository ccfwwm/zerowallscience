export interface FlowChannel {
  index: number
  name: string
  shortName: string
  range: number
  bits: number
  unit?: string
  amplification?: [number, number]
}

export interface FlowCompensation {
  channels: string[]
  matrix: number[][]
  source: string
}

export interface FlowDataset {
  format: 'fcs'
  version: string
  datatype: 'I' | 'F' | 'D'
  byteOrder: 'little' | 'big'
  eventCount: number
  channels: FlowChannel[]
  events: number[][]
  keywords: Record<string, string>
  compensation?: FlowCompensation
  sourceSha256: string
  /** Host responses contain a bounded raw preview, never the full event matrix. */
  eventsComplete?: boolean
  notes: string[]
}

export interface FlowGate {
  id: string
  name: string
  parentId?: string
  x: { channel: string; min: number; max: number }
  y?: { channel: string; min: number; max: number }
  polygon?: Array<[number, number]>
  /** Missing in older projects: preserve the original inclusive/tolerant rules. */
  boundaryMode?: 'gatingml' | 'legacy-inclusive'
}

export interface FlowGateResult {
  id: string
  name: string
  parentId?: string
  count: number
  fractionOfParent: number
  fractionOfTotal: number
  statistics: Record<string, { mean: number | null; median: number | null }>
}

export interface FlowAnalysis {
  transform: 'none' | 'arcsinh'
  cofactor: number
  compensationApplied: boolean
  gates: FlowGateResult[]
  eventCount: number
  preview: Array<Record<string, number>>
  statistics: Record<string, { mean: number | null; median: number | null }>
  statisticsScale: 'raw' | 'compensated' | 'arcsinh-raw' | 'arcsinh-compensated'
  notes: string[]
}

const MAX_EVENTS = 2_000_000
const MAX_CHANNELS = 128
const number = (value: string | undefined, name: string): number => {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`FCS ${name} is invalid.`)
  return parsed
}
const field = (bytes: Uint8Array, offset: number, length: number): number => {
  const value = new TextDecoder('ascii').decode(bytes.slice(offset, offset + length)).trim()
  return number(value, 'segment offset')
}
const keyOf = (key: string): string => key.trim().replace(/^\$/u, '').toUpperCase()

function parseText(bytes: Uint8Array, start: number, end: number): Record<string, string> {
  if (start > end || end - start + 1 > 64 * 1024 * 1024) throw new Error('FCS TEXT segment is outside the file or too large.')
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(start, end + 1))
  if (!text.length) throw new Error('FCS TEXT segment is empty.')
  const delimiter = text[0]!
  const fields: string[] = []; let current = ''; let escaped = false
  for (let index = 1; index < text.length; index++) {
    const character = text[index]!
    if (escaped) { current += character; escaped = false; continue }
    if (character === delimiter) {
      if (text[index + 1] === delimiter) { current += delimiter; index++; continue }
      fields.push(current); current = ''; continue
    }
    current += character
  }
  fields.push(current)
  if (fields.at(-1) === '') fields.pop()
  if (fields.length < 2 || fields.length % 2 !== 0) throw new Error('FCS TEXT key/value fields are malformed.')
  const keywords: Record<string, string> = {}
  for (let index = 0; index < fields.length; index += 2) {
    const key = keyOf(fields[index]!)
    if (!key) continue
    keywords[key] = fields[index + 1] ?? ''
  }
  return keywords
}

function parseCompensation(value: string | undefined, channels: FlowChannel[]): FlowCompensation | undefined {
  if (!value) return undefined
  const parts = value.split(',').map(item => item.trim())
  const count = Number(parts[0])
  if (!Number.isSafeInteger(count) || count < 1 || count > channels.length || parts.length !== 1 + count + count * count) throw new Error('FCS spillover matrix is malformed.')
  const names = parts.slice(1, 1 + count)
  const matrix: number[][] = []
  let cursor = 1 + count
  for (let row = 0; row < count; row++) {
    const line: number[] = []
    for (let column = 0; column < count; column++) {
      const entry = Number(parts[cursor++])
      if (!Number.isFinite(entry)) throw new Error('FCS spillover matrix contains a non-finite value.')
      line.push(entry)
    }
    matrix.push(line)
  }
  if (matrix.some((row, rowIndex) => Math.abs(row[rowIndex]! - 1) > 100)) throw new Error('FCS spillover matrix diagonal is implausible.')
  return { channels: names, matrix, source: value }
}

function readUnsigned(bytes: Uint8Array, offset: number, size: number, little: boolean): number {
  if (size < 1 || size > 4 || offset + size > bytes.length) throw new Error('FCS integer event exceeds the data segment.')
  let value = 0
  if (little) for (let index = size - 1; index >= 0; index--) value = value * 256 + bytes[offset + index]!
  else for (let index = 0; index < size; index++) value = value * 256 + bytes[offset + index]!
  return value
}

export function parseFcsLayout(bytes: Uint8Array, sourceSha256: string, fileSize = bytes.length): { dataset: FlowDataset; dataStart: number; bytesPerEvent: number } {
  if (bytes.length < 58 || new TextDecoder('ascii').decode(bytes.slice(0, 6)) !== 'FCS3.0') throw new Error('Only FCS3.0 files are supported by the bounded viewer.')
  const textStart = field(bytes, 10, 8); const textEnd = field(bytes, 18, 8); let dataStart = field(bytes, 26, 8); let dataEnd = field(bytes, 34, 8)
  if (textStart > textEnd || dataStart > dataEnd) throw new Error('FCS segment offsets are invalid.')
  if (textEnd >= bytes.length) throw new Error('FCS TEXT segment exceeds supplied header bytes.')
  const keywords = parseText(bytes, textStart, textEnd)
  if (!dataStart) dataStart = number(keywords.BEGINDATA, 'BEGINDATA')
  if (!dataEnd) dataEnd = number(keywords.ENDDATA, 'ENDDATA')
  const eventCount = number(keywords.TOT, 'event count'); const parameterCount = number(keywords.PAR, 'parameter count')
  if (!eventCount || eventCount > MAX_EVENTS || !parameterCount || parameterCount > MAX_CHANNELS) throw new Error('FCS event or channel count is outside the bounded viewer limit.')
  const datatype = (keywords.DATATYPE ?? '').toUpperCase() as FlowDataset['datatype']; if (!['I', 'F', 'D'].includes(datatype)) throw new Error('FCS DATATYPE must be I, F or D.')
  if (datatype === 'D') throw new Error('FCS double-precision data is not enabled in the bounded viewer.')
  const byteOrder = keywords.BYTEORD === '4,3,2,1' ? 'big' : keywords.BYTEORD === '1,2,3,4' ? 'little' : (() => { throw new Error('FCS BYTEORD must be 1,2,3,4 or 4,3,2,1.') })()
  const channels: FlowChannel[] = []
  let bytesPerEvent = 0
  for (let index = 1; index <= parameterCount; index++) {
    const bits = number(keywords[`P${index}B`], `P${index}B`); if (![8, 16, 24, 32, 64].includes(bits)) throw new Error(`FCS P${index}B is unsupported.`)
    if (datatype === 'I' && bits > 32) throw new Error('FCS integer parameters above 32 bits are not enabled.')
    if (datatype === 'F' && bits !== 32) throw new Error('FCS floating-point parameters must be 32-bit.')
    const range = Number(keywords[`P${index}R`] ?? '0'); if (!Number.isFinite(range) || range <= 0) throw new Error(`FCS P${index}R is invalid.`)
    const amp = keywords[`P${index}E`]?.split(',').map(Number)
    channels.push({ index: index - 1, name: keywords[`P${index}N`] || `P${index}`, shortName: keywords[`P${index}S`] || keywords[`P${index}N`] || `P${index}`, range, bits, ...(keywords[`P${index}U`] ? { unit: keywords[`P${index}U`] } : {}), ...(amp && amp.length === 2 && amp.every(Number.isFinite) ? { amplification: [amp[0]!, amp[1]!] as [number, number] } : {}) })
    bytesPerEvent += bits / 8
  }
  const dataBytes = dataEnd - dataStart + 1; if (dataBytes < eventCount * bytesPerEvent) throw new Error('FCS DATA segment is shorter than the declared events.')
  if (dataStart <= textEnd || dataEnd >= fileSize) throw new Error('FCS DATA segment lies outside the file or overlaps TEXT.')
  const compensation = parseCompensation(keywords.SPILLOVER, channels)
  return { dataStart, bytesPerEvent, dataset: { format: 'fcs', version: '3.0', datatype, byteOrder, eventCount, channels, events: [], keywords, ...(compensation ? { compensation } : {}), sourceSha256, notes: ['FCS TEXT escaping uses doubled delimiters.', 'Raw events remain unchanged; compensation and transformation are explicit analysis parameters.', 'The viewer does not infer biological gates or statistical significance.'] } }
}

export function decodeFcsBlock(bytes: Uint8Array, dataset: FlowDataset, count: number): number[][] {
  const little = dataset.byteOrder === 'little'; const events: number[][] = []; let cursor = 0
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let event = 0; event < count; event++) {
    const row: number[] = []
    for (const channel of dataset.channels) {
      const size = channel.bits / 8
      const value = dataset.datatype === 'F' ? view.getFloat32(cursor, little) : readUnsigned(bytes, cursor, size, little)
      if (!Number.isFinite(value)) throw new Error('FCS event contains a non-finite value.')
      row.push(value); cursor += size
    }
    events.push(row)
  }
  return events
}

export function parseFcs(bytes: Uint8Array, sourceSha256: string): FlowDataset {
  const layout = parseFcsLayout(bytes, sourceSha256)
  layout.dataset.events = decodeFcsBlock(bytes.subarray(layout.dataStart), layout.dataset, layout.dataset.eventCount)
  return layout.dataset
}

function invert(matrix: number[][]): number[][] {
  const size = matrix.length; const augmented = matrix.map((row, rowIndex) => [...row, ...Array.from({ length: size }, (_, index) => index === rowIndex ? 1 : 0)])
  for (let pivot = 0; pivot < size; pivot++) {
    let selected = pivot; for (let row = pivot + 1; row < size; row++) if (Math.abs(augmented[row]![pivot]!) > Math.abs(augmented[selected]![pivot]!)) selected = row
    if (Math.abs(augmented[selected]![pivot]!) < 1e-12) throw new Error('FCS compensation matrix is singular.')
    ;[augmented[pivot], augmented[selected]] = [augmented[selected]!, augmented[pivot]!]
    const divisor = augmented[pivot]![pivot]!; for (let column = 0; column < size * 2; column++) augmented[pivot]![column]! /= divisor
    for (let row = 0; row < size; row++) if (row !== pivot) { const factor = augmented[row]![pivot]!; for (let column = 0; column < size * 2; column++) augmented[row]![column]! -= factor * augmented[pivot]![column]! }
  }
  return augmented.map(row => row.slice(size))
}

function compensate(events: number[][], dataset: FlowDataset): number[][] {
  const matrix = dataset.compensation; if (!matrix) return events.map(row => [...row])
  const inverse = invert(matrix.matrix); const indexes = matrix.channels.map(name => dataset.channels.findIndex(channel => channel.name === name || channel.shortName === name)); if (indexes.some(index => index < 0)) throw new Error('FCS spillover channel is not present in the parameters.')
  // FCS spillover rows describe source -> detector. Events are row vectors:
  // observed = corrected * spillover, hence corrected = observed * inverse.
  return events.map(row => { const copy = [...row]; const observed = indexes.map(index => row[index]!); const corrected = inverse.map((_, column) => observed.reduce((sum, value, index) => sum + value * inverse[index]![column]!, 0)); indexes.forEach((index, cursor) => { copy[index] = corrected[cursor]! }); return copy })
}

function statistics(events: number[][], channels: FlowChannel[], selected?: Uint8Array): Record<string, { mean: number | null; median: number | null }> {
  const count = selected ? selected.reduce((sum, value) => sum + value, 0) : events.length
  return Object.fromEntries(channels.map((channel, column) => {
    if (!count) return [channel.name, { mean: null, median: null }]
    const values = new Float64Array(count); let cursor = 0; let sum = 0; let correction = 0
    for (let row = 0; row < events.length; row++) if (!selected || selected[row]) {
      const value = events[row]![column]!; values[cursor++] = value
      const adjusted = value - correction; const next = sum + adjusted; correction = (next - sum) - adjusted; sum = next
    }
    values.sort(); const middle = Math.floor(count / 2)
    return [channel.name, { mean: sum / count, median: count % 2 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2 }]
  }))
}

export type FlowParameters = { transform?: 'none' | 'arcsinh'; cofactor?: number; applyCompensation?: boolean; gates?: FlowGate[]; previewLimit?: number }

export function transformFlowEvents(dataset: FlowDataset, input: FlowParameters): number[][] {
  const transform = input.transform ?? 'none'; const cofactor = input.cofactor ?? 5
  if (!['none', 'arcsinh'].includes(transform)) throw new Error('Unknown flow transform.')
  if (transform === 'arcsinh' && (!Number.isFinite(cofactor) || cofactor <= 0 || cofactor > 10000)) throw new Error('Arcsinh cofactor must be between 0 and 10,000.')
  const events = input.applyCompensation ? compensate(dataset.events, dataset) : dataset.events.map(row => [...row])
  if (transform === 'arcsinh') for (const row of events) for (let index = 0; index < row.length; index++) row[index] = Math.asinh(row[index]! / cofactor)
  return events
}

export function flowGateMembership(dataset: FlowDataset, transformed: number[][], gates: FlowGate[]): Map<string, Uint8Array> {
  if (gates.length > 128) throw new Error('At most 128 flow gates are supported per analysis.')
  const counts = new Map<string, number>(); const membership = new Map<string, Uint8Array>()
  const indexOf = (name: string): number => { const index = dataset.channels.findIndex(channel => channel.name === name || channel.shortName === name); if (index < 0) throw new Error(`Flow channel not found: ${name}`); return index }
  // Inclusive bounds tolerate round-off from matrix solve/asinh (8 double ulps).
  const inRange = (value: number, min: number, max: number): boolean => { const epsilon = 8 * Number.EPSILON * Math.max(1, Math.abs(value), Math.abs(min), Math.abs(max)); return value >= min - epsilon && value <= max + epsilon }
  const insidePolygon = (x: number, y: number, polygon: Array<[number, number]>): boolean => { let inside = false; for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) { const [xi, yi] = polygon[i]!; const [xj, yj] = polygon[j]!; const intersect = ((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / ((yj - yi) || Number.EPSILON) + xi; if (intersect) inside = !inside } return inside }
  const standardRegion = (row: number[], gate: FlowGate, xIndex: number, yIndex: number): boolean => {
    const x = row[xIndex]!; const y = row[yIndex]!
    if (!gate.polygon) return x >= gate.x.min && x < gate.x.max && (!gate.y || (y >= gate.y.min && y < gate.y.max))
    let winding = 0
    for (let index = 0; index < gate.polygon.length; index++) { const a = gate.polygon[index]!; const b = gate.polygon[(index + 1) % gate.polygon.length]!; const cross = (b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1]); if (a[1] <= y && b[1] > y && cross > 0) winding++; else if (a[1] > y && b[1] <= y && cross < 0) winding-- }
    return winding !== 0
  }
  for (const gate of gates) { if (!gate.id.trim() || !gate.name.trim() || membership.has(gate.id)) throw new Error('Flow gate ids must be unique and nonempty.'); const xIndex = indexOf(gate.x.channel); if (!Number.isFinite(gate.x.min) || !Number.isFinite(gate.x.max) || gate.x.min >= gate.x.max) throw new Error('Flow gate X bounds are invalid.'); const yIndex = gate.y ? indexOf(gate.y.channel) : -1; if (gate.y && (!Number.isFinite(gate.y.min) || !Number.isFinite(gate.y.max) || gate.y.min >= gate.y.max)) throw new Error('Flow gate Y bounds are invalid.'); if (gate.polygon && !gate.y) throw new Error('Polygon gates require both X and Y dimensions.'); if (gate.polygon && (gate.polygon.length < 3 || gate.polygon.length > 100 || gate.polygon.some(point => point.length !== 2 || !point.every(Number.isFinite)))) throw new Error('Flow polygon gates require 3–100 finite points.'); if (gate.boundaryMode && !['gatingml', 'legacy-inclusive'].includes(gate.boundaryMode)) throw new Error('Unsupported flow gate boundary mode.'); if (gate.boundaryMode === 'gatingml' && gate.polygon?.some(point => point[0] < gate.x.min || point[0] > gate.x.max || point[1] < gate.y!.min || point[1] > gate.y!.max)) throw new Error('GatingML polygon bounds cannot clip its vertices.'); const parentCount = gate.parentId ? counts.get(gate.parentId) : transformed.length; const parentMembership = gate.parentId ? membership.get(gate.parentId) : undefined; if (parentCount === undefined || (gate.parentId && !parentMembership)) throw new Error(`Flow gate parent is not defined before ${gate.id}.`); const selected = Uint8Array.from(transformed, (row, index) => Number(Boolean((parentMembership?.[index] ?? true) && (gate.boundaryMode === 'gatingml' ? standardRegion(row, gate, xIndex, yIndex) : inRange(row[xIndex]!, gate.x.min, gate.x.max) && (!gate.y || (inRange(row[yIndex]!, gate.y.min, gate.y.max)) && (!gate.polygon || insidePolygon(row[xIndex]!, row[yIndex]!, gate.polygon))))))); const count = selected.reduce((total, value) => total + (value ? 1 : 0), 0); membership.set(gate.id, selected); counts.set(gate.id, count); }
  return membership
}

export function analyzeFlow(dataset: FlowDataset, input: FlowParameters): FlowAnalysis {
  if (dataset.eventsComplete === false || dataset.events.length !== dataset.eventCount) throw new Error('Flow analysis requires the complete Host event matrix, not a preview.')
  const transformed = transformFlowEvents(dataset, input); const gates = input.gates ?? []
  const membership = flowGateMembership(dataset, transformed, gates)
  const counts = new Map([...membership].map(([id, values]) => [id, values.reduce((sum, value) => sum + value, 0)]))
  const results = gates.map(gate => { const count = counts.get(gate.id)!; const parent = gate.parentId ? counts.get(gate.parentId)! : dataset.eventCount; return { id: gate.id, name: gate.name, ...(gate.parentId ? { parentId: gate.parentId } : {}), count, fractionOfTotal: count / dataset.eventCount, fractionOfParent: parent ? count / parent : 0, statistics: statistics(transformed, dataset.channels, membership.get(gate.id)) } })
  const previewLimit = input.previewLimit ?? 5000; if (!Number.isSafeInteger(previewLimit) || previewLimit < 0 || previewLimit > 10000) throw new Error('Flow previewLimit must be 0–10,000.')
  const transform = input.transform ?? 'none'; const cofactor = input.cofactor ?? 5
  const preview = transformed.slice(0, previewLimit).map(row => Object.fromEntries(dataset.channels.map((channel, index) => [channel.name, row[index]!])));
  return { transform, cofactor, compensationApplied: Boolean(input.applyCompensation && dataset.compensation), gates: results, eventCount: dataset.eventCount, preview, statistics: statistics(transformed, dataset.channels), statisticsScale: transform === 'arcsinh' ? input.applyCompensation && dataset.compensation ? 'arcsinh-compensated' : 'arcsinh-raw' : input.applyCompensation && dataset.compensation ? 'compensated' : 'raw', notes: ['Gate counts are deterministic rectangle or polygon counts over the declared event matrix.', 'GatingML rectangles use min-inclusive/max-exclusive bounds and polygons use nonzero winding; legacy gates retain inclusive bounds with an 8-double-ulp allowance.', 'MFI is ambiguous: arithmetic mean and median are reported separately for every channel on the declared analysis scale; empty populations return null.', 'GatingML export is a validated subset; instrument-specific semantics are not inferred.', ...(input.applyCompensation && !dataset.compensation ? ['Compensation was requested but no spillover matrix was present; raw values were retained.'] : [])] }
}

export { gatingMlSubset } from './gating-ml.js'
