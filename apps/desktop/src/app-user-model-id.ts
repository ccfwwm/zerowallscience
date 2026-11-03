/** Resolve the Windows shell identity from packaged app metadata. */
export const DEFAULT_DESKTOP_APP_USER_MODEL_ID = 'com.zerowallscience.desktop'

/**
 * Read the packaged Windows identity, using the development identity when metadata is absent.
 * @param manifest - Parsed application package manifest.
 * @returns Application identifier shared by Windows taskbar grouping and shortcuts.
 */
export function resolveDesktopAppUserModelId(manifest: unknown): string {
  if (typeof manifest !== 'object' || manifest === null || !('dshDesktopAppId' in manifest)) {
    return DEFAULT_DESKTOP_APP_USER_MODEL_ID
  }
  const appId = manifest.dshDesktopAppId
  return typeof appId === 'string' && /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u.test(appId)
    ? appId
    : DEFAULT_DESKTOP_APP_USER_MODEL_ID
}
