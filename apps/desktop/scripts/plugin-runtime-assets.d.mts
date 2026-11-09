/** Package-owned physical resource trees selected before ASAR creation. */
export interface PluginRuntimeAssets {
  /** Package directories relative to the prepared Node project. */
  directories: string[]
  /** Files relative to the prepared Node project. */
  files: string[]
}
/**
 * Inventory packages declaring physical resources and validate their required files.
 * @param sourceRoot - Materialized Desktop Node project.
 * @returns Package directories and file paths relative to that project.
 */
export function pluginRuntimeAssets(sourceRoot: string): Promise<PluginRuntimeAssets>
/**
 * Check the physical copies and ASAR records against the prepared resource files.
 * @param sourceRoot - Materialized Desktop Node project.
 * @param resourcesDirectory - Packaged Electron resources directory.
 * @param files - Resource file paths relative to sourceRoot.
 * @returns Resolves after every file is unpacked and byte-identical.
 */
export function verifyPluginRuntimeAssets(sourceRoot: string, resourcesDirectory: string, files: string[]): Promise<void>
