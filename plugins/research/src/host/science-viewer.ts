import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, realpath, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { ArtifactRecord, DataAssetRecord, ProjectRecord, ViewerSessionRecord } from '@zerowallscience/research-store/types'
import type { ScienceViewerRequest, ScienceViewerResponse, SequenceAnalysis, SequenceViewState, SequenceWindow } from '../shared/types.js'
import { analyzeSequence, parseFasta, parseGenBank, sequenceWindow, type NucleotideRecord } from './sequence.js'

const MAX_FASTA_BYTES = 16 * 1024 * 1024
const RUNNER = 'zerowall-sequence/7.0.0-1'

/** One service for UI and Agent access. Callers supply only the resolved session project. */
export class ScienceViewerService {
  constructor(private readonly store: ResearchStore) {}

  async execute(project: ProjectRecord, request: ScienceViewerRequest): Promise<ScienceViewerResponse> {
    if (request.action === 'list') return { assets: this.store.listDataAssets(project.id), viewers: this.store.listViewerSessions(project.id) }
    if (request.action === 'open') {
      const asset = this.asset(project.id, request.assetId)
      const input = await this.read(project, asset)
      const state: SequenceViewState = { recordIndex: 0, start: 1, count: 2400, selectionStart: 1, selectionEnd: Math.min(120, input.records[0]!.sequence.length) }
      const viewer = this.store.createViewerSession({ projectId: project.id, assetId: asset.id, tool: 'sequence', state: { ...state, sourceSha256: input.sha256 } })
      return { viewer, window: this.window(input.records, state) }
    }
    const viewer = this.store.listViewerSessions(project.id).find(item => item.id === request.viewerId)
    if (!viewer || viewer.tool !== 'sequence') throw new Error('Sequence viewer is not in the active project.')
    const asset = this.asset(project.id, viewer.assetId)
    const input = await this.read(project, asset)
    if (viewer.state.sourceSha256 !== input.sha256) throw new Error('Source file changed. Open a new viewer to review the new input; the old revision is retained.')
    if (this.store.listViewerSessions(project.id).find(item => item.id === viewer.id)?.version !== viewer.version) throw new Error('Viewer revision changed while reading the source. Reload the view.')
    if (request.action === 'read') return { viewer, window: this.window(input.records, this.state(viewer.state)) }
    if (request.expectedVersion !== viewer.version) throw new Error(`Viewer revision conflict: current ${viewer.version}. Reload the view before continuing.`)
    if (request.action === 'save') {
      const state = this.state(request.state)
      const window = this.window(input.records, state)
      const updated = this.store.updateViewerSession(project.id, viewer.id, { expectedVersion: viewer.version, state: { ...state, sourceSha256: input.sha256 } })
      return { viewer: updated, window }
    }
    if (request.action !== 'analyze' && request.action !== 'export') throw new Error('Unknown viewer action.')
    if (!request.operation) throw new Error('A sequence operation is required.')
    const state = this.state(viewer.state)
    const analysis = analyzeSequence(input.records, request.operation, state.recordIndex, state.selectionStart, state.selectionEnd, request.crisprTarget, request.crisprMaxMismatches)
    if (request.action === 'analyze') return { viewer, analysis }
    const artifact = await this.export(project, asset, viewer, input.sha256, analysis)
    return { viewer, analysis, artifact }
  }

  private asset(projectId: string, assetId?: string): DataAssetRecord {
    const asset = this.store.listDataAssets(projectId).find(item => item.id === assetId)
    if (!asset) throw new Error('Asset is not in the active project.')
    return asset
  }

  private async read(project: ProjectRecord, asset: DataAssetRecord): Promise<{ records: NucleotideRecord[]; sha256: string }> {
    if (asset.location !== 'local' || !asset.uri.startsWith('file:')) throw new Error('Materialize remote assets through r_files before local sequence viewing.')
    const path = await containedFile(project.rootPath, fileURLToPath(asset.uri))
    if (!/\.(fa|fasta|fna|ffn|frn|gb|gbk)$/iu.test(path)) throw new Error('This viewer currently accepts nucleotide FASTA and GenBank sequence files.')
    const handle = await open(path, 'r')
    try {
      const info = await handle.stat()
      if (!info.isFile() || info.size > MAX_FASTA_BYTES) throw new Error('Interactive FASTA input must be a regular file no larger than 16 MiB; whole genomes require an indexed workflow.')
      // Bounded read also protects against files growing after stat().
      const buffer = Buffer.alloc(Math.min(info.size + 1, MAX_FASTA_BYTES + 1))
      let length = 0
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length)
        if (!bytesRead) break
        length += bytesRead
      }
      const after = await handle.stat()
      if (length !== info.size || after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs) throw new Error('Source changed during reading; retry with a stable input.')
      const bytes = buffer.subarray(0, length)
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      if (asset.checksum) {
        if (!asset.checksumAlgorithm) throw new Error('Asset checksum algorithm is unknown; verify the asset registration first.')
        if (createHash(asset.checksumAlgorithm).update(bytes).digest('hex') !== asset.checksum.toLowerCase()) throw new Error('Source checksum does not match the registered asset.')
      }
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      return { records: /\.(gb|gbk)$/iu.test(path) ? parseGenBank(text) : parseFasta(text), sha256 }
    } finally { await handle.close() }
  }

  private state(value: unknown): SequenceViewState {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Sequence view state is required.')
    const object = value as Record<string, unknown>
    const keys = ['recordIndex', 'start', 'count', 'selectionStart', 'selectionEnd'] as const
    for (const key of keys) if (!Number.isSafeInteger(object[key])) throw new Error(`Invalid view state: ${key}.`)
    return Object.fromEntries(keys.map(key => [key, object[key]])) as unknown as SequenceViewState
  }

  private window(records: NucleotideRecord[], state: SequenceViewState): SequenceWindow {
    const window = sequenceWindow(records, state.recordIndex, state.start, state.count)
    const length = records[state.recordIndex]!.sequence.length
    if (state.selectionStart < 1 || state.selectionEnd < state.selectionStart || state.selectionEnd > length || state.selectionEnd - state.selectionStart + 1 > 100000) throw new Error('Selection must be within the record and no longer than 100,000 bases.')
    return window
  }

  private async export(project: ProjectRecord, asset: DataAssetRecord, viewer: ViewerSessionRecord, sourceSha256: string, analysis: SequenceAnalysis): Promise<ArtifactRecord> {
    const root = await realpath(project.rootPath)
    let directory = root
    for (const component of ['.zerowall', 'science-exports']) {
      const next = join(directory, component)
      try { await mkdir(next) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
      directory = await containedFile(root, next)
    }
    const destination = join(directory, randomUUID())
    await mkdir(destination)
    const manifest = { format: 'zerowall-sequence-result', version: 1, runner: RUNNER, assetId: asset.id, sourceSha256, viewerId: viewer.id, viewerVersion: viewer.version, coordinateSystem: '1-based-inclusive', createdAt: new Date().toISOString(), analysis }
    const result = JSON.stringify(manifest, null, 2) + '\n'
    const path = join(destination, 'result.json')
    try {
      await writeFile(path, result, { flag: 'wx' })
      if (analysis.sequence !== undefined) {
        const header = `>${analysis.operation} record=${analysis.recordIndex + 1} source=${analysis.start}-${analysis.end}`
        await writeFile(join(destination, 'sequence.fasta'), `${header}\n${analysis.sequence.match(/.{1,80}/gu)?.join('\n') ?? ''}\n`, { flag: 'wx' })
      }
      // Check again after asynchronous I/O; never register a stale view as current.
      const current = this.store.listViewerSessions(project.id).find(item => item.id === viewer.id)
      if (current?.version !== viewer.version) throw new Error('Viewer changed during export; retry from the current revision.')
      return this.store.createArtifact({ projectId: project.id, name: `Sequence ${analysis.operation}`, uri: pathToFileURL(path).href, mediaType: 'application/json', checksum: createHash('sha256').update(result).digest('hex'), metadata: { runner: RUNNER, sourceAssetId: asset.id, sourceSha256, viewerId: viewer.id, viewerVersion: viewer.version, parameters: { operation: analysis.operation, recordIndex: analysis.recordIndex, start: analysis.start, end: analysis.end }, ...(analysis.sequence === undefined ? {} : { fastaUri: pathToFileURL(join(destination, 'sequence.fasta')).href }) } })
    } catch (error) {
      await rm(destination, { recursive: true, force: true })
      throw error
    }
  }
}

/** Resolve junctions/symlinks before checking project boundaries. */
export async function containedFile(rootPath: string, path: string): Promise<string> {
  const [root, target] = await Promise.all([realpath(rootPath), realpath(path)])
  const inside = relative(root, target)
  if (inside === '..' || inside.startsWith('../') || inside.startsWith('..\\') || isAbsolute(inside)) throw new Error('Asset path is outside the project workspace.')
  return target
}
