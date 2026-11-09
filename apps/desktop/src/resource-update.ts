/** Resource signatures authenticate unsigned ZeroWall installers independently of the mutable update feed. */
import { createHash, createPublicKey, verify } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'

/** Immutable verification key embedded at build time; the feed cannot replace it. */
export interface ResourceUpdateTrust { readonly keyId: string; readonly publicKey: string }
/** Signed immutable installer metadata. The exact serialized payload is signed with Ed25519. */
export interface ResourceReleasePayload {
  readonly schema: 1
  readonly version: string
  readonly target: 'win-x64'
  readonly signing: 'resource-ed25519'
  readonly files: readonly { readonly key: string; readonly bytes: number; readonly sha256: string }[]
}

/**
 * @param envelope - Network metadata.
 * @param version - Confirmed update version.
 * @param trust - Embedded key.
 * @returns Authenticated payload.
 */
export function verifyResourceRelease(envelope: unknown, version: string, trust: ResourceUpdateTrust): ResourceReleasePayload {
  if (typeof envelope !== 'object' || envelope === null || !('keyId' in envelope) || envelope.keyId !== trust.keyId
    || !('signature' in envelope) || typeof envelope.signature !== 'string' || !('payload' in envelope)) throw new Error('Invalid resource signature envelope')
  const payload = envelope.payload
  if (!verify(null,
    Buffer.from(JSON.stringify(payload)),
    createPublicKey(trust.publicKey),
    Buffer.from(envelope.signature,
      'base64'))) throw new Error('Resource signature mismatch')
  if (typeof payload !== 'object' || payload === null || !('schema' in payload) || payload.schema !== 1 || !('version' in payload) || payload.version !== version
    || !('target' in payload) || payload.target !== 'win-x64' || !('signing' in payload) || payload.signing !== 'resource-ed25519'
    || !('files' in payload) || !Array.isArray(payload.files)) throw new Error('Invalid signed release metadata')
  const files: { key: string; bytes: number; sha256: string }[] = []
  const entries: readonly unknown[] = payload.files
  for (const file of entries) {
    if (typeof file !== 'object' || file === null || !('key' in file) || typeof file.key !== 'string'
      || !file.key.startsWith(`stable/releases/${version}/`) || file.key.includes('..') || !('bytes' in file) || typeof file.bytes !== 'number'
      || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !('sha256' in file) || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(file.sha256)) throw new Error('Invalid signed release file')
    files.push({ key: file.key, bytes: file.bytes, sha256: file.sha256 })
  }
  return { schema: 1, version, target: 'win-x64', signing: 'resource-ed25519', files }
}

/**
 * Authenticate the downloaded EXE against immutable signed metadata on the official origin.
 * @param paths - Files returned by the Windows updater.
 * @param version - Version separately confirmed by the user.
 * @param trust - Public key sealed into the installed application.
 * @returns Completion only after size, signature and SHA-256 agree.
 */
export async function verifyResourceDownload(paths: readonly string[], version: string, trust: ResourceUpdateTrust): Promise<void> {
  if (!/^9\.\d+\.\d+$/u.test(version) || paths.length !== 1 || paths[0] === undefined) throw new Error('Unsupported signed update target')
  const response = await fetch(`https://zerowall.chengxunkeji.cn/stable/releases/${version}/release.json`,
    { redirect: 'error',
      signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error('Signed release metadata unavailable')
  if (response.body === null) throw new Error('Signed release metadata unavailable')
  const chunks: Uint8Array[] = []
  let bytes = 0
  for await (const chunk of response.body) {
    bytes += chunk.byteLength
    if (bytes > 64 * 1024) throw new Error('Signed release metadata exceeds limit')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  const payload = verifyResourceRelease(JSON.parse(text), version, trust)
  const expected = payload.files.filter(file => file.key === `stable/releases/${version}/zerowall-science-${version}-win-x64.exe`)
  if (expected.length !== 1 || expected[0] === undefined || (await stat(paths[0])).size !== expected[0].bytes) throw new Error('Installer size does not match signed release')
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(paths[0])) hash.update(chunk as Buffer)
  if (hash.digest('hex') !== expected[0].sha256) throw new Error('Installer digest does not match signed release')
}
