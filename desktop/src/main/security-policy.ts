function isHarnessUrl(rawUrl: string, trustedUrl: string): boolean {
  try {
    return new URL(rawUrl).origin === new URL(trustedUrl).origin
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

/** Only the active Harness page may request microphone audio. */
export function canGrantMicrophonePermission(
  requestingUrl: string | undefined,
  isMainFrame: boolean,
  mediaTypes: readonly string[],
  trustedOrigin: string,
): boolean {
  return isMainFrame
    && requestingUrl !== undefined
    && isHarnessUrl(requestingUrl, trustedOrigin)
    && mediaTypes.length === 1
    && mediaTypes[0] === 'audio'
}
