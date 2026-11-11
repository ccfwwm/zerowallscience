/** Signed, restart-activated Host Runtime selection and recovery. */

import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import { valid } from 'semver'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { DESKTOP_RUNTIME_FILE } from './runtime-tree.ts'
import { verifyHostRuntimeFiles } from './host-runtime-integrity.ts'

export const HOST_RUNTIME_MANIFEST_FILE = 'host-runtime.json'
export const HOST_RUNTIME_STATE_FILE = 'state.json'
export const HOST_RUNTIME_SCHEMA_VERSION = 1 as const
export const HOST_RUNTIME_ARCHIVE_FILE = 'host-runtime.tgz'
export const HOST_RUNTIME_ARCHIVE_PATH = '.update/host-runtime.tgz'
export const BUNDLED_HOST_RUNTIME_PATH = 'bundled'

/** Runtime compatibility facts supplied by the installed Desktop. */
export interface HostRuntimeCompatibility {
  readonly productVersion: string
  readonly dshVersion: string
  readonly hostProtocolVersion: string
  readonly electronVersion: string
  readonly nodeAbi: string
  readonly libreOfficeKitVersion: string
  readonly pnpmVersion: string
  readonly pythonVersion: string
  readonly platform: 'win32'
  readonly arch: 'x64'
}

/** Signed descriptor for one immutable Host Runtime directory. */
export interface HostRuntimeManifest {
  readonly schemaVersion: typeof HOST_RUNTIME_SCHEMA_VERSION
  readonly product: 'zerowall-science'
  readonly runtimeVersion: string
  readonly productVersion: string
  readonly platform: NodeJS.Platform
  readonly arch: string
  readonly dshVersion: string
  readonly hostProtocolVersion: string
  readonly electronVersion: string
  readonly nodeAbi: string
  readonly libreOfficeKitVersion: string
  readonly pnpmVersion: string
  readonly pythonVersion: string
  readonly payload: { readonly path: string; readonly bytes: number; readonly sha256: string }
  readonly signature: { readonly algorithm: 'ed25519'; readonly keyId: string; readonly value: string }
}

/** Durable activation state kept outside the installed Desktop directory. */
export interface HostRuntimeState {
  readonly schemaVersion: typeof HOST_RUNTIME_SCHEMA_VERSION
  readonly active: { readonly version: string; readonly path: string; readonly verifiedAt: string }
  readonly previous?: { readonly version: string; readonly path: string }
  readonly pending?: { readonly version: string; readonly path: string; readonly phase: 'staged' | 'activating' }
  readonly lastFailure?: { readonly version: string; readonly phase: string; readonly code: string; readonly at: string }
}

/** Runtime selected for one Host launch. */
export interface HostRuntimeSelection {
  readonly runtimeDir: string
  readonly source: 'bundled' | 'external'
  readonly version?: string
}

/** Resolver result, including whether a damaged external generation was bypassed. */
export interface HostRuntimeResolution {
  readonly selection: HostRuntimeSelection
  readonly state?: HostRuntimeState
  readonly ignoredExternal?: string
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function relativeRuntimePath(value: unknown): value is string {
  return nonEmptyString(value) && !isAbsolute(value) && !value.includes('\\') && !value.includes(':')
    && !value.split('/').some(part => part === '' || part === '.' || part === '..')
}

function safeVersion(value: unknown, field: string): string {
  if (typeof value !== 'string' || valid(value) === null) throw new Error(`host runtime: invalid ${field}`)
  return value
}

function sha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
}

/** Parse and validate one Host Runtime manifest from JSON data. */
export function parseHostRuntimeManifest(value: unknown): HostRuntimeManifest {
  if (!record(value) || value.schemaVersion !== HOST_RUNTIME_SCHEMA_VERSION || value.product !== 'zerowall-science'
    || !nonEmptyString(value.runtimeVersion) || valid(value.runtimeVersion) === null
    || !nonEmptyString(value.productVersion) || valid(value.productVersion) === null
    || value.platform !== 'win32' || value.arch !== 'x64'
    || !nonEmptyString(value.dshVersion) || valid(value.dshVersion) === null
    || !nonEmptyString(value.hostProtocolVersion) || !nonEmptyString(value.electronVersion)
    || !nonEmptyString(value.nodeAbi) || !nonEmptyString(value.libreOfficeKitVersion)
    || !nonEmptyString(value.pnpmVersion) || !nonEmptyString(value.pythonVersion)
    || !record(value.payload) || !relativeRuntimePath(value.payload.path)
    || typeof value.payload.bytes !== 'number' || !Number.isSafeInteger(value.payload.bytes) || value.payload.bytes <= 0
    || !sha256(value.payload.sha256) || !record(value.signature) || value.signature.algorithm !== 'ed25519'
    || !nonEmptyString(value.signature.keyId) || !nonEmptyString(value.signature.value)) {
    throw new Error('host runtime: invalid manifest')
  }
  return {
    schemaVersion: HOST_RUNTIME_SCHEMA_VERSION,
    product: 'zerowall-science',
    runtimeVersion: safeVersion(value.runtimeVersion, 'runtimeVersion'),
    productVersion: safeVersion(value.productVersion, 'productVersion'),
    platform: 'win32',
    arch: 'x64',
    dshVersion: safeVersion(value.dshVersion, 'dshVersion'),
    hostProtocolVersion: value.hostProtocolVersion,
    electronVersion: value.electronVersion,
    nodeAbi: value.nodeAbi,
    libreOfficeKitVersion: value.libreOfficeKitVersion,
    pnpmVersion: value.pnpmVersion,
    pythonVersion: value.pythonVersion,
    payload: { path: value.payload.path, bytes: value.payload.bytes, sha256: value.payload.sha256 },
    signature: { algorithm: 'ed25519', keyId: value.signature.keyId, value: value.signature.value },
  }
}

/** Canonical signed bytes for a parsed manifest. */
export function hostRuntimeManifestPayload(manifest: HostRuntimeManifest): string {
  const { signature: _signature, ...payload } = manifest
  return JSON.stringify(payload)
}

/** Verify an Ed25519 signature over the manifest payload. */
export function verifyHostRuntimeManifest(value: unknown, publicKey: string | Buffer): HostRuntimeManifest {
  const manifest = parseHostRuntimeManifest(value)
  const key = createPublicKey(publicKey)
  const signature = Buffer.from(manifest.signature.value, 'base64')
  if (!verifySignature(null, Buffer.from(hostRuntimeManifestPayload(manifest)), key, signature)) {
    throw new Error('host runtime: manifest signature mismatch')
  }
  return manifest
}

/** Ensure one runtime version maps to a child directory of the store. */
export function hostRuntimePath(root: string, version: string): string {
  const safe = safeVersion(version, 'runtimeVersion')
  const path = join(root, safe)
  const rel = relative(root, path)
  if (rel === '' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('host runtime: invalid runtime path')
  return path
}

function runtimeStatePath(value: unknown): value is string {
  return value === BUNDLED_HOST_RUNTIME_PATH || relativeRuntimePath(value)
}

/** Parse a persisted selection, rejecting unsafe paths before filesystem access. */
export function parseHostRuntimeState(value: unknown): HostRuntimeState {
  if (!record(value) || value.schemaVersion !== HOST_RUNTIME_SCHEMA_VERSION || !record(value.active)
    || !nonEmptyString(value.active.version) || valid(value.active.version) === null || !runtimeStatePath(value.active.path)
    || !nonEmptyString(value.active.verifiedAt)) throw new Error('host runtime: invalid state')
  const state: HostRuntimeState = {
    schemaVersion: HOST_RUNTIME_SCHEMA_VERSION,
    active: { version: value.active.version, path: value.active.path, verifiedAt: value.active.verifiedAt },
  }
  if (value.previous !== undefined) {
    if (!record(value.previous) || !nonEmptyString(value.previous.version)
      || valid(value.previous.version) === null || !runtimeStatePath(value.previous.path)) {
      throw new Error('host runtime: invalid previous state')
    }
    Object.assign(state, { previous: { version: value.previous.version, path: value.previous.path } })
  }
  if (value.pending !== undefined) {
    if (!record(value.pending) || !nonEmptyString(value.pending.version) || valid(value.pending.version) === null
      || !relativeRuntimePath(value.pending.path)
      || !['staged', 'activating'].includes(String(value.pending.phase))) throw new Error('host runtime: invalid pending state')
    Object.assign(state, { pending: { version: value.pending.version, path: value.pending.path, phase: value.pending.phase as 'staged' | 'activating' } })
  }
  if (value.lastFailure !== undefined) {
    if (!record(value.lastFailure) || !nonEmptyString(value.lastFailure.version) || !nonEmptyString(value.lastFailure.phase)
      || !nonEmptyString(value.lastFailure.code) || !nonEmptyString(value.lastFailure.at)) throw new Error('host runtime: invalid failure state')
    Object.assign(state, { lastFailure: { version: value.lastFailure.version, phase: value.lastFailure.phase,
      code: value.lastFailure.code, at: value.lastFailure.at } })
  }
  return state
}

/** Read persisted Host Runtime state, returning undefined before the first activation. */
export async function readHostRuntimeState(root: string): Promise<HostRuntimeState | undefined> {
  try {
    return parseHostRuntimeState(JSON.parse(await readFile(join(root, HOST_RUNTIME_STATE_FILE), 'utf8')))
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
    throw error
  }
}

/** Atomically publish Host Runtime state after a complete JSON write. */
export async function writeHostRuntimeState(root: string, state: HostRuntimeState): Promise<void> {
  parseHostRuntimeState(state)
  await writeFileAtomic(join(root, HOST_RUNTIME_STATE_FILE), `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600, dirMode: 0o700 })
}

/** Check one runtime directory against its manifest and installed Desktop facts. */
export async function verifyHostRuntimeDirectory(
  directory: string,
  expected: HostRuntimeCompatibility,
  publicKey?: string | Buffer,
  expectedKeyId?: string,
): Promise<HostRuntimeManifest> {
  const manifestValue: unknown = JSON.parse(await readFile(join(directory, HOST_RUNTIME_MANIFEST_FILE), 'utf8'))
  const manifest = publicKey === undefined ? parseHostRuntimeManifest(manifestValue) : verifyHostRuntimeManifest(manifestValue, publicKey)
  if (expectedKeyId !== undefined && manifest.signature.keyId !== expectedKeyId) throw new Error('host runtime: untrusted signing key')
  if (manifest.productVersion !== expected.productVersion || manifest.dshVersion !== expected.dshVersion
    || manifest.hostProtocolVersion !== expected.hostProtocolVersion || manifest.electronVersion !== expected.electronVersion
    || manifest.nodeAbi !== expected.nodeAbi || manifest.libreOfficeKitVersion !== expected.libreOfficeKitVersion
    || manifest.pnpmVersion !== expected.pnpmVersion || manifest.pythonVersion !== expected.pythonVersion
    || manifest.platform !== expected.platform || manifest.arch !== expected.arch) {
    throw new Error('host runtime: compatibility mismatch')
  }
  const payload = join(directory, ...manifest.payload.path.split('/'))
  const payloadStat = await stat(payload)
  if (payloadStat.size !== manifest.payload.bytes) throw new Error('host runtime: payload size mismatch')
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(payload)) digest.update(chunk as Buffer)
  if (digest.digest('hex') !== manifest.payload.sha256) throw new Error('host runtime: payload digest mismatch')
  if (manifest.payload.path !== HOST_RUNTIME_ARCHIVE_PATH) throw new Error('host runtime: invalid archive manifest path')
  await verifyHostRuntimeFiles(directory, payload)
  await access(join(directory, 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'index.js'))
  return manifest
}

/** Select a verified external runtime, or the immutable runtime bundled by Desktop. */
export async function resolveHostRuntime(options: {
  readonly storeRoot: string
  readonly bundledRoot: string
  readonly expected: HostRuntimeCompatibility
  readonly publicKey?: string | Buffer
  readonly keyId?: string
}): Promise<HostRuntimeResolution> {
  // Electron can read files inside ASAR but does not resolve access() on this virtual directory.
  await access(join(options.bundledRoot, DESKTOP_RUNTIME_FILE))
  let state = await readHostRuntimeState(options.storeRoot)
  if (state === undefined) {
    state = { schemaVersion: HOST_RUNTIME_SCHEMA_VERSION,
      active: { version: options.expected.productVersion, path: BUNDLED_HOST_RUNTIME_PATH, verifiedAt: new Date().toISOString() } }
    await writeHostRuntimeState(options.storeRoot, state)
  }
  let ignoredExternal: string | undefined
  if (state.pending?.phase === 'activating') {
    state = rollbackHostRuntime(options.storeRoot, state, { phase: 'interrupted-startup', code: 'HOST_STARTUP_INTERRUPTED' })
    await writeHostRuntimeState(options.storeRoot, state)
  } else if (state.pending?.phase === 'staged') {
    const candidate = state.pending
    try {
      if (options.publicKey === undefined) throw new Error('host runtime: trust key unavailable')
      const candidateRoot = hostRuntimePath(options.storeRoot, candidate.version)
      const manifest = await verifyHostRuntimeDirectory(candidateRoot, options.expected, options.publicKey, options.keyId)
      if (manifest.runtimeVersion !== candidate.version || candidate.path !== manifest.runtimeVersion) {
        throw new Error('host runtime: pending runtime version mismatch')
      }
      const activatingState: HostRuntimeState = { schemaVersion: HOST_RUNTIME_SCHEMA_VERSION,
        active: { version: manifest.runtimeVersion, path: candidate.path, verifiedAt: new Date().toISOString() },
        previous: state.active,
        pending: { ...candidate, phase: 'activating' },
        ...(state.lastFailure === undefined ? {} : { lastFailure: state.lastFailure }) }
      await writeHostRuntimeState(options.storeRoot, activatingState)
      return { selection: { runtimeDir: candidateRoot, source: 'external', version: manifest.runtimeVersion }, state: activatingState }
    } catch (error) {
      ignoredExternal = error instanceof Error ? error.message : String(error)
      const { pending: _pending, ...withoutPending } = state
      const code = options.publicKey === undefined ? 'HOST_RUNTIME_TRUST_KEY_UNAVAILABLE' : 'HOST_RUNTIME_INVALID'
      state = { ...withoutPending, lastFailure: { version: candidate.version, phase: 'verification', code, at: new Date().toISOString() } }
      await writeHostRuntimeState(options.storeRoot, state)
    }
  }
  if (state.active.path === BUNDLED_HOST_RUNTIME_PATH) {
    return { selection: { runtimeDir: options.bundledRoot, source: 'bundled' }, state,
      ...(ignoredExternal === undefined ? {} : { ignoredExternal }) }
  }
  const directory = hostRuntimePath(options.storeRoot, state.active.version)
  try {
    if (options.publicKey === undefined) throw new Error('host runtime: trust key unavailable')
    if (state.active.path !== state.active.version) throw new Error('host runtime: active runtime path mismatch')
    const manifest = await verifyHostRuntimeDirectory(directory, options.expected, options.publicKey, options.keyId)
    if (manifest.runtimeVersion !== state.active.version) throw new Error('host runtime: active runtime version mismatch')
    return { selection: { runtimeDir: directory, source: 'external', version: manifest.runtimeVersion }, state,
      ...(ignoredExternal === undefined ? {} : { ignoredExternal }) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (state.pending?.phase === 'activating' && state.previous !== undefined) {
      state = rollbackHostRuntime(options.storeRoot, state, { phase: 'verification', code: 'HOST_RUNTIME_INVALID' })
      await writeHostRuntimeState(options.storeRoot, state)
      if (state.active.path === BUNDLED_HOST_RUNTIME_PATH) {
        return { selection: { runtimeDir: options.bundledRoot, source: 'bundled' }, state, ignoredExternal: message }
      }
      const restoredRoot = hostRuntimePath(options.storeRoot, state.active.version)
      const restored = await verifyHostRuntimeDirectory(restoredRoot, options.expected, options.publicKey, options.keyId)
      if (restored.runtimeVersion === state.active.version) {
        return { selection: { runtimeDir: restoredRoot, source: 'external', version: restored.runtimeVersion }, state, ignoredExternal: message }
      }
    }
    const fallback = { schemaVersion: HOST_RUNTIME_SCHEMA_VERSION,
      active: { version: options.expected.productVersion, path: BUNDLED_HOST_RUNTIME_PATH, verifiedAt: new Date().toISOString() },
      previous: state.active,
      lastFailure: { version: state.active.version, phase: 'verification', code: 'HOST_RUNTIME_INVALID', at: new Date().toISOString() } }
    await writeHostRuntimeState(options.storeRoot, fallback)
    return { selection: { runtimeDir: options.bundledRoot, source: 'bundled' }, state: fallback, ignoredExternal: message }
  }
}

/** Promote a staged runtime after the new Host and renderer have confirmed readiness. */
export function activateHostRuntime(root: string, state: HostRuntimeState, version: string): HostRuntimeState {
  const path = hostRuntimePath(root, version)
  const pending = state.pending
  if (pending === undefined || pending.version !== version || pending.path !== relative(root, path).split(sep).join('/')) {
    throw new Error('host runtime: no matching pending runtime')
  }
  return {
    schemaVersion: HOST_RUNTIME_SCHEMA_VERSION,
    active: { version, path: pending.path, verifiedAt: new Date().toISOString() },
    previous: state.active,
    pending: { ...pending, phase: 'activating' },
    ...(state.lastFailure === undefined ? {} : { lastFailure: state.lastFailure }),
  }
}

/** Confirm a Runtime only after the Desktop renderer reports a successful workspace boot. */
export function confirmHostRuntime(state: HostRuntimeState, version: string): HostRuntimeState {
  if (state.active.version !== version || state.pending?.phase !== 'activating' || state.pending.version !== version) {
    return state
  }
  const { pending: _pending, ...confirmed } = state
  return confirmed
}

/** Restore the previous runtime after a failed startup and retain the failure evidence. */
export function rollbackHostRuntime(
  root: string,
  state: HostRuntimeState,
  failure: { readonly phase: string; readonly code: string },
  bundledVersion?: string,
): HostRuntimeState {
  const lastFailure = { version: state.active.version, phase: failure.phase, code: failure.code, at: new Date().toISOString() }
  if (state.previous === undefined) {
    if (bundledVersion !== undefined) return { schemaVersion: HOST_RUNTIME_SCHEMA_VERSION,
      active: { version: bundledVersion, path: BUNDLED_HOST_RUNTIME_PATH, verifiedAt: new Date().toISOString() },
      previous: state.active, lastFailure }
    const { pending: _pending, ...withoutPending } = state
    return { ...withoutPending, lastFailure }
  }
  if (state.previous.path !== BUNDLED_HOST_RUNTIME_PATH && state.previous.path !== relative(root, hostRuntimePath(root, state.previous.version)).split(sep).join('/')) {
    throw new Error('host runtime: previous runtime path mismatch')
  }
  return {
    schemaVersion: HOST_RUNTIME_SCHEMA_VERSION,
    active: { ...state.previous, verifiedAt: new Date().toISOString() },
    previous: state.active,
    lastFailure: { version: state.active.version, phase: failure.phase, code: failure.code, at: new Date().toISOString() },
  }
}
