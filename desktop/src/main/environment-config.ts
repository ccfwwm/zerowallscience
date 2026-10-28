import { createHash, verify } from 'node:crypto'

export const ENVIRONMENT_CONFIG_URL = 'https://zerowall.chengxunkeji.cn/stable/environment/latest.json'
export const ENVIRONMENT_METADATA_KEY = 'zerowall.environment.meta'
export const ENVIRONMENT_SECRET_PREFIX = 'zerowall.environment.var.'

export interface EnvironmentVault {
  get(key: string): Promise<string | undefined>
  set(key: string, value: string): Promise<void>
  delete?(key: string): Promise<void>
}

export interface EnvironmentProvenanceEntry {
  source: 'official' | 'user'
  suppressed?: boolean
  version?: string
}

export interface EnvironmentProvenance {
  version: 1
  variables: Record<string, EnvironmentProvenanceEntry>
}

interface SignedDocument {
  signature?: { algorithm?: string; keyId?: string; value?: string }
  [key: string]: unknown
}

const RESERVED = new Set(['NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE', 'PATH', 'PATHEXT', 'COMSPEC', 'DSH_HOME', 'ZEROWALL_USER_DATA_DIR'])
const VARIABLE_NAME = /^[A-Z_][A-Z0-9_]{0,127}$/u
const canonical = (value: unknown): unknown => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]))
    : value
const signingBytes = (document: SignedDocument): Buffer => {
  const { signature: _signature, ...payload } = document
  return Buffer.from(JSON.stringify(canonical(payload)))
}
const verifySignature = (document: SignedDocument, publicKeys: Record<string, string>): void => {
  const signature = document.signature
  const key = signature?.keyId ? publicKeys[signature.keyId] : undefined
  if (!key || signature?.algorithm !== 'ed25519' || !verify(null, signingBytes(document), key, Buffer.from(signature.value ?? '', 'base64'))) throw new Error('官方环境配置签名无效')
}
const parseJson = async (response: Response): Promise<SignedDocument> => {
  if (!response.ok) throw new Error(`官方环境配置请求失败：HTTP ${response.status}`)
  return await response.json() as SignedDocument
}
const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const validDocument = (document: SignedDocument): document is SignedDocument & { schema: 1; kind: 'environment-defaults'; version: string; variables: Record<string, string> } => {
  if (document.schema !== 1 || document.kind !== 'environment-defaults' || typeof document.version !== 'string' || !/^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/u.test(document.version)) return false
  if (!document.variables || typeof document.variables !== 'object' || Array.isArray(document.variables)) return false
  if (Object.keys(document.variables).length > 256) return false
  for (const [name, value] of Object.entries(document.variables)) if (!VARIABLE_NAME.test(name) || RESERVED.has(name) || typeof value !== 'string' || value.length === 0 || value.length > 8192 || /[\r\n]/u.test(value)) return false
  return true
}
const readMetadata = async (vault: EnvironmentVault): Promise<EnvironmentProvenance> => {
  try {
    const value = await vault.get(ENVIRONMENT_METADATA_KEY)
    const parsed = value ? JSON.parse(value) as Partial<EnvironmentProvenance> : undefined
    if (parsed?.version === 1 && parsed.variables && typeof parsed.variables === 'object') return { version: 1, variables: { ...parsed.variables } as Record<string, EnvironmentProvenanceEntry> }
  } catch { /* Corrupt or unavailable metadata must not block startup. */ }
  return { version: 1, variables: {} }
}
const saveMetadata = async (vault: EnvironmentVault, metadata: EnvironmentProvenance): Promise<void> => {
  await vault.set(ENVIRONMENT_METADATA_KEY, JSON.stringify(metadata))
}
const credentialKey = (name: string): string => `${ENVIRONMENT_SECRET_PREFIX}${name.toLowerCase()}`
// Host edits the same vault in another process. Values injected by a previous
// hydration are not new shell overrides when that Host is restarted.
const hydratedProcessValues = new WeakMap<EnvironmentVault, Map<string, string | undefined>>()

export interface EnvironmentHydrationResult {
  usedRemote: boolean
  version?: string
  names: string[]
  updatedOfficial: number
  error?: string
}

export async function hydrateOfficialEnvironment(vault: EnvironmentVault, options: {
  url?: string
  publicKeys: Record<string, string>
  fetcher?: typeof fetch
}): Promise<EnvironmentHydrationResult> {
  const previousValues = hydratedProcessValues.get(vault)
  const metadata = await readMetadata(vault)
  const names = new Set(Object.keys(metadata.variables).filter(name => VARIABLE_NAME.test(name)))
  let document: (SignedDocument & { schema: 1; kind: 'environment-defaults'; version: string; variables: Record<string, string> }) | undefined
  let error: string | undefined
  try {
    const fetcher = options.fetcher ?? fetch
    const pointerUrl = new URL(options.url ?? process.env.ZEROWALL_ENVIRONMENT_CONFIG_URL ?? ENVIRONMENT_CONFIG_URL)
    if (pointerUrl.protocol !== 'https:') throw new Error('官方环境配置必须使用 HTTPS')
    const pointerResponse = await fetcher(pointerUrl, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8_000) })
    const pointer = await parseJson(pointerResponse)
    verifySignature(pointer, options.publicKeys)
    if (pointer.schema !== 1 || pointer.kind !== 'environment-pointer' || pointer.resourceKind !== 'environment-config' || typeof pointer.version !== 'string' || !pointer.config || typeof pointer.config !== 'object') throw new Error('官方环境配置指针无效')
    const config = pointer.config as { downloadUrl?: string; size?: number; sha256?: string }
    const configUrl = new URL(config.downloadUrl ?? '')
    if (configUrl.protocol !== 'https:' || configUrl.origin !== pointerUrl.origin || typeof config.size !== 'number' || !Number.isSafeInteger(config.size) || config.size <= 0 || !/^[a-f0-9]{64}$/u.test(config.sha256 ?? '')) throw new Error('官方环境配置对象无效')
    const response = await fetcher(configUrl, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8_000) })
    if (!response.ok) throw new Error(`官方环境配置对象请求失败：HTTP ${response.status}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > 2 * 1024 * 1024) throw new Error('官方环境配置超过大小限制')
    if (bytes.byteLength !== config.size || digest(bytes) !== config.sha256) throw new Error('官方环境配置摘要不匹配')
    const parsed = JSON.parse(Buffer.from(bytes).toString('utf8')) as SignedDocument
    verifySignature(parsed, options.publicKeys)
    if (!validDocument(parsed)) throw new Error('官方环境配置内容无效')
    document = parsed
    for (const name of Object.keys(document.variables)) names.add(name)
  } catch (value) {
    error = value instanceof Error ? value.message : String(value)
  }

  let updatedOfficial = 0
  for (const name of names) {
    const entry = metadata.variables[name]
    const observed = process.env[name]?.trim()
    const inherited = previousValues?.has(name) && previousValues.get(name) === observed ? undefined : observed
    const stored = await vault.get(credentialKey(name)).catch(() => undefined)
    if (entry?.suppressed) {
      if (inherited) {
        await vault.set(credentialKey(name), inherited).catch(() => undefined)
        metadata.variables[name] = { source: 'user' }
        continue
      }
      delete process.env[name]
      if (stored !== undefined && vault.delete) await vault.delete(credentialKey(name)).catch(() => undefined)
      continue
    }
    if (inherited) {
      // Environment values supplied by the launching shell or administrator
      // are local overrides. Persist them when the OS vault is available so
      // the Host process cannot later replace them with a stale cached value.
      await vault.set(credentialKey(name), inherited).catch(() => undefined)
      metadata.variables[name] = { source: 'user' }
      continue
    }
    const remote = document?.variables[name]
    if (entry?.source === 'official' && document && remote !== undefined) {
      if (stored !== remote) { await vault.set(credentialKey(name), remote).catch(() => undefined); updatedOfficial++ }
      process.env[name] = remote
      metadata.variables[name] = { source: 'official', version: document.version }
      continue
    }
    if (entry?.source === 'official' && !document) {
      if (stored !== undefined) process.env[name] = stored
      metadata.variables[name] = { source: 'official', ...(entry.version ? { version: entry.version } : {}) }
      continue
    }
    if (entry?.source === 'official' && document && remote === undefined) {
      if (stored !== undefined && vault.delete) await vault.delete(credentialKey(name)).catch(() => undefined)
      delete process.env[name]
      delete metadata.variables[name]
      continue
    }
    if (entry?.source === 'user') {
      if (stored !== undefined) process.env[name] = stored
      else if (inherited) metadata.variables[name] = { source: 'user' }
      else delete process.env[name]
      continue
    }
    if (stored !== undefined) {
      process.env[name] = stored
      metadata.variables[name] = { source: 'user' }
      continue
    }
    if (remote !== undefined) {
      await vault.set(credentialKey(name), remote).catch(() => undefined)
      process.env[name] = remote
      metadata.variables[name] = { source: 'official', version: document!.version }
      updatedOfficial++
    }
  }
  hydratedProcessValues.set(vault, new Map([...names].map(name => [name, process.env[name]?.trim()])))
  await saveMetadata(vault, metadata).catch(() => undefined)
  return { usedRemote: document !== undefined, version: document?.version, names: [...names].sort(), updatedOfficial, ...(error ? { error } : {}) }
}

export async function readEnvironmentProvenance(vault: EnvironmentVault): Promise<EnvironmentProvenance> { return readMetadata(vault) }
