import { AsyncLocalStorage } from 'node:async_hooks'
import { spawn, type ChildProcess } from 'node:child_process'

const operation = new AsyncLocalStorage<AbortSignal>()
export const withPythonOperation = <T>(signal: AbortSignal, run: () => T): T => operation.run(signal, run)
export function checkPythonCancellation(): void {
  if (operation.getStore()?.aborted) throw new Error('PYTHON_OPERATION_CANCELLED: 用户已取消任务。')
}
export function pythonOperationSignal(timeoutMs: number): AbortSignal {
  const signal = operation.getStore()
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)
}
/** Cooperatively stop the subprocess tree while allowing the worker to restore
 * its file journal and release the writer lock in finally. */
export const operationSpawn: typeof spawn = ((...args: Parameters<typeof spawn>): ChildProcess => {
  checkPythonCancellation()
  const child = (spawn as (...values: Parameters<typeof spawn>) => ChildProcess)(...args)
  const signal = operation.getStore()
  const cancel = () => {
    if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill())
    else child.kill()
  }
  signal?.addEventListener('abort', cancel, { once: true })
  const release = () => signal?.removeEventListener('abort', cancel)
  child.once('close', release); child.once('error', release)
  if (signal?.aborted) cancel()
  return child
}) as typeof spawn
