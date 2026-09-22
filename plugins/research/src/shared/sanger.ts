export interface SangerBase {
  position: number
  peak: number
  calls: { A: number; C: number; G: number; T: number }
  base: 'A' | 'C' | 'G' | 'T' | 'N' | 'R' | 'Y' | 'S' | 'W' | 'K' | 'M' | 'B' | 'D' | 'H' | 'V'
  quality: number | null
  phred?: number
}

export interface SangerTrace {
  format: 'scf' | 'ab1'
  version: string
  sampleCount: number
  sampleSize: 1 | 2 | 4
  bases: SangerBase[]
  channels: { A: number[]; C: number[]; G: number[]; T: number[] }
  sourceSha256: string
  notes: string[]
}

export interface SangerAnalysis {
  trim: { threshold: number; window: number; start: number; end: number; sequence: string; qualities: Array<number | null> }
  reference?: { sequence: string; alignedRead: string; alignedReference: string; mismatches: Array<{ readPosition: number; referencePosition: number; read: string; reference: string }>; identity: number; notes: string[] }
  notes: string[]
}
export interface BidirectionalSangerReview { forward: string; reverseComplement: string; disagreements: Array<{ position: number; forward: string; reverse: string }>; status: 'concordant' | 'discordant' | 'insufficient'; notes: string[] }

const dna = ['A', 'C', 'G', 'T'] as const
const u32 = (bytes: Uint8Array, offset: number): number => (bytes[offset]! << 24 | bytes[offset + 1]! << 16 | bytes[offset + 2]! << 8 | bytes[offset + 3]!) >>> 0
const u16 = (bytes: Uint8Array, offset: number): number => bytes[offset]! << 8 | bytes[offset + 1]!

function checkedRange(offset: number, length: number, total: number): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset > total || length > total - offset) throw new Error('Trace offsets exceed the file.')
}

export function parseScf(bytes: Uint8Array, sourceSha256: string): SangerTrace {
  if (bytes.length < 128 || String.fromCharCode(...bytes.slice(0, 4)) !== '.scf') throw new Error('SCF header is missing.')
  const version = String.fromCharCode(bytes[36]!, bytes[37]!, bytes[38]!, bytes[39]!)
  const major = Number.parseInt(version[0] ?? '', 10)
  if (!Number.isInteger(major) || major < 1 || major > 3) throw new Error(`Unsupported SCF version: ${version}`)
  const sampleCount = u32(bytes, 4); const sampleOffset = u32(bytes, 8); const baseCount = u32(bytes, 12); const baseOffset = u32(bytes, 24); const sampleSize = major >= 2 ? u32(bytes, 40) : 1
  const sampleWidth = sampleSize === 1 || sampleSize === 2 ? sampleSize as 1 | 2 : 0
  if (!sampleCount || !baseCount || !sampleWidth || sampleCount > 10000000 || baseCount > 1000000) throw new Error('SCF sample, base or sample-size field is invalid.')
  checkedRange(sampleOffset, sampleCount * sampleWidth * 4, bytes.length)
  const baseBytes = baseCount * 12
  checkedRange(baseOffset, baseBytes, bytes.length)
  const channels = { A: [] as number[], C: [] as number[], G: [] as number[], T: [] as number[] }
  if (major >= 3) {
    for (let channel = 0; channel < 4; channel++) {
      const values: number[] = []
      const modulus = sampleWidth === 2 ? 0x10000 : 0x100
      for (let index = 0; index < sampleCount; index++) { const offset = sampleOffset + (channel * sampleCount + index) * sampleWidth; values.push(sampleWidth === 2 ? u16(bytes, offset) : bytes[offset]!) }
      // SCF 3 stores unsigned second differences. Reconstruction is modulo the sample width.
      let previous = 0; let delta = 0
      for (let index = 0; index < values.length; index++) { delta = (delta + values[index]!) % modulus; previous = (previous + delta) % modulus; values[index] = previous }
      channels[dna[channel]!] = values
    }
  } else {
    for (let index = 0; index < sampleCount; index++) for (let channel = 0; channel < 4; channel++) { const offset = sampleOffset + (index * 4 + channel) * sampleWidth; channels[dna[channel]!]!.push(sampleWidth === 2 ? u16(bytes, offset) : bytes[offset]!) }
  }
  const bases: SangerBase[] = []
  for (let index = 0; index < baseCount; index++) {
    let peak: number; let calls: { A: number; C: number; G: number; T: number }; let called: string | undefined
    if (major >= 3) {
      peak = u32(bytes, baseOffset + index * 4)
      const probabilityStart = baseOffset + baseCount * 4
      calls = { A: bytes[probabilityStart + index]!, C: bytes[probabilityStart + baseCount + index]!, G: bytes[probabilityStart + baseCount * 2 + index]!, T: bytes[probabilityStart + baseCount * 3 + index]! }
      called = String.fromCharCode(bytes[probabilityStart + baseCount * 4 + index]!)
    } else {
      const offset = baseOffset + index * 12
      peak = u32(bytes, offset)
      calls = { A: bytes[offset + 4]!, C: bytes[offset + 5]!, G: bytes[offset + 6]!, T: bytes[offset + 7]! }
      called = String.fromCharCode(bytes[offset + 8]!)
    }
    const ranked = dna.toSorted((a, b) => calls[b]! - calls[a]!); const max = calls[ranked[0]!]!; const normalized = called?.toUpperCase()
    const base = normalized && /^[ACGTNRYSWKMBDHV]$/u.test(normalized) ? normalized as SangerBase['base'] : max === 0 ? 'N' : ranked[0]!
    bases.push({ position: index + 1, peak, calls, base, quality: max / 255 })
  }
  return { format: 'scf', version, sampleCount, sampleSize: sampleWidth, bases, channels, sourceSha256, notes: [major >= 3 ? 'SCF 3 sample channels are decoded as A,C,G,T second differences and reconstructed before display.' : 'SCF 1/2 sample points are decoded as interleaved A,C,G,T unsigned values.', 'SCF 3 sequence data is decoded from peak indexes, probability planes and called bases.', 'Quality is the highest stored base probability divided by 255; it is not a Phred score.', 'Peak coordinates remain in the original trace sample coordinate system.'] }
}

const ascii = (bytes: Uint8Array, offset: number, length: number): string => new TextDecoder('ascii').decode(bytes.subarray(offset, offset + length))
type AbiEntry = { tag: string; number: number; elementType: number; elementSize: number; elementCount: number; dataSize: number; dataOffset: number }

/** ABIF v1: processed DATA9..12 follow FWO_1, while PCON stores Phred Q. */
export function parseAb1(bytes: Uint8Array, sourceSha256: string): SangerTrace {
  if (bytes.length < 34 || ascii(bytes, 0, 4) !== 'ABIF') throw new Error('AB1 header is missing.')
  const fileVersion = u16(bytes, 4)
  if (Math.floor(fileVersion / 100) !== 1) throw new Error('Unsupported ABIF major version.')
  const version = `${Math.floor(fileVersion / 100)}.${String(fileVersion % 100).padStart(2, '0')}`
  const root = readAbiEntry(bytes, 6)
  if (root.tag !== 'tdir' || root.number !== 1 || root.elementType !== 1023 || root.elementSize !== 28 || root.elementCount < 1 || root.elementCount > 100000 || root.dataSize < root.elementCount * 28) throw new Error('AB1 directory is invalid.')
  checkedRange(root.dataOffset, root.dataSize, bytes.length)
  const entries = new Map<string, AbiEntry>()
  for (let index = 0; index < root.elementCount; index++) {
    const entry = readAbiEntry(bytes, root.dataOffset + index * 28)
    const key = `${entry.tag}${entry.number}`
    if (entries.has(key)) throw new Error(`AB1 duplicate tag: ${key}`)
    entries.set(key, entry)
  }
  const get = (tag: string): AbiEntry => { const entry = entries.get(tag); if (!entry) throw new Error(`AB1 required tag is missing: ${tag}`); return entry }
  const data = (entry: AbiEntry, width: number, types: number[]): Uint8Array => {
    if (entry.elementSize !== width || !types.includes(entry.elementType) || entry.elementCount * width !== entry.dataSize) throw new Error(`AB1 tag geometry/type is invalid: ${entry.tag}${entry.number}`)
    checkedRange(entry.dataOffset, entry.dataSize, bytes.length)
    return bytes.subarray(entry.dataOffset, entry.dataOffset + entry.dataSize)
  }
  const orderBytes = data(get('FWO_1'), 1, [2])
  const order = ascii(orderBytes, 0, orderBytes.length)
  if (order.length !== 4 || [...order].sort().join('') !== 'ACGT') throw new Error('AB1 FWO_1 must contain each A,C,G,T exactly once.')
  const channels = { A: [] as number[], C: [] as number[], G: [] as number[], T: [] as number[] }
  let sampleCount = 0
  for (let channel = 0; channel < 4; channel++) {
    const raw = data(get(`DATA${channel + 9}`), 2, [4])
    const count = raw.length / 2
    if (!count || count > 10000000 || (channel > 0 && count !== sampleCount)) throw new Error('AB1 channel lengths are inconsistent.')
    sampleCount = count
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
    const values = new Array<number>(count)
    for (let index = 0; index < count; index++) values[index] = view.getInt16(index * 2, false)
    channels[order[channel] as typeof dna[number]] = values
  }
  // Do not combine edited calls with locations/qualities from a different tag revision.
  const revision = entries.has('PBAS2') ? 2 : 1
  const basesData = data(get(`PBAS${revision}`), 1, [2])
  const peaksData = data(get(`PLOC${revision}`), 2, [3, 4])
  const qualityEntry = entries.get(`PCON${revision}`)
  const qualityData = qualityEntry ? data(qualityEntry, 1, [1, 2]) : undefined
  const baseCount = basesData.length
  if (!baseCount || baseCount > 1000000 || peaksData.length !== baseCount * 2 || qualityData && qualityData.length !== baseCount) throw new Error('AB1 base call lengths are inconsistent.')
  const bases: SangerBase[] = []
  for (let index = 0; index < baseCount; index++) {
    const called = String.fromCharCode(basesData[index]!).toUpperCase()
    if (!/^[ACGTRYSWKMBDHVN]$/u.test(called)) throw new Error('AB1 contains an unsupported base call.')
    const peak = u16(peaksData, index * 2)
    if (peak >= sampleCount || index > 0 && peak < bases[index - 1]!.peak) throw new Error('AB1 peak positions are outside the trace or unordered.')
    const phred = qualityData?.[index]
    bases.push({ position: index + 1, peak, calls: { A: channels.A[peak]!, C: channels.C[peak]!, G: channels.G[peak]!, T: channels.T[peak]! }, base: called as SangerBase['base'], quality: phred === undefined ? null : 1 - 10 ** (-phred / 10), ...(phred === undefined ? {} : { phred }) })
  }
  return { format: 'ab1', version, sampleCount, sampleSize: 2, bases, channels, sourceSha256,
    notes: [`ABIF processed channels DATA9–12 follow FWO_1=${order}; calls contain signal intensities at each peak, not probabilities.`, `PBAS/PLOC/PCON revision ${revision}; PCON is Phred Q. Confidence for trimming is 1 - 10^(-Q/10).`, ...(qualityData ? [] : ['PCON is missing: quality remains unknown and quality trimming is disabled.']), 'IUPAC ambiguity calls and original trace peak positions are preserved.'] }
}

function readAbiEntry(bytes: Uint8Array, offset: number): AbiEntry {
  checkedRange(offset, 28, bytes.length)
  const dataSize = u32(bytes, offset + 16)
  return { tag: ascii(bytes, offset, 4), number: u32(bytes, offset + 4), elementType: u16(bytes, offset + 8), elementSize: u16(bytes, offset + 10), elementCount: u32(bytes, offset + 12), dataSize, dataOffset: dataSize <= 4 ? offset + 20 : u32(bytes, offset + 20) }
}

export function analyzeSanger(trace: SangerTrace, threshold: number, window: number, reference?: string): SangerAnalysis {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1 || !Number.isInteger(window) || window < 1 || window > 100) throw new Error('Quality threshold must be 0–1 and window must be 1–100.')
  if (threshold > 0 && trace.bases.some(base => base.quality === null)) throw new Error('Quality values are unknown; use threshold 0 to retain calls without quality trimming.')
  let start = 0; let end = trace.bases.length
  const mean = (from: number, to: number): number => { let total = 0; for (let index = from; index < to; index++) total += trace.bases[index]!.quality ?? 0; return total / Math.max(1, to - from) }
  while (start < end && mean(start, Math.min(end, start + window)) < threshold) start++
  while (end > start && mean(Math.max(start, end - window), end) < threshold) end--
  const sequence = trace.bases.slice(start, end).map(base => base.base).join(''); const result: SangerAnalysis = { trim: { threshold, window, start: start + 1, end, sequence, qualities: trace.bases.slice(start, end).map(base => base.quality) }, notes: ['Trimming removes low moving-window confidence from both ends. AB1 confidence is converted from stored Phred Q; SCF uses its stored probability display scale. No values are inferred from peak intensities.'] }
  if (reference !== undefined) { const normalized = reference.toUpperCase().replace(/\s/gu, ''); if (!/^[ACGTN]+$/u.test(normalized) || normalized.length > 100000) throw new Error('Reference must be a DNA sequence of at most 100,000 bases.'); const aligned = alignSanger(sequence, normalized); result.reference = { sequence: normalized, ...aligned, notes: ['Global Needleman–Wunsch alignment with match 1, mismatch -1 and gap -1.', 'A single trace is not bidirectional evidence; add the reverse read explicitly for confirmation.'] } }
  return result
}

export function reviewBidirectionalSanger(forward: SangerAnalysis, reverse: SangerAnalysis): BidirectionalSangerReview {
  const a = forward.trim.sequence; const b = revCompDna(reverse.trim.sequence); const length = Math.min(a.length, b.length); const disagreements: BidirectionalSangerReview['disagreements'] = []
  const bases: Record<string, string> = { A: 'A', C: 'C', G: 'G', T: 'T', R: 'AG', Y: 'CT', S: 'CG', W: 'AT', K: 'GT', M: 'AC', B: 'CGT', D: 'AGT', H: 'ACT', V: 'ACG', N: 'ACGT' }
  for (let index = 0; index < length; index++) if (![...(bases[a[index]!] ?? 'ACGT')].some(base => (bases[b[index]!] ?? 'ACGT').includes(base))) disagreements.push({ position: index + 1, forward: a[index]!, reverse: b[index]! })
  const notes = ['Reverse read is reverse-complemented before position-wise comparison; indels and alignment are not silently normalized.', 'Unequal read lengths or ambiguity calls without a direct disagreement remain insufficient; shared prefixes and unknown bases cannot establish concordance.', 'Concordance is read-level evidence only and does not establish phenotype or clinical significance.']
  return { forward: a, reverseComplement: b, disagreements, status: !a.length || !b.length ? 'insufficient' : disagreements.length ? 'discordant' : a.length !== b.length || /[^ACGT]/u.test(a + b) ? 'insufficient' : 'concordant', notes }
}
const revCompDna = (sequence: string): string => Array.from(sequence).reverse().map(base => ({ A: 'T', T: 'A', C: 'G', G: 'C', N: 'N', R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K', B: 'V', V: 'B', D: 'H', H: 'D' } as Record<string, string>)[base] ?? 'N').join('')

function alignSanger(read: string, reference: string): { alignedRead: string; alignedReference: string; mismatches: NonNullable<SangerAnalysis['reference']>['mismatches']; identity: number } {
  const rows = read.length + 1; const columns = reference.length + 1; if (rows * columns > 20000000) throw new Error('Reference alignment exceeds the interactive cell limit.')
  const score = Array.from({ length: rows }, () => new Int32Array(columns)); const trace = Array.from({ length: rows }, () => new Uint8Array(columns)); for (let i = 1; i < rows; i++) score[i]![0] = -i; for (let j = 1; j < columns; j++) score[0]![j] = -j
  for (let i = 1; i < rows; i++) for (let j = 1; j < columns; j++) { const diagonal = score[i - 1]![j - 1]! + (read[i - 1] === reference[j - 1] ? 1 : -1); const up = score[i - 1]![j]! - 1; const left = score[i]![j - 1]! - 1; if (diagonal >= up && diagonal >= left) { score[i]![j] = diagonal; trace[i]![j] = 1 } else if (up >= left) { score[i]![j] = up; trace[i]![j] = 2 } else { score[i]![j] = left; trace[i]![j] = 3 } }
  let i = read.length; let j = reference.length; let alignedRead = ''; let alignedReference = ''; while (i || j) { const direction = trace[i]![j]!; if (i > 0 && j > 0 && direction === 1) { alignedRead = read[i - 1]! + alignedRead; alignedReference = reference[j - 1]! + alignedReference; i--; j-- } else if (i > 0 && (j === 0 || direction === 2)) { alignedRead = read[i - 1]! + alignedRead; alignedReference = '-' + alignedReference; i-- } else { alignedRead = '-' + alignedRead; alignedReference = reference[j - 1]! + alignedReference; j-- } }
  const mismatches: NonNullable<SangerAnalysis['reference']>['mismatches'] = []; let readPosition = 0; let referencePosition = 0; let matches = 0; let comparable = 0; for (let k = 0; k < alignedRead.length; k++) { const readBase = alignedRead[k]!; const referenceBase = alignedReference[k]!; if (readBase !== '-') readPosition++; if (referenceBase !== '-') referencePosition++; if (readBase !== '-' || referenceBase !== '-') { comparable++; if (readBase === referenceBase && /^[ACGT]$/u.test(readBase)) matches++; else mismatches.push({ readPosition, referencePosition, read: readBase, reference: referenceBase }) } }
  return { alignedRead, alignedReference, mismatches, identity: comparable ? matches / comparable : 0 }
}
