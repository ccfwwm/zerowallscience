import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

export const TOOLUNIVERSE_TRUSTED_URL = 'https://rmcp.chengxunkeji.cn/r-platform/mcp'
const TOOLUNIVERSE_LEGACY_URLS = new Set([
  'http://103.217.185.141:8099/r-platform/mcp',
])

export function normalizeToolUniverseUrl(value: string | undefined): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const raw = value.trim().replace(/\/+$/u, '')
  if (raw === TOOLUNIVERSE_TRUSTED_URL || raw === TOOLUNIVERSE_TRUSTED_URL.replace(/\/+$/u, '')) return TOOLUNIVERSE_TRUSTED_URL
  if (TOOLUNIVERSE_LEGACY_URLS.has(raw)) return TOOLUNIVERSE_TRUSTED_URL
  return undefined
}
const forbidden = /api[_-]?key|password|secret|credential|authorization|access[_-]?token|^token$/iu
export function rejectToolUniverseSecretArguments(value: unknown): void {
  if (Array.isArray(value)) { for (const item of value) rejectToolUniverseSecretArguments(item); return }
  if (value === null || typeof value !== 'object') return
  for (const [key, item] of Object.entries(value)) {
    if (forbidden.test(key)) throw new Error('CREDENTIAL_ARGUMENT_FORBIDDEN: configure database credential references in Environment settings.')
    rejectToolUniverseSecretArguments(item)
  }
}
type Connection = { serverName: string; url?: string; transport: string; enabled: boolean; envRefs: Record<string, string> }
export async function resolveToolUniverseCredentials(record: Connection, resolve: (ref: string) => Promise<string | undefined>): Promise<Record<string, string>> {
  if (record.serverName !== 'rmcp' || record.transport !== 'streamable-http' || normalizeToolUniverseUrl(record.url) === undefined || !record.enabled) throw new Error('UNTRUSTED_TOOLUNIVERSE_ENDPOINT')
  const credentials: Record<string, string> = {}
  for (const [name, ref] of Object.entries(record.envRefs)) {
    if (!/^[A-Z][A-Z0-9_]{0,99}(KEY|TOKEN|PASSWORD|SECRET|EMAIL|USERNAME|CLIENT_ID|CLIENT_SECRET|USER)$/u.test(name) || /^(R_PLATFORM_|TOOLUNIVERSE_|BIOMNI_|OMICVERSE_)/u.test(name)) continue
    const value = await resolve(ref)
    if (typeof value !== 'string' || !value.length || value.length > 8192) throw new Error(`MISSING_TOOLUNIVERSE_CREDENTIAL: ${name}`)
    credentials[name] = value
  }
  if (Object.keys(credentials).length > 32) throw new Error('TOO_MANY_TOOLUNIVERSE_CREDENTIALS')
  return credentials
}

// This short-lived client carries request-scoped secrets only. It never persists
// a connection, model argument, transcript block, or credential-bearing retry.
export async function callToolUniverse(input: { url: string; authorization: string; operation: string; arguments: Record<string, unknown>; credentials: Record<string, string>; signal?: AbortSignal }) {
  const trustedUrl = normalizeToolUniverseUrl(input.url)
  if (trustedUrl === undefined || !(input.operation === 'tooluniverse.run.tool' || input.operation.startsWith('tooluniverse.tool.'))) throw new Error('INVALID_TOOLUNIVERSE_CREDENTIAL_TARGET')
  rejectToolUniverseSecretArguments(input.arguments)
  const client = new Client({ name: 'zerowall-tooluniverse', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(trustedUrl), { requestInit: { headers: { Authorization: input.authorization }, redirect: 'error' } })
  try {
    const options = { ...(input.signal ? { signal: input.signal } : {}), timeout: 45000 }
    await client.connect(transport, options)
    return await client.callTool({ name: 'tooluniverse_execute', arguments: { action: input.operation, arguments: input.arguments }, _meta: { 'zerowall.tooluniverse.credentials': input.credentials } }, options)
  } catch {
    // Transport errors can contain request data. Keep uncertain submissions
    // recoverable using the original idempotency key without exposing metadata.
    throw new Error('TOOLUNIVERSE_TRANSPORT_FAILED: inspect job history using the original request_id before retrying.')
  } finally {
    for (const name of Object.keys(input.credentials)) delete input.credentials[name]
    await client.close().catch(() => undefined)
  }
}
