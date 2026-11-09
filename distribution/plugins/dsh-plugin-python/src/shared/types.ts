export type ZeroWallPluginTypes = Record<string, never>

/** JSON data returned by the Python management service. */
export type ManagementValue = null | boolean | number | string | ManagementValue[] | { [key: string]: ManagementValue }

/** Management responses preserve their request identifier and action-specific fields. */
export type PythonManagementResponse = { requestId: string; [key: string]: ManagementValue }

import type { PythonDependencyLayer } from './contracts.js'
export type { PythonDependencyLayer } from './contracts.js'
export interface PythonEnvironmentRequest {
  action: 'status' | 'scan_local' | 'open_shell' | 'install_runtime' | 'task_status' | 'cancel' | 'check_manifest' | 'preview_sync' | 'apply_sync' | 'sync' | 'install_package' | 'uninstall_package' | 'search_package' | 'check_package_updates' | 'list_packages' | 'configure' | 'diagnose' | 'rollback'
  requestId: string
  taskId?: (string) | undefined
  layer?: (PythonDependencyLayer) | undefined
  packageSpec?: (string) | undefined
  packageName?: (string) | undefined
  packageNames?: (string[]) | undefined
  capabilityId?: (string) | undefined
  planId?: (string) | undefined
  manifestRevision?: (string) | undefined
  mirrorUrl?: (string) | undefined
  /** Rejected by configure; the carrier supplies interpreter and dependency locations. */
  runtimeRoot?: (string) | undefined
  query?: (string) | undefined
  offset?: (number) | undefined
  limit?: (number) | undefined
  expectedRevision?: (number) | undefined
  confirm?: (boolean) | undefined
  /** Startup preparation installs the locked core dependency set automatically. */
  automatic?: (boolean) | undefined
}
