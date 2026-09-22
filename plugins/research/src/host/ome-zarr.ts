import { createHash } from 'node:crypto'
import { gunzipSync, inflateSync } from 'node:zlib'
import { open, realpath, stat } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

export interface OmeZarrDataset {
  path: string
  shape: number[]
  chunks: number[]
  dtype: string
  compressor: unknown
  dimensionSeparator: '.' | '/'
  fillValue: number
}

export interface OmeZarrMetadata {
  format: 'ome-zarr'
  version: 1
  axes: Array<{ name: string; type?: string; unit?: string }>
  order: string
  sizes: Record<string, number>
  physicalSize?: { x?: number; y?: number; unit?: string }
  width: number
  height: number
  pages: number
  channels: number
  depth: string
  dataset: OmeZarrDataset
  fingerprint: string
  fingerprintScope: 'metadata-and-chunk-layout'
}

export function omeZarrPagePosition(metadata: OmeZarrMetadata, page: number): { page: number; z?: number; c?: number; t?: number } {
  const indices = pageIndices(metadata, page)
  const position: { page: number; z?: number; c?: number; t?: number } = { page }
  metadata.axes.forEach((axis, index) => {
    if (axis.name === 'z' || axis.name === 'c' || axis.name === 't') position[axis.name] = indices[index] ?? 0
  })
  return position
}

type DType = { bytes: number; kind: 'unsigned' | 'signed' | 'float'; littleEndian: boolean }
const MAX_CHUNK_BYTES = 32 * 1024 ** 2
const MAX_PLANE_BYTES = 128 * 1024 ** 2
const MAX_JSON_BYTES = 1024 ** 2

/** Resolve every existing parent, including junctions, before opening a chunk. */
async function containedPath(root: string, child: string): Promise<string> {
  let current = await realpath(root)
  const target = safeChild(current, child)
  const components = target.slice(current.length).split(sep).filter(Boolean)
  const boundary = current
  for (const component of components) {
    current = join(current, component)
    try { current = await realpath(current) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    safeChild(boundary, current)
  }
  return current
}

async function boundedRead(root: string, child: string, maximum: number): Promise<Buffer> {
  const path = await containedPath(root, child)
  const handle = await open(path, 'r')
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size > maximum) throw new Error('OME-Zarr file exceeds its bounded read limit.')
    const buffer = Buffer.alloc(info.size + 1)
    let offset = 0
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset)
      if (!bytesRead) break
      offset += bytesRead
    }
    const after = await handle.stat()
    if (offset !== info.size || after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs) throw new Error('OME-Zarr file changed during reading.')
    return buffer.subarray(0, offset)
  } finally { await handle.close() }
}

function jsonObject(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`OME-Zarr ${name} must be a JSON object.`)
  return value as Record<string, unknown>
}

function integerArray(value: unknown, name: string): number[] {
  if (!Array.isArray(value) || value.length < 2 || !value.every(item => Number.isSafeInteger(item) && Number(item) > 0)) throw new Error(`OME-Zarr ${name} must be a positive integer array.`)
  return value.map(Number)
}

function safeChild(root: string, child: string): string {
  const absoluteRoot = resolve(root)
  const candidate = resolve(root, child)
  const prefix = absoluteRoot.endsWith(sep) ? absoluteRoot : `${absoluteRoot}${sep}`
  if (candidate !== absoluteRoot && !candidate.startsWith(prefix)) throw new Error('OME-Zarr path escapes the project asset.')
  return candidate
}

async function readJson(root: string, child: string, name: string): Promise<Record<string, unknown>> {
  try {
    return jsonObject(JSON.parse((await boundedRead(root, child, MAX_JSON_BYTES)).toString('utf8')), name)
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`OME-Zarr ${name} is not valid JSON.`)
    throw error
  }
}

function parseDType(value: string): DType {
  const match = /^(?<endian>[<>|=])(?<kind>[uibf])(?<bytes>1|2|4|8)$/iu.exec(value.trim())
  if (!match?.groups) throw new Error(`OME-Zarr dtype ${value} is unsupported; expected a scalar integer or float.`)
  const kind = match.groups.kind!.toLowerCase()
  const bytes = Number(match.groups.bytes)
  if (kind === 'b' && bytes !== 1) throw new Error('OME-Zarr boolean dtype must use one byte.')
  if (kind === 'b') return { bytes: 1, kind: 'unsigned', littleEndian: true }
  if (kind === 'f' && bytes !== 4 && bytes !== 8) throw new Error(`OME-Zarr float dtype ${value} is unsupported.`)
  if ((kind === 'u' || kind === 'i') && ![1, 2, 4, 8].includes(bytes)) throw new Error(`OME-Zarr integer dtype ${value} is unsupported.`)
  if ((kind === 'u' || kind === 'i') && bytes === 8) throw new Error('OME-Zarr 64-bit integer viewing requires a lossless managed adapter.')
  if (match.groups.endian === '|' && bytes !== 1) throw new Error('OME-Zarr multi-byte dtype requires explicit byte order.')
  return { bytes, kind: kind === 'u' ? 'unsigned' : kind === 'i' ? 'signed' : 'float', littleEndian: match.groups.endian !== '>' }
}

function depthName(dtype: string): string {
  const parsed = parseDType(dtype)
  if (parsed.kind === 'float') return parsed.bytes === 4 ? 'float' : 'double'
  if (parsed.kind === 'signed') return parsed.bytes === 1 ? 'char' : parsed.bytes === 2 ? 'short' : parsed.bytes === 4 ? 'int' : 'double'
  return parsed.bytes === 1 ? 'uchar' : parsed.bytes === 2 ? 'ushort' : parsed.bytes === 4 ? 'uint' : 'double'
}

function axisName(value: unknown): { name: string; type?: string; unit?: string } {
  if (typeof value === 'string') return { name: value.toLowerCase() }
  const axis = jsonObject(value, 'axis')
  if (typeof axis.name !== 'string' || !/^[a-z]+$/iu.test(axis.name)) throw new Error('OME-Zarr axes must have named dimensions.')
  return { name: axis.name.toLowerCase(), ...(typeof axis.type === 'string' ? { type: axis.type } : {}), ...(typeof axis.unit === 'string' ? { unit: axis.unit } : {}) }
}

function pageIndices(metadata: OmeZarrMetadata, page: number): number[] {
  if (!Number.isSafeInteger(page) || page < 0 || page >= metadata.pages) throw new Error(`OME-Zarr page ${page} is outside the ${metadata.pages}-page range.`)
  const spatial = new Set(['x', 'y'])
  const varying = metadata.axes.map((axis, index) => ({ axis, index })).filter(item => !spatial.has(item.axis.name))
  let remainder = page
  const result = metadata.dataset.shape.map(() => 0)
  for (const item of [...varying].reverse()) {
    const size = metadata.dataset.shape[item.index]!
    result[item.index] = remainder % size
    remainder = Math.floor(remainder / size)
  }
  return result
}

function chunkKey(coords: number[], separator: '.' | '/'): string {
  return coords.join(separator)
}

function product(values: number[]): number { return values.reduce((total, value) => total * value, 1) }

function readNumber(bytes: Buffer, offset: number, dtype: DType): number {
  if (dtype.kind === 'float') return dtype.bytes === 4 ? (dtype.littleEndian ? bytes.readFloatLE(offset) : bytes.readFloatBE(offset)) : (dtype.littleEndian ? bytes.readDoubleLE(offset) : bytes.readDoubleBE(offset))
  if (dtype.kind === 'signed') return dtype.bytes === 1 ? bytes.readInt8(offset) : dtype.bytes === 2 ? (dtype.littleEndian ? bytes.readInt16LE(offset) : bytes.readInt16BE(offset)) : dtype.bytes === 4 ? (dtype.littleEndian ? bytes.readInt32LE(offset) : bytes.readInt32BE(offset)) : Number(dtype.littleEndian ? bytes.readBigInt64LE(offset) : bytes.readBigInt64BE(offset))
  return dtype.bytes === 1 ? bytes.readUInt8(offset) : dtype.bytes === 2 ? (dtype.littleEndian ? bytes.readUInt16LE(offset) : bytes.readUInt16BE(offset)) : dtype.bytes === 4 ? (dtype.littleEndian ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset)) : Number(dtype.littleEndian ? bytes.readBigUInt64LE(offset) : bytes.readBigUInt64BE(offset))
}

function writeNumber(bytes: Buffer, offset: number, value: number, dtype: DType): void {
  if (dtype.kind === 'float') { if (dtype.bytes === 4) bytes.writeFloatLE(value, offset); else bytes.writeDoubleLE(value, offset); return }
  if (dtype.kind === 'signed') { if (dtype.bytes === 1) bytes.writeInt8(value, offset); else if (dtype.bytes === 2) bytes.writeInt16LE(value, offset); else if (dtype.bytes === 4) bytes.writeInt32LE(value, offset); else bytes.writeBigInt64LE(BigInt(Math.trunc(value)), offset); return }
  if (dtype.bytes === 1) bytes.writeUInt8(value, offset); else if (dtype.bytes === 2) bytes.writeUInt16LE(value, offset); else if (dtype.bytes === 4) bytes.writeUInt32LE(value, offset); else bytes.writeBigUInt64LE(BigInt(Math.max(0, Math.trunc(value))), offset)
}

async function readChunk(root: string, path: string, compressor: unknown, expectedBytes: number, fillValue: number, dtype: DType): Promise<Buffer> {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes > MAX_CHUNK_BYTES) throw new Error('OME-Zarr chunk exceeds the 32 MiB decoded limit.')
  let bytes: Buffer
  try { bytes = await boundedRead(root, path, MAX_CHUNK_BYTES) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const filled = Buffer.alloc(expectedBytes)
      if (fillValue !== 0) for (let offset = 0; offset < filled.length; offset += dtype.bytes) writeNumber(filled, offset, fillValue, dtype)
      // writeNumber uses native little endian output; chunks keep their declared byte order.
      if (!dtype.littleEndian && dtype.bytes > 1) {
        if (dtype.bytes === 2) filled.swap16(); else if (dtype.bytes === 4) filled.swap32(); else filled.swap64()
      }
      return filled
    }
    throw error
  }
  const descriptor = compressor === null || compressor === undefined ? null : jsonObject(compressor, 'compressor')
  const id = descriptor && typeof descriptor.id === 'string' ? descriptor.id.toLowerCase() : null
  if (id === null) return bytes
  if (id === 'gzip') return gunzipSync(bytes, { maxOutputLength: expectedBytes })
  if (id === 'zlib') return inflateSync(bytes, { maxOutputLength: expectedBytes })
  throw new Error(`OME-Zarr compressor ${id} is not supported by the bounded viewer; use a managed Python adapter.`)
}

export async function readOmeZarrMetadata(root: string): Promise<OmeZarrMetadata> {
  const rootPath = resolve(root)
  const rootStat = await stat(rootPath)
  if (!rootStat.isDirectory()) throw new Error('OME-Zarr asset must be a directory.')
  const attrs = await readJson(rootPath, '.zattrs', 'root .zattrs')
  const multiscales = Array.isArray(attrs.multiscales) ? attrs.multiscales : []
  const multiscale = jsonObject(multiscales[0], 'multiscales[0]')
  const axes = Array.isArray(multiscale.axes) ? multiscale.axes.map(axisName) : []
  if (axes.length < 2) throw new Error('OME-Zarr multiscales metadata must declare axes.')
  if (axes.length > 5 || new Set(axes.map(axis => axis.name)).size !== axes.length || axes.some(axis => !['x', 'y', 'z', 'c', 't'].includes(axis.name))) throw new Error('OME-Zarr axes must be unique x/y/z/c/t dimensions.')
  const datasets = Array.isArray(multiscale.datasets) ? multiscale.datasets : []
  const datasetInfo = jsonObject(datasets[0], 'multiscales.datasets[0]')
  if (typeof datasetInfo.path !== 'string' || datasetInfo.path.trim() === '') throw new Error('OME-Zarr first multiscale dataset has no path.')
  const datasetPath = datasetInfo.path
  safeChild(rootPath, datasetPath)
  const zarray = await readJson(rootPath, join(datasetPath, '.zarray'), '.zarray')
  if (zarray.zarr_format !== 2 || zarray.order !== 'C') throw new Error('OME-Zarr viewer requires Zarr v2 C-order arrays.')
  if (zarray.filters !== undefined && zarray.filters !== null && (!Array.isArray(zarray.filters) || zarray.filters.length)) throw new Error('OME-Zarr filtered chunks require a managed adapter.')
  if (zarray.dimension_separator !== undefined && !['.', '/'].includes(String(zarray.dimension_separator))) throw new Error('OME-Zarr dimension separator is invalid.')
  const shape = integerArray(zarray.shape, 'shape'); const chunks = integerArray(zarray.chunks, 'chunks')
  if (shape.length !== axes.length || chunks.length !== shape.length) throw new Error('OME-Zarr shape, chunks and axes lengths do not match.')
  const xIndex = axes.findIndex(axis => axis.name === 'x'); const yIndex = axes.findIndex(axis => axis.name === 'y')
  if (xIndex < 0 || yIndex < 0 || xIndex === yIndex) throw new Error('OME-Zarr viewer requires named x and y axes.')
  const spatialWidth = shape[xIndex]!; const spatialHeight = shape[yIndex]!
  const varying = shape.filter((_, index) => index !== xIndex && index !== yIndex)
  const pages = product(varying.length ? varying : [1])
  if (!Number.isSafeInteger(pages)) throw new Error('OME-Zarr page count exceeds safe integer range.')
  const sizes = Object.fromEntries(axes.map((axis, index) => [axis.name.toUpperCase(), shape[index]!]))
  const transform = Array.isArray(datasetInfo.coordinateTransformations) && datasetInfo.coordinateTransformations.length > 0 ? jsonObject(datasetInfo.coordinateTransformations[0], 'coordinate transformation') : undefined
  const scale = Array.isArray(transform?.scale) ? transform.scale.map(Number) : undefined
  const unit = axes.find(axis => axis.name === 'x')?.unit
  const physicalSize = scale ? { ...(Number.isFinite(scale[xIndex]!) ? { x: scale[xIndex] } : {}), ...(Number.isFinite(scale[yIndex]!) ? { y: scale[yIndex] } : {}), ...(unit ? { unit } : {}) } : undefined
  const dtype = typeof zarray.dtype === 'string' ? zarray.dtype : ''
  const dimensionSeparator = zarray.dimension_separator === '/' ? '/' : '.'
  const parsed = parseDType(dtype)
  const fillValue = zarray.fill_value === null || zarray.fill_value === undefined ? 0 : zarray.fill_value
  if (typeof fillValue !== 'number' || !Number.isFinite(fillValue) || (parsed.kind !== 'float' && !Number.isInteger(fillValue))) throw new Error('OME-Zarr fill value is unsupported by this viewer.')
  try { writeNumber(Buffer.alloc(parsed.bytes), 0, fillValue, parsed) } catch { throw new Error('OME-Zarr fill value does not fit dtype.') }
  if (!Number.isSafeInteger(product(chunks) * parsed.bytes) || product(chunks) * parsed.bytes > MAX_CHUNK_BYTES) throw new Error('OME-Zarr chunk exceeds the 32 MiB decoded limit.')
  const dataset: OmeZarrDataset = { path: datasetPath, shape, chunks, dtype, compressor: zarray.compressor ?? null, dimensionSeparator, fillValue }
  const fingerprint = createHash('sha256').update(JSON.stringify({ attrs, dataset })).digest('hex')
  return { format: 'ome-zarr', version: 1, axes, order: axes.map(axis => axis.name.toUpperCase()).join(''), sizes, width: spatialWidth, height: spatialHeight, pages, channels: sizes.C ?? 1, depth: depthName(dtype), dataset, fingerprint, fingerprintScope: 'metadata-and-chunk-layout', ...(physicalSize && Object.keys(physicalSize).length ? { physicalSize } : {}) }
}

export async function readOmeZarrPlane(root: string, metadata: OmeZarrMetadata, page: number): Promise<{ raw: Buffer; width: number; height: number; depth: string }> {
  const dtype = parseDType(metadata.dataset.dtype)
  const indices = pageIndices(metadata, page)
  const xIndex = metadata.axes.findIndex(axis => axis.name === 'x'); const yIndex = metadata.axes.findIndex(axis => axis.name === 'y')
  const width = metadata.width; const height = metadata.height
  const xChunks = Math.ceil(width / metadata.dataset.chunks[xIndex]!); const yChunks = Math.ceil(height / metadata.dataset.chunks[yIndex]!)
  if (xChunks * yChunks > 4096) throw new Error('OME-Zarr plane needs more than 4096 chunks; use a managed tiled/remote adapter.')
  if (!Number.isSafeInteger(width * height * dtype.bytes) || width * height * dtype.bytes > MAX_PLANE_BYTES) throw new Error('OME-Zarr plane exceeds the 128 MiB decoded limit; use a tiled adapter.')
  const output = Buffer.alloc(width * height * dtype.bytes)
  const fixedCoords = metadata.dataset.shape.map((size, index) => index === xIndex || index === yIndex ? 0 : Math.floor(indices[index]! / metadata.dataset.chunks[index]!))
  const fixedLocals = metadata.dataset.shape.map((size, index) => index === xIndex || index === yIndex ? 0 : indices[index]! % metadata.dataset.chunks[index]!)
  for (let cy = 0; cy < yChunks; cy++) for (let cx = 0; cx < xChunks; cx++) {
    const coords = [...fixedCoords]; coords[xIndex] = cx; coords[yIndex] = cy
    const actualShape = metadata.dataset.shape.map((size, index) => Math.min(metadata.dataset.chunks[index]!, size - coords[index]! * metadata.dataset.chunks[index]!))
    // Zarr v2 edge chunks retain the nominal chunk shape, including padded cells.
    const expectedBytes = product(metadata.dataset.chunks) * dtype.bytes
    const chunk = await readChunk(root, join(metadata.dataset.path, chunkKey(coords, metadata.dataset.dimensionSeparator)), metadata.dataset.compressor, expectedBytes, metadata.dataset.fillValue, dtype)
    if (chunk.length !== expectedBytes) throw new Error(`OME-Zarr chunk ${chunkKey(coords, metadata.dataset.dimensionSeparator)} does not match its declared shape.`)
    const startX = cx * metadata.dataset.chunks[xIndex]!; const startY = cy * metadata.dataset.chunks[yIndex]!
    const endX = Math.min(width, startX + actualShape[xIndex]!); const endY = Math.min(height, startY + actualShape[yIndex]!)
    const strides = metadata.dataset.chunks.map((_, index) => product(metadata.dataset.chunks.slice(index + 1)))
    for (let y = startY; y < endY; y++) for (let x = startX; x < endX; x++) {
      const local = actualShape.map((_, index) => index === xIndex ? x - startX : index === yIndex ? y - startY : fixedLocals[index]!)
      const sourceOffset = local.reduce((total, value, index) => total + value * strides[index]!, 0) * dtype.bytes
      writeNumber(output, (y * width + x) * dtype.bytes, readNumber(chunk, sourceOffset, dtype), dtype)
    }
  }
  return { raw: output, width, height, depth: depthName(metadata.dataset.dtype) }
}
