import type { ChildProcess } from 'node:child_process'
import type { PythonUpdaterService } from './python-updater-service.js'

/** Private parent/child IPC; no HTTP endpoint or renderer-supplied method names. */
export function attachPythonBroker(child: ChildProcess, manager: () => PythonUpdaterService): () => void {
  const listener = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    const message = value as { kind?: string; requestId?: string; operation?: string; args?: unknown[] }
    if (message.kind !== 'zerowall-python-request' || typeof message.requestId !== 'string') return
    const dispatch = async (): Promise<unknown> => {
      const args = Array.isArray(message.args) ? message.args : []
      const service = manager()
      const names = (): string[] => {
        if (!Array.isArray(args[0]) || args[0].length > 50 || !args[0].every(item => typeof item === 'string')) throw new Error('Invalid package list')
        return args[0] as string[]
      }
      switch (message.operation) {
        case 'request': {
          const request = args[0]
          if (!request || typeof request !== 'object' || typeof (request as { action?: unknown }).action !== 'string' || typeof (request as { requestId?: unknown }).requestId !== 'string') throw new Error('Invalid Python environment request')
          return service.environmentRequest(request as never)
        }
        case 'info': return service.pythonInfo(typeof args[0] === 'string' ? args[0] : '')
        case 'versions': return service.checkPythonPackageUpdates(names())
        case 'preview':
          if (args[2] !== undefined) throw new Error('ZeroWall 使用唯一共享 Python 环境，不支持独立依赖 profile。')
          return args[1] === 'uninstall' ? service.previewUninstall(names()) : service.previewPackages(names())
        case 'apply':
          if (typeof args[0] !== 'string' || !/^[a-f0-9-]{36}$/u.test(args[0])) throw new Error('Invalid plan id')
          return service.applyPackagePlan(args[0])
        case 'status': return service.taskStatus(typeof args[0] === 'string' ? args[0] : undefined)
        case 'rollback': return service.rollback()
        default: throw new Error('Unknown Python manager operation')
      }
    }
    void dispatch().then(result => { if (child.connected) child.send({ kind: 'zerowall-python-response', requestId: message.requestId, result }) }, error => { if (child.connected) child.send({ kind: 'zerowall-python-response', requestId: message.requestId, error: String(error) }) })
  }
  child.on('message', listener)
  return () => { child.off('message', listener) }
}
