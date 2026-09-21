import { expect, it } from 'vitest'
import { analyzeSanger, parseAb1, parseScf, reviewBidirectionalSanger } from '../src/shared/sanger.js'

function u32(value: number): number[] { return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255] }
function scf3(): Uint8Array {
  const sampleCount = 8; const baseCount = 4; const sampleOffset = 128; const baseOffset = sampleOffset + sampleCount * 4
  const bytes = new Uint8Array(baseOffset + baseCount * 12); bytes.set([46, 115, 99, 102], 0)
  bytes.set(u32(sampleCount), 4); bytes.set(u32(sampleOffset), 8); bytes.set(u32(baseCount), 12); bytes.set(u32(baseOffset), 24); bytes.set([51, 46, 48, 48], 36); bytes.set(u32(1), 40)
  const desired = [[0, 10, 20, 30, 20, 10, 0, 0], [0, 0, 5, 10, 15, 10, 5, 0], [0, 2, 4, 6, 8, 6, 4, 2], [0, 0, 0, 2, 4, 6, 8, 10]]
  for (let channel = 0; channel < 4; channel++) { let previous = 0; let delta = 0; for (let index = 0; index < sampleCount; index++) { const next = desired[channel]![index]!; const nextDelta = next - previous; const second = nextDelta - delta; bytes[ sampleOffset + channel * sampleCount + index ] = second & 255; previous = next; delta = nextDelta } }
  for (let index = 0; index < baseCount; index++) bytes.set(u32(index * 2 + 1), baseOffset + index * 4)
  const probabilityStart = baseOffset + baseCount * 4
  bytes.set([255, 20, 30, 40], probabilityStart); bytes.set([0, 220, 30, 40], probabilityStart + baseCount); bytes.set([0, 20, 210, 40], probabilityStart + baseCount * 2); bytes.set([0, 20, 30, 200], probabilityStart + baseCount * 3); bytes.set([65, 67, 71, 84], probabilityStart + baseCount * 4)
  return bytes
}

it('decodes SCF 3 channels and sequence probability planes', () => {
  const trace = parseScf(scf3(), 'sha')
  expect(trace.version).toBe('3.00')
  expect(trace.channels.A).toEqual([0, 10, 20, 30, 20, 10, 0, 0])
  expect(trace.bases.map(base => base.base)).toEqual(['A', 'C', 'G', 'T'])
  expect(trace.bases[1]?.peak).toBe(3)
  expect(trace.bases[2]?.quality).toBeCloseTo(210 / 255)
})

it('uses the quality window for endpoint trimming and bounded alignment', () => {
  const trace = parseScf(scf3(), 'sha')
  const result = analyzeSanger(trace, .7, 2, 'ACGT')
  expect(result.trim.start).toBe(1)
  expect(result.trim.end).toBe(4)
  expect(result.trim.sequence).toBe('ACGT')
  expect(result.reference?.identity).toBe(1)
})

it('rejects malformed and unsupported SCF input', () => {
  expect(() => parseScf(new Uint8Array(128), 'sha')).toThrow('SCF header')
  const bytes = scf3(); bytes[36] = 52
  expect(() => parseScf(bytes, 'sha')).toThrow('Unsupported SCF version')
})

function ab1(): Uint8Array {
  const directoryOffset = 34; const entries = 8; const entrySize = 28; const dataOffset = directoryOffset + entries * entrySize
  const bytes = new Uint8Array(2048)
  const put16 = (offset: number, value: number): void => { bytes[offset] = value >>> 8; bytes[offset + 1] = value & 255 }
  const put32 = (offset: number, value: number): void => { bytes[offset] = value >>> 24; bytes[offset + 1] = value >>> 16; bytes[offset + 2] = value >>> 8; bytes[offset + 3] = value & 255 }
  bytes.set([65, 66, 73, 70], 0); put16(4, 101); bytes.set([116, 100, 105, 114], 6); put32(10, 1); put16(14, 1023); put16(16, 28); put32(18, entries); put32(22, entries * entrySize); put32(26, directoryOffset)
  const records: Array<{ tag: string; number: number; size: number; count: number; payload: number[] }> = []
  for (let channel = 0; channel < 4; channel++) records.push({ tag: 'DATA', number: 9 + channel, size: 2, count: 4, payload: [0, 10 + channel, 0, 20 + channel, 0, 30 + channel, 0, 40 + channel] })
  records.push({ tag: 'PBAS', number: 2, size: 1, count: 4, payload: [65, 67, 71, 84] })
  records.push({ tag: 'PLOC', number: 2, size: 2, count: 4, payload: [0, 0, 0, 1, 0, 2, 0, 3] })
  records.push({ tag: 'PCON', number: 2, size: 1, count: 4, payload: [20, 30, 0, 40] })
  records.push({ tag: 'FWO_', number: 1, size: 1, count: 4, payload: [71, 65, 84, 67] })
  let cursor = dataOffset
  records.forEach((record, index) => { const entry = directoryOffset + index * entrySize; bytes.set(Array.from(record.tag).map(char => char.charCodeAt(0)), entry); put32(entry + 4, record.number); put16(entry + 8, record.size === 1 ? 2 : 4); put16(entry + 10, record.size); put32(entry + 12, record.count); put32(entry + 16, record.payload.length); if (record.payload.length <= 4) bytes.set(record.payload, entry + 20); else { put32(entry + 20, cursor); bytes.set(record.payload, cursor); cursor += record.payload.length } })
  return bytes.slice(0, cursor)
}

it('decodes common ABIF DATA/PBAS/PLOC/PCON tags', () => {
  const trace = parseAb1(ab1(), 'sha-ab1')
  expect(trace.format).toBe('ab1')
  expect(trace.channels.A).toEqual([11, 21, 31, 41])
  expect(trace.channels.G).toEqual([10, 20, 30, 40])
  expect(trace.version).toBe('1.01')
  expect(trace.bases.map(base => base.base)).toEqual(['A', 'C', 'G', 'T'])
  expect(trace.bases[0]?.phred).toBe(20)
  expect(trace.bases[0]?.quality).toBeCloseTo(.99)
  expect(trace.bases[2]?.quality).toBe(0)
})

it('reviews reverse-complemented reads without hiding disagreements', () => {
  const forward = analyzeSanger(parseScf(scf3(), 'sha'), 0, 1)
  const reverse = { ...forward, trim: { ...forward.trim, sequence: 'AAAA' } }
  expect(reviewBidirectionalSanger(forward, reverse).status).toBe('discordant')
  expect(reviewBidirectionalSanger(forward, reverse).disagreements.length).toBeGreaterThan(0)
})
