import { setPriority, constants } from 'node:os'
import { McpEnvironmentController } from './mcp-environment.js'
import { withPythonOperation, checkPythonCancellation } from './python-operation.js'
import { PythonUpdaterService } from './python-updater-service.js'
import { PythonSyncService } from './python-sync.js'
import { PythonEnvironmentApi } from './python-environment-api.js'
try { setPriority(0, constants.priority.PRIORITY_BELOW_NORMAL) } catch { /* host policy */ }
let controller: McpEnvironmentController
let manager: PythonUpdaterService
let sync: PythonSyncService
let api: PythonEnvironmentApi
const operations = new Map<string, AbortController>()
function send(message: object): void { if (process.connected) process.send?.(message, undefined, undefined, () => {}) }
const completions = new Set<Promise<void>>()
let shuttingDown = false
let shutdownPromise: Promise<void> | undefined
function shutdown(): Promise<void> {
  return shutdownPromise ??= (async () => {
    shuttingDown = true
    for (const operation of operations.values()) operation.abort()
    await api?.shutdown(); await manager?.shutdown()
    await Promise.allSettled([...completions])
    process.exit(0)
  })()
}
setInterval(() => send({ type: 'activity', busy: !!manager?.hasPendingWork() || !!api?.hasPendingWork() || operations.size > 0 }), 1000).unref()
const controllerMethods = ['initialize', 'localStatus', 'pythonInfo', 'checkForUpdates', 'checkPythonPackageUpdates', 'installPythonPackage', 'updatePythonPackages', 'selectManual', 'rollback', 'previewPackages', 'previewUninstall', 'applyPackagePlan', 'previewDependencyManifest']
const managerMethods = ['autoUpdate', 'ensureReady', 'pythonInfo', 'pythonCoreInfo', 'pythonPackages', 'taskStatus', 'previewUninstall', 'checkPythonPackageUpdates', 'checkForUpdates', 'updateForUser', 'retry', 'pause', 'cancel', 'installPythonPackage', 'updatePythonPackages', 'selectManual', 'rollback', 'previewPackages', 'previewDependencyManifest', 'applyPackagePlan']
process.on('message', async (message: any) => {
  if (message.type === 'cancel') { operations.get(message.id)?.abort(); return }
  if (message.type === 'configure') {
    const publish = (status: unknown) => send({ type: 'status', status })
    controller = new McpEnvironmentController({ ...message.config, scienceDependencyManifestPath: message.config.manager?.sync?.bundledManifestPath, publish: status => manager ? manager.publish(status) : publish(status) })
    manager = new PythonUpdaterService({ ...message.config, publish, executeOperation: async (method, args, signal) => withPythonOperation(signal, async () => {
      if (!controllerMethods.includes(method)) throw new Error('Unknown updater operation')
      const value = await (controller as any)[method](...args)
      checkPythonCancellation(); return value
    }) })
    if (message.config.manager) {
      const config = message.config.manager
      sync = new PythonSyncService({ ...config.sync, updater: manager })
      api = new PythonEnvironmentApi(message.config.root, manager, sync, config.locationPath, config.applicationInstallRoot, message.config.runtimeRoot)
      manager.setEnvironmentHandler(request => api.request(request))
    }
    send({ type: 'configured', abi: 1 })
    return
  }
  if (message.type === 'shutdown') {
    await shutdown(); return
  }
  if (shuttingDown) return
  let complete!: () => void
  const completion = new Promise<void>(resolve => { complete = resolve })
  completions.add(completion)
  try {
    if (!controller) throw new Error('Python worker is not configured')
    const cancellation = new AbortController(); operations.set(message.id, cancellation)
    const result = await withPythonOperation(cancellation.signal, async () => {
    let result: unknown
    if (message.scope === 'api') {
      if (!api) throw new Error('Python API is not configured')
      if (message.method === 'request') result = await api.request(message.args[0])
      else if (message.method === 'persistRuntimeSummary') result = await api.persistRuntimeSummary(message.args[0])
      else throw new Error('Unknown Python API operation')
    } else if (message.scope === 'sync') {
      if (!sync || !['importManifest', 'checkManifest', 'listLocal', 'previewSync', 'applySync'].includes(message.method)) throw new Error('Unknown Python sync operation')
      result = await (sync as any)[message.method](...(message.args ?? []))
    } else if (message.scope === 'manager') {
      if (!managerMethods.includes(message.method)) throw new Error('Unknown Python manager operation')
      result = await (manager as any)[message.method](...(message.args ?? []))
    } else {
      if (!controllerMethods.includes(message.method)) throw new Error('Unknown updater operation')
      result = await (controller as any)[message.method](...(message.args ?? []))
    }
    checkPythonCancellation(); return result
    })
    send({ type: 'activity', busy: !!manager?.hasPendingWork() || !!api?.hasPendingWork() || operations.size > 0 })
    send({ id: message.id, result })
  } catch (error) { send({ id: message.id, error: error instanceof Error ? error.message : String(error) }) }
  finally { operations.delete(message.id); completions.delete(completion); complete() }
})
process.on('disconnect', () => { void shutdown() })
