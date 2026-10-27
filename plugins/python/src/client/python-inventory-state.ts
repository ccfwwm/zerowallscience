import type { McpPythonInfo } from '../../../base/src/client/desktop-api.js'

/** A transient scan failure must not turn a detected environment into missing. */
export function mergePythonInventory(previous: McpPythonInfo | undefined, next: McpPythonInfo): McpPythonInfo {
  const sameRoot = previous?.runtimeRoot === next.runtimeRoot
  if (sameRoot && previous?.inventoryComplete && (!next.inventoryComplete || (next.scannedAt && previous.scannedAt && next.scannedAt < previous.scannedAt))) return previous
  return next
}

export function coreNeedsInstallation(info: McpPythonInfo | undefined): boolean {
  return info?.inventoryComplete === true && info.ready && (info.officialPackageCount ?? 0) > 0 && (info.missingCorePackages?.length ?? 0) > 0
}

export function pythonTaskProgressPercent(task: { state: string; completedPackages?: number; totalPackages?: number } | undefined): number | undefined {
  if (!task) return undefined
  if (task.state === 'succeeded' || task.state === 'partial') return 100
  if (!task.totalPackages) return 0
  return Math.min(99, Math.floor((task.completedPackages ?? 0) / task.totalPackages * 100))
}
