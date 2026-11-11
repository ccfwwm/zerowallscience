/** Host-owned release facts for the Bootstrap ready handshake. */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read the selected runtime's identity before announcing readiness.
 * @param directory - Production package directory selected by Bootstrap.
 * @returns Version, source and protocol read from that runtime's descriptor.
 */
export async function readHostRuntimeIdentity(directory: string): Promise<{
  source: 'bundled' | 'external'
  version: string
  protocolVersion: string
}> {
  let external: unknown
  try { external = JSON.parse(await readFile(join(directory, 'host-runtime.json'), 'utf8')) }
  catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  if (external !== undefined) {
    if (!record(external) || typeof external.runtimeVersion !== 'string' || typeof external.hostProtocolVersion !== 'string') {
      throw new Error('desktop host: invalid external runtime identity')
    }
    return { source: 'external', version: external.runtimeVersion, protocolVersion: external.hostProtocolVersion }
  }
  const descriptor: unknown = JSON.parse(await readFile(join(directory, 'desktop-runtime.json'), 'utf8'))
  if (!record(descriptor) || !record(descriptor.release) || typeof descriptor.release.hostProtocolVersion !== 'number') {
    throw new Error('desktop host: invalid bundled runtime identity')
  }
  const version = descriptor.release.productVersion ?? descriptor.release.version
  if (typeof version !== 'string') throw new Error('desktop host: missing bundled runtime version')
  return { source: 'bundled', version, protocolVersion: String(descriptor.release.hostProtocolVersion) }
}
