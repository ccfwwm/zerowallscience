import { compareVersions } from '../release/resource-catalog.mjs'

/** A plugin's minimum Desktop version is a compatibility floor, not its build version. */
export function assertPluginDesktopCompatibility(range, desktopVersion, label) {
  if (!range || typeof range.min !== 'string') throw new Error(`${label}: missing Desktop compatibility range`)
  if (compareVersions(desktopVersion, range.min) < 0
    || range.max && compareVersions(desktopVersion, range.max) > 0) {
    throw new Error(`${label}: Desktop ${desktopVersion} is outside the plugin compatibility range`)
  }
}
