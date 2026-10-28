import { createHash, verify } from 'node:crypto'

export const OFFICIAL_ENVIRONMENT_CONFIG_URL = 'https://zerowall.chengxunkeji.cn/stable/environment/latest.json'
const TRUSTED_KEYS: Record<string, string> = {
  'stable-3': '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA9DJ9yg3F5f67/cEE54AdIDtQshvLP0SF5gVe3F3X+wA=\n-----END PUBLIC KEY-----',
  'stable-4': '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAc7+fa5e2mZ6qTFuJEdkYnYYqbSo1Csc7YgvfvJD6LYU=\n-----END PUBLIC KEY-----',
}
const RESERVED = new Set(['NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE', 'PATH', 'PATHEXT', 'COMSPEC', 'DSH_HOME', 'ZEROWALL_USER_DATA_DIR'])
const VARIABLE_NAME = /^[A-Z_][A-Z0-9_]{0,127}$/u
const canonical = (value: unknown): unknown => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]))
    : value
const signingBytes = (document: Record<string, unknown>): Buffer => {
  const { signature: _signature, ...payload } = document
  return Buffer.from(JSON.stringify(canonical(payload)))
}
function verifySigned(document: Record<string, unknown>): void {
  const signature = document.signature as { algorithm?: string; keyId?: string; value?: string } | undefined
  const key = signature?.keyId ? TRUSTED_KEYS[signature.keyId] : undefined
  if (!key || signature?.algorithm !== 'ed25519' || !verify(null, signingBytes(document), key, Buffer.from(signature.value ?? '', 'base64'))) throw new Error('官方环境配置签名无效')
}

export interface OfficialEnvironmentConfig {
  version: string
  variables: Record<string, string>
}

export async function fetchOfficialEnvironment(fetcher: typeof fetch = fetch): Promise<OfficialEnvironmentConfig> {
  const pointerUrl = new URL(process.env.ZEROWALL_ENVIRONMENT_CONFIG_URL ?? OFFICIAL_ENVIRONMENT_CONFIG_URL)
  if (pointerUrl.protocol !== 'https:') throw new Error('官方环境配置必须使用 HTTPS')
  const pointerResponse = await fetcher(pointerUrl, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  if (!pointerResponse.ok) throw new Error(`官方环境配置请求失败：HTTP ${pointerResponse.status}`)
  const pointer = await pointerResponse.json() as Record<string, unknown>
  verifySigned(pointer)
  if (pointer.schema !== 1 || pointer.kind !== 'environment-pointer' || pointer.resourceKind !== 'environment-config' || typeof pointer.version !== 'string' || !pointer.config || typeof pointer.config !== 'object') throw new Error('官方环境配置指针无效')
  const config = pointer.config as { downloadUrl?: string; size?: number; sha256?: string }
  const configUrl = new URL(config.downloadUrl ?? '')
  if (configUrl.protocol !== 'https:' || configUrl.origin !== pointerUrl.origin || typeof config.size !== 'number' || !Number.isSafeInteger(config.size) || config.size <= 0 || !/^[a-f0-9]{64}$/u.test(config.sha256 ?? '')) throw new Error('官方环境配置对象无效')
  const response = await fetcher(configUrl, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`官方环境配置对象请求失败：HTTP ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  const hash = createHash('sha256').update(bytes).digest('hex')
  if (bytes.byteLength !== config.size || hash !== config.sha256) throw new Error('官方环境配置摘要不匹配')
  const document = JSON.parse(Buffer.from(bytes).toString('utf8')) as Record<string, unknown>
  verifySigned(document)
  if (document.schema !== 1 || document.kind !== 'environment-defaults' || typeof document.version !== 'string' || !/^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/u.test(document.version) || !document.variables || typeof document.variables !== 'object' || Array.isArray(document.variables)) throw new Error('官方环境配置内容无效')
  const variables = document.variables as Record<string, unknown>
  if (Object.keys(variables).length > 256) throw new Error('官方环境配置变量数量超过限制')
  for (const [name, value] of Object.entries(variables)) if (!VARIABLE_NAME.test(name) || RESERVED.has(name) || typeof value !== 'string' || value.length === 0 || value.length > 8192 || /[\r\n]/u.test(value)) throw new Error(`官方环境配置变量无效：${name}`)
  return { version: document.version, variables: variables as Record<string, string> }
}
