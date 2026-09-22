import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, open, rm, statfs, type FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import { decodeFcsBlock, flowGateMembership, parseFcsLayout, transformFlowEvents, type FlowAnalysis, type FlowDataset, type FlowParameters } from '../shared/flow.js'

export const FLOW_STREAM_LIMITS = Object.freeze({ eventsPerBlock: 8192, sortValues: 65536, maxFileBytes: 512 * 1024 * 1024, maxHeaderBytes: 1024 * 1024, maxTemporaryBytes: 2 * 1024 ** 3, maxPopulations: 129 })

async function readExactly(handle: FileHandle, bytes: Buffer, position: number): Promise<void> {
  let offset = 0
  while (offset < bytes.length) { const result = await handle.read(bytes, offset, bytes.length - offset, position + offset); if (!result.bytesRead) throw new Error('FCS or temporary column ended during reading.'); offset += result.bytesRead }
}
async function writeExactly(handle: FileHandle, bytes: Buffer): Promise<void> {
  let offset = 0
  while (offset < bytes.length) { const result = await handle.write(bytes, offset, bytes.length - offset); if (!result.bytesWritten) throw new Error('Flow temporary disk write did not progress.'); offset += result.bytesWritten }
}

/** One open source descriptor; neither hashing nor decoding materializes the event matrix. */
export class FcsReader {
  private constructor(readonly handle: FileHandle, readonly dataset: FlowDataset, readonly sha256: string, private readonly dataStart: number, private readonly bytesPerEvent: number, private readonly initial: { size: number; mtimeMs: number; ctimeMs: number }) {}

  static async open(path: string, checksum?: string | null, algorithm?: string | null): Promise<FcsReader> {
    const handle = await open(path, 'r')
    try {
      const info = await handle.stat()
      if (!info.isFile() || info.size < 58 || info.size > FLOW_STREAM_LIMITS.maxFileBytes) throw new Error('FCS must be a regular file between 58 bytes and 512 MiB.')
      const header = Buffer.alloc(58); await readExactly(handle, header, 0)
      const textEnd = Number(header.toString('ascii', 18, 26).trim())
      if (!Number.isSafeInteger(textEnd) || textEnd < 58 || textEnd >= info.size || textEnd >= FLOW_STREAM_LIMITS.maxHeaderBytes) throw new Error('FCS TEXT/header is invalid or exceeds the 1 MiB streaming header limit.')
      const prefix = Buffer.alloc(textEnd + 1); header.copy(prefix); await readExactly(handle, prefix.subarray(58), 58)
      const layout = parseFcsLayout(prefix, '', info.size)
      const digest = createHash('sha256'); const registered = checksum && algorithm ? createHash(algorithm) : undefined
      if (checksum && !registered) throw new Error('FCS checksum algorithm is missing.')
      const hashBlock = Buffer.alloc(Math.min(1024 * 1024, info.size))
      for (let offset = 0; offset < info.size; offset += hashBlock.length) { const part = hashBlock.subarray(0, Math.min(hashBlock.length, info.size - offset)); await readExactly(handle, part, offset); digest.update(part); registered?.update(part) }
      const sha256 = digest.digest('hex')
      if (registered && registered.digest('hex') !== checksum!.toLowerCase()) throw new Error('FCS checksum does not match the registered asset.')
      layout.dataset.sourceSha256 = sha256
      const reader = new FcsReader(handle, layout.dataset, sha256, layout.dataStart, layout.bytesPerEvent, info)
      await reader.assertUnchanged(); return reader
    } catch (error) { await handle.close(); throw error }
  }

  async assertUnchanged(): Promise<void> { const after = await this.handle.stat(); if (after.size !== this.initial.size || after.mtimeMs !== this.initial.mtimeMs || after.ctimeMs !== this.initial.ctimeMs) throw new Error('FCS changed during reading or analysis.') }
  async *blocks(): AsyncGenerator<number[][]> {
    const buffer = Buffer.alloc(FLOW_STREAM_LIMITS.eventsPerBlock * this.bytesPerEvent)
    for (let start = 0; start < this.dataset.eventCount; start += FLOW_STREAM_LIMITS.eventsPerBlock) { const count = Math.min(FLOW_STREAM_LIMITS.eventsPerBlock, this.dataset.eventCount - start); const part = buffer.subarray(0, count * this.bytesPerEvent); await readExactly(this.handle, part, this.dataStart + start * this.bytesPerEvent); yield decodeFcsBlock(part, this.dataset, count) }
    await this.assertUnchanged()
  }
  async preview(): Promise<FlowDataset> {
    const count = Math.min(5000, this.dataset.eventCount); const bytes = Buffer.alloc(count * this.bytesPerEvent); await readExactly(this.handle, bytes, this.dataStart)
    const events = decodeFcsBlock(bytes, this.dataset, count); await this.assertUnchanged()
    return { ...this.dataset, events, eventsComplete: count === this.dataset.eventCount }
  }
  async close(): Promise<void> { await this.handle.close() }
}

/** External sorted column runs: at most 31 runs for the 2M-event input limit. */
async function exactMedian(path: string, count: number, channels: number, column: number, temporary: string): Promise<number | null> {
  if (!count) return null
  const source = await open(path, 'r'); const runs: Array<{ handle: FileHandle; path: string; count: number; cursor: number; offset: number; buffer: Buffer; loaded: number }> = []
  try {
    const values = new Float64Array(Math.min(count, FLOW_STREAM_LIMITS.sortValues)); const rows = Buffer.alloc(Math.min(count, FLOW_STREAM_LIMITS.eventsPerBlock) * channels * 8); let filled = 0
    const flush = async (): Promise<void> => {
      const sorted = values.subarray(0, filled); sorted.sort(); const runPath = join(temporary, `sort-${runs.length}.bin`); const handle = await open(runPath, 'wx+')
      runs.push({ handle, path: runPath, count: filled, cursor: 0, offset: 0, buffer: Buffer.alloc(Math.min(filled, 8192) * 8), loaded: 0 })
      // Explicit LE encoding is independent of host byte order.
      const bytes = Buffer.alloc(filled * 8); for (let index = 0; index < filled; index++) bytes.writeDoubleLE(sorted[index]!, index * 8)
      await writeExactly(handle, bytes); filled = 0
    }
    for (let start = 0; start < count; start += FLOW_STREAM_LIMITS.eventsPerBlock) {
      const length = Math.min(FLOW_STREAM_LIMITS.eventsPerBlock, count - start); const part = rows.subarray(0, length * channels * 8); await readExactly(source, part, start * channels * 8)
      for (let index = 0; index < length; index++) { values[filled++] = part.readDoubleLE((index * channels + column) * 8); if (filled === values.length) await flush() }
    }
    if (filled) await flush()
    const refill = async (run: typeof runs[number]): Promise<void> => { run.loaded = Math.min(run.buffer.length / 8, run.count - run.offset); run.cursor = 0; if (run.loaded) await readExactly(run.handle, run.buffer.subarray(0, run.loaded * 8), run.offset * 8); run.offset += run.loaded }
    for (const run of runs) await refill(run)
    const heap = runs.map((run, id) => ({ id, value: run.buffer.readDoubleLE(0) }))
    const down = (start: number): void => { let index = start; for (;;) { const left = index * 2 + 1; if (left >= heap.length) return; const right = left + 1; const child = right < heap.length && heap[right]!.value < heap[left]!.value ? right : left; if (heap[index]!.value <= heap[child]!.value) return; [heap[index], heap[child]] = [heap[child]!, heap[index]!]; index = child } }
    for (let index = Math.floor(heap.length / 2) - 1; index >= 0; index--) down(index)
    const middle = Math.floor(count / 2); let previous = 0; let current = 0
    for (let index = 0; index <= middle; index++) {
      previous = current; const head = heap[0]!; current = head.value; const run = runs[head.id]!; run.cursor++
      if (run.cursor === run.loaded) await refill(run)
      if (run.loaded) head.value = run.buffer.readDoubleLE(run.cursor * 8)
      else { const last = heap.pop()!; if (heap.length) heap[0] = last }
      if (heap.length) down(0)
    }
    return count % 2 ? current : previous / 2 + current / 2
  } finally {
    await source.close()
    for (const run of runs) { await run.handle.close(); await rm(run.path, { force: true }) }
  }
}

export async function analyzeFlowStream(reader: FcsReader, input: FlowParameters, scratchRoot: string): Promise<FlowAnalysis> {
  const dataset = reader.dataset; const channels = dataset.channels.length; const gates = input.gates ?? []; const previewLimit = input.previewLimit ?? 5000
  if (!Number.isSafeInteger(previewLimit) || previewLimit < 0 || previewLimit > 10000) throw new Error('Flow previewLimit must be 0–10,000.')
  // Validate all parameters and parent relationships before touching temporary storage.
  transformFlowEvents({ ...dataset, events: [] }, input); flowGateMembership(dataset, [], gates)
  const maximumDiskBytes = dataset.eventCount * (channels * (gates.length + 1) + 1) * 8
  if (maximumDiskBytes > FLOW_STREAM_LIMITS.maxTemporaryBytes) throw new Error('Flow exact statistics exceed the 2 GiB temporary disk budget; reduce gates/channels/events.')
  await mkdir(scratchRoot, { recursive: true }); const disk = await statfs(scratchRoot)
  if (disk.bavail * disk.bsize < maximumDiskBytes + 64 * 1024 * 1024) throw new Error('Insufficient free disk for bounded exact flow statistics.')
  const temporary = await mkdtemp(join(scratchRoot, 'flow-')); const populations: Array<{ count: number; sums: Float64Array; corrections: Float64Array; path: string; handle: FileHandle }> = []
  try {
    for (let index = 0; index <= gates.length; index++) { const path = join(temporary, `population-${index}.bin`); populations.push({ path, handle: await open(path, 'wx+'), count: 0, sums: new Float64Array(channels), corrections: new Float64Array(channels) }) }
    const preview: FlowAnalysis['preview'] = []; const writeBuffer = Buffer.alloc(FLOW_STREAM_LIMITS.eventsPerBlock * channels * 8)
    for await (const block of reader.blocks()) {
      const transformed = transformFlowEvents({ ...dataset, events: block }, input); const membership = flowGateMembership(dataset, transformed, gates)
      for (const row of transformed.slice(0, Math.max(0, previewLimit - preview.length))) preview.push(Object.fromEntries(dataset.channels.map((channel, index) => [channel.name, row[index]!])) )
      for (let populationIndex = 0; populationIndex < populations.length; populationIndex++) {
        const population = populations[populationIndex]!; const selected = populationIndex ? membership.get(gates[populationIndex - 1]!.id)! : undefined; let offset = 0
        for (let index = 0; index < transformed.length; index++) if (!selected || selected[index]) {
          const row = transformed[index]!; population.count++
          for (let column = 0; column < channels; column++) { const value = row[column]!; if (!Number.isFinite(value)) throw new Error('Flow compensation or transform produced a non-finite value.'); const adjusted = value - population.corrections[column]!; const next = population.sums[column]! + adjusted; population.corrections[column] = (next - population.sums[column]!) - adjusted; population.sums[column] = next; writeBuffer.writeDoubleLE(value, offset); offset += 8 }
        }
        if (offset) await writeExactly(population.handle, writeBuffer.subarray(0, offset))
      }
    }
    const allStatistics: FlowAnalysis['statistics'][] = []
    for (const population of populations) {
      const statistics: FlowAnalysis['statistics'] = {}
      for (let column = 0; column < channels; column++) statistics[dataset.channels[column]!.name] = { mean: population.count ? population.sums[column]! / population.count : null, median: await exactMedian(population.path, population.count, channels, column, temporary) }
      allStatistics.push(statistics)
    }
    await reader.assertUnchanged()
    const transform = input.transform ?? 'none'; const compensationApplied = Boolean(input.applyCompensation && dataset.compensation)
    return { transform, cofactor: input.cofactor ?? 5, compensationApplied, eventCount: dataset.eventCount, preview, statistics: allStatistics[0]!, statisticsScale: transform === 'arcsinh' ? compensationApplied ? 'arcsinh-compensated' : 'arcsinh-raw' : compensationApplied ? 'compensated' : 'raw', gates: gates.map((gate, index) => { const count = populations[index + 1]!.count; const parentCount = gate.parentId ? populations[gates.findIndex(parent => parent.id === gate.parentId) + 1]!.count : dataset.eventCount; return { id: gate.id, name: gate.name, ...(gate.parentId ? { parentId: gate.parentId } : {}), count, fractionOfTotal: count / dataset.eventCount, fractionOfParent: parentCount ? count / parentCount : 0, statistics: allStatistics[index + 1]! } }), notes: ['FCS events are decoded in blocks of at most 8192; compensation, transformation and ordered hierarchical gates are evaluated per block.', 'Means use compensated summation. Medians are exact external sorted-column merges using at most 65536 values per run; no full event matrix is retained.', 'The conservative temporary disk budget is 2 GiB; inputs exceeding it are rejected before analysis.', 'GatingML rectangles use min-inclusive/max-exclusive bounds and polygons use nonzero winding; legacy gates retain inclusive bounds with an 8-double-ulp allowance.', 'MFI is ambiguous: arithmetic mean and median are reported separately on the declared analysis scale; empty populations return null.', 'GatingML export is a validated subset; instrument-specific semantics are not inferred.', ...(input.applyCompensation && !dataset.compensation ? ['Compensation was requested but no spillover matrix was present; raw values were retained.'] : [])] }
  } finally {
    for (const population of populations) await population.handle.close()
    // mkdtemp created this exact task directory; never remove the parent or user inputs.
    await rm(temporary, { recursive: true, force: true })
  }
}
