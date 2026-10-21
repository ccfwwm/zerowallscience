/** Bounded diagnostics only. Full request bytes and credentials never cross the UI boundary. */
export function safeMediaValue(value: unknown, secrets: string[] = [], depth = 0): any {
  if (depth > 10) return '[nested content omitted]'
  if (typeof value === 'string') {
    let text = value
    for (const secret of secrets.filter(Boolean)) text = text.split(secret).join('[credential omitted]')
    if (text.startsWith('data:') || text.length > 4096 || /^[A-Za-z0-9+/]{128,}={0,2}$/.test(text)) return '[encoded or long content omitted]'
    if (/[A-Za-z]:\\|(?:file|ftp):\/\//i.test(text) || text.startsWith('/') && !text.startsWith('/v1/')) return '[internal path omitted]'
    text = text.replace(/Bearer\s+\S+|\bsk-[A-Za-z0-9_-]+/gi, '[credential omitted]')
    return text.replace(/https?:\/\/[^\s"<>]+/g, raw => { try { const url = new URL(raw); url.username = ''; url.password = ''; url.search = ''; url.hash = ''; return url.href } catch { return '[location omitted]' } })
  }
  if (Array.isArray(value)) return value.slice(0, 100).map(v => safeMediaValue(v, secrets, depth + 1))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 200).map(([k, v]) => [k, /secret|token|password|authorization|cookie|api.?key|b64|base64|credential|private.?key/i.test(k) ? '[redacted]' : safeMediaValue(v, secrets, depth + 1)]))
  return value
}

/** Authenticated download locations remain Host-only, including in diagnostic replies. */
export function safeMediaResponse(value: unknown, secrets: string[]): any {
  const clean = safeMediaValue(value, secrets)
  const removeLocations = (v: any): any => Array.isArray(v) ? v.map(removeLocations) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).filter(([k]) => !['content_url','submission','upstream_model','execution_template','template_rules','binding_versions','account_id','upstream_request'].includes(k)).map(([k, item]) => [k, removeLocations(item)])) : v
  return removeLocations(clean)
}
