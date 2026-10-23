import { closeSync, constants, fstatSync, openSync, readSync, realpathSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DataAssetRecord, ResearchDocumentRecord } from './domain.ts'

export const DATASET_SOURCE_VERIFIER = 'local-delimited-file-v1'
const MAX_SOURCE_BYTES = 64 * 1024 * 1024
const MAX_HEADER_BYTES = 64 * 1024
const MAX_COLUMNS = 1024

export interface VerifiedDatasetSource {
  assetId: string
  assetVersion: number
  sourceUri: string
  realPath: string
  sourceSha256: string
  byteSize: number
  variables: string[]
  header: string[]
}

/** Read the actual registered input. Caller-authored provenance/verification
 * fields are deliberately not evidence. This verifier establishes file and
 * column identity, not the scientific validity of a publisher's claims. */
export function inspectDatasetSource(contract: ResearchDocumentRecord, asset: DataAssetRecord, rootPath: string): VerifiedDatasetSource {
  if (asset.projectId !== contract.projectId || asset.location !== 'local') throw new Error('Only local data assets from the current project can be verified.')
  const source = contract.payload.source
  const sourceUri = typeof source === 'string' ? source : source && typeof source === 'object' && !Array.isArray(source) ? source.uri : undefined
  if (sourceUri !== asset.uri) throw new Error('The contract source must match the registered asset URI.')
  const variables = contract.payload.availableVariables ?? contract.payload.variables
  if (!Array.isArray(variables) || !variables.length || variables.some(value => typeof value !== 'string' || !value.trim()) || new Set(variables).size !== variables.length) throw new Error('Contract variables must be distinct nonempty column names.')
  const requestedVariables = variables as string[]
  const uriPath = /^file:/iu.test(asset.uri) ? fileURLToPath(asset.uri) : asset.uri
  if (/^[a-z][a-z\d+.-]*:/iu.test(uriPath) && !/^[a-z]:[\\/]/iu.test(uriPath)) throw new Error('The data source is not a local file.')
  const root = realpathSync(rootPath)
  const path = realpathSync(isAbsolute(uriPath) ? uriPath : resolve(root, uriPath))
  const inside = relative(root, path)
  if (!inside || inside === '..' || inside.startsWith('..' + sep) || isAbsolute(inside)) throw new Error('The data source must remain inside the current workspace.')
  const extension = extname(path).toLowerCase()
  if (!['.csv', '.tsv'].includes(extension)) throw new Error('No system source verifier is available for this file format; CSV or TSV is required.')
  if (!statSync(path).isFile()) throw new Error('The data source is not a regular file.')
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0))
  try {
    const before = fstatSync(fd)
    if (!before.isFile() || before.size === 0 || before.size > MAX_SOURCE_BYTES) throw new Error('The data source is empty, not a regular file, or exceeds the 64 MiB verification limit.')
    const buffer = Buffer.allocUnsafe(before.size + 1)
    let byteLength = 0
    while (byteLength < buffer.byteLength) {
      const count = readSync(fd, buffer, byteLength, buffer.byteLength - byteLength, null)
      if (!count) break
      byteLength += count
    }
    const bytes = buffer.subarray(0, byteLength)
    const after = fstatSync(fd)
    const current = statSync(path)
    if (bytes.byteLength > MAX_SOURCE_BYTES || before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.byteLength !== after.size || current.dev !== after.dev || current.ino !== after.ino || current.size !== after.size || current.mtimeMs !== after.mtimeMs || realpathSync(isAbsolute(uriPath) ? uriPath : resolve(root, uriPath)) !== path) throw new Error('The data source changed during verification; retry after the file is stable.')
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const header = delimitedHeader(text, extension === '.tsv' ? '\t' : ',')
    if (requestedVariables.some(variable => !header.includes(variable))) throw new Error('A required contract variable is absent from the actual file header.')
    const sourceSha256 = createHash('sha256').update(bytes).digest('hex')
    if (asset.byteSize !== undefined && asset.byteSize !== bytes.byteLength) throw new Error('The registered data asset size differs from the actual file.')
    if (asset.checksumAlgorithm && asset.checksum && createHash(asset.checksumAlgorithm).update(bytes).digest('hex') !== asset.checksum.toLowerCase()) throw new Error('The registered data asset checksum differs from the actual file.')
    return { assetId: asset.id, assetVersion: asset.version, sourceUri: asset.uri, realPath: path, sourceSha256, byteSize: bytes.byteLength, variables: requestedVariables, header }
  } finally { closeSync(fd) }
}

function delimitedHeader(text: string, delimiter: string): string[] {
  const header: string[] = []
  let value = '', quoted = false, closedQuote = false, end = 0
  for (let index = 0; index < text.length; index++) {
    if (index >= MAX_HEADER_BYTES) throw new Error('The source header exceeds the verification limit.')
    const character = text[index]!
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') { value += '"'; index++ }
        else { quoted = false; closedQuote = true }
      } else value += character
    } else if (character === delimiter || character === '\r' || character === '\n') {
      header.push(value); value = ''; closedQuote = false
      if (header.length > MAX_COLUMNS) throw new Error('The source header contains too many columns.')
      if (character !== delimiter) { end = index + (character === '\r' && text[index + 1] === '\n' ? 2 : 1); break }
    } else if (character === '"' && value.length === 0 && !closedQuote) quoted = true
    else {
      if (closedQuote || character === '"') throw new Error('The source header has malformed quoting.')
      value += character
    }
  }
  if (!end || quoted || !text.slice(end).trim()) throw new Error('The source must contain a complete header and at least one data record.')
  if (header.some(column => !column.trim()) || new Set(header).size !== header.length) throw new Error('The source header has empty or duplicate column names.')
  return header
}
