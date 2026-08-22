function isHarnessUrl(rawUrl: string, trustedOrigin: string): boolean {
  try {
    return new URL(rawUrl).origin === trustedOrigin
  } catch {
    return false
  }
}

export function isTrustedAppUrl(rawUrl: string, trustedOrigin: string): boolean {
  try {
    if (new URL(rawUrl).protocol === 'file:') return true
  } catch {
    return false
  }
  return isHarnessUrl(rawUrl, trustedOrigin)
}

export function canGrantWindowPermission(
  permission: string,
  requestingUrl: string | undefined,
  isMainFrame: boolean,
  trustedOrigin: string,
): boolean {
  return permission === 'clipboard-sanitized-write'
    && isMainFrame
    && requestingUrl !== undefined
    && isHarnessUrl(requestingUrl, trustedOrigin)
}
