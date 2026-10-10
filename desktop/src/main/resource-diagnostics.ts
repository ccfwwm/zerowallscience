/** Keep package-manager errors useful while removing credentials from logs. */
export function redactResourceDiagnostic(value: string): string {
  return value
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gu, '[redacted private key]')
    .replace(/https?:\/\/[^\s<>"']+/giu, text => {
      try {
        const url = new URL(text)
        if (url.username || url.password) { url.username = 'redacted'; url.password = 'redacted' }
        for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, '[redacted]')
        return url.toString()
      } catch { return '[redacted URL]' }
    })
    .replace(/(authorization\s*[:=]\s*)(?:Bearer|Basic)\s+[^\s,;]+/giu, '$1[redacted]')
    .replace(/((?:[\w-]*(?:token|secret|password|api[-_]?key)[\w-]*|authorization)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu, '$1[redacted]')
}
