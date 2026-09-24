import { setPriority, constants } from 'node:os'
import { McpEnvironmentController } from './mcp-environment.js'
try { setPriority(0, constants.priority.PRIORITY_BELOW_NORMAL) } catch { /* host policy */ }
let controller: McpEnvironmentController
process.on('message', async (message: any) => {
  if (message.type === 'configure') {
    controller = new McpEnvironmentController({ ...message.config, publish: status => process.send?.({ type: 'status', status }) })
    return
  }
  try {
    const allowed = ['initialize', 'localStatus', 'pythonInfo', 'checkForUpdates', 'checkPythonPackageUpdates', 'installPythonPackage', 'updatePythonPackages', 'selectManual', 'rollback', 'previewPackages', 'previewUninstall', 'applyPackagePlan', 'previewDependencyManifest']
    if (!controller || !allowed.includes(message.method)) throw new Error('Unknown updater operation')
    const result = await (controller as any)[message.method](...(message.args ?? []))
    process.send?.({ id: message.id, result })
  } catch (error) { process.send?.({ id: message.id, error: error instanceof Error ? error.message : String(error) }) }
})
process.on('disconnect', () => process.exit(0))
