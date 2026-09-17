function isHarnessUrl(rawUrl: string, trustedOrigin: string): boolean {
  try {
    return new URL(rawUrl).origin === trustedOrigin
  } catch {
    return false
  }
}

/** Only Zotero's item selection and PDF viewer protocols may launch externally. */
export function isZoteroOpenUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length < 2048
    && /^zotero:\/\/(?:select|open-pdf)\/(?:library|groups\/[1-9]\d*)\/items\/[A-Z0-9]{8}(?:\?(?:page=\d+|annotation=[A-Z0-9]{8})(?:&(?:page=\d+|annotation=[A-Z0-9]{8}))*)?$/u.test(value)
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
