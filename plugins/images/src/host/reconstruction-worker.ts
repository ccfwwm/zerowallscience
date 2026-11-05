import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { resolveFixedPythonRuntime } from '../../../python/src/shared/runtime-path.js'
import { spawnWithRuntimeLease } from '../../../python/src/shared/runtime-process.js'
import { MAX_RECONSTRUCTION_CONCURRENCY } from './reconstruction-concurrency.js'

interface Worker {
  child: ReturnType<typeof spawnWithRuntimeLease>; key: string; busy: boolean; dead: boolean; stderr: string
  finish?: ((error?: Error) => void) | undefined; idleTimer?: ReturnType<typeof setTimeout>
}
const workers = new Set<Worker>()

export function disposeReconstructionWorkers(): void {
  for (const worker of workers) {
    worker.dead = true; clearTimeout(worker.idleTimer); worker.child.kill()
    worker.finish?.(new Error('Reconstruction worker stopped.'))
  }
  workers.clear()
}

export async function runReconstructionWorker(request: string, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  const runtime = await resolveFixedPythonRuntime()
  const script = fileURLToPath(new URL('../scripts/ppt-reconstruct.py', import.meta.url))
  const revision = await readFile(join(runtime.root, 'runtime.json')).then(bytes => createHash('sha256').update(bytes).digest('hex'), () => 'missing')
  const key = JSON.stringify([runtime, script, revision])
  let worker = [...workers].find(item => !item.busy && !item.dead && item.key === key)
  for (const old of workers) if (!old.busy && old.key !== key) {
    old.dead = true; clearTimeout(old.idleTimer); old.child.kill(); workers.delete(old)
  }
  if (!worker) {
    if ([...workers].filter(item => !item.dead).length >= MAX_RECONSTRUCTION_CONCURRENCY) throw new Error('Local reconstruction worker limit exceeded.')
    const code = `import sys,runpy\nsys.path.insert(0,${JSON.stringify(runtime.sitePackages)})\nsys.argv=[${JSON.stringify(script)},'--server']\nrunpy.run_path(sys.argv[0],run_name='__main__')`
    const child = spawnWithRuntimeLease(runtime.executable, ['-I', '-u', '-c', code], {
      windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONNOUSERSITE: '1', OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1' }
    })
    worker = { child, key, busy: false, dead: false, stderr: '' }; workers.add(worker)
    const current = worker
    child.stderr?.on('data', chunk => { current.stderr = (current.stderr + chunk.toString()).slice(-4096) })
    child.once('error', error => { current.dead = true; workers.delete(current); current.finish?.(error) })
    child.once('close', code => {
      current.dead = true; workers.delete(current)
      current.finish?.(new Error(`Reconstruction worker exited (${code}): ${current.stderr.slice(-1200)}`))
    })
  }
  const current = worker; current.busy = true; clearTimeout(current.idleTimer)
  await new Promise<void>((resolve, reject) => {
    const id = randomUUID(), lines = createInterface({ input: current.child.stdout! }); let settled = false
    const abort = () => { current.dead = true; current.child.kill(); finish(new Error('Reconstruction cancelled.')) }
    const timer = setTimeout(() => { current.dead = true; current.child.kill(); finish(new Error('Reconstruction exceeded the 5 minute stage budget.')) }, 300_000)
    function finish(error?: Error) {
      if (settled) return
      settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort); lines.close()
      current.finish = undefined; current.busy = false
      if (!current.dead) current.idleTimer = setTimeout(() => {
        current.dead = true; current.child.kill(); workers.delete(current)
      }, 300_000).unref()
      if (error) reject(error); else resolve()
    }
    current.finish = finish
    lines.on('line', line => {
      let result: any; try { result = JSON.parse(line) } catch { return }
      if (result.id === id) finish(result.ok ? undefined : new Error(String(result.error || 'Reconstruction failed.')))
    })
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) { abort(); return }
    current.child.stdin!.write(`${JSON.stringify({ id, request })}\n`, error => { if (error) finish(error) })
  })
}
