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
