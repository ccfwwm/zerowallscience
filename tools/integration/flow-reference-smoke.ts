/** Actual FlowService vs independent NumPy/FlowIO. Synthetic data only. */
import { createHash } from 'node:crypto'
import { spawn, execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { cpus, totalmem, platform, release } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { ResearchStore } from '../../store/src/index.js'
import { FlowService } from '../../plugins/research/src/host/flow.js'
import { FLOW_STREAM_LIMITS } from '../../plugins/research/src/host/flow-reader.js'

if (!process.argv.includes('--run')) throw new Error('Pass --run for the million-event synthetic Flow reference.')
const option = (name: string): string | undefined => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1)
const root = resolve(option('--output') ?? join('.build', 'flow-reference', new Date().toISOString().replaceAll(':', '-')))
const python = resolve(option('--python') ?? '.build/flow-reference-venv/Scripts/python.exe')
const referenceScript = resolve('tools/science/flow-reference.py')
await promisify(execFile)(python, [referenceScript, 'generate', root, '--count', option('--count') ?? '1000000'], { maxBuffer: 1024 * 1024 })
const reference = JSON.parse(await readFile(join(root, 'reference.json'), 'utf8'))
const monitoring = spawn(python, [referenceScript, 'monitor', root, '--pid', String(process.pid)], { stdio: 'pipe', windowsHide: true })
const monitoringFinished = new Promise<void>((done, reject) => { monitoring.on('exit', code => code === 0 ? done() : reject(new Error(`Memory monitor exit ${code}`))); monitoring.on('error', reject) })
const store = new ResearchStore(join(root, 'store.sqlite')); const service = new FlowService(store)
const project = store.createProject({ name: 'Million-event synthetic flow reference', rootPath: root })
const asset = store.createDataAsset({ projectId: project.id, name: 'Million synthetic events', uri: pathToFileURL(reference.file.path).href, location: 'local', mediaType: 'application/octet-stream', checksum: reference.file.sha256, checksumAlgorithm: 'sha256' })
const failures: string[] = []; const comparisons: unknown[] = []; const timing: Record<string, number> = {}
const check = (condition: boolean, message: string): void => { if (!condition) failures.push(message) }
const close = (a: unknown, b: unknown, tolerance: number): boolean => typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Math.abs(a - b) <= tolerance
try {
  let started = performance.now(); let opened = await service.execute(project, { sessionId: 'reference', action: 'open', assetId: asset.id }); timing.openMs = performance.now() - started
  const initialPayloadBytes = Buffer.byteLength(JSON.stringify(opened))
  check((opened.dataset?.events.length ?? 0) <= 10000, 'Open RPC exposes the full event matrix instead of a bounded preview.')
  let viewer = opened.viewer!; opened = undefined as never
  for (const item of reference.cases) {
    started = performance.now()
    const result = await service.execute(project, { sessionId: 'reference', action: 'export', viewerId: viewer.id, expectedVersion: viewer.version, ...item.parameters, gates: item.parameters.gates.map((gate: any) => ({ ...gate, boundaryMode: 'gatingml' })) })
    timing[`${item.name}AnalysisAndExportMs`] = performance.now() - started; viewer = result.viewer!
    const actual = result.analysis! as any; const expected = item.reference; const before = failures.length
    check((result.dataset?.events.length ?? 0) <= 10000, `${item.name}: analysis RPC exposes the full event matrix.`)
    let maxPreviewError = 0
    for (let index = 0; index < expected.preview.length; index++) for (const channel of reference.channels) maxPreviewError = Math.max(maxPreviewError, Math.abs(Number(actual.preview[index]?.[channel]) - expected.preview[index][channel]))
    check(Number.isFinite(maxPreviewError) && maxPreviewError <= reference.tolerances.previewAbsolute, `${item.name}: preview max absolute error ${maxPreviewError} exceeds tolerance.`)
    for (const gate of expected.gates) {
      const found = actual.gates.find((value: any) => value.id === gate.id)
      check(found?.count === gate.count, `${item.name}/${gate.id}: count ${found?.count} != reference ${gate.count}.`)
      for (const key of ['fractionOfParent', 'fractionOfTotal']) check(close(found?.[key], gate[key], reference.tolerances.fractionAbsolute), `${item.name}/${gate.id}: ${key} differs.`)
      for (const channel of reference.channels) for (const key of ['mean', 'median']) {
        const value = found?.statistics?.[channel]?.[key]; const target = gate.statistics[channel][key]
        check(target === null ? value === null : close(value, target, reference.tolerances[`${key}Absolute`]), `${item.name}/${gate.id}: ${channel} ${key} missing or differs.`)
      }
    }
    for (const channel of reference.channels) for (const key of ['mean', 'median']) check(close(actual.statistics?.[channel]?.[key], expected.allStatistics[channel][key], reference.tolerances[`${key}Absolute`]), `${item.name}/all: ${channel} ${key} missing or differs.`)
    const artifact = result.artifact!; const bytes = await readFile(fileURLToPath(artifact.uri)); const sha256 = createHash('sha256').update(bytes).digest('hex')
    check(sha256 === artifact.checksum, `${item.name}: artifact hash does not match registered checksum.`)
    comparisons.push({ name: item.name, passed: failures.length === before, maxPreviewError, gates: actual.gates, artifact: { id: artifact.id, uri: artifact.uri, bytes: bytes.length, sha256 }, responseBytes: Buffer.byteLength(JSON.stringify(result)) })
  }
  await writeFile(join(root, 'monitor.stop'), '')
  await monitoringFinished
  const report = { status: failures.length ? 'failed' : 'passed', scope: 'Synthetic source Host numerical/performance benchmark; not packaged Electron, real biological inference or FlowJo compatibility', measuredAt: new Date().toISOString(), hardware: { platform: platform(), release: release(), cpu: cpus()[0]?.model, logicalCpu: cpus().length, totalMemoryBytes: totalmem(), node: process.version }, input: reference.file, events: reference.count, runtime: reference.referenceRuntime, timing, firstScreenMs: null, firstScreenReason: 'Host-only phase; browser display is a separate acceptance check.', initialPayloadBytes, memory: JSON.parse(await readFile(join(root, 'memory.json'), 'utf8')), tolerances: reference.tolerances, comparisons, failures }
  Object.assign(report, { streaming: { runner: 'zerowall-flow/7.0.0-4', limits: FLOW_STREAM_LIMITS, fullEventMatrixRetained: false, median: 'Exact external sorted-column merge; bounded 65536-value runs', memoryScope: 'OS process peak includes tsx, SQLite and imports; not just the analysis arrays.' } })
  await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ status: report.status, root, failures: failures.length, firstFailures: failures.slice(0, 8), timing, peak: report.memory.osPeakWorkingSetBytes }))
  if (failures.length) process.exitCode = 1
} finally { await writeFile(join(root, 'monitor.stop'), ''); await monitoringFinished; store.close() }
