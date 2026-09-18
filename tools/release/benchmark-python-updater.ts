import { performance, monitorEventLoopDelay } from 'node:perf_hooks'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { extractArchive } from '../../desktop/src/main/python-archive.js'
const work = resolve('.build/python-updater')
const archive = resolve('.build/python-1.4.0/dist/zerowall-python-windows-x64-1.4.0.zip')
await mkdir(work, { recursive: true })
const histogram = monitorEventLoopDelay({ resolution: 20 }); histogram.enable()
let peak = 0; const start = performance.now()
const timer = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss) }, 100)
try {
  await extractArchive(archive, join(work, `extracted-${Date.now()}`), (done, total) => { if (done % 8192 === 0 || done === total) console.log(JSON.stringify({ done, total, seconds: (performance.now() - start) / 1000, rssMiB: process.memoryUsage().rss / 1024 ** 2 })) })
  const report = { elapsedSeconds: (performance.now() - start) / 1000, peakRssMiB: peak / 1024 ** 2, eventLoopP95Ms: histogram.percentile(95) / 1e6, archive }
  await writeFile(join(work, 'archive-benchmark.json'), JSON.stringify(report, null, 2)); console.log(report)
} finally { clearInterval(timer); histogram.disable() }
