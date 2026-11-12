/** Import the factory without evaluating an ordinary release configuration. */
export { createElectronBuilderConfig } from '../electron-builder.config.mjs'

/** Verify updater dependencies are present and ZeroWall runtime packages remain under `dsh`. */
export function verifyWindowsUpdaterDependencies(archiveEntries: string[]): void
